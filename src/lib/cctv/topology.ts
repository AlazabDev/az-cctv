import { cableTypes, cameraById, hardwareById } from "./catalog";
import type { CableRun, HardwareSpec, PlacedDevice, PlanData } from "./types";

export const ROUTER_ID = "__router";
export const MAX_UTP_M = 90;
export const DEFAULT_ROUTE_ENDPOINT_TOLERANCE_M = 1;

export type LinkMedia = "utp" | "fiber";
export type LinkLengthMode = "estimated" | "cable";

export interface RouteBinding {
  mode: LinkLengthMode;
  cableRunId?: string;
  /** Used for estimated links and as an explicit override when needed. */
  cableTypeId?: string;
}

export interface EngineeringCapabilityOverride {
  ethernetPorts?: number;
  poePorts?: number;
  sfpPorts?: number;
  poeBudget?: number;
  uplinkMbps?: number;
  channels?: number;
  notes?: string;
}

export interface GatewayEngineeringSpec extends EngineeringCapabilityOverride {
  name?: string;
}

export interface TopologyData {
  /** Network path: child device id -> parent device id (or ROUTER_ID). */
  parents: Record<string, string>;
  /** Physical medium per child->parent edge. */
  media: Record<string, LinkMedia>;
  /** Optional measured cable route binding or explicit estimated-mode settings. */
  routeBindings: Record<string, RouteBinding>;
  /** Camera -> recorder assignment. Kept separate from the physical network tree. */
  recorders: Record<string, string>;
  /** Project-specific physical-capability overrides for placed hardware. */
  deviceOverrides: Record<string, EngineeringCapabilityOverride>;
  /** Router/core gateway engineering data. */
  gateway: GatewayEngineeringSpec;
}

export const emptyTopology: TopologyData = {
  parents: {},
  media: {},
  routeBindings: {},
  recorders: {},
  deviceOverrides: {},
  gateway: {},
};

export function normalizeTopology(raw?: Partial<TopologyData> | null): TopologyData {
  return {
    parents: raw?.parents ?? {},
    media: raw?.media ?? {},
    routeBindings: raw?.routeBindings ?? {},
    recorders: raw?.recorders ?? {},
    deviceOverrides: raw?.deviceOverrides ?? {},
    gateway: raw?.gateway ?? {},
  };
}

export interface TopoLayout extends Pick<
  PlanData,
  "devices" | "cables" | "pxPerMeter" | "layoutName"
> {
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

export interface EffectiveCapabilities {
  ethernetPorts: number;
  poePorts: number;
  sfpPorts: number;
  poeBudget?: number;
  uplinkMbps?: number;
  channels?: number;
  notes?: string;
}

export interface ResolvedLinkRoute {
  lengthM: number | null;
  source: "measured" | "estimated" | "missing";
  cableRunId?: string;
  cableTypeId?: string;
  endpointValid?: boolean;
  reason?: string;
}

export function collectNodes(layouts: TopoLayout[]) {
  const nodes = new Map<string, TopoNode>();
  for (const l of layouts) {
    for (const d of l.devices) {
      nodes.set(d.id, {
        device: d,
        layoutId: l.id,
        layoutName: l.layoutName,
        pxPerMeter: l.pxPerMeter || 40,
      });
    }
  }
  return nodes;
}

function dist(a: TopoNode, b: TopoNode) {
  if (a.layoutId !== b.layoutId) return Infinity;
  return Math.hypot(a.device.x - b.device.x, a.device.y - b.device.y) / a.pxPerMeter;
}

function finiteNonNegative(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) >= 0 ? Number(value) : fallback;
}

export function effectiveCapabilities(
  d: PlacedDevice,
  topology: TopologyData,
): EffectiveCapabilities {
  const spec = hardwareById(d.specId);
  const override = topology.deviceOverrides[d.id] ?? {};

  if (d.kind === "camera" || d.kind === "rack") {
    return {
      ethernetPorts: d.kind === "camera" ? 1 : 0,
      poePorts: 0,
      sfpPorts: 0,
      notes: override.notes,
    };
  }

  const legacyPorts = spec?.ports ?? 0;
  const ethernetPorts = finiteNonNegative(
    override.ethernetPorts,
    spec?.ethernetPorts ?? legacyPorts,
  );
  const poePorts = finiteNonNegative(
    override.poePorts,
    spec?.poePorts ?? (d.kind === "switch" ? legacyPorts : 0),
  );
  const sfpPorts = finiteNonNegative(override.sfpPorts, spec?.sfpPorts ?? 0);

  return {
    ethernetPorts,
    poePorts,
    sfpPorts,
    poeBudget: override.poeBudget ?? spec?.poeBudget,
    uplinkMbps: override.uplinkMbps ?? spec?.uplinkMbps,
    channels: override.channels ?? spec?.channels,
    notes: override.notes,
  };
}

