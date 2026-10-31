import { describe, expect, it } from "vitest";
import { MAX_FLOORPLAN_BYTES, rotatedBounds, validateFloorplanFile } from "../src/lib/cctv/floorplan-image";

describe("Floorplan preprocessing contract", () => {
  it("accepts supported CAD-export images and PDF up to 15 MB", () => {
    for (const name of ["plan.pdf", "floor.png", "image.jpg", "image.webp", "floor.bmp"]) {
      expect(() => validateFloorplanFile({name, size:MAX_FLOORPLAN_BYTES})).not.toThrow();
    }
  });
  it("rejects unsupported formats and oversized floorplans before upload", () => {
    expect(() => validateFloorplanFile({name:"drawing.dwg",size:2000})).toThrow();
    expect(() => validateFloorplanFile({name:"drawing.pdf",size:MAX_FLOORPLAN_BYTES+1})).toThrow();
  });
  it("swaps dimensions at 90° and retains dimensions at 180°", () => {
    expect(rotatedBounds(1200,800,90)).toEqual({width:800,height:1200});
    expect(rotatedBounds(1200,800,180)).toEqual({width:1200,height:800});
  });
});
