import { cameraById, hardwareById } from "./catalog";
import type { PlacedDevice, PlanData } from "./types";

export const ROUTER_ID = "__router";
export type LinkMedia = "utp" | "fiber";

export interface TopologyData {
  /** child device id -> parent device id (or ROUTER_ID) */
  parents: Record<string, string>;
  media: Record<string, LinkMedia>;
}

export const emptyTopology: TopologyData = { parents: {}, media: {} };

export interface TopoLayout extends Pick<PlanData, "devices" | "pxPerMeter" | "layoutName"> {
  id: string;
}

export interface TopoNode {
  device: PlacedDevice;
  layoutId: string;
  layoutName: string;
  pxPerMeter: number;
}

export interface TopoIssue {
  level: "error" | "warning";
  deviceId?: string;
  text: string;
}

export const MAX_UTP_M = 90;

export function collectNodes(layouts: TopoLayout[]) {
  const nodes = new Map<string, TopoNode>();
  for (const l of layouts) for (const d of l.devices) nodes.set(d.id, { device: d, layoutId: l.id, layoutName: l.layoutName, pxPerMeter: l.pxPerMeter || 40 });
  return nodes;
}

function dist(a: TopoNode, b: TopoNode) {
  if (a.layoutId !== b.layoutId) return Infinity;
  return Math.hypot(a.device.x - b.device.x, a.device.y - b.device.y) / a.pxPerMeter;
}

/** Estimated cable length (orthogonal route + 15% slack); null when across layouts. */
export function linkLengthM(a: TopoNode, b: TopoNode) {
  if (a.layoutId !== b.layoutId) return null;
  const m = (Math.abs(a.device.x - b.device.x) + Math.abs(a.device.y - b.device.y)) / a.pxPerMeter;
  return m * 1.15;
}

export function portsOf(d: PlacedDevice) {
  const spec = hardwareById(d.specId);
  if (d.kind === "switch") return spec?.ports ?? 8;
  if (d.kind === "nvr") return spec?.channels ?? 8;
  return 0;
}

export function poeWatt(d: PlacedDevice) {
  return d.kind === "camera" ? cameraById(d.specId).poeWatt : 0;
}

/** Valid parent kinds for a child. */
export function canParent(child: PlacedDevice, parent: PlacedDevice | null) {
  if (!parent) return child.kind === "nvr" || child.kind === "switch";
  if (child.id === parent.id) return false;
  if (child.kind === "camera") return parent.kind === "switch" || parent.kind === "nvr";
  if (child.kind === "switch") return parent.kind === "switch" || parent.kind === "nvr";
  if (child.kind === "nvr") return parent.kind === "switch";
  return false;
}

/** Auto-build a sensible tree: cameras → nearest switch with free ports, switches → NVR. */
export function autoTopology(layouts: TopoLayout[]): TopologyData {
  const nodes = collectNodes(layouts);
  const all = [...nodes.values()];
  const switches = all.filter((n) => n.device.kind === "switch");
  const nvrs = all.filter((n) => n.device.kind === "nvr");
  const parents: Record<string, string> = {};
  const media: Record<string, LinkMedia> = {};
  const used = new Map<string, number>();
  const mainNvr = nvrs[0];

  // Reserve one uplink port per switch.
  switches.forEach((s) => used.set(s.device.id, 1));

  for (const cam of all.filter((n) => n.device.kind === "camera")) {
    const candidates = [...switches, ...nvrs]
      .filter((p) => (used.get(p.device.id) ?? 0) < portsOf(p.device))
      .sort((a, b) => {
        const da = dist(cam, a), db = dist(cam, b);
        if (da !== db) return da - db;
        return (a.device.kind === "switch" ? 0 : 1) - (b.device.kind === "switch" ? 0 : 1);
      });
    const p = candidates[0];
    if (!p) continue;
    parents[cam.device.id] = p.device.id;
    media[cam.device.id] = "utp";
    used.set(p.device.id, (used.get(p.device.id) ?? 0) + 1);
  }

  for (const sw of switches) {
    if (mainNvr) {
      parents[sw.device.id] = mainNvr.device.id;
      const len = linkLengthM(sw, mainNvr);
      media[sw.device.id] = len === null || len > MAX_UTP_M ? "fiber" : "utp";
    } else {
      parents[sw.device.id] = ROUTER_ID;
      media[sw.device.id] = "utp";
    }
  }
  for (const nvr of nvrs) {
    parents[nvr.device.id] = ROUTER_ID;
    media[nvr.device.id] = "utp";
  }
  return { parents, media };
}

