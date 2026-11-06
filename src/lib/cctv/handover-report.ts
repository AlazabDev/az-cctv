import type { HandoverData, HandoverReview } from "./handover";
const escapeHtml = (value: string | number) => String(value).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const safe = (value: string) => escapeHtml(value.trim() || "غير موثق");
const test = (result: string) => result === "pass" ? "ناجح" : result === "fail" ? "فاشل" : "لم يختبر";

/** Printable audit record. Never represents a draft as a signed acceptance certificate. */
export function handoverReportHtml(
  projectName: string,
  clientName: string,
  data: HandoverData,
  review: HandoverReview,
): string {
  const status = review.ready
    ? "مستوفٍ حسب البيانات المدخلة — يلزم مطابقة أصل محضر الاستلام"
    : "مسودة غير معتمدة — يمنع تقديمها كمحضر استلام نهائي";
  const checklist = review.findings.map((finding) =>
    `<tr><td>${escapeHtml(finding.label)}</td><td class="${finding.complete ? "passed" : "pending"}">${finding.complete ? "مستوفى" : "غير مستوفى"}</td><td>${escapeHtml(finding.detail)}</td></tr>`).join("");
  const cameras = data.cameras.map((camera) =>
    `<tr><td>${safe(camera.cameraId)}</td><td>${safe(camera.area)}</td><td>${safe(camera.model)}</td><td dir="ltr">${safe(camera.serialNumber)}</td><td dir="ltr">${safe(camera.macAddress)}</td><td dir="ltr">${safe(camera.ipAddress)}</td><td>${safe(camera.switchName)} / ${safe(camera.switchPort)}</td><td>${test(camera.video)}</td><td>${test(camera.audio)}</td><td>${test(camera.poe)}</td><td>${safe(camera.verifiedBy)}</td><td>${safe(camera.verifiedAt)}</td></tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>سجل فحص وتسليم - ${escapeHtml(projectName)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: "Arial", "Tahoma", sans-serif; color: #111e38; line-height: 1.5; margin: 0; font-size: 10px; }
header { display: flex; justify-content: space-between; border-bottom: 4px solid #FFB900; padding-bottom: 12px; margin-bottom: 16px; }
.brand { font-size: 23px; color: #030957; font-weight: 900; }
h1 { font-size: 19px; margin: 7px 0; }
h2 { font-size: 14px; margin: 19px 0 8px; }
.info { display: flex; gap: 16px; margin: 12px 0; }
.info > div { background: #f1f4f9; padding: 9px 12px; border-radius: 5px; flex: 1; }
.status { padding: 10px; border: 1px solid #030957; background: #fff5d6; font-weight: bold; }
table { border-collapse: collapse; width: 100%; margin: 9px 0 16px; table-layout: fixed; }
thead { display: table-header-group; }
th, td { border: 1px solid #c2cad9; padding: 5px; overflow-wrap: anywhere; vertical-align: top; }
th { background: #030957; color: white; }
tr { page-break-inside: avoid; }
.passed { color: #126231; font-weight: 800; }
.pending { color: #a12c27; font-weight: 800; }
.signatures { display: flex; gap: 50px; margin-top: 35px; }
.signatures > div { flex: 1; border-top: 1px solid #030957; padding-top: 10px; }
small { color: #5f6672; }
.toolbar { position: fixed; top: 5px; left: 10px; }
.toolbar button { background:#030957;color:white;padding:10px 20px; border:0; cursor:pointer; }
@media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">طباعة / حفظ PDF</button></div>
<header><div><div class="brand">ALAZAB CONSTRUCTION · AZ-CCTV</div><small>سجل فحص ميداني — لا يعد شهادة تسليم دون توقيع العميل</small></div>
<div><h1>مشروع: ${escapeHtml(projectName)}</h1><div>تاريخ استخراج التقرير: ${escapeHtml(new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" }))}</div></div></header>
<div class="info"><div><b>العميل:</b> ${escapeHtml(clientName)}</div><div><b>العدد المستهدف:</b> ${data.targetCameraCount} كاميرا</div>
<div><b>المتطلبات المستوفاة:</b> ${review.passed} من ${review.total}</div></div>
<p class="status">${escapeHtml(status)}</p>
<h2>أولًا — قائمة فحص متطلبات التسليم</h2>
<table><thead><tr><th style="width:23%">البند</th><th style="width:12%">الحالة</th><th>شرط الاعتماد</th></tr></thead><tbody>${checklist}</tbody></table>
<h2>ثانيًا — السجل الفعلي للكاميرات واختبارات التشغيل</h2>
<table><thead><tr><th>ID</th><th>الموقع</th><th>Model</th><th>Serial No</th><th>MAC</th><th>IP</th><th>Switch/Port</th><th>الصورة</th><th>الصوت</th><th>PoE</th><th>الفاحص</th><th>التاريخ</th></tr></thead><tbody>${cameras}</tbody></table>
<h2>ثالثًا — اعتماد الاستلام</h2>
<div><b>مرجع المحضر:</b> ${safe(data.acceptanceReference)}</div>
<p><small>يجب الاحتفاظ بالنسخة الموقعة ومخرجات الاختبارات ومطابقة هذا السجل فعليًا. هذه النسخة مولدة من بيانات الإدخال داخل التطبيق.</small></p>
<div class="signatures"><div>ممثل جهة التنفيذ<br/>الاسم / التوقيع / التاريخ</div><div>ممثل حضانة بدر<br/>الاسم / التوقيع / التاريخ</div></div>
</body></html>`;
}
