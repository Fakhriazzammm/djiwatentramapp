import { CustomerHeader } from "@/components/customer/customer-shell";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ClipboardList, LogIn, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { useOrderContext } from "@/hooks/use-order-context";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { currency } from "@/components/customer/types";
import type { CartItem } from "@/components/customer/types";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/riwayat")({
	component: RiwayatPage,
});

const fmtDate = (ms: number) => {
	const d = new Date(ms);
	if (!ms || Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_LABEL: Record<string, string> = {
	pending: "Menunggu",
	preparing: "Diproses",
	processing: "Diproses",
	ready: "Siap",
	served: "Disajikan",
	completed: "Selesai",
	paid: "Dibayar",
	cancelled: "Dibatalkan",
	canceled: "Dibatalkan",
};

const STATUS_STYLE: Record<string, string> = {
	pending: "bg-amber-100 text-amber-700",
	preparing: "bg-sky-100 text-sky-700",
	processing: "bg-sky-100 text-sky-700",
	ready: "bg-violet-100 text-violet-700",
	served: "bg-emerald-100 text-emerald-700",
	completed: "bg-emerald-100 text-emerald-700",
	paid: "bg-emerald-100 text-emerald-700",
	cancelled: "bg-red-100 text-red-600",
	canceled: "bg-red-100 text-red-600",
};

function getDateGroup(ms: number) {
	const date = new Date(ms);
	const today = new Date();
	const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
	const difference = Math.round((start(today) - start(date)) / 86_400_000);
	if (difference === 0) return "HARI INI";
	if (difference === 1) return "KEMARIN";
	return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}

function humanizeOrderType(value: string | null) {
	if (!value) return "Pesanan";
	return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function humanizeStatus(value: string | null) {
	const key = value?.toLowerCase() ?? "";
	return STATUS_LABEL[key] ?? humanizeOrderType(value);
}

function RiwayatPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { isAuthenticated, isLoading: authLoading } = useCustomerAuth();
	const { orders, isLoading, error } = useCustomerOrders();
	const { setCart } = useOrderContext();
	const products = useHybridProducts();
	const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

	const goHome = () => navigate({ to: "/$username", params: { username } });
	const goOrder = () => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } });

	// Map product id → product untuk foto menu & harga terbaru
	const productMap = useMemo(() => {
		const map = new Map<string, Record<string, any>>();
		for (const p of products ?? []) map.set(String((p as Record<string, any>)._id), p as Record<string, any>);
		return map;
	}, [products]);

	const groupedOrders = useMemo(() => {
		const groups = new Map<string, typeof orders>();
		for (const order of orders) {
			const key = getDateGroup(order.createdAt);
			groups.set(key, [...(groups.get(key) ?? []), order]);
		}
		return [...groups.entries()];
	}, [orders]);

	const pesanLagi = (order: { items: Array<{ productId: string; productName: string; quantity: number; price: number; variant?: string | null }> }) => {
		const items: CartItem[] = [];
		const skipped: string[] = [];
		for (const item of order.items) {
			const product = productMap.get(item.productId);
			if (!product) {
				skipped.push(item.productName);
				continue;
			}
			items.push({
				productId: item.productId,
				name: product.name || item.productName,
				price: Number(product.price ?? item.price ?? 0),
				quantity: item.quantity,
				variant: item.variant ?? undefined,
				image: product.image ?? undefined,
				categoryId: product.categoryId ?? "",
				menuNumber: product.menuNumber != null ? Number(product.menuNumber) : undefined,
			});
		}
		if (items.length === 0) {
			toast.error("Menu tidak tersedia untuk dipesan ulang");
			return;
		}
		setCart(items);
		if (skipped.length > 0) toast.info(`${skipped.length} menu sudah tidak tersedia dan dilewati`);
		else toast.success("Keranjang diisi ulang dari pesanan ini");
		navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } });
	};

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<CustomerHeader title="Riwayat Pesanan" subtitle="Djiwa Tentram" onBack={goHome} leading={<ArrowLeft className="h-4 w-4" />} />

				<main className="px-3 py-4">
					{authLoading ? (
						<CustomerSectionSkeleton label="Memeriksa akun" />
					) : isLoading ? (
						<CustomerSectionSkeleton label="Memuat riwayat pesanan" />
					) : error ? (
						<CustomerErrorState message={error} />
					) : !isAuthenticated && (!orders || orders.length === 0) ? (
						/* ── Guest tanpa order aktif: ajak login ── */
						<div className="flex flex-col items-center rounded-3xl border border-border bg-card px-4 py-10 text-center shadow-sm">
							<ClipboardList aria-hidden="true" className="h-8 w-8 text-primary" strokeWidth={2} />
							<h2 className="mt-3 font-display text-base font-black">Riwayat Pesanan</h2>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								Masuk sebagai member agar semua pesananmu tersimpan dan bisa dilihat lagi di sini.
							</p>
							<div className="mt-4 flex gap-2">
								<button
									type="button"
									onClick={goHome}
									className="flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
								>
									<LogIn className="h-3.5 w-3.5" /> Kembali ke beranda untuk masuk
								</button>
								<button
									type="button"
									onClick={goOrder}
									className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-black text-muted-foreground"
								>
									Pesan sekarang
								</button>
							</div>
						</div>
					) : !orders || orders.length === 0 ? (
						<div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-10 text-center">
							<ClipboardList className="h-6 w-6 text-muted-foreground/50" />
							<p className="mt-2 text-xs text-muted-foreground">Belum ada pesanan. Yuk pesan menu favoritmu!</p>
							<button
								type="button"
								onClick={goOrder}
								className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-sm"
							>
								Pesan sekarang
							</button>
						</div>
					) : (
						<div className="space-y-6">
							{groupedOrders.map(([group, groupOrders]) => (
								<section key={group} aria-labelledby={`orders-${group}`}>
									<h2 id={`orders-${group}`} className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{group}</h2>
									<div className="space-y-2">
										{groupOrders.map((order) => {
											const statusKey = order.status?.toLowerCase?.() ?? "";
											const isExpanded = expandedOrderId === order.id;
											const itemSubtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
											const discount = order.discountAmount ?? Math.max(0, itemSubtotal - order.totalAmount);
											const happyHourApplied = order.receiptMeta?.happyHourApplied === true;
											return (
												<div key={order.id} className="overflow-hidden rounded-[22px] bg-card shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
													<button type="button" aria-expanded={isExpanded} onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20 active:bg-muted/30">
														<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-black">{new Date(order.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span><span className="truncate text-xs font-semibold text-muted-foreground">{order.items[0]?.productName || "Pesanan"}{order.items.length > 1 ? ` +${order.items.length - 1}` : ""}</span></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{order.items.reduce((sum, item) => sum + item.quantity, 0)} item · {humanizeOrderType(order.orderType)}{order.tableNumber ? ` · Meja ${order.tableNumber}` : ""}</p></div>
														<div className="shrink-0 text-right"><p className="text-sm font-black">{currency(order.totalAmount)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[statusKey] ?? "bg-muted text-muted-foreground"}`}>{humanizeStatus(order.status)}</span></div><ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
													</button>
													<AnimatePresence initial={false}>{isExpanded ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden"><div className="border-t border-border/60 px-4 pb-4 pt-3">
														<div className="mb-3 flex flex-wrap items-center gap-2"><p className="text-[10px] font-medium text-muted-foreground">#{order.orderNumber || order.id.slice(0, 8)} · {fmtDate(order.createdAt)}</p>{happyHourApplied ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">Happy Hour</span> : null}</div>
														<div className="space-y-2">{order.items.map((item, index) => <div key={`${order.id}-${index}`} className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0 text-foreground"><span className="font-bold">{item.quantity}×</span> {item.productName}{item.variant ? ` (${item.variant})` : ""}<span className="ml-1 text-muted-foreground">· {currency(item.price)} / item</span></span><span className="shrink-0 font-semibold">{currency(item.price * item.quantity)}</span></div>)}</div>
														<div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">{itemSubtotal !== order.totalAmount ? <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{currency(itemSubtotal)}</span></div> : null}{discount > 0 ? <div className="flex justify-between text-emerald-600"><span>Diskon</span><span>-{currency(discount)}</span></div> : null}{(Number(order.taxAmount ?? 0) > 0 || Number((order.receiptMeta as any)?.taxRateSnapshot ?? 0) > 0) ? <div className="flex justify-between text-muted-foreground"><span>PBJT/Pajak Restoran ({Number((order.receiptMeta as any)?.taxRateSnapshot ?? 0)}%)</span><span>{currency(order.taxAmount ?? 0)}</span></div> : null}<div className="flex justify-between text-muted-foreground"><span>Service charge</span><span>{currency(order.serviceChargeAmount ?? 0)}</span></div><div className="flex justify-between pt-1 text-sm font-black"><span>Total</span><span>{currency(order.totalAmount)}</span></div></div>
														<button type="button" onClick={(event) => { event.stopPropagation(); pesanLagi(order); }} className="mt-4 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[13px] bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition-transform duration-200 active:scale-[.97]"><RotateCcw className="h-3.5 w-3.5" /> Pesan lagi</button>
													</div></motion.div> : null}</AnimatePresence>
												</div>
											);
										})}
									</div>
								</section>
							))}
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