export function childrenOf(topology: TopologyData, parentId: string, nodes: Map<string, TopoNode>) {
  return [...nodes.values()].filter((n) => topology.parents[n.device.id] === parentId);
}

export function validateTopology(topology: TopologyData, nodes: Map<string, TopoNode>) {
  const issues: TopoIssue[] = [];
  for (const n of nodes.values()) {
    const d = n.device;
    if (d.kind === "rack") continue;
    const pid = topology.parents[d.id];
    if (!pid || (pid !== ROUTER_ID && !nodes.has(pid))) {
      if (d.kind === "camera") issues.push({ level: "error", deviceId: d.id, text: `${d.name}: غير متصلة بأي سويتش أو NVR` });
      else issues.push({ level: "warning", deviceId: d.id, text: `${d.name}: لا يوجد uplink محدد` });
      continue;
    }
    const parent = nodes.get(pid);
    if (parent) {
      const len = linkLengthM(n, parent);
      const media = topology.media[d.id] ?? "utp";
      if (media === "utp" && len === null) issues.push({ level: "error", deviceId: d.id, text: `${d.name} ↔ ${parent.device.name}: ربط بين طوابق مختلفة بكابل UTP — يُنصح بالفايبر` });
      else if (media === "utp" && len !== null && len > MAX_UTP_M) issues.push({ level: "error", deviceId: d.id, text: `${d.name}: طول الكابل ≈ ${len.toFixed(0)}م يتجاوز حد 90م لكابل UTP` });
      if (media === "fiber" && d.kind === "camera") issues.push({ level: "warning", deviceId: d.id, text: `${d.name}: الكاميرا موصولة بفايبر وتحتاج محول ميديا ومصدر طاقة` });
    }
    // Detect loops
    const seen = new Set<string>([d.id]);
    let cur = pid;
    while (cur && cur !== ROUTER_ID) {
      if (seen.has(cur)) { issues.push({ level: "error", deviceId: d.id, text: `${d.name}: حلقة توصيل (Loop) في الشبكة` }); break; }
      seen.add(cur);
      cur = topology.parents[cur] ?? "";
    }
  }

  for (const n of nodes.values()) {
    const d = n.device;
    if (d.kind !== "switch" && d.kind !== "nvr") continue;
    const kids = childrenOf(topology, d.id, nodes);
    const hasUplink = d.kind === "switch" && !!topology.parents[d.id];
    const portsUsed = kids.length + (hasUplink ? 1 : 0);
    const ports = portsOf(d);
    const cams = kids.filter((k) => k.device.kind === "camera");
    if (d.kind === "switch" && portsUsed > ports) issues.push({ level: "error", deviceId: d.id, text: `${d.name}: ${portsUsed} منفذ مستخدم من أصل ${ports} (Overloaded)` });
    if (d.kind === "nvr") {
      const total = countCamerasBelow(topology, d.id, nodes);
      if (total > ports) issues.push({ level: "error", deviceId: d.id, text: `${d.name}: ${total} كاميرا تتجاوز ${ports} قناة` });
      if (cams.length > ports) issues.push({ level: "error", deviceId: d.id, text: `${d.name}: منافذ PoE غير كافية` });
    }
    const budget = hardwareById(d.specId)?.poeBudget;
    const load = cams.reduce((s, c) => s + poeWatt(c.device), 0);
    if (budget && load > budget) issues.push({ level: "error", deviceId: d.id, text: `${d.name}: حمل PoE ${load}W يتجاوز الميزانية ${budget}W` });
    else if (budget && load > budget * 0.8) issues.push({ level: "warning", deviceId: d.id, text: `${d.name}: حمل PoE ${load}W أعلى من 80% من الميزانية` });
  }
  return issues;
}

export function countCamerasBelow(topology: TopologyData, id: string, nodes: Map<string, TopoNode>, depth = 0): number {
  if (depth > 20) return 0;
  return childrenOf(topology, id, nodes).reduce((s, k) => s + (k.device.kind === "camera" ? 1 : countCamerasBelow(topology, k.device.id, nodes, depth + 1)), 0);
}

export function topologyStats(topology: TopologyData, nodes: Map<string, TopoNode>) {
  let utpM = 0, fiberLinks = 0, fiberUnknown = 0;
  for (const n of nodes.values()) {
    const pid = topology.parents[n.device.id];
    const p = pid ? nodes.get(pid) : undefined;
    if (!p) continue;
    const len = linkLengthM(n, p);
    if ((topology.media[n.device.id] ?? "utp") === "fiber") { fiberLinks++; if (len === null) fiberUnknown++; }
    else utpM += len ?? 0;
  }
  return { utpM, fiberLinks, fiberUnknown };
}
