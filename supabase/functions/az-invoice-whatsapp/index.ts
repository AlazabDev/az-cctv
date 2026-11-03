import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req)=>{
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const key=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!key||req.headers.get("authorization")!=="Bearer "+key)return reply({error:"Unauthorized"},401);
 if(env("STORE_INVOICE_DELIVERY_ENABLED")!=="true")return reply({error:"Delivery disabled"},503);
 let input:{order_id?:unknown};try{input=await req.json()}catch{return reply({error:"Invalid request"},400)}
 if(typeof input.order_id!=="string"||!uuid.test(input.order_id))return reply({error:"Invalid order ID"},400);
 const db=createClient(env("SUPABASE_URL"),key,{auth:{persistSession:false}});
 const {data:o,error:e}=await db.from("store_checkout_payments").select("id,status,invoice_status,customer_name,customer_phone,customer_email,amount,currency,paid_at,invoice_access_token,daftra_invoice_number,whatsapp_status,email_status").eq("id",input.order_id).maybeSingle();
 if(e||!o)return reply({error:"Order not found"},404);
 if(o.status!=="paid"||o.invoice_status!=="confirmed"||!o.daftra_invoice_number)return reply({error:"Invoice not confirmed"},409);
 const apiVersion=env("WHATSAPP_GRAPH_API_VERSION"),wa=env("WHATSAPP_ACCESS_TOKEN"),waba=env("WHATSAPP_BUSINESS_ACCOUNT_ID"),phoneId=env("WHATSAPP_PHONE_NUMBER_ID");
 const template=env("WHATSAPP_INVOICE_TEMPLATE_NAME")||"payment_successful",language=env("WHATSAPP_TEMPLATE_LANGUAGE")||"ar_EG";
 if(!/^v\d+\.\d+$/.test(apiVersion)||!/^\d+$/.test(waba)||!/^\d+$/.test(phoneId)||!wa)return reply({error:"WhatsApp config incomplete"},503);
 const meta=`https://graph.facebook.com/${apiVersion}`;
 const tplUrl=new URL(meta+"/"+waba+"/message_templates");
 tplUrl.searchParams.set("name",template);tplUrl.searchParams.set("fields","name,language,status,category,components");tplUrl.searchParams.set("limit","100");
 let available:Record<string,unknown>[];
 try{
  const r=await fetch(tplUrl,{headers:{"authorization":"Bearer "+wa},signal:AbortSignal.timeout(12000)});
  if(!r.ok)return reply({error:"Cannot verify WhatsApp template"},503);
  const payload=await r.json();available=payload.data||[];
 }catch{return reply({error:"Cannot verify WhatsApp template"},503)}
 const selected=available.find(t=>t.name===template&&t.language===language&&t.status==="APPROVED"&&t.category==="UTILITY");
 if(!selected)return reply({error:"Required template not approved for selected language"},409);
 const components=Array.isArray(selected.components)?selected.components as Array<Record<string,unknown>>:[];
 const buttons=components.find(c=>c.type==="BUTTONS")?.buttons as Array<Record<string,unknown>>|undefined;
 const expected="https://cctv.alazab.com/invoice/{{1}}";
 const approvedLegacy="https://cctv.alazab.com/invoice/%7B%7B1%7D%7D{{1}}";
 if(!buttons?.some(b=>b.type==="URL"&&(b.url===expected||b.url===approvedLegacy))){
  await db.from("store_checkout_payments").update({whatsapp_status:"template_url_invalid",delivery_error:"Correct Meta payment_successful URL first"}).eq("id",o.id).neq("whatsapp_status","accepted");
  return reply({error:"Approved WhatsApp template URL is incorrect; delivery blocked"},409);
 }
 if(o.whatsapp_status==="accepted")return reply({existing:true,status:"accepted"});
 const {data:job,error:reserveError}=await db.from("store_invoice_jobs").insert({checkout_id:o.id,kind:"whatsapp",status:"reserved"}).select("id").maybeSingle();
 if(reserveError||!job)return reply({error:"Existing WhatsApp attempt requires reconciliation"},409);
 const date=new Date(o.paid_at).toLocaleDateString("en-GB",{timeZone:"Africa/Cairo"});
 const amount=Number(o.amount).toFixed(2)+" "+o.currency;
 const phone=String(o.customer_phone).replace(/^\+/,"");
 const body={messaging_product:"whatsapp",to:phone,type:"template",template:{name:template,language:{code:language},components:[
  {type:"body",parameters:[o.customer_name,o.id,amount,date].map(value=>({type:"text",text:String(value)}))},
  {type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:String(o.invoice_access_token)}]}
 ]}};
 try{
  const r=await fetch(meta+"/"+phoneId+"/messages",{method:"POST",headers:{"authorization":"Bearer "+wa,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
  const response=await r.json();
  const messageId=response.messages?.[0]?.id;
  if(!r.ok||!messageId)throw Error("Meta did not confirm acceptance");
  await db.from("store_invoice_jobs").update({status:"succeeded",external_id:messageId}).eq("id",job.id);
  await db.from("store_checkout_payments").update({whatsapp_status:"accepted",delivery_error:null}).eq("id",o.id);
  return reply({accepted:true,message_id:messageId});
 }catch(e){
  await db.from("store_invoice_jobs").update({status:"reconcile_required",error:String(e).slice(0,350)}).eq("id",job.id);
  await db.from("store_checkout_payments").update({whatsapp_status:"reconcile_required",delivery_error:"Meta delivery attempt ambiguous"}).eq("id",o.id);
  return reply({error:"WhatsApp attempt requires reconciliation"},502);
 }
});
