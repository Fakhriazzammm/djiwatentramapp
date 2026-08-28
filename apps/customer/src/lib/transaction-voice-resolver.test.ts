import { resolveCustomerTransactionVoice } from "@/lib/transaction-voice-resolver";

describe("resolveCustomerTransactionVoice", () => {
  it("announces cashier pending with customer name", () => {
    const { text } = resolveCustomerTransactionVoice({
      eventType: "order_cashier_pending",
      customerName: "Budi",
    });
    expect(text).toBe("Pesanan baru DjiwaApp atas nama Budi, menunggu pembayaran di kasir.");
  });

  it("announces QRIS paid with customer name", () => {
    const { text } = resolveCustomerTransactionVoice({
      eventType: "order_paid",
      paymentMethod: "qris",
      customerName: "Sari",
    });
    expect(text).toBe("Pesanan DjiwaApp atas nama Sari sudah dibayar melalui QRIS.");
  });

  it("announces Djiwa Pay paid with customer name", () => {
    const { text } = resolveCustomerTransactionVoice({
      eventType: "order_paid",
      paymentMethod: "wallet",
      customerName: "Anwar",
    });
    expect(text).toBe("Pesanan DjiwaApp atas nama Anwar sudah dibayar melalui Djiwa Pay.");
  });

  it("normalizes mayar method to QRIS", () => {
    const { text } = resolveCustomerTransactionVoice({
      eventType: "order_paid",
      paymentMethod: "mayar",
      customerName: "Dewi",
    });
    expect(text).toBe("Pesanan DjiwaApp atas nama Dewi sudah dibayar melalui QRIS.");
  });

  it("omits customer name when absent", () => {
    const { text } = resolveCustomerTransactionVoice({
      eventType: "order_cashier_pending",
    });
    expect(text).toBe("Pesanan baru DjiwaApp, menunggu pembayaran di kasir.");
  });

  it("falls back to generic POS voice for order_created", () => {
    const { text } = resolveCustomerTransactionVoice({ eventType: "order_created" });
    expect(text).toBe("Pesanan baru diterima.");
  });
});
