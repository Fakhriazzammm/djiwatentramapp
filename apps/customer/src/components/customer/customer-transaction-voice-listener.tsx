import { useEffect, useRef } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { clearCustomerTransactionVoiceQueue, enqueueCustomerTransactionVoice } from "@/lib/transaction-voice-queue";
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
	const { orders, isLoading } = useCustomerOrders();
	const seeded = useRef(false);
	const seedStarted = useRef(false);
	const knownStatuses = useRef(new Map<string, string>());
	const announcedSettledOrderIds = useRef(new Set<string>());
	const seedTimer = useRef<number | undefined>(undefined);
	const seedCompletedAt = useRef<number | null>(null);
	const trackedSourceId = useRef<string | null | undefined>(undefined);

	// Reset all voice state when the logged-in user changes so one customer's
	// orders never trigger sounds for another customer on the same device.
	useEffect(() => {
		const currentSourceId = customer?.sourceId ?? null;
		if (trackedSourceId.current !== currentSourceId) {
			clearCustomerTransactionVoiceQueue();
			trackedSourceId.current = currentSourceId;
			seeded.current = false;
			seedStarted.current = false;
			knownStatuses.current = new Map();
			announcedSettledOrderIds.current = new Set();
			seedCompletedAt.current = null;
			if (seedTimer.current) {
				window.clearTimeout(seedTimer.current);
				seedTimer.current = undefined;
			}
		}
	}, [customer]);

	useEffect(() => {
		if (!customer || isLoading || !orders) return;

		const next = new Map<string, string>();
		for (const order of orders) {
			const orderId = String(order.id ?? "");
			if (!orderId) continue;
			next.set(orderId, String(order.status ?? "").toLowerCase());
		}

		// Phase 1: seed window. Accumulate every order we see without playing
		// any sound, so orders that load progressively (empty -> partial -> full)
		// or arrive from realtime are treated as "already existing".
		if (!seeded.current) {
			for (const [id, status] of next) knownStatuses.current.set(id, status);
			if (next.size > 0) {
				seedStarted.current = true;
				// Debounce: restart the grace timer on every data change so the
				// seed only completes once orders have stopped changing (handles
				// slow / progressive loads that exceed a fixed 1.5s window).
				if (seedTimer.current) window.clearTimeout(seedTimer.current);
				seedTimer.current = window.setTimeout(() => {
					seeded.current = true;
					seedCompletedAt.current = Date.now();
				}, 1500);
			}
			return;
		}

		// Phase 2: only genuinely new orders (or a status change to paid) beep.
		for (const [orderId, status] of next) {
			const previous = knownStatuses.current.get(orderId);
			const currentOrder = (orders as any[]).find((o) => String(o.id) === orderId);
			const method = paymentLabel(currentOrder?.paymentMethod ?? null);
			const paid = isPaid(status);
			const isNewOrderAfterSeed = seedCompletedAt.current !== null && Number(currentOrder?.createdAt ?? 0) > seedCompletedAt.current;

			if (previous === undefined) {
				if (paid && isNewOrderAfterSeed) {
					announcedSettledOrderIds.current.add(orderId);
					enqueueCustomerTransactionVoice({
						eventKey: `customer-order:${orderId}`,
						text: resolveCustomerTransactionVoice({ eventType: "order_paid", paymentMethod: method, customerName: customer.name }).text,
					});
				} else if (method === "kasir" && isNewOrderAfterSeed) {
					enqueueCustomerTransactionVoice({
						eventKey: `customer-order:${orderId}`,
						text: resolveCustomerTransactionVoice({ eventType: "order_cashier_pending", customerName: customer.name }).text,
					});
				}
			} else {
				const wasAnnounced = announcedSettledOrderIds.current.has(orderId);
				if (!wasAnnounced && paid) {
					announcedSettledOrderIds.current.add(orderId);
				enqueueCustomerTransactionVoice({
					eventKey: `customer-order:${orderId}`,
					text: resolveCustomerTransactionVoice({ eventType: "order_paid", paymentMethod: method, customerName: customer.name }).text,
				});
				}
			}

			knownStatuses.current.set(orderId, status);
		}
	}, [customer, orders, isLoading]);

	useEffect(() => {
		return () => {
			if (seedTimer.current) window.clearTimeout(seedTimer.current);
		};
	}, []);

	return null;
}
