import type { CameraSpec, CableRun, PlacedDevice, PlanData } from "./types";
import { distanceForPpm, ppmAtDistance } from "./geometry";

/**
 * Deterministic camera placement engine (greedy set cover).
 * Works in metric local coordinates so it serves both the floor plan and the site map.
 */
export type Pt = { x: number; y: number };
export type Seg = [Pt, Pt];

export type CoverageGoal = "detect" | "observe" | "recognize" | "identify";
export const GOAL_PPM: Record<CoverageGoal, number> = {
  detect: 25,
  observe: 63,
  recognize: 125,
  identify: 250,
};
export const GOAL_LABEL: Record<CoverageGoal, string> = {
  detect: "كشف 25 PPM",
  observe: "ملاحظة 63 PPM",
  recognize: "تعرف 125 PPM",
  identify: "تمييز هوية 250 PPM",
};

export interface DesignInput {
  area: Pt[]; // polygon (metres)
  obstacles: Seg[]; // walls (metres)
  mounts: Pt[]; // candidate mount points (metres)
  heightM: number;
  goal: CoverageGoal;
  specs: CameraSpec[];
  maxCameras: number;
  targetCoverage: number; // 0..1
}

export interface Proposal {
  id: string;
  spec: CameraSpec;
  pos: Pt;
  rotation: number; // deg, 0 = +x, clockwise in screen (y down)
  heightM: number;
  tilt: number;
  targetDistanceM: number;
  blindSpotM: number;
  ppmAtTarget: number;
  gainPct: number;
  reason: string;
}

export interface DesignResult {
  proposals: Proposal[];
  coverage: number;
  samples: number;
}

