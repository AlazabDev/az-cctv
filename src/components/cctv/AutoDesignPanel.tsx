import { useState } from "react";
import { Check, RefreshCw, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GOAL_LABEL, type CoverageGoal, type Proposal } from "@/lib/cctv/auto-design";

export function AutoDesignPanel({
  proposals,
  coverage,
  hint,
  onGenerate,
  onApply,
  onReject,
  onRemove,
}: {
  proposals: Proposal[] | null;
  coverage: number;
  hint?: string;
  onGenerate: (goal: CoverageGoal, maxCameras: number) => void;
  onApply: () => void;
  onReject: () => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<CoverageGoal>("recognize");
  const [max, setMax] = useState(8);

  if (!open)
    return (
      <Button size="sm" className="shadow-lg" onClick={() => setOpen(true)}>
        <Wand2 className="h-4 w-4" /> تصميم تلقائي
      </Button>
    );

  const total = proposals?.reduce((s, p) => s + (p.spec.price || 0), 0) ?? 0;

  return (
    <div className="w-80 rounded-xl border border-border bg-surface p-3 text-xs shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1 text-sm font-bold">
          <Wand2 className="h-4 w-4 text-primary" /> مهندس التوزيع التلقائي
        </p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {hint && <p className="mb-2 text-muted-foreground">{hint}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label>
          مستوى التغطية
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as CoverageGoal)}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-1"
          >
            {(Object.keys(GOAL_LABEL) as CoverageGoal[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          أقصى عدد كاميرات
          <input
            type="number"
            min={1}
            max={40}
            value={max}
            onChange={(e) => setMax(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2"
          />
        </label>
      </div>
      <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => onGenerate(goal, max)}>
        {proposals ? <RefreshCw className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
        {proposals ? "إعادة التوليد" : "توليد مقترح"}
      </Button>

      {proposals && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1 text-center">
            <div className="rounded border border-border p-1">
              <div className="text-base font-bold">{proposals.length}</div>كاميرات
            </div>
            <div className="rounded border border-border p-1">
              <div className="text-base font-bold">{Math.round(coverage * 100)}%</div>تغطية
            </div>
            <div className="rounded border border-border p-1">
              <div className="text-base font-bold">{total.toLocaleString()}</div>تكلفة
            </div>
          </div>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {proposals.map((p, i) => (
              <li key={p.id} className="rounded border border-warning/40 bg-warning/5 p-2">
                <div className="flex items-center justify-between font-bold">
                  <span>
                    #{i + 1} {p.spec.label}
                  </span>
                  <button type="button" onClick={() => onRemove(p.id)} title="استبعاد">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
                <div className="text-muted-foreground">
                  اتجاه {Math.round(p.rotation)}° · ميل {p.tilt}° · ارتفاع {p.heightM}م · هدف {p.targetDistanceM}م ·{" "}
                  {p.ppmAtTarget} PPM · منطقة عمياء {p.blindSpotM}م
                </div>
                <div>{p.reason}</div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="flex-1" disabled={!proposals.length} onClick={onApply}>
              <Check className="h-4 w-4" /> اعتماد
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={onReject}>
              <X className="h-4 w-4" /> رفض
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
