import { describe, expect, it } from "bun:test";
import { loadAllRows, loadCustomerRows } from "@/lib/customers-data";

type Customer = { source_id: string; email: string | null; name: string | null };
type Order = { authUserId?: string; auth_user_id?: string; customerSourceId?: string; customer_source_id?: string; customerEmail?: string; customer_email?: string; customerName?: string; customer_name?: string; status: string; totalAmount?: number; total_amount?: number };

function normalizeCustomerName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/^\d+[_-]+/, "").replace(/\s+/g, " ");
}
function isSettledOrder(order: Order) { return ["paid", "completed"].includes(order.status.toLowerCase()); }
function customerMatchesOrder(customer: Customer, order: Order) {
  const id = String(customer.source_id || "");
  const orderCustomerId = String(order.customerSourceId || order.customer_source_id || "");
  const orderId = String(order.authUserId || order.auth_user_id || "");
  const email = String(order.customerEmail || order.customer_email || "");
  if (id && orderCustomerId && id === orderCustomerId) return true;
  if (id && orderId && id === orderId) return true;
  if (customer.email && email && customer.email.toLowerCase() === email.toLowerCase()) return true;
  return normalizeCustomerName(customer.name) !== "" && normalizeCustomerName(customer.name) === normalizeCustomerName(order.customerName || order.customer_name);
}

describe("admin customer aggregates", () => {
  it("loads every page until the final short page", async () => {
    const requestedRanges: Array<[number, number]> = [];
    const rows = await loadAllRows(async (range) => {
      requestedRanges.push(range);
      const [from] = range;
      const page = from === 0
        ? Array.from({ length: 2 }, (_, index) => `row-${index}`)
        : [`row-${from}`];
      return page;
    }, 2);

    expect(rows).toEqual(["row-0", "row-1", "row-2"]);
    expect(requestedRanges).toEqual([[0, 1], [2, 3]]);
  });

  it("keeps customer rows when the optional order query is denied", async () => {
    const rows = await loadCustomerRows(
      async () => ({
        data: [{ source_id: "customer-1", name: "Pelanggan Satu", total_orders: 2, total_spent: 90000 }],
        error: null,
      }),
      async () => { throw new Error("Protected read failed (401)"); },
      undefined,
      () => undefined,
    );

    expect(rows).toEqual([
      { source_id: "customer-1", name: "Pelanggan Satu", total_orders: 2, total_spent: 90000 },
    ]);
  });

  it("matches legacy numeric customer prefixes to order names", () => {
    const customer = { source_id: "legacy", email: "237006015@student.unsil.ac.id", name: "015_Amellia Dwi Ningsih" };
    const order = { status: "completed", customerName: "Amellia Dwi Ningsih", totalAmount: 45000 };
    expect(customerMatchesOrder(customer, order)).toBe(true);
  });
  it("matches the canonical customerSourceId relation", () => {
    const customer = { source_id: "customer-123", email: null, name: "Nama Berbeda" };
    const order = { status: "paid", customerSourceId: "customer-123", totalAmount: 125000 };
    expect(customerMatchesOrder(customer, order)).toBe(true);
  });
  it("counts only settled matched orders", () => {
    const customer = { source_id: "legacy", email: null, name: "015_Amellia Dwi Ningsih" };
    const orders = [
      { status: "completed", customerName: "Amellia Dwi Ningsih", totalAmount: 45000 },
      { status: "pending", customerName: "Amellia Dwi Ningsih", totalAmount: 45000 },
    ];
    const settled = orders.filter((o) => isSettledOrder(o) && customerMatchesOrder(customer, o));
    expect(settled).toHaveLength(1);
    expect(settled[0].totalAmount).toBe(45000);
  });
});
