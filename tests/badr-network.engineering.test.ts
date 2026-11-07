import { describe, expect, it } from "vitest";
import { inspectBadrNetwork } from "../src/lib/cctv/badr-network";
import { ROUTER_ID } from "../src/lib/cctv/topology";

const cameraGroups = [4, 6, 6, 6] as const;
function site() {
  const switches = Array.from({ length: 4 }, (_, i) => ({ id: `switch-${i + 1}`, kind: "switch" }));
  const cameras = Array.from({ length: 22 }, (_, i) => ({ id: `camera-${i + 1}`, kind: "camera" }));
  const parents: Record<string, string> = { "switch-1": ROUTER_ID };
  for (let i = 1; i < 4; i++) parents[`switch-${i + 1}`] = `switch-${i}`;
  let cameraIndex = 0;
  cameraGroups.forEach((size, swIndex) => {
    for (let j = 0; j < size; j++) parents[cameras[cameraIndex++].id] = switches[swIndex].id;
  });
  return { layout: { devices: [...switches, ...cameras] }, parents };
}

describe("Badr Nursery stated physical topology — 4+6+6+6", () => {
  it("accepts only the exact actual four-switch chain and 22 directly connected cameras", () => {
    const { layout, parents } = site();
    expect(inspectBadrNetwork([layout], parents)).toMatchObject({
      cameraCount: 22,
      switchCount: 4,
      directCameras: [4, 6, 6, 6],
      issues: [],
    });
  });
  it("rejects a fifth invented switch", () => {
    const { layout, parents } = site();
    layout.devices.push({ id: "switch-5", kind: "switch" });
    expect(inspectBadrNetwork([layout], parents).issues).not.toHaveLength(0);
  });
  it("rejects cascade branching", () => {
    const { layout, parents } = site();
    parents["switch-3"] = "switch-1";
    expect(inspectBadrNetwork([layout], parents).issues).not.toHaveLength(0);
  });
  it("rejects a camera connected to the wrong switch", () => {
    const { layout, parents } = site();
    parents["camera-1"] = "switch-2";
    const report = inspectBadrNetwork([layout], parents);
    expect(report.directCameras).toEqual([3, 7, 6, 6]);
    expect(report.issues.length).toBeGreaterThan(0);
  });
  it("rejects unconnected cameras and missing root uplink", () => {
    const { layout, parents } = site();
    delete parents["camera-22"];
    delete parents["switch-1"];
    expect(inspectBadrNetwork([layout], parents).issues.length).toBeGreaterThan(0);
  });
});
