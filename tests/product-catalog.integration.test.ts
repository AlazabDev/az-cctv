import { describe, expect, it } from "vitest";
import { buildProductCatalog, productToCameraSpec, type ProductRow } from "../src/lib/cctv/product-catalog";

function camera(specifications: Record<string, unknown>, extra: Record<string, unknown> = {}): ProductRow {
  return {
    id: "8b9105d7-a0fe-4a66-b797-fab2a0db6bd9",
    category: "CCTV Camera",
    is_active: true,
    brand: "Test",
    model: "TC-4",
    description: "4MP 2.8mm Bullet Camera",
    specifications,
    current_price: 1250,
    currency: "EGP",
    ...extra,
  } as ProductRow;
}

describe("Stage 2 — product catalog engineering eligibility", () => {
  it("keeps an active commercial camera selectable when geometry is unavailable", () => {
    const catalog = buildProductCatalog([camera({})]);
    expect(catalog.cameras).toHaveLength(1);
    expect(catalog.cameras[0]?.price).toBe(1250);
    expect(catalog.cameras[0]?.engineeringReady).toBe(false);
  });

  it("accepts only complete and valid engineering geometry", () => {
    const specs = { megapixel: 4, focal_mm: 2.8, hres: 2560, vres: 1440, hfov_deg: 103 };
    expect(productToCameraSpec(camera(specs))?.engineeringReady).toBe(true);
    expect(productToCameraSpec(camera({ ...specs, hfov_deg: 180 }))?.engineeringReady).toBe(false);
    expect(productToCameraSpec(camera({ ...specs, hfov_deg: 0 }))?.engineeringReady).toBe(false);
    expect(productToCameraSpec(camera({ ...specs, hres: 0 }))?.engineeringReady).toBe(false);
  });

  it("never treats an inactive camera as a selectable commercial product", () => {
    const catalog = buildProductCatalog([camera({}, { is_active: false })]);
    expect(catalog.cameras).toHaveLength(0);
  });
});
