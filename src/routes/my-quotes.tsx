import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileText, PackageSearch, ReceiptText, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { formatMoney } from "@/lib/cctv/geometry";

export const Route=createFileRoute("/my-quotes")({
  head:()=>({meta:[{title:"طلبات عروض الأسعار | AZ-CCTV"},{name:"robots",content:"noindex,nofollow"}]}),
  component:MyQuotes,
});
type Quote={id:string;status:string;customer_name:string;currency:string;total:number;created_at:string;approval_reference:string|null};
type Item={id:string;quotation_id:string;product_name:string;sku:string|null;quantity:number;unit_price:number|null};
type Document={id:string;quotation_id:string;kind:string;daftra_id:string|null;daftra_number:string|null;status:string;supplier_source:string};
const statusNames:Record<string,string>={
  draft:"مسودة",submitted:"تم استلام الطلب",reviewing:"قيد المراجعة",quoted:"أُعد عرض السعر",
  accepted:"معتمد",rejected:"مرفوض",expired:"انتهت الصلاحية"
};
const docNames:Record<string,string>={estimate:"عرض سعر دفترة",invoice:"فاتورة دفترة",purchase_order:"أمر شراء مورد"};
function MyQuotes(){
  const [userId,setUserId]=useState<string|null|undefined>(undefined);
  const [selected,setSelected]=useState("");
  useEffect(()=>{let current=true;void supabase.auth.getUser().then(({data,error})=>{
    if(current)setUserId(error?null:(data.user?.id??null));
  });const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
    if(current)setUserId(session?.user?.id??null);
  });return()=>{current=false;listener.subscription.unsubscribe()};},[]);
  const quotes=useQuery({
    queryKey:["my-store-quotations",userId],
    enabled:!!userId,
    queryFn:async()=>{
      const {data,error}=await supabase.from("store_quotations")
        .select("id,status,customer_name,currency,total,created_at,approval_reference")
        .eq("user_id",userId!).order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return data as Quote[];
    }
  });
  const items=useQuery({
    queryKey:["my-store-quotation-items",selected],
    enabled:!!userId&&!!selected,
    queryFn:async()=>{
      const {data,error}=await supabase.from("store_quotation_items")
        .select("id,quotation_id,product_name,sku,quantity,unit_price")
        .eq("quotation_id",selected).order("id");
      if(error)throw error;
      return data as Item[];
    }
  });
  const docs=useQuery({
    queryKey:["my-store-quotation-docs",selected],
    enabled:!!userId&&!!selected,
    queryFn:async()=>{
      const {data,error}=await supabase.from("store_daftra_documents")
        .select("id,quotation_id,kind,daftra_id,daftra_number,status,supplier_source")
        .eq("quotation_id",selected).eq("status","confirmed").order("created_at");
      if(error)throw error;
      return data as Document[];
    }
  });
  const selectedQuote=quotes.data?.find(q=>q.id===selected);
  return <div dir="rtl" className="min-h-screen bg-[#F6F8FC] text-slate-900">
    <SiteHeader/>
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Link to="/store" className="inline-flex items-center gap-2 text-sm font-bold text-[#030957]"><ArrowRight size={16}/> المتجر</Link>
      <div className="mt-6"><span className="text-xs font-black tracking-wider text-slate-500">CUSTOMER PORTAL</span>
      <h1 className="mt-2 text-3xl font-black text-[#030957]">طلباتي وعروض الأسعار</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">تابع طلباتك والمستندات المسجلة في دفترة. إنشاء الطلب لا يعني تأكيد الشراء أو تحصيل دفعة.</p></div>
      {userId===undefined?<p className="mt-8">جارٍ التحقق من الحساب…</p>:
      userId===null?<div className="mt-8 rounded-2xl border bg-white p-8">
        <p>سجّل دخولك لمشاهدة طلباتك الخاصة.</p><Link to="/auth" className="mt-4 inline-block rounded-xl bg-[#FFB900] px-5 py-3 font-bold text-[#030957]">تسجيل الدخول</Link>
      </div>:<div className="mt-8 grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm" aria-label="قائمة الطلبات">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-[#030957]">طلبات عروض الأسعار</h2>
            <button type="button" onClick={()=>void quotes.refetch()} className="text-xs font-bold text-[#030957] underline">تحديث</button>
          </div>
          {quotes.isLoading&&<p className="mt-5 text-sm">جارٍ تحميل الطلبات…</p>}
          {quotes.error&&<p role="alert" className="mt-5 text-sm text-red-700">تعذّر تحميل الطلبات. يرجى إعادة المحاولة.</p>}
          {quotes.data?.length===0&&<div className="mt-7 text-center text-sm text-slate-500"><PackageSearch className="mx-auto mb-3" size={35}/>لا توجد طلبات بعد.<Link to="/store" className="mt-3 block font-bold text-[#030957] underline">تصفح المنتجات</Link></div>}
          <div className="mt-4 space-y-2">{quotes.data?.map(q=><button key={q.id} type="button" onClick={()=>setSelected(q.id)}
            className={`w-full rounded-xl border p-4 text-right transition ${selected===q.id?"border-[#030957] bg-blue-50":"border-slate-200 hover:border-slate-400"}`}>
              <span className="block font-bold text-[#030957]">{statusNames[q.status]??q.status}</span>
              <span className="mt-1 block text-sm">{formatMoney(Number(q.total),q.currency||"EGP")}</span>
              <span className="mt-1 block text-xs text-slate-500">{new Date(q.created_at).toLocaleDateString("ar-EG")}</span>
            </button>)}</div>
        </section>
        <section className="min-w-0 rounded-2xl border bg-white p-6 shadow-sm">
          {!selectedQuote?<p className="text-sm text-slate-500">حدد أحد طلباتك لعرض التفاصيل.</p>:<>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#030957]">تفاصيل طلب العرض</h2>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold">{statusNames[selectedQuote.status]??selectedQuote.status}</span>
            </div>
            <p className="mt-3 break-all font-mono text-xs text-slate-500">{selectedQuote.id}</p>
            <p className="mt-3 text-sm">العميل: {selectedQuote.customer_name}</p>
            {selectedQuote.approval_reference&&<p className="mt-2 text-sm">مرجع الموافقة: {selectedQuote.approval_reference}</p>}
            <h3 className="mt-7 flex items-center gap-2 font-bold text-[#030957]"><PackageSearch size={19}/> المنتجات</h3>
            {items.isLoading&&<p className="mt-3 text-sm">جارٍ تحميل البنود…</p>}
            {items.error&&<p role="alert" className="mt-3 text-sm text-red-700">تعذر تحميل البنود.</p>}
            <div className="mt-3 divide-y rounded-xl border">{items.data?.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0"><strong>{i.product_name}</strong>{i.sku&&<span dir="ltr" className="mt-1 block text-xs text-slate-500">{i.sku}</span>}</div>
              <div className="text-left"><span className="block">الكمية: {i.quantity}</span><span className="text-xs text-slate-500">{i.unit_price==null?"سعر قيد التأكيد":formatMoney(Number(i.unit_price),selectedQuote.currency)}</span></div>
            </div>)}</div>
            <h3 className="mt-7 flex items-center gap-2 font-bold text-[#030957]"><FileText size={19}/> مستندات دفترة</h3>
            {docs.isLoading&&<p className="mt-3 text-sm">جارٍ تحميل المستندات…</p>}
            {docs.error&&<p role="alert" className="mt-3 text-sm text-red-700">تعذر تحميل المستندات.</p>}
            {docs.data?.length===0&&<p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">لم يصدر مستند مؤكد بعد. سيتم إظهار رقمه بعد تسجيله من الإدارة.</p>}
            <div className="mt-3 space-y-2">{docs.data?.map(d=><div key={d.id} className="flex items-center gap-3 rounded-xl border p-4 text-sm">
              <ReceiptText size={20} className="text-[#030957]"/>
              <div><strong>{docNames[d.kind]??d.kind}</strong><span className="mt-1 block text-xs text-slate-600">رقم المستند: {d.daftra_number??d.daftra_id??"غير متاح"}</span></div>
            </div>)}</div>
            <p className="mt-7 text-xs leading-6 text-slate-500">هذه أرقام مرجعية للمستندات الرسمية داخل دفترة؛ لا تُنشئ هذه الصفحة فواتير مستقلة أو تسجّل مدفوعات.</p>
          </>}
        </section>
      </div>}
    </main>
  </div>;
}
