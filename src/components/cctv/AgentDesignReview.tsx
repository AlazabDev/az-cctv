import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Placement = {
  cameraModelId: string;
  xM: number;
  yM: number;
  heightM: number;
  rotationDeg: number;
  ppmAtTarget?: number;
  coveragePct?: number;
  reason?: string;
};
type Proposal = { id: string; status: string; summary: string; cameras: Placement[] };
type Props = {
  projectId: string;
  approved: boolean;
  onApprove: () => Promise<boolean>;
  onBeforeGenerate: () => Promise<boolean>;
  onApplied: () => void;
};
export function AgentDesignReview({projectId,approved,onApprove,onBeforeGenerate,onApplied}:Props){
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const [busy,setBusy]=useState(false);
  const [errorText,setErrorText]=useState("");
  async function call(body:Record<string,unknown>){
    const {data,error}=await supabase.functions.invoke("az-design-agent",{body});
    if(error)throw new Error(error.message);
    if(data?.error)throw new Error(String(data.detail??data.error));
    return data as Record<string,unknown>;
  }
  async function approve(){
    if(busy||!window.confirm("هل راجعت مقياس المخطط وارتفاع السقف والجدران؟ سيُعتمد المخطط الحالي لتوليد مقترح هندسي."))return;
    setBusy(true);setErrorText("");
    try{if(!await onApprove())throw new Error("تعذّر حفظ اعتماد المخطط");setProposal(null)}
    catch(e){setErrorText(e instanceof Error?e.message:"تعذّر الاعتماد")}finally{setBusy(false)}
  }
  async function generate(){
    if(busy||!approved)return;
    setBusy(true);setErrorText("");setProposal(null);
    try{
      if(!await onBeforeGenerate())throw new Error("تعذر حفظ التعديلات الحالية قبل التوليد");
      const result=await call({action:"generate",project_id:projectId});
      const p=result.proposal as Proposal|undefined;
      if(!p?.id||!Array.isArray(p.cameras))throw new Error("لم يرجع الوكيل مقترحًا صالحًا");
      setProposal(p);
    }catch(e){setErrorText(e instanceof Error?e.message:"فشل طلب التصميم")}finally{setBusy(false)}
  }
  async function decide(action:"apply"|"reject"){
    if(!proposal||busy)return;
    if(action==="apply"&&!window.confirm("سيُعاد فحص توزيع الكاميرات على الخادم قبل إضافتها إلى المخطط النشط. الأجهزة المقترحة قد تكون نماذج هندسية Legacy غير مسعّرة حتى مطابقتها بمنتج فعلي. هل تعتمد؟"))return;
    setBusy(true);setErrorText("");
    try{
      const result=await call({action,proposal_id:proposal.id});
      if(action==="apply"){if(typeof result.applied!=="number"||result.applied<1)throw new Error("لم يتم تأكيد إدراج كاميرات");onApplied()}
      else setProposal(null);
    }catch(e){setErrorText(e instanceof Error?e.message:"تعذر اتخاذ القرار")}finally{setBusy(false)}
  }
  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4" dir="rtl">
    <h3 className="font-bold">مقترح الوكيل الهندسي — Azure Foundry</h3>
    <p className="text-xs text-muted-foreground">توليد مستقل عن المحرك الحتمي المحلي. لا يعدّل المشروع حتى مراجعتك واعتمادك، ويُرفض المقترح إن تغير المخطط بعد إنشائه.</p>
    <div className="flex flex-wrap gap-2">
      {!approved&&<Button disabled={busy} onClick={()=>void approve()}>اعتماد المخطط والمقياس والجدران</Button>}
      <Button disabled={busy||!approved} onClick={()=>void generate()} variant="outline">توليد مقترح الوكيل</Button>
      {approved&&<span className="self-center text-xs text-emerald-700">المخطط معتمد للتوليد</span>}
    </div>
    {proposal&&<div className="space-y-3 rounded-lg border border-primary/30 p-3">
      <strong className="block text-sm">{proposal.summary||"مقترح قابل للمراجعة"}</strong>
      <p className="text-xs text-muted-foreground">عدد الكاميرات المقترحة: {proposal.cameras.length}</p>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {proposal.cameras.map((cam,i)=><div key={i} className="rounded border p-2 text-xs">
          <strong>{cam.cameraModelId}</strong> — ({Number(cam.xM).toFixed(1)}, {Number(cam.yM).toFixed(1)}) م
          {Number.isFinite(cam.ppmAtTarget)&&<span> · {cam.ppmAtTarget} PPM</span>}
          {cam.reason&&<p className="mt-1 text-muted-foreground">{cam.reason}</p>}
        </div>)}
      </div>
      <div className="flex gap-2">
        <Button disabled={busy||!proposal.cameras.length} onClick={()=>void decide("apply")}>اعتماد وإضافة الكاميرات</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void decide("reject")}>رفض المقترح</Button>
      </div>
    </div>}
    {busy&&<p role="status" className="text-sm">جارٍ تنفيذ العملية...</p>}
    {errorText&&<p role="alert" className="rounded-md bg-red-50 p-3 text-xs text-red-700">{errorText}</p>}
  </section>;
}