export function gatewayCapabilities(topology: TopologyData): EffectiveCapabilities {
  const g = topology.gateway;
  return {
    ethernetPorts: finiteNonNegative(g.ethernetPorts, 0),
    poePorts: finiteNonNegative(g.poePorts, 0),
    sfpPorts: finiteNonNegative(g.sfpPorts, 0),
    poeBudget: g.poeBudget,
    uplinkMbps: g.uplinkMbps,
    channels: g.channels,
    notes: g.notes,
  };
}

export function portsOf(d: PlacedDevice, topology: TopologyData = emptyTopology) {
  if (d.kind !== "switch" && d.kind !== "nvr") return 0;
  return effectiveCapabilities(d, topology).ethernetPorts;
}

export function poePortsOf(d: PlacedDevice, topology: TopologyData = emptyTopology) {
  if (d.kind !== "switch" && d.kind !== "nvr") return 0;
  return effectiveCapabilities(d, topology).poePorts;
}

export function recorderChannelsOf(d: PlacedDevice, topology: TopologyData = emptyTopology) {
  if (d.kind !== "nvr") return 0;
  return effectiveCapabilities(d, topology).channels ?? 0;
}

export function poeWatt(d: PlacedDevice) {
  return d.kind === "camera" ? (cameraById(d.specId)?.poeWatt ?? 0) : 0;
}

export function canTerminateFiber(device: PlacedDevice | null, topology: TopologyData) {
  if (!device) return gatewayCapabilities(topology).sfpPorts > 0;
  return effectiveCapabilities(device, topology).sfpPorts > 0;
}

/** Valid parent kinds for a physical Ethernet tree. NVR is an endpoint unless it has dedicated PoE camera ports. */
export function canParent(
  child: PlacedDevice,
  parent: PlacedDevice | null,
  topology: TopologyData = emptyTopology,
) {
  if (!parent) return child.kind === "nvr" || child.kind === "switch";
  if (child.id === parent.id) return false;
  if (child.kind === "camera") {
    if (parent.kind === "switch") return poePortsOf(parent, topology) > 0;
    if (parent.kind === "nvr") return poePortsOf(parent, topology) > 0;
    return false;
  }
  if (child.kind === "switch") return parent.kind === "switch";
  if (child.kind === "nvr") return parent.kind === "switch";
  return false;
}

function findCable(layouts: TopoLayout[], cableRunId: string) {
  for (const layout of layouts) {
    const cable = layout.cables.find((c) => c.id === cableRunId);
    if (cable) return { cable, layout };
  }
  return null;
}

function polylineMeters(points: { x: number; y: number }[], pxPerMeter: number) {
  if (!(pxPerMeter > 0)) return 0;
  let px = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    px += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return px / pxPerMeter;
}

export function measuredCableLengthM(cable: CableRun, pxPerMeter: number) {
  const horizontal = polylineMeters(cable.points, pxPerMeter);
  const vertical = Math.max(0, cable.verticalAllowanceM ?? 0);
  const slack = Math.max(0, cable.slackPercent ?? 0);
  return (horizontal + vertical) * (1 + slack / 100);
}

function endpointDistanceM(point: { x: number; y: number }, node: TopoNode) {
  return Math.hypot(point.x - node.device.x, point.y - node.device.y) / node.pxPerMeter;
}

