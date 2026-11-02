import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {SiteHeader} from "@/components/SiteHeader";
import {supabase} from "@/integrations/supabase/client";
type Item={id:string;name:string;quantity:number;unit_price:number;model?:string;sku?:string;image_url?:string};
type Invoice={number:string;order_id:string;date:string;customer_name:string;customer_phone:string;items:Item[];total:number;currency:string;payment_method:string;tax_id:string};
type Api={invoice?:Invoice;error?:string};
export const Route=createFileRoute("/invoice/$token")({
 head:()=>({meta:[{title:"فاتورة الشراء | AZ-CCTV"},{name:"robots",content:"noindex,nofollow"},{name:"referrer",content:"no-referrer"}]}),
 component:InvoicePage,
});
const money=(v:number)=>new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
function InvoicePage(){
 const {token:rawToken}=Route.useParams();
 // Compatibility for the already-approved Meta URL which contains an encoded literal {{1}} prefix.
 const token=rawToken.replace(/^(?:\{\{1\}\}|%7B%7B1%7D%7D)/i,"");
 const query=useQuery({queryKey:["az-invoice",token],retry:false,queryFn:async()=>{
  const {data,error}=await supabase.functions.invoke<Api>("az-invoice-public",{body:{token}});
  if(error||!data?.invoice)throw new Error(data?.error||"الفاتورة غير متاحة");
  return data.invoice;
 }});
 const invoice=query.data;
 return <div dir="rtl" className="min-h-screen bg-slate-100 text-[#101010]">
 <div className="no-print"><SiteHeader/><div className="mx-auto flex max-w-[1000px] items-center justify-between gap-3 p-4">
 <Link to="/store" className="font-bold text-[#030957]">العودة للمتجر</Link>
 {invoice&&<button onClick={()=>window.print()} type="button" className="rounded-lg bg-[#030957] px-5 py-3 font-bold text-white">طباعة / حفظ PDF</button>}
 </div></div>
 {query.isPending?<p className="p-12 text-center">جارٍ تحميل الفاتورة…</p>:query.isError?<p role="alert" className="p-12 text-center text-red-700">تعذر عرض الفاتورة: {query.error.message}</p>:invoice&&
 <article className="az-invoice mx-auto max-w-[210mm] bg-white shadow-lg">
 <header className="invoice-top flex items-start justify-between gap-5 px-10 pt-9 pb-7" dir="ltr">
 <div><strong className="text-4xl font-black tracking-tight">al-azab.co</strong><p className="mt-1 text-xs text-slate-500">AZ-CCTV / Alazab Construction</p></div>
 <div className="text-right"><h1 className="text-[55px] font-black leading-none">INVOICE</h1><p className="mt-2 font-bold tracking-[2px] text-slate-700">TAX: {invoice.tax_id}</p></div>
 </header>
 <div className="invoice-info grid grid-cols-2 gap-6 border-b-[6px] border-[#FFB900] bg-[#f3f3f3] px-10 py-5 text-sm" dir="ltr">
 <div className="space-y-2"><p><b>Date:</b> {new Date(invoice.date).toLocaleDateString("en-GB",{timeZone:"Africa/Cairo"})}</p><p><b>Invoice to:</b> {invoice.customer_name}</p><p><b>Phone Number:</b> {invoice.customer_phone}</p></div>
 <div className="space-y-2"><p><b>Payment to:</b> {invoice.payment_method}</p><p><b>Invoice Number:</b> {invoice.number}</p><p><b>Section:</b> CCTV Equipment</p></div>
 </div>
 <div className="px-9 pt-8 pb-10">
 <table className="invoice-table w-full table-fixed border-collapse text-center text-sm" dir="ltr">
 <thead><tr className="bg-[#030957] text-white"><th className="w-[16%]">Total</th><th className="w-[12%]">Price</th><th className="w-[9%]">Qu</th><th className="w-[30%]">Item</th><th className="w-[18%]">Code</th><th className="w-[15%]">Image</th></tr></thead>
 <tbody>{invoice.items.map((item,i)=><tr key={item.id+"-"+i}>
 <td>{money(Number(item.unit_price)*Number(item.quantity))}</td><td>{money(Number(item.unit_price))}</td><td>{item.quantity}</td>
 <td className="break-words">{item.name}</td><td className="break-words">{item.sku||item.model||item.id.slice(0,8)}</td>
 <td>{item.image_url?<img className="mx-auto h-24 w-24 object-contain" loading="eager" src={item.image_url} alt={item.name}/>:<span className="text-xs text-slate-400">AZ-CCTV</span>}</td>
 </tr>)}</tbody></table>
 <div className="invoice-summary mt-6 grid grid-cols-2 items-start gap-5" dir="ltr">
 <table className="w-full border-collapse text-sm"><tbody>
 <tr><th>Total</th><td>{money(Number(invoice.total))}</td></tr>
 <tr><th>Tax</th><td>Included where applicable</td></tr>
 <tr><th>Paid</th><td>{money(Number(invoice.total))}</td></tr>
 <tr className="bg-[#FFB900] font-black"><th>Final Total</th><td>{money(Number(invoice.total))} {invoice.currency}</td></tr>
 </tbody></table>
 <div className="border border-black bg-[#f3f3f3] p-3 text-xs leading-6"><strong className="text-sm">Rules and Instructions</strong>
 <p>The original invoice is retained in Daftra. Applicable warranty and return conditions are determined by the purchased product and current terms.</p></div></div>
 <div className="invoice-contact mt-9 border-t-2 border-[#030957] pt-4 text-center text-sm font-bold tracking-wider" dir="ltr">A8/500 St Maadi Cairo　 |　 sales@alazab.com　 |　 +201004006620</div>
 </div><div className="invoice-stripe flex h-6"><div className="w-1/2 bg-[#FFB900]"/><div className="w-1/2 bg-[#030957]"/></div>
 </article>}
 <style>{`
 .invoice-table th,.invoice-table td{border:1px solid #111;padding:12px 7px;}
 .invoice-table th{padding:15px 6px;font-weight:700}
 .invoice-table tbody tr{height:125px;break-inside:avoid;page-break-inside:avoid}
 .invoice-table thead{display:table-header-group}
 .invoice-summary tr{break-inside:avoid}
 .invoice-summary th,.invoice-summary td{border:1px solid #111;padding:8px;text-align:center}
 @page{size:A4;margin:0}
 @media print{
  body{background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .no-print{display:none!important}
  .az-invoice{width:210mm;max-width:none;box-shadow:none!important;margin:0!important}
  .invoice-info,.invoice-top,.invoice-summary,.invoice-contact,.invoice-stripe{break-inside:avoid;page-break-inside:avoid}
  .invoice-table{break-inside:auto}
 }
 `}</style></div>
}
