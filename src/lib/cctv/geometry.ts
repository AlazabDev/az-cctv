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

export function cableLengthMeters(cable: CableRun, pxPerMeter: number) {
  let total = 0;
  for (let i = 1; i < cable.points.length; i++) {
    const a = cable.points[i - 1];
    const b = cable.points[i];
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
