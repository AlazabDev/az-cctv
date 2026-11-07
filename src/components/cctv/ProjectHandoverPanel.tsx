import { useMemo } from "react";
import { openHandoverPrint } from "@/lib/cctv/handover-report";
import { AlertTriangle, CheckCircle2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HANDOVER_CHECKS,
  evaluateHandover,
  handoverCSV,
  type CameraInspection,
  type HandoverCheckId,
  type InspectionResult,
  type ProjectHandover,
} from "@/lib/cctv/handover";

type Props = {
  data: ProjectHandover;
  onChange: (next: ProjectHandover) => void;
  onClose: () => void;
  projectName: string;
  clientName: string;
  placedCameras: Array<{ id: string; name: string; model: string; layoutName: string }>;
  layoutCount: number;
  topologyErrorCount: number;
};

const testChoices: Array<{ value: InspectionResult; label: string }> = [
  { value: "pending", label: "لم يُختبر" },
  { value: "pass", label: "نجح" },
  { value: "fail", label: "فشل" },
  { value: "not_applicable", label: "غير مدعوم" },
];

const cameraFields: Array<{ key: keyof CameraInspection; title: string }> = [
  { key: "area", title: "الموقع" },
  { key: "model", title: "الموديل الفعلي" },
  { key: "serial", title: "Serial" },
  { key: "mac", title: "MAC" },
  { key: "ip", title: "IP" },
  { key: "switchId", title: "السويتش" },
  { key: "port", title: "المنفذ" },
];

