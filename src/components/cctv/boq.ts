import {
  cableTypes,
  cameraById,
  hardwareById,
  hardwareCatalog,
  networkAccessories,
} from "@/lib/cctv/catalog";
import { cableLengthMeters, storageTb } from "@/lib/cctv/geometry";
import {
  cableTypeForRoute,
  collectNodes,
  resolveLinkRoute,
  totalMediaConverters,
  type TopoLayout,
  type TopologyData,
} from "@/lib/cctv/topology";
import type { PlanData } from "@/lib/cctv/types";

export interface BoqLine {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  /** Canonical commercial source. Missing only for engineering/design-only requirements. */
  productId?: string;
  imageUrl?: string;
  source?: "plan" | "topology-measured" | "topology-estimated" | "topology-accessory";
}

export interface BuildBoqOptions {
  layouts?: TopoLayout[];
  topology?: TopologyData;
}

function addCableMeters(target: Map<string, number>, typeId: string, meters: number) {
  if (!(meters > 0)) return;
  target.set(typeId, (target.get(typeId) ?? 0) + meters);
}

export function buildBoq(plan: PlanData, retentionDays: number, options: BuildBoqOptions = {}) {
  const lines: BoqLine[] = [];
  const cameras = plan.devices.filter((d) => d.kind === "camera");

  const cameraGroups = new Map<string, typeof cameras>();
  for (const camera of cameras) {
    const key = camera.productId ?? camera.specId;
    cameraGroups.set(key, [...(cameraGroups.get(key) ?? []), camera]);
  }

  for (const grouped of cameraGroups.values()) {
    const sample = grouped[0]!;
    const spec = cameraById(sample.specId);
    if (!spec) continue;
    lines.push({
      label: `${spec.label} — ${spec.model}`,
      qty: grouped.length,
      unit: "قطعة",
      unitPrice: spec.price,
      total: grouped.length * spec.price,
      productId: sample.productId ?? spec.productId,
      imageUrl: spec.imageUrl,
      source: "plan",
    });
  }

  const hardwareGroups = new Map<string, typeof plan.devices>();
  for (const device of plan.devices.filter((d) => d.kind !== "camera")) {
    const key = device.productId ?? device.specId;
    hardwareGroups.set(key, [...(hardwareGroups.get(key) ?? []), device]);
  }

  for (const grouped of hardwareGroups.values()) {
    const sample = grouped[0]!;
    const spec = hardwareById(sample.specId);
    if (!spec) continue;
    lines.push({
      label: spec.label,
      qty: grouped.length,
      unit: "قطعة",
      unitPrice: spec.price,
      total: grouped.length * spec.price,
      productId: sample.productId ?? spec.productId,
      imageUrl: spec.imageUrl,
      source: "plan",
    });
  }

  const cableByType = new Map<string, number>();
  const topology = options.topology;
  const layouts = options.layouts ?? [];
  const validMeasuredCableIds = new Set<string>();

  if (topology && layouts.length) {
    const nodes = collectNodes(layouts);
    for (const node of nodes.values()) {
      if (!topology.parents[node.device.id]) continue;
      const route = resolveLinkRoute(node.device.id, topology, nodes, layouts);
      if (route.source === "measured" && route.cableRunId)
        validMeasuredCableIds.add(route.cableRunId);
      if (route.lengthM === null) continue;
      const medium = topology.media[node.device.id] ?? "utp";
      const cable = cableTypeForRoute(route, medium);
      if (!cable) continue;
      addCableMeters(cableByType, cable.id, route.lengthM);
    }

    const converterQty = totalMediaConverters(topology, nodes);
    if (converterQty > 0) {
      const accessory = networkAccessories.find((x) => x.id === "media-converter-gigabit")!;
      lines.push({
        label: accessory.label,
        qty: converterQty,
        unit: accessory.unit,
        unitPrice: accessory.price,
        total: converterQty * accessory.price,
        source: "topology-accessory",
      });
    }
  }

  // Drawn cable routes remain BOQ infrastructure unless a validated measured topology edge consumes them.
  plan.cables.forEach((c) => {
    if (validMeasuredCableIds.has(c.id)) return;
    const base = cableLengthMeters(c, plan.pxPerMeter) + Math.max(0, c.verticalAllowanceM ?? 0);
    const withSlack = base * (1 + Math.max(0, c.slackPercent ?? 15) / 100);
    addCableMeters(cableByType, c.type, withSlack);
  });

  cableByType.forEach((meters, typeId) => {
    const type = cableTypes.find((item) => item.id === typeId);
    if (!type) return;
    const qty = Math.ceil(meters);
    lines.push({
      label: `كابل ${type.label}`,
      qty,
      unit: "متر",
      unitPrice: type.pricePerMeter,
      total: qty * type.pricePerMeter,
      source: topology ? "topology-measured" : "plan",
    });
  });

  const totalBitrate = cameras.reduce(
    (sum, camera) => sum + (cameraById(camera.specId)?.bitrateMbps ?? 0),
    0,
  );
  const neededTb = storageTb(totalBitrate, retentionDays);

  // Storage remains an engineering requirement until an HDD product exists in public.products.
  // Do not invent a commercial product/price outside the canonical product master.

  const grand = lines.reduce((sum, line) => sum + line.total, 0);
  const poeLoad = cameras.reduce(
    (sum, camera) => sum + (cameraById(camera.specId)?.poeWatt ?? 0),
    0,
  );
  return { lines, grand, cameras: cameras.length, totalBitrate, neededTb, poeLoad };
}

export function suggestHardware(cameraCount: number) {
  const nvrs = hardwareCatalog
    .filter((item) => item.kind === "nvr")
    .sort((a, b) => (a.channels ?? 0) - (b.channels ?? 0));
  const switches = hardwareCatalog
    .filter((item) => item.kind === "switch")
    .sort(
      (a, b) => (a.ethernetPorts ?? a.ports ?? 0) - (b.ethernetPorts ?? b.ports ?? 0),
    );
  const nvr = nvrs.find((item) => (item.channels ?? 0) >= cameraCount) ?? nvrs.at(-1);
  const sw = switches.find(
    (item) => (item.ethernetPorts ?? item.ports ?? 0) >= cameraCount + 1,
  );
  return { nvr, sw };
}
