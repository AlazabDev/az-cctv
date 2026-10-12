import { useEffect, useRef, useState } from "react";
import { Bot, Cctv, RotateCcw, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "راجع التغطية الحالية واذكر أي زوايا عمياء محتملة",
  "اقترح مسجل NVR وسويتش مناسبين لعدد الكاميرات الحالي",
  "لخّص جدول الأسعار الحالي في نقاط",
];

export function AgentPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { messages, send, sending, loadingHistory, hasThread, resetThread } =
    useAgentChat(projectId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  function submit() {
    const text = draft;
    setDraft("");
    void send(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Cctv className="h-3.5 w-3.5" />
          </span>
          مساعد التصميم
        </div>
        {hasThread && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-[11px] text-muted-foreground"
            onClick={resetThread}
            title="بدء محادثة جديدة"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            محادثة جديدة
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-3 py-3">
          {loadingHistory ? (
            <p className="py-6 text-center text-xs text-muted-foreground">جارٍ تحميل المحادثة…</p>
          ) : messages.length === 0 ? (
            <EmptyState projectName={projectName} onPick={(s) => void send(s)} />
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} />)
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="اسأل عن التغطية، الأجهزة، أو التسعير…"
            rows={2}
            className="min-h-0 resize-none border-0 p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!draft.trim() || sending}
            onClick={submit}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Enter للإرسال، Shift+Enter لسطر جديد
        </p>
      </div>
    </div>
  );
}

function EmptyState({ projectName, onPick }: { projectName: string; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-5 w-5" />
      </span>
      <p className="text-xs text-muted-foreground">
        يرى المساعد بيانات مشروع «{projectName}» الحالية — عدد الكاميرات والأجهزة والكابلات — منذ
        أول رسالة.
      </p>
      <div className="flex w-full flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-md border border-border px-2.5 py-1.5 text-right text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  message,
}: {
  message: { role: "user" | "assistant"; content: string; pending?: boolean; error?: boolean };
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
          isUser && "bg-primary text-primary-foreground",
          !isUser && !message.error && "bg-muted text-foreground",
          message.error && "bg-destructive/10 text-destructive",
        )}
      >
        {message.pending ? <TypingDots /> : message.content}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
