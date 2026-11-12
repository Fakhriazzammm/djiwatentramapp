import { describe, expect, it } from "bun:test";
import { resolveClosingStockPolicy } from "./stock-policy";

describe("closing stock policy", () => {
  it("requires role opname only when explicitly integrated", () => {
    expect(resolveClosingStockPolicy({ mode: "integrated" }, null, "bar").needsOpname).toBe(true);
    expect(resolveClosingStockPolicy({ mode: "integrated" }, null, "kitchen").needsOpname).toBe(true);
    expect(resolveClosingStockPolicy({ mode: "integrated" }, null, null).needsOpname).toBe(false);
  });
  it("permits stock-free closing for manual mode and unavailable policy", () => {
    for (const policy of [{ mode: "manual" }, null, {}, { mode: "invalid" }]) {
      expect(resolveClosingStockPolicy(policy, null, "bar").needsOpname).toBe(false);
    }
    expect(resolveClosingStockPolicy({ mode: "integrated" }, new Error("offline"), "kitchen").needsOpname).toBe(false);
  });
});
