import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * AI CCTV Design Agent
 * =====================
 * Turns an approved floor plan into a reviewable set of proposed camera
 * placements. The model (az-agent-sol) never invents geometry, DORI, or PPM —
 * it can only call `evaluate_placement`, which runs the SAME deterministic
 * math below, and its final answer (`submit_design_proposal`) is re-scored
 * by this server before anything is stored. The model decides WHERE and
 * WHICH camera; this file computes and verifies whether that decision holds up.
 *
 * IMPORTANT — kept in sync by hand with src/lib/cctv/geometry.ts and
 * src/lib/cctv/catalog.ts. Edge Functions run in an isolated Deno bundle and
 * cannot import from the Vite app, so the handful of pure formulas below
 * (ppmAtDistance / distanceForPpm / DORI thresholds) and the camera catalog
 * are duplicated here on purpose. If the client-side catalog or formulas
 * change, mirror the change here too.
 */

const ENDPOINT = (Deno.env.get("AZURE_AGENT_ENDPOINT") ??
  "https://az-ai-resource.services.ai.azure.com/api/projects/az-ai-gateway").replace(/\/$/, "");
const AGENT_NAME = Deno.env.get("AZURE_AGENT_NAME") ?? "az-agent-bim";
const AGENT_VERSION = Deno.env.get("AZURE_AGENT_VERSION") ?? "8";
const MAX_TURNS = 8;
const MAX_EVALUATIONS = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Camera catalog — mirror of src/lib/cctv/catalog.ts::cameraCatalog
// ---------------------------------------------------------------------------
interface CameraSpec {
  id: string;
  label: string;
  model: string;
  type: string;
  hres: number;
  vres: number;
  focal: number;
  hfov: number;
  irRange: number;
  price: number;
  poeWatt: number;
  bitrateMbps: number;
}

const CAMERA_CATALOG: CameraSpec[] = [
  { id: "bullet-2mp-28", label: "بوليت 2 ميجا 2.8مم", model: "DS-2CD1027G2H-LIUF", type: "bullet", hres: 1920, vres: 1080, focal: 2.8, hfov: 102, irRange: 30, price: 320, poeWatt: 7, bitrateMbps: 4 },
  { id: "bullet-4mp-28", label: "بوليت 4 ميجا 2.8مم", model: "DS-2CD2043G2-I", type: "bullet", hres: 2560, vres: 1440, focal: 2.8, hfov: 102, irRange: 40, price: 480, poeWatt: 8, bitrateMbps: 6 },
  { id: "bullet-4mp-4", label: "بوليت 4 ميجا 4مم", model: "DS-2CD2043G2-I 4mm", type: "bullet", hres: 2560, vres: 1440, focal: 4, hfov: 84, irRange: 40, price: 510, poeWatt: 8, bitrateMbps: 6 },
  { id: "turret-4mp-28", label: "تيوريت ColorVu 4 ميجا", model: "DS-2CD2347G2-LU", type: "turret", hres: 2560, vres: 1440, focal: 2.8, hfov: 103, irRange: 30, price: 560, poeWatt: 9, bitrateMbps: 6 },
  { id: "dome-2mp-28", label: "دوم داخلي 2 ميجا", model: "IPC-HDBW2231E-S", type: "dome", hres: 1920, vres: 1080, focal: 2.8, hfov: 106, irRange: 30, price: 290, poeWatt: 7, bitrateMbps: 4 },
  { id: "dome-8mp-28", label: "دوم 8 ميجا (4K)", model: "IPC-HDBW3841E-AS", type: "dome", hres: 3840, vres: 2160, focal: 2.8, hfov: 106, irRange: 30, price: 890, poeWatt: 11, bitrateMbps: 12 },
  { id: "ptz-4mp", label: "PTZ 4 ميجا زوم 25x", model: "DS-2DE4425IW-DE", type: "ptz", hres: 2560, vres: 1440, focal: 4.8, hfov: 60, irRange: 100, price: 3200, poeWatt: 24, bitrateMbps: 10 },
  { id: "fisheye-6mp", label: "فيش آي 6 ميجا 360°", model: "DS-2CD2955FWD-I", type: "fisheye", hres: 3072, vres: 2048, focal: 1.27, hfov: 180, irRange: 15, price: 1450, poeWatt: 10, bitrateMbps: 10 },
];
const cameraById = (id: string) => CAMERA_CATALOG.find((c) => c.id === id);

