import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ENDPOINT = "https://az-ai-resource.services.ai.azure.com/api/projects/az-ai-gateway";
const recommendationSchema = z.object({
  severity: z.enum(["critical", "warning", "improvement", "info"]),
  title: z.string().min(1).max(160),
  rationale: z.string().min(1).max(1200),
  action: z.string().min(1).max(1200),
  deviceIds: z.array(z.string()).max(20).default([]),
});

const responseSchema = z.object({
  summary: z.string().min(1).max(2000),
  recommendations: z.array(recommendationSchema).max(30),
});

const reviewInputSchema = z.object({
  context: z.object({
    gateway: z.record(z.unknown()),
    devices: z.array(z.record(z.unknown())).max(500),
    edges: z.array(z.record(z.unknown())).max(1000),
    stats: z.record(z.unknown()),
    networkBoqSummary: z.object({
      cableTotals: z.array(z.record(z.unknown())).max(100),
      mediaConverters: z.number().nonnegative(),
    }),
    issues: z.array(z.record(z.unknown())).max(1000),
  }),
});

function extractText(resp: unknown) {
  const r = resp as { output_text?: unknown; output?: unknown[] };
  if (typeof r.output_text === "string" && r.output_text.trim()) return r.output_text.trim();
  const parts: string[] = [];
  for (const item of r.output ?? []) {
    const m = item as { type?: string; content?: unknown[] };
    if (m.type !== "message") continue;
    for (const content of m.content ?? []) {
      const c = content as { text?: unknown };
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonText(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as unknown;
}

export type NetworkReviewResult = z.infer<typeof responseSchema>;

/**
 * Advisory AI only. Deterministic topology validation remains the engineering
 * source of truth; this function never writes project or topology data.
 */
export const reviewNetworkTopology = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => reviewInputSchema.parse(value))
  .handler(async ({ data }) => {
    const apiKey = process.env["AZURE_API_KEY"];
    const agentName =
      process.env["AZURE_NETWORK_AGENT_NAME"] || process.env["AZURE_AGENT_NAME"] || "az-agent-bim";
    const agentVersion =
      process.env["AZURE_NETWORK_AGENT_VERSION"] || process.env["AZURE_AGENT_VERSION"] || "8";
    if (!apiKey) return { error: "خدمة AI Network Review غير مهيأة على الخادم." } as const;

    const systemInstruction = [
      "You are a senior CCTV/IP network design reviewer.",
      "Treat every numeric value in the supplied deterministic context as authoritative.",
      "Do not recalculate or override validation facts. Do not modify the topology.",
      "Review only practical engineering improvements: uplink bottlenecks, port headroom, PoE headroom, NVR channel capacity, copper-vs-fiber choices, SFP/media-converter needs, distribution/core design, resilience and expansion readiness.",
      "Return JSON only with shape: {summary:string,recommendations:[{severity:'critical'|'warning'|'improvement'|'info',title:string,rationale:string,action:string,deviceIds:string[]}]}",
      "Do not invent equipment capabilities that are absent from the context; explicitly say when a specification must be confirmed.",
    ].join("\n");

    const input = `${systemInstruction}\n\nENGINEERING_CONTEXT:\n${JSON.stringify(data.context)}`;

    try {
      const response = await fetch(`${ENDPOINT}/openai/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          input,
          agent: { name: agentName, version: agentVersion, type: "agent_reference" },
        }),
        signal: AbortSignal.timeout(110_000),
      });
      const raw = await response.text();
      if (!response.ok) {
        console.error("network review gateway error", response.status, raw.slice(0, 500));
        return { error: "تعذّر الوصول إلى AI Gateway حالياً." } as const;
      }
      const parsedResponse = JSON.parse(raw) as unknown;
      const text = extractText(parsedResponse);
      if (!text) return { error: "AI Gateway لم يُرجع مراجعة قابلة للقراءة." } as const;

      let json: unknown;
      try {
        json = parseJsonText(text);
      } catch {
        console.error("network review invalid json", text.slice(0, 1000));
        return { error: "رجع AI Gateway استجابة غير منظمة؛ لم يتم تغيير أي بيانات." } as const;
      }
      const result = responseSchema.safeParse(json);
      if (!result.success) {
        console.error("network review schema mismatch", result.error.flatten());
        return {
          error: "مراجعة AI لم تطابق مخطط البيانات المتوقع؛ لم يتم تغيير أي بيانات.",
        } as const;
      }
      return { review: result.data } as const;
    } catch (error) {
      console.error("network review call failed", error);
      return { error: "انتهت مهلة AI Network Review أو حدث خطأ في الاتصال." } as const;
    }
  });
