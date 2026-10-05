import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { cableTypes, storageOptions } from "@/lib/cctv/catalog";
import { buildProductCatalog } from "@/lib/cctv/product-catalog";
import { distanceForPpm, formatMoney } from "@/lib/cctv/geometry";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "كتالوج أجهزة المراقبة — كاميرا بلان" },
      {
        name: "description",
        content: "كتالوج المنتجات الفعلي المستخدم داخل محرر تصميم أنظمة المراقبة.",
      },
      { property: "og:title", content: "كتالوج أجهزة المراقبة — كاميرا بلان" },
      {
        property: "og:description",
        content: "كاميرات ومسجلات NVR وسويتشات PoE من قاعدة المنتجات الفعلية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

const typeLabel: Record<string, string> = {
  bullet: "بوليت",
  dome: "دوم",
  turret: "تيوريت",
  ptz: "PTZ",
  fisheye: "فيش آي",
  other: "أخرى",
};

const tabs = [
  { id: "cameras", label: "الكاميرات" },
  { id: "hardware", label: "المسجلات والسويتشات" },
  { id: "other", label: "مواد التصميم" },
] as const;

function CatalogPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("cameras");
  const { data, error, isLoading } = useQuery({
    queryKey: ["public-product-catalog"],
    queryFn: async () => {
      const { data: products, error: queryError } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("brand", { ascending: true })
        .order("model", { ascending: true });
      if (queryError) throw queryError;
      return products ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const catalog = data ? buildProductCatalog(data) : null;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-2xl font-extrabold">
          كتالوج الأجهزة
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          المنتجات والأسعار هنا تُقرأ مباشرة من Product Master نفسه المستخدم في محرر التصميم.
        </p>

        {isLoading ? (
          <div className="panel p-6 text-sm text-muted-foreground">جارٍ تحميل المنتجات…</div>
        ) : error || !catalog ? (
          <div className="panel p-6">
            <p className="font-semibold">تعذّر تحميل كتالوج المنتجات.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              سجّل الدخول بحساب مخوّل للوصول إلى Product Master.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`rounded-md border px-4 py-2 text-sm ${tab === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {item.label}
                </button>
              ))}
              <span className="mr-auto text-xs text-muted-foreground">
                {catalog.products.length} منتج نشط
              </span>
            </div>

            {tab === "cameras" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.cameras.map((camera) => (
                  <div key={camera.id} className="panel overflow-hidden">
                    {camera.imageUrl && (
                      <div className="flex h-44 items-center justify-center border-b border-border bg-white p-3">
                        <img
                          src={camera.imageUrl}
                          alt={camera.label}
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="mb-1 text-xs text-accent">
                        {camera.brand} · {typeLabel[camera.type] ?? camera.type}
                      </div>
                      <h2 className="font-bold">{camera.label}</h2>
                      <div className="mb-3 font-mono text-xs text-muted-foreground" dir="ltr">
                        {camera.model}
                      </div>
                      <dl className="grid grid-cols-2 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">الدقة</dt>
                        <dd>{camera.megapixel || "—"} MP</dd>
                        <dt className="text-muted-foreground">العدسة</dt>
                        <dd>{camera.focal || "—"} mm</dd>
                        <dt className="text-muted-foreground">زاوية الرؤية</dt>
                        <dd>{camera.hfov || "—"}°</dd>
                        <dt className="text-muted-foreground">مدى الأشعة</dt>
                        <dd>{camera.irRange || "—"} m</dd>
                        <dt className="text-muted-foreground">مدى التعرف</dt>
                        <dd>
                          {camera.engineeringReady
                            ? `${distanceForPpm(camera, 125).toFixed(1)} m`
                            : "بيانات هندسية ناقصة"}
                        </dd>
                        <dt className="text-muted-foreground">استهلاك PoE</dt>
                        <dd>{camera.poeWatt || "—"} W</dd>
                      </dl>
                      <div className="mt-4 text-lg font-bold text-primary">
                        {formatMoney(camera.price, camera.currency || "EGP")}
                      </div>
                    </div>
                  </div>
                ))}
                {catalog.cameras.length === 0 && (
                  <EmptyState text="لا توجد كاميرات نشطة في Product Master." />
                )}
              </div>
            )}

            {tab === "hardware" && (
              <Table
                head={["الجهاز", "الموديل", "القنوات/المنافذ", "قدرة PoE", "السعر"]}
                rows={catalog.hardware.map((item) => [
                  item.label,
                  item.model ?? "—",
                  item.channels
                    ? `${item.channels} قناة`
                    : item.ports
                      ? `${item.ports} منفذ`
                      : "—",
                  item.poeBudget ? `${item.poeBudget} W` : "—",
                  formatMoney(item.price, item.currency || "EGP"),
                ])}
              />
            )}

            {tab === "other" && (
              <div className="space-y-6">
                <p className="text-xs text-muted-foreground">
                  هذه عناصر هندسية مساعدة وليست منتجات تجارية من Product Master.
                </p>
                <Table
                  head={["الكابل", "الفئة", "سعر المتر الافتراضي"]}
                  rows={cableTypes.map((item) => [
                    item.label,
                    item.category,
                    formatMoney(item.pricePerMeter, "EGP"),
                  ])}
                />
                <Table
                  head={["التخزين", "السعة", "السعر الافتراضي"]}
                  rows={storageOptions.map((item) => [
                    item.label,
                    `${item.tb} TB`,
                    formatMoney(item.price, "EGP"),
                  ])}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="panel p-6 text-sm text-muted-foreground">{text}</div>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            {head.map((item) => (
              <th key={item} className="px-4 py-3 text-right font-medium">
                {item}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/50 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-4 py-8 text-center text-muted-foreground">
                لا توجد منتجات متاحة.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
