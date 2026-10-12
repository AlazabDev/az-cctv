import { describe, expect, it } from "vitest";
import { buildBoq } from "../src/components/cctv/boq";
import {
  MAX_UTP_M,
  collectNodes,
  emptyTopology,
  mediaConvertersForLink,
  measuredCableLengthM,
  normalizeTopology,
  resolveLinkRoute,
  validateTopology,
  type TopoLayout,
  type TopologyData,
} from "../src/lib/cctv/topology";
import { emptyPlan, type CableRun, type PlacedDevice, type PlanData } from "../src/lib/cctv/types";

function device(
  id: string,
  kind: PlacedDevice["kind"],
  specId: string,
  x: number,
  y = 0,
): PlacedDevice {
  return { id, kind, specId, name: id, x, y, rotation: 0, heightM: 3, tilt: 15 };
}

function layout(
  id: string,
  devices: PlacedDevice[],
  cables: CableRun[] = [],
  pxPerMeter = 10,
): TopoLayout {
  return { id, layoutName: id, pxPerMeter, devices, cables };
}

function topology(patch: Partial<TopologyData> = {}): TopologyData {
  return normalizeTopology({ ...emptyTopology, ...patch });
}

describe("topology engineering", () => {
  it("calculates measured polyline length with vertical allowance and stored slack exactly once", () => {
    const cable: CableRun = {
      id: "c1",
      type: "cat6-stp",
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
      verticalAllowanceM: 2,
      slackPercent: 10,
    };
    expect(measuredCableLengthM(cable, 10)).toBeCloseTo(7.7, 6);
  });

  it("uses estimated fallback for a same-layout link", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const sw = device("sw", "switch", "sw-8", 100);
    const layouts = [layout("L1", [cam, sw])];
    const t = topology({ parents: { cam: "sw" }, media: { cam: "utp" } });
    const route = resolveLinkRoute("cam", t, collectNodes(layouts), layouts);
    expect(route.source).toBe("estimated");
    expect(route.lengthM).toBeCloseTo(11.5, 6);
  });

  it("does not invent a cross-layout length without a measured riser route", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const sw = device("sw", "switch", "sw-8", 0);
    const layouts = [layout("L1", [cam]), layout("L2", [sw])];
    const t = topology({ parents: { cam: "sw" }, media: { cam: "utp" } });
    const route = resolveLinkRoute("cam", t, collectNodes(layouts), layouts);
    expect(route.source).toBe("missing");
    expect(route.lengthM).toBeNull();
  });

  it("flags a measured UTP link above 90m", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const sw = device("sw", "switch", "sw-8", 950);
    const cable: CableRun = {
      id: "c95",
      type: "cat6-stp",
      points: [
        { x: 0, y: 0 },
        { x: 950, y: 0 },
      ],
      slackPercent: 0,
    };
    const layouts = [layout("L1", [cam, sw], [cable])];
    const t = topology({
      parents: { cam: "sw", sw: "__router" },
      media: { cam: "utp", sw: "utp" },
      routeBindings: { cam: { mode: "cable", cableRunId: "c95" } },
    });
    const route = resolveLinkRoute("cam", t, collectNodes(layouts), layouts);
    expect(route.lengthM).toBe(95);
    expect(route.lengthM!).toBeGreaterThan(MAX_UTP_M);
    expect(
      validateTopology(t, collectNodes(layouts), layouts).some(
        (i) => i.level === "error" && i.text.includes("90م"),
      ),
    ).toBe(true);
  });

  it("detects switch Ethernet port exhaustion including its copper uplink", () => {
    const c1 = device("c1", "camera", "bullet-2mp-28", 0);
    const c2 = device("c2", "camera", "bullet-2mp-28", 10);
    const sw = device("sw", "switch", "sw-8", 20);
    const layouts = [layout("L1", [c1, c2, sw])];
    const t = topology({
      parents: { c1: "sw", c2: "sw", sw: "__router" },
      media: { c1: "utp", c2: "utp", sw: "utp" },
      deviceOverrides: { sw: { ethernetPorts: 2, poePorts: 2, poeBudget: 120 } },
    });
    expect(
      validateTopology(t, collectNodes(layouts), layouts).some(
        (i) => i.level === "error" && i.text.includes("Ethernet"),
      ),
    ).toBe(true);
  });

  it("does not count built-in NVR PoE camera ports as the NVR LAN Ethernet interface", () => {
    const c1 = device("c1", "camera", "bullet-2mp-28", 0);
    const c2 = device("c2", "camera", "bullet-2mp-28", 10);
    const nvr = device("nvr", "nvr", "nvr-8", 20);
    const layouts = [layout("L1", [c1, c2, nvr])];
    const t = topology({
      parents: { c1: "nvr", c2: "nvr", nvr: "__router" },
      media: { c1: "utp", c2: "utp", nvr: "utp" },
      recorders: { c1: "nvr", c2: "nvr" },
    });
    const issues = validateTopology(t, collectNodes(layouts), layouts);
    expect(
      issues.some(
        (i) => i.deviceId === "nvr" && i.level === "error" && i.text.includes("Ethernet"),
      ),
    ).toBe(false);
    expect(
      issues.some((i) => i.deviceId === "nvr" && i.level === "error" && i.text.includes("PoE")),
    ).toBe(false);
  });

  it("keeps NVR recording channels separate from physical PoE ports", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const nvr = device("nvr", "nvr", "nvr-32", 10);
    const layouts = [layout("L1", [cam, nvr])];
    const t = topology({
      parents: { cam: "nvr", nvr: "__router" },
      media: { cam: "utp", nvr: "utp" },
      recorders: { cam: "nvr" },
    });
    const issues = validateTopology(t, collectNodes(layouts), layouts);
    expect(
      issues.some((i) => i.level === "error" && i.deviceId === "cam" && i.text.includes("لا تسمح")),
    ).toBe(true);
    expect(issues.some((i) => i.text.includes("32 قناة"))).toBe(false);
  });

  it("warns above 80% PoE budget without marking it over-budget", () => {
    const c1 = device("c1", "camera", "bullet-2mp-28", 0);
    const c2 = device("c2", "camera", "bullet-2mp-28", 10);
    const sw = device("sw", "switch", "sw-8", 20);
    const layouts = [layout("L1", [c1, c2, sw])];
    const t = topology({
      parents: { c1: "sw", c2: "sw", sw: "__router" },
      media: { c1: "utp", c2: "utp", sw: "utp" },
      deviceOverrides: { sw: { ethernetPorts: 4, poePorts: 2, poeBudget: 17 } },
    });
    const issues = validateTopology(t, collectNodes(layouts), layouts).filter(
      (i) => i.deviceId === "sw" && i.text.includes("PoE"),
    );
    expect(issues.some((i) => i.level === "warning" && i.text.includes("80%"))).toBe(true);
    expect(issues.some((i) => i.level === "error" && i.text.includes("يتجاوز الميزانية"))).toBe(
      false,
    );
  });

  it("errors when PoE load exceeds the configured budget", () => {
    const c1 = device("c1", "camera", "bullet-2mp-28", 0);
    const c2 = device("c2", "camera", "bullet-2mp-28", 10);
    const sw = device("sw", "switch", "sw-8", 20);
    const layouts = [layout("L1", [c1, c2, sw])];
    const t = topology({
      parents: { c1: "sw", c2: "sw", sw: "__router" },
      media: { c1: "utp", c2: "utp", sw: "utp" },
      deviceOverrides: { sw: { ethernetPorts: 4, poePorts: 2, poeBudget: 10 } },
    });
    expect(
      validateTopology(t, collectNodes(layouts), layouts).some(
        (i) => i.level === "error" && i.text.includes("يتجاوز الميزانية"),
      ),
    ).toBe(true);
  });

  it("requires two media converters when neither end can terminate fiber", () => {
    const a = device("a", "switch", "sw-8", 0);
    const b = device("b", "switch", "sw-8", 10);
    const layouts = [layout("L1", [a, b])];
    const t = topology({ parents: { a: "b", b: "__router" }, media: { a: "fiber", b: "utp" } });
    expect(mediaConvertersForLink("a", t, collectNodes(layouts))).toBe(2);
  });

  it("requires no media converters when both fiber endpoints have SFP capability", () => {
    const a = device("a", "switch", "sw-8", 0);
    const b = device("b", "switch", "sw-8", 10);
    const layouts = [layout("L1", [a, b])];
    const t = topology({
      parents: { a: "b", b: "__router" },
      media: { a: "fiber", b: "utp" },
      deviceOverrides: { a: { sfpPorts: 1 }, b: { sfpPorts: 1 } },
    });
    expect(mediaConvertersForLink("a", t, collectNodes(layouts))).toBe(0);
  });

  it("does not double-count a drawn cable route already bound to topology", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const sw = device("sw", "switch", "sw-8", 100);
    const cable: CableRun = {
      id: "route",
      type: "cat6-stp",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      slackPercent: 0,
    };
    const layouts = [layout("L1", [cam, sw], [cable])];
    const t = topology({
      parents: { cam: "sw" },
      media: { cam: "utp" },
      routeBindings: { cam: { mode: "cable", cableRunId: "route" } },
    });
    const plan: PlanData = { ...emptyPlan, pxPerMeter: 10, devices: [cam, sw], cables: [cable] };
    const boq = buildBoq(plan, 14, { layouts, topology: t });
    const line = boq.lines.find((l) => l.label === "كابل CAT6 STP");
    expect(line?.qty).toBe(10);
  });

  it("keeps a drawn cable in BOQ when its measured topology binding is invalid", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const sw = device("sw", "switch", "sw-8", 100);
    const cable: CableRun = {
      id: "bad-route",
      type: "cat6-stp",
      points: [
        { x: 500, y: 500 },
        { x: 600, y: 500 },
      ],
      slackPercent: 0,
    };
    const layouts = [layout("L1", [cam, sw], [cable])];
    const t = topology({
      parents: { cam: "sw" },
      media: { cam: "utp" },
      routeBindings: { cam: { mode: "cable", cableRunId: "bad-route" } },
    });
    const plan: PlanData = { ...emptyPlan, pxPerMeter: 10, devices: [cam, sw], cables: [cable] };
    const boq = buildBoq(plan, 14, { layouts, topology: t });
    const line = boq.lines.find((l) => l.label === "كابل CAT6 STP");
    expect(line?.qty).toBe(10);
  });

  it("detects topology loops", () => {
    const a = device("a", "switch", "sw-8", 0);
    const b = device("b", "switch", "sw-8", 10);
    const layouts = [layout("L1", [a, b])];
    const t = topology({ parents: { a: "b", b: "a" }, media: { a: "utp", b: "utp" } });
    expect(
      validateTopology(t, collectNodes(layouts), layouts).some(
        (i) => i.level === "error" && i.text.includes("Loop"),
      ),
    ).toBe(true);
  });
});
