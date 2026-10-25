import { describe, expect, it } from "bun:test";
import { mapCustomerOrder } from "./customer-order";

describe("mapCustomerOrder", () => {
  it("maps camelCase and snake_case order fields without dropping payment metadata", () => {
    const order = mapCustomerOrder({
      _id: "order_123",
      order_number: "DT-001",
      total_amount: "125000",
      discountAmount: 5000,
      tax_amount: 12500,
      serviceChargeAmount: 2500,
      payment_method: "qris",
      payment_receipt_kind: "gateway_paid",
      source: "customer_self_service",
      source_app: "djiwa",
      business_unit: "cafe",
      brand_slug: "djiwatentram",
      platform: "web",
      daily_receipt_no: 7,
      created_at: "2026-10-25T10:00:00.000Z",
      items: [
        {
          product_id: "menu_1",
          product_name: "Nasi Goreng",
          quantity: "2",
          price: "50000",
          variant: "Pedas",
        },
      ],
    });

    expect(order.id).toBe("order_123");
    expect(order.orderNumber).toBe("DT-001");
    expect(order.totalAmount).toBe(125000);
    expect(order.discountAmount).toBe(5000);
    expect(order.taxAmount).toBe(12500);
    expect(order.serviceChargeAmount).toBe(2500);
    expect(order.paymentMethod).toBe("qris");
    expect(order.paymentReceiptKind).toBe("gateway_paid");
    expect(order.source).toBe("customer_self_service");
    expect(order.sourceApp).toBe("djiwa");
    expect(order.businessUnit).toBe("cafe");
    expect(order.brandSlug).toBe("djiwatentram");
    expect(order.platform).toBe("web");
    expect(order.dailyReceiptNo).toBe(7);
    expect(order.createdAt).toBe(Date.parse("2026-10-25T10:00:00.000Z"));
    expect(order.items[0]).toMatchObject({
      productId: "menu_1",
      productName: "Nasi Goreng",
      quantity: 2,
      price: 50000,
      variant: "Pedas",
    });
  });

  it("maps tracking, delivery, and item fields from an API row", () => {
    const order = mapCustomerOrder({
      id: "order_456",
      orderNumber: "DT-002",
      totalAmount: 85000,
      paymentMethod: "cash",
      orderType: "delivery",
      tableNumber: null,
      deliveryStatus: "dropping_off",
      deliveryProvider: "grab",
      deliveryAddress: "Jl. Tentram No. 1",
      deliveryDate: "2026-10-25",
      trackingStatus: "preparing",
      paymentDeadlineAt: "2026-10-25T10:30:00.000Z",
      estimatedReadyAt: "2026-10-25T10:20:00.000Z",
      slaStartedAt: "2026-10-25T10:01:00.000Z",
      slaDeadlineAt: "2026-10-25T10:31:00.000Z",
      isLate: true,
      lateMinutes: 4,
      trackingGroupCount: 2,
      trackingFinishedGroupCount: 1,
      trackingGroups: [{ groupType: "kitchen", status: "dibuat" }],
      items: [{ productId: "menu_2", productName: "Es Teh", quantity: 1, price: 15000, status: "ready" }],
    });

    expect(order.deliveryStatus).toBe("dropping_off");
    expect(order.deliveryProvider).toBe("grab");
    expect(order.deliveryAddress).toBe("Jl. Tentram No. 1");
    expect(order.deliveryDate).toBe("2026-10-25");
    expect(order.trackingStatus).toBe("preparing");
    expect(order.paymentDeadlineAt).toBe("2026-10-25T10:30:00.000Z");
    expect(order.estimatedReadyAt).toBe("2026-10-25T10:20:00.000Z");
    expect(order.isLate).toBe(true);
    expect(order.lateMinutes).toBe(4);
    expect(order.trackingGroupCount).toBe(2);
    expect(order.trackingFinishedGroupCount).toBe(1);
    expect(order.trackingGroups).toEqual([{ groupType: "kitchen", status: "dibuat" }]);
    expect(order.items[0].status).toBe("ready");
  });
});
