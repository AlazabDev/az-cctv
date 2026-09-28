import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "حسابي — كاميرا بلان" },
      { name: "description", content: "تعديل بيانات الحساب واسم الشركة وكلمة المرور." },
      { property: "og:title", content: "حسابي — كاميرا بلان" },
      { property: "og:description", content: "إعدادات الحساب في كاميرا بلان." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [pwd, setPwd] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
      const { data: p } = await supabase.from("profiles").select("full_name,company").eq("id", data.user.id).maybeSingle();
      setFullName(p?.full_name ?? "");
      setCompany(p?.company ?? "");
    })();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ id: userId, full_name: fullName, company });
    setSaving(false);
    if (error) toast.error("تعذّر الحفظ");
    else toast.success("تم حفظ البيانات");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pwd, current_password: current } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("تم تغيير كلمة المرور");
      setPwd("");
      setCurrent("");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl space-y-6 px-5 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">حسابي</h1>
        <form onSubmit={saveProfile} className="panel space-y-3 p-6">
          <h2 className="font-bold">البيانات الشخصية</h2>
          <div className="space-y-1.5"><Label>البريد الإلكتروني</Label><Input value={email} disabled dir="ltr" /></div>
          <div className="space-y-1.5"><Label>الاسم</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>الشركة (تظهر في عروض الأسعار)</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <Button type="submit" disabled={saving}>{saving ? "جارٍ..." : "حفظ"}</Button>
        </form>
        <form onSubmit={changePassword} className="panel space-y-3 p-6">
          <h2 className="font-bold">تغيير كلمة المرور</h2>
          <div className="space-y-1.5"><Label>كلمة المرور الحالية</Label><Input type="password" required dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>كلمة المرور الجديدة</Label><Input type="password" required minLength={6} dir="ltr" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
          <Button type="submit" variant="secondary">تحديث كلمة المرور</Button>
        </form>
      </main>
    </div>
  );
}
