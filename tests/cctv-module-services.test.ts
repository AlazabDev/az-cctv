import { describe, expect, it } from "vitest";
import { cctvModuleRegistry, getCctvModule } from "../src/lib/cctv/module-services";

describe("CCTV five-module service ownership", () => {
  it("defines exactly the five approved modules in their fixed order", () => {
    expect(cctvModuleRegistry.map((module) => module.label)).toEqual([
      "CCTV system",
      "CCTV network",
      "CCTV maps",
      "CCTV cost",
      "CCTV agent",
    ]);
  });

  it("assigns every service to exactly one module", () => {
    const services = cctvModuleRegistry.flatMap((module) => module.services);
    expect(services.length).toBeGreaterThan(25);
    expect(new Set(services.map((service) => service.id)).size).toBe(services.length);
    expect(cctvModuleRegistry.every((module) => module.services.length > 0)).toBe(true);
  });

  it("distinguishes planned work from existing implementation", () => {
    const all = cctvModuleRegistry.flatMap((module) => module.services);
    expect(all.some((service) => service.status === "planned")).toBe(true);
    expect(all.every((service) => service.status === "planned" || service.source.length > 0)).toBe(true);
    expect(getCctvModule("topology").label).toBe("CCTV network");
  });
});
