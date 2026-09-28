import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — كاميرا بلان" },
      { name: "description", content: "سجّل الدخول لحفظ وإدارة مشاريع تصميم أنظمة المراقبة." },
      { property: "og:title", content: "تسجيل الدخول — كاميرا بلان" },
      { property: "og:description", content: "ادخل إلى حسابك لإدارة مشاريع كاميرات المراقبة." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/projects", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("تم إنشاء الحساب. افتح بريدك لتأكيد التسجيل.");
          return;
        }
        navigate({ to: "/projects" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/projects" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إتمام العملية");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("تعذّر الدخول عبر جوجل");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/projects" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-[family-name:var(--font-display)] text-xl font-extrabold">
          <Camera className="h-5 w-5 text-primary" /> كاميرا بلان
        </Link>
        <div className="panel p-6">
          <h1 className="mb-1 text-lg font-bold">{mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
          <p className="mb-5 text-sm text-muted-foreground">للوصول إلى مشاريعك المحفوظة.</p>

          <Button type="button" variant="secondary" className="w-full" onClick={google}>
            المتابعة باستخدام جوجل
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> أو <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-3" onSubmit={submit}>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">الاسم</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جارٍ..." : mode === "signin" ? "دخول" : "إنشاء الحساب"}
            </Button>
          </form>

          {mode === "signin" && (
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                if (!email) {
                  toast.error("اكتب بريدك أولاً");
                  return;
                }
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) toast.error(error.message);
                else toast.success("أرسلنا رابط استعادة كلمة المرور إلى بريدك");
              }}
            >
              نسيت كلمة المرور؟
            </button>
          )}
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "ليس لديك حساب؟ أنشئ واحداً" : "لديك حساب؟ سجّل الدخول"}
          </button>
        </div>
      </div>
    </div>
  );
}
