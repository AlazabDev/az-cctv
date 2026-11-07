import {
  HANDOVER_CHECKS,
  type ProjectHandover,
  type ReadinessReport,
} from "./handover";

const escapeHtml = (input: string | number) =>
  String(input).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

const statusName = (status: string) => ({
  pass: "ناجح",
  fail: "غير مطابق",
  pending: "لم يُختبر",
  not_applicable: "غير مدعوم — راجع التبرير",
}[status] ?? "غير موثق");

/**
 * A4-landscape print layout with no claimed approval or fabricated equipment.
 * The user can print or "Save as PDF" through their browser.
 */
export function renderHandoverReport(
  projectName: string,
  clientName: string,
  data: ProjectHandover,
  report: ReadinessReport,
): string {
  const draft = !report.ready;
  const identityRows = data.inspections.map((r) =>
    `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.area)}</td><td>${escapeHtml(r.model)}</td><td dir="ltr">${escapeHtml(r.serial)}</td><td dir="ltr">${escapeHtml(r.mac)}</td><td dir="ltr">${escapeHtml(r.ip)}</td><td>${escapeHtml(r.switchId)}</td><td>${escapeHtml(r.port)}</td></tr>`,
  ).join("");
  const testRows = data.inspections.map((r) =>
    `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(statusName(r.video))}</td><td>${escapeHtml(statusName(r.audio))}</td><td>${escapeHtml(statusName(r.poe))}</td><td>${escapeHtml(r.testedAt)}</td><td>${escapeHtml(r.note)}</td></tr>`,
  ).join("");
  const checks = HANDOVER_CHECKS.map((c) => {
    const check = data.checks[c.id] ?? { result: "pending", evidence: "", checkedAt: "" };
    return `<tr><td>${escapeHtml(c.title)}</td><td>${escapeHtml(statusName(check.result))}</td><td>${escapeHtml(check.evidence)}</td><td>${escapeHtml(check.checkedAt)}</td></tr>`;
  }).join("");
  const blockers = report.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  const date = new Date().toISOString().slice(0, 10);
  const label = draft ? "مسودة غير معتمدة" : "مستوفٍ للشروط المدخلة — يتطلب مراجعة أدلة المصدر";
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تقرير الفحص والتسليم — ${escapeHtml(projectName)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box}
body{margin:0;color:#14203f;background:#f3f6fb;font:12px/1.6 Tahoma,Arial,sans-serif}
.page{max-width:1200px;margin:15px auto;background:#fff;padding:25px;box-shadow:0 7px 32px #0001}
header{display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid #ffb900;padding-bottom:14px}
.brand{font-size:25px;font-weight:900;color:#030957}
.status{border:1px solid #d8e1ef;padding:8px 12px;font-weight:800;background:#f6f8fc;color:#030957}
.draft{background:#fff0ee;color:#a62316;border-color:#f1b5ab}
h1{font-size:22px;color:#030957;margin:16px 0 5px}
h2{font-size:15px;color:#030957;border-right:4px solid #ffb900;padding-right:9px;margin:21px 0 10px}
.sub{color:#5e6d84;font-size:12px}
.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:15px 0}
.meta div{padding:11px;background:#f4f7fc;border:1px solid #dee5f0}
.meta strong{display:block;font-size:17px;color:#030957}
table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10px}
thead{display:table-header-group}th{color:#fff;background:#030957;padding:7px;text-align:right}
td{border:1px solid #dbe2ef;padding:6px 5px;overflow-wrap:anywhere;vertical-align:top}
tr{break-inside:avoid}tbody tr:nth-child(even){background:#f7f9fd}
li{margin:2px 0}.problems{border:1px solid #e7b8ae;background:#fff5f1;padding:10px 17px}
.hint{color:#5e6d84;font-size:11px}
footer{border-top:1px solid #c5cfe1;margin-top:25px;padding-top:9px;color:#637085;font-size:10px}
.printbar{position:sticky;top:0;background:#030957;color:white;padding:10px;text-align:center}
.printbar button{border:0;border-radius:5px;background:#ffb900;color:#030957;font-weight:800;padding:9px 16px;cursor:pointer}
@media print{body{background:white}.page{box-shadow:none;margin:0;padding:0;max-width:none}.printbar{display:none}.pageBreak{break-before:page}}
</style></head>
<body><div class="printbar"><button onclick="window.print()">طباعة أو حفظ PDF</button></div>
<div class="page">
<header><div class="brand">AZ-CCTV <span style="font-size:12px;color:#ffb900">ENGINEERING HANDOVER</span></div><span class="status ${draft ? "draft" : ""}">${escapeHtml(label)}</span></header>
<h1>تقرير فحص وتسليم نظام المراقبة</h1>
<p class="sub">سجل مستخرج من بيانات المشروع — لا يمثل شهادة فحص مستقلة ولا يثبت وجود أجهزة دون مستندات مصدر.</p>
<div class="meta"><div>المشروع<strong>${escapeHtml(projectName)}</strong></div><div>العميل<strong>${escapeHtml(clientName || "غير محدد")}</strong></div><div>تاريخ إصدار التقرير<strong>${escapeHtml(date)}</strong></div>
<div>كاميرات المشروع المطلوبة<strong>${data.expectedCameras}</strong></div><div>كاميرات اجتازت التحقق المسجل<strong>${report.verifiedCameras}</strong></div><div>معوقات الاستلام<strong>${report.issues.length}</strong></div></div>
${draft ? `<section class="problems"><h2>معوقات الاستلام — لا يجوز تقديم هذه المسودة كاعتماد نهائي</h2><ol>${blockers}</ol></section>` : "<p class='hint'>المعلومات مستوفية للشروط المسجلة. يجب مراجعة أدلة الاختبارات الأصلية والتوقيع قبل التسليم.</p>"}
<h2>1. سجل تعريف الأجهزة — من واقع بيانات الفحص</h2>
<table><thead><tr><th>ID</th><th>الموقع</th><th>الموديل</th><th>Serial</th><th>MAC</th><th>IP</th><th>Switch</th><th>Port</th></tr></thead><tbody>${identityRows}</tbody></table>
<div class="pageBreak"></div>
<h2>2. سجل اختبار الوظائف</h2>
<table><thead><tr><th>ID</th><th>الصورة</th><th>الصوت</th><th>PoE</th><th>تاريخ الاختبار</th><th>ملاحظات واستثناءات</th></tr></thead><tbody>${testRows}</tbody></table>
<h2>3. اعتماد عناصر التسليم</h2>
<table><thead><tr><th>البند</th><th>الحالة</th><th>مرجع الدليل</th><th>التاريخ</th></tr></thead><tbody>${checks}</tbody></table>
<footer>AZ-CCTV | تقرير إلكتروني مستخرج من سجل العميل. لا تُستبدل مستندات الفحص الفعلية والتوقيعات المادية بهذه النسخة.</footer>
</div></body></html>`;
}

export function openHandoverPrint(
  projectName: string,
  clientName: string,
  data: ProjectHandover,
  report: ReadinessReport,
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(renderHandoverReport(projectName, clientName, data, report));
  w.document.close();
  return true;
}
