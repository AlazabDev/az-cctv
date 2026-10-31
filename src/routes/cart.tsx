import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ImageOff, Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useStoreCart } from "@/hooks/use-store-cart";
import { supabase } from "@/integrations/supabase/client";
import { productTitle,productPrice,type StoreProduct } from "@/lib/store/catalog";

export const Route = createFileRoute("/cart")({
 head:()=>({meta:[{title:"سلة المعدات وطلب عرض سعر | AZ-CCTV"},{name:"robots",content:"noindex,follow"}]}),
 component:CartPage,
});
function CartPage(){
 const {items,count,update,remove}=useStoreCart();
 const ids=items.map(x=>x.id);
 const {data:products=[],isLoading,error}=useQuery({
  queryKey:["store-cart-products",ids.join(",")],
  queryFn:async()=>{
   if(!ids.length)return [] as StoreProduct[];
   const {data,error}=await supabase.from("products").select("*").eq("is_active",true).eq("published",true).in("id",ids);
   if(error)throw error;
   return data as StoreProduct[];
  },
  enabled:ids.length>0,
 });
 const valid=items.flatMap(item=>{const p=products.find(p=>p.id===item.id);return p?[{...item,product:p}]:[]});
 const unavailable=items.length-valid.length;
 const subtotal=valid.reduce((sum,row)=>sum+(row.product.current_price??0)*row.quantity,0);
 const currency=valid[0]?.product.currency||"EGP";
 return <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900"><SiteHeader/><main className="mx-auto max-w-6xl px-5 py-10">
 <Link to="/store" className="inline-flex items-center gap-2 text-sm font-bold text-[#030957]"><ArrowRight size={17}/> متابعة التصفح</Link>
 <div className="mt-8 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold tracking-widest text-[#6b7c99]">EQUIPMENT SELECTION</p><h1 className="mt-2 text-3xl font-black text-[#030957]">سلة المعدات</h1><p className="mt-2 text-sm text-slate-500">اختيار أجهزة لمشروعك أو لطلب عرض سعر من فريق AZ-CCTV</p></div><div className="rounded-xl bg-[#030957] px-5 py-3 font-extrabold text-white">{count.toLocaleString("ar-EG")} قطعة</div></div>
 {isLoading?<div className="mt-8 rounded-2xl bg-white p-12 text-center">جارٍ تحميل بيانات المعدات…</div>:error?<div role="alert" className="mt-8 rounded-2xl bg-white p-12 text-red-700">تعذر تحديث بيانات الأسعار. حاول مجددًا.</div>:!items.length?<div className="mt-8 rounded-3xl bg-white p-14 text-center"><ShoppingCart size={42} className="mx-auto text-slate-400"/><h2 className="mt-4 text-xl font-black">سلتك فارغة</h2><Link to="/store" className="mt-6 inline-block rounded-xl bg-[#FFB900] px-6 py-3 font-black text-[#030957]">تصفح المعدات</Link></div>:
 <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
  <div className="space-y-3">{valid.map(row=><article key={row.id} className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
   <Link to="/product/$id" params={{id:row.id}} className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-slate-50 p-2">{row.product.image_url?<img src={row.product.image_url} alt={productTitle(row.product)} className="max-h-full max-w-full object-contain" loading="lazy" onError={e=>e.currentTarget.style.visibility="hidden"}/>:<ImageOff className="text-slate-300"/>}</Link>
   <div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-500">{row.product.brand||"—"}</p><Link to="/product/$id" params={{id:row.id}} className="mt-2 block font-bold leading-7 text-[#030957] hover:underline">{productTitle(row.product)}</Link><p dir="ltr" className="mt-1 text-right font-mono text-xs text-slate-400">{row.product.model}</p><strong className="mt-2 block text-[#030957]">{productPrice(row.product)}</strong></div>
   <div className="flex items-center gap-3"><div className="flex items-center rounded-xl border border-slate-200"><button aria-label="تقليل الكمية" disabled={row.quantity<=1} onClick={()=>update(row.id,row.quantity-1)} className="p-2 disabled:opacity-30"><Minus size={15}/></button><span className="w-9 text-center font-bold">{row.quantity}</span><button aria-label="زيادة الكمية" disabled={row.quantity>=100} onClick={()=>update(row.id,row.quantity+1)} className="p-2 disabled:opacity-30"><Plus size={15}/></button></div><button aria-label="حذف المنتج" onClick={()=>remove(row.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17}/></button></div>
  </article>)}{unavailable>0&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{unavailable} من المنتجات المختارة غير متاح في كتالوج المنتجات النشطة. لن يدخل في طلب عرض السعر.</div>}</div>
  <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-lg font-black text-[#030957]">ملخص الطلب</h2><div className="my-6 flex justify-between border-y border-slate-100 py-5 text-sm"><span>القيمة الاسترشادية</span><strong>{new Intl.NumberFormat("ar-EG",{style:"currency",currency}).format(subtotal)}</strong></div><p className="mb-5 text-xs leading-6 text-slate-500">الأسعار والتوفر قابلة للمراجعة. هذا ليس تأكيد شراء أو حجز مخزون، ولا يتضمن تكلفة التركيب والشحن.</p><Link to="/quote" className="flex justify-center rounded-xl bg-[#FFB900] px-5 py-4 text-sm font-black text-[#030957]">طلب عرض سعر بالمعدات المختارة</Link><Link to="/store" className="mt-4 block text-center text-sm font-bold text-[#030957]">إضافة معدات أخرى</Link></aside>
 </div>}
 </main></div>;
}