import { describe, expect, it } from "vitest";
import { cameraForPlacedDevice, hydrateProductCatalog } from "../src/lib/cctv/catalog";
import {
  buildProductCatalog,
  productToCameraSpec,
  type ProductRow,
} from "../src/lib/cctv/product-catalog";

function camera(
  specifications: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ProductRow {
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

  it("reads documented optics from the canonical product record", () => {
    const item = productToCameraSpec(
      camera({
        megapixel: 4,
        focal_mm: 2.8,
        hres: 2560,
        vres: 1440,
        hfov_deg: 102,
        vfov_deg: 54,
        sensor_format: '1/2.8"',
        focal_options_mm: [4, 2.8, 4],
        optics_verified: true,
        optics_source_url: "https://example.com/datasheet.pdf",
      }),
    );
    expect(item).toMatchObject({
      vfov: 54,
      hfov: 102,
      sensorFormat: '1/2.8"',
      focalOptionsMm: [2.8, 4],
      opticsVerified: true,
      opticsSourceUrl: "https://example.com/datasheet.pdf",
      engineeringReady: true,
    });
  });

  it("preserves installed optics if the product master is updated later", () => {
    const base = camera({
      megapixel: 2,
      focal_mm: 2.8,
      hres: 1920,
      vres: 1080,
      hfov_deg: 81.2,
    });
    hydrateProductCatalog([base]);
    const placement = {
      id: "placed-1",
      kind: "camera" as const,
      specId: base.id,
      productId: base.id,
      name: "Camera 1",
      x: 10,
      y: 10,
      rotation: 0,
      heightM: 4,
      tilt: 30,
      focalMm: 2.8,
      opticsSnapshot: {
        productId: base.id,
        focalMm: 2.8,
        hfovDeg: 81.2,
        vfovDeg: 54,
        hres: 1920,
        vres: 1080,
        verified: true,
      },
    };
    hydrateProductCatalog([
      camera({
        megapixel: 2,
        focal_mm: 4,
        hres: 1920,
        vres: 1080,
        hfov_deg: 65,
      }),
    ]);
    expect(cameraForPlacedDevice(placement)).toMatchObject({
      focal: 2.8,
      hfov: 81.2,
      vfov: 54,
      hres: 1920,
      vres: 1080,
    });
  });

  it("never treats an inactive camera as a selectable commercial product", () => {
    const catalog = buildProductCatalog([camera({}, { is_active: false })]);
    expect(catalog.cameras).toHaveLength(0);
  });
});