export function cableEndpointsMatch(
  cable: CableRun,
  cableLayoutId: string,
  child: TopoNode,
  parent: TopoNode | null,
  toleranceM = DEFAULT_ROUTE_ENDPOINT_TOLERANCE_M,
) {
  if (cable.points.length < 2) return false;
  const first = cable.points[0]!;
  const last = cable.points[cable.points.length - 1]!;

  if (!parent) {
    if (cableLayoutId !== child.layoutId) return false;
    return Math.min(endpointDistanceM(first, child), endpointDistanceM(last, child)) <= toleranceM;
  }

  if (child.layoutId === parent.layoutId) {
    if (cableLayoutId !== child.layoutId) return false;
    const a =
      endpointDistanceM(first, child) <= toleranceM &&
      endpointDistanceM(last, parent) <= toleranceM;
    const b =
      endpointDistanceM(last, child) <= toleranceM &&
      endpointDistanceM(first, parent) <= toleranceM;
    return a || b;
  }

  // Cross-layout route can only be considered measured when it carries an explicit vertical/riser allowance.
  if (!(cable.verticalAllowanceM && cable.verticalAllowanceM > 0)) return false;
  if (cableLayoutId === child.layoutId) {
    return Math.min(endpointDistanceM(first, child), endpointDistanceM(last, child)) <= toleranceM;
  }
  if (cableLayoutId === parent.layoutId) {
    return (
      Math.min(endpointDistanceM(first, parent), endpointDistanceM(last, parent)) <= toleranceM
    );
  }
  return false;
}

/** Estimated orthogonal cable length with 15% design allowance; null when coordinates are on different layouts. */
export function linkLengthM(a: TopoNode, b: TopoNode) {
  if (a.layoutId !== b.layoutId) return null;
  const m = (Math.abs(a.device.x - b.device.x) + Math.abs(a.device.y - b.device.y)) / a.pxPerMeter;
  return m * 1.15;
}

export function resolveLinkRoute(
  childId: string,
  topology: TopologyData,
  nodes: Map<string, TopoNode>,
  layouts: TopoLayout[],
): ResolvedLinkRoute {
  const child = nodes.get(childId);
  if (!child) return { lengthM: null, source: "missing", reason: "child device not found" };
  const parentId = topology.parents[childId];
  if (!parentId) return { lengthM: null, source: "missing", reason: "link has no parent" };
  const parent = parentId === ROUTER_ID ? null : (nodes.get(parentId) ?? null);
  const binding = topology.routeBindings[childId] ?? { mode: "estimated" as const };

  if (binding.mode === "cable") {
    if (!binding.cableRunId) {
      return {
        lengthM: null,
        source: "missing",
        cableTypeId: binding.cableTypeId,
        reason: "measured mode has no cable route",
      };
    }
    const found = findCable(layouts, binding.cableRunId);
    if (!found) {
      return {
        lengthM: null,
        source: "missing",
        cableRunId: binding.cableRunId,
        cableTypeId: binding.cableTypeId,
        reason: "bound cable route not found",
      };
    }
    const endpointValid = cableEndpointsMatch(found.cable, found.layout.id, child, parent);
    if (!endpointValid) {
      return {
        lengthM: null,
        source: "missing",
        cableRunId: found.cable.id,
        cableTypeId: found.cable.type,
        endpointValid: false,
        reason: "cable endpoints do not match topology devices",
      };
    }
    return {
      lengthM: measuredCableLengthM(found.cable, found.layout.pxPerMeter || 40),
      source: "measured",
      cableRunId: found.cable.id,
      cableTypeId: found.cable.type,
      endpointValid: true,
    };
  }

  if (!parent) {
    return {
      lengthM: null,
      source: "missing",
      cableTypeId: binding.cableTypeId,
      reason: "router/core has no plan coordinate; bind a measured route to use a real length",
    };
  }
  const estimated = linkLengthM(child, parent);
  if (estimated === null) {
    return {
      lengthM: null,
      source: "missing",
      cableTypeId: binding.cableTypeId,
      reason: "cross-layout link needs a measured/riser route",
    };
  }
  return {
    lengthM: estimated,
    source: "estimated",
    cableTypeId: binding.cableTypeId,
  };
}

