import { supabase } from "@/integrations/supabase/client";

export interface Product {
  id: string;
  source_sheet: string;
  section: string;
  category: string;
  subcategory: string | null;
  brand: string;
  model: string | null;
  name: string;
  description: string | null;
  price: number;
  old_price: number | null;
  image_url: string | null;
  images: string[];
  r2_images: string[];
  sku: string | null;
  is_active: boolean;
  available: boolean;
  tags: string | null;
  source_url: string | null;
  created_at: string;
}

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export interface ProductQuery {
  category?: string;
  section?: string;
  brand?: string[];
  search?: string;
  sort?: SortKey;
  page?: number;
}

export const PAGE_SIZE = 24;

export interface ProductQueryResult {
  items: Product[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

const SECTION_VALUES: Record<string, string> = { cctv: "CCTV", network: "NETWORK" };

export function sectionFromSlug(slug?: string): string | undefined {
  if (!slug) return undefined;
  return SECTION_VALUES[slug.toLowerCase()];
}

export async function queryProducts(q: ProductQuery): Promise<ProductQueryResult> {
  const page = Math.max(1, q.page ?? 1);
  let select = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (q.category) select = select.eq("category", q.category);
  if (q.section) select = select.eq("section", q.section);
  if (q.brand?.length) select = select.in("brand", q.brand);
  if (q.search?.trim()) {
    const s = `%${q.search.trim()}%`;
    select = select.or(`name.ilike.${s},brand.ilike.${s},model.ilike.${s},sku.ilike.${s}`);
  }

  switch (q.sort) {
    case "price-asc":
      select = select.order("price", { ascending: true });
      break;
    case "price-desc":
      select = select.order("price", { ascending: false });
      break;
    case "name":
      select = select.order("name", { ascending: true });
      break;
    default:
      select = select
        .order("available", { ascending: false })
        .order("price", { ascending: false });
  }

  const from = (page - 1) * PAGE_SIZE;
  select = select.range(from, from + PAGE_SIZE - 1);

  const { data, count, error } = await select;
  if (error) throw error;

  const total = count ?? 0;
  return {
    items: (data ?? []) as Product[],
    total,
    page,
    perPage: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error || !data) return undefined;
  return data as Product;
}

export async function getCategories(): Promise<{ category: string; count: number }[]> {
  const { data } = await supabase
    .from("category_counts")
    .select("*")
    .order("count", { ascending: false });
  return (data ?? []) as { category: string; count: number }[];
}

export async function getBrands(): Promise<{ brand: string; count: number }[]> {
  const { data } = await supabase
    .from("brand_counts")
    .select("*")
    .order("count", { ascending: false });
  return (data ?? []) as { brand: string; count: number }[];
}

export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .eq("category", product.category)
    .neq("id", product.id)
    .order("available", { ascending: false })
    .limit(limit);
  return (data ?? []) as Product[];
}

export interface SpecRow {
  label: string;
  value: string;
}

/** Splits the raw vendor description into label/value spec rows. */
export function parseSpecs(description?: string | null): SpecRow[] {
  if (!description) return [];
  const re = /(?:^|\s)([A-Z][A-Za-z0-9&\/. +\-']{1,32}?)\s*:\s*/g;
  const rows: SpecRow[] = [];
  const matches: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(description))) {
    matches.push({ label: m[1].trim(), start: m.index + m[0].length, end: m.index + m[0].length });
    matches[matches.length - 1].start = re.lastIndex;
  }
  if (matches.length < 3) {
    return [{ label: "description", value: description }];
  }
  for (let i = 0; i < matches.length; i++) {
    const valueEnd = i + 1 < matches.length
      ? description.lastIndexOf(" ", Math.max(matches[i].start, matches[i + 1].start - 30))
      : description.length;
    const value = description
      .slice(matches[i].start, valueEnd > matches[i].start ? valueEnd : description.length)
      .trim();
    rows.push({ label: matches[i].label, value });
  }
  return rows;
}
