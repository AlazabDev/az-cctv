import { cableTypes, cameraById, hardwareById } from "./catalog";
import type { CableRun, HardwareSpec, PlacedDevice, PlanData } from "./types";

export const ROUTER_ID = "__router";
export const MAX_UTP_M = 90;
export const DEFAULT_ROUTE_ENDPOINT_TOLERANCE_M = 1;

export type LinkMedia = "utp" | "fiber";
export type LinkLengthMode = "estimated" | "cable";

export interface RouteBinding {
  mode: LinkLengthMode;
  cableRunId?: string | undefined;
  /** Used for estimated links and as an explicit override when needed. */
  cableTypeId?: string | undefined;
}

export interface EngineeringCapabilityOverride {
  ethernetPorts?: number | undefined;
  poePorts?: number | undefined;
  sfpPorts?: number | undefined;
  poeBudget?: number | undefined;
  uplinkMbps?: number | undefined;
  channels?: number | undefined;
  notes?: string | undefined;
}

export interface GatewayEngineeringSpec extends EngineeringCapabilityOverride {
  name?: string | undefined;
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

export interface TopoLayout
  extends Pick<PlanData, "devices" | "cables" | "pxPerMeter" | "layoutName"> {
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
  deviceId?: string | undefined;
  text: string;
}

export interface EffectiveCapabilities {
  ethernetPorts: number;
  poePorts: number;
  sfpPorts: number;
  poeBudget?: number | undefined;
  uplinkMbps?: number | undefined;
  channels?: number | undefined;
  notes?: string | undefined;
}

export interface ResolvedLinkRoute {
  lengthM: number | null;
  source: "measured" | "estimated" | "missing";
  cableRunId?: string | undefined;
  cableTypeId?: string | undefined;
  endpointValid?: boolean | undefined;
  reason?: string | undefined;
}

export function collectNodes(layouts: TopoLayout[]) {
  const nodes = new Map<string, TopoNode>();
  for (const layout of layouts) {
    for (const device of layout.devices) {
      nodes.set(device.id, {
        device,
        layoutId: layout.id,
        layoutName: layout.layoutName,
        pxPerMeter: layout.pxPerMeter || 40,
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
  device: PlacedDevice,
  topology: TopologyData,
): EffectiveCapabilities {
  const spec = hardwareById(device.specId);
  const override = topology.deviceOverrides[device.id] ?? {};

  if (device.kind === "camera" || device.kind === "rack") {
    return {
      ethernetPorts: device.kind === "camera" ? 1 : 0,
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
    spec?.poePorts ?? (device.kind === "switch" ? legacyPorts : 0),
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
  const gateway = topology.gateway;
  return {
    ethernetPorts: finiteNonNegative(gateway.ethernetPorts, 0),
    poePorts: finiteNonNegative(gateway.poePorts, 0),
    sfpPorts: finiteNonNegative(gateway.sfpPorts, 0),
    poeBudget: gateway.poeBudget,
    uplinkMbps: gateway.uplinkMbps,
    channels: gateway.channels,
    notes: gateway.notes,
  };
}

export function portsOf(device: PlacedDevice, topology: TopologyData = emptyTopology) {
  if (device.kind !== "switch" && device.kind !== "nvr") return 0;
  return effectiveCapabilities(device, topology).ethernetPorts;
}

export function poePortsOf(device: PlacedDevice, topology: TopologyData = emptyTopology) {
  if (device.kind !== "switch" && device.kind !== "nvr") return 0;
  return effectiveCapabilities(device, topology).poePorts;
}

export function recorderChannelsOf(device: PlacedDevice, topology: TopologyData = emptyTopology) {
  if (device.kind !== "nvr") return 0;
  return effectiveCapabilities(device, topology).channels ?? 0;
}

export function poeWatt(device: PlacedDevice) {
  if (device.kind !== "camera") return 0;
  return cameraById(device.specId)?.poeWatt ?? 0;
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

export function buildDefaultTopology(layouts: TopoLayout[]): TopologyData {
  const nodes = collectNodes(layouts);
  const cameras = [...nodes.values()].filter((node) => node.device.kind === "camera");
  const switches = [...nodes.values()].filter((node) => node.device.kind === "switch");
  const nvrs = [...nodes.values()].filter((node) => node.device.kind === "nvr");
  const parents: Record<string, string> = {};
  const recorders: Record<string, string> = {};
  const media: Record<string, LinkMedia> = {};
  const routeBindings: Record<string, RouteBinding> = {};
  const switchLoads = new Map<string, number>();

  for (const camera of cameras) {
    const candidates = switches
      .filter((candidate) => candidate.layoutId === camera.layoutId)
      .sort((a, b) => dist(camera, a) - dist(camera, b));
    const parent = candidates.find((candidate) => {
      const used = switchLoads.get(candidate.device.id) ?? 0;
      return used < Math.max(0, portsOf(candidate.device) - 1);
    });
    if (parent) {
      parents[camera.device.id] = parent.device.id;
      switchLoads.set(parent.device.id, (switchLoads.get(parent.device.id) ?? 0) + 1);
      media[camera.device.id] = "utp";
      routeBindings[camera.device.id] = { mode: "estimated", cableTypeId: "cat6-utp" };
    }
    const recorder = nvrs[0];
    if (recorder) recorders[camera.device.id] = recorder.device.id;
  }

  for (const sw of switches) {
    parents[sw.device.id] = ROUTER_ID;
    media[sw.device.id] = "utp";
    routeBindings[sw.device.id] = { mode: "estimated", cableTypeId: "cat6-utp" };
  }
  for (const nvr of nvrs) {
    const nearestSwitch = switches.slice().sort((a, b) => dist(nvr, a) - dist(nvr, b))[0];
    parents[nvr.device.id] = nearestSwitch?.device.id ?? ROUTER_ID;
    media[nvr.device.id] = "utp";
    routeBindings[nvr.device.id] = { mode: "estimated", cableTypeId: "cat6-utp" };
  }

  return { ...emptyTopology, parents, media, routeBindings, recorders };
}

export function validateTopology(
  layouts: TopoLayout[],
  topology: TopologyData,
): TopoIssue[] {
  const nodes = collectNodes(layouts);
  const issues: TopoIssue[] = [];
  const childCounts = new Map<string, number>();
  const poeCounts = new Map<string, number>();
  const poeLoads = new Map<string, number>();
  const sfpLoads = new Map<string, number>();
  const recorderLoads = new Map<string, number>();

  for (const [childId, parentId] of Object.entries(topology.parents)) {
    const child = nodes.get(childId);
    if (!child) {
      issues.push({ level: "error", deviceId: childId, text: `Unknown child device: ${childId}` });
      continue;
    }
    const parent = parentId === ROUTER_ID ? null : nodes.get(parentId)?.device;
    if (parentId !== ROUTER_ID && !parent) {
      issues.push({ level: "error", deviceId: childId, text: `Missing parent: ${parentId}` });
      continue;
    }
    if (!canParent(child.device, parent ?? null, topology)) {
      issues.push({
        level: "error",
        deviceId: childId,
        text: `${child.device.name} cannot connect to ${parent?.name ?? "Router/Core"}`,
      });
    }

    childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
    if (child.device.kind === "camera" && parent) {
      poeCounts.set(parent.id, (poeCounts.get(parent.id) ?? 0) + 1);
      poeLoads.set(parent.id, (poeLoads.get(parent.id) ?? 0) + poeWatt(child.device));
    }
    if ((topology.media[childId] ?? "utp") === "fiber") {
      if (parentId === ROUTER_ID) sfpLoads.set(ROUTER_ID, (sfpLoads.get(ROUTER_ID) ?? 0) + 1);
      else if (parent) sfpLoads.set(parent.id, (sfpLoads.get(parent.id) ?? 0) + 1);
    }
  }

  for (const node of nodes.values()) {
    const device = node.device;
    const caps = effectiveCapabilities(device, topology);
    const used = childCounts.get(device.id) ?? 0;
    if ((device.kind === "switch" || device.kind === "nvr") && used > caps.ethernetPorts) {
      issues.push({
        level: "error",
        deviceId: device.id,
        text: `${device.name}: ${used} Ethernet links exceed ${caps.ethernetPorts} ports`,
      });
    }
    const poeUsed = poeCounts.get(device.id) ?? 0;
    if (poeUsed > caps.poePorts) {
      issues.push({
        level: "error",
        deviceId: device.id,
        text: `${device.name}: ${poeUsed} PoE endpoints exceed ${caps.poePorts} PoE ports`,
      });
    }
    const load = poeLoads.get(device.id) ?? 0;
    if (caps.poeBudget !== undefined && load > caps.poeBudget) {
      issues.push({
        level: "error",
        deviceId: device.id,
        text: `${device.name}: ${load.toFixed(1)}W exceeds ${caps.poeBudget}W PoE budget`,
      });
    }
  }

  for (const [cameraId, nvrId] of Object.entries(topology.recorders)) {
    const camera = nodes.get(cameraId)?.device;
    const nvr = nodes.get(nvrId)?.device;
    if (!camera || camera.kind !== "camera" || !nvr || nvr.kind !== "nvr") {
      issues.push({ level: "error", deviceId: cameraId, text: "Invalid camera/NVR assignment" });
      continue;
    }
    recorderLoads.set(nvrId, (recorderLoads.get(nvrId) ?? 0) + 1);
  }
  for (const [nvrId, count] of recorderLoads) {
    const nvr = nodes.get(nvrId)?.device;
    if (!nvr) continue;
    const channels = recorderChannelsOf(nvr, topology);
    if (channels && count > channels) {
      issues.push({
        level: "error",
        deviceId: nvrId,
        text: `${nvr.name}: ${count} assigned cameras exceed ${channels} recording channels`,
      });
    }
  }

  const gatewaySfp = gatewayCapabilities(topology).sfpPorts;
  const gatewaySfpUsed = sfpLoads.get(ROUTER_ID) ?? 0;
  if (gatewaySfpUsed > gatewaySfp) {
    issues.push({
      level: "error",
      text: `Router/Core: ${gatewaySfpUsed} fiber links exceed ${gatewaySfp} SFP ports`,
    });
  }

  for (const childId of topologyWalk(nodes, topology)) {
    issues.push({ level: "error", deviceId: childId, text: "Network topology contains a loop" });
  }

  for (const node of nodes.values()) {
    if (node.device.kind === "rack") continue;
    if (!topology.parents[node.device.id]) {
      issues.push({ level: "warning", deviceId: node.device.id, text: `${node.device.name} is not connected` });
      continue;
    }
    const route = resolveLinkRoute(node.device.id, topology, nodes, layouts);
    if (route.source === "missing") {
      issues.push({ level: "warning", deviceId: node.device.id, text: route.reason ?? "Link route is missing" });
    }
    if ((topology.media[node.device.id] ?? "utp") === "utp" && route.lengthM !== null && route.lengthM > MAX_UTP_M) {
      issues.push({
        level: "error",
        deviceId: node.device.id,
        text: `${node.device.name}: UTP route ${route.lengthM.toFixed(1)}m exceeds ${MAX_UTP_M}m engineering limit`,
      });
    }
  }

  return issues;
}

function topologyWalk(nodes: Map<string, TopoNode>, topology: TopologyData) {
  const cycles = new Set<string>();
  for (const node of nodes.values()) {
    let current = node.device.id;
    const visited = new Set<string>();
    while (current && current !== ROUTER_ID) {
      if (visited.has(current)) {
        cycles.add(current);
        break;
      }
      visited.add(current);
      current = topology.parents[current] ?? "";
    }
  }
  return cycles;
}

function cableRouteLengthMeters(cable: CableRun, pxPerMeter: number) {
  let pixels = 0;
  for (let index = 1; index < cable.points.length; index += 1) {
    const a = cable.points[index - 1]!;
    const b = cable.points[index]!;
    pixels += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const base = pixels / Math.max(pxPerMeter, 0.0001) + Math.max(0, cable.verticalAllowanceM ?? 0);
  return base * (1 + Math.max(0, cable.slackPercent ?? 15) / 100);
}

function endpointDistanceMeters(point: { x: number; y: number }, node: TopoNode) {
  return Math.hypot(point.x - node.device.x, point.y - node.device.y) / Math.max(node.pxPerMeter, 0.0001);
}

export function resolveLinkRoute(
  childId: string,
  topology: TopologyData,
  nodes: Map<string, TopoNode>,
  layouts: TopoLayout[],
): ResolvedLinkRoute {
  const child = nodes.get(childId);
  const parentId = topology.parents[childId];
  if (!child || !parentId) return { lengthM: null, source: "missing", reason: "Link endpoints are missing" };
  const binding = topology.routeBindings[childId];

  if (binding?.mode === "cable") {
    if (!binding.cableRunId) return { lengthM: null, source: "missing", reason: "Measured route has no cable run" };
    const layout = layouts.find((item) => item.id === child.layoutId);
    const cable = layout?.cables.find((item) => item.id === binding.cableRunId);
    if (!layout || !cable) {
      return { lengthM: null, source: "missing", cableRunId: binding.cableRunId, reason: "Cable run was not found on the child layout" };
    }
    if (cable.points.length < 2) {
      return { lengthM: null, source: "missing", cableRunId: cable.id, cableTypeId: cable.type, reason: "Cable run has fewer than two points" };
    }

    const start = cable.points[0]!;
    const end = cable.points.at(-1)!;
    const childDistance = Math.min(endpointDistanceMeters(start, child), endpointDistanceMeters(end, child));
    let parentDistance = 0;
    if (parentId !== ROUTER_ID) {
      const parent = nodes.get(parentId);
      if (!parent || parent.layoutId !== child.layoutId) {
        return { lengthM: null, source: "missing", cableRunId: cable.id, cableTypeId: cable.type, reason: "Measured cable route cannot bind devices on different layouts" };
      }
      parentDistance = Math.min(endpointDistanceMeters(start, parent), endpointDistanceMeters(end, parent));
    }
    const endpointValid = childDistance <= DEFAULT_ROUTE_ENDPOINT_TOLERANCE_M && parentDistance <= DEFAULT_ROUTE_ENDPOINT_TOLERANCE_M;
    if (!endpointValid) {
      return { lengthM: null, source: "missing", cableRunId: cable.id, cableTypeId: cable.type, endpointValid, reason: "Cable route endpoints do not terminate close enough to linked devices" };
    }
    return { lengthM: cableRouteLengthMeters(cable, layout.pxPerMeter), source: "measured", cableRunId: cable.id, cableTypeId: cable.type, endpointValid };
  }

  if (parentId === ROUTER_ID) {
    return { lengthM: null, source: "missing", cableTypeId: binding?.cableTypeId, reason: "Router/Core link requires a measured route or explicit engineering length" };
  }
  const parent = nodes.get(parentId);
  if (!parent || parent.layoutId !== child.layoutId) {
    return { lengthM: null, source: "missing", cableTypeId: binding?.cableTypeId, reason: "Cross-layout link requires a measured route" };
  }
  return { lengthM: dist(child, parent) * 1.15, source: "estimated", cableTypeId: binding?.cableTypeId };
}

export function cableTypeForRoute(route: ResolvedLinkRoute, medium: LinkMedia) {
  if (route.cableTypeId) {
    const exact = cableTypes.find((item) => item.id === route.cableTypeId);
    if (exact) return exact;
  }
  return medium === "fiber"
    ? cableTypes.find((item) => item.id === "fiber-2")
    : cableTypes.find((item) => item.id === "cat6-utp");
}

function mediaConvertersForEndpoint(device: PlacedDevice | null, topology: TopologyData) {
  return canTerminateFiber(device, topology) ? 0 : 1;
}

export function mediaConvertersForLink(
  child: PlacedDevice,
  parent: PlacedDevice | null,
  medium: LinkMedia,
  topology: TopologyData,
) {
  if (medium !== "fiber") return 0;
  return mediaConvertersForEndpoint(child, topology) + mediaConvertersForEndpoint(parent, topology);
}

export function totalMediaConverters(topology: TopologyData, nodes: Map<string, TopoNode>) {
  let total = 0;
  for (const [childId, parentId] of Object.entries(topology.parents)) {
    const child = nodes.get(childId)?.device;
    if (!child) continue;
    const parent = parentId === ROUTER_ID ? null : nodes.get(parentId)?.device ?? null;
    total += mediaConvertersForLink(child, parent, topology.media[childId] ?? "utp", topology);
  }
  return total;
}

export function summarizeNetworkBoq(layouts: TopoLayout[], topology: TopologyData) {
  const nodes = collectNodes(layouts);
  const cableMeters: Record<string, number> = {};
  for (const node of nodes.values()) {
    if (!topology.parents[node.device.id]) continue;
    const route = resolveLinkRoute(node.device.id, topology, nodes, layouts);
    if (route.lengthM === null) continue;
    const cable = cableTypeForRoute(route, topology.media[node.device.id] ?? "utp");
    if (!cable) continue;
    cableMeters[cable.id] = (cableMeters[cable.id] ?? 0) + route.lengthM;
  }
  return { cableMeters, mediaConverters: totalMediaConverters(topology, nodes) };
}
