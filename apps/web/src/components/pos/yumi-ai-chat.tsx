import { useState, useEffect, useCallback } from "react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import AIChatContainer from "../../routes/admin/-components/ai-chat/ai-chat-container";

interface YumiAIChatProps {
	onClose?: () => void;
	cartItems?: Array<{ productId: string; name: string; qty: number; price: number }>;
	shiftId?: string | null;
}

export function YumiAIChat({ onClose, cartItems, shiftId }: YumiAIChatProps) {
	const [contextHint, setContextHint] = useState<string | null>(null);

	const inventory = useQuery(api.inventory.getInventory, {});
	const pendingOrders = useQuery(api.orders.getOrders, {});

	useEffect(() => {
		const hints: string[] = [];

		if (cartItems && cartItems.length > 0) {
			const total = cartItems.reduce((s, i) => s + i.qty * i.price, 0);
			const itemNames = cartItems.slice(0, 5).map(i => `${i.name} x${i.qty}`).join(", ");
			hints.push(`Keranjang: ${cartItems.length} item (${itemNames}) — Total Rp ${total.toLocaleString("id-ID")}`);
		}

		if (inventory) {
			const low = inventory.filter((i: any) => i.quantity <= i.lowStockThreshold);
			if (low.length > 0) {
				hints.push(`Stok rendah: ${low.slice(0, 3).map((i: any) => i.name).join(", ")}`);
			}
		}

		if (pendingOrders) {
			const pending = pendingOrders.filter((o: any) => o.status === "pending");
			if (pending.length > 0) {
				hints.push(`${pending.length} pesanan menunggu`);
			}
		}

		if (shiftId) {
			hints.push("Shift aktif");
		}

		setContextHint(hints.length > 0 ? hints.join(" | ") : null);
	}, [cartItems, inventory, pendingOrders, shiftId]);

	return <AIChatContainer mode="pos" onClose={onClose} contextHint={contextHint ?? undefined} />;
}
