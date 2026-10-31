import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProductCatalog } from "@/lib/cctv/product-catalog";
import type { CameraSpec, PlanData } from "@/lib/cctv/types";
import { distanceForPpm, ppmAtDistance } from "@/lib/cctv/geometry";
import { cameraDeployment } from "@/lib/cctv/deployment";
import { GOAL_PPM } from "@/lib/cctv/auto-design";

const schema = z.object({
  projectId: z.string().uuid(),
  layoutId: z.string().min(1).max(120),
  goal: z.enum(["detect", "observe", "recognize", "identify"]),
  scope: z.enum(["entrances", "corridors", "perimeter", "general"]),
  maxCameras: z.number().int().min(1).max(32),
  budget: z.number().finite().nonnegative().optional(),
  requirements: z.string().trim().max(1600),
  feedback: z.string().trim().max(1200).optional(),
});
const placementSchema = z.object({
  specId: z.string().min(1),
  xM: z.number().finite(),
  yM: z.number().finite(),
  rotationDeg: z.number().finite(),
  heightM: z.number().finite().positive(),
  tiltDeg: z.number().finite().min(0).max(89),
  targetDistanceM: z.number().finite().positive(),
  rationale: z.string().trim().min(12).max(650),
});
const outputSchema = z.object({
  summary: z.string().max(1000).default(""),
  cameras: z.array(placementSchema).max(32),
});
type P = z.infer<typeof placementSchema>;
type Point = {x:number;y:number};

function crosses(a:Point,b:Point,c:Point,d:Point) {
  const o=(p:Point,q:Point,r:Point)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const o1=o(a,b,c),o2=o(a,b,d),o3=o(c,d,a),o4=o(c,d,b);
  return o1*o2<0&&o3*o4<0;
}
function verify(p:P,spec:CameraSpec,plan:PlanData,ppm:number) {
  const scale=plan.pxPerMeter;
  const width=(plan.imageWidth??0)/scale,height=(plan.imageHeight??0)/scale;
  if(p.xM<0||p.yM<0||p.xM>width||p.yM>height||p.heightM>Math.max(plan.ceilingHeightM,1)+0.1)return null;
  if(!(spec.hfov>0&&spec.hfov<180&&spec.hres>0&&spec.engineeringReady))return null;
  const rot=((p.rotationDeg%360)+360)%360;
  const rad=rot*Math.PI/180;
  const a={x:p.xM,y:p.yM};
  const target={x:a.x+p.targetDistanceM*Math.cos(rad),y:a.y+p.targetDistanceM*Math.sin(rad)};
  if(target.x<0||target.y<0||target.x>width||target.y>height)return null;
  const opaque=plan.walls.filter(w=>w.kind!=="fence"&&!["glass","double-glass","thick-glass"].includes(w.material));
  const blocked=opaque.some(w=>w.points.slice(1).some((pt,i)=>crosses(a,target,
    {x:w.points[i]!.x/scale,y:w.points[i]!.y/scale},{x:pt.x/scale,y:pt.y/scale})));
  if(blocked||p.targetDistanceM>distanceForPpm(spec,ppm))return null;
  const optical=cameraDeployment({heightM:p.heightM,tilt:p.tiltDeg},spec);
  if(!Number.isFinite(optical.near)||optical.near>p.targetDistanceM)return null;
  const measured=ppmAtDistance(spec,p.targetDistanceM);
  return {id:crypto.randomUUID(),spec,pos:a,rotation:rot,heightM:p.heightM,tilt:p.tiltDeg,
    targetDistanceM:p.targetDistanceM,blindSpotM:optical.near,ppmAtTarget:Math.round(measured),
    gainPct:0,reason:p.rationale};
}

