import type { Tables } from "@/integrations/supabase/types";

export type StoreProduct = Tables<"products">;
export const STORE_SELECT = "id,brand,model,sku,name_en,name_ar,product_name,description,product_type,category,subcategory,current_price,old_price,currency,image_url,is_active,source_url,metadata,specifications,created_at" as const;
export const productTitle = (p: StoreProduct) => p.product_name?.trim() || p.name_ar?.trim() || p.name_en?.trim() || [p.brand,p.model].filter(Boolean).join(" ");
export const productPrice = (p: StoreProduct) => p.current_price == null ? "اسأل عن السعر" : new Intl.NumberFormat("ar-EG",{style:"currency",currency:p.currency||"EGP",maximumFractionDigits:2}).format(p.current_price);
export const productImages = (p: StoreProduct): string[] => {
 const value = p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {};
 const imgs = "images" in value && Array.isArray(value.images) ? value.images.filter((x):x is string=>typeof x==="string" && x.startsWith("https://")) : [];
 return [...new Set([p.image_url,...imgs].filter((x):x is string=>typeof x==="string"&&x.startsWith("https://")))];
};
export const isAvailable = (p: StoreProduct): boolean | null => {
 const value = p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {};
 return typeof value.available === "boolean" ? value.available : null;
};
export const compareStorageKey = "azcctv-store-comparison";
export function trackStoreEvent(event: string, productId?:string) {
 if (typeof window === "undefined") return;
 try {
  const detail={event,product_id:productId||null,page:window.location.pathname,at:new Date().toISOString()};
  window.dispatchEvent(new CustomEvent("azcctv:store-event",{detail}));
  // Integrates with an existing site dataLayer when present; never stores personal identifiers.
  const target=window as Window & {dataLayer?: Array<Record<string,unknown>>};
  target.dataLayer?.push({...detail,event:"store_"+event});
 }catch{ /* analytics must never break shopping */ }
}
export const categoryName = (category:string) => category === "CCTV" ? "كاميرات وأنظمة مراقبة" : category === "Network" ? "معدات الشبكات" : category;
export function stockLabel(p: StoreProduct) { const a=isAvailable(p);return a===true?"متوفر لدى المورد":a===false?"غير متوفر حاليًا":"التوفر يحتاج تأكيد"; }
