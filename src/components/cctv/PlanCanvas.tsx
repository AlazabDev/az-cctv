import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanData, PlacedDevice, WallKind, WallSegment } from "@/lib/cctv/types";
import { cableTypes, cameraById } from "@/lib/cctv/catalog";
import {
  distanceForPpm,
  polylineLengthMeters,
  ppmLevels,
  sectorPath,
  wallPath,
} from "@/lib/cctv/geometry";
import {
  deleteVertex,
  insertVertex,
  nearestSegment,
  samePoint,
  snapWallPoint,
  type PlanPoint,
} from "@/lib/cctv/wall-editor";
import { Camera, HardDrive, Network, Server, Trash2 } from "lucide-react";

export type CanvasMode =
  "select" | "camera" | "nvr" | "switch" | "rack" | "cable" | "wall" | "label" | "scale";

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
const DEFAULT_WALL_COLOR = "#334155";
const DEFAULT_FENCE_COLOR = "#15803d";
const WALL_COMMIT_SENTINEL = "__wall_geometry_commit__";
const SNAP_SCREEN_PX = 12;

type Point = PlanPoint;
type DragState =
  | { id: string; kind: "device" | "label" }
  | { id: string; kind: "wall"; start: Point; originalPoints: Point[] }
  | { id: string; kind: "wall-vertex"; vertexIndex: number; originalPoints: Point[] };

function DeviceGlyph({ kind }: { kind: PlacedDevice["kind"] }) {
  const cls = "h-3.5 w-3.5";
  if (kind === "camera") return <Camera className={cls} />;
  if (kind === "nvr") return <Server className={cls} />;
  if (kind === "switch") return <Network className={cls} />;
  return <HardDrive className={cls} />;
}

