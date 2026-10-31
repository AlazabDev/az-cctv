import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowRight, ArrowUpLeft, CheckCircle2, ImageOff, Layers, Share2, ShieldCheck, ArrowLeft } from "lucide-react";
import { useDesignFromStore } from "@/hooks/use-design-from-store";
import { useStoreCart } from "@/hooks/use-store-cart";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { compareStorageKey, productImages, productPrice, productTitle, isAvailable, trackStoreEvent, type StoreProduct } from "@/lib/store/catalog";

export const Route = createFileRoute("/product/$id")({
 loader: async ({ params }) => {
  const {data,error}=await supabase.from("products").select("*").eq("id",params.id).eq("is_active",true).eq("published",true).maybeSingle();
  if(error) throw new Error("تعذر جلب بيانات المنتج");
  return data;
 },
 head: ({loaderData}) => {
  const p=loaderData;
  if(!p) return {meta:[{title:"المنتج غير موجود | AZ CCTV"},{name:"robots",content:"noindex"}]};
  const name=productTitle(p);
  const description=(p.description||name).replace(/\s+/g," ").slice(0,155);
  const canonical=`https://cctv.alazab.com/product/${encodeURIComponent(p.id)}`;
  const schema={"@context":"https://schema.org","@type":"Product",name,image:productImages(p),description,sku:p.sku||p.model,brand:{"@type":"Brand",name:p.brand||"غير محدد"},offers:p.current_price!=null?{"@type":"Offer",price:p.current_price,priceCurrency:p.currency||"EGP",availability:isAvailable(p)===true?"https://schema.org/InStock":isAvailable(p)===false?"https://schema.org/OutOfStock":"https://schema.org/PreOrder",url:canonical}:undefined};
  return {meta:[{title:`${name} | AZ CCTV`},{name:"description",content:description},{property:"og:title",content:name},{property:"og:description",content:description},{property:"og:type",content:"product"},...(p.image_url?[{property:"og:image",content:p.image_url}]:[]),{name:"robots",content:"index,follow"}],links:[{rel:"canonical",href:canonical}],scripts:[{type:"application/ld+json",children:JSON.stringify(schema)}]};
 },
 component: ProductPage,
});

