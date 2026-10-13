import { describe, expect, it } from "vitest";
import { projectAgentContext } from "../src/lib/cctv/project-agent-context";

describe("project agent context", () => {
  it("summarizes all layouts rather than only the active legacy mirror", () => {
    const context = projectAgentContext("Test", {
      activeLayoutId: "A",
      devices: [{ kind: "camera", name: "stale" }],
      layouts: [
        { id: "A", layoutName: "Ground", pxPerMeter: 40,
          devices: [{ kind: "camera", name: "C1", specId: "spec1", heightM: 3 }],
          walls: [{ id: "w1" }], cables: [{ id: "c1" }] },
        { id: "B", layoutName: "First", devices: [
          { kind: "camera", name: "C2", specId: "spec2" },
          { kind: "switch", name: "SW1", specId: "switch1" },
        ] },
      ],
      topology: { parents: { C1: "SW1" }, recorders: { C1: "N1" } },
      siteMap: { cameras: [{ id: "outside" }], boundary: [{}, {}, {}] },
    });
    expect(context.layouts).toHaveLength(2);
    expect(context.layouts[0]?.cameras[0]?.name).toBe("C1");
    expect(context.layouts[1]?.cameras[0]?.name).toBe("C2");
    expect(context.layouts[1]?.hardware[0]?.kind).toBe("switch");
    expect(context.layouts[0]?.walls).toBe(1);
    expect(context.siteMap.cameraCount).toBe(1);
    expect(context.topology.networkLinks).toBe(1);
  });

  it("keeps legacy single-layout projects readable", () => {
    const result = projectAgentContext("Legacy", { pxPerMeter: 20, devices: [
      { kind: "camera", name: "Old camera", specId: "camera1" },
    ] });
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0]?.cameras).toHaveLength(1);
    expect(result.layouts[0]?.scalePxPerMeter).toBe(20);
  });

  it("handles incomplete JSON without throwing", () => {
    expect(projectAgentContext("Empty", null).layouts[0]?.cameras).toEqual([]);
    expect(projectAgentContext("Empty", { layouts: [null, 42] }).layouts).toHaveLength(2);
  });
});