export function pointInPolygon(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt) {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function centroid(poly: Pt[]): Pt {
  const n = poly.length || 1;
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / n,
    y: poly.reduce((s, p) => s + p.y, 0) / n,
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function runAutoDesign(input: DesignInput): DesignResult {
  const { area, obstacles, heightM, goal } = input;
  const specs = input.specs.filter((s) => s.hfov > 0 && s.hres > 0);
  if (area.length < 3 || specs.length === 0) return { proposals: [], coverage: 0, samples: 0 };

  const xs = area.map((p) => p.x);
  const ys = area.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const areaM2 = (maxX - minX) * (maxY - minY);
  const step = Math.max(0.75, Math.sqrt(areaM2 / 1400));
  const samples: Pt[] = [];
  for (let x = minX + step / 2; x < maxX; x += step)
    for (let y = minY + step / 2; y < maxY; y += step) {
      const p = { x, y };
      if (pointInPolygon(p, area)) samples.push(p);
    }
  if (samples.length === 0) return { proposals: [], coverage: 0, samples: 0 };

  const c = centroid(area);
  const mounts = input.mounts.map((m) => {
    const dx = c.x - m.x;
    const dy = c.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: m.x + (dx / len) * 0.3, y: m.y + (dy / len) * 0.3 };
  });

  // Visibility of each sample from each mount (line of sight against walls).
  const vis: Uint8Array[] = mounts.map((m) => {
    const row = new Uint8Array(samples.length);
    samples.forEach((s, i) => {
      row[i] = obstacles.some(([a, b]) => segmentsCross(m, s, a, b)) ? 0 : 1;
    });
    return row;
  });

  const ppm = GOAL_PPM[goal];
  const covered = new Uint8Array(samples.length);
  let coveredCount = 0;
  const proposals: Proposal[] = [];
  const maxPrice = Math.max(1, ...specs.map((s) => s.price || 0));

  while (proposals.length < input.maxCameras && coveredCount / samples.length < input.targetCoverage) {
    type Cand = { score: number; gain: number[]; mi: number; spec: CameraSpec; rot: number; range: number };
    let best = null as Cand | null;
    mounts.forEach((m, mi) => {
      if (proposals.some((p) => Math.hypot(p.pos.x - m.x, p.pos.y - m.y) < 1)) return;
      for (const spec of specs) {
        const range = Math.min(distanceForPpm(spec, ppm), spec.irRange > 0 ? spec.irRange * 1.2 : Infinity);
        if (range < 1) continue;
        const half = spec.hfov / 2;
        for (let rot = 0; rot < 360; rot += 15) {
          const gain: number[] = [];
          for (let i = 0; i < samples.length; i++) {
            if (covered[i] || !vis[mi]![i]) continue;
            const s = samples[i]!;
            const dx = s.x - m.x;
            const dy = s.y - m.y;
            const d = Math.hypot(dx, dy);
            if (d > range || d < 0.2) continue;
            let diff = ((Math.atan2(dy, dx) * 180) / Math.PI - rot) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            if (Math.abs(diff) <= half) gain.push(i);
          }
          const score = gain.length * (1 - 0.25 * ((spec.price || 0) / maxPrice));
          if (!best || score > best.score) best = { score, gain, mi, spec, rot, range };
        }
      }
    });
    const b = best as Cand | null;
    if (!b || b.gain.length < Math.max(2, samples.length * 0.01)) break;
    b.gain.forEach((i) => (covered[i] = 1));
    coveredCount += b.gain.length;
    const pos = mounts[b.mi]!;
    let far = 0;
    b.gain.forEach((i) => {
      const s = samples[i]!;
      far = Math.max(far, Math.hypot(s.x - pos.x, s.y - pos.y));
    });
    const target = Math.max(1, far * 0.6);
    const tilt = Math.round((Math.atan2(heightM - 1.6, target) * 180) / Math.PI);
    const vfov = (b.spec.hfov * b.spec.vres) / b.spec.hres;
    const lower = ((tilt + vfov / 2) * Math.PI) / 180;
    const blind = lower >= Math.PI / 2 ? 0 : heightM / Math.tan(lower);
    const gainPct = (b.gain.length / samples.length) * 100;
    proposals.push({
      id: uid(),
      spec: b.spec,
      pos,
      rotation: b.rot,
      heightM,
      tilt,
      targetDistanceM: Math.round(target * 10) / 10,
      blindSpotM: Math.round(blind * 10) / 10,
      ppmAtTarget: Math.round(ppmAtDistance(b.spec, target)),
      gainPct: Math.round(gainPct),
      reason: `تضيف ${Math.round(gainPct)}% تغطية جديدة بمستوى ${GOAL_LABEL[goal]} حتى ${b.range.toFixed(1)}م، مع مراعاة الجدران وأقل تكلفة.`,
    });
  }
  return { proposals, coverage: coveredCount / samples.length, samples: samples.length };
}

/* ---------------- Floor plan adapter ---------------- */

export function planDesignInput(
  plan: PlanData,
  goal: CoverageGoal,
  specs: CameraSpec[],
  maxCameras: number,
): DesignInput | null {
  const k = plan.pxPerMeter || 40;
  const wallPts = plan.walls.flatMap((w) => w.points);
  let area: Pt[];
  if (wallPts.length >= 3) {
    const xs = wallPts.map((p) => p.x);
    const ys = wallPts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    area = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  } else if (plan.imageWidth && plan.imageHeight) {
    area = [
      { x: 0, y: 0 },
      { x: plan.imageWidth, y: 0 },
      { x: plan.imageWidth, y: plan.imageHeight },
      { x: 0, y: plan.imageHeight },
    ];
  } else return null;
  const toM = (p: Pt) => ({ x: p.x / k, y: p.y / k });
  const obstacles: Seg[] = plan.walls
    .filter((w) => w.kind !== "fence" && w.material !== "glass")
    .flatMap((w) => w.points.slice(1).map((p, i) => [toM(w.points[i]!), toM(p)] as Seg));
  const segs: Seg[] = [
    ...area.map((a, i) => [toM(a), toM(area[(i + 1) % area.length]!)] as Seg),
    ...obstacles,
  ];
  const mounts = [...area, ...wallPts].map(toM);
  for (const [a, b] of segs) {
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let s = 1; s < n; s++) mounts.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
  }
  // dedupe mounts closer than 0.5 m
  const uniq: Pt[] = [];
  for (const m of mounts) if (!uniq.some((u) => Math.hypot(u.x - m.x, u.y - m.y) < 0.5)) uniq.push(m);
  return {
    area: area.map(toM),
    obstacles,
    mounts: uniq,
    heightM: plan.ceilingHeightM || 3,
    goal,
    specs,
    maxCameras,
    targetCoverage: 0.95,
  };
}

