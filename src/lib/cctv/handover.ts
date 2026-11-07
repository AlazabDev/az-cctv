import { isScaleCalibrated, type PlacedDevice, type ScaleCalibration } from "./types";
import type { TopologyData } from "./topology";
import { inspectBadrNetwork } from "./badr-network";

/** Physical commissioning evidence, separate from a commercial product specification. */
export type Verification = "pending" | "pass" | "fail";
export interface CameraHandoverRecord {
  cameraId: string;
  placedDeviceId: string;
  area: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  ipAddress: string;
  switchName: string;
  switchPort: string;
  verifiedBy: string;
  verifiedAt: string;
  video: Verification;
  audio: Verification;
  poe: Verification;
  notes: string;
}
export interface HandoverData {
  targetCameraCount: number;
  cameras: CameraHandoverRecord[];
  networkVerified: boolean;
  cableTestsVerified: boolean;
  recordingStatusDocumented: boolean;
  clientTrainingCompleted: boolean;
  asBuiltReviewed: boolean;
  clientAcceptanceSigned: boolean;
  acceptanceReference: string;
  updatedBy?: string;
}
export interface HandoverFinding {
  id: string;
  label: string;
  complete: boolean;
  detail: string;
}
export interface HandoverReview {
  ready: boolean;
  passed: number;
  total: number;
  findings: HandoverFinding[];
}
const idOf = (index: number) => `CAM-${String(index + 1).padStart(2, "0")}`;
export function emptyCameraHandover(index: number): CameraHandoverRecord {
  return {
    cameraId: idOf(index),
    placedDeviceId: "",
    area: "",
    model: "",
    serialNumber: "",
    macAddress: "",
    ipAddress: "",
    switchName: "",
    switchPort: "",
    verifiedBy: "",
    verifiedAt: "",
    video: "pending",
    audio: "pending",
    poe: "pending",
    notes: "",
  };
}
export function normalizeHandover(input: unknown, expectedCount = 22): HandoverData {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Partial<HandoverData>)
      : {};
  const count = Math.min(256, Math.max(1, Math.trunc(expectedCount)));
  const raw = Array.isArray(source.cameras) ? source.cameras : [];
  const cameras = Array.from({ length: count }, (_, i) => {
    const item = raw.find((entry) => entry?.cameraId === idOf(i));
    const base = emptyCameraHandover(i);
    if (!item) return base;
    const output = { ...base };
    for (const key of [
      "placedDeviceId",
      "area",
      "model",
      "serialNumber",
      "macAddress",
      "ipAddress",
      "switchName",
      "switchPort",
      "verifiedBy",
      "verifiedAt",
      "notes",
    ] as const) {
      output[key] = typeof item[key] === "string" ? item[key] : "";
    }
    for (const key of ["video", "audio", "poe"] as const) {
      output[key] = item[key] === "pass" || item[key] === "fail" ? item[key] : "pending";
    }
    return output;
  });
  return {
    targetCameraCount: count,
    cameras,
    networkVerified: source.networkVerified === true,
    cableTestsVerified: source.cableTestsVerified === true,
    recordingStatusDocumented: source.recordingStatusDocumented === true,
    clientTrainingCompleted: source.clientTrainingCompleted === true,
    asBuiltReviewed: source.asBuiltReviewed === true,
    clientAcceptanceSigned: source.clientAcceptanceSigned === true,
    acceptanceReference:
      typeof source.acceptanceReference === "string" ? source.acceptanceReference : "",
  };
}
const hasText = (text: string) => text.trim().length > 0;
const macValid = (mac: string) => /^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i.test(mac.trim());
const ipv4Valid = (ip: string) => {
  const segments = ip.trim().split(".");
  return (
    segments.length === 4 &&
    segments.every(
      (part) =>
        /^\d{1,3}$/.test(part) &&
        Number(part) >= 0 &&
        Number(part) <= 255 &&
        String(Number(part)) === part,
    )
  );
};
const uniqueNonempty = (values: string[]) =>
  values.length === new Set(values.map((value) => value.trim().toLowerCase())).size;