/** Auto-build a physical tree and a separate camera->NVR recording map. */
export function autoTopology(
  layouts: TopoLayout[],
  current: TopologyData = emptyTopology,
): TopologyData {
  const base = normalizeTopology(current);
  const nodes = collectNodes(layouts);
  const all = [...nodes.values()];
  const switches = all.filter((n) => n.device.kind === "switch");
  const nvrs = all.filter((n) => n.device.kind === "nvr");
  const parents: Record<string, string> = {};
  const media: Record<string, LinkMedia> = {};
  const routeBindings: Record<string, RouteBinding> = {};
  const recorders: Record<string, string> = {};
  const usedEthernet = new Map<string, number>();
  const usedPoe = new Map<string, number>();

  switches.forEach((s) => {
    usedEthernet.set(s.device.id, 1); // reserve one copper uplink when no SFP is declared
    usedPoe.set(s.device.id, 0);
  });
  nvrs.forEach((n) => {
    usedEthernet.set(n.device.id, 0);
    usedPoe.set(n.device.id, 0);
  });

  for (const cam of all.filter((n) => n.device.kind === "camera")) {
    const candidates = [...switches, ...nvrs]
      .filter((p) => {
        const cap = effectiveCapabilities(p.device, base);
        const poeAvailable = cap.poePorts > (usedPoe.get(p.device.id) ?? 0);
        const ethernetAvailable =
          p.device.kind === "nvr" || cap.ethernetPorts > (usedEthernet.get(p.device.id) ?? 0);
        return poeAvailable && ethernetAvailable;
      })
      .sort((a, b) => {
        const da = dist(cam, a),
          db = dist(cam, b);
        if (da !== db) return da - db;
        return (a.device.kind === "switch" ? 0 : 1) - (b.device.kind === "switch" ? 0 : 1);
      });
    const p = candidates[0];
    if (!p) continue;
    parents[cam.device.id] = p.device.id;
    media[cam.device.id] = "utp";
    routeBindings[cam.device.id] = { mode: "estimated", cableTypeId: "cat6-stp" };
    usedPoe.set(p.device.id, (usedPoe.get(p.device.id) ?? 0) + 1);
    if (p.device.kind === "switch") {
      usedEthernet.set(p.device.id, (usedEthernet.get(p.device.id) ?? 0) + 1);
    }
  }

  for (const sw of switches) {
    parents[sw.device.id] = ROUTER_ID;
    media[sw.device.id] = "utp";
    routeBindings[sw.device.id] = { mode: "estimated", cableTypeId: "cat6-stp" };
  }

  for (const nvr of nvrs) {
    const localSwitch = switches
      .filter(
        (s) =>
          s.layoutId === nvr.layoutId &&
          effectiveCapabilities(s.device, base).ethernetPorts >
            (usedEthernet.get(s.device.id) ?? 0),
      )
      .sort((a, b) => dist(nvr, a) - dist(nvr, b))[0];
    if (localSwitch) {
      parents[nvr.device.id] = localSwitch.device.id;
      media[nvr.device.id] = "utp";
      routeBindings[nvr.device.id] = { mode: "estimated", cableTypeId: "cat6-stp" };
      usedEthernet.set(localSwitch.device.id, (usedEthernet.get(localSwitch.device.id) ?? 0) + 1);
    } else {
      parents[nvr.device.id] = ROUTER_ID;
      media[nvr.device.id] = "utp";
      routeBindings[nvr.device.id] = { mode: "estimated", cableTypeId: "cat6-stp" };
    }
  }

  const recorderUse = new Map<string, number>();
  for (const cam of all.filter((n) => n.device.kind === "camera")) {
    const directParent = nodes.get(parents[cam.device.id] ?? "");
    if (directParent?.device.kind === "nvr") {
      recorders[cam.device.id] = directParent.device.id;
      recorderUse.set(directParent.device.id, (recorderUse.get(directParent.device.id) ?? 0) + 1);
      continue;
    }
    const recorder = nvrs.find(
      (n) => (recorderUse.get(n.device.id) ?? 0) < recorderChannelsOf(n.device, base),
    );
    if (recorder) {
      recorders[cam.device.id] = recorder.device.id;
      recorderUse.set(recorder.device.id, (recorderUse.get(recorder.device.id) ?? 0) + 1);
    }
  }

  return {
    ...base,
    parents,
    media,
    routeBindings,
    recorders,
  };
}

export function childrenOf(topology: TopologyData, parentId: string, nodes: Map<string, TopoNode>) {
  return [...nodes.values()].filter((n) => topology.parents[n.device.id] === parentId);
}

export function camerasForRecorder(
  topology: TopologyData,
  recorderId: string,
  nodes: Map<string, TopoNode>,
) {
  return [...nodes.values()].filter(
    (n) => n.device.kind === "camera" && topology.recorders[n.device.id] === recorderId,
  );
}

