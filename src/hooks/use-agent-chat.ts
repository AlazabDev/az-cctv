import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AgentMessage = Tables<"agent_messages">;
export type AgentThread = Tables<"agent_threads">;

/**
 * Local, UI-facing view of a message. Assistant replies that are still in
 * flight get an optimistic "pending" row so the panel can render a typing
 * indicator without waiting on realtime.
 */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
  createdAt: string;
};

function toChatMessage(row: AgentMessage): ChatMessage {
  return {
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Drives the az-agent conversation for a single CCTV project.
 *
 * Responsibilities:
 *  - Loads / creates the most recent thread scoped to `projectId`.
 *  - Persists history so switching tabs (or reloading) doesn't lose context.
 *  - Calls the `az-agent` Edge Function, which owns all Foundry credentials —
 *    nothing here ever sees an API key.
 */
export function useAgentChat(projectId: string | undefined) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load (or lazily discover) the thread for this project on mount / project change.
  useEffect(() => {
    if (!projectId) return;
    const currentProjectId: string = projectId;
    let cancelled = false;

    async function load() {
      setLoadingHistory(true);
      const { data: thread } = await supabase
        .from("agent_threads")
        .select("id")
        .eq("project_id", currentProjectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (!thread) {
        setThreadId(null);
        setMessages([]);
        setLoadingHistory(false);
        return;
      }

      const currentThreadId: string = thread.id;
      const { data: history } = await supabase
        .from("agent_messages")
        .select("*")
        .eq("thread_id", currentThreadId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      setThreadId(thread.id);
      setMessages((history ?? []).map(toChatMessage));
      setLoadingHistory(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;

      const optimisticUser: ChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      const pendingAssistant: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: "assistant",
        content: "",
        pending: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser, pendingAssistant]);
      setSending(true);

      const { data, error } = await supabase.functions.invoke<{
        thread_id: string;
        reply: string;
        error?: string;
        detail?: string;
      }>("az-agent", {
        body: { message, thread_id: threadId ?? undefined, project_id: projectId },
      });

      if (!mounted.current) return;
      setSending(false);

      if (error || !data || data.error) {
        const detail =
          (data as { detail?: string } | undefined)?.detail ??
          error?.message ??
          "تعذّر الوصول للوكيل.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingAssistant.id
              ? { ...m, pending: false, error: true, content: detail }
              : m,
          ),
        );
        return;
      }

      setThreadId(data.thread_id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingAssistant.id
            ? { ...m, pending: false, content: data.reply || "لم يُرجع الوكيل رداً." }
            : m,
        ),
      );
    },
    [threadId, projectId, sending],
  );

  const resetThread = useCallback(() => {
    setThreadId(null);
    setMessages([]);
  }, []);

  return { messages, send, sending, loadingHistory, hasThread: threadId !== null, resetThread };
}