function polylineMidpoint(points: Point[]) {
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

function wallKind(wall: WallSegment): WallKind {
  return wall.kind === "fence" || wall.material === "fence" ? "fence" : "wall";
}

function wallColor(wall: WallSegment) {
  return wall.color || (wallKind(wall) === "fence" ? DEFAULT_FENCE_COLOR : DEFAULT_WALL_COLOR);
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
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
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [draftWallKind, setDraftWallKind] = useState<WallKind>("wall");
  const [draftWallColor, setDraftWallColor] = useState(DEFAULT_WALL_COLOR);
  const [orthogonalPreview, setOrthogonalPreview] = useState(false);
  const panRef = useRef<{
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingNewWallStyleRef = useRef<{ kind: WallKind; color: string } | null>(null);
  const stateRef = useRef({ zoom, offset });
  stateRef.current = { zoom, offset };

  const selectedWall = plan.walls.find((wall) => wall.id === selectedWallId) ?? null;
  const snapThreshold = SNAP_SCREEN_PX / Math.max(zoom, MIN_ZOOM);

  const allWallPoints = useMemo(
    () => plan.walls.flatMap((wall) => wall.points.map((point) => ({ ...point }))),
    [plan.walls],
  );

  const toPlan = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { zoom: z, offset: o } = stateRef.current;
    return { x: (clientX - rect.left - o.x) / z, y: (clientY - rect.top - o.y) / z };
  }, []);

  const forcePlanCommit = useCallback(() => {
    // The editor callback creates a fresh PlanData snapshot and therefore
    // persists wall mutations through the existing autosave path.
    onMoveLabel(WALL_COMMIT_SENTINEL, { x: 0, y: 0 });
  }, [onMoveLabel]);

  const patchWall = useCallback(
    (id: string, patch: Partial<WallSegment>) => {
      const wall = plan.walls.find((item) => item.id === id);
      if (!wall) return;
      Object.assign(wall, patch);
      forcePlanCommit();
    },
    [forcePlanCommit, plan.walls],
  );

  const finishWallWithStyle = useCallback(() => {
    if (wallDraft.length >= 2) {
      pendingNewWallStyleRef.current = { kind: draftWallKind, color: draftWallColor };
    }
    onFinishWall();
  }, [draftWallColor, draftWallKind, onFinishWall, wallDraft.length]);

  useEffect(() => {
    const pending = pendingNewWallStyleRef.current;
    if (!pending || !selectedWallId) return;
    const wall = plan.walls.find((item) => item.id === selectedWallId);
    if (!wall) return;
    wall.kind = pending.kind;
    wall.material = pending.kind === "fence" ? "fence" : "medium-wall";
    wall.color = pending.color;
    pendingNewWallStyleRef.current = null;
    forcePlanCommit();
  }, [forcePlanCommit, plan.walls, selectedWallId]);

  useEffect(() => {
    setSelectedVertexIndex(null);
  }, [selectedWallId]);

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
      if (isTypingTarget(e.target)) return;

      if (
        e.key === "Delete" &&
        selectedWall &&
        selectedVertexIndex !== null &&
        selectedWall.points.length > 2
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        selectedWall.points = deleteVertex(selectedWall.points, selectedVertexIndex);
        setSelectedVertexIndex(null);
        forcePlanCommit();
        return;
      }

      if (e.key !== "Escape") return;
      setSelectedVertexIndex(null);
      if (mode === "wall") finishWallWithStyle();
      else onFinishCable();
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    finishWallWithStyle,
    forcePlanCommit,
    mode,
    onFinishCable,
    selectedVertexIndex,
    selectedWall,
  ]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (mode === "select" && e.target === e.currentTarget) || e.shiftKey) {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const snapVertex = (raw: Point, wall: WallSegment, vertexIndex: number, orthogonal: boolean) => {
    const candidates = plan.walls.flatMap((candidateWall) =>
      candidateWall.points
        .map((point, index) => ({ point, index }))
        .filter(({ index }) => candidateWall.id !== wall.id || index !== vertexIndex)
        .map(({ point }) => point),
    );
    const anchor = wall.points[vertexIndex - 1] ?? wall.points[vertexIndex + 1];
    return snapWallPoint({
      point: raw,
      anchor,
      candidates,
      thresholdPlanUnits: snapThreshold,
      orthogonal,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const raw = toPlan(e.clientX, e.clientY);
    setHoverPoint(raw);
    setOrthogonalPreview(e.shiftKey);

    if (panRef.current) {
      setOffset({
        x: panRef.current.ox + (e.clientX - panRef.current.startX),
        y: panRef.current.oy + (e.clientY - panRef.current.startY),
      });
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "device") {
      onMoveDevice(drag.id, raw);
      return;
    }
    if (drag.kind === "label") {
      onMoveLabel(drag.id, raw);
      return;
    }

    const wall = plan.walls.find((item) => item.id === drag.id);
    if (!wall) return;

    if (drag.kind === "wall") {
      const dx = raw.x - drag.start.x;
      const dy = raw.y - drag.start.y;
      wall.points = drag.originalPoints.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      }));
      forcePlanCommit();
      return;
    }

    const snapped = snapVertex(raw, wall, drag.vertexIndex, e.shiftKey);
    const previous = drag.originalPoints[drag.vertexIndex - 1];
    const next = drag.originalPoints[drag.vertexIndex + 1];
    if ((previous && samePoint(previous, snapped)) || (next && samePoint(next, snapped))) return;

    wall.points = drag.originalPoints.map((point, index) =>
      index === drag.vertexIndex ? snapped : { ...point },
    );
    forcePlanCommit();
  };

  const endPointer = () => {
    panRef.current = null;
    dragRef.current = null;
  };

  const snappedDraftPoint = useMemo(() => {
    if (mode !== "wall" || !hoverPoint || wallDraft.length === 0) return hoverPoint;
    const anchor = wallDraft.at(-1);
    return snapWallPoint({
      point: hoverPoint,
      anchor,
      candidates: allWallPoints,
      thresholdPlanUnits: snapThreshold,
      orthogonal: orthogonalPreview,
    });
  }, [allWallPoints, hoverPoint, mode, orthogonalPreview, snapThreshold, wallDraft]);

  const handleClick = (e: React.MouseEvent) => {
    if (mode === "select") {
      if (e.target === e.currentTarget) {
        onSelect(null);
        onSelectWall(null);
        onSelectLabel(null);
        setSelectedVertexIndex(null);
      }
      return;
    }

    const raw = toPlan(e.clientX, e.clientY);
    if (mode === "wall") {
      const anchor = wallDraft.at(-1);
      const point = snapWallPoint({
        point: raw,
        anchor,
        candidates: allWallPoints,
        thresholdPlanUnits: snapThreshold,
        orthogonal: e.shiftKey,
      });
      if (anchor && samePoint(anchor, point)) return;
      onCanvasPoint(point);
      return;
    }

    onCanvasPoint(raw);
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
  const wallStrokePx = (thicknessCm?: number) =>
    Math.max(1.5, ((thicknessCm ?? 10) / 100) * pxPerMeter);
  const visualStrokeWidth = (wall: WallSegment) =>
    wallKind(wall) === "fence" ? 3 / zoom : wallStrokePx(wall.thicknessCm);

  const setCurrentWallKind = (kind: WallKind) => {
    if (selectedWall) {
      patchWall(selectedWall.id, {
        kind,
        material: kind === "fence" ? "fence" : "medium-wall",
        color: selectedWall.color || (kind === "fence" ? DEFAULT_FENCE_COLOR : DEFAULT_WALL_COLOR),
      });
      return;
    }
    setDraftWallKind(kind);
    if (kind === "fence" && draftWallColor === DEFAULT_WALL_COLOR) {
      setDraftWallColor(DEFAULT_FENCE_COLOR);
    }
    if (kind === "wall" && draftWallColor === DEFAULT_FENCE_COLOR) {
      setDraftWallColor(DEFAULT_WALL_COLOR);
    }
  };

  const setCurrentWallColor = (color: string) => {
    if (selectedWall) patchWall(selectedWall.id, { color });
    else setDraftWallColor(color);
  };

  const deleteSelectedVertex = () => {
    if (!selectedWall || selectedVertexIndex === null || selectedWall.points.length <= 2) return;
    selectedWall.points = deleteVertex(selectedWall.points, selectedVertexIndex);
    setSelectedVertexIndex(null);
    forcePlanCommit();
  };

  const currentKind = selectedWall ? wallKind(selectedWall) : draftWallKind;
  const currentColor = selectedWall ? wallColor(selectedWall) : draftWallColor;

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
          if (mode === "wall") finishWallWithStyle();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (mode === "wall") finishWallWithStyle();
          else onFinishCable();
        }}
      >
        <g
          transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}
          style={{ pointerEvents: "none" }}
        >
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

          {plan.walls.map((w) => {
            const fence = wallKind(w) === "fence";
            return (
              <path
                key={`wall-bg-${w.id}`}
                d={wallPath(w.points, w.curved)}
                fill="none"
                stroke={wallColor(w)}
                strokeOpacity={0.95}
                strokeWidth={visualStrokeWidth(w)}
                strokeDasharray={fence ? `${8 / zoom} ${5 / zoom}` : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

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
              stroke={
                cableTypes.find((item) => item.id === cableDraftType)?.color ?? "var(--color-cable)"
              }
              strokeDasharray={`${6 / zoom} ${4 / zoom}`}
              strokeWidth={2 / zoom}
            />
          )}

          {wallDraft.length > 0 && (
            <>
              <path
                d={wallPath(
                  [...wallDraft, snappedDraftPoint ?? wallDraft[wallDraft.length - 1]!],
                  wallCurved,
                )}
                fill="none"
                stroke={draftWallColor}
                strokeDasharray={
                  draftWallKind === "fence" ? `${8 / zoom} ${5 / zoom}` : `${6 / zoom} ${4 / zoom}`
                }
                strokeWidth={draftWallKind === "fence" ? 3 / zoom : wallStrokePx(10)}
                strokeLinecap="round"
              />
              {snappedDraftPoint && (
                <circle
                  cx={snappedDraftPoint.x}
                  cy={snappedDraftPoint.y}
                  r={5 / zoom}
                  fill="var(--color-background)"
                  stroke={draftWallColor}
                  strokeWidth={2 / zoom}
                />
              )}
            </>
          )}

          {scaleDraft.length > 0 && (
            <polyline
              points={[...scaleDraft, hoverPoint ?? scaleDraft[0]!]
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2 / zoom}
            />
          )}
        </g>

        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {plan.walls.map((w) => {
            const selected = w.id === selectedWallId;
            const hovered = w.id === hoveredWallId;
            const fence = wallKind(w) === "fence";
            const strokeWidth = visualStrokeWidth(w);
            const midpoint = polylineMidpoint(w.points);
            const lengthM = polylineLengthMeters(w.points, pxPerMeter);
            const thicknessCm = w.thicknessCm ?? 10;
            const label = fence
              ? `سياج · ${lengthM.toFixed(2)} m`
              : `${lengthM.toFixed(2)} m · ${thicknessCm} cm`;

            return (
              <g key={`wall-${w.id}`}>
                <path
                  d={wallPath(w.points, w.curved)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(strokeWidth, 18 / zoom)}
                  style={{
                    cursor: mode === "select" ? "move" : "default",
                    pointerEvents: mode === "select" ? "stroke" : "none",
                  }}
                  onPointerEnter={() => setHoveredWallId(w.id)}
                  onPointerLeave={() =>
                    setHoveredWallId((current) => (current === w.id ? null : current))
                  }
                  onPointerDown={(e) => {
                    if (mode !== "select") return;
                    e.stopPropagation();
                    const start = toPlan(e.clientX, e.clientY);
                    onSelectWall(w.id);
                    onSelect(null);
                    onSelectLabel(null);
                    setSelectedVertexIndex(null);
                    dragRef.current = {
                      id: w.id,
                      kind: "wall",
                      start,
                      originalPoints: w.points.map((point) => ({ ...point })),
                    };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}
                  onDoubleClick={(e) => {
                    if (mode !== "select") return;
                    e.preventDefault();
                    e.stopPropagation();
                    const raw = toPlan(e.clientX, e.clientY);
                    const nearest = nearestSegment(w.points, raw);
                    if (!nearest || nearest.distance > snapThreshold) return;
                    const start = w.points[nearest.segmentIndex]!;
                    const end = w.points[nearest.segmentIndex + 1]!;
                    if (samePoint(start, nearest.point) || samePoint(end, nearest.point)) return;
                    w.points = insertVertex(w.points, nearest.segmentIndex, nearest.point);
                    onSelectWall(w.id);
                    setSelectedVertexIndex(nearest.segmentIndex + 1);
                    forcePlanCommit();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />

                {selected && (
                  <path
                    d={wallPath(w.points, w.curved)}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeOpacity={0.35}
                    strokeWidth={strokeWidth + 6 / zoom}
                    strokeDasharray={fence ? `${8 / zoom} ${5 / zoom}` : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {(selected || hovered) && (
                  <g
                    transform={`translate(${midpoint.x} ${midpoint.y}) scale(${1 / zoom})`}
                    style={{ pointerEvents: "none" }}
                  >
                    <rect
                      x={-70}
                      y={-36}
                      width={140}
                      height={26}
                      rx={6}
                      fill="var(--color-background)"
                      stroke={wallColor(w)}
                      strokeWidth={1.5}
                    />
                    <text
                      y={-19}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={700}
                      fill="var(--color-foreground)"
                    >
                      {label}
                    </text>
                  </g>
                )}

                {selected &&
                  w.points.map((point, index) => (
                    <circle
                      key={`${w.id}-vertex-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={(selectedVertexIndex === index ? 7 : 6) / zoom}
                      fill={
                        selectedVertexIndex === index
                          ? "var(--color-primary)"
                          : "var(--color-background)"
                      }
                      stroke={wallColor(w)}
                      strokeWidth={2 / zoom}
                      style={{ cursor: "grab", pointerEvents: "all" }}
                      onPointerDown={(e) => {
                        if (mode !== "select") return;
                        e.stopPropagation();
                        setSelectedVertexIndex(index);
                        dragRef.current = {
                          id: w.id,
                          kind: "wall-vertex",
                          vertexIndex: index,
                          originalPoints: w.points.map((p) => ({ ...p })),
                        };
                        (e.target as Element).setPointerCapture?.(e.pointerId);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVertexIndex(index);
                      }}
                    />
                  ))}
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
                <foreignObject
                  x={-7}
                  y={-7}
                  width={14}
                  height={14}
                  style={{ pointerEvents: "none" }}
                >
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
                  setSelectedVertexIndex(null);
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

      {(mode === "wall" || selectedWall) && (
        <div className="no-print absolute left-3 top-3 z-30 flex max-w-[calc(100%-120px)] flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 p-2 shadow-xl backdrop-blur">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setCurrentWallKind("wall")}
              className={`px-3 py-1.5 text-xs font-semibold ${
                currentKind === "wall" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              حائط
            </button>
            <button
              type="button"
              onClick={() => setCurrentWallKind("fence")}
              className={`border-l border-border px-3 py-1.5 text-xs font-semibold ${
                currentKind === "fence" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              سياج
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
            اللون
            <input
              type="color"
              value={currentColor.startsWith("#") ? currentColor : DEFAULT_WALL_COLOR}
              onChange={(event) => setCurrentWallColor(event.target.value)}
              className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
              aria-label="لون الحائط أو السياج"
            />
          </label>
          {selectedWall && selectedVertexIndex !== null && selectedWall.points.length > 2 && (
            <button
              type="button"
              onClick={deleteSelectedVertex}
              className="flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف النقطة
            </button>
          )}
          {mode === "wall" ? (
            <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              Snap للنهايات تلقائي · Shift لتقييد 90° · Double-click لإنهاء الرسم
            </span>
          ) : selectedWall ? (
            <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              اسحب الخط للنقل · اسحب النقاط للتعديل · Double-click على الخط لإضافة نقطة · Delete
              يحذف النقطة المحددة
            </span>
          ) : null}
        </div>
      )}

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
