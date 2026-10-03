import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanData, PlacedDevice } from "@/lib/cctv/types";
import { cableTypes, cameraById } from "@/lib/cctv/catalog";
import { distanceForPpm, polylineLengthMeters, ppmLevels, sectorPath, wallPath } from "@/lib/cctv/geometry";
import { Camera, HardDrive, Network, Server } from "lucide-react";

export type CanvasMode = "select" | "camera" | "nvr" | "switch" | "rack" | "cable" | "wall" | "label" | "scale";

interface Props {
  plan: PlanData;
  imageUrl: string | null;
  mode: CanvasMode;
  selectedId: string | null;
  selectedWallId: string | null;
  selectedLabelId: string | null;
  cableDraft: { x: number; y: number }[];
  cableDraftType: string;
  wallDraft: { x: number; y: number }[];
  wallCurved: boolean;
  scaleDraft: { x: number; y: number }[];
  onSelect: (id: string | null) => void;
  onSelectWall: (id: string | null) => void;
  onSelectLabel: (id: string | null) => void;
  onCanvasPoint: (p: { x: number; y: number }) => void;
  onMoveDevice: (id: string, p: { x: number; y: number }) => void;
  onMoveLabel: (id: string, p: { x: number; y: number }) => void;
  onFinishCable: () => void;
  onFinishWall: () => void;
}

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;

function DeviceGlyph({ kind }: { kind: PlacedDevice["kind"] }) {
  const cls = "h-3.5 w-3.5";
  if (kind === "camera") return <Camera className={cls} />;
  if (kind === "nvr") return <Server className={cls} />;
  if (kind === "switch") return <Network className={cls} />;
  return <HardDrive className={cls} />;
}

