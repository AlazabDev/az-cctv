import { describe, expect, it } from "vitest";
import catalog from "../catalog.json" with { type: "json" };
import { validateRegistry } from "../modules/registry.ts";
import type { Operation } from "../types.ts";

describe("Daftra MCP API operation coverage", () => {
  it("preserves the 301 operations across 70 modules", () => {
    const coverage = validateRegistry(catalog as Operation[]);
    expect(coverage.operations).toBe(301);
    expect(coverage.modules).toBe(70);
  });
});
