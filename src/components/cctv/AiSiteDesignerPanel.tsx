import { useState } from "react";
import { generateAiSiteDesign } from "@/lib/ai-site-designer.functions";
import { GOAL_LABEL, type CoverageGoal, type Proposal } from "@/lib/cctv/auto-design";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Scope="entrances"|"corridors"|"perimeter"|"general";
type Props={
  projectId:string;layoutId:string;
  onSave:()=>Promise<boolean>;
  onPreview:(proposals:Proposal[])=>void;
  onApply:()=>void;
  onReject:()=>void;
  onFocusPlan:()=>void;
  proposals:Proposal[]|null;
};
export function AiSiteDesignerPanel({projectId,layoutId,onSave,onPreview,onApply,onReject,onFocusPlan,proposals}:Props){
  const [goal,setGoal]=useState<CoverageGoal>("recognize");
  const [scope,setScope]=useState<Scope>("general");
  const [maxCameras,setMaxCameras]=useState(8);
  const [budget,setBudget]=useState("");
  const [requirements,setRequirements]=useState("");
  const [feedback,setFeedback]=useState("");
  const [running,setRunning]=useState(false);
  const [error,setError]=useState("");
  const [summary,setSummary]=useState("");
  const [checked,setChecked]=useState(0);
  const [excluded,setExcluded]=useState<string[]>([]);
  const selected=proposals?.filter(p=>!excluded.includes(p.id))??[];
  async function generate(){
    if(running)return;
    setRunning(true);setError("");setSummary("");setExcluded([]);
    try{
      if(!await onSave())throw new Error("تعذّر حفظ أحدث المخطط قبل إرساله للتحليل");
      const result=await generateAiSiteDesign({data:{
        projectId,layoutId,goal,scope,maxCameras,
        ...(budget.trim()?{budget:Number(budget)}:{}),
        requirements,feedback:feedback||undefined,
      }});
      if("error" in result)throw new Error(String(result.error));
      if(!result.proposals?.length)throw new Error("لم ينتج النموذج توزيعًا اجتاز الفحص الهندسي");
      setSummary(result.summary);setChecked(result.checked);onPreview(result.proposals);
      onFocusPlan();
    }catch(e){setError(e instanceof Error?e.message:"تعذّر توليد التصميم")}
    finally{setRunning(false)}
  }
  return <section dir="rtl" className="space-y-4 rounded-xl border border-border bg-surface p-4">
    <div>
      <h3 className="text-base font-bold text-[#030957]">مساعد التصميم الذكي — AI Site Designer</h3>
      <p className="mt-1 text-xs text-muted-foreground">مقترحات من AI Gateway، يليها فحص هندسي مستقل قبل المعاينة. الأسعار استرشادية إلى حين عروض الموردين.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">المنطقة المستهدفة
        <select value={scope} onChange={e=>setScope(e.target.value as Scope)} className="mt-1 w-full rounded-md border bg-background p-2">
          <option value="general">كامل الموقع</option><option value="entrances">البوابات والمداخل</option>
          <option value="corridors">الممرات</option><option value="perimeter">المحيط والأسوار</option>
        </select>
      </label>
      <label className="text-xs font-semibold">مستوى DORI
        <select value={goal} onChange={e=>setGoal(e.target.value as CoverageGoal)} className="mt-1 w-full rounded-md border bg-background p-2">
          {(Object.keys(GOAL_LABEL) as CoverageGoal[]).map(g=><option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">أقصى عدد كاميرات
        <Input className="mt-1" type="number" min={1} max={32} value={maxCameras} onChange={e=>setMaxCameras(Math.max(1,Math.min(32,Number(e.target.value)||1)))}/>
      </label>
      <label className="text-xs font-semibold">الميزانية المتاحة (EGP) — اختياري
        <Input className="mt-1" type="number" min={0} value={budget} onChange={e=>setBudget(e.target.value)}/>
      </label>
    </div>
    <label className="block text-xs font-semibold">احتياجات الموقع
      <textarea value={requirements} maxLength={1600} rows={3} onChange={e=>setRequirements(e.target.value)} placeholder="مثال: بابان، مدخل خلفي، ممر رئيسي، أولوية للتعرف على الوجوه عند المدخل" className="mt-1 w-full rounded-md border border-border bg-background p-2"/>
    </label>
    <label className="block text-xs font-semibold">ملاحظات إعادة التوليد
      <textarea value={feedback} maxLength={1200} rows={2} onChange={e=>setFeedback(e.target.value)} placeholder="مثال: قلل الكاميرات عند السور وركز على البوابة الشمالية" className="mt-1 w-full rounded-md border border-border bg-background p-2"/>
    </label>
    <Button disabled={running||!layoutId} onClick={()=>void generate()} className="w-full bg-[#030957] text-white">
      {running?"جارٍ تحليل المخطط والتحقق من المقترحات…":proposals?"إعادة توليد وفق الملاحظات":"تحليل وتوليد تصميم"}
    </Button>
    {error&&<p role="alert" className="rounded-md bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {proposals&&<div className="space-y-3 rounded-lg border border-[#030957]/20 p-3">
      <h4 className="font-semibold">مراجعة المقترح — {selected.length} كاميرا مؤهلة</h4>
      {summary&&<p className="text-xs">{summary}</p>}
      <p className="text-xs text-muted-foreground">اجتاز {proposals.length} من {checked} مقترحًا الفحوص الأولية. راجع التوزيع بصريًا ومسارات التمديدات قبل الاعتماد.</p>
      <div className="space-y-2">
        {proposals.map((p,i)=><div key={p.id} className="rounded-lg border border-border p-2 text-xs">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={!excluded.includes(p.id)} onChange={e=>setExcluded(v=>e.target.checked?v.filter(x=>x!==p.id):[...v,p.id])}/>
            <span><strong>#{i+1} {p.spec.model}</strong> — X {p.pos.x.toFixed(1)} م، Y {p.pos.y.toFixed(1)} م، {p.rotation}°، Tilt {p.tilt}°</span>
          </label>
          <p className="mt-1">{p.ppmAtTarget} PPM · ارتفاع {p.heightM}م · مسافة الهدف {p.targetDistanceM}م · منطقة عمياء تقريبية {p.blindSpotM.toFixed(1)}م</p>
          <p className="mt-1 text-muted-foreground">{p.reason}</p>
        </div>)}
      </div>
      <div className="flex gap-2">
        <Button disabled={!selected.length||running} onClick={()=>{if(window.confirm(`هل تعتمد إضافة ${selected.length} كاميرا إلى المشروع مع حساب الكابلات وجدول الكميات؟`)){onPreview(selected);onApply()}}}>اعتماد الكاميرات المختارة</Button>
        <Button variant="outline" disabled={running} onClick={()=>{onReject();setExcluded([])}}>رفض المقترح</Button>
      </div>
    </div>}
    <p className="text-xs text-amber-800">مطابقة DORI تقريب هندسي؛ لا يمكن استنتاج ظروف الإضاءة، العوائق الرأسية، الوجوه أو التضاريس من المخطط ثنائي الأبعاد وحده.</p>
  </section>;
}
