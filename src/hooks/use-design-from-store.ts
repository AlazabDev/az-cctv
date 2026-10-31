import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { trackStoreEvent } from "@/lib/store/catalog";

export const STORE_DESIGN_SELECTION_KEY = "azcctv:selected-product-ids";
export const STORE_DESIGN_INTENT_KEY = "azcctv:design-intent";
export function readSelectedDesignProducts(): string[] {
 if(typeof window==="undefined") return [];
 try{const value=JSON.parse(sessionStorage.getItem(STORE_DESIGN_SELECTION_KEY)||"[]") as unknown;return Array.isArray(value)?value.filter((x):x is string=>typeof x==="string"&&/^[0-9a-f-]{36}$/i.test(x)).slice(0,24):[]}catch{return []}
}
export function useDesignFromStore(){
 const navigate=useNavigate();
 return useCallback(async(productId:string)=>{
  if(typeof window==="undefined")return;
  const selected=readSelectedDesignProducts();
  sessionStorage.setItem(STORE_DESIGN_SELECTION_KEY,JSON.stringify([...new Set([...selected,productId])].slice(-24)));
  sessionStorage.setItem(STORE_DESIGN_INTENT_KEY,JSON.stringify({selected_at:new Date().toISOString(),product_id:productId}));
  trackStoreEvent("use_in_design",productId);
  const {supabase}=await import("@/integrations/supabase/client");
  const {data}=await supabase.auth.getUser();
  if(data.user)void navigate({to:"/projects"});
  else void navigate({to:"/auth"});
 },[navigate]);
}
