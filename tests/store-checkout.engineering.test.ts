import { describe, expect, it } from "vitest";
import { assessStoreCheckout } from "../src/lib/store/checkout";

const a = { id: "11111111-1111-4111-8111-111111111111", current_price: 120, currency: "EGP" };
const b = { id: "22222222-2222-4222-8222-222222222222", current_price: 80, currency: "EGP" };
describe("AZ-CCTV store quotation checkout", () => {
  it("validates quantity and computes a preview subtotal without trusting browser price", () => {
    const result = assessStoreCheckout(
      [
        { id: a.id, quantity: 3 },
        { id: b.id, quantity: 2 },
      ],
      [a, b],
    );
    expect(result.eligible).toBe(true);
    expect(result.subtotal).toBe(520);
    expect(result.currencies).toEqual(["EGP"]);
  });
  it("rejects unpublished or missing products", () => {
    const result = assessStoreCheckout([{ id: b.id, quantity: 1 }], [a]);
    expect(result.eligible).toBe(false);
    expect(result.missingProductIds).toEqual([b.id]);
  });
  it("rejects unsaleable prices and multiple currencies", () => {
    expect(
      assessStoreCheckout([{ id: a.id, quantity: 1 }], [{ ...a, current_price: null }]).eligible,
    ).toBe(false);
    expect(
      assessStoreCheckout(
        [
          { id: a.id, quantity: 1 },
          { id: b.id, quantity: 1 },
        ],
        [a, { ...b, currency: "USD" }],
      ).eligible,
    ).toBe(false);
  });
  it("rejects malformed quantities, duplicate entries and empty cart", () => {
    expect(assessStoreCheckout([], []).eligible).toBe(false);
    expect(assessStoreCheckout([{ id: a.id, quantity: 101 }], [a]).eligible).toBe(false);
    expect(
      assessStoreCheckout(
        [
          { id: a.id, quantity: 1 },
          { id: a.id, quantity: 2 },
        ],
        [a],
      ).eligible,
    ).toBe(false);
  });
});
