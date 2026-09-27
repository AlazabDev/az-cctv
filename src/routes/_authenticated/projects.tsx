import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Trash2, LogOut, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { emptyPlan } from "@/lib/cctv/types";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "مشاريعي — كاميرا بلان" },
      { name: "description", content: "إدارة مشاريع تصميم أنظمة كاميرات المراقبة المحفوظة." },
      { property: "og:title", content: "مشاريعي — كاميرا بلان" },
      { property: "og:description", content: "افتح وأنشئ مشاريع تصميم أنظمة المراقبة." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cctv_projects")
        .select("id,name,client_name,updated_at,data")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function createProject() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("cctv_projects")
      .insert({ user_id: u.user.id, name: "مشروع جديد", data: emptyPlan as never })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("تعذّر إنشاء المشروع");
      return;
    }
    navigate({ to: "/editor/$id", params: { id: data.id } });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("cctv_projects").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    toast.success("تم حذف المشروع");
    qc.invalidateQueries({ queryKey: ["projects"] });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-extrabold">
            <Camera className="h-5 w-5 text-primary" /> كاميرا بلان
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="ml-1 h-4 w-4" /> خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">مشاريعي</h1>
          <Button onClick={createProject}>
            <Plus className="ml-1 h-4 w-4" /> مشروع جديد
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">جارٍ التحميل…</p>
        ) : !data?.length ? (
          <div className="panel p-10 text-center">
            <p className="mb-4 text-muted-foreground">لا توجد مشاريع بعد. أنشئ أول مشروع وابدأ بتوزيع الكاميرات.</p>
            <Button onClick={createProject}>إنشاء مشروع</Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.map((p) => {
              const plan = (p.data ?? {}) as { devices?: unknown[] };
              const count = Array.isArray(plan.devices) ? plan.devices.length : 0;
              return (
                <div key={p.id} className="panel flex items-center justify-between p-4">
                  <Link to="/editor/$id" params={{ id: p.id }} className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.name}</p>
                    <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{count} جهاز</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(p.updated_at).toLocaleDateString("ar-EG")}
                      </span>
                      {p.client_name ? <span>{p.client_name}</span> : null}
                    </p>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => remove(p.id)} aria-label="حذف">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
