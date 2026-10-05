export type PlanPoint = { x: number; y: number };

const EPSILON = 0.001;

export function distance(a: PlanPoint, b: PlanPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function samePoint(a: PlanPoint, b: PlanPoint, tolerance = EPSILON) {
  return distance(a, b) <= tolerance;
}

export function dedupeConsecutivePoints(points: PlanPoint[], tolerance = EPSILON) {
  return points.reduce<PlanPoint[]>((result, point) => {
    const last = result.at(-1);
    if (!last || !samePoint(last, point, tolerance)) result.push({ ...point });
    return result;
  }, []);
}

export function constrainOrthogonal(anchor: PlanPoint, point: PlanPoint) {
  const dx = Math.abs(point.x - anchor.x);
  const dy = Math.abs(point.y - anchor.y);
  return dx >= dy ? { x: point.x, y: anchor.y } : { x: anchor.x, y: point.y };
}

export function nearestSnapPoint(
  point: PlanPoint,
  candidates: PlanPoint[],
  thresholdPlanUnits: number,
): PlanPoint | null {
  let best: PlanPoint | null = null;
  let bestDistance = thresholdPlanUnits;
  for (const candidate of candidates) {
    const d = distance(point, candidate);
    if (d <= bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best ? { ...best } : null;
}

export function snapWallPoint(options: {
  point: PlanPoint;
  anchor?: PlanPoint;
  candidates?: PlanPoint[];
  thresholdPlanUnits: number;
  orthogonal?: boolean;
}) {
  const { anchor, candidates = [], thresholdPlanUnits, orthogonal = false } = options;
  let next = { ...options.point };
  const snap = nearestSnapPoint(next, candidates, thresholdPlanUnits);
  if (snap) next = snap;
  if (orthogonal && anchor) next = constrainOrthogonal(anchor, next);
  return next;
}

export function insertVertex(points: PlanPoint[], segmentIndex: number, point: PlanPoint) {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return points.map((p) => ({ ...p }));
  return [
    ...points.slice(0, segmentIndex + 1).map((p) => ({ ...p })),
    { ...point },
    ...points.slice(segmentIndex + 1).map((p) => ({ ...p })),
  ];
}

export function deleteVertex(points: PlanPoint[], vertexIndex: number) {
  if (points.length <= 2 || vertexIndex < 0 || vertexIndex >= points.length)
    return points.map((p) => ({ ...p }));
  return points.filter((_, index) => index !== vertexIndex).map((p) => ({ ...p }));
}

export function closestPointOnSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return { point: { ...start }, t: 0, distance: distance(point, start) };
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return { point: projected, t, distance: distance(point, projected) };
}

export function nearestSegment(points: PlanPoint[], point: PlanPoint) {
  let best: { segmentIndex: number; point: PlanPoint; distance: number } | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const projected = closestPointOnSegment(point, points[index]!, points[index + 1]!);
    if (!best || projected.distance < best.distance) {
      best = { segmentIndex: index, point: projected.point, distance: projected.distance };
    }
  }
  return best;
}
