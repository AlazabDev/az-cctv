import type { Tables } from "@/integrations/supabase/types";
import type { CameraSpec, HardwareSpec } from "./types";

export type ProductRow = Tables<"products">;

type Specs = Record<string, unknown>;

function asSpecs(value: ProductRow["specifications"]): Specs {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Specs) : {};
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveNumber(value: unknown) {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function firstNumber(text: string | null, expression: RegExp) {
  const match = text?.match(expression);
  return match ? Number(match[1]) : undefined;
}

function productLabel(product: ProductRow) {
  return (
    product.product_name?.trim() ||
    product.name_ar?.trim() ||
    product.name_en?.trim() ||
    [product.brand, product.model].filter(Boolean).join(" ").trim() ||
    product.model
  );
}

function cameraType(product: ProductRow): CameraSpec["type"] {
  const source = `${product.form_factor ?? ""} ${product.description ?? ""}`.toLowerCase();
  if (source.includes("bullet")) return "bullet";
  if (source.includes("turret")) return "turret";
  if (source.includes("dome")) return "dome";
  if (source.includes("ptz") || source.includes("pan & tilt") || source.includes("pan and tilt"))
    return "ptz";
  if (source.includes("fisheye") || source.includes("fish eye")) return "fisheye";
  return "other";
}

export function productToCameraSpec(product: ProductRow): CameraSpec | null {
  if (product.category !== "CCTV Camera") return null;
  const specs = asSpecs(product.specifications);
  const description = product.description ?? "";

  const megapixel =
    positiveNumber(specs.megapixel) ?? firstNumber(description, /(\d+(?:\.\d+)?)\s*MP\b/i) ?? 0;
  const focal =
    positiveNumber(specs.focal_mm) ?? firstNumber(description, /(\d+(?:\.\d+)?)\s*mm\b/i) ?? 0;
  const hres = positiveNumber(specs.hres) ?? positiveNumber(specs.resolution_x) ?? 0;
  const vres = positiveNumber(specs.vres) ?? positiveNumber(specs.resolution_y) ?? 0;
  const hfov = positiveNumber(specs.hfov_deg) ?? positiveNumber(specs.hfov) ?? 0;
  const irRange = positiveNumber(specs.ir_range_m) ?? positiveNumber(specs.irRange) ?? 0;
  const poeWatt = positiveNumber(specs.poe_watt) ?? positiveNumber(specs.poeWatt) ?? 0;
  const bitrateMbps =
    positiveNumber(specs.bitrate_mbps) ?? positiveNumber(specs.bitrateMbps) ?? 0;

  const engineeringReady =
    hres > 0 && vres > 0 && focal > 0 && hfov > 0 && megapixel > 0;

  return {
    id: product.id,
    productId: product.id,
    brand: product.brand ?? "",
    model: product.model,
    label: productLabel(product),
    type: cameraType(product),
    megapixel,
    hres,
    vres,
    focal,
    hfov,
    irRange,
    price: product.current_price ?? 0,
    currency: product.currency || "EGP",
    poeWatt,
    bitrateMbps,
    imageUrl: product.image_url ?? undefined,
    engineeringReady,
  };
}

export function productToHardwareSpec(product: ProductRow): HardwareSpec | null {
  const specs = asSpecs(product.specifications);
  const description = product.description ?? "";
  const label = productLabel(product);

  if (product.category === "NVR") {
    const channels =
      positiveNumber(specs.channels) ?? firstNumber(description, /(\d+)\s*[- ]?ch\b/i);
    const poePorts =
      finiteNumber(specs.poe_ports) ?? firstNumber(description, /(\d+)\s*PoE\b/i) ?? 0;
    const ethernetPorts = finiteNumber(specs.ethernet_ports) ?? 1;
    const sfpPorts = finiteNumber(specs.sfp_ports) ?? 0;

    return {
      id: product.id,
      productId: product.id,
      kind: "nvr",
      brand: product.brand ?? undefined,
      model: product.model,
      label,
      price: product.current_price ?? 0,
      currency: product.currency || "EGP",
      channels,
      ports: ethernetPorts + poePorts,
      ethernetPorts,
      poePorts,
      sfpPorts,
      poeBudget: finiteNumber(specs.poe_budget_w),
      uplinkMbps: finiteNumber(specs.uplink_mbps),
      imageUrl: product.image_url ?? undefined,
      engineeringReady: Boolean(channels),
    };
  }

  if (product.category === "Network Switch") {
    const describedPorts = firstNumber(description, /(\d+)\s*Port\b/i);
    const ethernetPorts = finiteNumber(specs.ethernet_ports) ?? describedPorts ?? 0;
    const poePorts =
      finiteNumber(specs.poe_ports) ??
      (/\bPoE\b/i.test(description) ? describedPorts ?? 0 : 0);

    return {
      id: product.id,
      productId: product.id,
      kind: "switch",
      brand: product.brand ?? undefined,
      model: product.model,
      label,
      price: product.current_price ?? 0,
      currency: product.currency || "EGP",
      ports: ethernetPorts,
      ethernetPorts,
      poePorts,
      sfpPorts: finiteNumber(specs.sfp_ports) ?? 0,
      poeBudget: finiteNumber(specs.poe_budget_w),
      uplinkMbps:
        finiteNumber(specs.uplink_mbps) ??
        (/\bGigabit\b/i.test(description)
          ? 1000
          : /\bFast Ethernet\b/i.test(description)
            ? 100
            : undefined),
      imageUrl: product.image_url ?? undefined,
      engineeringReady: ethernetPorts > 0,
    };
  }

  return null;
}

export function buildProductCatalog(products: ProductRow[]) {
  const active = products.filter((product) => product.is_active);
  const cameras = active
    .map(productToCameraSpec)
    .filter((value): value is CameraSpec => value !== null);
  const hardware = active
    .map(productToHardwareSpec)
    .filter((value): value is HardwareSpec => value !== null);

  return {
    products: active,
    cameras,
    hardware,
    byId: new Map(active.map((product) => [product.id, product])),
  };
}

export function categoryCounts(products: ProductRow[]) {
  const counts = new Map<string, number>();
  for (const product of products) {
    const category = product.category || "Uncategorized";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}
