import type { CameraSpec, CableRun } from "./types";

/** مستويات جودة التعرف بالبيكسل لكل متر */
export const ppmLevels = [
  { id: "identify", label: "تمييز الهوية", ppm: 250, opacity: 0.55 },
  { id: "recognize", label: "التعرف", ppm: 125, opacity: 0.4 },
  { id: "observe", label: "الملاحظة", ppm: 63, opacity: 0.28 },
  { id: "detect", label: "الكشف", ppm: 25, opacity: 0.16 },
] as const;

/** المسافة بالمتر التي تتحقق عندها دقة ppm معينة */
export function distanceForPpm(spec: CameraSpec, ppm: number) {
  const halfFov = (spec.hfov * Math.PI) / 180 / 2;
  const d = spec.hres / (2 * Math.tan(halfFov) * ppm);
  return Math.max(0, d);
}

/** الدقة بالبيكسل لكل متر عند مسافة محددة */
export function ppmAtDistance(spec: CameraSpec, distanceM: number) {
  if (distanceM <= 0) return Infinity;
  const halfFov = (spec.hfov * Math.PI) / 180 / 2;
  const widthM = 2 * distanceM * Math.tan(halfFov);
  return spec.hres / widthM;
}

/** مسار قطاع دائري (مخروط رؤية) بوحدات البكسل */
export function sectorPath(cx: number, cy: number, radius: number, rotationDeg: number, fovDeg: number) {
  if (fovDeg >= 359) {
    return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  }
  const start = ((rotationDeg - fovDeg / 2) * Math.PI) / 180;
  const end = ((rotationDeg + fovDeg / 2) * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const largeArc = fovDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * مسار SVG لخط متعدد النقاط، مستقيم أو منحنٍ.
 * المنحني يمرّ فعلياً بكل النقاط (Catmull-Rom محوّل إلى Bézier تكعيبي)
 * بدل تقريبها، وهو ما يلائم رسم جدار دائري أو ركن مُقوّس على المخطط.
 */
export function wallPath(points: { x: number; y: number }[], curved: boolean) {
  if (points.length === 0) return "";
  if (points.length === 1 || !curved) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }
  const pts = points;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function cableLengthMeters(cable: CableRun, pxPerMeter: number) {
  let total = 0;
  for (let i = 1; i < cable.points.length; i++) {
    const a = cable.points[i - 1]!;
    const b = cable.points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return pxPerMeter > 0 ? total / pxPerMeter : 0;
}

/** طول أي خط متعدد النقاط بالمتر (يُستخدم للجدران أيضاً) */
export function polylineLengthMeters(points: { x: number; y: number }[], pxPerMeter: number) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return pxPerMeter > 0 ? total / pxPerMeter : 0;
}

/** حجم التخزين التقريبي بالتيرابايت */
export function storageTb(totalBitrateMbps: number, days: number) {
  const gbPerDay = (totalBitrateMbps * 86400) / 8 / 1024;
  return (gbPerDay * days) / 1024;
}

export function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString("ar-EG", { maximumFractionDigits: 0 })} ${currency}`;
}
