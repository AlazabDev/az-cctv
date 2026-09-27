import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Cable, Ruler, FileSpreadsheet, ShieldCheck, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "كاميرا بلان — تصميم أنظمة كاميرات المراقبة" },
      {
        name: "description",
        content:
          "صمّم نظام المراقبة على مخطط الموقع: وزّع الكاميرات، احسب التغطية والوضوح، ارسم الكابلات، واستخرج قائمة الأجهزة والتسعير.",
      },
      { property: "og:title", content: "كاميرا بلان — تصميم أنظمة كاميرات المراقبة" },
      {
        property: "og:description",
        content: "أداة عربية لتوزيع الكاميرات على المخططات وحساب التغطية والكابلات وقائمة الأسعار.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Camera, title: "توزيع الكاميرات", text: "ضع الكاميرات على المخطط وحدّد اتجاهها وارتفاعها ونوع العدسة." },
  { icon: Layers, title: "محاكاة التغطية", text: "مخروط رؤية ملوّن يوضح مناطق الكشف والملاحظة والتعرف وتمييز الهوية." },
  { icon: Ruler, title: "مقياس دقيق", text: "عاير المخطط بخط معلوم الطول لتصبح كل الحسابات بالأمتار الحقيقية." },
  { icon: Cable, title: "مسارات الكابلات", text: "ارسم مسارات الشبكة واحسب الأطوال والتكلفة لكل نوع كابل." },
  { icon: FileSpreadsheet, title: "قائمة الأجهزة والتسعير", text: "جدول كميات تلقائي مع المسجل والسويتشات والتخزين المطلوب." },
  { icon: ShieldCheck, title: "مشاريع محفوظة", text: "كل مشروع محفوظ في حسابك ويمكن فتحه وتعديله في أي وقت." },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-extrabold">
            <Camera className="h-5 w-5 text-primary" />
            كاميرا بلان
          </div>
          <Button asChild size="sm">
            <Link to={signedIn ? "/projects" : "/auth"}>{signedIn ? "مشاريعي" : "دخول / تسجيل"}</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-20 text-center">
        <p className="mb-4 inline-block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          أداة تصميم عربية لأنظمة CCTV
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight md:text-6xl">
          صمّم نظام المراقبة
          <span className="block text-primary">على مخطط الموقع مباشرة</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
          ارفع مخطط المبنى، وزّع الكاميرات، شاهد مناطق التغطية ودقة التعرف بالبكسل لكل متر، ارسم مسارات الكابلات،
          واحصل على جدول كميات وتسعير جاهز للعميل.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to={signedIn ? "/projects" : "/auth"}>ابدأ التصميم</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="panel p-5">
              <f.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="mb-1 font-bold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
