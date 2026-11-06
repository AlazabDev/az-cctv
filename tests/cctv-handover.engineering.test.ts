import { describe, expect, it } from "vitest";
import {
  emptyCameraHandover, evaluateHandover, handoverCsv, normalizeHandover,
} from "../src/lib/cctv/handover";
import type { PlacedDevice } from "../src/lib/cctv/types";

const devices: PlacedDevice[] = Array.from({ length: 22 }, (_, i) => ({
  id: `device-${i + 1}`, kind: "camera", specId: "real-product-id", name: `CAM-${i + 1}`,
  x: i * 10, y: i * 4, rotation: 0, heightM: 3, tilt: 20,
}));
function verified() {
  const handover = normalizeHandover(null, 22);
  handover.cameras.forEach((camera, i) => {
    camera.placedDeviceId = devices[i].id;
    camera.area = `Room ${i + 1}`;
    camera.model = "MODEL-READ-FROM-DEVICE";
    camera.serialNumber = `SAMPLE-UNIQUE-${i + 1}`;
    camera.macAddress = `02:00:00:00:00:${(i + 1).toString(16).padStart(2, "0")}`;
    camera.ipAddress = `10.0.1.${i + 1}`;
    camera.switchName = "verified-switch";
    camera.switchPort = String(i + 1);
    camera.verifiedBy = "Site test engineer";
    camera.verifiedAt = new Date().toISOString().slice(0, 10);
    camera.video = camera.audio = camera.poe = "pass";
  });
  handover.networkVerified = true;
  handover.cableTestsVerified = true;
  handover.recordingStatusDocumented = true;
  handover.asBuiltReviewed = true;
  handover.clientTrainingCompleted = true;
  handover.clientAcceptanceSigned = true;
  handover.acceptanceReference = "SIGNED-REFERENCE";
  const layouts = [{ floorplanPath: "customer/file.png", planApproved: true, devices }];
  const topology = { parents: Object.fromEntries(devices.map((d) => [d.id, "switch-verified"])) };
  return { handover, layouts, topology };
}
describe("CCTV client handover gate", () => {
  it("initializes an empty evidence record rather than inventing devices", () => {
    const data = normalizeHandover(null, 22);
    expect(data.cameras).toHaveLength(22);
    expect(data.cameras[0]).toEqual(emptyCameraHandover(0));
    expect(evaluateHandover(data, [], { parents: {} }).ready).toBe(false);
  });
  it("never approves an empty design", () => {
    const { handover, topology } = verified();
    expect(evaluateHandover(handover, [], topology).ready).toBe(false);
  });
  it("requires a verified physical drawing and approved calibration", () => {
    const { handover, layouts, topology } = verified();
    expect(evaluateHandover(handover, [{ ...layouts[0], floorplanPath: null }], topology).ready).toBe(false);
    expect(evaluateHandover(handover, [{ ...layouts[0], planApproved: false }], topology).ready).toBe(false);
  });
  it("rejects duplicate physical identifiers and duplicate placed-device links", () => {
    const { handover, layouts, topology } = verified();
    handover.cameras[1].serialNumber = handover.cameras[0].serialNumber;
    expect(evaluateHandover(handover, layouts, topology).findings.find((x) => x.id === "identity")?.complete).toBe(false);
    handover.cameras[1].serialNumber = "UNIQUE-REPLACEMENT";
    handover.cameras[1].placedDeviceId = handover.cameras[0].placedDeviceId;
    expect(evaluateHandover(handover, layouts, topology).findings.find((x) => x.id === "mapping")?.complete).toBe(false);
  });
  it("requires an identified technician and verified test date", () => {
    const { handover, layouts, topology } = verified();
    handover.cameras[3].verifiedBy = "";
    expect(evaluateHandover(handover, layouts, topology).ready).toBe(false);
    handover.cameras[3].verifiedBy = "On-site inspector";
    handover.cameras[3].verifiedAt = "2099-01-01";
    expect(evaluateHandover(handover, layouts, topology).ready).toBe(false);
  });
  it("requires camera audio, video and PoE tests to be passed explicitly", () => {
    const { handover, layouts, topology } = verified();
    handover.cameras[5].audio = "pending";
    expect(evaluateHandover(handover, layouts, topology).ready).toBe(false);
  });
  it("requires network links and signed client acceptance reference", () => {
    const { handover, layouts, topology } = verified();
    delete topology.parents[devices[0].id];
    expect(evaluateHandover(handover, layouts, topology).ready).toBe(false);
    topology.parents[devices[0].id] = "switch-verified";
    handover.acceptanceReference = " ";
    expect(evaluateHandover(handover, layouts, topology).ready).toBe(false);
  });
  it("only approves records with all explicit evidence gates satisfied", () => {
    const { handover, layouts, topology } = verified();
    const review = evaluateHandover(handover, layouts, topology);
    expect(review.ready).toBe(true);
    expect(review.passed).toBe(review.total);
  });
  it("escapes spreadsheet formulas and quotes in exported commissioning register", () => {
    const handover = normalizeHandover(null, 22);
    handover.cameras[0].notes = '=HYPERLINK("example")';
    const csv = handoverCsv(handover);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""example""');
    expect(csv.split("\r\n")).toHaveLength(24);
  });
});
