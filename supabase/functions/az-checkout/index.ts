import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,apikey,authorization","Access-Control-Allow-Methods":"POST,OPTIONS"}});
const env=(key:string)=>Deno.env.get(key)||"";
const url=env("SUPABASE_URL");
const admin=()=>createClient(url,env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
const validPhone=(s:string)=>/^\+?[0-9]{10,15}$/.test(s);
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,apikey,authorization","Access-Control-Allow-Methods":"POST,OPTIONS"}});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(env("STORE_CHECKOUT_ENABLED")!=="true")return json({error:"Checkout is not enabled"},503);
 const base=env("PAYTABS_API_BASE_URL"), key=env("PAYTABS_SERVER_KEY"),profile=Number(env("PAYTABS_PROFILE_ID"));
 if(!base||!key||!Number.isSafeInteger(profile)||profile<=0||!url||!env("SUPABASE_SERVICE_ROLE_KEY"))return json({error:"Payment configuration incomplete"},503);
 let target:URL;
 try{target=new URL(base);if(target.protocol!=="https:"||!/^secure(?:-egypt)?\.paytabs\.(?:com|sa)$/.test(target.hostname)||target.username||target.password||target.port||target.pathname!=="/")throw Error()}catch{return json({error:"Invalid payment endpoint"},503)}
 let input:{name?:unknown;phone?:unknown;email?:unknown;items?:unknown};
 try{input=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const name=typeof input.name==="string"?input.name.trim():"",phone=typeof input.phone==="string"?input.phone.trim():"",email=typeof input.email==="string"?input.email.trim():"";
 if(name.length<2||name.length>150||!validPhone(phone)||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return json({error:"Invalid customer contact"},400);
 if(!Array.isArray(input.items)||input.items.length<1||input.items.length>50)return json({error:"Invalid cart"},400);
 const quantities=new Map<string,number>();
 for(const item of input.items){if(!item||typeof item.id!=="string"||!(/^[a-f0-9-]{36}$/i.test(item.id))||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100||quantities.has(item.id))return json({error:"Invalid cart item"},400);quantities.set(item.id,item.quantity)}
 const db=admin();
 const {data:products,error:productError}=await db.from("products").select("id,model,product_name,name_ar,current_price,currency,is_active,published,in_stock,sku,image_url").in("id",[...quantities.keys()]).eq("is_active",true).eq("published",true);
 if(productError||!products||products.length!==quantities.size)return json({error:"Some products are unavailable"},409);
 const snapshot=[] as Array<{id:string;name:string;quantity:number;unit_price:number;sku:string|null;image_url:string|null;model:string|null}>;
 let cents=0;
 for(const p of products){const price=Number(p.current_price);if(p.currency!=="EGP"||!Number.isFinite(price)||price<=0||Math.abs(Math.round(price*100)-price*100)>1e-6||p.in_stock===false)return json({error:"Price or stock unavailable"},409);const quantity=quantities.get(p.id)!;cents+=Math.round(price*100)*quantity;snapshot.push({id:p.id,name:p.product_name||p.name_ar||p.model,quantity,unit_price:price,sku:p.sku||null,model:p.model||null,image_url:p.image_url||null})}
 if(!Number.isSafeInteger(cents)||cents<=0)return json({error:"Invalid cart total"},409);
 const amount=cents/100;
 const {data:payment,error:insertError}=await db.from("store_checkout_payments").insert({customer_name:name,customer_phone:phone,customer_email:email||null,cart:input.items,items_snapshot:snapshot,amount,currency:"EGP"}).select("id").single();
 if(insertError||!payment)return json({error:"Cannot create order"},500);
 const origin=env("AZCCTV_PUBLIC_ORIGIN").replace(/\/$/,"");
 if(!/^https:\/\/cctv\.alazab\.com$/.test(origin))return json({error:"Invalid site origin"},503);
 const requestBody={profile_id:profile,tran_type:"sale",tran_class:"ecom",cart_id:payment.id,cart_currency:"EGP",cart_amount:amount,cart_description:"AZ-CCTV equipment order",paypage_lang:"ar",callback:`${url}/functions/v1/az-paytabs-callback`,return:`${origin}/checkout/result?order_id=${payment.id}`,customer_details:{name,phone,...(email?{email}:{})}};
 try{
 const response=await fetch(new URL("/payment/request",target),{method:"POST",headers:{"authorization":key,"content-type":"application/json"},body:JSON.stringify(requestBody),signal:AbortSignal.timeout(25000)});
 const raw=await response.text();let data:Record<string,unknown>;try{data=JSON.parse(raw)}catch{throw Error("Invalid payment response")}
 if(!response.ok||typeof data.redirect_url!=="string"||typeof data.tran_ref!=="string")throw Error("Payment initiation rejected");
 const redirect=new URL(data.redirect_url);if(redirect.protocol!=="https:"||redirect.hostname!==target.hostname)throw Error("Invalid payment redirect host");
 const {error:updateError}=await db.from("store_checkout_payments").update({status:"pending",tran_ref:data.tran_ref,updated_at:new Date().toISOString()}).eq("id",payment.id).eq("status","initiating");
 if(updateError)throw Error("Cannot record payment reference");
 return json({order_id:payment.id,redirect_url:data.redirect_url});
 }catch(e){await db.from("store_checkout_payments").update({status:"needs_review",last_error:e instanceof Error?e.message:"Payment initiation error"}).eq("id",payment.id);return json({error:"Payment initiation failed",order_id:payment.id},502)}
});
