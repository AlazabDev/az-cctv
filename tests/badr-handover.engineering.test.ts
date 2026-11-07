import { describe, expect, it } from "vitest";
import { renderHandoverReport } from "../src/lib/cctv/handover-report";
import {
  blankInspection,
  evaluateHandover,
  handoverCSV,
  makeBadrHandover,
  normalizeHandover,
  HANDOVER_CHECKS,
  type ProjectHandover,
} from "../src/lib/cctv/handover";

describe("first customer handover — evidence and integrity", () => {
  const placed = () =>
    Array.from({ length: 22 }, (_, i) => ({ id: `design-${i + 1}`, model: "DS-2CD1123G2-LIU" }));
  it("creates exactly 22 empty identification slots, not fabricated equipment", () => {
    const h = makeBadrHandover();
    expect(h.inspections).toHaveLength(22);
    expect(h.inspections[0]).toEqual(blankInspection("CAM-01"));
    expect(h.inspections[21].id).toBe("CAM-22");
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
  });

  it("never approves a job based only on camera count", () => {
    const h = makeBadrHandover();
    expect(evaluateHandover(h, placed(), 0, 1, []).verifiedCameras).toBe(0);
    expect(evaluateHandover(h, [], 0, 1, []).issues.some((i) => i.includes("المخطط"))).toBe(true);
  });

  function prepared(): ProjectHandover {
    const h = makeBadrHandover();
    h.inspections = h.inspections.map((row, index) => ({
      ...row,
      designDeviceId: `design-${index + 1}`,
      area: `Room ${index + 1}`,
      model: "DS-2CD1123G2-LIU",
      serial: `SERIAL-${index + 1}`,
      mac: `aa:bb:cc:dd:ee:${(index + 1).toString(16).padStart(2, "0")}`,
      ip: `192.168.0.${index + 20}`,
      switchId: `SW-0${Math.floor(index / 6) + 1}`,
      port: String(index + 1),
      video: "pass",
      audio: "pass",
      poe: "pass",
      testedAt: "2026-11-07",
    }));
    for (const { id } of HANDOVER_CHECKS)
      h.checks[id] = { result: "pass", checkedAt: "2026-11-07", evidence: "QA/reference" };
    return h;
  }

  it("requires verified device identity, passing tests, network review and all sign-offs", () => {
    const h = prepared();
    expect(evaluateHandover(h, placed(), 0, 1, [])).toMatchObject({
      ready: true,
      verifiedCameras: 22,
      expectedCameras: 22,
    });
    expect(evaluateHandover(h, placed(), 1, 1, []).ready).toBe(false);
    expect(evaluateHandover(h, placed().slice(0, 21), 0, 1, []).ready).toBe(false);
    h.checks.client_approval = { result: "pending", checkedAt: "", evidence: "" };
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
  });

  it("does not approve inventory records without links to distinct placed camera IDs", () => {
    const h = prepared();
    h.inspections[0].designDeviceId = "";
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
    h.inspections[0].designDeviceId = "design-2";
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
  });

  it("rejects actual model mismatches against the device selected on the drawing", () => {
    const h = prepared();
    h.inspections[0].model = "DS-2CD1021G0-I";
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
    expect(evaluateHandover(h, placed(), 0, 1, []).verifiedCameras).toBe(21);
  });

  it("detects duplicate MAC, IP and serial identifiers", () => {
    const h = prepared();
    h.inspections[1].mac = h.inspections[0].mac.toUpperCase();
    h.inspections[2].serial = h.inspections[0].serial;
    h.inspections[3].ip = h.inspections[0].ip;
    expect(evaluateHandover(h, placed(), 0, 1, []).verifiedCameras).toBe(19);
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
  });

  it("allows unsupported audio only with a recorded justification", () => {
    const h = prepared();
    h.inspections[0].audio = "not_applicable";
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(false);
    h.inspections[0].note = "No microphone in installed equipment";
    expect(evaluateHandover(h, placed(), 0, 1, []).ready).toBe(true);
  });

  it("normalizes untrusted persisted records without inventing verification", () => {
    expect(normalizeHandover(null)).toBeNull();
    const h = normalizeHandover({
      expectedCameras: 22,
      inspections: [{ id: "CAM-01", video: "pass" }],
    });
    expect(h?.inspections).toHaveLength(22);
    expect(h?.inspections[0].video).toBe("pass");
    expect(h?.inspections[0].serial).toBe("");
    expect(h?.inspections[1].video).toBe("pending");
  });

  it("labels incomplete reports as drafts and escapes customer-supplied HTML", () => {
    const h = makeBadrHandover();
    h.inspections[0].area = '<script>alert("test")</script>';
    const report = evaluateHandover(h, placed(), 0, 1, []);
    const html = renderHandoverReport("<onload=evil>", "حضانة بدر", h, report);
    expect(html).toContain("مسودة غير معتمدة");
    expect(html).not.toContain('<script>alert("test")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;onload=evil&gt;");
    expect(html).toContain("CAM-22");
  });

  it("escapes CSV and blocks spreadsheet formula injection", () => {
    const h = makeBadrHandover();
    h.inspections[0].note = '=HYPERLINK("https://example.test","run")';
    const csv = handoverCSV(h);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('""https://example.test""');
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(23);
  });
});
