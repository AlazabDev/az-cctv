import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { compareStorageKey, productTitle, trackStoreEvent } from "@/lib/store/catalog";
import { ArrowLeft, ArrowUpRight, Camera, ChevronLeft, ChevronRight, ImageOff, Layers3, Search, SlidersHorizontal, Wifi } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/store")({
  head: () => ({ meta: [
    { title: "متجر المعدات | AZ CCTV" },
    { name: "description", content: "تصفح كاميرات المراقبة وأجهزة التسجيل ومعدات الشبكات من كتالوج AZ CCTV." },
    { property: "og:title", content: "متجر المعدات | AZ CCTV" },
  ] }),
  component: StorePage,
});

type Product = Tables<"products">;
const PAGE_SIZE = 24;
const money = (value: number | null, currency: string) =>
  value == null ? "السعر غير متاح" : new Intl.NumberFormat("ar-EG", { style: "currency", currency: currency || "EGP", maximumFractionDigits: 2 }).format(value);
const names = (p: Product) => p.product_name || p.name_ar || p.name_en || [p.brand, p.model].filter(Boolean).join(" ");
function availability(p: Product): boolean | undefined {
  const m = p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {};
  return "available" in m && typeof m.available === "boolean" ? m.available : undefined;
}
function ProductImage({ src, alt, className }: { src: string | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} /> :
    <span className="flex h-full w-full items-center justify-center text-slate-400"><ImageOff className="h-9 w-9" aria-label="الصورة غير متاحة" /></span>;
}
function StorePage() {
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [subcat, setSubcat] = useState("all");
  const [sort, setSort] = useState("new");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  useEffect(() => {try {setCompareIds(JSON.parse(localStorage.getItem(compareStorageKey)||"[]"))}catch{setCompareIds([])}}, []);
  function toggleCompare(id:string){const next=compareIds.includes(id)?compareIds.filter(x=>x!==id):[...compareIds,id].slice(-4);setCompareIds(next);try{localStorage.setItem(compareStorageKey,JSON.stringify(next))}catch{};trackStoreEvent("compare_toggle",id)}
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 350); return () => window.clearTimeout(timer); }, [searchInput]);
  const { data: facets } = useQuery({
    queryKey: ["store-facets", category],
    queryFn: async () => {
      // All 1,030 records fit the lightweight facet projection; paginate to avoid Supabase's default 1,000 row cap.
      const found: Array<{ brand: string | null; category: string | null; subcategory: string | null }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("products").select("brand,category,subcategory").eq("is_active", true).range(offset, offset + 999);
        if (error) throw error;
        found.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return { subcategories: [...new Set(found.filter(p => category === "all" || p.category === category).map(p=>p.subcategory).filter((x):x is string=>Boolean(x)))].sort(), brands: [...new Set(found.map(p => p.brand).filter((x): x is string => Boolean(x)))].sort(), categories: [...new Set(found.map(p => p.category).filter((x): x is string => Boolean(x)))].sort(), total: found.length };
    },
    staleTime: 15 * 60 * 1000,
  });
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["store-products", { category, subcat, brand, search, sort, page }],
    queryFn: async () => {
      let query = supabase.from("products")
        .select("id,brand,model,sku,name_en,name_ar,product_name,description,product_type,category,subcategory,current_price,old_price,currency,image_url,is_active,source_url,metadata,specifications", { count: "exact" })
        .eq("is_active", true);
      if (category !== "all") query = query.eq("category", category);
      if (brand !== "all") query = query.eq("brand", brand);
      if (subcat !== "all") query = query.eq("subcategory",subcat);
      if (search) {
        // Escape PostgREST filter metacharacters and quotes; use indexed/filterable fields.
        const safe = search.replace(/[,().*"\\]/g, " ").trim().slice(0, 100);
        if (safe) query = query.or(`product_name.ilike.%${safe}%,name_en.ilike.%${safe}%,brand.ilike.%${safe}%,model.ilike.%${safe}%,sku.ilike.%${safe}%`);
      }
      if (sort === "price-asc") query = query.order("current_price", { ascending: true, nullsFirst: false });
      else if (sort === "price-desc") query = query.order("current_price", { ascending: false, nullsFirst: false });
      else if (sort === "name") query = query.order("product_name", { ascending: true });
      else query = query.order("created_at", { ascending: false });
      const { data, count, error } = await query.order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { products: (data || []) as Product[], count: count || 0 };
    },
    staleTime: 60 * 1000,
    placeholderData: (previous) => previous,
  });
  const reset = () => { setCategory("all"); setSubcat("all"); setBrand("all"); setSearchInput(""); setSearch(""); setSort("new"); setPage(0); };
  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);
  return <div className="min-h-screen bg-[#F6F8FC] text-slate-900" dir="rtl">
    <SiteHeader />
    <div className="bg-[#030957] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-12 pt-12 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-[#FFB900]"><Layers3 size={15}/> AZ-CCTV EQUIPMENT STORE</span>
        <div className="mt-6 grid items-end gap-7 lg:grid-cols-[1fr_auto]">
          <div><h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-black leading-tight sm:text-5xl">كل معدات أنظمة المراقبة والشبكات في مكان واحد.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">استكشف الكاميرات وأجهزة التسجيل والسويتشات والراكات والكابلات. الأسعار وحالة التوفر من كتالوج المورد، والمواصفات متاحة للمقارنة والاختيار.</p></div>
          <div className="flex gap-3"><div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4"><span className="block text-2xl font-black">{facets?.total?.toLocaleString("ar-EG") ?? "—"}</span><span className="text-xs text-slate-300">منتج نشط</span></div><div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4"><Camera className="mb-1 text-[#FFB900]" size={21}/><span className="text-xs text-slate-300">كاميرات وشبكات</span></div></div>
        </div>
      </div>
    </div>
    <main className="mx-auto max-w-7xl px-5 py-8">
      <section aria-label="استكشف الأقسام" className="mb-7 grid gap-4 md:grid-cols-2"><Link to="/category/$slug" params={{slug:"cctv"}} className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-[#FFB900]"><div><p className="text-xs font-black tracking-widest text-[#42639a]">SECURITY & SURVEILLANCE</p><h2 className="mt-2 text-xl font-black text-[#030957]">كاميرات وأنظمة مراقبة</h2><p className="mt-2 text-sm text-slate-500">كاميرات ومسجلات وملحقات الأمن</p></div><Camera size={36} className="shrink-0 text-[#030957]"/></Link><Link to="/category/$slug" params={{slug:"network"}} className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-[#FFB900]"><div><p className="text-xs font-black tracking-widest text-[#42639a]">NETWORK INFRASTRUCTURE</p><h2 className="mt-2 text-xl font-black text-[#030957]">معدات الشبكات</h2><p className="mt-2 text-sm text-slate-500">سويتشات وراوترات وكابلات وتجهيزات</p></div><Wifi size={36} className="shrink-0 text-[#030957]"/></Link></section>
      <div className="mb-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_180px_190px_190px_170px]">
        <label className="relative block"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={19}/><input aria-label="بحث في المنتجات" placeholder="ابحث بالاسم أو الموديل أو SKU..." value={searchInput} onChange={e => setSearchInput(e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pr-11 pl-4 text-sm outline-none focus:border-[#030957]" /></label>
        <label><span className="sr-only">القسم</span><select value={category} onChange={e => { setCategory(e.target.value); setSubcat("all"); setPage(0); }} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">كل الأقسام</option>{facets?.categories.map(x => <option key={x} value={x}>{x === "CCTV" ? "أنظمة المراقبة" : x === "Network" ? "أنظمة الشبكات" : x}</option>)}</select></label>
        <label><span className="sr-only">نوع المعدة</span><select value={subcat} onChange={e=>{setSubcat(e.target.value);setPage(0)}} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">كل أنواع المعدات</option>{facets?.subcategories.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label><span className="sr-only">العلامة التجارية</span><select value={brand} onChange={e => { setBrand(e.target.value); setPage(0); }} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">كل العلامات التجارية</option>{facets?.brands.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
        <label><span className="sr-only">ترتيب النتائج</span><select value={sort} onChange={e => { setSort(e.target.value); setPage(0); }} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="new">الأحدث إضافة</option><option value="price-asc">السعر: الأقل أولًا</option><option value="price-desc">السعر: الأعلى أولًا</option><option value="name">اسم المنتج</option></select></label>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><SlidersHorizontal size={17} className="text-[#030957]"/><h2 className="text-lg font-black">المنتجات</h2><span className="text-xs text-slate-500">({data?.count?.toLocaleString("ar-EG") ?? "—"} نتيجة)</span>{isFetching && !isLoading && <span className="text-xs text-slate-400">جاري التحديث…</span>}</div><button onClick={reset} className="text-sm font-semibold text-[#030957] hover:underline">مسح الفلاتر</button></div>
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-10 text-center"><p className="font-bold text-red-700">تعذر تحميل المنتجات. تحقق من اتصال Supabase وصلاحيات قراءة الكتالوج.</p><button onClick={() => void refetch()} className="mt-4 rounded-lg bg-[#030957] px-5 py-2 text-white">إعادة المحاولة</button></div> :
      isLoading ? <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{Array.from({length:12},(_,i)=><div key={i} className="h-80 animate-pulse rounded-2xl bg-white"/>)}</div> :
      !data?.products.length ? <div className="rounded-2xl bg-white py-20 text-center"><Wifi className="mx-auto mb-3 text-slate-400"/><h3 className="font-bold">لا توجد منتجات مطابقة</h3><button onClick={reset} className="mt-4 text-[#030957] underline">عرض جميع المنتجات</button></div> :
      <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{data.products.map(p => {
        const stock = availability(p);
        return <article key={p.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-sm transition hover:-translate-y-1 hover:border-[#FFB900] hover:shadow-xl">
          <Link to="/product/$id" params={{id:p.id}} onClick={()=>trackStoreEvent("product_open",p.id)} className="block focus-visible:outline-2 focus-visible:outline-[#030957]">
           <div className="relative flex aspect-square items-center justify-center bg-white p-4"><ProductImage src={p.image_url || undefined} alt={productTitle(p)} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"/><span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-bold ${stock === true ? "bg-emerald-50 text-emerald-700" : stock === false ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{stock === true ? "متوفر" : stock === false ? "غير متوفر" : "التوفر غير مؤكد"}</span></div>
           <div className="border-t border-slate-100 px-3 pt-3 sm:px-4 sm:pt-4"><p className="mb-2 text-xs font-bold text-[#42639a]">{p.brand || "—"}</p><h3 className="line-clamp-2 min-h-12 text-sm font-bold leading-6">{productTitle(p)}</h3><p className="mt-1 truncate font-mono text-[11px] text-slate-400" dir="ltr">{p.model}</p><div className="mt-4 flex items-end justify-between gap-1"><strong className="text-sm font-black text-[#030957] sm:text-base">{money(p.current_price,p.currency)}</strong><span className="rounded-full bg-[#FFB900] p-2 text-[#030957]"><ArrowLeft size={15}/></span></div></div>
          </Link>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 px-3 py-3 sm:px-4"><button type="button" onClick={()=>toggleCompare(p.id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${compareIds.includes(p.id)?"bg-[#030957] text-white":"bg-slate-100 text-[#030957]"}`}>{compareIds.includes(p.id)?"✓ تمت الإضافة":"أضف للمقارنة"}</button><Link to="/product/$id" params={{id:p.id}} className="text-xs font-bold text-[#030957]">التفاصيل</Link></div>
         </article>;
      })}</div>}
      {totalPages > 1 && <nav aria-label="صفحات المنتجات" className="mt-10 flex flex-wrap items-center justify-center gap-4"><button disabled={page === 0} onClick={() => { setPage(p => Math.max(0,p-1)); window.scrollTo({top:320,behavior:"smooth"}); }} className="rounded-xl border border-slate-200 bg-white p-3 disabled:opacity-40" aria-label="الصفحة السابقة"><ChevronRight size={20}/></button><span className="text-sm font-bold text-[#030957]">صفحة {page+1} من {totalPages}</span><button disabled={page+1 >= totalPages} onClick={() => { setPage(p => p+1); window.scrollTo({top:320,behavior:"smooth"}); }} className="rounded-xl border border-slate-200 bg-white p-3 disabled:opacity-40" aria-label="الصفحة التالية"><ChevronLeft size={20}/></button></nav>}
      <div className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-7 text-sm text-slate-500"><p>AZ-CCTV · كتالوج هندسي لمنتجات أنظمة المراقبة والشبكات</p><Link to="/calculator" className="inline-flex items-center gap-2 font-bold text-[#030957]">انتقل إلى حاسبة التصميم <ArrowUpRight size={16}/></Link></div>
    </main>
    {compareIds.length>0&&<aside className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-[#030957] p-4 text-white shadow-2xl"><span className="text-sm font-bold">{compareIds.length} من 4 منتجات للمقارنة</span><Link to="/compare" className="rounded-xl bg-[#FFB900] px-4 py-2 text-sm font-black text-[#030957]">قارن الآن</Link></aside>}
  </div>;
}
