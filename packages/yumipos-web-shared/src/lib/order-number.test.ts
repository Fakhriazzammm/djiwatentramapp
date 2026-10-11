import { describe, expect, it } from "bun:test";
import { formatOrderNumber, getDisplayOrderNumber, getOrderChannel } from "./order-number";

describe("order number channel contract", () => {
  it("formats new POS and Customer numbers without customer PII", () => {
    expect(formatOrderNumber({ sequence: 35, createdAt: new Date("2026-08-31T10:00:00+07:00").getTime(), context: { source: "pos", orderType: "dine_in" } })).toBe("ORD-POS-D-0035-310826");
    expect(formatOrderNumber({ sequence: 36, createdAt: new Date("2026-08-31T10:00:00+07:00").getTime(), context: { source: "customer_self_service", orderType: "dine_in" } })).toBe("ORD-APP-D-0036-310826");
    expect(formatOrderNumber({ sequence: 37, createdAt: new Date("2026-08-31T10:00:00+07:00").getTime(), context: { source: "customer_self_service", brandSlug: "b2b", orderType: "delivery" } })).toBe("ORD-B2B-DL-0037-310826");
  });

  it("renders legacy IDs consistently while keeping raw IDs unchanged", () => {
    expect(getDisplayOrderNumber("ORD035-D-ADEKA310826", { source: "pos", orderType: "dine_in" })).toBe("ORD-POS-D-0035-310826");
    expect(getDisplayOrderNumber("ORD-POS-D-0035-310826", {})).toBe("ORD-POS-D-0035-310826");
  });

  it("does not expose technical IDs as order numbers", () => {
    expect(getDisplayOrderNumber("order_1234567890abcdef", {})).toBe("-");
    expect(getDisplayOrderNumber(undefined, {})).toBe("-");
  });

  it("normalizes the legacy Mie Yamin family to canonical APP display", () => {
    expect(getDisplayOrderNumber("MY-260902-7", {})).toBe("ORD-APP-X-0007-020926");
  });

  it("keeps channel separate from payment method", () => {
    expect(getOrderChannel({ source: "customer_self_service", orderType: "dine_in" })).toBe("app");
    expect(getOrderChannel({ source: "pos", orderType: "takeaway" })).toBe("pos");
  });

  it("uses a dedicated merchandise channel when brand_slug is merchandise", () => {
    expect(formatOrderNumber({ sequence: 1, createdAt: new Date("2026-09-02T10:00:00+07:00").getTime(), context: { source: "customer_self_service", brandSlug: "merchandise", orderType: "online" } })).toBe("ORD-MERCH-O-0001-020926");
    expect(getOrderChannel({ source: "customer_self_service", brandSlug: "merchandise" })).toBe("merchandise");
  });
});
