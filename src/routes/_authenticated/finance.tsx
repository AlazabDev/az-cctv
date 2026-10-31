import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({ meta: [{ title: "المالية والتوريد | AZ-CCTV" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: FinancePage,
});
type Quote = { id: string; status: string; customer_name: string; company: string | null; currency: string; total: number; created_at: string; approval_reference?: string };
type Line = {id:string;product_name:string;quantity:number;unit_price:number};
type Document = {id:string;kind:string;supplier_source:string;daftra_id:string|null;daftra_number:string|null;status:string;last_error:string|null};
type Detail = {quotation:Quote;items:Line[];documents:Document[]};
async function finance<T>(body:Record<string,unknown>):Promise<T>{
  const {data,error}=await supabase.functions.invoke("az-finance",{body});
  if(error)throw error;
  if(data && typeof data==="object" && "error" in data)throw new Error(String(data.error));
  return data as T;
}
function FinancePage(){
  const qc=useQueryClient();
  const [selected,setSelected]=useState("");
  const [clientId,setClientId]=useState("");
  const [supplierId,setSupplierId]=useState("");
  const [supplier,setSupplier]=useState<"kimo"|"amazon">("kimo");
  const [approval,setApproval]=useState("");
  const [supplierCosts,setSupplierCosts]=useState<Record<string,string>>({});
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState("");
  const [errorText,setErrorText]=useState("");
  const [admin,setAdmin]=useState<boolean|null>(null);
  useEffect(()=>{let mounted=true;void supabase.auth.getUser().then(({data})=>{
    if(mounted)setAdmin(Boolean(data.user?.app_metadata?.role==="admin"||data.user?.app_metadata?.role==="super_admin"||data.user?.app_metadata?.is_admin===true));
  });return()=>{mounted=false};},[]);
  const listing=useQuery({queryKey:["finance-quotations"],queryFn:()=>finance<{quotations:Quote[]}>({action:"list_quotations"}),enabled:admin===true});
  const detail=useQuery({queryKey:["finance-quotation",selected],queryFn:()=>finance<Detail>({action:"quotation",quotation_id:selected}),enabled:admin===true&&Boolean(selected)});
  const lines=detail.data?.items??[];
  async function execute(action:"estimate"|"invoice"|"purchase_order"|"approve",send:"draft"|"direct"="draft"){
    if(!selected||pending)return;
    if(!window.confirm(action==="purchase_order"&&send==="direct"?"سيُطلب من دفترة إرسال أمر الشراء للمورد. هل تعتمد الإرسال؟":"هل تعتمد تنفيذ العملية في دفترة؟"))return;
    setPending(true);setNotice("");setErrorText("");
    try{
      let payload:Record<string,unknown>;
      if(action==="approve")payload={action:"approve_quotation",quotation_id:selected,approval_reference:approval};
      else{
        payload={action:"create_document",quotation_id:selected,kind:action,approval_reference:approval};
        if(action==="purchase_order"){
          const mapping=lines.map(l=>({quotation_item_id:l.id,supplier_unit_price:Number(supplierCosts[l.id])}));
          if(!Number.isSafeInteger(Number(supplierId))||Number(supplierId)<=0)throw new Error("اختر معرّف مورد دفترة الصحيح");
          if(lines.some(l=>!supplierCosts[l.id]?.trim()||!Number.isFinite(Number(supplierCosts[l.id]))||Number(supplierCosts[l.id])<0))throw new Error("أدخل تكلفة المورد الحقيقية لكل بند");
          Object.assign(payload,{supplier,supplier_id:Number(supplierId),send,lines:mapping});
        }else{
          if(!Number.isSafeInteger(Number(clientId))||Number(clientId)<=0)throw new Error("أدخل معرف العميل في دفترة");
          payload.client_id=Number(clientId);
        }
      }
      const result=await finance<Record<string,unknown>>(payload);
      setNotice(JSON.stringify(result));
      await Promise.all([qc.invalidateQueries({queryKey:["finance-quotations"]}),qc.invalidateQueries({queryKey:["finance-quotation",selected]})]);
    }catch(err){setErrorText(err instanceof Error?err.message:"تعذر تنفيذ العملية");}
    finally{setPending(false)}
  }
  return <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900"><SiteHeader/><main className="mx-auto max-w-6xl px-4 py-10">
    <Link to="/projects" className="text-sm font-bold text-[#030957]">العودة إلى المشاريع</Link>
    <h1 className="mt-6 text-3xl font-black text-[#030957]">المالية والتوريد — دفترة</h1>
    <p className="mt-3 text-sm text-slate-600">دفترة هو مصدر عروض الأسعار والفواتير وأوامر الشراء الرسمي. هذه الواجهة تنشئ المستندات وتحفظ مراجعها دون تكرار الحسابات.</p>
    {admin===null&&<p className="mt-6">جارٍ التحقق من الصلاحيات...</p>}
    {admin===false&&<p role="alert" className="mt-6 rounded-xl bg-amber-50 p-5">هذه الشاشة مخصصة لمسؤولي المالية المعتمدين.</p>}
    {admin===true&&<div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="font-black text-[#030957]">طلبات عروض الأسعار</h2>
        {listing.isLoading&&<p className="mt-3 text-sm">جارٍ تحميل الطلبات...</p>}
        {listing.error&&<p role="alert" className="mt-3 text-sm text-red-700">تعذر تحميل قائمة الطلبات.</p>}
        <div className="mt-4 space-y-2">{listing.data?.quotations.map(q=><button key={q.id} type="button" onClick={()=>{setSelected(q.id);setNotice("");setErrorText("");setSupplierCosts({})}} className={`w-full rounded-xl border p-3 text-right text-sm ${selected===q.id?"border-[#030957] bg-blue-50":"border-slate-200"}`}>
          <span className="block font-bold">{q.customer_name||q.company||"عميل"}</span><span className="block text-xs text-slate-500">{q.status} · {Number(q.total).toLocaleString("ar-EG")} {q.currency}</span>
        </button>)}</div>
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        {!selected?<p className="text-slate-500">اختر طلبًا لعرض البنود والمستندات المرتبطة.</p>:detail.isLoading?<p>جارٍ تحميل تفاصيل الطلب...</p>:detail.error?<p role="alert" className="text-red-700">تعذر تحميل تفاصيل الطلب.</p>:detail.data&&<>
          <h2 className="text-xl font-black text-[#030957]">{detail.data.quotation.customer_name}</h2>
          <p className="mt-2 break-all text-xs text-slate-500">{selected}</p>
          <div className="mt-5 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">المنتج</th><th className="p-2">الكمية</th><th className="p-2">سعر البيع</th><th className="p-2">تكلفة شراء الوحدة</th></tr></thead><tbody>{lines.map(line=><tr key={line.id} className="border-b"><td className="p-2">{line.product_name}</td><td className="p-2">{line.quantity}</td><td className="p-2">{line.unit_price}</td><td className="p-2"><input type="number" min="0" step="0.01" aria-label={`تكلفة ${line.product_name}`} className="w-28 rounded border p-2" value={supplierCosts[line.id]??""} onChange={e=>setSupplierCosts(p=>({...p,[line.id]:e.target.value}))}/></td></tr>)}</tbody></table></div>
          <h3 className="mt-6 font-bold">المستندات في دفترة</h3>
          <div className="mt-2 space-y-2">{detail.data.documents.length===0?<p className="text-sm text-slate-500">لا توجد مستندات منشأة بعد.</p>:detail.data.documents.map(doc=><div key={doc.id} className="rounded-xl border p-3 text-sm"><strong>{doc.kind} — {doc.supplier_source}</strong><span className="mr-3">{doc.status}</span><span className="block text-xs">{doc.daftra_number||doc.daftra_id||"بانتظار الربط"}</span>{doc.last_error&&<p className="text-xs text-red-700">{doc.last_error}</p>}</div>)}</div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">معرّف العميل في دفترة<input type="number" min="1" className="mt-2 w-full rounded-xl border p-3" value={clientId} onChange={e=>setClientId(e.target.value)}/></label>
            <label className="text-sm font-bold">معرّف المورد في دفترة<input type="number" min="1" className="mt-2 w-full rounded-xl border p-3" value={supplierId} onChange={e=>setSupplierId(e.target.value)}/></label>
            <label className="text-sm font-bold">المورد<select className="mt-2 w-full rounded-xl border p-3" value={supplier} onChange={e=>setSupplier(e.target.value as "kimo"|"amazon")}><option value="kimo">KimoStore</option><option value="amazon">Amazon</option></select></label>
            <label className="text-sm font-bold">مرجع الموافقة<input className="mt-2 w-full rounded-xl border p-3" value={approval} onChange={e=>setApproval(e.target.value)} placeholder="رقم الموافقة أو محضر الاعتماد"/></label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button disabled={pending} onClick={()=>void execute("estimate")} className="rounded-xl bg-[#030957] px-4 py-3 font-bold text-white disabled:opacity-50">إنشاء عرض سعر مسودة</button>
            <button disabled={pending} onClick={()=>void execute("approve")} className="rounded-xl bg-[#FFB900] px-4 py-3 font-bold text-[#030957] disabled:opacity-50">تسجيل قبول العرض</button>
            <button disabled={pending} onClick={()=>void execute("invoice")} className="rounded-xl border px-4 py-3 font-bold disabled:opacity-50">إنشاء فاتورة مسودة</button>
            <button disabled={pending} onClick={()=>void execute("purchase_order","draft")} className="rounded-xl border px-4 py-3 font-bold disabled:opacity-50">إنشاء أمر شراء مسودة</button>
            <button disabled={pending} onClick={()=>void execute("purchase_order","direct")} className="rounded-xl border border-amber-500 px-4 py-3 font-bold text-amber-800 disabled:opacity-50">إرسال أمر شراء عبر دفترة</button>
          </div>
          {notice&&<p role="status" className="mt-5 break-all rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">{notice}</p>}
          {errorText&&<p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errorText}</p>}
          <p className="mt-6 text-xs leading-6 text-slate-500">إرسال أمر الشراء من دفترة يعني محاولة إرساله إلى بيانات اتصال المورد المسجلة في دفترة؛ لا يعني تنفيذ شراء عبر Amazon Marketplace أو موقع كيمو. عمليات الدفع والشراء الخارجي تتطلب تكاملًا وصلاحيات منفصلة.</p>
        </>}
      </section>
    </div>}
  </main></div>
}
