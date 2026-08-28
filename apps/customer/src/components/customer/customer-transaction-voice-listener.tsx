import { useEffect, useRef } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { enqueueCustomerTransactionVoice } from "@/lib/transaction-voice-queue";
import { resolveCustomerTransactionVoice } from "@/lib/transaction-voice-resolver";

function paymentLabel(method: string | null) {
  const value = String(method ?? "").toLowerCase();
  if (["wallet", "djiwa_pay", "djiwaapp"].includes(value)) return "Djiwa Pay";
  if (["qris", "qris_mayar", "mayar"].includes(value)) return "QRIS";
  return "kasir";
}

function isPaid(status: string) {
  const value = String(status ?? "").toLowerCase();
  return value === "paid" || value === "completed";
}

export function CustomerTransactionVoiceListener() {
  const { customer } = useCustomerAuth();
  const { orders } = useCustomerOrders();
  const seeded = useRef(false);
  const knownStatuses = useRef(new Map<string, string>());

  useEffect(() => {
    if (!customer || !orders) return;
    const next = new Map<string, string>();
    for (const order of orders) {
      const orderId = String(order.id ?? "");
      if (!orderId) continue;
      const status = String(order.status ?? "").toLowerCase();
      next.set(orderId, status);

      // First load: hanya seed status historis, jangan bunyikan notifikasi lama.
      if (!seeded.current) continue;

      const previous = knownStatuses.current.get(orderId);
      const method = paymentLabel(order.paymentMethod);
      const paid = isPaid(status);

      if (previous === undefined) {
        // Order baru muncul saat customer sedang aktif.
        if (paid) {
          enqueueCustomerTransactionVoice({
            eventKey: `customer-order:${orderId}:order_paid:${method}`,
            text: resolveCustomerTransactionVoice({ eventType: "order_paid", paymentMethod: method, customerName: customer.name }).text,
          });
        } else if (method === "kasir") {
          enqueueCustomerTransactionVoice({
            eventKey: `customer-order:${orderId}:order_cashier_pending`,
            text: resolveCustomerTransactionVoice({ eventType: "order_cashier_pending", customerName: customer.name }).text,
          });
        }
        // QRIS/Djiwa Pay yang masih pending: tunggu sampai paid (hindari double voice).
        continue;
      }

      if (previous !== status && paid) {
        enqueueCustomerTransactionVoice({
          eventKey: `customer-order:${orderId}:order_paid:${method}`,
          text: resolveCustomerTransactionVoice({ eventType: "order_paid", paymentMethod: method, customerName: customer.name }).text,
        });
      }
    }
    if (!seeded.current) seeded.current = true;
    knownStatuses.current = next;
  }, [customer, orders]);

  return null;
}
