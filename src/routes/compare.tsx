import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ImageOff, Plus, Trash2, Layers3 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { compareStorageKey, productTitle, productPrice, stockLabel, trackStoreEvent, type StoreProduct } from "@/lib/store/catalog";

export const Route = createFileRoute("/compare")({head:()=>({meta:[{title:"مقارنة معدات المراقبة والشبكات | AZ CCTV"},{name:"robots",content:"noindex,follow"}]}),component:ComparePage});
const COLUMNS = ["brand","model","category","subcategory","current_price","sku"] as const;
const labels:Record<string,string>={brand:"العلامة التجارية",model:"الموديل",category:"القسم",subcategory:"النوع",current_price:"السعر",sku:"كود SKU"};
function ComparePage(){
 const [ids,setIds]=useState<string[]>([]);
 const [products,setProducts]=useState<StoreProduct[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const shared=(params.get("ids")||"").split(",").filter(x=>/^[0-9a-f-]{36}$/i.test(x)).slice(0,4);
  let saved:string[]=[];
  try{saved=JSON.parse(localStorage.getItem(compareStorageKey)||"[]") as string[]}catch{saved=[]}
  setIds(shared.length?shared:saved.filter(x=>/^[0-9a-f-]{36}$/i.test(x)).slice(0,4));
 },[]);
 useEffect(()=>{
  if(!ids.length){setProducts([]);setLoading(false);return}
  let live=true;setLoading(true);
  void supabase.from("products").select("*").in("id",ids).eq("is_active",true).then(({data,error})=>{
   if(!live)return;setProducts((data||[]).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id)));setError(error?"تعذر تحميل المنتجات":"");setLoading(false);
  });return()=>{live=false};
 },[ids.join(",")]);
 function remove(id:string){
  const next=ids.filter(x=>x!==id);
  setIds(next);
  try{localStorage.setItem(compareStorageKey,JSON.stringify(next))}catch{}
  const u=new URL(window.location.href);u.searchParams.delete("ids");window.history.replaceState({},"",u);
  trackStoreEvent("compare_remove",id);
 }
 const url=typeof window!=="undefined"?`${window.location.origin}/compare?ids=${ids.join(",")}`:"";
 const specKeys=[...new Set(products.flatMap(p=>p.specifications&&typeof p.specifications==="object"&&!Array.isArray(p.specifications)?Object.keys(p.specifications):[]))].slice(0,30);
 return <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900"><SiteHeader/><main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
 <Link to="/store" className="inline-flex items-center gap-2 text-sm font-bold text-[#030957]"><ArrowRight size={17}/> العودة للمتجر</Link>
 <div className="mt-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-500">SMART PRODUCT COMPARISON</p><h1 className="mt-2 text-3xl font-black text-[#030957]">قارن المعدات بدقة</h1><p className="mt-3 text-sm text-slate-500">قارن الأسعار والموديلات والمواصفات الفنية جنبًا إلى جنب. الحد الأقصى 4 منتجات.</p></div><button disabled={!ids.length} onClick={()=>{void navigator.clipboard?.writeText(url);trackStoreEvent("compare_share")}} className="rounded-xl border border-[#030957] px-5 py-3 text-sm font-bold text-[#030957] disabled:opacity-40">نسخ رابط المقارنة</button></div>
 {loading?<p className="mt-12 rounded-xl bg-white p-8">جارٍ تحميل المنتجات…</p>:error?<p role="alert" className="mt-12 rounded-xl bg-white p-8 text-red-700">{error}</p>:!products.length?<div className="mt-10 rounded-3xl bg-white p-14 text-center"><Layers3 className="mx-auto text-slate-400" size={44}/><h2 className="mt-4 text-xl font-bold">لم تختر منتجات للمقارنة بعد</h2><Link to="/store" className="mt-5 inline-flex gap-2 rounded-xl bg-[#FFB900] px-5 py-3 font-extrabold text-[#030957]"><Plus size={18}/> تصفح الأجهزة</Link></div>:
 <div className="mt-10 overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[760px] border-collapse text-sm"><thead><tr><th scope="col" className="w-44 border-b border-l border-slate-100 bg-slate-50 px-5 py-5 text-right">المعيار</th>{products.map(p=><th key={p.id} scope="col" className="min-w-[210px] border-b border-l border-slate-100 px-5 py-6 text-right align-top"><div className="flex h-32 items-center justify-center bg-white">{p.image_url?<img src={p.image_url} alt={productTitle(p)} className="h-full max-w-full object-contain" onError={e=>e.currentTarget.style.visibility="hidden"}/>:<ImageOff className="text-slate-400"/>}</div><Link to="/product/$id" params={{id:p.id}} className="mt-4 block line-clamp-3 font-extrabold leading-6 text-[#030957] hover:underline">{productTitle(p)}</Link><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{stockLabel(p)}</span><button onClick={()=>remove(p.id)} aria-label={`إزالة ${productTitle(p)}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17}/></button></div></th>)}</tr></thead><tbody>
 {COLUMNS.map(key=><tr key={key}><th scope="row" className="border-b border-l border-slate-100 bg-slate-50 px-5 py-4 text-right font-bold">{labels[key]}</th>{products.map(p=><td key={p.id} className="border-b border-l border-slate-100 px-5 py-4">{key==="current_price"?productPrice(p):String(p[key]??"—")}</td>)}</tr>)}
 {specKeys.map(key=><tr key={key}><th scope="row" className="border-b border-l border-slate-100 bg-slate-50 px-5 py-4 text-right font-bold">{key.replaceAll("_"," ")}</th>{products.map(p=>{const value=p.specifications&&typeof p.specifications==="object"&&!Array.isArray(p.specifications)?(p.specifications as Record<string,unknown>)[key]:null;return <td key={p.id} className="border-b border-l border-slate-100 px-5 py-4">{value==null||typeof value==="object"?"—":String(value)}</td>})}</tr>)}
 </tbody></table></div>}
 <div className="mt-10 rounded-2xl bg-[#030957] p-8 text-white"><h2 className="text-xl font-black">اختر الأفضل ثم ابدأ تصميم مشروعك</h2><p className="mt-2 text-sm text-slate-300">حوّل المقارنة إلى قرار هندسي باستخدام أدوات التوزيع والحساب في AZ-CCTV.</p><Link to="/calculator" onClick={()=>trackStoreEvent("compare_to_design")} className="mt-5 inline-block rounded-xl bg-[#FFB900] px-6 py-3 font-bold text-[#030957]">فتح الحاسبة الهندسية</Link></div>
 </main></div>;
}