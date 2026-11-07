import { describe, expect, it } from "vitest";
import type { WallSegment } from "../src/lib/cctv/types";
import {
  canAppendWallPoint,
  constrainPolar45,
  isWallClosure,
  nearestWallAttachment,
  constrainOrthogonal,
  dedupeConsecutivePoints,
  deleteVertex,
  insertVertex,
  nearestSegment,
  normalizeWallSegment,
  sanitizeWallPoints,
  snapWallPoint,
} from "../src/lib/cctv/wall-editor";

describe("wall editor deterministic geometry", () => {
  it("deduplicates zero-length consecutive points", () => {
    expect(
      dedupeConsecutivePoints([
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 20, y: 10 },
      ]),
    ).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);
  });

  it("removes invalid geometry coordinates", () => {
    expect(
      sanitizeWallPoints([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 5 },
        { x: 10, y: 0 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("constrains to the dominant orthogonal axis", () => {
    expect(constrainOrthogonal({ x: 10, y: 10 }, { x: 25, y: 14 })).toEqual({
      x: 25,
      y: 10,
    });
    expect(constrainOrthogonal({ x: 10, y: 10 }, { x: 12, y: 30 })).toEqual({
      x: 10,
      y: 30,
    });
  });

  it("snaps to an existing endpoint before orthogonal constraint", () => {
    expect(
      snapWallPoint({
        point: { x: 99, y: 102 },
        anchor: { x: 40, y: 100 },
        candidates: [{ x: 100, y: 100 }],
        thresholdPlanUnits: 5,
        orthogonal: true,
      }),
    ).toEqual({ x: 100, y: 100 });
  });

  it("does not snap outside the configured threshold", () => {
    expect(
      snapWallPoint({
        point: { x: 90, y: 90 },
        candidates: [{ x: 100, y: 100 }],
        thresholdPlanUnits: 5,
      }),
    ).toEqual({ x: 90, y: 90 });
  });

  it("inserts a vertex into a selected segment", () => {
    expect(
      insertVertex(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0,
        { x: 5, y: 0 },
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("never deletes below two wall vertices", () => {
    expect(
      deleteVertex(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0,
      ),
    ).toHaveLength(2);

    expect(
      deleteVertex(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 10, y: 0 },
        ],
        1,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("finds the closest segment and projected insertion point", () => {
    expect(
      nearestSegment(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        { x: 7, y: 2 },
      ),
    ).toEqual({ segmentIndex: 0, point: { x: 7, y: 0 }, distance: 2 });
  });

  it("normalizes legacy wall data without losing geometry", () => {
    const legacy: WallSegment = {
      id: "wall-1",
      material: "medium-wall",
      thicknessCm: 20,
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      curved: false,
    };

    expect(normalizeWallSegment(legacy)).toMatchObject({
      id: "wall-1",
      kind: "wall",
      color: "#334155",
      thicknessCm: 20,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
  });

  it("preserves wall and fence editing fields through JSON save/reload", () => {
    const fence: WallSegment = {
      id: "fence-1",
      material: "fence",
      kind: "fence",
      color: "#22c55e",
      thicknessCm: 10,
      points: [
        { x: 15.5, y: 20.25 },
        { x: 60.75, y: 20.25 },
        { x: 60.75, y: 80.5 },
      ],
      curved: false,
      note: "perimeter fence",
    };

    const reloaded = JSON.parse(JSON.stringify(fence)) as WallSegment;
    expect(normalizeWallSegment(reloaded)).toEqual(fence);
  });
  it("attaches cursor to existing wall interiors, not only endpoints", () => {
    expect(
      nearestWallAttachment(
        { x: 30, y: 4 },
        [
          {
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
        ],
        8,
      ),
    ).toEqual({ x: 30, y: 0 });
    expect(
      nearestWallAttachment(
        { x: 30, y: 20 },
        [
          {
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
        ],
        8,
      ),
    ).toBeNull();
  });

  it("rejects short accidental wall clicks in screen pixels", () => {
    expect(canAppendWallPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, 2)).toBe(false);
    expect(canAppendWallPoint({ x: 0, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true);
    expect(canAppendWallPoint(undefined, { x: 0, y: 0 }, 1)).toBe(true);
  });

  it("tracks CAD polar angles in 45 degree steps", () => {
    const diagonal = constrainPolar45({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(diagonal.x).toBeCloseTo(diagonal.y, 8);
    const horizontal = constrainPolar45({ x: 0, y: 0 }, { x: 12, y: 1 });
    expect(horizontal.y).toBeCloseTo(0, 8);
  });

  it("closes wall only after at least three vertices", () => {
    const first = { x: 0, y: 0 };
    expect(isWallClosure([first, { x: 10, y: 0 }], first, 3)).toBe(false);
    expect(isWallClosure([first, { x: 10, y: 0 }, { x: 10, y: 10 }], { x: 1, y: 1 }, 3)).toBe(true);
    expect(isWallClosure([first, { x: 10, y: 0 }, { x: 10, y: 10 }], { x: 8, y: 8 }, 3)).toBe(
      false,
    );
  });
});
