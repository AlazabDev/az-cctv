import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpLeft,
  BadgeCheck,
  Cable,
  Camera,
  Check,
  ChevronLeft,
  CircleDot,
  Cpu,
  FileText,
  Layers3,
  MapPinned,
  Network,
  Play,
  Ruler,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { brandLogoUrl } from "@/lib/brand-assets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AZCCTV | منصة هندسة وتصميم أنظمة المراقبة" },
      {
        name: "description",
        content:
          "منصة AZCCTV لتصميم أنظمة كاميرات المراقبة: مخططات، تغطية DORI، كتالوج الأجهزة، الكابلات، الشبكات، عروض الأسعار والخرائط.",
      },
      { property: "og:title", content: "AZCCTV — CCTV Design & Engineering" },
      {
        property: "og:description",
        content: "من المخطط إلى التصميم الهندسي وعرض السعر، ضمن مساحة عمل واحدة.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: LandingPage,
});

const tools = [
  {
    icon: Layers3,
    title: "مخططات هندسية",
    label: "PLAN DESIGN",
    detail: "ارفع المخطط، عاير المقياس، وارسم الجدران وزّع الأجهزة.",
  },
  {
    icon: Camera,
    title: "تحليل التغطية",
    label: "DORI & GEOMETRY",
    detail: "تصور مجال رؤية الكاميرا ومستويات الدقة بالبكسل لكل متر.",
  },
  {
    icon: Network,
    title: "تصميم الشبكات",
    label: "NETWORK TOPOLOGY",
    detail: "ربط الأجهزة بالسويتشات والمسجلات ومراجعة المسافات والأحمال.",
  },
  {
    icon: MapPinned,
    title: "تصميم المواقع",
    label: "MAP DESIGN",
    detail: "ضع الكاميرات والحدود على الخريطة الخارجية للمشروع.",
  },
  {
    icon: Cpu,
    title: "كتالوج المنتجات",
    label: "PRODUCT CATALOG",
    detail: "اختيار الأجهزة من كتالوج المنتجات المتصل بقاعدة البيانات.",
  },
  {
    icon: FileText,
    title: "جدول كميات وعروض",
    label: "BOQ & PROPOSALS",
    detail: "حوّل عناصر التصميم إلى كميات وتكاليف وعرض قابل للطباعة.",
  },
];

