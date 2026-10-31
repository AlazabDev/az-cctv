import { serveAdmin,amazonRequest,amazonMarket,adminDb } from "../_shared/amazon.ts";

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
Deno.serve(req=>serveAdmin(req,async()=>{
 const input=await req.json() as {asins?:string[];update_amazon_drafts?:boolean};
 const asins=[...new Set((input.asins||[]).filter(x=>typeof x==="string"&&/^[A-Z0-9]{10}$/.test(x)))].slice(0,10);
 if(!asins.length)throw new Error("Supply valid ASIN identifiers");
 const prices:Array<{asin:string;amount:number|null;currency:string|null;availability:"unknown";status:string}>=[];
 for(const [index,asin] of asins.entries()){
  if(index>0)await pause(2100); // Respect the 0.5 requests/s default of getItemOffers.
  try{
   const raw=await amazonRequest("/products/pricing/v0/items/"+asin+"/offers?MarketplaceId="+amazonMarket()+"&ItemCondition=New") as {
     payload?:{Summary?:{LowestPrices?:Array<{ListingPrice?:{Amount?:number;CurrencyCode?:string}}>}}};
   const offer=raw.payload?.Summary?.LowestPrices?.find(x=>typeof x.ListingPrice?.Amount==="number")?.ListingPrice;
   const amount=offer?.Amount??null;const currency=offer?.CurrencyCode??null;
   prices.push({asin,amount,currency,availability:"unknown",status:amount===null?"not_available":"priced"});
   if(input.update_amazon_drafts===true&&amount!==null&&currency){
     // Never overwrite other supplier's pricing or claim stock availability.
     const {error}=await adminDb().from("products").update({current_price:amount,currency,last_synced_at:new Date().toISOString()}).eq("asin",asin).eq("source","Amazon SP-API").eq("published",false);
     if(error)throw new Error("Amazon draft price update failed");
   }
  }catch{prices.push({asin,amount:null,currency:null,availability:"unknown",status:"api_error"});}
 }
 return {marketplace_id:amazonMarket(),prices,stock_verified:false};
}));