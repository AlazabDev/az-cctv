import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cameraCatalog } from "@/lib/cctv/catalog";
import { distanceForPpm, ppmAtDistance, ppmLevels, storageTb } from "@/lib/cctv/geometry";

export const Route = createFileRoute("/calculator")({
  head: () => ({
    meta: [
      { title: "حاسبة التغطية والتخزين — كاميرا بلان" },
      { name: "description", content: "احسب مسافات الكشف والتعرف بالبكسل لكل متر، وسعة التخزين المطلوبة لنظام المراقبة." },
      { property: "og:title", content: "حاسبة التغطية والتخزين — كاميرا بلان" },
      { property: "og:description", content: "حاسبة PPM ومسافات الرؤية وسعة الهارد ديسك لأنظمة الكاميرات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalculatorPage,
});

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function CalculatorPage() {
  const [camId, setCamId] = useState(cameraCatalog[0]!.id);
  const [distance, setDistance] = useState(10);
  const cam = cameraCatalog.find((c) => c.id === camId)!;
  const ppm = ppmAtDistance(cam, distance);
  const level = ppmLevels.find((l) => ppm >= l.ppm);

  const [count, setCount] = useState(8);
  const [bitrate, setBitrate] = useState(4);
  const [days, setDays] = useState(30);
  const [hours, setHours] = useState(24);
  const tb = useMemo(() => storageTb(count * bitrate, days) * (hours / 24), [count, bitrate, days, hours]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-2">
        <section className="panel p-6">
          <h1 className="mb-4 font-[family-name:var(--font-display)] text-xl font-extrabold">حاسبة التغطية (PPM)</h1>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الكاميرا</Label>
              <select className={selectCls} value={camId} onChange={(e) => setCamId(e.target.value)}>
                {cameraCatalog.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>المسافة إلى الهدف (متر)</Label>
              <Input type="number" min={0.5} step={0.5} value={distance} onChange={(e) => setDistance(Number(e.target.value) || 0)} />
            </div>
          </div>
          <div className="mt-5 rounded-md border border-border p-4">
            <div className="text-sm text-muted-foreground">الكثافة عند هذه المسافة</div>
            <div className="text-3xl font-bold text-primary">{Number.isFinite(ppm) ? ppm.toFixed(0) : "—"} <span className="text-base">بكسل/متر</span></div>
            <div className="mt-1 text-sm">المستوى: <b className="text-accent">{level?.label ?? "أقل من الكشف"}</b></div>
          </div>
          <table className="mt-5 w-full text-sm">
            <thead className="text-muted-foreground"><tr><th className="py-2 text-right">المستوى</th><th className="text-right">PPM</th><th className="text-right">أقصى مسافة</th></tr></thead>
            <tbody>
              {ppmLevels.map((l) => (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="py-2">{l.label}</td><td>{l.ppm}</td><td>{distanceForPpm(cam, l.ppm).toFixed(1)} م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-6">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-extrabold">حاسبة التخزين</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="عدد الكاميرات" value={count} onChange={setCount} />
            <Field label="معدل البث لكل كاميرا (Mbps)" value={bitrate} onChange={setBitrate} step={0.5} />
            <Field label="أيام الاحتفاظ" value={days} onChange={setDays} />
            <Field label="ساعات التسجيل يومياً" value={hours} onChange={(v) => setHours(Math.min(24, v))} />
          </div>
          <div className="mt-5 rounded-md border border-border p-4">
            <div className="text-sm text-muted-foreground">السعة المطلوبة</div>
            <div className="text-3xl font-bold text-primary">{tb.toFixed(2)} TB</div>
            <div className="mt-1 text-sm text-muted-foreground">
              تقريباً {Math.ceil(tb / 4)} × هارد 4TB أو {Math.ceil(tb / 8)} × هارد 8TB
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}
