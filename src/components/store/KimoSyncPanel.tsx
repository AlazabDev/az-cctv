import { useState } from "react";
import { PackageCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SyncRow={product_id:string;status:string;price?:number;available?:boolean;note?:string};
type SyncResult={run_id?:string;dry_run:boolean;total:number;checked:number;changed:number;failed:number;results:SyncRow[];error?:string};

export function KimoSyncPanel(){
  const [result,setResult]=useState<SyncResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [limit,setLimit]=useState(20);
  async function run(dry_run:boolean){
    if(busy)return;
    if(!dry_run&&!window.confirm("سيتم تحديث الأسعار وحالة التوفر للدفعة التالية من منتجات KimoStore في الكتالوج الحقيقي. راجع نتائج المعاينة أولًا. متابعة؟"))return;
    setBusy(true);setError("");setResult(null);
    try{
      const {data,error:callError}=await supabase.functions.invoke("kimo-price-stock-sync",{
        body:{dry_run,limit,...(!dry_run?{acknowledge:"KIMO_PRICE_STOCK_EXECUTE"}:{})}
      });
      if(callError)throw callError;
      if(data?.error)throw new Error(String(data.error));
      setResult(data as SyncResult);
    }catch(e){setError(e instanceof Error?e.message:"تعذّر فحص المورد")}
    finally{setBusy(false)}
  }
  return <section dir="rtl" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-black text-[#030957]"><PackageCheck size={21}/> مراجعة أسعار ومخزون KimoStore</h2>
      <span className="text-xs text-slate-500">تطابق مباشر لرابط المورد مع المنتج المسجل</span>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-600">المعاينة لا تعدل الأسعار. التنفيذ يحفظ سجل تغيرات المورد ويحدث تواريخ الفحص. أي منتج له متغيرات بأسعار أو حالة توفر مختلفة يحتاج مطابقة مستقلة ولا يُعدّل تلقائيًا.</p>
    <div className="mt-5 flex flex-wrap items-end gap-3">
      <label className="text-sm font-bold">حجم الدفعة
        <select value={limit} onChange={e=>setLimit(Number(e.target.value))} className="mt-2 block rounded-xl border border-slate-200 bg-white px-4 py-3">
          <option value={5}>5 منتجات</option><option value={10}>10 منتجات</option>
          <option value={20}>20 منتجًا</option><option value={25}>25 منتجًا</option>
        </select>
      </label>
      <button disabled={busy} onClick={()=>void run(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#030957] px-5 py-3 font-bold text-white disabled:opacity-50"><RefreshCw size={17}/>{busy?"جارٍ الاتصال…":"معاينة تحديث المورد"}</button>
      <button disabled={busy||!result||!result.dry_run} onClick={()=>void run(false)} className="rounded-xl border border-amber-500 bg-amber-50 px-5 py-3 font-bold text-amber-900 disabled:opacity-50">اعتماد تحديث الدفعة التالية</button>
    </div>
    {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {result&&<div className="mt-5 space-y-3">
      <p role="status" className="text-sm font-bold text-[#030957]">{result.dry_run?"معاينة فقط، دون تعديل": "تم تنفيذ الدفعة"} · فُحص {result.checked} من {result.total} · تغييرات {result.changed} · إخفاقات {result.failed}</p>
      {result.run_id&&<p className="break-all font-mono text-xs text-slate-500">سجل العملية: {result.run_id}</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {result.results.map((row,i)=><div key={row.product_id+"-"+i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs">
          <span className="break-all font-mono text-slate-600">{row.product_id}</span>
          <span className="font-bold">{row.status}</span>
          {row.price!==undefined&&<span>{row.price.toLocaleString("ar-EG")} جنيه</span>}
          {row.available!==undefined&&<span>{row.available?"متوفر":"غير متوفر"}</span>}
          {row.note&&<span className="w-full text-red-700">{row.note}</span>}
        </div>)}
      </div>
    </div>}
  </section>;
}
