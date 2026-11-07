import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "حساب AZCCTV — دخول أو تسجيل" },
      { name: "description", content: "تسجيل الدخول وإنشاء حساب لإدارة مشاريع AZCCTV." },
      { name: "robots", content: "noindex,nofollow" },
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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate({ to: "/projects", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmationEmail(email.trim());
          toast.success("تم إرسال رسالة التأكيد إلى بريدك الإلكتروني.");
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      navigate({ to: "/projects", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إتمام العملية");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/projects`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      toast.error("أدخل بريدك الإلكتروني أولاً");
      return;
    }
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("تم إرسال رابط استعادة كلمة المرور إلى بريدك.");
  }

  return (
    <main className="grid min-h-screen bg-[#f5f7fb] lg:grid-cols-2" dir="rtl">
      <section className="relative flex min-h-screen flex-col justify-between px-5 py-8 sm:px-12 lg:px-16">
        <header className="flex items-center justify-between">
          <BrandLogo />
          <Link to="/" className="text-xs font-bold text-[#46577a] hover:text-[#030957]">
            العودة للرئيسية ←
          </Link>
        </header>
        <div className="mx-auto w-full max-w-md py-12">
          <div className="mb-8">
            <p className="mb-3 text-xs font-black tracking-widest text-[#bd8c00]">
              WELCOME TO AZCCTV
            </p>
            <h1 className="text-3xl font-black text-[#030957] sm:text-4xl">
              {mode === "signin" ? "مرحبًا بعودتك." : "مساحة عملك تبدأ هنا."}
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {mode === "signin"
                ? "سجّل الدخول للوصول إلى مشاريع التصميم والتغطية والشبكات."
                : "أنشئ حسابك لإدارة المشاريع الهندسية في مكان واحد."}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_60px_rgba(3,9,87,.07)] sm:p-9">
            <div className="mb-7 flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`h-10 flex-1 rounded-lg text-sm font-bold ${mode === "signin" ? "bg-[#030957] text-white shadow" : "text-slate-600"}`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`h-10 flex-1 rounded-lg text-sm font-bold ${mode === "signup" ? "bg-[#030957] text-white shadow" : "text-slate-600"}`}
              >
                حساب جديد
              </button>
            </div>
            <form onSubmit={submit} className="space-y-5">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="full-name" className="text-[#030957]">
                    الاسم الكامل
                  </Label>
                  <Input
                    id="full-name"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="الاسم الكامل"
                    className="h-11 text-[#030957]"
                  />
                </div>
              )}
              {confirmationEmail && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900"
                >
                  أرسلنا رابط تفعيل الحساب إلى <strong dir="ltr">{confirmationEmail}</strong>. افتح
                  الرسالة لتأكيد بريدك، ثم سجّل الدخول هنا.
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#030957]">
                  البريد الإلكتروني
                </Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    dir="ltr"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-11 pr-10 text-[#030957]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[#030957]">
                    كلمة المرور
                  </Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={resetPassword}
                      className="text-xs font-bold text-[#986f00] hover:underline"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
                <div className="relative">
                  <LockKeyhole className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    required
                    minLength={6}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 px-10 text-[#030957]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    className="absolute left-3 top-3 text-slate-400"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full bg-[#030957] font-black text-white hover:bg-[#162572]"
              >
                {loading
                  ? "جارٍ المعالجة…"
                  : mode === "signin"
                    ? "الدخول إلى لوحة التحكم"
                    : "إنشاء الحساب"}{" "}
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </form>
            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> أو المتابعة باستخدام{" "}
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={signInWithGoogle}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-[#030957] transition hover:bg-slate-50 disabled:opacity-60"
            >
              <span className="text-lg font-black text-[#4285F4]">G</span> Google
            </button>
            <p className="mt-6 text-center text-xs text-slate-500">
              دخول آمن لحسابك · يمكنك استعادة كلمة المرور عبر بريدك الإلكتروني.
            </p>
          </div>
        </div>
        <footer className="text-center text-xs text-slate-400" dir="ltr">
          © {new Date().getFullYear()} AZCCTV · Alazab Group
        </footer>
      </section>
      <aside className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#030957] p-14 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[.1]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff40 1px,transparent 1px),linear-gradient(90deg,#ffffff40 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-[#FFB900]/10 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FFB900]/40 bg-[#FFB900]/10 px-4 py-2 text-xs font-bold text-[#FFB900]">
            <ShieldCheck className="h-4 w-4" /> SECURE ENGINEERING WORKSPACE
          </span>
        </div>
        <div className="relative max-w-lg">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-[#FFB900]/40 bg-[#FFB900]/10 text-[#FFB900]">
            <Sparkles className="h-10 w-10" />
          </div>
          <h2 className="text-5xl font-black leading-tight">
            مشروعك أدق.
            <br />
            <span className="text-[#FFB900]">وإدارتك أسهل.</span>
          </h2>
          <p className="mt-6 max-w-md text-base leading-9 text-slate-300">
            المخططات والكاميرات والتغطية والشبكة وعروض الأسعار، مرتبطة بحساب واحد.
          </p>
          <div className="mt-10 space-y-4">
            {[
              "مشاريع محفوظة وقابلة للتعديل",
              "اختيار المعدات من الكتالوج",
              "تجهيز المخططات والتقارير",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-200">
                <Check className="h-5 w-5 text-[#FFB900]" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs font-bold tracking-[.2em] text-white/45" dir="ltr">
          AZCCTV / SECURITY DESIGN PLATFORM
        </div>
      </aside>
    </main>
  );
}
