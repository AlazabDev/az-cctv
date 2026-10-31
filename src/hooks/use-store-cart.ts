import { useCallback, useEffect, useState } from "react";
import { trackStoreEvent } from "@/lib/store/catalog";

export const STORE_CART_KEY = "azcctv:cart:v1";
export type CartItem = { id: string; quantity: number };
const validId = (id:string) => /^[0-9a-f-]{36}$/i.test(id);
function parseCart():CartItem[] {
 if(typeof window==="undefined")return [];
 try {
  const data:unknown=JSON.parse(localStorage.getItem(STORE_CART_KEY)||"[]");
  if(!Array.isArray(data))return [];
  return data.filter((x):x is CartItem=>x&&typeof x==="object"&&validId(x.id)&&Number.isInteger(x.quantity)&&x.quantity>=1&&x.quantity<=100).slice(0,50);
 }catch{return []}
}
export function useStoreCart() {
 const [items,setItems]=useState<CartItem[]>([]);
 useEffect(()=>{
  setItems(parseCart());
  const sync=()=>setItems(parseCart());
  window.addEventListener("storage",sync);
  window.addEventListener("azcctv:cart-updated",sync);
  return()=>{window.removeEventListener("storage",sync);window.removeEventListener("azcctv:cart-updated",sync)};
 },[]);
 const save=useCallback((next:CartItem[])=>{
  try{localStorage.setItem(STORE_CART_KEY,JSON.stringify(next));window.dispatchEvent(new Event("azcctv:cart-updated"))}catch{}
  setItems(next);
 },[]);
 const add=useCallback((id:string,quantity=1)=>{
  if(!validId(id)||!Number.isInteger(quantity)||quantity<1)return;
  const previous=parseCart();const existing=previous.find(x=>x.id===id);
  const next=existing?previous.map(x=>x.id===id?{...x,quantity:Math.min(100,x.quantity+quantity)}:x):previous.length>=50?previous:[...previous,{id,quantity:Math.min(100,quantity)}];
  save(next);trackStoreEvent("add_to_cart",id);
 },[save]);
 const update=useCallback((id:string,quantity:number)=>{
  if(!validId(id)||!Number.isInteger(quantity))return;
  save(parseCart().map(x=>x.id===id?{...x,quantity:Math.max(1,Math.min(100,quantity))}:x));
 },[save]);
 const remove=useCallback((id:string)=>save(parseCart().filter(x=>x.id!==id)),[save]);
 const clear=useCallback(()=>save([]),[save]);
 return {items,add,update,remove,clear,count:items.reduce((sum,x)=>sum+x.quantity,0)};
}
