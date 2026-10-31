import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { readSelectedDesignProducts, STORE_DESIGN_SELECTION_KEY } from "@/hooks/use-design-from-store";
import { productTitle, type StoreProduct } from "@/lib/store/catalog";

/** Handoff from a public product page to the authenticated engineering workspace.
 * The product is NOT placed automatically until its engineering specifications are verified.
 */
export function StoreDesignSelection() {
 const [items,setItems]=useState<StoreProduct[]>([]);
 const [ids,setIds]=useState<string[]>([]);
 useEffect(()=>{
  const current=readSelectedDesignProducts();
  setIds(current);
  if(!current.length)return;
  let active=true;
  void supabase.from("products").select("*").in("id",current).eq("is_active",true).then(({data})=>{
   if(active)setItems((data||[]) as StoreProduct[]);
  });
  return()=>{active=false};
 },[]);
 if(!ids.length)return null;
 return <section role="status" dir="rtl" className="border-b border-[#FFB900]/40 bg-[#FFB900]/10 px-5 py-4 text-sm text-[#030957]">
   <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
    <div className="min-w-0 flex-1">
      <strong>اختيارات المتجر جاهزة للمراجعة الهندسية ({ids.length})</strong>
      <p className="mt-1 text-xs leading-6 text-slate-600">
       {items.length ? items.map(productTitle).slice(0,3).join(" · ") : "جارٍ تحميل موديلاتك المختارة…"}
       {ids.length>3?" …":""}
      </p>
      <p className="mt-1 text-xs text-slate-600">
       يتم الاحتفاظ بمعرّفات المنتجات؛ لا يتم تركيبها تلقائيًا في المخطط دون تحقق من البيانات الهندسية.
      </p>
    </div>
    <Link to="/store" className="rounded-lg border border-[#030957]/30 px-3 py-2 font-bold">اختيار معدات أخرى</Link>
    <button type="button" className="rounded-lg px-3 py-2 underline" onClick={()=>{
      sessionStorage.removeItem(STORE_DESIGN_SELECTION_KEY);setIds([]);setItems([]);
    }}>إزالة الاختيارات</button>
   </div>
 </section>;
}