// Wall material -> opaque, mirror of src/lib/cctv/catalog.ts::wallMaterials.
// Only "opaque" matters for occlusion; everything glass/fence lets sight through.
const WALL_OPAQUE: Record<string, boolean> = {
  "thin-wall": true, "medium-wall": true, "thick-wall": true, brick: true,
  "light-concrete": true, "medium-concrete": true, "heavy-concrete": true,
  "solid-wood": true, "thick-wood": true, gypsum: true,
  "thin-metal": true, "medium-metal": true, "heavy-metal": true,
  glass: false, "double-glass": false, "thick-glass": false, fence: false,
};
const isOpaqueMaterial = (id: string) => WALL_OPAQUE[id] ?? true; // unknown material -> assume solid, safer default

// ---------------------------------------------------------------------------
// Deterministic geometry engine — mirror of src/lib/cctv/geometry.ts
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;

function ppmAtDistance(hfovDeg: number, hres: number, distanceM: number) {
  if (distanceM <= 0) return Infinity;
  const widthM = 2 * distanceM * Math.tan(toRad(hfovDeg) / 2);
  return widthM > 0 ? hres / widthM : Infinity;
}
function distanceForPpm(hfovDeg: number, hres: number, ppm: number) {
  const d = hres / (2 * Math.tan(toRad(hfovDeg) / 2) * ppm);
  return Math.max(0, d);
}
function doriFromPpm(ppm: number): "identify" | "recognize" | "observe" | "detect" | "none" {
  if (ppm >= 250) return "identify";
  if (ppm >= 125) return "recognize";
  if (ppm >= 63) return "observe";
  if (ppm >= 25) return "detect";
  return "none";
}

function orient(a: Pt, b: Pt, c: Pt) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function onSeg(a: Pt, b: Pt, c: Pt) {
  return Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
}
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4), o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  if (o1 === 0 && onSeg(p1, p2, p3)) return true;
  if (o2 === 0 && onSeg(p1, p2, p4)) return true;
  if (o3 === 0 && onSeg(p3, p4, p1)) return true;
  if (o4 === 0 && onSeg(p3, p4, p2)) return true;
  return false;
}

interface WallM {
  segments: [Pt, Pt][];
  opaque: boolean;
}

/** Converts stored wall points (px) to metre-space segment lists. Curved walls
 *  are approximated by their control polyline for occlusion purposes — the
 *  actual rendered spline stays close to it, and this is precise enough to
 *  decide "does this sightline cross the wall", which is all we need here. */
function wallsToMeters(walls: { points: Pt[]; material: string }[], pxPerMeter: number): WallM[] {
  return walls
    .filter((w) => w.points.length >= 2)
    .map((w) => {
      const pts = w.points.map((p) => ({ x: p.x / pxPerMeter, y: p.y / pxPerMeter }));
      const segments: [Pt, Pt][] = [];
      for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1]!, pts[i]!]);
      return { segments, opaque: isOpaqueMaterial(w.material) };
    });
}

function lineBlocked(from: Pt, to: Pt, wallsM: WallM[]) {
  for (const w of wallsM) {
    if (!w.opaque) continue;
    for (const [a, b] of w.segments) {
      if (segmentsIntersect(from, to, a, b)) return true;
    }
  }
  return false;
}

interface ExistingCam {
  xM: number;
  yM: number;
  rotationDeg: number;
  hfov: number;
  hres: number;
}

function inDetectCone(cam: ExistingCam, point: Pt) {
  const dx = point.x - cam.xM, dy = point.y - cam.yM;
  const dist = Math.hypot(dx, dy);
  const maxD = distanceForPpm(cam.hfov, cam.hres, 25);
  if (dist > maxD) return false;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const diff = ((ang - cam.rotationDeg + 540) % 360) - 180;
  return Math.abs(diff) <= cam.hfov / 2;
}

interface SiteContext {
  wallsM: WallM[];
  widthM: number;
  heightM: number;
  existing: ExistingCam[];
}

interface PlacementArgs {
  cameraModelId: string;
  xM: number;
  yM: number;
  rotationDeg: number;
  heightM: number;
  targetDistanceM: number;
}

interface PlacementResult {
  ok: boolean;
  error?: string;
  ppmAtTarget?: number;
  doriAtTarget?: string;
  maxUsefulDistanceM?: number;
  blindSpotPct?: number;
  coveragePct?: number;
  overlapPct?: number;
  withinSiteBounds?: boolean;
  targetLineBlocked?: boolean;
}

