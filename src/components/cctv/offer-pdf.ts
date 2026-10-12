export interface OfferPdfLine {
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  amount: number;
}

export interface OfferPdfInput {
  companyName: string;
  preparedBy: string;
  projectName: string;
  clientName: string;
  currency: string;
  lines: OfferPdfLine[];
  fees: { label: string; amount: number }[];
  subtotal: number;
  globalDiscountPercent: number;
  globalDiscountValue: number;
  taxPercent: number;
  taxValue: number;
  total: number;
  cameras: number;
  storageTb: number;
  poeWatt: number;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Opens a print-ready, company-branded quotation in a new window. The browser's
 * "Save as PDF" produces the file, which keeps Arabic shaping and RTL correct
 * without bundling fonts into a JS PDF library.
 */
export function openOfferPdf(o: OfferPdfInput) {
  const money = (n: number) =>
    `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)} ${esc(o.currency)}`;
  const date = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const ref = `Q-${Date.now().toString(36).toUpperCase()}`;
  const rows = o.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td class="item">${esc(l.label)}</td><td>${l.qty}</td><td>${esc(l.unit)}</td><td>${money(l.unitPrice)}</td><td>${l.discountPercent}%</td><td>${money(l.amount)}</td></tr>`,
    )
    .join("");
  const fees = o.fees
    .filter((f) => f.amount > 0)
    .map((f) => `<tr><td class="item">${esc(f.label)}</td><td>${money(f.amount)}</td></tr>`)
    .join("");

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>عرض سعر - ${esc(o.projectName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet"/>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:Cairo,sans-serif;color:#1b2333;margin:0;font-size:12px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #0e7490;padding-bottom:12px;margin-bottom:18px}
.brand{font-size:24px;font-weight:800;color:#0e7490}
.muted{color:#5b6475}
h1{font-size:18px;margin:0}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;background:#f1f5f9;padding:12px;border-radius:6px;margin-bottom:16px}
.stats{display:flex;gap:10px;margin-bottom:16px}
.stats div{flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:8px;text-align:center}
.stats b{display:block;font-size:16px;color:#0e7490}
table{width:100%;border-collapse:collapse;margin-bottom:14px}
th{background:#0e7490;color:#fff;padding:7px;font-weight:600}
td{border-bottom:1px solid #e2e8f0;padding:6px;text-align:center}
td.item{text-align:right}
tr{page-break-inside:avoid}
.totals{width:50%;margin-right:auto}
.totals td{text-align:left}.totals td:first-child{text-align:right}
.grand td{font-size:15px;font-weight:800;background:#ecfeff;color:#0e7490}
.terms{margin-top:20px;font-size:11px}
.sign{display:flex;justify-content:space-between;margin-top:40px}
.sign div{width:40%;border-top:1px solid #94a3b8;padding-top:6px;text-align:center}
.bar{position:fixed;top:10px;left:10px}
.bar button{font-family:Cairo;padding:8px 16px;background:#0e7490;color:#fff;border:0;border-radius:6px;cursor:pointer}
@media print{.bar{display:none}}
</style></head><body>
<div class="bar"><button onclick="window.print()">حفظ كـ PDF</button></div>
<header><div><div class="brand">${esc(o.companyName)}</div><div class="muted">${esc(o.preparedBy)}</div></div>
<div style="text-align:left"><h1>عرض سعر نظام مراقبة</h1><div class="muted">${ref} — ${date}</div></div></header>
<div class="meta"><div><b>المشروع:</b> ${esc(o.projectName)}</div><div><b>العميل:</b> ${esc(o.clientName || "—")}</div>
<div><b>العملة:</b> ${esc(o.currency)}</div><div><b>صلاحية العرض:</b> 15 يوماً</div></div>
<div class="stats"><div>عدد الكاميرات<b>${o.cameras}</b></div><div>سعة التخزين<b>${o.storageTb.toFixed(1)} TB</b></div><div>حمل PoE<b>${o.poeWatt} W</b></div></div>
<table><thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>الوحدة</th><th>سعر الوحدة</th><th>خصم</th><th>الإجمالي</th></tr></thead><tbody>${rows || `<tr><td colspan="7">لا توجد بنود</td></tr>`}</tbody></table>
${fees ? `<table class="totals"><thead><tr><th>رسوم إضافية</th><th>المبلغ</th></tr></thead><tbody>${fees}</tbody></table>` : ""}
<table class="totals"><tbody>
<tr><td>الإجمالي الفرعي</td><td>${money(o.subtotal)}</td></tr>
<tr><td>خصم عام (${o.globalDiscountPercent}%)</td><td>- ${money(o.globalDiscountValue)}</td></tr>
<tr><td>الضريبة (${o.taxPercent}%)</td><td>${money(o.taxValue)}</td></tr>
<tr class="grand"><td>الإجمالي النهائي</td><td>${money(o.total)}</td></tr></tbody></table>
<div class="terms"><b>الشروط والأحكام:</b><ul>
<li>الأسعار سارية لمدة 15 يوماً من تاريخ العرض.</li>
<li>ضمان الأجهزة حسب ضمان الشركة المصنّعة.</li>
<li>أطوال الكابلات تقديرية وتشمل نسبة فاقد، ويتم الحساب النهائي حسب التنفيذ الفعلي.</li></ul></div>
<div class="sign"><div>توقيع واعتماد الشركة</div><div>توقيع العميل</div></div>
<script>document.fonts.ready.then(()=>setTimeout(()=>window.print(),300))</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