function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const destination = signedIn ? "/projects" : "/auth";

  return (
    <div className="min-h-screen bg-[#07112c] text-white" dir="rtl">
      <SiteHeader />
      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at 80% 20%,rgba(255,185,0,.13),transparent 35%), radial-gradient(ellipse at 16% 70%,rgba(49,79,170,.27),transparent 40%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[.10]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.25) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.25) 1px,transparent 1px)",
              backgroundSize: "46px 46px",
            }}
          />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-20 lg:grid-cols-[1fr_1.08fr] lg:items-center lg:pb-28 lg:pt-28">
            <div>
              <div className="mb-8 flex items-center gap-4">
                {brandLogoUrl && (
                  <img
                    src={brandLogoUrl}
                    alt="AZCCTV"
                    width={88}
                    height={88}
                    className="h-20 w-20 rounded-[22px] bg-white object-contain shadow-[0_18px_45px_rgba(0,0,0,.24)] sm:h-[88px] sm:w-[88px]"
                  />
                )}
                <div>
                  <p className="text-2xl font-black tracking-[.12em] text-white" dir="ltr">
                    AZCCTV
                  </p>
                  <p className="mt-1 text-xs font-bold tracking-[.18em] text-[#FFB900]" dir="ltr">
                    DESIGN · COVERAGE · DELIVERY
                  </p>
                </div>
              </div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#FFB900]/35 bg-[#FFB900]/10 px-4 py-2 text-xs font-bold text-[#FFCF56]">
                <CircleDot className="h-3.5 w-3.5" /> منصة هندسية متخصصة في أنظمة المراقبة
              </div>
              <h1 className="font-[family-name:var(--font-display)] text-5xl font-black leading-[1.18] tracking-tight sm:text-6xl lg:text-7xl">
                صمّم منظومة
                <br />
                <span className="text-[#FFB900]">المراقبة بثقة.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-9 text-slate-300 md:text-lg">
                من أول نقطة على المخطط إلى آخر بند في عرض السعر. أدوات التصميم والتغطية والشبكات
                والكتالوج الهندسي، في مساحة عمل واحدة.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/store" className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#FFB900]/60 px-6 text-sm font-black text-[#FFB900] transition hover:bg-[#FFB900]/10">تصفح متجر المعدات <ArrowUpLeft className="h-4 w-4"/></Link>
                <Link
                  to={destination}
                  className="inline-flex h-12 items-center gap-3 rounded-xl bg-[#FFB900] px-7 text-sm font-black text-[#030957] shadow-[0_12px_36px_rgba(255,185,0,.16)] transition hover:bg-[#ffd04b]"
                >
                  {signedIn ? "الانتقال إلى لوحة التحكم" : "ابدأ مشروعك الآن"}{" "}
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <a
                  href="#capabilities"
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-6 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  <Play className="h-4 w-4" /> استكشف المنصة
                </a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#FFB900]" /> تصميم متعدد المخططات
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#FFB900]" /> كميات مرتبطة بالتصميم
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#FFB900]" /> حسابات هندسية
                </span>
              </div>
            </div>
            <div
              aria-label="معاينة تخطيط شبكة كاميرات"
              className="relative mx-auto w-full max-w-[680px]"
            >
              <div className="rounded-[28px] border border-white/20 bg-[#0d1b3e]/95 p-3 shadow-2xl shadow-black/40 ring-1 ring-white/5 sm:p-5">
                <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FFB900]" />
                    <span className="text-xs font-bold tracking-wide">
                      AZCCTV / DESIGN WORKSPACE
                    </span>
                  </div>
                  <span className="rounded-md border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-300">
                    ENGINEERING VIEW
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1.3fr_.7fr]">
                  <div className="relative min-h-[315px] overflow-hidden rounded-xl border border-white/15 bg-[#0a1631] p-4">
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        backgroundImage:
                          "linear-gradient(#ffffff30 1px,transparent 1px),linear-gradient(90deg,#ffffff30 1px,transparent 1px)",
                        backgroundSize: "22px 22px",
                      }}
                    />
                    <div className="relative grid h-[280px] grid-cols-2 grid-rows-2 gap-2 p-3">
                      {["المدخل الرئيسي", "منطقة الاستقبال", "ممر الخدمات", "غرفة التحكم"].map(
                        (room, i) => (
                          <div
                            key={room}
                            className="relative flex items-end rounded border-2 border-[#6f87b8]/65 bg-[#20325a]/40 p-2"
                          >
                            <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-[#FFB900]/80 bg-[#FFB900]/20 text-[#FFB900]">
                              <Camera className="h-4 w-4" />
                            </div>
                            {i !== 3 && (
                              <div className="absolute left-2 top-7 h-16 w-16 rotate-[-25deg] rounded-full border border-[#FFB900]/40 bg-[#FFB900]/10 blur-[1px]" />
                            )}
                            <span className="text-[10px] text-slate-300">{room}</span>
                          </div>
                        ),
                      )}
                    </div>
                    <div className="absolute bottom-4 left-4 rounded-md border border-white/20 bg-[#0a1631]/90 px-2 py-1 font-mono text-[10px] text-[#FFB900]">
                      PLAN / 01
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {[
                      { icon: Camera, label: "CAMERAS", value: "IP DESIGN" },
                      { icon: Ruler, label: "COVERAGE", value: "DORI / PPM" },
                      { icon: Waypoints, label: "NETWORK", value: "PoE / NVR" },
                      { icon: FileText, label: "OUTPUT", value: "BOQ / PDF" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3"
                      >
                        <stat.icon className="h-5 w-5 shrink-0 text-[#FFB900]" />
                        <div>
                          <div className="text-[10px] text-slate-400">{stat.label}</div>
                          <div className="text-xs font-bold">{stat.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-white/10 pt-3 text-[10px] text-slate-400">
                  <span>PLAN DESIGN</span>
                  <span>CAMERA COVERAGE</span>
                  <span>NETWORK TOPOLOGY</span>
                </div>
              </div>
              <div className="pointer-events-none absolute -bottom-5 right-6 rounded-xl border border-[#FFB900]/40 bg-[#102044] px-5 py-3 shadow-xl">
                <span className="text-xs font-bold text-[#FFB900]">ENGINEERED FOR CLARITY</span>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="مزايا تجربة العمل"
          className="border-b border-white/10 bg-[#0b1940] px-5 py-7"
        >
          <div className="mx-auto grid max-w-7xl gap-4 text-center sm:grid-cols-3">
            {[
              { label: "خطط المشاريع", value: "PLAN + MULTI-LAYOUT" },
              { label: "تحليل الرؤية", value: "DORI / PPM" },
              { label: "التسليم الهندسي", value: "TOPOLOGY + BOQ" },
            ].map((item) => (
              <div
                key={item.value}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
              >
                <p className="font-mono text-xs font-bold tracking-wider text-[#FFB900]" dir="ltr">
                  {item.value}
                </p>
                <p className="mt-1 text-sm text-white/80">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="capabilities" className="bg-[#f5f7fb] px-5 py-24 text-[#030957]">
          <div className="mx-auto max-w-7xl">
            <div className="mb-11 flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-3 text-xs font-black tracking-widest text-[#b98400]">
                  CAPABILITIES / أدوات العمل
                </p>
                <h2 className="text-3xl font-black md:text-4xl">كل خطوة هندسية في مكان واحد</h2>
              </div>
              <Link
                to="/store"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#030957] hover:underline"
              >
                استعرض متجر المنتجات <ArrowUpLeft className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tools.map((item, idx) => (
                <article
                  key={item.label}
                  className="group rounded-2xl border border-[#dce3ef] bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-[#FFB900]/60 hover:shadow-xl"
                >
                  <div className="mb-9 flex items-start justify-between">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#030957] text-[#FFB900]">
                      <item.icon className="h-6 w-6" />
                    </span>
                    <span className="text-xs font-black text-slate-300">0{idx + 1}</span>
                  </div>
                  <p className="mb-2 text-[10px] font-black tracking-widest text-[#b98400]">
                    {item.label}
                  </p>
                  <h3 className="text-xl font-black">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-24 text-[#030957]">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <p className="mb-3 text-xs font-black tracking-widest text-[#b98400]">WORKFLOW</p>
              <h2 className="text-3xl font-black leading-tight md:text-4xl">
                من ملف مخطط إلى قرار تنفيذي.
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600">
                أعد مشروعك بطريقة منظمة قابلة للمراجعة، بدل التنقل بين أدوات الرسم والجداول والملفات
                المنفصلة.
              </p>
              <Link
                to={destination}
                className="mt-7 inline-flex items-center gap-2 font-black text-[#030957] hover:underline"
              >
                افتح مساحة عملك <ChevronLeft className="h-5 w-5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: Layers3,
                  num: "01",
                  title: "أنشئ المشروع",
                  detail: "أضف المخططات وحدد مقياس الرسم.",
                },
                {
                  icon: Camera,
                  num: "02",
                  title: "وزّع الأجهزة",
                  detail: "حدد المواقع والاتجاهات والتغطية.",
                },
                {
                  icon: Cable,
                  num: "03",
                  title: "اربط الشبكة",
                  detail: "راجع المسارات والتوصيلات والأحمال.",
                },
                {
                  icon: BadgeCheck,
                  num: "04",
                  title: "راجع واعتمد",
                  detail: "استخرج الكميات وجهّز عرض المشروع.",
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="rounded-2xl border border-slate-200 bg-[#f7f9fc] p-6"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <step.icon className="h-6 w-6 text-[#bd8c00]" />
                    <span className="text-2xl font-black text-slate-200">{step.num}</span>
                  </div>
                  <h3 className="text-lg font-black">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="bg-[#030957] px-5 py-20 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#FFB900]">
                <ShieldCheck className="h-4 w-4" /> AZCCTV PLATFORM
              </p>
              <h2 className="text-3xl font-black md:text-4xl">ابدأ التصميم من مشروعك القادم.</h2>
              <p className="mt-3 text-slate-300">مخططاتك وأجهزتك وحساباتك، في مساحة عمل واحدة.</p>
            </div>
            <Link
              to={destination}
              className="inline-flex h-12 items-center gap-3 rounded-xl bg-[#FFB900] px-7 text-sm font-black text-[#030957]"
            >
              {signedIn ? "لوحة التحكم" : "إنشاء حساب"} <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/10 bg-[#03091e] px-5 py-7 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-xs">
          <span dir="ltr">© {new Date().getFullYear()} AZCCTV · Alazab Group</span>
          <div className="flex gap-5">
            <Link to="/auth" className="hover:text-white">
              الحساب
            </Link>
            <Link to="/store" className="hover:text-white">
              المتجر
            </Link>
            <Link to="/calculator" className="hover:text-white">
              الحاسبة
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
