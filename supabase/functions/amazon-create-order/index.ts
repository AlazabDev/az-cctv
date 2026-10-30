import { serveAdmin,adminDb,amazonRequest,amazonSandbox,amazonMarket } from "../_shared/amazon.ts";

type Address={name:string;addressLine1:string;city:string;stateOrRegion:string;postalCode:string;countryCode:string;phone?:string};
type Quote={id:string;user_id:string;status:string;total:number;currency:string};
type Line={id:string;product_id:string;quantity:number;product_name:string};
Deno.serve(req=>serveAdmin(req,async()=>{
 const input=await req.json() as {quotation_id?:string;destination?:Address;approve_sandbox?:boolean};
 if(Deno.env.get("SP_API_MCF_ENABLED")!=="true")throw new Error("Amazon MCF is disabled; enable only after verifying FBA stock and seller permissions");
 if(!amazonSandbox()&&Deno.env.get("SP_API_MCF_PRODUCTION_APPROVED")!=="true")throw new Error("Production MCF requires separate approval");
 if(amazonSandbox()&&input.approve_sandbox!==true)throw new Error("Sandbox MCF requires explicit approval");
 if(!input.quotation_id||!/^[0-9a-f-]{36}$/i.test(input.quotation_id))throw new Error("Invalid quote identifier");
 const destination=input.destination;
 if(!destination||destination.countryCode!=="EG"||!destination.name||!destination.addressLine1||!destination.city||!destination.postalCode)throw new Error("Complete Egyptian shipping address required");
 amazonMarket();
 const sellerId=Deno.env.get("SP_API_SELLER_ID");
 if(!sellerId||sellerId===amazonMarket())throw new Error("SP_API_SELLER_ID must be the actual seller account ID, not the Egypt marketplace ID");
 const db=adminDb();
 const {data:quote,error:quoteError}=await db.from("store_quotations").select("id,user_id,status,total,currency").eq("id",input.quotation_id).maybeSingle();
 if(quoteError||!quote)throw new Error("Quotation not found");
 const q=quote as Quote;
 if(q.status!=="accepted")throw new Error("Only accepted quotations may become fulfillment orders");
 const {data:existing}=await db.from("store_orders").select("id,status,fulfillment_order_id").eq("quotation_id",q.id).maybeSingle();
 if(existing)return {existing:true,order_id:existing.id,status:existing.status,fulfillment_order_id:existing.fulfillment_order_id};
 const {data:lines,error:lineError}=await db.from("store_quotation_items").select("id,product_id,quantity,product_name").eq("quotation_id",q.id);
 if(lineError||!lines?.length)throw new Error("Quote has no line items");
 const ids=(lines as Line[]).map(x=>x.product_id).filter(Boolean);
 const {data:products,error:productError}=await db.from("products").select("id,metadata").in("id",ids);
 if(productError||!products||products.length!==ids.length)throw new Error("Missing canonical products");
 const items=(lines as Line[]).map((line,i)=>{
  const product=products.find(p=>p.id===line.product_id);
  const meta=product?.metadata&&typeof product.metadata==="object"&&!Array.isArray(product.metadata)?product.metadata as Record<string,unknown>:{};
  const sellerSku=meta.amazon_seller_sku;
  if(typeof sellerSku!=="string"||sellerSku.length<1||sellerSku.length>100)throw new Error("Every line must have a verified Amazon FBA seller SKU");
  return {sellerSku,sellerFulfillmentOrderItemId:String(i+1),quantity:line.quantity};
 });
 const fulfillmentId="AZCCTV-"+q.id;
 const payload={sellerFulfillmentOrderId:fulfillmentId,displayableOrderId:fulfillmentId,displayableOrderDate:new Date().toISOString(),displayableOrderComment:"AZ-CCTV approved fulfillment",shippingSpeedCategory:"Standard",destinationAddress:destination,items};
 const {data:order,error:createError}=await db.from("store_orders").insert({quotation_id:q.id,user_id:q.user_id,status:"pending",fulfillment_order_id:fulfillmentId,shipping_address:destination,amount:q.total,currency:q.currency}).select("id").single();
 if(createError||!order)throw new Error("Could not register idempotent local order");
 const started=Date.now();
 try{
  const result=await amazonRequest("/fba/outbound/2020-07-01/fulfillmentOrders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  await db.from("store_orders").update({status:"submitted",amazon_response:result,updated_at:new Date().toISOString()}).eq("id",order.id);
  await db.from("store_amazon_api_logs").insert({endpoint:"/fba/outbound/2020-07-01/fulfillmentOrders",method:"POST",status_code:200,execution_time_ms:Date.now()-started,request_summary:{quotation_id:q.id,sandbox:amazonSandbox(),item_count:items.length}});
  return {order_id:order.id,fulfillment_order_id:fulfillmentId,sandbox:amazonSandbox(),status:"submitted"};
 }catch(error){
  await db.from("store_orders").update({status:"failed",last_error:"Amazon rejected or could not complete the request",updated_at:new Date().toISOString()}).eq("id",order.id);
  await db.from("store_amazon_api_logs").insert({endpoint:"/fba/outbound/2020-07-01/fulfillmentOrders",method:"POST",execution_time_ms:Date.now()-started,request_summary:{quotation_id:q.id,sandbox:amazonSandbox(),failed:true}});
  throw error;
 }
}));