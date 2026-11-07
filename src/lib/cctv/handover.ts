/** Verified handover records are distinct from proposed design devices.
 * A planning slot is never evidence of installed or working equipment. */
export type InspectionResult = "pending" | "pass" | "fail" | "not_applicable";

export interface CameraInspection {
  id: string;
  area: string;
  model: string;
  serial: string;
  mac: string;
  ip: string;
  switchId: string;
  port: string;
  video: InspectionResult;
  audio: InspectionResult;
  poe: InspectionResult;
  testedAt: string;
  note: string;
}

export type HandoverCheckId =
  | "as_built"
  | "topology"
  | "uplinks"
  | "recording"
  | "cable_tests"
  | "client_training"
  | "client_approval";

export const HANDOVER_CHECKS: Array<{ id: HandoverCheckId; title: string }> = [
  { id: "as_built", title: "اعتماد مخططات التنفيذ الفعلي As-built" },
  { id: "topology", title: "مطابقة توصيلات السويتشات والمنافذ بالواقع" },
  { id: "uplinks", title: "فحص سعة الـUplinks وقدرة PoE الفعلية" },
  { id: "recording", title: "توثيق وسيلة التسجيل وحالة حفظ الفيديو (أو عدم وجودها)" },
  { id: "cable_tests", title: "توثيق اختبارات الكابلات وأطوال الروابط" },
  { id: "client_training", title: "تدريب العميل على المشاهدة والصلاحيات" },
  { id: "client_approval", title: "توقيع العميل على محضر الاستلام" },
];

export interface HandoverCheck {
  result: "pending" | "pass" | "fail";
  evidence: string;
  checkedAt: string;
}

export interface ProjectHandover {
  expectedCameras: number;
  inspections: CameraInspection[];
  checks: Partial<Record<HandoverCheckId, HandoverCheck>>;
}

export const blankInspection = (id: string): CameraInspection => ({
  id, area: "", model: "", serial: "", mac: "", ip: "", switchId: "", port: "",
  video: "pending", audio: "pending", poe: "pending", testedAt: "", note: "",
});

export const makeBadrHandover = (): ProjectHandover => ({
  expectedCameras: 22,
  inspections: Array.from({ length: 22 }, (_, index) => blankInspection(`CAM-${String(index + 1).padStart(2, "0")}`)),
  checks: {},
});

const results: InspectionResult[] = ["pending", "pass", "fail", "not_applicable"];
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const validIPv4 = (s: string) => {
  const parts = s.split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};
const validMAC = (s: string) => /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(s);

export function normalizeHandover(value: unknown): ProjectHandover | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<ProjectHandover>;
  const expected = Number.isInteger(raw.expectedCameras) && (raw.expectedCameras ?? 0) > 0 && (raw.expectedCameras ?? 0) <= 256
    ? raw.expectedCameras! : 22;
  const source = Array.isArray(raw.inspections) ? raw.inspections : [];
  const rows = Array.from({ length: expected }, (_, index) => {
    const id = `CAM-${String(index + 1).padStart(2, "0")}`;
    const item = source.find(x => x?.id === id);
    const clean = blankInspection(id);
    if (!item || typeof item !== "object") return clean;
    for (const field of ["area", "model", "serial", "mac", "ip", "switchId", "port", "testedAt", "note"] as const)
      clean[field] = text(item[field]);
    for (const field of ["video", "audio", "poe"] as const)
      clean[field] = results.includes(item[field]) ? item[field] : "pending";
    return clean;
  });
  const checks: ProjectHandover["checks"] = {};
  for (const { id } of HANDOVER_CHECKS) {
    const item = raw.checks?.[id];
    if (item && ["pending", "pass", "fail"].includes(item.result)) {
      checks[id] = { result: item.result, evidence: text(item.evidence), checkedAt: text(item.checkedAt) };
    }
  }
  return { expectedCameras: expected, inspections: rows, checks };
}

export interface ReadinessReport {
  verifiedCameras: number;
  expectedCameras: number;
  issues: string[];
  ready: boolean;
}

export function evaluateHandover(
  handover: ProjectHandover,
  placedCameras: number,
  topologyErrorCount: number,
  layoutCount: number,
): ReadinessReport {
  const issues: string[] = [];
  if (handover.inspections.length !== handover.expectedCameras)
    issues.push("عدد سجلات الأجهزة لا يطابق العدد المخطط.");
  if (placedCameras !== handover.expectedCameras)
    issues.push(`المخطط يحوي ${placedCameras} كاميرا، بينما المطلوب توثيق ${handover.expectedCameras}.`);
  if (layoutCount < 1) issues.push("لا توجد مخططات مسجلة للمشروع.");
  if (topologyErrorCount > 0) issues.push(`هناك ${topologyErrorCount} خطأ في التوصيلات يلزم حله.`);

  const serials = new Set<string>();
  const macs = new Set<string>();
  const ips = new Set<string>();
  let verifiedCameras = 0;
  for (const row of handover.inspections) {
    const detail = [row.area, row.model, row.serial, row.mac, row.ip, row.switchId, row.port, row.testedAt];
    const complete = detail.every(x => Boolean(x.trim()));
    const mac = row.mac.trim().toLowerCase().replace(/-/g, ":");
    const serial = row.serial.trim().toLowerCase();
    const ip = row.ip.trim();
    const duplicate = (Boolean(serial) && serials.has(serial)) ||
      (Boolean(mac) && macs.has(mac)) || (Boolean(ip) && ips.has(ip));
    if (serial) serials.add(serial);
    if (mac) macs.add(mac);
    if (ip) ips.add(ip);
    const testsPassed = row.video === "pass" && row.poe === "pass" &&
      (row.audio === "pass" || (row.audio === "not_applicable" && Boolean(row.note.trim())));
    if (complete && validMAC(row.mac) && validIPv4(ip) && !duplicate && testsPassed) verifiedCameras++;
    else issues.push(`${row.id}: بيانات التعريف أو نتائج الاختبارات غير مكتملة/متعارضة.`);
  }

  for (const check of HANDOVER_CHECKS) {
    const record = handover.checks[check.id];
    if (record?.result !== "pass" || !record.evidence.trim() || !record.checkedAt.trim())
      issues.push(`${check.title}: يحتاج إثباتًا وتاريخًا ونتيجة ناجحة.`);
  }
  return { verifiedCameras, expectedCameras: handover.expectedCameras, issues, ready: issues.length === 0 };
}

const csvCell = (value: string) => {
  // Prevent spreadsheet formula injection in customer-managed inventory fields.
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function handoverCSV(data: ProjectHandover): string {
  const header = ["Camera ID","Area","Model","Serial","MAC","IP","Switch","Port","Video","Audio","PoE","Tested At","Notes"];
  const rows = data.inspections.map(r => [
    r.id,r.area,r.model,r.serial,r.mac,r.ip,r.switchId,r.port,r.video,r.audio,r.poe,r.testedAt,r.note,
  ]);
  return "\uFEFF" + [header,...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