export function proposalsToDevices(proposals: Proposal[], pxPerMeter: number, startIndex: number): PlacedDevice[] {
  return proposals.map((p, i) => ({
    id: p.id,
    kind: "camera",
    specId: p.spec.id,
    ...(p.spec.productId ? { productId: p.spec.productId } : {}),
    name: `Camera ${startIndex + i + 1}`,
    x: p.pos.x * pxPerMeter,
    y: p.pos.y * pxPerMeter,
    rotation: p.rotation,
    heightM: p.heightM,
    tilt: p.tilt,
    note: `AI: ${p.reason}`,
  }));
}

/** Orthogonal cable from the nearest switch/NVR to each new camera. */
export function autoCables(plan: PlanData, cameras: PlacedDevice[], cableType: string) {
  const hubs = plan.devices.filter((d) => d.kind === "switch" || d.kind === "nvr");
  const cables: CableRun[] = [];
  const longRuns: string[] = [];
  if (hubs.length === 0) return { cables, longRuns, noHub: true };
  const k = plan.pxPerMeter || 40;
  for (const cam of cameras) {
    const hub = [...hubs].sort(
      (a, b) => Math.hypot(a.x - cam.x, a.y - cam.y) - Math.hypot(b.x - cam.x, b.y - cam.y),
    )[0]!;
    const points = [
      { x: hub.x, y: hub.y },
      { x: cam.x, y: hub.y },
      { x: cam.x, y: cam.y },
    ];
    const len = (Math.abs(cam.x - hub.x) + Math.abs(cam.y - hub.y)) / k;
    if (len * 1.15 > 90) longRuns.push(cam.name);
    cables.push({ id: Math.random().toString(36).slice(2, 10), type: cableType, points, slackPercent: 15 });
  }
  return { cables, longRuns, noHub: false };
}

/* ---------------- Site map adapter ---------------- */

export function geoToLocal(origin: { lat: number; lng: number }, p: { lat: number; lng: number }): Pt {
  const R = 6371000;
  return {
    x: ((p.lng - origin.lng) * Math.PI * R * Math.cos((origin.lat * Math.PI) / 180)) / 180,
    y: (-(p.lat - origin.lat) * Math.PI * R) / 180,
  };
}
export function localToGeo(origin: { lat: number; lng: number }, p: Pt) {
  const R = 6371000;
  return {
    lat: origin.lat - (p.y * 180) / (Math.PI * R),
    lng: origin.lng + (p.x * 180) / (Math.PI * R * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

export function siteDesignInput(
  boundary: { lat: number; lng: number }[],
  goal: CoverageGoal,
  specs: CameraSpec[],
  maxCameras: number,
  heightM: number,
) {
  const origin = boundary[0]!;
  const area = boundary.map((b) => geoToLocal(origin, b));
  const mounts: Pt[] = [];
  area.forEach((a, i) => {
    const b = area[(i + 1) % area.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.floor(len / 8));
    for (let s = 0; s < n; s++) mounts.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
  });
  const input: DesignInput = { area, obstacles: [], mounts, heightM, goal, specs, maxCameras, targetCoverage: 0.9 };
  return { input, origin };
}

/** Screen-angle (0=east, clockwise, y down) → compass bearing (0=north). */
export function screenToBearing(rot: number) {
  return (((rot + 90) % 360) + 360) % 360;
}