function parentHasFiberPort(
  parentId: string,
  nodes: Map<string, TopoNode>,
  topology: TopologyData,
) {
  if (parentId === ROUTER_ID) return gatewayCapabilities(topology).sfpPorts > 0;
  const parent = nodes.get(parentId);
  return parent ? effectiveCapabilities(parent.device, topology).sfpPorts > 0 : false;
}

export function mediaConvertersForLink(
  childId: string,
  topology: TopologyData,
  nodes: Map<string, TopoNode>,
) {
  if ((topology.media[childId] ?? "utp") !== "fiber") return 0;
  const child = nodes.get(childId);
  const parentId = topology.parents[childId];
  if (!child || !parentId) return 0;
  let count = 0;
  if (!canTerminateFiber(child.device, topology)) count += 1;
  if (!parentHasFiberPort(parentId, nodes, topology)) count += 1;
  return count;
}

export function totalMediaConverters(topology: TopologyData, nodes: Map<string, TopoNode>) {
  let total = 0;
  for (const id of nodes.keys()) total += mediaConvertersForLink(id, topology, nodes);
  return total;
}

export function validateTopology(
  topologyInput: TopologyData,
  nodes: Map<string, TopoNode>,
  layouts: TopoLayout[] = [],
) {
  const topology = normalizeTopology(topologyInput);
  const issues: TopoIssue[] = [];

  for (const n of nodes.values()) {
    const d = n.device;
    if (d.kind === "rack") continue;
    const pid = topology.parents[d.id];
    if (!pid || (pid !== ROUTER_ID && !nodes.has(pid))) {
      if (d.kind === "camera")
        issues.push({
          level: "error",
          deviceId: d.id,
          text: `${d.name}: غير متصلة بأي نقطة شبكة صالحة`,
        });
      else
        issues.push({ level: "warning", deviceId: d.id, text: `${d.name}: لا يوجد uplink محدد` });
      continue;
    }

    if (pid !== ROUTER_ID) {
      const parent = nodes.get(pid)!;
      if (!canParent(d, parent.device, topology)) {
        issues.push({
          level: "error",
          deviceId: d.id,
          text: `${d.name}: نوع أو مواصفات ${parent.device.name} لا تسمح بهذا التوصيل`,
        });
      }
    } else if (d.kind === "camera") {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: لا يمكن توصيل كاميرا مباشرة بالراوتر في نموذج PoE الحالي`,
      });
    }

    const route = resolveLinkRoute(d.id, topology, nodes, layouts);
    const medium = topology.media[d.id] ?? "utp";
    const selectedCable = route.cableTypeId
      ? cableTypes.find((c) => c.id === route.cableTypeId)
      : undefined;
    const expectedCategory = medium === "fiber" ? "fiber" : "network";
    if (selectedCable && selectedCable.category !== expectedCategory) {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: نوع الكابل ${selectedCable.label} لا يطابق وسيط الرابط ${medium === "fiber" ? "Fiber" : "UTP/STP"}`,
      });
    }
    if (medium === "fiber" && route.source === "estimated" && !selectedCable) {
      issues.push({
        level: "warning",
        deviceId: d.id,
        text: `${d.name}: نوع/عدد قلوب الفايبر غير محدد؛ لن يُفترض نوع تلقائياً في BOQ`,
      });
    }
    if (topology.routeBindings[d.id]?.mode === "cable" && route.source !== "measured") {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: مسار الكابل المقاس غير صالح (${route.reason ?? "غير معروف"})`,
      });
    }
    if (medium === "utp" && route.lengthM !== null && route.lengthM > MAX_UTP_M) {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: طول UTP ${route.lengthM.toFixed(1)}م يتجاوز حد التصميم 90م`,
      });
    }
    if (medium === "utp" && route.source === "missing" && pid !== ROUTER_ID) {
      issues.push({
        level: "warning",
        deviceId: d.id,
        text: `${d.name}: لا يوجد طول قابل للتحقق للرابط النحاسي`,
      });
    }
    if (medium === "fiber" && d.kind === "camera") {
      issues.push({
        level: "warning",
        deviceId: d.id,
        text: `${d.name}: ربط فايبر مباشر للكاميرا يحتاج إنهاء Fiber/Media Converter وطاقة محلية`,
      });
    }

    const seen = new Set<string>([d.id]);
    let cur = pid;
    while (cur && cur !== ROUTER_ID) {
      if (seen.has(cur)) {
        issues.push({
          level: "error",
          deviceId: d.id,
          text: `${d.name}: حلقة توصيل (Loop) في الشبكة`,
        });
        break;
      }
      seen.add(cur);
      cur = topology.parents[cur] ?? "";
    }
  }

  for (const n of nodes.values()) {
    const d = n.device;
    if (d.kind !== "switch" && d.kind !== "nvr") continue;
    const cap = effectiveCapabilities(d, topology);
    const kids = childrenOf(topology, d.id, nodes);
    const cameras = kids.filter((k) => k.device.kind === "camera");
    const hasCopperUplink = !!topology.parents[d.id] && (topology.media[d.id] ?? "utp") === "utp";
    const networkChildren = kids.filter((k) => k.device.kind !== "camera").length;
    const usedEthernet =
      d.kind === "nvr"
        ? networkChildren + (hasCopperUplink ? 1 : 0)
        : kids.length + (hasCopperUplink ? 1 : 0);

    if (usedEthernet > cap.ethernetPorts) {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: ${usedEthernet} منافذ Ethernet مستخدمة من أصل ${cap.ethernetPorts}`,
      });
    }
    if (cameras.length > cap.poePorts) {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: ${cameras.length} كاميرا PoE مباشرة تتجاوز ${cap.poePorts} منفذ PoE`,
      });
    }

    const load = cameras.reduce((s, c) => s + poeWatt(c.device), 0);
    if (cap.poeBudget !== undefined && load > cap.poeBudget) {
      issues.push({
        level: "error",
        deviceId: d.id,
        text: `${d.name}: حمل PoE ${load}W يتجاوز الميزانية ${cap.poeBudget}W`,
      });
    } else if (cap.poeBudget !== undefined && load > cap.poeBudget * 0.8) {
      issues.push({
        level: "warning",
        deviceId: d.id,
        text: `${d.name}: حمل PoE ${load}W أعلى من 80% من الميزانية ${cap.poeBudget}W`,
      });
    }

    if (d.kind === "nvr") {
      const assigned = camerasForRecorder(topology, d.id, nodes).length;
      const channels = cap.channels ?? 0;
      if (assigned > channels) {
        issues.push({
          level: "error",
          deviceId: d.id,
          text: `${d.name}: ${assigned} كاميرا مسجلة تتجاوز سعة ${channels} قناة`,
        });
      }
    }
  }

  for (const n of nodes.values()) {
    if (n.device.kind !== "camera") continue;
    const recorderId = topology.recorders[n.device.id];
    if (!recorderId) {
      issues.push({
        level: "warning",
        deviceId: n.device.id,
        text: `${n.device.name}: لم يتم تعيين NVR للتسجيل`,
      });
      continue;
    }
    if (nodes.get(recorderId)?.device.kind !== "nvr") {
      issues.push({
        level: "error",
        deviceId: n.device.id,
        text: `${n.device.name}: تعيين NVR غير صالح`,
      });
    }
  }

  return issues;
}

