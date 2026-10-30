import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect,useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, Send } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useStoreCart } from "@/hooks/use-store-cart";
import { supabase } from "@/integrations/supabase/client";
import { trackStoreEvent } from "@/lib/store/catalog";

export const Route=createFileRoute("/quote")({head:()=>({meta:[{title:"طلب عرض سعر معدات المراقبة | AZ-CCTV"},{name:"robots",content:"noindex,nofollow"}]}),component:QuotePage});
function QuotePage(){
 const {items,clear}=useStoreCart();
 const [signedIn,setSignedIn]=useState<boolean|null>(null);
 const [name,setName]=useState("");const [phone,setPhone]=useState("");const [email,setEmail]=useState("");
 const [company,setCompany]=useState("");const [notes,setNotes]=useState("");
 const [sending,setSending]=useState(false);const [error,setError]=useState("");
 const [quoteId,setQuoteId]=useState("");
 useEffect(()=>{
  let active=true;
  void supabase.auth.getUser().then(({data})=>{if(active){setSignedIn(Boolean(data.user));if(data.user?.email)setEmail(data.user.email)}});
  return()=>{active=false};
 },[]);
 const {data:validProducts=[],error:loadError,isLoading}=useQuery({
  queryKey:["quote-products",items.map(x=>x.id).join(",")],
  queryFn:async()=>{
   if(!items.length)return [];
   const {data,error}=await supabase.from("products").select("id,is_active,current_price,currency").eq("is_active",true).in("id",items.map(x=>x.id));
   if(error)throw error;
   return data||[];
  },
  enabled:items.length>0,
 });
 async function submit(e:React.FormEvent){
  e.preventDefault();if(sending||!items.length)return;
  setError("");setSending(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user){setSignedIn(false);throw new Error("يجب تسجيل الدخول لإرسال الطلب.");}
   if(name.trim().length<2||name.length>150)throw new Error("يرجى إدخال اسم صحيح.");
   if(!phone.trim()&&!email.trim())throw new Error("أدخل رقم هاتف أو بريدًا إلكترونيًا للتواصل.");
   const validIds=new Set(validProducts.filter(p=>p.current_price!==null).map(p=>p.id));
   if(items.some(x=>!validIds.has(x.id)))throw new Error("سلتك تحتوي على منتج غير متاح للتسعير. راجع السلة أولًا.");
   if(new Set(validProducts.map(p=>p.currency)).size>1)throw new Error("لا يمكن إرسال منتجات بعملات مختلفة في نفس الطلب.");
   const payload={p_contact:{name:name.trim(),phone:phone.trim(),email:email.trim(),company:company.trim(),notes:notes.trim()},p_items:items.map(item=>({id:item.id,quantity:item.quantity})),p_project_id:null};
   const {data,error:submitError}=await supabase.rpc("submit_store_quotation" as never,payload as never);
   if(submitError)throw submitError;
   if(typeof data!=="string"||!data)throw new Error("لم يتم تأكيد تسجيل الطلب في قاعدة البيانات.");
   setQuoteId(data);trackStoreEvent("quote_request",items[0]?.id);
   clear();
  }catch(err){setError(err instanceof Error?err.message:"فشل تسجيل الطلب؛ لم يتم تأكيد الإرسال.");}
  finally{setSending(false)}
 }
 return <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900"><SiteHeader/><main className="mx-auto max-w-3xl px-5 py-12">
 <Link to="/cart" className="inline-flex items-center gap-2 text-sm font-bold text-[#030957]"><ArrowRight size={16}/> العودة للسلة</Link>
 {quoteId?<section role="status" className="mt-8 rounded-3xl bg-white p-12 text-center shadow-sm"><CheckCircle2 size={52} className="mx-auto text-emerald-600"/><h1 className="mt-4 text-2xl font-black text-[#030957]">تم تسجيل طلب عرض السعر</h1><p className="mt-3 text-sm text-slate-600">تم تسجيل الطلب في قاعدة AZ-CCTV، ولم يتم تحصيل أي مبلغ أو إصدار طلب شراء.</p><p className="mt-5 select-all break-all rounded-xl bg-slate-100 p-3 font-mono text-xs">{quoteId}</p><Link to="/projects" className="mt-6 inline-block rounded-xl bg-[#FFB900] px-6 py-3 font-bold text-[#030957]">الذهاب لمشاريعي</Link></section>:
 <><header className="mt-8"><p className="text-xs font-bold tracking-widest text-[#42639a]">REQUEST FOR QUOTATION</p><h1 className="mt-2 text-3xl font-black text-[#030957]">طلب عرض سعر للمعدات</h1><p className="mt-3 text-sm leading-7 text-slate-600">نراجع سعر المورد والتوفر قبل إرسال عرض رسمي. بيانات السلة لا تشكل فاتورة أو أمر شراء.</p></header>
 {signedIn===false&&<div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">لازم تسجيل الدخول لحفظ الطلب ومتابعته. <Link to="/auth" className="font-black text-[#030957] underline">تسجيل الدخول أو إنشاء حساب</Link></div>}
 {loadError&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">تعذر تحديث بيانات الكتالوج. لا ترسل طلبك حتى يكتمل التحميل.</p>}
 <form onSubmit={e=>void submit(e)} className="mt-7 space-y-5 rounded-3xl bg-white p-6 shadow-sm sm:p-9">
  <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-bold">الاسم الكامل *<input required minLength={2} maxLength={150} value={name} onChange={e=>setName(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-[#030957]"/></label><label className="block text-sm font-bold">رقم الهاتف<input type="tel" maxLength={32} value={phone} onChange={e=>setPhone(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-[#030957]"/></label></div>
  <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-bold">البريد الإلكتروني<input type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-[#030957]"/></label><label className="block text-sm font-bold">الشركة<input maxLength={200} value={company} onChange={e=>setCompany(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-[#030957]"/></label></div>
  <label className="block text-sm font-bold">متطلبات المشروع أو ملاحظات<textarea maxLength={2000} rows={4} value={notes} onChange={e=>setNotes(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-4 font-normal outline-none focus:border-[#030957]"/></label>
  <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><LockKeyhole size={19} className="shrink-0 text-[#030957]"/><span>سيتم حساب الأسعار داخل قاعدة البيانات عند تسجيل الطلب. لا توجد عملية دفع في هذه الخطوة.</span></div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  <button type="submit" disabled={sending||isLoading||!!loadError||!items.length||signedIn!==true} className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#FFB900] px-6 py-4 font-black text-[#030957] disabled:opacity-50"><Send size={18}/>{sending?"جارٍ تسجيل الطلب…":`إرسال طلب عرض سعر · ${items.length} منتج`}</button>
 </form></>}
 </main></div>;
}