function polylineMidpoint(points: { x: number; y: number }[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const segments = points.slice(1).map((point, index) => {
    const start = points[index]!;
    return { start, end: point, length: Math.hypot(point.x - start.x, point.y - start.y) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length > 0 ? remaining / segment.length : 0;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return points.at(-1)!;
}

export function PlanCanvas({
  plan,
  imageUrl,
  mode,
  selectedId,
  selectedWallId,
  selectedLabelId,
  cableDraft,
  cableDraftType,
  wallDraft,
  wallCurved,
  scaleDraft,
  onSelect,
  onSelectWall,
  onSelectLabel,
  onCanvasPoint,
  onMoveDevice,
  onMoveLabel,
  onFinishCable,
  onFinishWall,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const dragRef = useRef<{ id: string; kind: "device" | "label" } | null>(null);
  const stateRef = useRef({ zoom, offset });
  stateRef.current = { zoom, offset };

  const toPlan = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { zoom: z, offset: o } = stateRef.current;
    return { x: (clientX - rect.left - o.x) / z, y: (clientY - rect.top - o.y) / z };
  }, []);

  const wheelHandler = useRef<(e: WheelEvent) => void>(() => {});
  wheelHandler.current = (e: WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { zoom: z, offset: o } = stateRef.current;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * Math.exp(-dy * 0.0015)));
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = next / z;
    setOffset({ x: px - (px - o.x) * k, y: py - (py - o.y) * k });
    setZoom(next);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelHandler.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "wall") onFinishWall();
      else onFinishCable();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onFinishCable, onFinishWall]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (mode === "select" && e.target === e.currentTarget) || e.shiftKey) {
      panRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = toPlan(e.clientX, e.clientY);
    setHoverPoint(p);
    if (panRef.current) {
      setOffset({
        x: panRef.current.ox + (e.clientX - panRef.current.startX),
        y: panRef.current.oy + (e.clientY - panRef.current.startY),
      });
      return;
    }
    if (dragRef.current?.kind === "device") onMoveDevice(dragRef.current.id, p);
    if (dragRef.current?.kind === "label") onMoveLabel(dragRef.current.id, p);
  };

  const endPointer = () => {
    panRef.current = null;
    dragRef.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (mode === "select") {
      if (e.target === e.currentTarget) {
        onSelect(null);
        onSelectWall(null);
        onSelectLabel(null);
      }
      return;
    }
    onCanvasPoint(toPlan(e.clientX, e.clientY));
  };

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const w = plan.imageWidth ?? 1200;
    const h = plan.imageHeight ?? 900;
    const z = Math.min(el.clientWidth / w, el.clientHeight / h) * 0.9;
    setZoom(z);
    setOffset({ x: (el.clientWidth - w * z) / 2, y: (el.clientHeight - h * z) / 2 });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.imageWidth, plan.imageHeight, imageUrl]);

  const pxPerMeter = plan.pxPerMeter || 40;
  const wallStrokePx = (thicknessCm?: number) => Math.max(1.5, ((thicknessCm ?? 10) / 100) * pxPerMeter);

  return (
    <div className="relative h-full w-full overflow-hidden grid-bg" ref={containerRef}>
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ cursor: mode === "select" ? "default" : "crosshair", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        onClick={handleClick}
        onDoubleClick={() => {
          if (mode === "cable") onFinishCable();
          if (mode === "wall") onFinishWall();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (mode === "wall") onFinishWall();
          else onFinishCable();
        }}
      >
        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`} style={{ pointerEvents: "none" }}>
          {imageUrl ? (
            <image
              href={imageUrl}
              x={0}
              y={0}
              width={plan.imageWidth ?? undefined}
              height={plan.imageHeight ?? undefined}
            />
          ) : (
            <rect x={0} y={0} width={1200} height={800} fill="oklch(0.25 0.02 258)" rx={8} />
          )}

          {plan.showCoverage &&
            plan.devices
              .filter((d) => d.kind === "camera")
              .map((d) => {
                const spec = cameraById(d.specId);
                if (!spec) return null;
                return (
                  <g key={`cov-${d.id}`}>
                    {ppmLevels.map((lvl) => {
                      const r = distanceForPpm(spec, lvl.ppm) * pxPerMeter;
                      if (r < 1) return null;
                      return (
                        <path
                          key={lvl.id}
                          d={sectorPath(d.x, d.y, r, d.rotation, spec.hfov)}
                          fill="var(--color-coverage)"
                          fillOpacity={lvl.opacity * 0.55}
                          stroke="none"
                        />
                      );
                    })}
                  </g>
                );
              })}

          {plan.walls.map((w) => (
            <path
              key={`wall-bg-${w.id}`}
              d={wallPath(w.points, w.curved)}
              fill="none"
              stroke="var(--color-foreground)"
              strokeOpacity={0.9}
              strokeWidth={wallStrokePx(w.thicknessCm)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {plan.cables.map((c) => {
            const cable = cableTypes.find((item) => item.id === c.type);
            const isFiber = cable?.category === "fiber";
            return (
              <polyline
                key={c.id}
                points={c.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={cable?.color ?? "var(--color-cable)"}
                strokeDasharray={isFiber ? `${8 / zoom} ${4 / zoom}` : undefined}
                strokeWidth={(isFiber ? 3 : 2) / zoom}
                strokeLinejoin="round"
              />
            );
          })}

          {cableDraft.length > 0 && (
            <polyline
              points={[...cableDraft, hoverPoint ?? cableDraft[cableDraft.length - 1]!]
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke={cableTypes.find((item) => item.id === cableDraftType)?.color ?? "var(--color-cable)"}
              strokeDasharray={`${6 / zoom} ${4 / zoom}`}
              strokeWidth={2 / zoom}
            />
          )}

          {wallDraft.length > 0 && (
            <path
              d={wallPath([...wallDraft, hoverPoint ?? wallDraft[wallDraft.length - 1]!], wallCurved)}
              fill="none"
              stroke="var(--color-warning)"
              strokeDasharray={`${6 / zoom} ${4 / zoom}`}
              strokeWidth={wallStrokePx(10)}
              strokeLinecap="round"
            />
          )}

          {scaleDraft.length > 0 && (
            <polyline
              points={[...scaleDraft, hoverPoint ?? scaleDraft[0]!].map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2 / zoom}
            />
          )}
        </g>

        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {plan.walls.map((w) => {
            const selected = w.id === selectedWallId;
            const strokeWidth = wallStrokePx(w.thicknessCm);
            const midpoint = polylineMidpoint(w.points);
            const lengthM = polylineLengthMeters(w.points, pxPerMeter);
            const thicknessCm = w.thicknessCm ?? 10;
            return (
              <g key={`wall-${w.id}`}>
                <path
                  d={wallPath(w.points, w.curved)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(strokeWidth, 16 / zoom)}
                  style={{ cursor: mode === "select" ? "pointer" : "default", pointerEvents: mode === "select" ? "stroke" : "none" }}
                  onPointerDown={(e) => {
                    if (mode !== "select") return;
                    e.stopPropagation();
                    onSelectWall(w.id);
                    onSelect(null);
                  }}
                />
                {selected && (
                  <>
                    <path
                      d={wallPath(w.points, w.curved)}
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth={strokeWidth + 4 / zoom}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ pointerEvents: "none" }}
                    />
                    <g transform={`translate(${midpoint.x} ${midpoint.y}) scale(${1 / zoom})`} style={{ pointerEvents: "none" }}>
                      <rect x={-55} y={-34} width={110} height={24} rx={6} fill="var(--color-background)" stroke="var(--color-primary)" strokeWidth={1.5} />
                      <text y={-18} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-foreground)">
                        {lengthM.toFixed(2)} m · {thicknessCm} cm
                      </text>
                    </g>
                  </>
                )}
              </g>
            );
          })}

          {plan.devices.map((d) => {
            const selected = d.id === selectedId;
            const s = 1 / zoom;
            return (
              <g
                key={d.id}
                transform={`translate(${d.x} ${d.y}) scale(${s})`}
                style={{ cursor: "move" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(d.id);
                  dragRef.current = { id: d.id, kind: "device" };
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {d.kind === "camera" && (
                  <line
                    x1={0}
                    y1={0}
                    x2={Math.cos((d.rotation * Math.PI) / 180) * 26}
                    y2={Math.sin((d.rotation * Math.PI) / 180) * 26}
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                  />
                )}
                <circle
                  r={11}
                  fill={d.kind === "camera" ? "var(--color-primary)" : "var(--color-accent)"}
                  stroke={selected ? "var(--color-foreground)" : "var(--color-background)"}
                  strokeWidth={selected ? 3 : 1.5}
                />
                <foreignObject x={-7} y={-7} width={14} height={14} style={{ pointerEvents: "none" }}>
                  <div className="flex h-3.5 w-3.5 items-center justify-center text-background">
                    <DeviceGlyph kind={d.kind} />
                  </div>
                </foreignObject>
                <text
                  y={24}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-foreground)"
                  style={{ pointerEvents: "none", paintOrder: "stroke" }}
                  stroke="var(--color-background)"
                  strokeWidth={3}
                >
                  {d.name}
                </text>
              </g>
            );
          })}

          {plan.roomLabels.map((label) => {
            const selected = label.id === selectedLabelId;
            const scale = 1 / zoom;
            return (
              <g
                key={label.id}
                transform={`translate(${label.x} ${label.y}) scale(${scale})`}
                style={{ cursor: "move" }}
                onPointerDown={(e) => {
                  if (mode !== "select") return;
                  e.stopPropagation();
                  onSelectLabel(label.id);
                  onSelect(null);
                  onSelectWall(null);
                  dragRef.current = { id: label.id, kind: "label" };
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {selected && (
                  <rect
                    x={-(label.text.length * label.fontSize * 0.34) - 8}
                    y={-label.fontSize}
                    width={label.text.length * label.fontSize * 0.68 + 16}
                    height={label.fontSize + 12}
                    rx={4}
                    fill="var(--color-primary)"
                    fillOpacity={0.14}
                    stroke="var(--color-primary)"
                    strokeWidth={1.5}
                  />
                )}
                <text
                  textAnchor="middle"
                  fontSize={label.fontSize}
                  fontWeight={700}
                  fill="var(--color-foreground)"
                  stroke="var(--color-background)"
                  strokeWidth={3}
                  style={{ paintOrder: "stroke" }}
                >
                  {label.text}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="no-print pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-surface/90 px-3 py-1.5 text-xs text-muted-foreground">
        <span>التكبير {(zoom * 100).toFixed(0)}%</span>
        <span>•</span>
        <span>{pxPerMeter.toFixed(1)} بكسل/متر</span>
      </div>
      <button
        onClick={fit}
        className="no-print absolute bottom-3 right-3 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
      >
        ملاءمة الشاشة
      </button>
    </div>
  );
}