/** The one function the model is allowed to trust numbers from — and the one
 *  this server re-runs itself on every submitted camera before storing it. */
function evaluatePlacement(args: PlacementArgs, ctx: SiteContext): PlacementResult {
  const spec = cameraById(args.cameraModelId);
  if (!spec) return { ok: false, error: `Unknown cameraModelId "${args.cameraModelId}". Use an id from list_site_context.cameras.` };
  if (!(args.targetDistanceM > 0)) return { ok: false, error: "targetDistanceM must be > 0" };

  const from: Pt = { x: args.xM, y: args.yM };
  const rot = toRad(args.rotationDeg);
  const target: Pt = { x: from.x + args.targetDistanceM * Math.cos(rot), y: from.y + args.targetDistanceM * Math.sin(rot) };

  const withinSiteBounds = from.x >= 0 && from.x <= ctx.widthM && from.y >= 0 && from.y <= ctx.heightM;
  const targetLineBlocked = lineBlocked(from, target, ctx.wallsM);
  const ppmAtTarget = ppmAtDistance(spec.hfov, spec.hres, args.targetDistanceM);
  const doriAtTarget = doriFromPpm(ppmAtTarget);
  const maxUsefulDistanceM = distanceForPpm(spec.hfov, spec.hres, 25);

  const RAYS = 16;
  const RINGS = [0.25, 0.5, 0.75, 1];
  let considered = 0, blocked = 0, clear = 0, overlap = 0;
  for (let i = 0; i <= RAYS; i++) {
    const angleOffset = -spec.hfov / 2 + (spec.hfov * i) / RAYS;
    const rayRot = toRad(args.rotationDeg + angleOffset);
    for (const frac of RINGS) {
      const r = maxUsefulDistanceM * frac;
      const p: Pt = { x: from.x + r * Math.cos(rayRot), y: from.y + r * Math.sin(rayRot) };
      if (p.x < 0 || p.x > ctx.widthM || p.y < 0 || p.y > ctx.heightM) continue;
      considered++;
      if (lineBlocked(from, p, ctx.wallsM)) {
        blocked++;
        continue;
      }
      clear++;
      if (ctx.existing.some((cam) => inDetectCone(cam, p) && !lineBlocked({ x: cam.xM, y: cam.yM }, p, ctx.wallsM))) {
        overlap++;
      }
    }
  }

  return {
    ok: true,
    ppmAtTarget: Math.round(ppmAtTarget * 10) / 10,
    doriAtTarget,
    maxUsefulDistanceM: Math.round(maxUsefulDistanceM * 100) / 100,
    blindSpotPct: considered ? Math.round((blocked / considered) * 1000) / 10 : 0,
    coveragePct: considered ? Math.round((clear / considered) * 1000) / 10 : 0,
    overlapPct: clear ? Math.round((overlap / clear) * 1000) / 10 : 0,
    withinSiteBounds,
    targetLineBlocked,
  };
}

// ---------------------------------------------------------------------------
// Candidate installation points — corners, wall midpoints, site perimeter,
// and any room label (a label is already a user-named point of interest —
// e.g. "Main Entrance" — so it doubles as a critical-area marker without a
// separate doors/openings data model, which the plan editor doesn't have yet).
// ---------------------------------------------------------------------------
function buildCandidates(plan: StoredPlan) {
  const pxPerMeter = plan.pxPerMeter || 40;
  const toM = (p: Pt) => ({ x: p.x / pxPerMeter, y: p.y / pxPerMeter });
  const points: { xM: number; yM: number; kind: string; hint?: string }[] = [];
  const seen = new Set<string>();
  const push = (p: Pt, kind: string, hint?: string) => {
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ xM: Math.round(toM(p).x * 100) / 100, yM: Math.round(toM(p).y * 100) / 100, kind, hint });
  };
  for (const w of plan.walls ?? []) {
    if (w.points.length < 2) continue;
    push(w.points[0]!, "wall-corner");
    push(w.points[w.points.length - 1]!, "wall-corner");
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1]!, b = w.points[i]!;
      push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "wall-midpoint");
    }
  }
  if (plan.imageWidth && plan.imageHeight) {
    push({ x: 0, y: 0 }, "site-corner");
    push({ x: plan.imageWidth, y: 0 }, "site-corner");
    push({ x: plan.imageWidth, y: plan.imageHeight }, "site-corner");
    push({ x: 0, y: plan.imageHeight }, "site-corner");
  }
  for (const l of plan.roomLabels ?? []) push({ x: l.x, y: l.y }, "labeled-point", l.text);
  return points;
}

