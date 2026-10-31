/**
 * AZ-CCTV Finance: authenticated, admin-only orchestration of Daftra documents.
 * Daftra owns estimates, sales invoices and purchase orders.
 * A supplier PO sent via Daftra is NOT proof of an Amazon or Kimo API order.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

type DocKind = "estimate"|"invoice"|"purchase_order";
type Supplier = "none"|"kimo"|"amazon";
type Input = {
  action?: "create_document"|"documents"|"approve_quotation";
  quotation_id?: string; kind?: DocKind; supplier?: Supplier;
  client_id?: number; supplier_id?: number;
  send?: "draft"|"direct"; approval_reference?: string;
  lines?: Array<{quotation_item_id:string; supplier_unit_price:number; daftra_product_id?:number}>;
};
const headers = {"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positiveId=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const numeric=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const env=(k:string)=>Deno.env.get(k)||"";
const safeString=(v:unknown)=>typeof v==="string"?v:"";
const digest=async(input:unknown)=>{
  const bytes=new TextEncoder().encode(JSON.stringify(input));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
};
async function daftraPost(path:string,body:unknown,send?:string){
  const base=env("DAFTRA_BASE_URL")||`https://${env("DAFTRA_SUBDOMAIN")}.daftra.com`;
  const url=new URL(base);
  if(!/^[a-z0-9-]+\.daftra\.com$/i.test(url.hostname)||url.protocol!=="https:"||url.username||url.password||url.port)throw new Error("Invalid Daftra tenant");
  const key=env("DAFTRA_API_KEY");
  if(!key)throw new Error("DAFTRA_API_KEY is not configured");
  const target=new URL("/api2/"+path+".json",url);
  if(send)target.searchParams.set("send",send);
  const res=await fetch(target,{method:"POST",headers:{APIKEY:key,Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(25000)});
  const raw=await res.text();
  let result:unknown;
  try{result=JSON.parse(raw)}catch{result={raw:raw.slice(0,1500)}}
  if(!res.ok)throw new Error("Daftra HTTP "+res.status+": "+JSON.stringify(result).slice(0,300));
  return result;
}
function externalDoc(result:unknown):{id:string;number:string}{
  if(!result||typeof result!=="object")return {id:"",number:""};
  const obj=result as Record<string,unknown>;
  const envelope=obj.data&&typeof obj.data==="object"&&!Array.isArray(obj.data)?obj.data as Record<string,unknown>:obj;
  const doc=(envelope.Invoice||envelope.Estimate||envelope.PurchaseOrder||envelope.invoice||envelope.estimate||envelope.purchase_order||envelope) as Record<string,unknown>;
  return {id:String(doc.id??doc.ID??""),number:String(doc.no??doc.number??"")};
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return respond({error:"Method Not Allowed"},405);
  try{
    const bearer=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if(!bearer)return respond({error:"Unauthorized"},401);
    const url=env("SUPABASE_URL"),anon=env("SUPABASE_ANON_KEY")||env("SUPABASE_PUBLISHABLE_KEY"),secret=env("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!anon||!secret)return respond({error:"Supabase server configuration is incomplete"},503);
    const identity=createClient(url,anon,{auth:{persistSession:false}});
    const {data:auth,error:authError}=await identity.auth.getUser(bearer);
    if(authError||!auth.user)return respond({error:"Unauthorized"},401);
    const roles=auth.user.app_metadata||{};
    if(roles.role!=="admin"&&roles.role!=="super_admin"&&roles.is_admin!==true)return respond({error:"Finance admin permission required"},403);
    const db=createClient(url,secret,{auth:{persistSession:false}});
    const input=await req.json() as Input;
    if(!input.quotation_id||!uuid.test(input.quotation_id))return respond({error:"Invalid quotation_id"},400);
    const {data:quote,error:qerr}=await db.from("store_quotations").select("id,status,user_id,currency,customer_name").eq("id",input.quotation_id).single();
    if(qerr||!quote)return respond({error:"Quotation not found"},404);
    if(input.action==="documents"){
      const {data,error}=await db.from("store_daftra_documents").select("id,kind,supplier_source,daftra_id,daftra_number,status,created_at,updated_at,last_error").eq("quotation_id",quote.id).order("created_at");
      return error?respond({error:"Cannot load documents"},500):respond({documents:data});
    }
    if(input.action==="approve_quotation"){
      if(quote.status==="accepted")return respond({status:"accepted",existing:true});
      if(!input.approval_reference||input.approval_reference.trim().length<5)return respond({error:"Documented customer approval reference is required"},400);
      const {data:estimate}=await db.from("store_daftra_documents").select("id").eq("quotation_id",quote.id).eq("kind","estimate").eq("status","confirmed").maybeSingle();
      if(!estimate)return respond({error:"A confirmed Daftra estimate is required before acceptance"},409);
      if(env("DAFTRA_FINANCE_WRITES_ENABLED")!=="true")return respond({error:"Finance writes are disabled"},503);
      const {error}=await db.from("store_quotations").update({status:"accepted",approval_reference:input.approval_reference.trim()}).eq("id",quote.id).neq("status","accepted");
      return error?respond({error:"Could not record approval"},500):respond({status:"accepted"});
    }
    if(input.action!=="create_document")return respond({error:"Unsupported action"},400);
    const kind=input.kind,supplier:Supplier=kind==="purchase_order"?(input.supplier||"none"):"none";
    if(!kind||!["estimate","invoice","purchase_order"].includes(kind))return respond({error:"Invalid kind"},400);
    if(kind==="purchase_order"&&!["kimo","amazon"].includes(supplier))return respond({error:"Select Kimo or Amazon as supplier"},400);
    if((kind==="estimate"||kind==="invoice")&&!positiveId(input.client_id))return respond({error:"A mapped Daftra client ID is required"},400);
    if(kind==="purchase_order"&&!positiveId(input.supplier_id))return respond({error:"A mapped Daftra supplier ID is required"},400);
    if(kind!=="estimate"&&quote.status!=="accepted")return respond({error:"Customer acceptance is required"},409);
    if(env("DAFTRA_FINANCE_WRITES_ENABLED")!=="true")return respond({error:"Finance writes are disabled"},503);
    const {data:lines,error:lerr}=await db.from("store_quotation_items").select("id,product_id,product_name,quantity,unit_price").eq("quotation_id",quote.id);
    if(lerr||!lines?.length)return respond({error:"Quotation has no lines"},409);
    const {data:previous}=await db.from("store_daftra_documents").select("daftra_id,status").eq("quotation_id",quote.id).eq("kind","estimate").eq("supplier_source","none").maybeSingle();
    if(kind!=="estimate"&&(!previous||previous.status!=="confirmed"||!positiveId(Number(previous.daftra_id))))return respond({error:"Confirmed Daftra estimate reference required"},409);
    let payload:Record<string,unknown>,path:string,send:string|undefined;
    if(kind==="estimate"||kind==="invoice"){
      const items=lines.map(l=>({item:l.product_name,quantity:l.quantity,unit_price:Number(l.unit_price)}));
      if(items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<=0||!numeric(i.unit_price)))return respond({error:"Invalid quoted line values"},409);
      payload={Invoice:{client_id:input.client_id,currency_code:quote.currency,notes:`AZ-CCTV quotation ${quote.id}`,...(kind==="invoice"?{estimate_id:Number(previous!.daftra_id),draft:true}:{draft:true})},InvoiceItem:items};
      path=kind==="estimate"?"estimates":"invoices";
    }else{
      if(input.send&&input.send!=="draft"&&input.send!=="direct")return respond({error:"Only draft or direct supplier delivery allowed"},400);
      if(input.send==="direct"&&(!input.approval_reference||input.approval_reference.trim().length<5))return respond({error:"Documented purchase approval is required before sending to supplier"},400);
      if(!Array.isArray(input.lines)||input.lines.length!==lines.length)return respond({error:"Explicit supplier cost mapping is required for every quote line"},400);
      const selected=new Map(input.lines.map(l=>[l.quotation_item_id,l]));
      if(selected.size!==lines.length)return respond({error:"Duplicate supplier item mapping"},400);
      const items=[];
      for(const line of lines){
        const mapped=selected.get(line.id);
        if(!mapped||!numeric(mapped.supplier_unit_price))return respond({error:"Invalid supplier unit price or quotation line mapping"},400);
        items.push({item:line.product_name,quantity:line.quantity,unit_price:mapped.supplier_unit_price,...(positiveId(mapped.daftra_product_id)?{product_id:mapped.daftra_product_id}:{})});
      }
      payload={PurchaseOrder:{supplier_id:input.supplier_id,currency_code:quote.currency,notes:`AZ-CCTV quotation ${quote.id}; supplier=${supplier}; estimate=${previous!.daftra_id}; approval=${input.approval_reference||"draft"}`},PurchaseOrderItem:items};
      path="purchase_orders";send=input.send||"draft";
    }
    const hash=await digest({kind,supplier,payload,send});
    const requestKey=`${quote.id}:${kind}:${supplier}`;
    const {data:reservation,error:reserveError}=await db.from("store_daftra_documents").insert({quotation_id:quote.id,kind,supplier_source:supplier,requested_by:auth.user.id,request_key:requestKey,payload_hash:hash,status:"reserved"}).select("id").maybeSingle();
    if(reserveError||!reservation){
      const {data:existing}=await db.from("store_daftra_documents").select("id,status,daftra_id,daftra_number,payload_hash").eq("request_key",requestKey).maybeSingle();
      if(existing)return respond({existing:true,document:existing,notice:"Existing reservation: never retry an ambiguous Daftra request automatically"},200);
      return respond({error:"Could not reserve finance document"},409);
    }
    try{
      const output=await daftraPost(path,payload,send);
      const doc=externalDoc(output);
      if(!doc.id||!/^\d+$/.test(doc.id))throw new Error("Daftra response did not provide a verifiable document id; manual reconciliation required");
      const {error:updateError}=await db.from("store_daftra_documents").update({daftra_id:doc.id,daftra_number:doc.number,status:"confirmed",updated_at:new Date().toISOString(),response_meta:{source:"daftra",supplier_dispatch:send==="direct"?"requested":"not_requested"}}).eq("id",reservation.id);
      if(updateError)throw new Error("Document created in Daftra but local link update failed; reconcile manually");
      return respond({id:reservation.id,kind,daftra_id:doc.id,daftra_number:doc.number,supplier,dispatch:send==="direct"?"sent_via_daftra_requested":"draft_only"},201);
    }catch(error){
      await db.from("store_daftra_documents").update({status:"reconcile_required",last_error:String(error instanceof Error?error.message:error).slice(0,500),updated_at:new Date().toISOString()}).eq("id",reservation.id);
      return respond({error:"Daftra request could be ambiguous; reconcile in Daftra before retry",document_id:reservation.id,detail:String(error instanceof Error?error.message:error).slice(0,300)},502);
    }
  }catch(error){
    console.error("az-finance",error instanceof Error?error.message:"Unexpected error");
    return respond({error:"Finance operation failed"},500);
  }
});
