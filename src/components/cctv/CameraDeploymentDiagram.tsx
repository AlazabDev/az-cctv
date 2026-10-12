import { cameraDeployment } from "@/lib/cctv/deployment";
import type { CameraSpec, PlacedDevice } from "@/lib/cctv/types";

export function CameraDeploymentDiagram({ device, spec }: { device: PlacedDevice; spec: CameraSpec }) {
  const result = cameraDeployment(device, spec);
  const extent = Math.max(10, Math.min(100, Number.isFinite(result.distance) ? result.distance * 1.3 : 30));
  const x = (meters: number) => 30 + Math.min(extent, meters) / extent * 240;
  const target = x(result.distance);
  return <div className="space-y-2 border-y border-border py-3 text-xs">
    <p className="font-semibold">قطاع رأسي — الهدف على الأرض</p>
    <svg viewBox="0 0 300 150" className="w-full" role="img" aria-label="ارتفاع الكاميرا وميلها والمسافة والمنطقة العمياء">
      <path d={`M30 25 L${x(result.near)} 115 L${x(result.far)} 115 Z`} fill="var(--color-coverage)" fillOpacity="0.25" />
      <path d="M30 25 V115 H280" fill="none" stroke="var(--color-muted-foreground)" strokeWidth="1.5" />
      <path d={`M30 25 L${target} 115`} fill="none" stroke="var(--color-primary)" strokeDasharray="4 3" />
      <path d={`M30 115 H${x(result.near)}`} stroke="var(--color-destructive)" strokeWidth="5" />
      <circle cx="30" cy="25" r="5" fill="var(--color-primary)" />
      <text x="7" y="75" fill="var(--color-foreground)" fontSize="11">{device.heightM.toFixed(1)}m</text>
      <text x="55" y="32" fill="var(--color-foreground)" fontSize="11">{device.tilt.toFixed(1)}°</text>
      <text x="145" y="140" textAnchor="middle" fill="var(--color-foreground)" fontSize="11">{Number.isFinite(result.distance) ? `${result.distance.toFixed(1)} m` : "∞"}</text>
    </svg>
    <dl className="grid grid-cols-2 gap-1"><dt>العمى السفلي</dt><dd dir="ltr">{result.near.toFixed(1)} m</dd><dt>مدى الأرض البعيد</dt><dd dir="ltr">{Number.isFinite(result.far) ? `${result.far.toFixed(1)} m` : "∞"}</dd><dt>جودة الهدف</dt><dd>{Math.round(result.ppm)} PPM · {result.dori?.label ?? "دون الكشف"}</dd></dl>
  </div>;
}