interface StoredPlan {
  pxPerMeter: number;
  imageWidth?: number;
  imageHeight?: number;
  walls: { points: Pt[]; material: string }[];
  roomLabels: { x: number; y: number; text: string }[];
  devices: { kind: string; specId: string; x: number; y: number; rotation: number }[];
  planApproved?: boolean;
  ceilingHeightM?: number;
}

// ---------------------------------------------------------------------------
// Foundry Responses API plumbing
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    type: "function",
    name: "evaluate_placement",
    description:
      "احسب أداء موضع كاميرا مقترح فعلياً (لا تخمين): PPM وDORI عند الهدف، أقصى مسافة مفيدة، نسبة المنطقة المحجوبة خلف الجدران، نسبة التغطية الفعالة، ونسبة التداخل مع كاميرات أخرى. استدعِها لكل بديل تريد اختباره قبل اختياره.",
    parameters: {
      type: "object",
      properties: {
        cameraModelId: { type: "string", description: "معرّف موديل من قائمة الكاميرات المرسلة في السياق." },
        xM: { type: "number", description: "إحداثي X بالمتر من نقطة أصل المخطط." },
        yM: { type: "number", description: "إحداثي Y بالمتر." },
        rotationDeg: { type: "number", description: "اتجاه الكاميرا بالدرجات، 0 = يمين المحور X." },
        heightM: { type: "number", description: "ارتفاع التركيب بالمتر." },
        targetDistanceM: { type: "number", description: "المسافة إلى الهدف المطلوب تغطيته بالمتر." },
      },
      required: ["cameraModelId", "xM", "yM", "rotationDeg", "heightM", "targetDistanceM"],
    },
  },
  {
    type: "function",
    name: "submit_design_proposal",
    description:
      "أنهِ المهمة بتقديم التصميم النهائي المقترح. استدعِها مرة واحدة فقط بعد اختبار البدائل عبر evaluate_placement. الخادم سيعيد حساب كل الأرقام بنفسه للتحقق قبل الحفظ.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "ملخص عربي موجز لمنطق التصميم (سطرين كحد أقصى)." },
        cameras: {
          type: "array",
          minItems: 1,
          maxItems: 40,
          items: {
            type: "object",
            properties: {
              cameraModelId: { type: "string" },
              xM: { type: "number" },
              yM: { type: "number" },
              rotationDeg: { type: "number" },
              heightM: { type: "number" },
              tiltDeg: { type: "number" },
              targetDistanceM: { type: "number" },
              reason: { type: "string", description: "سبب اختيار هذا الموضع والموديل، بالعربية، جملة أو جملتين." },
            },
            required: ["cameraModelId", "xM", "yM", "rotationDeg", "heightM", "tiltDeg", "targetDistanceM", "reason"],
          },
        },
      },
      required: ["summary", "cameras"],
    },
  },
];

