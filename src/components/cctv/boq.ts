import { cableTypes, cameraById, hardwareById, hardwareCatalog, networkAccessories, storageOptions } from "@/lib/cctv/catalog";
import { cableLengthMeters, storageTb } from "@/lib/cctv/geometry";
import {
  cableTypeForRoute,
  collectNodes,
  resolveLinkRoute,
  topologyCableRunsUsed,
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

  const byModel = new Map<string, number>();
  cameras.forEach((c) => byModel.set(c.specId, (byModel.get(c.specId) ?? 0) + 1));
  byModel.forEach((qty, specId) => {
    const spec = cameraById(specId);
    if (!spec) return;
    lines.push({ label: `${spec.label} — ${spec.model}`, qty, unit: "قطعة", unitPrice: spec.price, total: qty * spec.price, source: "plan" });
  });

  plan.devices.filter((d) => d.kind !== "camera").forEach((d) => {
    const spec = hardwareById(d.specId);
    if (!spec) return;
    const existing = lines.find((l) => l.label === spec.label);
    if (existing) {
      existing.qty += 1;
      existing.total = existing.qty * existing.unitPrice;
    } else {
      lines.push({ label: spec.label, qty: 1, unit: "قطعة", unitPrice: spec.price, total: spec.price, source: "plan" });
    }
  });

  const cableByType = new Map<string, number>();
  const topology = options.topology;
  const layouts = options.layouts ?? [];
  const boundCableIds = topology ? topologyCableRunsUsed(topology) : new Set<string>();

  // Drawn cable routes not consumed by a topology edge remain valid BOQ infrastructure.
  plan.cables.forEach((c) => {
    if (boundCableIds.has(c.id)) return;
    const base = cableLengthMeters(c, plan.pxPerMeter) + Math.max(0, c.verticalAllowanceM ?? 0);
    const withSlack = base * (1 + Math.max(0, c.slackPercent ?? 15) / 100);
    addCableMeters(cableByType, c.type, withSlack);
  });

  if (topology && layouts.length) {
    const nodes = collectNodes(layouts);
    for (const node of nodes.values()) {
      if (!topology.parents[node.device.id]) continue;
      const route = resolveLinkRoute(node.device.id, topology, nodes, layouts);
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

  cableByType.forEach((meters, typeId) => {
    const t = cableTypes.find((x) => x.id === typeId);
    if (!t) return;
    const qty = Math.ceil(meters);
    lines.push({
      label: `كابل ${t.label}`,
      qty,
      unit: "متر",
      unitPrice: t.pricePerMeter,
      total: qty * t.pricePerMeter,
      source: topology ? "topology-measured" : "plan",
    });
  });

  const totalBitrate = cameras.reduce((s, c) => s + (cameraById(c.specId)?.bitrateMbps ?? 0), 0);
  const neededTb = storageTb(totalBitrate, retentionDays);
  const disk = (neededTb > 4 ? storageOptions[1] : storageOptions[0])!;
  const diskQty = Math.max(cameras.length ? 1 : 0, Math.ceil(neededTb / disk.tb) || 0);
  if (diskQty > 0) {
    lines.push({ label: disk.label, qty: diskQty, unit: "قطعة", unitPrice: disk.price, total: diskQty * disk.price, source: "plan" });
  }

  const grand = lines.reduce((s, l) => s + l.total, 0);
  const poeLoad = cameras.reduce((s, c) => s + (cameraById(c.specId)?.poeWatt ?? 0), 0);
  return { lines, grand, cameras: cameras.length, totalBitrate, neededTb, poeLoad };
}

export function suggestHardware(cameraCount: number) {
  const nvr = hardwareCatalog.find((h) => h.kind === "nvr" && (h.channels ?? 0) >= cameraCount) ?? hardwareCatalog[2]!;
  const sw = hardwareCatalog.find((h) => h.kind === "switch" && (h.ethernetPorts ?? h.ports ?? 0) >= cameraCount + 1);
  return { nvr, sw };
}
