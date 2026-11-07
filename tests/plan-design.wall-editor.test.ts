import { describe, expect, it } from "vitest";
import {
  constrainOrthogonal,
  deleteVertex,
  insertVertex,
  nearestSegment,
  normalizeWallSegment,
  sanitizeWallPoints,
  snapWallPoint,
} from "../src/lib/cctv/wall-editor";

describe("Plan Design — wall editor regression", () => {
  it("drops non-finite coordinates before deduplicating adjacent vertices", () => {
    const points = [
      { x: 10, y: 20 },
      { x: Number.NaN, y: 0 },
      { x: 10, y: 20 },
      { x: Number.POSITIVE_INFINITY, y: 4 },
      { x: 30, y: 20 },
    ];
    expect(sanitizeWallPoints(points)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 20 },
    ]);
  });

  it("does not mutate coordinates supplied by the caller", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const result = sanitizeWallPoints(points);
    result[0]!.x = 100;
    expect(points[0]!.x).toBe(0);
  });

  it("snaps to a nearby vertex and constrains to an orthogonal edge", () => {
    const result = snapWallPoint({
      point: { x: 9.8, y: 2 },
      anchor: { x: 0, y: 0 },
      candidates: [{ x: 10, y: 0 }],
      thresholdPlanUnits: 3,
      orthogonal: true,
    });
    expect(result).toEqual({ x: 10, y: 0 });
    expect(constrainOrthogonal({ x: 0, y: 0 }, { x: 2, y: 8 })).toEqual({ x: 0, y: 8 });
  });

  it("inserts the projected vertex into the nearest wall segment", () => {
    const wall = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const nearest = nearestSegment(wall, { x: 5, y: 2 });
    expect(nearest?.segmentIndex).toBe(0);
    expect(nearest?.point).toEqual({ x: 5, y: 0 });
    const extended = insertVertex(wall, nearest!.segmentIndex, nearest!.point);
    expect(extended).toHaveLength(4);
    expect(deleteVertex(extended, 1)).toEqual(wall);
  });

  it("preserves at least two wall vertices when deleting", () => {
    const endpoints = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(deleteVertex(endpoints, 0)).toEqual(endpoints);
  });

  it("normalizes legacy fence style without altering its identity", () => {
    const wall = {
      id: "fence-1",
      material: "fence",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 5 },
      ],
      curved: false,
    };
    const normalized = normalizeWallSegment(wall);
    expect(normalized.id).toBe(wall.id);
    expect(normalized.kind).toBe("fence");
    expect(normalized.thicknessCm).toBe(10);
    expect(normalized.points).toEqual(wall.points);
  });
});
