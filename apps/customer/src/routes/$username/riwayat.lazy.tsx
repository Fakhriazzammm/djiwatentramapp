import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ClipboardList, LogIn, RotateCcw } from "lucide-react";
import { useMemo } from "react";
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

function RiwayatPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { isAuthenticated, isLoading: authLoading } = useCustomerAuth();
	const { orders, isLoading, error } = useCustomerOrders();
	const { setCart } = useOrderContext();
	const products = useHybridProducts();

	const goHome = () => navigate({ to: "/$username", params: { username } });
	const goOrder = () => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } });

	// Map product id → product untuk foto menu & harga terbaru
	const productMap = useMemo(() => {
		const map = new Map<string, Record<string, any>>();
		for (const p of products ?? []) map.set(String((p as Record<string, any>)._id), p as Record<string, any>);
		return map;
	}, [products]);

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
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button type="button" onClick={goHome} className="flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<ArrowLeft className="h-4 w-4" /> Kembali
						</button>
						<h1 className="ml-1 text-sm font-black tracking-tight">Riwayat Pesanan</h1>
					</div>
				</header>

				<main className="px-3 py-4">
					{authLoading ? (
						<CustomerSectionSkeleton label="Memeriksa akun" />
					) : !isAuthenticated ? (
						/* ── Guest: ajak login ── */
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
									className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
								>
									<LogIn className="h-3.5 w-3.5" /> Masuk / Daftar
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
					) : isLoading ? (
						<CustomerSectionSkeleton label="Memuat riwayat pesanan" />
					) : error ? (
						<CustomerErrorState message={error} />
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
						<div className="space-y-2.5">
							{orders.map((order) => {
								const statusKey = order.status?.toLowerCase?.() ?? "";
								return (
									<div key={order.id} className="rounded-3xl border border-border bg-card p-4 shadow-sm">
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate text-xs font-black">#{order.orderNumber || order.id.slice(0, 8)}</p>
												<p className="text-[10px] text-muted-foreground">{fmtDate(order.createdAt)}</p>
											</div>
											<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[statusKey] ?? "bg-muted text-muted-foreground"}`}>
												{STATUS_LABEL[statusKey] ?? order.status}
											</span>
										</div>

										{order.items.length > 0 ? (
											<div className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
												{order.items.slice(0, 4).map((item, idx) => {
													const product = productMap.get(item.productId);
													const image = typeof product?.image === "string" && /^https?:\/\//.test(product.image) ? product.image : null;
													return (
														<div key={`${order.id}-${idx}`} className="flex items-center justify-between text-[11px]">
															<span className="flex min-w-0 items-center gap-2">
																{image ? <img alt="" src={image} className="h-8 w-8 shrink-0 rounded-lg object-cover" /> : null}
																<span className="min-w-0 break-words pr-2 text-muted-foreground">
																	{item.quantity}× {item.productName}{item.variant ? ` (${item.variant})` : ""}
																</span>
															</span>
															<span className="ml-2 shrink-0 text-muted-foreground">{currency(item.price * item.quantity)}</span>
														</div>
													);
												})}
												{order.items.length > 4 ? (
													<p className="text-[10px] text-muted-foreground/70">+{order.items.length - 4} item lainnya</p>
												) : null}
											</div>
										) : null}

										<div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
											<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												{[order.orderType, order.tableNumber ? `Meja ${order.tableNumber}` : null].filter(Boolean).join(" · ") || "Total"}
											</span>
											<span className="text-sm font-black">{currency(order.totalAmount)}</span>
										</div>

										<div className="mt-2 flex justify-end">
											<button
												type="button"
												onClick={() => pesanLagi(order)}
												className="flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm transition-transform duration-[180ms] active:scale-[.97]"
											>
												<RotateCcw className="h-3.5 w-3.5" /> Pesan lagi
											</button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
