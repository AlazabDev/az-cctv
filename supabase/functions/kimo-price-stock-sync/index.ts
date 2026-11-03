import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors={
  "Content-Type":"application/json",
  "Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type",
};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
const maxBatch=25;

type Monitor={id:number;product_id:string;handle:string;source_url:string;last_checked_at:string|null};
type Snapshot={price:number;available:boolean};
async function fetchProduct(handle:string):Promise<Snapshot> {
  if(!/^[a-zA-Z0-9_-]+$/.test(handle))throw new Error("Invalid supplier handle");
  const url="https://kimostore.net/products/"+encodeURIComponent(handle)+".js";
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{headers:{Accept:"application/json"},redirect:"error",signal:controller.signal});
    if(!response.ok)throw new Error("Kimo HTTP "+response.status);
    const body=await response.json() as {variants?:Array<{price?:unknown;available?:unknown}>;currency?:string;handle?:string};
    if(body.handle&&body.handle!==handle)throw new Error("Supplier handle mismatch");
    if(body.currency&&body.currency!=="EGP")throw new Error("Unexpected supplier currency");
    if(!Array.isArray(body.variants)||!body.variants.length)throw new Error("No priced variants");
    const variants=body.variants;
    if(variants.some(v=>typeof v.price!=="number"||!Number.isSafeInteger(v.price)||v.price<0||typeof v.available!=="boolean"))
      throw new Error("Invalid Shopify variant prices or availability");
    const priceSet=new Set(variants.map(v=>v.price));
    const availabilitySet=new Set(variants.map(v=>v.available));
    if(priceSet.size!==1||availabilitySet.size!==1)throw new Error("Variants differ; requires per-variant supplier SKU mapping");
    const cents=variants[0]!.price as number;
    return {price:cents/100,available:variants[0]!.available as boolean};
  }finally{clearTimeout(timer)}
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  if(!SUPABASE_URL||!SERVICE_ROLE||!ANON_KEY)return reply({error:"Supabase configuration unavailable"},503);
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return reply({error:"Unauthorized"},401);
  const auth=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false}});
  const {data:identity,error:identityError}=await auth.auth.getUser(token);
  if(identityError||!identity.user)return reply({error:"Unauthorized"},401);
  const role=identity.user.app_metadata||{};
  if(role.role!=="admin"&&role.role!=="super_admin"&&role.is_admin!==true)return reply({error:"Admin permission required"},403);
  let request:{dry_run?:unknown;limit?:unknown;acknowledge?:unknown}={};
  try{request=await req.json()}catch{return reply({error:"Invalid JSON"},400)}
  if(typeof request.dry_run!=="undefined"&&typeof request.dry_run!=="boolean")return reply({error:"Invalid dry_run"},400);
  const dryRun=request.dry_run!==false;
  if(!dryRun&&request.acknowledge!=="KIMO_PRICE_STOCK_EXECUTE")return reply({error:"Explicit sync acknowledgment required"},400);
  const limit=request.limit===undefined?20:request.limit;
  if(typeof limit!=="number"||!Number.isSafeInteger(limit)||limit<1||limit>maxBatch)return reply({error:"Limit must be 1 to 25"},400);
  const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});
  const {data:monitors,error:listError}=await db.from("product_source_monitor")
    .select("id,product_id,handle,source_url,last_checked_at")
    .eq("source","kimo").eq("enabled",true)
    .order("last_checked_at",{ascending:true,nullsFirst:true}).limit(limit);
  if(listError)return reply({error:"Unable to load supplier mapping"},500);
  if(!monitors?.length)return reply({dry_run:dryRun,checked:0,changed:0,failed:0,results:[]});
  const {data:run,error:runError}=await db.from("product_source_sync_runs")
    .insert({requested_by:identity.user.id,dry_run:dryRun,total:monitors.length,status:"running"})
    .select("id").single();
  if(runError||!run)return reply({error:"Unable to record sync run"},500);
  let checked=0,changed=0,failed=0;
  const results:Array<{product_id:string;status:string;price?:number;available?:boolean;note?:string}>=[];
  for(const monitor of monitors as Monitor[]){
    try{
      const expected="https://kimostore.net/products/"+monitor.handle;
      if(monitor.source_url!==expected)throw new Error("Supplier mapping URL mismatch");
      const snapshot=await fetchProduct(monitor.handle);
      const {data:product,error:pError}=await db.from("products").select("id,current_price,in_stock,currency")
        .eq("id",monitor.product_id).single();
      if(pError||!product)throw new Error("Mapped catalogue product missing");
      if(product.currency&&product.currency!=="EGP")throw new Error("Catalogue currency is not EGP");
      const beforePrice=product.current_price===null?null:Number(product.current_price);
      const priceChanged=beforePrice!==snapshot.price;
      const stockChanged=product.in_stock!==snapshot.available;
      const hasChanges=priceChanged||stockChanged;
      if(!dryRun){
        const now=new Date().toISOString();
        const {error:updateError}=await db.from("products").update({
          current_price:snapshot.price,in_stock:snapshot.available,
          price_checked_at:now,stock_checked_at:now,
        }).eq("id",monitor.product_id);
        if(updateError)throw new Error("Failed updating product");
        if(hasChanges){
          const {error:historyError}=await db.from("product_source_price_stock_history").insert({
            product_id:monitor.product_id,source:"kimo",
            old_price:beforePrice,new_price:snapshot.price,
            old_in_stock:product.in_stock,new_in_stock:snapshot.available,
          });
          if(historyError)throw new Error("Price updated but audit insert failed; reconcile this SKU");
        }
        const {error:monitorError}=await db.from("product_source_monitor").update({
          last_checked_at:now,last_changed_at:hasChanges?now:undefined,last_error:null,
        }).eq("id",monitor.id);
        if(monitorError)throw new Error("Source monitor state update failed");
      }
      checked++;if(hasChanges)changed++;
      results.push({product_id:monitor.product_id,status:hasChanges?(dryRun?"would_change":"updated"):"unchanged",price:snapshot.price,available:snapshot.available});
    }catch(e){
      failed++;
      const note=String(e instanceof Error?e.message:e).slice(0,180);
      results.push({product_id:monitor.product_id,status:"failed",note});
      if(!dryRun)await db.from("product_source_monitor").update({last_checked_at:new Date().toISOString(),last_error:note}).eq("id",monitor.id);
    }
    await sleep(250);
  }
  const status=failed?"partial":"success";
  await db.from("product_source_sync_runs").update({
    status,finished_at:new Date().toISOString(),checked,changed,failed,
    details:{sample:results.slice(0,25)},
  }).eq("id",run.id);
  return reply({run_id:run.id,dry_run:dryRun,total:monitors.length,checked,changed,failed,results});
});
