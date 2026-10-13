import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowUpLeft, Camera, Clock3, FileText, FolderKanban, Layers3,
  Plus, Search, ShieldCheck, Trash2, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyPlan } from "@/lib/cctv/types";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [
    { title: "لوحة التحكم | AZCCTV" },
    { name: "description", content: "إدارة مشاريع ومخططات أنظمة المراقبة في AZCCTV." },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: ProjectsDashboard,
});

type ProjectData = { layouts?: Array<{ devices?: unknown[]; walls?: unknown[] }>; devices?: unknown[] };
function numbers(value: unknown) {
  const plan = (value ?? {}) as ProjectData;
  if (Array.isArray(plan.layouts) && plan.layouts.length) {
    return {
      layouts: plan.layouts.length,
      devices: plan.layouts.reduce((total, layout) => total + (Array.isArray(layout.devices) ? layout.devices.length : 0), 0),
    };
  }
  return { layouts: 1, devices: Array.isArray(plan.devices) ? plan.devices.length : 0 };
}

function ProjectsDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: projects = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cctv_projects")
        .select("id,name,client_name,updated_at,data")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => projects.reduce((sum, project) => {
    const count = numbers(project.data);
    sum.devices += count.devices;
    sum.layouts += count.layouts;
    return sum;
  }, { devices: 0, layouts: 0 }), [projects]);

  const filtered = useMemo(() => projects.filter(project =>
    [project.name, project.client_name ?? ""].some(value =>
      value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )), [projects, search]);

  async function createProject() {
    if (creating) return;
    setCreating(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) { toast.error("انتهت جلسة الدخول. سجّل الدخول مجددًا."); return; }
      const { data, error } = await supabase
        .from("cctv_projects")
        .insert({ user_id: auth.user.id, name: "مشروع جديد", data: emptyPlan as never })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("تعذّر إنشاء المشروع");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/editor/$id", params: { id: data.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إنشاء المشروع");
    } finally {
      setCreating(false);
    }
  }

  async function removeProject(id: string, name: string) {
    if (deletingId) return;
    if (!window.confirm(`هل تريد حذف المشروع «${name}» نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("cctv_projects").delete().eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("تم حذف المشروع");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف المشروع");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#030957]" dir="rtl">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-xs font-black tracking-widest text-[#ad8000]">WORKSPACE / لوحة التحكم</p>
            <h1 className="text-3xl font-black sm:text-4xl">إدارة مشاريع المراقبة</h1>
            <p className="mt-3 text-sm text-slate-600">كل مخططاتك وأجهزتك ومشاريعك من نقطة واحدة.</p>
          </div>
          <Button type="button" disabled={creating} onClick={createProject} className="h-12 gap-2 bg-[#030957] px-6 font-black text-white hover:bg-[#172675]">
            <Plus className="h-5 w-5" /> {creating ? "جارٍ إنشاء المشروع…" : "مشروع جديد"}
          </Button>
        </div>

        <section aria-label="ملخص المشاريع" className="mb-9 grid gap-4 sm:grid-cols-3">
          {[
            { icon: FolderKanban, label: "إجمالي المشاريع", value: projects.length, unit: "PROJECTS" },
            { icon: Layers3, label: "المخططات والأدوار", value: totals.layouts, unit: "LAYOUTS" },
            { icon: Camera, label: "الأجهزة في التصميم", value: totals.devices, unit: "DEVICES" },
          ].map((metric, index) => <div key={metric.unit} className="rounded-2xl border border-[#dce3ef] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#030957] text-[#FFB900]"><metric.icon className="h-6 w-6" /></span><span className="text-[10px] font-black tracking-widest text-slate-400">{metric.unit}</span></div>
            <div className="text-4xl font-black tabular-nums">{isLoading ? "—" : metric.value}</div><div className="mt-2 text-sm font-bold text-slate-600">{metric.label}</div>
          </div>)}
        </section>

        <section className="overflow-hidden rounded-3xl border border-[#dce3ef] bg-white shadow-sm" aria-label="قائمة المشاريع">
          <div className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-100 px-6 py-6 sm:px-8">
            <div><h2 className="text-xl font-black">مشاريعك</h2><p className="mt-1 text-xs text-slate-500">افتح مشروعًا لاستكمال التصميم والتوصيلات والكميات.</p></div>
            <div className="relative w-full max-w-xs"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label="البحث عن مشروع" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم المشروع أو العميل..." className="h-10 bg-[#f6f8fc] pr-10 text-[#030957]" /></div>
          </div>
          {isLoading ? <div className="p-14 text-center text-sm text-slate-600" role="status">جارٍ تحميل المشاريع…</div>
          : isError ? <div className="flex flex-col items-center gap-4 p-14 text-center"><TriangleAlert className="h-9 w-9 text-amber-600" /><p className="font-bold">تعذّر تحميل المشاريع.</p><Button variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button></div>
          : filtered.length === 0 ? <div className="flex flex-col items-center gap-4 p-14 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#030957]/5 text-[#030957]"><FolderKanban className="h-8 w-8" /></span><p className="text-lg font-black">{search ? "لا توجد نتائج مطابقة" : "ابدأ بأول مشروع لك"}</p><p className="text-sm text-slate-500">{search ? "جرّب كلمة بحث مختلفة." : "أنشئ مشروعًا وارفع مخططًا لتبدأ التصميم."}</p>{!search && <Button onClick={createProject} className="bg-[#030957] text-white">إنشاء مشروع</Button>}</div>
          : <div className="divide-y divide-slate-100">
            {filtered.map(project => {
              const count = numbers(project.data);
              return <div key={project.id} className="group flex flex-wrap items-center gap-4 px-6 py-5 transition hover:bg-[#f7f9fd] sm:px-8">
                <Link to="/editor/$id" params={{ id: project.id }} className="flex min-w-[180px] flex-1 items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#030957] text-[#FFB900]"><FileText className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-black text-[#030957]">{project.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{project.client_name || "لم يُحدد العميل"}</span></span>
                </Link>
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1"><Layers3 className="h-3.5 w-3.5" /> {count.layouts} مخطط</span>
                  <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> {count.devices} جهاز</span>
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {new Date(project.updated_at).toLocaleDateString("ar-EG")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/editor/$id" params={{ id: project.id }} aria-label={`فتح ${project.name}`} className="flex h-9 items-center gap-1 rounded-lg bg-[#030957] px-3 text-xs font-black text-white hover:bg-[#172675]">فتح <ArrowUpLeft className="h-3.5 w-3.5" /></Link>
                  <button type="button" disabled={Boolean(deletingId)} onClick={()=>void removeProject(project.id,project.name)} aria-label={`حذف ${project.name}`} className="rounded-lg p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>;
            })}
          </div>}
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#030957] px-7 py-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-[#FFB900]" /><div><p className="font-black">جاهز للخطوة التالية؟</p><p className="mt-1 text-xs text-slate-300">ابدأ مشروعًا أو تصفح الأجهزة قبل التصميم.</p></div></div>
          <div className="flex gap-4"><Link to="/catalog" className="inline-flex items-center gap-2 text-sm font-bold hover:text-[#FFB900]">الكتالوج <ArrowUpLeft className="h-4 w-4" /></Link><Link to="/" className="inline-flex items-center gap-2 text-sm font-bold hover:text-[#FFB900]">الرئيسية <ArrowLeft className="h-4 w-4" /></Link></div>
        </div>
      </main>
    </div>
  );
}
