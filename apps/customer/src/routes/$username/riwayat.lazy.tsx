import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ClipboardList, Loader2, LogIn } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { currency } from "@/components/customer/types";

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

	const goHome = () => navigate({ to: "/$username", params: { username } });
	const goOrder = () => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } });

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button type="button" onClick={goHome} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<ArrowLeft className="h-4 w-4" /> Kembali
						</button>
						<h1 className="ml-1 text-sm font-black tracking-tight">Riwayat Pesanan</h1>
					</div>
				</header>

				<main className="px-3 py-4">
					{authLoading ? (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="h-5 w-5 animate-spin text-primary" />
						</div>
					) : !isAuthenticated ? (
						/* ── Guest: ajak login ── */
						<div className="flex flex-col items-center rounded-xl border border-border bg-card px-4 py-10 text-center shadow-sm">
							<span className="text-4xl">📋</span>
							<h2 className="mt-3 text-base font-black">Riwayat Pesanan</h2>
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
						<div className="flex items-center justify-center py-20">
							<Loader2 className="h-5 w-5 animate-spin text-primary" />
						</div>
					) : error ? (
						<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">{error}</p>
					) : !orders || orders.length === 0 ? (
						<div className="flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-10 text-center">
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
									<div key={order.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
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
												{order.items.slice(0, 4).map((item, idx) => (
													<div key={`${order.id}-${idx}`} className="flex items-center justify-between text-[11px]">
														<span className="truncate text-muted-foreground">
															{item.quantity}× {item.productName}
														</span>
														<span className="ml-2 shrink-0 text-muted-foreground">{currency(item.price * item.quantity)}</span>
													</div>
												))}
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
