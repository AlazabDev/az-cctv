import { createFileRoute } from "@tanstack/react-router";
import { loadFeedProducts, metaCsv } from "@/lib/store/feeds.server";
export const Route=createFileRoute("/store/feeds/meta.csv")({
 server:{handlers:{GET:async({request})=>{
  try{
   const products=await loadFeedProducts();
   const output=metaCsv(products,new URL(request.url).origin);
   return new Response(output,{headers:{"Content-Type":"text/csv; charset=utf-8","Cache-Control":"public, max-age=3600, s-maxage=3600","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response("Feed temporarily unavailable",{status:503});}
 }}}
});
