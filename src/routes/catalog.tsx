import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { cameraCatalog, hardwareCatalog, cableTypes, storageOptions } from "@/lib/cctv/catalog";
import { distanceForPpm, formatMoney } from "@/lib/cctv/geometry";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "كتالوج أجهزة المراقبة — كاميرا بلان" },
      { name: "description", content: "مواصفات وأسعار الكاميرات والمسجلات والسويتشات والكابلات المستخدمة في التصميم." },
      { property: "og:title", content: "كتالوج أجهزة المراقبة — كاميرا بلان" },
      { property: "og:description", content: "كاميرات، مسجلات NVR، سويتشات PoE وكابلات مع المواصفات والأسعار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

const typeLabel: Record<string, string> = { bullet: "بوليت", dome: "دوم", turret: "تيوريت", ptz: "PTZ", fisheye: "فيش آي" };
const tabs = [
  { id: "cameras", label: "الكاميرات" },
  { id: "hardware", label: "المسجلات والسويتشات" },
  { id: "other", label: "الكابلات والتخزين" },
] as const;

function CatalogPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("cameras");
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-2xl font-extrabold">كتالوج الأجهزة</h1>
        <p className="mb-6 text-sm text-muted-foreground">الأسعار تقديرية بالريال السعودي وتُستخدم في جدول الكميات.</p>
        <div className="mb-5 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md border px-4 py-2 text-sm ${tab === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "cameras" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cameraCatalog.map((c) => (
              <div key={c.id} className="panel p-5">
                <div className="mb-1 text-xs text-accent">{c.brand} · {typeLabel[c.type]}</div>
                <h2 className="font-bold">{c.label}</h2>
                <div className="mb-3 font-mono text-xs text-muted-foreground" dir="ltr">{c.model}</div>
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">الدقة</dt><dd>{c.megapixel} ميجا</dd>
                  <dt className="text-muted-foreground">العدسة</dt><dd>{c.focal} مم</dd>
                  <dt className="text-muted-foreground">زاوية الرؤية</dt><dd>{c.hfov}°</dd>
                  <dt className="text-muted-foreground">مدى الأشعة</dt><dd>{c.irRange} م</dd>
                  <dt className="text-muted-foreground">مدى التعرف</dt><dd>{distanceForPpm(c, 125).toFixed(1)} م</dd>
                  <dt className="text-muted-foreground">استهلاك PoE</dt><dd>{c.poeWatt} واط</dd>
                </dl>
                <div className="mt-4 text-lg font-bold text-primary">{formatMoney(c.price, "ر.س")}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "hardware" && (
          <Table
            head={["الجهاز", "القنوات/المنافذ", "قدرة PoE", "السعر"]}
            rows={hardwareCatalog.map((h) => [
              h.label,
              h.channels ? `${h.channels} قناة` : h.ports ? `${h.ports} منفذ` : "—",
              h.poeBudget ? `${h.poeBudget} واط` : "—",
              formatMoney(h.price, "ر.س"),
            ])}
          />
        )}

        {tab === "other" && (
          <div className="space-y-6">
            <Table head={["الكابل", "سعر المتر"]} rows={cableTypes.map((c) => [c.label, formatMoney(c.pricePerMeter, "ر.س")])} />
            <Table head={["التخزين", "السعة", "السعر"]} rows={storageOptions.map((s) => [s.label, `${s.tb} TB`, formatMoney(s.price, "ر.س")])} />
          </div>
        )}
      </main>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => <td key={j} className="px-4 py-3">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