function buildInstructions(plan: StoredPlan, candidates: ReturnType<typeof buildCandidates>) {
  const widthM = (plan.imageWidth ?? 0) / (plan.pxPerMeter || 40);
  const heightM = (plan.imageHeight ?? 0) / (plan.pxPerMeter || 40);
  const context = {
    site: { widthM: Math.round(widthM * 100) / 100, heightM: Math.round(heightM * 100) / 100, ceilingHeightM: plan.ceilingHeightM ?? 3 },
    walls: (plan.walls ?? []).length,
    candidatePoints: candidates,
    existingCameras: (plan.devices ?? [])
      .filter((d) => d.kind === "camera")
      .map((d) => ({ xM: d.x / plan.pxPerMeter, yM: d.y / plan.pxPerMeter, rotationDeg: d.rotation, specId: d.specId })),
    cameras: CAMERA_CATALOG.map((c) => ({ id: c.id, label: c.label, type: c.type, hfov: c.hfov, megapixelHres: c.hres, irRangeM: c.irRange, priceEGP: c.price, poeWatt: c.poeWatt })),
  };

  return [
    "أنت مهندس تصميم كاميرات مراقبة (CCTV) داخل تطبيق تصميم هندسي.",
    "مهمتك: تحويل المخطط المعتمد إلى تصميم كاميرات قابل للتحقق، بأقل عدد عملي من الكاميرات وأفضل تغطية وتكلفة مناسبة.",
    "قواعد صارمة:",
    "- لا تخمّن أي رقم (مسافة، PPM، DORI، تغطية، تداخل). كل رقم يجب أن يأتي من نتيجة استدعاء evaluate_placement.",
    "- لا تخترع موديلات كاميرات؛ استخدم فقط المعرّفات (id) الموجودة في cameras أدناه.",
    "- رشّح مواضع التركيب من candidatePoints أدناه (أركان الجدران، منتصف الجدران، أركان الموقع، أو نقاط مُسمّاة من المستخدم) ولا تضع كاميرا خارج حدود الموقع.",
    "- اختبر بديلين على الأقل (موديل أو موضع مختلف) قبل اختيار كل كاميرا نهائية، وتجنّب placements بها targetLineBlocked=true أو withinSiteBounds=false.",
    "- انتبه لكاميرات existingCameras ولباقي كاميراتك المقترحة في نفس الجلسة لتقليل overlapPct دون الحاجة لتصفير التغطية.",
    "- لا تكتب أي بيانات في المشروع مباشرة. مخرجك الوحيد هو استدعاء submit_design_proposal مرة واحدة في النهاية.",
    "",
    "سياق الموقع (JSON):",
    JSON.stringify(context),
  ].join("\n");
}

interface FoundryFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

