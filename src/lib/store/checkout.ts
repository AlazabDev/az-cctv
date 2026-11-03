/** Shared browser-side preflight. Supabase RPC remains the authority for prices and eligibility. */
export type SelectedSku = { id: string; quantity: number };
export type QuotedSku = { id: string; current_price: number | null; currency: string | null };
export type CheckoutAssessment = {
  eligible: boolean;
  missingProductIds: string[];
  missingPriceIds: string[];
  currencies: string[];
  subtotal: number;
};
export function assessStoreCheckout(
  items: readonly SelectedSku[],
  products: readonly QuotedSku[],
): CheckoutAssessment {
  const published = new Map(products.map((p) => [p.id, p]));
  const missingProductIds: string[] = [];
  const missingPriceIds: string[] = [];
  const currencies = new Set<string>();
  let subtotal = 0;
  const seen = new Set<string>();
  for (const item of items) {
    if (
      seen.has(item.id) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    ) {
      missingProductIds.push(item.id);
      continue;
    }
    seen.add(item.id);
    const product = published.get(item.id);
    if (!product) {
      missingProductIds.push(item.id);
      continue;
    }
    if (
      product.current_price == null ||
      !Number.isFinite(product.current_price) ||
      product.current_price < 0
    ) {
      missingPriceIds.push(item.id);
      continue;
    }
    currencies.add(product.currency || "EGP");
    subtotal += item.quantity * product.current_price;
  }
  return {
    eligible:
      items.length > 0 &&
      items.length <= 50 &&
      missingProductIds.length === 0 &&
      missingPriceIds.length === 0 &&
      currencies.size === 1,
    missingProductIds,
    missingPriceIds,
    currencies: [...currencies],
    subtotal,
  };
}
