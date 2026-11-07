import { useMemo, useState } from "react";
import { handoverReportHtml } from "@/lib/cctv/handover-report";
import type { PlacedDevice, ScaleCalibration } from "@/lib/cctv/types";
import type { TopologyData } from "@/lib/cctv/topology";
import {
  evaluateHandover,
  handoverCsv,
  type HandoverData,
  type CameraHandoverRecord,
  type Verification,
} from "@/lib/cctv/handover";

type Layout = {
  id: string;
  layoutName: string;
  floorplanPath?: string | null;
  planApproved?: boolean;
  pxPerMeter: number;
  scaleCalibration?: ScaleCalibration;
  devices: PlacedDevice[];
};
interface Props {
  data: HandoverData;
  projectName: string;
  clientName: string;
  layouts: Layout[];
  topology: Pick<TopologyData, "parents">;
  onChange: (next: HandoverData) => void;
  saveState: "idle" | "saving" | "saved" | "error";
  onSave: () => Promise<void>;
}
const checklist = [
  ["networkVerified", "تم فحص الشبكة الفعلية ومطابقة توصيلاتها"],
  ["cableTestsVerified", "تم تنفيذ وتوثيق اختبارات الكابلات"],
  [
    "recordingStatusDocumented",
    "تم توثيق حالة التسجيل الفعلية (بما في ذلك عدم وجود NVR إن كان مفصولًا)",
  ],
  ["asBuiltReviewed", "تمت مراجعة مخططات As-built وجدول الكميات ميدانيًا"],
  ["clientTrainingCompleted", "تم تدريب ممثل العميل وتوثيق ذلك"],
  ["clientAcceptanceSigned", "تم توقيع محضر استلام العميل"],
] as const;
const tests = ["pending", "pass", "fail"] as const;
export function HandoverWorkspace({
  data,
  projectName,
  clientName,
  layouts,
  topology,
  onChange,
  saveState,
  onSave,
}: Props) {
  const [opened, setOpened] = useState<string>("CAM-01");
  const review = useMemo(
    () =>
      evaluateHandover(
        data,
        layouts,
        topology,
        clientName === "حضانة بدر" || projectName.includes("حضانة بدر")
          ? "badr-four-switch"
          : undefined,
      ),
    [data, layouts, topology, clientName, projectName],
  );
  const placements = layouts.flatMap((layout) =>
    layout.devices
      .filter((device) => device.kind === "camera")
      .map((device) => ({ ...device, layoutName: layout.layoutName })),
  );
  const updateRow = (cameraId: string, patch: Partial<CameraHandoverRecord>) =>
    onChange({
      ...data,
      cameras: data.cameras.map((r) => (r.cameraId === cameraId ? { ...r, ...patch } : r)),
    });
  const exportRegister = () => {
    const csv = handoverCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "badr-nursery-camera-commissioning.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const printReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.alert("المتصفح منع فتح نافذة التقرير. اسمح بالنوافذ المنبثقة وحاول مرة أخرى.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(handoverReportHtml(projectName, clientName, data, review));
    printWindow.document.close();
  };
  const field = (record: CameraHandoverRecord, key: keyof CameraHandoverRecord, title: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700" key={key}>
      {title}
      <input
        value={record[key]}
        dir={key === "area" || key === "notes" ? "rtl" : "ltr"}
        onChange={(e) => updateRow(record.cameraId, { [key]: e.target.value })}
        className="min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        autoComplete="off"
      />
    </label>
  );
  return (
    <section dir="rtl" className="h-full overflow-auto bg-[#f5f7fb] p-4 text-[#030957] md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-xl bg-[#030957] p-5 text-white">
          <h2 className="text-xl font-black">سجل الفحص ومحضر جاهزية التسليم — حضانة بدر</h2>
          <p className="mt-2 text-sm text-slate-200">
            هذا السجل لا يثبت تركيب أي جهاز تلقائيًا. يجب مطابقة كل قيمة واختبار مع الموقع الفعلي.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              role="status"
              className={
                review.ready
                  ? "rounded-lg bg-emerald-700 px-3 py-2 font-bold"
                  : "rounded-lg bg-[#FFB900] px-3 py-2 font-bold text-[#030957]"
              }
            >
              {review.ready ? "مكتمل وفق السجل — يتطلب مراجعة توقيع المستند" : "غير جاهز للتسليم"}
            </span>
            <span className="text-sm">
              {review.passed} / {review.total} متطلبات مستوفاة
            </span>
            <span className="text-sm">الكاميرات المستهدفة: {data.targetCameraCount}</span>
            <span className="text-sm">
              {saveState === "saving"
                ? "جارٍ حفظ السجل"
                : saveState === "error"
                  ? "فشل الحفظ — لا تعتمد البيانات"
                  : saveState === "saved"
                    ? "تم حفظ التغييرات"
                    : "تعديلات غير مؤكدة الحفظ"}
            </span>
          </div>
        </header>
        <div className="grid gap-3 lg:grid-cols-2">
          {review.findings.map((finding) => (
            <div key={finding.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex gap-2 font-bold">
                <span aria-label={finding.complete ? "مكتمل" : "غير مكتمل"}>
                  {finding.complete ? "✓" : "○"}
                </span>
                {finding.label}
              </div>
              <p className="mt-1 text-xs text-slate-600">{finding.detail}</p>
            </div>
          ))}
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-black">سجل الكاميرات — {data.cameras.length} خانة تحقق</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold"
                onClick={exportRegister}
              >
                تصدير سجل CSV
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold"
                onClick={printReport}
              >
                تقرير فحص للطباعة / PDF
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#030957] px-4 py-2 text-sm font-bold text-white"
                onClick={() => void onSave()}
              >
                حفظ السجل
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {data.cameras.map((record) => {
              const expanded = opened === record.cameraId;
              const complete =
                record.video === "pass" && record.audio === "pass" && record.poe === "pass";
              return (
                <div
                  key={record.cameraId}
                  className="overflow-hidden rounded-lg border border-slate-200"
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpened(expanded ? "" : record.cameraId)}
                    className="flex w-full items-center justify-between gap-3 bg-slate-50 p-3 text-right"
                  >
                    <span className="font-bold">
                      {record.cameraId} · {record.model || "الموديل غير موثق"} ·{" "}
                      {record.area || "الموقع غير موثق"}
                    </span>
                    <span className="text-xs">
                      {complete ? "الاختبارات ناجحة" : "الاختبارات غير مكتملة"}
                    </span>
                  </button>
                  {expanded && (
                    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="flex flex-col gap-1 text-xs font-semibold">
                        الكاميرا على المخطط
                        <select
                          className="rounded-md border border-slate-300 bg-white p-2 text-sm"
                          value={record.placedDeviceId}
                          onChange={(e) =>
                            updateRow(record.cameraId, { placedDeviceId: e.target.value })
                          }
                        >
                          <option value="">لم يتم الربط بعد</option>
                          {placements.map((place) => (
                            <option value={place.id} key={place.id}>
                              {place.name} — {place.layoutName}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field(record, "area", "المنطقة / الغرفة")}
                      {field(record, "model", "Model (من ملصق الجهاز)")}
                      {field(record, "serialNumber", "Serial No")}
                      {field(record, "macAddress", "MAC Address")}
                      {field(record, "ipAddress", "IP Address")}
                      {field(record, "switchName", "اسم السويتش")}
                      {field(record, "switchPort", "رقم المنفذ")}
                      {field(record, "verifiedBy", "اسم الفني القائم بالفحص")}
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                        تاريخ الفحص
                        <input
                          type="date"
                          value={record.verifiedAt}
                          max={new Intl.DateTimeFormat("sv-SE", {
                            timeZone: "Africa/Cairo",
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          }).format(new Date())}
                          onChange={(e) =>
                            updateRow(record.cameraId, { verifiedAt: e.target.value })
                          }
                          className="rounded-md border border-slate-300 bg-white p-2 text-sm"
                        />
                      </label>
                      {(["video", "audio", "poe"] as const).map((key) => (
                        <label key={key} className="flex flex-col gap-1 text-xs font-semibold">
                          {key === "video"
                            ? "اختبار الصورة"
                            : key === "audio"
                              ? "اختبار الصوت"
                              : "اختبار PoE"}
                          <select
                            className="rounded-md border border-slate-300 bg-white p-2 text-sm"
                            value={record[key]}
                            onChange={(e) =>
                              updateRow(record.cameraId, { [key]: e.target.value as Verification })
                            }
                          >
                            {tests.map((t) => (
                              <option value={t} key={t}>
                                {t === "pass"
                                  ? "PASS — ناجح"
                                  : t === "fail"
                                    ? "FAIL — فشل"
                                    : "لم يختبر"}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <div className="sm:col-span-2 lg:col-span-4">
                        {field(record, "notes", "ملاحظات الفحص / النواقص")}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-black">التصديقات النهائية — لا تفعّل إلا بعد إتمام الفحص فعليًا</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {checklist.map(([key, label]) => (
              <label className="flex gap-2 text-sm" key={key}>
                <input
                  type="checkbox"
                  checked={data[key]}
                  onChange={(e) => onChange({ ...data, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <label className="mt-5 block text-sm font-bold">
            رقم محضر الاستلام الموقع أو مرجعه
            <input
              className="mt-2 block w-full rounded-md border border-slate-300 p-2"
              value={data.acceptanceReference}
              onChange={(e) => onChange({ ...data, acceptanceReference: e.target.value })}
              placeholder="يُسجل بعد توقيع العميل فقط"
            />
          </label>
          <p className="mt-3 text-xs text-slate-500">
            حالة الجاهزية تُحسب آليًا من السجل، ولا تغني عن المطابقة الميدانية أو المستند الموقع.
          </p>
        </section>
      </div>
    </section>
  );
}
