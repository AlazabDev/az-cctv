import {createClient} from "npm:@supabase/supabase-js@2";
const endpoint=(Deno.env.get("AZURE_AGENT_ENDPOINT")||"").replace(/\/$/,"");
const name=Deno.env.get("AZURE_COMMERCE_AGENT_NAME")||"az-agent-sol";
const version=Deno.env.get("AZURE_COMMERCE_AGENT_VERSION")||"3";
const cors={"Access-Control-Allow-Origin":Deno.env.get("AZCCTV_PUBLIC_ORIGIN")||"https://cctv.alazab.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const definitions=[
 {type:"function",name:"search_products",description:"Find matching CCTV and networking products in the AZ-CCTV master catalog. Never invent stock.",parameters:{type:"object",properties:{query:{type:"string"},category:{type:"string"}},required:["query"],additionalProperties:false}},
 {type:"function",name:"get_pricing",description:"Read current indicative AZ-CCTV catalog prices by product UUID, not Amazon purchase prices.",parameters:{type:"object",properties:{ids:{type:"array",items:{type:"string"}}},required:["ids"],additionalProperties:false}},
 {type:"function",name:"calculate_system",description:"Generate an indicative, non-engineering site camera/storage/network estimate. Requires survey and DORI verification.",parameters:{type:"object",properties:{site_area_sqm:{type:"number"},camera_resolution_mp:{type:"number"},recording_days:{type:"integer"}},required:["site_area_sqm","camera_resolution_mp","recording_days"],additionalProperties:false}},
 {type:"function",name:"create_quotation",description:"Do not submit automatically: return a confirmation requirement and direct the user to /cart then /quote.",parameters:{type:"object",properties:{product_ids:{type:"array",items:{type:"string"}}},required:["product_ids"],additionalProperties:false}},
 {type:"function",name:"submit_order",description:"Never place a shipping or payment order through a conversational response.",parameters:{type:"object",properties:{quotation_id:{type:"string"}},required:["quotation_id"],additionalProperties:false}},
];
function textOf(r:any):string {
 if(typeof r?.output_text==="string")return r.output_text;
 return (r?.output||[]).filter((x:any)=>x.type==="message").flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||"").filter(Boolean).join("\n");
}
function clean(s:unknown,len=100):string {return typeof s==="string"?s.replace(/[,().*"\\]/g," ").trim().slice(0,len):""}
function validId(s:unknown):s is string{return typeof s==="string"&&/^[0-9a-f-]{36}$/i.test(s)}
function estimate(arg:any){
 const sqm=Math.max(10,Math.min(200000,Number(arg.site_area_sqm)||100));
 const mp=Math.max(2,Math.min(12,Number(arg.camera_resolution_mp)||4));
 const days=Math.max(1,Math.min(90,Number(arg.recording_days)||30));
 const cams=Math.max(1,Math.ceil(sqm/40));
 const nvr=[4,8,16,32,64].find(n=>n>=cams)||Math.ceil(cams/64)*64;
 const gbPerCamDay=mp*6; // planning assumption only, not manufacturer bitrate
 return {indicative_only:true,assumptions:"40 sqm/camera and 6 GB per MP per camera-day are preliminary placeholders, not a coverage/bitrate design",cameras:cams,nvr_channels:nvr,poe_switches:Math.ceil(cams/8),storage_tb:Math.ceil(cams*gbPerCamDay*days/1000),requires:"floorplan, verified lens/FOV, camera bitrate, scene and recording duty cycle"};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 const key=Deno.env.get("AZURE_API_KEY");
 const url=Deno.env.get("SUPABASE_URL");
 const anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!key||!url||!anon||!endpoint)return reply({error:"server_configuration_missing"},503);
 const auth=req.headers.get("Authorization")||"";
 const db=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await db.auth.getUser();
 if(userError||!user)return reply({error:"sign_in_required"},401);
 let input:{message?:string;thread_id?:string};
 try{input=await req.json()}catch{return reply({error:"invalid_json"},400)}
 const message=clean(input.message,2000);
 if(!message)return reply({error:"message_required"},400);
 let threadId=input.thread_id;
 if(threadId&&!validId(threadId))return reply({error:"invalid_thread"},400);
 let previous:string|undefined;
 if(threadId){
  const {data}=await db.from("agent_threads").select("id,last_response_id").eq("id",threadId).maybeSingle();
  if(!data)return reply({error:"thread_not_found"},404);
  previous=data.last_response_id||undefined;
 }else{
  const {data,error}=await db.from("agent_threads").insert({user_id:user.id,title:"تجارة: "+message.slice(0,55)}).select("id").single();
  if(error||!data)return reply({error:"cannot_create_thread"},500);
  threadId=data.id;
 }
 await db.from("agent_messages").insert({thread_id:threadId,user_id:user.id,role:"user",content:message,agent_name:name,agent_version:version});
 async function execute(tool:string,args:any):Promise<unknown>{
  if(tool==="calculate_system")return estimate(args);
  if(tool==="create_quotation")return {requires_confirmation:true,route:"/cart",message:"Add the products to your cart, then confirm the quote request form. No quote was created by the agent."};
  if(tool==="submit_order")return {status:"blocked",message:"Orders require an accepted quotation and authorized human approval; no order was placed."};
  if(tool==="search_products"){
   const q=clean(args.query,80);if(q.length<2)return [];
   let query=db.from("products").select("id,brand,model,product_name,category,current_price,currency,image_url,availability").eq("is_active",true).eq("published",true).or(`product_name.ilike.%${q}%,model.ilike.%${q}%,brand.ilike.%${q}%`).limit(8);
   if(args.category)query=query.eq("category",clean(args.category,50));
   const {data,error}=await query;if(error)throw new Error("Catalog query failed");return data;
  }
  if(tool==="get_pricing"){
   const ids=Array.isArray(args.ids)?args.ids.filter(validId).slice(0,10):[];
   if(!ids.length)return [];
   const {data,error}=await db.from("products").select("id,brand,model,current_price,currency,availability,updated_at").in("id",ids).eq("is_active",true);
   if(error)throw new Error("Price lookup failed");return data;
  }
  return {error:"unknown_tool"};
 }
 let payload:any={agent:{type:"agent_reference",name,version},input:[{role:"system",content:"You are AZ-CCTV commercial assistant. Respond in Arabic. Always use verified catalog tools for products and prices. Do not invent stock, engineering specifications, checkout success or Amazon fulfillment. System design estimates are indicative only. Require human confirmation to create a quotation or order."},{role:"user",content:message}],tools:definitions};
 if(previous)payload.previous_response_id=previous;
 let result:any,turns=0;
 try{
  do{
   const upstream=await fetch(endpoint+"/openai/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","api-key":key},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
   if(!upstream.ok)throw new Error("Foundry unavailable: "+upstream.status);
   result=await upstream.json();
   const calls=(result.output||[]).filter((x:any)=>x.type==="function_call").slice(0,6);
   if(!calls.length)break;
   const outs=[];
   for(const call of calls){
    let args:any={};try{args=JSON.parse(call.arguments||"{}")}catch{}
    let output:unknown;try{output=await execute(call.name,args)}catch{output={error:"tool_execution_failed"}}
    outs.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(output)});
   }
   payload={agent:{type:"agent_reference",name,version},previous_response_id:result.id,input:outs,tools:definitions};
  }while(++turns<4);
 }catch{return reply({error:"commercial_agent_unavailable",thread_id:threadId},502)}
 const answer=textOf(result)||"لا تتوفر إجابة موثقة حاليًا. يمكنك تصفح المتجر أو إرسال طلب عرض سعر.";
 await db.from("agent_messages").insert({thread_id:threadId,user_id:user.id,role:"assistant",content:answer,agent_name:name,agent_version:version,response_id:result?.id||null});
 if(result?.id)await db.from("agent_threads").update({last_response_id:result.id}).eq("id",threadId);
 return reply({thread_id:threadId,response:answer,tool_turns:turns});
});