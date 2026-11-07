import type { Tables } from "@/integrations/supabase/types";

export type StoreProduct = Tables<"products">;
export const STORE_SELECT =
  "id,brand,model,sku,name_en,name_ar,product_name,description,product_type,category,subcategory,current_price,old_price,currency,image_url,is_active,source_url,metadata,specifications,in_stock,stock_checked_at,created_at" as const;
export const productTitle = (p: StoreProduct) =>
  p.product_name?.trim() ||
  p.name_ar?.trim() ||
  p.name_en?.trim() ||
  [p.brand, p.model].filter(Boolean).join(" ");
export const productPrice = (p: StoreProduct) =>
  p.current_price == null
    ? "اسأل عن السعر"
    : new Intl.NumberFormat("ar-EG", {
        style: "currency",
        currency: p.currency || "EGP",
        maximumFractionDigits: 2,
      }).format(p.current_price);
export const productImages = (p: StoreProduct): string[] => {
  const value =
    p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {};
  const imgs =
    "images" in value && Array.isArray(value.images)
      ? value.images.filter((x): x is string => typeof x === "string" && x.startsWith("https://"))
      : [];
  return [
    ...new Set(
      [p.image_url, ...imgs].filter(
        (x): x is string => typeof x === "string" && x.startsWith("https://"),
      ),
    ),
  ];
};
/** Only a recent, timestamped supplier inventory check is evidence of availability. */
export const isAvailable = (p: StoreProduct): boolean | null => {
  const checked = p.stock_checked_at ? new Date(p.stock_checked_at).getTime() : NaN;
  const ageMs = Date.now() - checked;
  return Number.isFinite(ageMs) &&
    ageMs >= 0 &&
    ageMs <= 48 * 60 * 60 * 1000 &&
    typeof p.in_stock === "boolean"
    ? p.in_stock
    : null;
};
export const compareStorageKey = "azcctv-store-comparison";
export function trackStoreEvent(event: string, productId?: string) {
  if (typeof window === "undefined") return;
  try {
    const detail = {
      event,
      product_id: productId || null,
      page: window.location.pathname,
      at: new Date().toISOString(),
    };
    window.dispatchEvent(new CustomEvent("azcctv:store-event", { detail }));
    // Integrates with an existing site dataLayer when present; never stores personal identifiers.
    const target = window as Window & { dataLayer?: Array<Record<string, unknown>> };
    target.dataLayer?.push({ ...detail, event: "store_" + event });
  } catch {
    /* analytics must never break shopping */
  }
}
export const categoryName = (category: string) =>
  category === "CCTV"
    ? "كاميرات وأنظمة مراقبة"
    : category === "Network"
      ? "معدات الشبكات"
      : category;
export function stockLabel(p: StoreProduct) {
  const a = isAvailable(p);
  return a === true ? "متوفر لدى المورد" : a === false ? "غير متوفر حاليًا" : "التوفر يحتاج تأكيد";
}