export function ProjectHandoverPanel({
  data,
  onChange,
  onClose,
  projectName,
  clientName,
  placedCameras,
  layoutCount,
  topologyErrorCount,
}: Props) {
  const report = useMemo(
    () => evaluateHandover(data, placedCameras, topologyErrorCount, layoutCount),
    [data, placedCameras, topologyErrorCount, layoutCount],
  );
  function updateCamera(id: string, patch: Partial<CameraInspection>) {
    onChange({
      ...data,
      inspections: data.inspections.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  }
  function updateCheck(
    id: HandoverCheckId,
    patch: Partial<NonNullable<ProjectHandover["checks"][HandoverCheckId]>>,
  ) {
    const current = data.checks[id] ?? { result: "pending", evidence: "", checkedAt: "" };
    onChange({ ...data, checks: { ...data.checks, [id]: { ...current, ...patch } } });
  }
  function printReport() {
    if (!openHandoverPrint(projectName, clientName, data, report)) {
      window.alert("تعذر فتح التقرير. اسمح بالنوافذ المنبثقة للموقع ثم أعد المحاولة.");
    }
  }
  function exportInventory() {
    const content = handoverCSV(data);
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "badr-nursery-camera-inventory.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      dir="rtl"
      aria-label="ملف تسليم العميل"
      className="min-h-0 flex-1 overflow-y-auto bg-[#f6f8fc] p-4 text-slate-900 md:p-6"
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-[#030957] p-5 text-white">
          <div>
            <p className="text-xs font-bold text-[#FFB900]">CLIENT HANDOVER · ENGINEERING QA</p>
            <h2 className="mt-1 text-xl font-black">ملف الفحص والتسليم — {projectName}</h2>
            <p className="mt-2 text-xs text-white/75">
              هذا سجل فحص داخلي. عدد الأجهزة المستهدف ليس دليلًا على تركيبها، ولا يُعد الملف محضر
              استلام نهائيًا دون الإثبات والتوقيع.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={printReport}>
              <Download className="ml-2 h-4 w-4" />{" "}
              {report.ready ? "تقرير التسليم PDF" : "تقرير الفحص — مسودة"}
            </Button>
            <Button type="button" variant="secondary" onClick={exportInventory}>
              <Download className="ml-2 h-4 w-4" /> CSV سجل الكاميرات
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              aria-label="العودة إلى المحرر"
              className="bg-white text-[#030957]"
            >
              <X className="ml-2 h-4 w-4" /> العودة للمحرر
            </Button>
          </div>
        </header>
        <div role="status" className="grid gap-3 sm:grid-cols-3">
          <Metric
            title="كاميرات محددة على المخطط"
            value={`${placedCameras.length} / ${data.expectedCameras}`}
          />
          <Metric
            title="كاميرات مكتملة الفحص"
            value={`${report.verifiedCameras} / ${report.expectedCameras}`}
          />
          <Metric title="حالة جاهزية التسليم" value={report.ready ? "اجتاز الفحص" : "غير مكتمل"} />
        </div>
        {!report.ready && (
          <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <h3 className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle className="h-5 w-5" /> معوقات الاعتماد ({report.issues.length})
            </h3>
            <ul className="mt-3 max-h-40 list-disc space-y-1 overflow-auto pr-5 text-sm text-amber-950">
              {report.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {report.ready && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <CheckCircle2 className="h-5 w-5" /> اكتملت أدلة هذا السجل المدخلة. راجع المستندات
            الأصلية وتوقيع العميل قبل الإصدار الخارجي.
          </div>
        )}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b p-4">
            <h3 className="text-lg font-black">سجل الكاميرات الفعلي</h3>
            <p className="mt-1 text-xs text-slate-500">
              سجّل Serial وMAC وIP والموقع بعد الفحص المباشر. كل خانة CAM-xx مجرد رقم تتبع مبدئي.
            </p>
          </div>
          <div className="max-h-[660px] overflow-auto">
            <table className="min-w-[1650px] w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800">
                <tr>
                  <th className="p-2 text-right">ID</th>
                  <th className="p-2 text-right">الجهاز على المخطط</th>
                  {cameraFields.map((field) => (
                    <th key={field.key} className="p-2 text-right">
                      {field.title}
                    </th>
                  ))}
                  <th className="p-2">فيديو</th>
                  <th className="p-2">صوت</th>
                  <th className="p-2">PoE</th>
                  <th className="p-2">تاريخ الفحص</th>
                  <th className="p-2 text-right">ملاحظات / سبب الاستثناء</th>
                </tr>
              </thead>
              <tbody>
                {data.inspections.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <th className="whitespace-nowrap p-2 text-right font-black">{row.id}</th>
                    <td className="p-1">
                      <select
                        aria-label={`${row.id} الجهاز على المخطط`}
                        className="h-9 min-w-48 rounded border bg-white px-2 text-xs"
                        value={row.designDeviceId}
                        onChange={(e) => updateCamera(row.id, { designDeviceId: e.target.value })}
                      >
                        <option value="">اختر الكاميرا المركبة في الرسم</option>
                        {placedCameras.map((camera) => (
                          <option value={camera.id} key={camera.id}>
                            {camera.layoutName} · {camera.name} · {camera.model || "غير موثق"} (
                            {camera.id.slice(0, 8)})
                          </option>
                        ))}
                      </select>
                    </td>
                    {cameraFields.map((field) => (
                      <td className="p-1" key={field.key}>
                        <Input
                          aria-label={`${row.id} ${field.title}`}
                          dir="ltr"
                          className="h-9 min-w-28 text-xs"
                          value={row[field.key]}
                          onChange={(e) => updateCamera(row.id, { [field.key]: e.target.value })}
                        />
                      </td>
                    ))}
                    {(["video", "audio", "poe"] as const).map((field) => (
                      <td key={field} className="p-1">
                        <select
                          aria-label={`${row.id} ${field}`}
                          className="h-9 min-w-24 rounded border bg-white px-1"
                          value={row[field]}
                          onChange={(e) =>
                            updateCamera(row.id, { [field]: e.target.value as InspectionResult })
                          }
                        >
                          {testChoices
                            .filter(
                              (choice) => field === "audio" || choice.value !== "not_applicable",
                            )
                            .map((choice) => (
                              <option value={choice.value} key={choice.value}>
                                {choice.label}
                              </option>
                            ))}
                        </select>
                      </td>
                    ))}
                    <td className="p-1">
                      <Input
                        type="date"
                        aria-label={`${row.id} تاريخ الفحص`}
                        className="h-9 min-w-36"
                        value={row.testedAt}
                        onChange={(e) => updateCamera(row.id, { testedAt: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        aria-label={`${row.id} ملاحظات`}
                        className="h-9 min-w-48 text-xs"
                        value={row.note}
                        onChange={(e) => updateCamera(row.id, { note: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-4">
            <h3 className="text-lg font-black">اختبارات التسليم والاعتماد</h3>
            <p className="mt-1 text-xs text-slate-500">
              لا يكفي اختيار «نجح» دون مرجع إثبات قابل للمراجعة وتاريخ فحص.
            </p>
          </div>
          <div className="divide-y">
            {HANDOVER_CHECKS.map((check) => {
              const value = data.checks[check.id] ?? {
                result: "pending",
                evidence: "",
                checkedAt: "",
              };
              return (
                <div
                  key={check.id}
                  className="grid gap-3 p-4 md:grid-cols-[minmax(260px,1.4fr)_130px_minmax(220px,1fr)_165px] md:items-center"
                >
                  <label className="font-semibold text-sm">{check.title}</label>
                  <select
                    aria-label={`حالة ${check.title}`}
                    className="h-10 rounded border bg-white px-2 text-sm"
                    value={value.result}
                    onChange={(e) =>
                      updateCheck(check.id, {
                        result: e.target.value as "pending" | "pass" | "fail",
                      })
                    }
                  >
                    <option value="pending">لم يُتحقق</option>
                    <option value="pass">تم التحقق</option>
                    <option value="fail">غير مطابق</option>
                  </select>
                  <Input
                    aria-label={`مرجع إثبات ${check.title}`}
                    placeholder="مرجع تقرير / محضر / مرفق"
                    value={value.evidence}
                    onChange={(e) => updateCheck(check.id, { evidence: e.target.value })}
                  />
                  <Input
                    type="date"
                    aria-label={`تاريخ ${check.title}`}
                    value={value.checkedAt}
                    onChange={(e) => updateCheck(check.id, { checkedAt: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </section>
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          تُحفظ التعديلات مع المشروع عبر آلية الحفظ التلقائي في المحرر. يجب التحقق من ظهور «تم
          الحفظ» قبل الخروج. لا يحفظ هذا السجل تسجيل فيديو أو صور إثبات، وإنما مراجعها فقط.
        </p>
      </div>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <div className="mt-2 text-xl font-black text-[#030957]">{value}</div>
    </div>
  );
}