const cairoToday = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const validInspectionDate = (day: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day &&
    day <= cairoToday()
  );
};
export function evaluateHandover(
  input: HandoverData,
  layouts: Array<{
    floorplanPath?: string | null;
    planApproved?: boolean;
    pxPerMeter: number;
    scaleCalibration?: ScaleCalibration;
    devices: PlacedDevice[];
  }>,
  topology: Pick<TopologyData, "parents">,
  siteProfile?: "badr-four-switch",
): HandoverReview {
  const cameras = layouts.flatMap((layout) => layout.devices.filter((d) => d.kind === "camera"));
  const ids = new Set(cameras.map((camera) => camera.id));
  const records = input.cameras;
  const linked = records.map((record) => record.placedDeviceId).filter(hasText);
  const fullIdentifiers = records.every(
    (r) =>
      [
        r.area,
        r.model,
        r.serialNumber,
        r.macAddress,
        r.ipAddress,
        r.switchName,
        r.switchPort,
      ].every(hasText) &&
      macValid(r.macAddress) &&
      ipv4Valid(r.ipAddress),
  );
  const identityUnique =
    uniqueNonempty(records.map((r) => r.serialNumber)) &&
    uniqueNonempty(records.map((r) => r.macAddress)) &&
    uniqueNonempty(records.map((r) => r.ipAddress));
  const linkedExactlyOnce =
    linked.length === input.targetCameraCount &&
    linked.every((id) => ids.has(id)) &&
    uniqueNonempty(linked);
  const badrNetwork =
    siteProfile === "badr-four-switch" ? inspectBadrNetwork(layouts, topology.parents) : null;
  const findings: HandoverFinding[] = [
    {
      id: "floorplans",
      label: "مخططات معتمدة",
      complete:
        layouts.length > 0 &&
        layouts.every(
          (layout) =>
            Boolean(layout.floorplanPath) &&
            layout.planApproved === true &&
            isScaleCalibrated(layout),
        ),
      detail: "يجب رفع مخطط فعلي ومعايرته بقياس مسافة معلومة واعتماده لكل منطقة/دور.",
    },
    {
      id: "cameras",
      label: "تطابق عدد الكاميرات",
      complete:
        cameras.length === input.targetCameraCount && records.length === input.targetCameraCount,
      detail: `عدد الكاميرات المرسومة ${cameras.length} من ${input.targetCameraCount} المطلوبة.`,
    },
    {
      id: "mapping",
      label: "ربط سجل الأجهزة بالمخطط",
      complete: linkedExactlyOnce,
      detail: "يجب ربط كل رقم CAM بكاميرا منفذة واحدة مميزة على المخطط.",
    },
    {
      id: "identity",
      label: "بيانات الأجهزة الفعلية",
      complete: fullIdentifiers && identityUnique,
      detail: "Model وSerial وMAC وIPv4 والموقع والسويتش والمنفذ لكل كاميرا، دون تكرار.",
    },
    {
      id: "tests",
      label: "اختبار الصوت والصورة والطاقة",
      complete: records.every(
        (r) =>
          r.video === "pass" &&
          r.audio === "pass" &&
          r.poe === "pass" &&
          hasText(r.verifiedBy) &&
          validInspectionDate(r.verifiedAt),
      ),
      detail: "تحتاج كل كاميرا إلى PASS للفيديو والصوت وPoE مع اسم الفاحص وتاريخ الفحص.",
    },
    {
      id: "links",
      label: "الربط الفعلي بالشبكة",
      complete:
        linkedExactlyOnce &&
        linked.every((id) => hasText(topology.parents[id] ?? "")) &&
        input.networkVerified,
      detail: "توثيق مسارات الربط في CCTV Network وإقرار اختبارها ميدانيًا.",
    },
    ...(badrNetwork
      ? [
          {
            id: "badr_physical_network",
            label: "مطابقة السويتشات الأربعة 4 / 6 / 6 / 6",
            complete: badrNetwork.issues.length === 0,
            detail: badrNetwork.issues.length
              ? badrNetwork.issues.join("؛ ")
              : "تطابق التوصيل المتسلسل المبلغ من الموقع.",
          },
        ]
      : []),
    {
      id: "cables",
      label: "اختبارات الكابلات",
      complete: input.cableTestsVerified,
      detail: "توثيق الفحص لكل مسار كابل.",
    },
    {
      id: "recording",
      label: "حالة التسجيل موثقة",
      complete: input.recordingStatusDocumented,
      detail: "توثيق هل يوجد NVR أو وسيلة تسجيل فعلية، ولا يكفي افتراض وجود مسجل.",
    },
    {
      id: "asbuilt",
      label: "مراجعة المخطط As-built",
      complete: input.asBuiltReviewed,
      detail: "مطابقة المخططات والكميات النهائية مع التنفيذ الفعلي.",
    },
    {
      id: "training",
      label: "تدريب العميل",
      complete: input.clientTrainingCompleted,
      detail: "توثيق تدريب ممثل العميل على المشاهدة والتشغيل والإبلاغ عن الأعطال.",
    },
    {
      id: "acceptance",
      label: "اعتماد العميل",
      complete: input.clientAcceptanceSigned && hasText(input.acceptanceReference),
      detail: "تسجيل رقم أو مرجع محضر استلام موقع من العميل.",
    },
  ];
  const passed = findings.filter((finding) => finding.complete).length;
  return { ready: passed === findings.length, passed, total: findings.length, findings };
}
export function handoverCsv(data: HandoverData): string {
  const rows = [
    [
      "Camera ID",
      "Placed device ID",
      "Area",
      "Model",
      "Serial No",
      "MAC Address",
      "IP Address",
      "Switch",
      "Switch Port",
      "Tested By",
      "Test Date",
      "Video",
      "Audio",
      "PoE",
      "Notes",
    ],
    ...data.cameras.map((r) => [
      r.cameraId,
      r.placedDeviceId,
      r.area,
      r.model,
      r.serialNumber,
      r.macAddress,
      r.ipAddress,
      r.switchName,
      r.switchPort,
      r.verifiedBy,
      r.verifiedAt,
      r.video,
      r.audio,
      r.poe,
      r.notes,
    ]),
  ];
  // Formula-injection safe for spreadsheets: keep leading =,+,-,@ as literal text.
  const cell = (value: string) => {
    const safe = /^[=+\-@]/.test(value.trimStart()) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
