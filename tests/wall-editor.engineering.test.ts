import { describe, expect, it } from "vitest";
import {
  constrainOrthogonal,
  dedupeConsecutivePoints,
  deleteVertex,
  insertVertex,
  nearestSegment,
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

  it("constrains to the dominant orthogonal axis", () => {
    expect(constrainOrthogonal({ x: 10, y: 10 }, { x: 25, y: 14 })).toEqual({ x: 25, y: 10 });
    expect(constrainOrthogonal({ x: 10, y: 10 }, { x: 12, y: 30 })).toEqual({ x: 10, y: 30 });
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
});
