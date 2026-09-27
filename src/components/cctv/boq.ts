import { cableTypes, cameraById, hardwareById, hardwareCatalog, storageOptions } from "@/lib/cctv/catalog";
import { cableLengthMeters, storageTb } from "@/lib/cctv/geometry";
import type { PlanData } from "@/lib/cctv/types";

export interface BoqLine {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export function buildBoq(plan: PlanData, retentionDays: number) {
  const lines: BoqLine[] = [];
  const cameras = plan.devices.filter((d) => d.kind === "camera");

  const byModel = new Map<string, number>();
  cameras.forEach((c) => byModel.set(c.specId, (byModel.get(c.specId) ?? 0) + 1));
  byModel.forEach((qty, specId) => {
    const spec = cameraById(specId);
    lines.push({
      label: `${spec.label} — ${spec.model}`,
      qty,
      unit: "قطعة",
      unitPrice: spec.price,
      total: qty * spec.price,
    });
  });

  plan.devices
    .filter((d) => d.kind !== "camera")
    .forEach((d) => {
      const spec = hardwareById(d.specId);
      if (!spec) return;
      const existing = lines.find((l) => l.label === spec.label);
      if (existing) {
        existing.qty += 1;
        existing.total = existing.qty * existing.unitPrice;
      } else {
        lines.push({ label: spec.label, qty: 1, unit: "قطعة", unitPrice: spec.price, total: spec.price });
      }
    });

  // كابلات
  const cableByType = new Map<string, number>();
  plan.cables.forEach((c) => {
    const m = cableLengthMeters(c, plan.pxPerMeter);
    cableByType.set(c.type, (cableByType.get(c.type) ?? 0) + m);
  });
  cableByType.forEach((meters, typeId) => {
    const t = cableTypes.find((x) => x.id === typeId) ?? cableTypes[0];
    const withSlack = Math.ceil(meters * 1.15);
    lines.push({
      label: `كابل ${t.label} (شامل 15% فاقد)`,
      qty: withSlack,
      unit: "متر",
      unitPrice: t.pricePerMeter,
      total: withSlack * t.pricePerMeter,
    });
  });

  // تخزين
  const totalBitrate = cameras.reduce((s, c) => s + cameraById(c.specId).bitrateMbps, 0);
  const neededTb = storageTb(totalBitrate, retentionDays);
  let remaining = neededTb;
  const disk = neededTb > 4 ? storageOptions[1] : storageOptions[0];
  const diskQty = Math.max(cameras.length ? 1 : 0, Math.ceil(remaining / disk.tb) || 0);
  remaining = 0;
  if (diskQty > 0) {
    lines.push({
      label: disk.label,
      qty: diskQty,
      unit: "قطعة",
      unitPrice: disk.price,
      total: diskQty * disk.price,
    });
  }

  const grand = lines.reduce((s, l) => s + l.total, 0);
  const poeLoad = cameras.reduce((s, c) => s + cameraById(c.specId).poeWatt, 0);

  return { lines, grand, cameras: cameras.length, totalBitrate, neededTb, poeLoad };
}

export function suggestHardware(cameraCount: number) {
  const nvr = hardwareCatalog.find((h) => h.kind === "nvr" && (h.channels ?? 0) >= cameraCount) ?? hardwareCatalog[2];
  const sw = hardwareCatalog.find((h) => h.kind === "switch" && (h.ports ?? 0) >= cameraCount + 1);
  return { nvr, sw };
}
