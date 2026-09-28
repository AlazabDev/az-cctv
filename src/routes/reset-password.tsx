import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة — كاميرا بلان" },
      { name: "description", content: "أدخل كلمة مرور جديدة لحسابك في كاميرا بلان." },
      { property: "og:title", content: "تعيين كلمة مرور جديدة — كاميرا بلان" },
      { property: "og:description", content: "استعادة الوصول إلى حسابك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم تعيين كلمة المرور");
    navigate({ to: "/projects" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-3 p-6">
        <h1 className="text-lg font-bold">كلمة مرور جديدة</h1>
        <div className="space-y-1.5">
          <Label>كلمة المرور</Label>
          <Input type="password" required minLength={6} dir="ltr" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "جارٍ..." : "حفظ"}</Button>
      </form>
    </div>
  );
}
