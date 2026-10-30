import { createClient } from "@supabase/supabase-js";

type FeedProduct={id:string;product_name:string|null;name_en:string|null;brand:string|null;model:string;description:string|null;image_url:string|null;current_price:number|null;currency:string;metadata:unknown;category:string|null;is_active:boolean};
const esc=(s:unknown)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export const csv=(s:unknown)=>`"${String(s??"").replace(/"/g,'""').replace(/[\r\n]+/g," ").slice(0,500)}"`;
export function feedAvailability(p:FeedProduct){
 const meta=p.metadata&&typeof p.metadata==="object"&&!Array.isArray(p.metadata)?p.metadata as Record<string,unknown>:{};
 return meta.available===true?"in_stock":meta.available===false?"out_of_stock":null;
}
export async function loadFeedProducts():Promise<FeedProduct[]>{
 const url=process.env["SUPABASE_URL"]||process.env["VITE_SUPABASE_URL"];
 const key=process.env["SUPABASE_PUBLISHABLE_KEY"]||process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
 if(!url||!key)throw new Error("Supabase public read config missing");
 const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const products:FeedProduct[]=[];
 for(let offset=0;offset<100000;offset+=500){
  const {data,error}=await db.from("products").select("id,product_name,name_en,brand,model,description,image_url,current_price,currency,metadata,category,is_active").eq("is_active",true).order("id").range(offset,offset+499);
  if(error)throw new Error("Public catalog feed unavailable");
  products.push(...(data||[]));if(!data||data.length<500)break;
 }
 // Never advertise inventory or a price without a verified availability flag.
 return products.filter(p=>p.current_price!==null&&p.current_price>=0&&Boolean(p.image_url)&&feedAvailability(p)!==null);
}
export function googleXml(products:FeedProduct[],origin:string){
 const body=products.map(p=>`<item><g:id>${esc(p.id)}</g:id><title>${esc(p.product_name||p.name_en||p.model)}</title><description>${esc((p.description||p.product_name||p.model).slice(0,4900))}</description><link>${esc(origin+"/product/"+p.id)}</link><g:image_link>${esc(p.image_url)}</g:image_link><g:price>${esc(p.current_price)} ${esc(p.currency||"EGP")}</g:price><g:availability>${feedAvailability(p)}</g:availability><g:brand>${esc(p.brand||"Unbranded")}</g:brand><g:identifier_exists>false</g:identifier_exists><g:condition>new</g:condition></item>`).join("");
 return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>AZ-CCTV Equipment</title><link>${esc(origin)}</link><description>Verified-availability CCTV and network equipment catalog</description>${body}</channel></rss>`;
}
export function metaCsv(products:FeedProduct[],origin:string){
 const header="id,title,description,availability,condition,price,link,image_link,brand";
 return [header,...products.map(p=>[p.id,p.product_name||p.name_en||p.model,p.description||p.model,feedAvailability(p),"new",`${p.current_price} ${p.currency||"EGP"}`,origin+"/product/"+p.id,p.image_url,p.brand||"Unbranded"].map(csv).join(","))].join("\r\n");
}
