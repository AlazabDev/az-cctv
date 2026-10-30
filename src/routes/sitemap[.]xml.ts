import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public SEO endpoint: only public active product IDs and their modification dates are exposed.
export const Route = createFileRoute("/sitemap.xml")({
 server: {
  handlers: {
   GET: async ({request}) => {
    const url=process.env["SUPABASE_URL"]||process.env["VITE_SUPABASE_URL"];
    const key=process.env["SUPABASE_PUBLISHABLE_KEY"]||process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if(!url||!key)return new Response("Sitemap data source unavailable",{status:503});
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const products:Array<{id:string;updated_at:string}>=[];
    for(let page=0;page<100;page++){
      const {data,error}=await client.from("products").select("id,updated_at").eq("is_active",true).order("id").range(page*1000,page*1000+999);
      if(error)return new Response("Sitemap temporarily unavailable",{status:503});
      products.push(...(data||[]));
      if(!data||data.length<1000)break;
    }
    const origin=new URL(request.url).origin;
    const base=origin.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
    const links=[`<url><loc>${base}/store</loc><changefreq>daily</changefreq></url>`,
      ...products.map(p=>`<url><loc>${base}/product/${p.id}</loc><lastmod>${p.updated_at.slice(0,10)}</lastmod><changefreq>weekly</changefreq></url>`)];
    const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${links.join("")}</urlset>`;
    return new Response(xml,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=3600, s-maxage=3600"}});
   },
  },
 },
});
