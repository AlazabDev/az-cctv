import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Camera, Network, ImageOff, Layers3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { productTitle, productPrice, isAvailable, type StoreProduct } from "@/lib/store/catalog";

export const Route = createFileRoute("/category/$slug")({
 validateSearch: (search:Record<string,unknown>)=>({page:Math.max(1,Math.min(1000,Number.isFinite(Number(search.page))?Number(search.page)||1:1))}),
 loaderDeps: ({search})=>({page:search.page}),
 loader: async ({params,deps}) => {
  const category=params.slug==="cctv"?"CCTV":params.slug==="network"?"Network":null;
  if(!category)return {category:null,products:[] as StoreProduct[],count:0,page:deps.page};
  const from=(deps.page-1)*24;
  const {data,count,error}=await supabase.from("products").select("*",{count:"exact"}).eq("is_active",true).eq("category",category).order("brand").order("id").range(from,from+23);
  if(error)throw new Error("تعذر تحميل القسم");
  return {category,products:(data||[]) as StoreProduct[],count:count||0,page:deps.page};
 },
 head:({loaderData})=>{
  const isCamera=loaderData?.category==="CCTV";
  const title=isCamera?"كاميرات مراقبة ومسجلات وملحقاتها":"معدات شبكات وسويتشات وكابلات";
  return {meta:[{title:`${title} | AZ CCTV`},{name:"description",content:`تصفح ${title}، قارن الموديلات والأسعار والمواصفات واختر تجهيزات مشروعك على AZ CCTV.`},{property:"og:title",content:title},{name:"robots",content:"index,follow"}]};
 },
 component:CategoryLanding,
});
function CategoryLanding(){
 const {category,products,count,page}=Route.useLoaderData();
 const label=category==="CCTV"?"الكاميرات وأنظمة المراقبة":"معدات الشبكات والبنية التحتية";
 const pages=Math.ceil(count/24);
 const Icon=category==="CCTV"?Camera:Network;
 return <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900"><SiteHeader/><main className="mx-auto max-w-7xl px-5 py-10">
 <Link to="/store" className="inline-flex items-center gap-2 text-sm font-bold text-[#030957]"><ArrowRight size={16}/> جميع المنتجات</Link>
 {category===null?<div className="mt-10 rounded-2xl bg-white p-10 text-center"><h1 className="text-2xl font-black">هذا القسم غير موجود</h1><Link to="/store" className="mt-5 inline-block text-[#030957]">العودة للمتجر</Link></div>:<>
 <header className="mt-6 overflow-hidden rounded-3xl bg-[#030957] px-8 py-10 text-white sm:py-16"><Icon size={39} className="text-[#FFB900]"/><h1 className="mt-5 text-3xl font-black sm:text-4xl">{label}</h1><p className="mt-3 max-w-xl text-sm leading-8 text-slate-300">اكتشف الأجهزة والموديلات المتاحة في الكتالوج، قارن مواصفاتها وابدأ تصميم نظامك باستخدام أدوات هندسية متخصصة.</p><div className="mt-5 text-sm font-bold text-[#FFB900]">{count.toLocaleString("ar-EG")} منتج في القسم</div></header>
 <div className="mt-9 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{products.map(p=><Link key={p.id} to="/product/$id" params={{id:p.id}} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="flex aspect-square items-center justify-center bg-white p-5">{p.image_url?<img src={p.image_url} alt={productTitle(p)} loading="lazy" onError={e=>e.currentTarget.style.visibility="hidden"} className="h-full w-full object-contain transition group-hover:scale-105"/>:<ImageOff size={32} className="text-slate-300"/>}</div><div className="border-t border-slate-100 p-4"><span className="text-xs font-bold text-slate-500">{p.brand}</span><h2 className="mt-2 line-clamp-2 min-h-12 text-sm font-bold leading-6">{productTitle(p)}</h2><p className="mt-2 text-xs text-slate-500">{isAvailable(p)===true?"متوفر لدى المورد":isAvailable(p)===false?"غير متوفر":"التحقق من التوفر مطلوب"}</p><p className="mt-4 font-black text-[#030957]">{productPrice(p)}</p></div></Link>)}</div>
 {pages>1&&<nav aria-label="التنقل بين الصفحات" className="mt-10 flex items-center justify-center gap-4"><Link to="/category/$slug" params={{slug:category==="CCTV"?"cctv":"network"}} search={{page:page-1}} disabled={page<=1} className={`rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold ${page<=1?"pointer-events-none opacity-40":""}`}>السابق</Link><span className="text-sm font-bold">صفحة {page} من {pages}</span><Link to="/category/$slug" params={{slug:category==="CCTV"?"cctv":"network"}} search={{page:page+1}} disabled={page>=pages} className={`rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold ${page>=pages?"pointer-events-none opacity-40":""}`}>التالي <ArrowLeft size={14} className="inline"/></Link></nav>}
 <div className="mt-14 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-8"><div><h2 className="text-xl font-black text-[#030957]">حوّل اختيارك إلى تصميم هندسي</h2><p className="mt-2 text-sm text-slate-500">أدوات الكاميرات والتغطية والتكلفة على منصة واحدة.</p></div><Link to="/calculator" className="inline-flex items-center gap-2 rounded-xl bg-[#FFB900] px-6 py-3 font-black text-[#030957]"><Layers3 size={18}/> جرّب أدوات التصميم</Link></div>
 </>}</main></div>;
}