function ProductPage(){
 const product=Route.useLoaderData() as StoreProduct|null;
 const designFromStore=useDesignFromStore();
 const cart=useStoreCart();
 const [selected,setSelected]=useState(0);
 const [broken,setBroken]=useState(false);
 const [saved,setSaved]=useState(false);
 useEffect(()=>{if(product)trackStoreEvent("product_view",product.id)},[product]);
 useEffect(()=>{setSelected(0);setBroken(false)},[product?.id]);
 if(!product) return <div className="min-h-screen bg-[#f5f7fb]"><SiteHeader/><main className="mx-auto max-w-5xl p-12 text-center"><h1 className="text-2xl font-bold">المنتج غير موجود أو غير متاح</h1><Link to="/store" className="mt-6 inline-block rounded-lg bg-[#030957] px-6 py-3 text-white">العودة للمتجر</Link></main></div>;
 const images=productImages(product);
 const availability=isAvailable(product);
 const specs=product.specifications&&typeof product.specifications==="object"&&!Array.isArray(product.specifications)?Object.entries(product.specifications).filter(([k,v])=>v!==null && typeof v!=="object" && !k.startsWith("_")):[];
 function addCompare(){
  try{
   const current=JSON.parse(localStorage.getItem(compareStorageKey)||"[]") as string[];
   localStorage.setItem(compareStorageKey,JSON.stringify([...new Set([...current,product!.id])].slice(-4)));
   setSaved(true);trackStoreEvent("compare_add",product!.id);
  }catch{setSaved(false)}
 }
 async function share(){
  const url=window.location.href;
  if(navigator.share)try{await navigator.share({title:productTitle(product!),url});trackStoreEvent("share",product!.id);return}catch{return}
  try{await navigator.clipboard.writeText(url);trackStoreEvent("share",product!.id)}catch{/* clipboard unsupported */}
 }
 const name=productTitle(product);
 return <div dir="rtl" className="min-h-screen bg-[#f4f7fc] text-slate-900"><SiteHeader/>
 <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6">
  <nav aria-label="مسار التنقل" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500"><Link to="/store" className="hover:text-[#030957]">المتجر</Link><ArrowLeft size={12}/><Link to="/store" className="hover:text-[#030957]">{product.category||"المنتجات"}</Link><ArrowLeft size={12}/><span className="line-clamp-1 text-slate-800">{name}</span></nav>
  <div className="grid overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm lg:grid-cols-2">
   <section aria-label="صور المنتج" className="bg-[#f8faff] p-5 sm:p-9">
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white p-6">
     {images[selected]&&!broken?<img src={images[selected]} onError={()=>setBroken(true)} alt={`${name} - صورة ${selected+1}`} className="h-full w-full object-contain" loading="eager"/>:<div className="flex flex-col items-center gap-2 text-slate-400"><ImageOff size={42}/><p>الصورة غير متاحة</p></div>}
    </div>
    {images.length>1&&<div className="mt-4 flex gap-3 overflow-x-auto pb-2">{images.map((img,i)=><button key={img} aria-label={`عرض الصورة ${i+1}`} onClick={()=>{setSelected(i);setBroken(false)}} className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-2 ${selected===i?"border-[#030957]":"border-transparent"}`}><img src={img} loading="lazy" alt="" className="h-full w-full object-contain" onError={e=>{e.currentTarget.style.visibility="hidden"}}/></button>)}</div>}
    <p className="mt-3 text-center text-xs text-slate-500">{images.length} {images.length===1?"صورة":"صور"} لهذا المنتج</p>
   </section>
   <section className="p-6 sm:p-10">
    <div className="mb-5 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-bold text-[#030957]">{product.brand||"معدات المراقبة"}</span><span className="text-xs text-slate-500">{product.subcategory||product.category}</span></div>
    <h1 className="text-2xl font-black leading-relaxed text-[#030957] sm:text-3xl">{name}</h1>
    <p dir="ltr" className="mt-2 text-right font-mono text-sm text-slate-500">{product.model}</p>
    <div className="my-7 rounded-2xl border border-slate-100 bg-[#f8faff] p-5">
     <p className="text-xs text-slate-500">السعر المسجل لدى المورد — قابل للتغير</p>
     <strong className="mt-1 block text-3xl font-black text-[#030957]">{productPrice(product)}</strong>
     {product.old_price!=null&&product.current_price!=null&&product.old_price>product.current_price&&<span className="text-sm text-slate-400 line-through">{new Intl.NumberFormat("ar-EG").format(product.old_price)} جنيه</span>}
     <div className="mt-4 flex items-center gap-2 text-sm font-semibold">{availability===true?<CheckCircle2 size={17} className="text-emerald-600"/>:<ShieldCheck size={17} className="text-slate-500"/>}<span>{availability===true?"متوفر بحسب آخر بيانات المورد":availability===false?"غير متوفر بحسب آخر بيانات المورد":"تحقق من التوفر قبل الطلب"}</span></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
     <button type="button" onClick={()=>void designFromStore(product.id)} className="flex items-center justify-center gap-2 rounded-xl bg-[#FFB900] px-4 py-4 text-center text-sm font-black text-[#030957] transition hover:bg-[#ffd04c]"><Layers size={18}/> استخدم هذا المنتج في تصميمي <ArrowUpLeft size={17}/></button>
     <button onClick={addCompare} className="rounded-xl border-2 border-[#030957] px-4 py-4 text-sm font-extrabold text-[#030957]">{saved?"تمت الإضافة للمقارنة ✓":"أضف للمقارنة"}</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={()=>cart.add(product.id)} className="rounded-xl border-2 border-[#FFB900] px-4 py-3 text-sm font-black text-[#030957]">أضف لسلة المعدات ({cart.count})</button><Link to="/cart" className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-[#030957]">فتح السلة</Link></div>
    <div className="mt-4 flex gap-3"><button onClick={()=>void share()} className="inline-flex items-center gap-2 text-sm font-semibold text-[#030957]"><Share2 size={16}/> مشاركة المنتج</button><Link to="/compare" className="inline-flex items-center gap-2 text-sm font-semibold text-[#030957]">قارن المنتجات <ArrowRight size={15}/></Link></div>
    {product.sku&&<p className="mt-6 text-xs text-slate-500">SKU: <span dir="ltr" className="font-mono">{product.sku}</span></p>}
   </section>
  </div>
  <div className="mt-7 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
   <section className="rounded-3xl bg-white p-7 shadow-sm"><h2 className="text-xl font-black text-[#030957]">تفاصيل المنتج</h2><p className="mt-4 whitespace-pre-line text-sm leading-9 text-slate-700">{product.description||"المواصفات التفصيلية غير متوفرة حاليًا."}</p></section>
   <section className="rounded-3xl bg-white p-7 shadow-sm"><h2 className="text-xl font-black text-[#030957]">المواصفات الفنية</h2><dl className="mt-4 divide-y divide-slate-100 text-sm"><div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">العلامة</dt><dd>{product.brand||"—"}</dd></div><div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">الموديل</dt><dd dir="ltr">{product.model}</dd></div>{specs.slice(0,24).map(([key,value])=><div key={key} className="flex justify-between gap-3 py-3"><dt className="break-all text-slate-500">{key.replaceAll("_"," ")}</dt><dd className="text-left">{String(value)}</dd></div>)}</dl></section>
  </div>
  <div className="mt-10 rounded-3xl bg-[#030957] p-8 text-white"><h2 className="text-2xl font-black">من اختيار الجهاز إلى تصميم مشروع كامل</h2><p className="mt-3 text-sm leading-7 text-slate-300">استخدم أدوات تصميم التغطية وتوزيع الكاميرات وتقدير الكميات داخل AZ-CCTV.</p><Link to="/auth" onClick={()=>trackStoreEvent("signup_cta",product.id)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FFB900] px-6 py-3 font-bold text-[#030957]">ابدأ مجانًا <ArrowUpLeft size={18}/></Link></div>
 </main></div>;
}
