import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const env=(x:string)=>Deno.env.get(x)||"";
const ok=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const base=()=>{const u=new URL(env("DAFTRA_BASE_URL")||`https://${env("DAFTRA_SUBDOMAIN")}.daftra.com`);if(u.protocol!=="https:"||!/^[-a-z0-9]+\.(daftra|daftara)\.com$/i.test(u.hostname)||u.port||u.username||u.password)throw Error("Unapproved Daftra host");return u};
async function daftra(path:string,method:"GET"|"POST",payload?:unknown){
 const u=new URL("/api2/"+path+".json",base());const key=env("DAFTRA_API_KEY");
 if(!key)throw Error("DAFTRA_API_KEY missing");
 const r=await fetch(u,{method,headers:{"APIKEY":key,"Accept":"application/json","Content-Type":"application/json"},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(25000),redirect:"error"});
 const raw=await r.text();let data:Record<string,unknown>;try{data=JSON.parse(raw)}catch{throw Error("Invalid Daftra reply")}
 if(!r.ok)throw Error("Daftra HTTP "+r.status);
 return data;
}
const idOf=(d:Record<string,unknown>)=>{const v=d.data&&typeof d.data==="object"?d.data as Record<string,unknown>:d;const nested=(v.Invoice||v.Client||v.invoice||v.client||v) as Record<string,unknown>;return String(nested.id||nested.ID||"")};
async function reserve(db:ReturnType<typeof createClient>,checkout_id:string,kind:string){
 const {data,error}=await db.from("store_invoice_jobs").insert({checkout_id,kind,status:"reserved"}).select("id,status,external_id").maybeSingle();
 if(!error&&data)return {job:data,fresh:true};
 const previous=await db.from("store_invoice_jobs").select("id,status,external_id").eq("checkout_id",checkout_id).eq("kind",kind).maybeSingle();
 if(previous.error||!previous.data)throw Error("Cannot reserve job");
 return {job:previous.data,fresh:false};
}
Deno.serve(async req=>{
 if(req.method!=="POST")return ok({error:"Method not allowed"},405);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(!token||token!==env("SUPABASE_SERVICE_ROLE_KEY"))return ok({error:"Unauthorized"},401);
 if(env("DAFTRA_FINANCE_WRITES_ENABLED")!=="true")return ok({error:"Finance writes not enabled"},503);
 let input:{order_id?:string};try{input=await req.json()}catch{return ok({error:"Invalid JSON"},400)}
 if(!input.order_id||!uuid.test(input.order_id))return ok({error:"Invalid order ID"},400);
 const db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
 const {data:order,error}=await db.from("store_checkout_payments").select("id,status,invoice_status,customer_name,customer_phone,customer_email,amount,currency,items_snapshot,daftra_client_id,daftra_invoice_id,daftra_invoice_number").eq("id",input.order_id).maybeSingle();
 if(error||!order)return ok({error:"Order not found"},404);
 if(order.status!=="paid")return ok({error:"Payment not confirmed"},409);
 if(order.invoice_status==="confirmed"&&order.daftra_invoice_id)return ok({invoice_id:order.daftra_invoice_id,existing:true});
 if(order.currency!=="EGP"||!Array.isArray(order.items_snapshot)||!order.items_snapshot.length)return ok({error:"Invalid order snapshot"},409);
 let clientId=order.daftra_client_id||"";
 if(!clientId){
  const {job,fresh}=await reserve(db,order.id,"daftra_client");
  if(!fresh){
   if(job.status!=="succeeded"||!job.external_id)return ok({error:"Client creation reconciliation required"},409);
   clientId=job.external_id;
  }else{
   try{
    const data=await daftra("clients","POST",{Client:{business_name:order.customer_name,phone1:order.customer_phone,...(order.customer_email?{email:order.customer_email}:{}),country_code:"EG",default_currency_code:"EGP"}});
    clientId=idOf(data);if(!/^\d+$/.test(clientId))throw Error("Missing new client ID");
    await db.from("store_invoice_jobs").update({status:"succeeded",external_id:clientId,updated_at:new Date().toISOString()}).eq("id",job.id);
   }catch(e){
    await db.from("store_invoice_jobs").update({status:"reconcile_required",error:String(e).slice(0,350)}).eq("id",job.id);
    return ok({error:"Client operation requires reconciliation"},502);
   }
  }
  const {error:saveClient}=await db.from("store_checkout_payments").update({daftra_client_id:clientId}).eq("id",order.id);
  if(saveClient)return ok({error:"Cannot persist Daftra client ID"},503);
 }
 const {job,fresh}=await reserve(db,order.id,"daftra_invoice");
 if(!fresh){
  if(job.status!=="succeeded"||!job.external_id)return ok({error:"Invoice operation requires reconciliation"},409);
 }else{
  try{
   const items=(order.items_snapshot as Array<Record<string,unknown>>).map(i=>({item:String(i.name||""),quantity:Number(i.quantity),unit_price:Number(i.unit_price)}));
   if(items.some(i=>!i.item||!Number.isSafeInteger(i.quantity)||i.quantity<1||!Number.isFinite(i.unit_price)||i.unit_price<=0))throw Error("Invalid items");
   const total=items.reduce((sum,i)=>sum+i.quantity*i.unit_price,0);
   if(Math.round(total*100)!==Math.round(Number(order.amount)*100))throw Error("Price snapshot mismatch");
   const data=await daftra("invoices","POST",{Invoice:{client_id:Number(clientId),currency_code:"EGP",draft:false,notes:`AZ-CCTV order ${order.id}; Payment confirmed in PayTabs`},InvoiceItem:items});
   const invoiceId=idOf(data);if(!/^\d+$/.test(invoiceId))throw Error("Missing invoice ID");
   const {error:save}=await db.from("store_invoice_jobs").update({status:"succeeded",external_id:invoiceId,updated_at:new Date().toISOString()}).eq("id",job.id);
   if(save)return ok({error:"Invoice created but local reservation update failed; reconcile before retry"},502);
  }catch(e){
   await db.from("store_invoice_jobs").update({status:"reconcile_required",error:String(e).slice(0,350)}).eq("id",job.id);
   return ok({error:"Invoice creation requires reconciliation"},502);
  }
 }
 const invRow=await db.from("store_invoice_jobs").select("external_id").eq("checkout_id",order.id).eq("kind","daftra_invoice").single();
 if(invRow.error||!invRow.data?.external_id)return ok({error:"Invoice reference missing"},503);
 const invoiceId=invRow.data.external_id;
 let invoiceNumber="";
 try{
  const retrieved=await daftra("invoices/"+invoiceId,"GET");
  const d=retrieved.data&&typeof retrieved.data==="object"?retrieved.data as Record<string,unknown>:retrieved;
  const inv=(d.Invoice||d.invoice||d) as Record<string,unknown>;
  invoiceNumber=String(inv.no||inv.invoice_number||"");
 }catch{return ok({error:"Daftra invoice created, retrieval requires reconciliation"},503)}
 if(!invoiceNumber)return ok({error:"Invoice number unavailable; reconciliation required"},503);
 const {error:finalError}=await db.from("store_checkout_payments").update({daftra_invoice_id:invoiceId,daftra_invoice_number:invoiceNumber,invoice_status:"confirmed",invoice_issued_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",order.id).eq("status","paid");
 if(finalError)return ok({error:"Invoice reconciliation required"},503);
 return ok({invoice_id:invoiceId,invoice_number:invoiceNumber,confirmed:true});
});
