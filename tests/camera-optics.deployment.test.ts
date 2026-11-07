import { describe, expect, it } from "vitest";
import { cameraDeployment } from "../src/lib/cctv/deployment";
import type { CameraSpec } from "../src/lib/cctv/types";

const camera: CameraSpec = {
  id: "verified-camera",
  productId: "verified-camera",
  brand: "Test",
  model: "TEST-2MP",
  label: "Test",
  type: "bullet",
  megapixel: 2,
  focal: 2.8,
  hres: 1920,
  vres: 1080,
  hfov: 81.2,
  vfov: 65.47,
  irRange: 30,
  poeWatt: 8,
  bitrateMbps: 4,
  price: 0,
  opticsVerified: true,
  engineeringReady: true,
};

describe("Manufacturer optical profile in deployment calculations", () => {
  it("prefers manufacturer vertical FOV to derived aspect-ratio FOV", () => {
    const result = cameraDeployment({ heightM: 4, tilt: 40 }, camera);
    expect(result.vfov).toBeCloseTo(65.47, 5);
  });

  it("continues supporting legacy cameras without manufacturer VFOV", () => {
    const result = cameraDeployment({ heightM: 4, tilt: 40 }, { ...camera, vfov: undefined });
    expect(result.vfov).toBeGreaterThan(0);
    expect(result.vfov).toBeLessThan(180);
    expect(result.vfov).not.toBeCloseTo(65.47, 2);
  });
});
