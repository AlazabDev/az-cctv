import {createClient} from "npm:@supabase/supabase-js@2.57.0";
import QRCode from "npm:qrcode@1.5.4";
const CORS={"Access-Control-Allow-Origin":"https://cctv.alazab.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type,apikey,authorization"};
const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="POST")return reply({error:"Method Not Allowed"},405);
 let input:{token?:unknown};
 try{input=await req.json()}catch{return reply({error:"Invalid request"},400)}
 if(typeof input.token!=="string"||!uuid.test(input.token))return reply({error:"Invalid invoice link"},400);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return reply({error:"Service unavailable"},503);
 const db=createClient(url,secret,{auth:{persistSession:false}});
 const {data,error}=await db.from("store_checkout_payments").select("id,customer_name,customer_phone,items_snapshot,amount,currency,paid_at,daftra_invoice_number,invoice_issued_at,invoice_status,status").eq("invoice_access_token",input.token).eq("status","paid").eq("invoice_status","confirmed").maybeSingle();
 if(error)return reply({error:"Unable to retrieve invoice"},503);
 if(!data||!data.daftra_invoice_number)return reply({error:"Invoice not available"},404);
 const qr_data_url=await QRCode.toDataURL("https://cctv.alazab.com/invoice/"+input.token,{errorCorrectionLevel:"M",width:142,margin:1});
 return reply({invoice:{qr_data_url,number:data.daftra_invoice_number,order_id:data.id,date:data.invoice_issued_at||data.paid_at,customer_name:data.customer_name,customer_phone:data.customer_phone,items:data.items_snapshot,total:data.amount,currency:data.currency,payment_method:"PayTabs",tax_id:"577219804"}});
});