/** Legacy helper kept for UI compatibility. In the new model recorder assignment is separate. */
export function countCamerasBelow(
  topology: TopologyData,
  id: string,
  nodes: Map<string, TopoNode>,
  depth = 0,
): number {
  if (depth > 20) return 0;
  return childrenOf(topology, id, nodes).reduce(
    (s, k) =>
      s +
      (k.device.kind === "camera" ? 1 : countCamerasBelow(topology, k.device.id, nodes, depth + 1)),
    0,
  );
}

export function topologyStats(
  topology: TopologyData,
  nodes: Map<string, TopoNode>,
  layouts: TopoLayout[] = [],
) {
  let utpM = 0;
  let fiberM = 0;
  let fiberLinks = 0;
  let missingLengths = 0;
  let measuredLinks = 0;
  let estimatedLinks = 0;

  for (const n of nodes.values()) {
    if (!topology.parents[n.device.id]) continue;
    const route = resolveLinkRoute(n.device.id, topology, nodes, layouts);
    if (route.source === "measured") measuredLinks += 1;
    if (route.source === "estimated") estimatedLinks += 1;
    if (route.lengthM === null) missingLengths += 1;
    if ((topology.media[n.device.id] ?? "utp") === "fiber") {
      fiberLinks += 1;
      fiberM += route.lengthM ?? 0;
    } else {
      utpM += route.lengthM ?? 0;
    }
  }

  return {
    utpM,
    fiberM,
    fiberLinks,
    missingLengths,
    measuredLinks,
    estimatedLinks,
    mediaConverters: totalMediaConverters(topology, nodes),
  };
}

