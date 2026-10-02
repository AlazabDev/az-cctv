import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ENDPOINT = "https://az-ai-resource.services.ai.azure.com/api/projects/az-ai-gateway";
const AGENT_NAME = "az-agent-bim";
const AGENT_VERSION = "8";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function extractText(resp: Json): string {
  if (typeof resp.output_text === "string" && resp.output_text) return resp.output_text;
  const parts: string[] = [];
  for (const item of (resp.output as Json[] | undefined) ?? []) {
    if (item?.type === "message") {
      for (const c of (item.content as Json[] | undefined) ?? []) {
        if (typeof c?.text === "string") parts.push(c.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export const sendAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        threadId: z.string().uuid().optional(),
        message: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env["AZURE_API_KEY"];
    if (!apiKey) return { error: "المساعد غير مهيأ على الخادم بعد." };

    const { data: project } = await supabase
      .from("cctv_projects")
      .select("id, name, data")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) return { error: "المشروع غير موجود." };

    let threadId = data.threadId ?? null;
    let previous: string | null = null;
    if (threadId) {
      const { data: t } = await supabase
        .from("agent_threads")
        .select("id, project_id, last_response_id")
        .eq("id", threadId)
        .maybeSingle();
      if (!t || t.project_id !== project.id) return { error: "المحادثة غير موجودة." };
      previous = t.last_response_id;
    } else {
      const { data: t, error } = await supabase
        .from("agent_threads")
        .insert({ user_id: userId, project_id: project.id, title: data.message.slice(0, 60) })
        .select("id")
        .single();
      if (error || !t) {
        console.error("thread create failed", error?.message);
        return { error: "تعذّر بدء محادثة جديدة." };
      }
      threadId = t.id;
    }

    const plan = (project.data ?? {}) as Json;
    const devices = (Array.isArray(plan.devices) ? plan.devices : []) as Json[];
    const summary = {
      projectName: project.name,
      pxPerMeter: plan.pxPerMeter,
      cameras: devices
        .filter((d) => d.kind === "camera")
        .map((d) => ({ name: d.name, specId: d.specId, heightM: d.heightM, rotation: d.rotation })),
      otherDevices: devices.filter((d) => d.kind !== "camera").map((d) => ({ kind: d.kind, specId: d.specId })),
      cableRuns: Array.isArray(plan.cables) ? plan.cables.length : 0,
      walls: Array.isArray(plan.walls) ? plan.walls.length : 0,
    };
    const input = previous
      ? data.message
      : `سياق المشروع الحالي (JSON):\n${JSON.stringify(summary)}\n\nسؤال المستخدم:\n${data.message}`;

    await supabase
      .from("agent_messages")
      .insert({ thread_id: threadId!, user_id: userId, role: "user", content: data.message });

    let reply = "";
    let responseId: string | null = null;
    try {
      const res = await fetch(`${ENDPOINT}/openai/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          input,
          ...(previous ? { previous_response_id: previous } : {}),
          agent: { name: AGENT_NAME, version: AGENT_VERSION, type: "agent_reference" },
        }),
        signal: AbortSignal.timeout(110_000),
      });
      const raw = await res.text();
      if (!res.ok) {
        console.error("foundry error", res.status, raw.slice(0, 300));
        return { error: "تعذّر الوصول للوكيل حالياً، حاول مرة أخرى.", threadId };
      }
      const parsed = JSON.parse(raw) as Json;
      reply = extractText(parsed) || "لم يُرجع الوكيل رداً.";
      responseId = typeof parsed.id === "string" ? parsed.id : null;
    } catch (e) {
      console.error("foundry call failed", e);
      return { error: "انتهت مهلة الوكيل، حاول مرة أخرى.", threadId };
    }

    const { error: msgErr } = await supabase.from("agent_messages").insert({
      thread_id: threadId!,
      user_id: userId,
      role: "assistant",
      content: reply,
      agent_name: AGENT_NAME,
      agent_version: AGENT_VERSION,
      response_id: responseId,
    });
    if (msgErr) console.error("save assistant message failed", msgErr.message);
    await supabase
      .from("agent_threads")
      .update({ last_response_id: responseId, updated_at: new Date().toISOString() })
      .eq("id", threadId!);

    return { threadId, reply };
  });