async function callFoundry(apiKey: string, body: Record<string, unknown>) {
  const res = await fetch(`${ENDPOINT}/openai/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  });
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch { /* leave null, surfaced via !res.ok below */ }
  if (!res.ok) {
    throw new Error(`agent_error ${res.status}: ${parsed?.error?.message ?? raw.slice(0, 300)}`);
  }
  return parsed;
}

function extractText(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text) return resp.output_text;
  const parts: string[] = [];
  for (const item of resp?.output ?? []) {
    if (item?.type === "message") {
      for (const c of item.content ?? []) if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("AZURE_API_KEY");
  if (!apiKey) return json({ error: "server_misconfigured", detail: "AZURE_API_KEY secret is not set" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Scoped to the caller: every read here still goes through RLS.
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  // Service-role client: the ONLY path that may write project.data or flip a
  // proposal's status. Every write below is still gated by an explicit
  // ownership check against userId, never by trusting the request body.
  const admin = createClient(supabaseUrl, serviceKey);

  let body: { action?: string; project_id?: string; proposal_id?: string; cameras?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.action === "generate") {
    return handleGenerate(body, userId, userClient, admin, apiKey);
  }
  if (body.action === "apply") {
    return handleApply(body, userId, admin);
  }
  if (body.action === "reject") {
    return handleReject(body, userId, admin);
  }
  return json({ error: "unknown_action" }, 400);
});

async function handleGenerate(
  body: { project_id?: string },
  userId: string,
  userClient: ReturnType<typeof createClient>,
  admin: ReturnType<typeof createClient>,
  apiKey: string,
) {
  const projectId = body.project_id;
  if (!projectId) return json({ error: "project_id_required" }, 400);

  const { data: project, error: projectErr } = await userClient
    .from("cctv_projects")
    .select("id, data")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr || !project) return json({ error: "project_not_found" }, 404);

  const plan = (project.data ?? {}) as StoredPlan;
  if (!plan.planApproved) {
    return json(
      { error: "plan_not_approved", detail: "يجب اعتماد المخطط والمقياس والجدران والارتفاع أولاً قبل تشغيل الوكيل." },
      409,
    );
  }
  if (!plan.imageWidth || !plan.imageHeight || !plan.pxPerMeter) {
    return json({ error: "geometry_incomplete", detail: "المخطط لا يحتوي أبعاداً أو مقياساً صالحاً." }, 409);
  }

  const wallsM = wallsToMeters(plan.walls ?? [], plan.pxPerMeter);
  const widthM = plan.imageWidth / plan.pxPerMeter;
  const heightM = plan.imageHeight / plan.pxPerMeter;
  const existing: ExistingCam[] = (plan.devices ?? [])
    .filter((d) => d.kind === "camera")
    .map((d) => {
      const spec = cameraById(d.specId);
      return { xM: d.x / plan.pxPerMeter, yM: d.y / plan.pxPerMeter, rotationDeg: d.rotation, hfov: spec?.hfov ?? 90, hres: spec?.hres ?? 1920 };
    });
  const ctx: SiteContext = { wallsM, widthM, heightM, existing: [...existing] };
  const candidates = buildCandidates(plan);

  let response = await callFoundry(apiKey, {
    input: buildInstructions(plan, candidates),
    agent: { type: "agent_reference", name: AGENT_NAME, version: AGENT_VERSION },
    tools: TOOLS,
  });

  let evaluationCount = 0;
  let finalCameras: any[] | null = null;
  let summary = "";
  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;
    const calls: FoundryFunctionCall[] = (response.output ?? []).filter((i: any) => i.type === "function_call");
    if (calls.length === 0) {
      // Model stopped without calling submit_design_proposal — nothing usable.
      break;
    }

    const submit = calls.find((c) => c.name === "submit_design_proposal");
    if (submit) {
      let args: any;
      try {
        args = JSON.parse(submit.arguments);
      } catch {
        return json({ error: "invalid_proposal_json" }, 502);
      }
      summary = typeof args.summary === "string" ? args.summary : "";
      finalCameras = Array.isArray(args.cameras) ? args.cameras : [];
      break;
    }

    const outputs = [];
    for (const call of calls) {
      if (call.name !== "evaluate_placement") {
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: false, error: "unknown_tool" }) });
        continue;
      }
      evaluationCount++;
      if (evaluationCount > MAX_EVALUATIONS) {
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ ok: false, error: "evaluation_budget_exceeded — call submit_design_proposal now with your best candidates so far" }),
        });
        continue;
      }
      let args: PlacementArgs;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: false, error: "invalid_arguments_json" }) });
        continue;
      }
      const result = evaluatePlacement(args, ctx);
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }

    response = await callFoundry(apiKey, {
      input: outputs,
      agent: { type: "agent_reference", name: AGENT_NAME, version: AGENT_VERSION },
      tools: TOOLS,
      previous_response_id: response.id,
    });
  }

  if (!finalCameras) {
    return json(
      {
        error: "no_proposal",
        detail: "لم يُنتج الوكيل تصميماً نهائياً خلال الحد المسموح من المحاولات. حاول تقليل مساحة الموقع أو إعادة المحاولة.",
        agentText: extractText(response),
      },
      502,
    );
  }

  // Trust nothing from the model's own numbers — re-run the real engine on
  // every submitted camera and store OUR result, not its.
  const verified = finalCameras
    .map((c: any) => {
      const args: PlacementArgs = {
        cameraModelId: String(c.cameraModelId),
        xM: Number(c.xM),
        yM: Number(c.yM),
        rotationDeg: Number(c.rotationDeg),
        heightM: Number(c.heightM),
        targetDistanceM: Number(c.targetDistanceM),
      };
      const result = evaluatePlacement(args, ctx);
      if (!result.ok) return null;
      return {
        cameraModelId: args.cameraModelId,
        xM: args.xM,
        yM: args.yM,
        rotationDeg: args.rotationDeg,
        heightM: args.heightM,
        tiltDeg: Math.max(0, Math.min(90, Number(c.tiltDeg) || 0)),
        targetDistanceM: args.targetDistanceM,
        ppmAtTarget: result.ppmAtTarget,
        doriAtTarget: result.doriAtTarget,
        maxUsefulDistanceM: result.maxUsefulDistanceM,
        blindSpotPct: result.blindSpotPct,
        coveragePct: result.coveragePct,
        overlapPct: result.overlapPct,
        withinSiteBounds: result.withinSiteBounds,
        targetLineBlocked: result.targetLineBlocked,
        reason: typeof c.reason === "string" ? c.reason.slice(0, 400) : "",
      };
    })
    .filter((c: any): c is NonNullable<typeof c> => c !== null);

  if (verified.length === 0) {
    return json({ error: "proposal_failed_verification", detail: "كل الكاميرات المقترحة فشلت في التحقق الهندسي." }, 502);
  }

  const { data: proposal, error: insertErr } = await admin
    .from("agent_design_proposals")
    .insert({ project_id: projectId, user_id: userId, status: "preview", summary, cameras: verified, iterations: turn })
    .select("*")
    .single();
  if (insertErr || !proposal) return json({ error: "insert_failed", detail: insertErr?.message }, 500);

  return json({ proposal });
}

async function handleApply(
  body: { proposal_id?: string; project_id?: string; cameras?: unknown },
  userId: string,
  admin: ReturnType<typeof createClient>,
) {
  const proposalId = body.proposal_id;
  if (!proposalId) return json({ error: "proposal_id_required" }, 400);

  const { data: proposal, error: propErr } = await admin.from("agent_design_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (propErr || !proposal) return json({ error: "proposal_not_found" }, 404);
  if (proposal.user_id !== userId) return json({ error: "forbidden" }, 403);
  if (proposal.status !== "preview") return json({ error: "already_decided", detail: proposal.status }, 409);

  const { data: project, error: projectErr } = await admin.from("cctv_projects").select("id, data, user_id").eq("id", proposal.project_id).maybeSingle();
  if (projectErr || !project || project.user_id !== userId) return json({ error: "project_not_found" }, 404);

  const plan = (project.data ?? {}) as StoredPlan & { [k: string]: unknown; pxPerMeter: number };
  const pxPerMeter = plan.pxPerMeter || 40;

  // Allow the user to have edited the proposal client-side ("Modify") before
  // applying — but re-verify every camera server-side regardless, so what
  // gets written always reflects the real engine, never an edited-and-unchecked number.
  const wallsM = wallsToMeters((plan as any).walls ?? [], pxPerMeter);
  const widthM = (plan.imageWidth ?? 0) / pxPerMeter;
  const heightM = (plan.imageHeight ?? 0) / pxPerMeter;
  const already: ExistingCam[] = ((plan as any).devices ?? [])
    .filter((d: any) => d.kind === "camera")
    .map((d: any) => {
      const spec = cameraById(d.specId);
      return { xM: d.x / pxPerMeter, yM: d.y / pxPerMeter, rotationDeg: d.rotation, hfov: spec?.hfov ?? 90, hres: spec?.hres ?? 1920 };
    });
  const ctx: SiteContext = { wallsM, widthM, heightM, existing: already };

  const source = Array.isArray(body.cameras) ? body.cameras : proposal.cameras;
  const newDevices = (source as any[])
    .map((c, i) => {
      const spec = cameraById(c.cameraModelId);
      if (!spec) return null;
      const check = evaluatePlacement(
        { cameraModelId: c.cameraModelId, xM: c.xM, yM: c.yM, rotationDeg: c.rotationDeg, heightM: c.heightM, targetDistanceM: c.targetDistanceM },
        ctx,
      );
      if (!check.ok || check.targetLineBlocked || !check.withinSiteBounds) return null;
      return {
        id: `ai-${proposal.id.slice(0, 8)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "camera",
        specId: c.cameraModelId,
        name: `AI Camera ${i + 1}`,
        x: c.xM * pxPerMeter,
        y: c.yM * pxPerMeter,
        rotation: c.rotationDeg,
        heightM: c.heightM,
        tilt: c.tiltDeg ?? 0,
        note: c.reason ?? "",
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (newDevices.length === 0) return json({ error: "nothing_to_apply", detail: "كل الكاميرات فشلت إعادة التحقق قبل الاعتماد." }, 409);

  const nextData = { ...plan, devices: [...(((plan as any).devices) ?? []), ...newDevices] };
  const { error: updateErr } = await admin.from("cctv_projects").update({ data: nextData }).eq("id", project.id);
  if (updateErr) return json({ error: "project_update_failed", detail: updateErr.message }, 500);

  await admin.from("agent_design_proposals").update({ status: "applied", decided_at: new Date().toISOString() }).eq("id", proposalId);

  return json({ applied: newDevices.length, devices: newDevices });
}

async function handleReject(body: { proposal_id?: string }, userId: string, admin: ReturnType<typeof createClient>) {
  const proposalId = body.proposal_id;
  if (!proposalId) return json({ error: "proposal_id_required" }, 400);
  const { data: proposal } = await admin.from("agent_design_proposals").select("id, user_id, status").eq("id", proposalId).maybeSingle();
  if (!proposal || proposal.user_id !== userId) return json({ error: "proposal_not_found" }, 404);
  if (proposal.status !== "preview") return json({ error: "already_decided", detail: proposal.status }, 409);
  await admin.from("agent_design_proposals").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", proposalId);
  return json({ rejected: true });
}