export function topologyCableRunsUsed(topology: TopologyData) {
  return new Set(
    Object.values(topology.routeBindings)
      .filter((b) => b.mode === "cable" && !!b.cableRunId)
      .map((b) => b.cableRunId!),
  );
}

export function buildNetworkReviewContext(topology: TopologyData, layouts: TopoLayout[]) {
  const nodes = collectNodes(layouts);
  const issues = validateTopology(topology, nodes, layouts);
  const edges = [...nodes.values()]
    .filter((n) => !!topology.parents[n.device.id])
    .map((n) => {
      const parentId = topology.parents[n.device.id]!;
      const parent = parentId === ROUTER_ID ? null : (nodes.get(parentId) ?? null);
      const route = resolveLinkRoute(n.device.id, topology, nodes, layouts);
      return {
        childId: n.device.id,
        child: n.device.name,
        childKind: n.device.kind,
        parentId,
        parent: parent?.device.name ?? topology.gateway.name ?? "Router / Core",
        medium: topology.media[n.device.id] ?? "utp",
        lengthM: route.lengthM,
        lengthSource: route.source,
        cableTypeId: route.cableTypeId ?? null,
        mediaConverters: mediaConvertersForLink(n.device.id, topology, nodes),
      };
    });

  const devices = [...nodes.values()].map((n) => ({
    id: n.device.id,
    name: n.device.name,
    kind: n.device.kind,
    layout: n.layoutName,
    specId: n.device.specId,
    capabilities:
      n.device.kind === "camera"
        ? { poeWatt: poeWatt(n.device) }
        : effectiveCapabilities(n.device, topology),
    recorderId: n.device.kind === "camera" ? (topology.recorders[n.device.id] ?? null) : undefined,
  }));

  const cableTotals = new Map<
    string,
    {
      cableTypeId: string;
      medium: LinkMedia;
      totalLengthM: number;
      measuredLinks: number;
      estimatedLinks: number;
    }
  >();
  for (const edge of edges) {
    if (!(edge.lengthM && edge.lengthM > 0) || !edge.cableTypeId) continue;
    const current = cableTotals.get(edge.cableTypeId) ?? {
      cableTypeId: edge.cableTypeId,
      medium: edge.medium,
      totalLengthM: 0,
      measuredLinks: 0,
      estimatedLinks: 0,
    };
    current.totalLengthM += edge.lengthM;
    if (edge.lengthSource === "measured") current.measuredLinks += 1;
    if (edge.lengthSource === "estimated") current.estimatedLinks += 1;
    cableTotals.set(edge.cableTypeId, current);
  }

  return {
    gateway: { name: topology.gateway.name ?? "Router / Core", ...gatewayCapabilities(topology) },
    devices,
    edges,
    stats: topologyStats(topology, nodes, layouts),
    networkBoqSummary: {
      cableTotals: [...cableTotals.values()].map((x) => ({
        ...x,
        totalLengthM: Math.round(x.totalLengthM * 10) / 10,
      })),
      mediaConverters: totalMediaConverters(topology, nodes),
    },
    issues: issues.map((i) => ({ severity: i.level, deviceId: i.deviceId ?? null, text: i.text })),
  };
}

export function hardwareSpecCapabilities(spec?: HardwareSpec) {
  return {
    ethernetPorts: spec?.ethernetPorts ?? spec?.ports ?? 0,
    poePorts: spec?.poePorts ?? 0,
    sfpPorts: spec?.sfpPorts ?? 0,
    poeBudget: spec?.poeBudget,
    uplinkMbps: spec?.uplinkMbps,
    channels: spec?.channels,
  };
}

export function cableTypeForRoute(route: ResolvedLinkRoute, medium: LinkMedia) {
  if (route.cableTypeId) return cableTypes.find((c) => c.id === route.cableTypeId);
  if (medium === "fiber") return undefined;
  return (
    cableTypes.find((c) => c.id === "cat6-stp") ?? cableTypes.find((c) => c.category === "network")
  );
}