export const generateAiSiteDesign = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((value)=>schema.parse(value))
  .handler(async({data,context})=>{
    const key=process.env["LOVABLE_API_KEY"];
    if(!key)return {error:"LOVABLE_API_KEY is not configured on the server"};
    const {data:project,error}=await context.supabase.from("cctv_projects")
      .select("id,data").eq("id",data.projectId).maybeSingle();
    if(error||!project)return {error:"Project not found or access denied"};
    const stored=(project.data??{}) as Record<string,unknown>;
    const layouts=Array.isArray(stored.layouts)?stored.layouts as Array<PlanData&{id:string}>:[];
    const plan=layouts.length?layouts.find(l=>l.id===data.layoutId):stored as unknown as PlanData;
    if(!plan||!(plan.pxPerMeter>0)||!(plan.imageWidth&&plan.imageHeight)||!Array.isArray(plan.walls))
      return {error:"Calibrate and save the floorplan before AI design"};
    if(plan.walls.length===0)return {error:"Define the wall geometry before AI design"};
    const {data:rows,error:catalogError}=await context.supabase.from("products").select("*")
      .eq("is_active",true).eq("published",true).limit(1500);
    if(catalogError||!rows)return {error:"Product catalogue unavailable"};
    const catalog=buildProductCatalog(rows);
    const specs=catalog.cameras.filter(s=>s.engineeringReady&&s.opticsVerified&&s.productId);
    if(!specs.length)return {error:"No manufacturer-verified camera optics available"};
    const allowed=specs.slice(0,80);
    const ppm=GOAL_PPM[data.goal];
    const prompt={
      dimensionsM:{width:plan.imageWidth/plan.pxPerMeter,height:plan.imageHeight/plan.pxPerMeter},
      ceilingHeightM:plan.ceilingHeightM,pxPerMeter:plan.pxPerMeter,
      walls:plan.walls.map(w=>({kind:w.kind,material:w.material,pointsM:w.points.map(p=>({
        x:p.x/plan.pxPerMeter,y:p.y/plan.pxPerMeter}))})),
      entries:plan.roomLabels.filter(r=>/باب|مدخل|ممر|entrance|door|corridor/i.test(r.text)).map(r=>({
        label:r.text,xM:r.x/plan.pxPerMeter,yM:r.y/plan.pxPerMeter})),
      existing:plan.devices.filter(d=>d.kind==="camera").map(d=>({
        xM:d.x/plan.pxPerMeter,yM:d.y/plan.pxPerMeter,specId:d.specId,rotation:d.rotation})),
      availableCameras:allowed.map(s=>({specId:s.id,model:s.model,hres:s.hres,vres:s.vres,
        focalMm:s.focal,hfovDeg:s.hfov,vfovDeg:s.vfov,price:s.price,irRangeM:s.irRange})),
      constraints:{goal:data.goal,minimumPPM:ppm,scope:data.scope,maxCameras:data.maxCameras,
        budget:data.budget,requirements:data.requirements,feedback:data.feedback},
    };
    const endpoint=process.env["LOVABLE_AI_GATEWAY_URL"]??"https://ai.gateway.lovable.dev/v1/chat/completions";
    const model=process.env["LOVABLE_AI_MODEL"]??"openai/gpt-6-astra";
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),65_000);
    let result:Response;
    try{
      result=await fetch(endpoint,{method:"POST",
        headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
        body:JSON.stringify({model,temperature:0.2,response_format:{type:"json_object"},
          messages:[{role:"system",content:[
            "أنت مساعد تخطيط كاميرات مراقبة. EN 62676-4 / DORI إرشادات تصميم لا شهادة مطابقة.",
            "قدّم JSON فقط بمفتاحي summary و cameras. كل كاميرا: specId,xM,yM,rotationDeg,heightM,tiltDeg,targetDistanceM,rationale.",
            "استخدم حصراً specId من القائمة. احسب المقترحات من جدران وأبعاد المساحة، لا تخترع قياسات أو خصائص موقع غير مذكورة.",
            "اعتبر الجدران المعتمة عوائق للرؤية. الزجاج ليس مضمون النفاذية، والتوصيات تحتاج مراجعة مهندس.",
            "اتبع قيود العدد والميزانية، واشرح لكل كاميرا بالعربية سبب الموقع والتوجيه والتداخل.",
          ].join("\n")},{role:"user",content:JSON.stringify(prompt)}]}),
        signal:controller.signal});
    }catch{return {error:"AI Gateway request failed or timed out"}}
    finally{clearTimeout(timeout)}
    if(!result.ok)return {error:`AI Gateway returned HTTP ${result.status}. Verify configured model and permissions.`};
    const response=await result.json() as {choices?:Array<{message?:{content?:string}}>};
    const raw=response.choices?.[0]?.message?.content;
    if(!raw)return {error:"AI Gateway returned no structured content"};
    let parsed:z.infer<typeof outputSchema>;
    try{parsed=outputSchema.parse(JSON.parse(raw.replace(/^\s*```(?:json)?/,"").replace(/```\s*$/,"")))}
    catch{return {error:"AI Gateway response failed schema validation"}}
    const seen=new Set<string>(),proposals=[];
    for(const candidate of parsed.cameras.slice(0,data.maxCameras)){
      const spec=allowed.find(s=>s.id===candidate.specId);
      if(!spec)continue;
      const validated=verify(candidate,spec,plan,ppm);
      if(!validated)continue;
      const unique=`${Math.round(validated.pos.x*2)}:${Math.round(validated.pos.y*2)}`;
      if(seen.has(unique))continue;
      seen.add(unique);
      proposals.push(validated);
    }
    if(data.budget!==undefined){
      while(proposals.reduce((sum,p)=>sum+p.spec.price,0)>data.budget&&proposals.length)proposals.pop();
    }
    if(!proposals.length)return {error:"No camera candidates passed engineering verification"};
    return {summary:parsed.summary,proposals,checked:parsed.cameras.length,
      warnings:["Indicative coverage only; verify installation heights, occlusions and optical datasheets on site."]};
  });
