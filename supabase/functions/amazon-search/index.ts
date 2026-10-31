import { serveAdmin,amazonRequest,amazonMarket,adminDb,amazonSandbox } from "../_shared/amazon.ts";

type Summary={itemName?:string;brand?:string;modelNumber?:string};
type SearchItem={asin:string;summaries?:Summary[];images?:Array<{images?:Array<{link?:string}>}>;productTypes?:Array<{productType?:string}>};
Deno.serve(req=>serveAdmin(req,async()=>{
 const input=await req.json() as {keywords?:string;page_size?:number;import_drafts?:boolean;next_token?:string};
 const keywords=typeof input.keywords==="string"?input.keywords.trim().slice(0,100):"";
 if(keywords.length<2)throw new Error("Search keywords must contain at least two characters");
 const pageSize=Math.min(20,Math.max(1,Number(input.page_size)||10));
 const params=new URLSearchParams({keywords,marketplaceIds:amazonMarket(),includedData:"summaries,images,productTypes",pageSize:String(pageSize)});
 if(input.next_token)params.set("pageToken",String(input.next_token).slice(0,1000));
 const result=await amazonRequest("/catalog/2022-04-01/items?"+params.toString()) as {items?:SearchItem[];pagination?:{nextToken?:string}};
 const items=(result.items||[]).filter(item=>/^[A-Z0-9]{10}$/.test(item.asin)).map(item=>{
  const summary=item.summaries?.[0];
  const images=(item.images||[]).flatMap(group=>(group.images||[]).map(image=>image.link).filter((x):x is string=>typeof x==="string"&&x.startsWith("https://")));
  return {asin:item.asin,title:summary?.itemName||item.asin,brand:summary?.brand||null,model:summary?.modelNumber||item.asin,product_type:item.productTypes?.[0]?.productType||null,images:[...new Set(images)]};
 });
 // Import is explicit and admin-only. New Amazon items are unpublished drafts.
 if(input.import_drafts===true){
  const db=adminDb();
  for(const item of items){
   const {data:existing,error:lookupError}=await db.from("products").select("id,source").eq("asin",item.asin).maybeSingle();
   if(lookupError)throw new Error("Failed to check canonical product identity");
   if(existing && existing.source!=="Amazon SP-API")continue; // never overwrite Kimo or manual records
   const payload={asin:item.asin,model:item.model,brand:item.brand,product_name:item.title,name_en:item.title,category:"Amazon",subcategory:item.product_type,image_url:item.images[0]||null,images:item.images,source:"Amazon SP-API",source_sheet:"Amazon:"+item.asin,source_row:1,amazon_url:"https://www.amazon.eg/dp/"+item.asin,metadata:{amazon_marketplace_id:amazonMarket()},is_active:false,published:false,last_synced_at:new Date().toISOString()};
   if(existing){const {error}=await db.from("products").update(payload).eq("id",existing.id);if(error)throw new Error("Failed to update Amazon draft");}
   else{const {error}=await db.from("products").insert(payload);if(error)throw new Error("Failed to create Amazon draft");}
  }
 }
 return {marketplace_id:amazonMarket(),sandbox:amazonSandbox(),items,next_token:result.pagination?.nextToken||null,imported_as_unpublished_drafts:input.import_drafts===true};
}));