import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, LogIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { currency } from "@/components/customer/types";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/notifikasi")({
	component: NotifikasiPage,
});

const SEEN_KEY = "djiwa-customer-notif-seen";

const STATUS_MESSAGE: Record<string, string> = {
	pending: "sedang menunggu konfirmasi",
	preparing: "sedang disiapkan dapur",
	processing: "sedang diproses",
	ready: "sudah siap — silakan diambil",
	served: "sudah disajikan, selamat menikmati!",
	completed: "telah selesai. Terima kasih!",
	paid: "pembayarannya sudah diterima",
	cancelled: "dibatalkan",
	canceled: "dibatalkan",
};

const timeAgo = (ms: number) => {
	const diff = Date.now() - ms;
	if (diff < 60_000) return "Baru saja";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} jam lalu`;
	if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} hari lalu`;
	return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

function NotifikasiPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { isAuthenticated, isLoading: authLoading } = useCustomerAuth();
	const { orders, isLoading } = useCustomerOrders();

	// Timestamp terakhir kali halaman ini dibuka → penanda "belum dibaca"
	const [lastSeen] = useState<number>(() => {
		try {
			return Number(localStorage.getItem(SEEN_KEY) ?? 0);
		} catch {
			return 0;
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem(SEEN_KEY, String(Date.now()));
		} catch {}
	}, []);

	const goHome = () => navigate({ to: "/$username", params: { username } });

	const notifications = useMemo(() => {
		if (!orders) return undefined;
		return orders.map((order) => {
			const statusKey = order.status?.toLowerCase?.() ?? "";
			return {
				id: order.id,
				title: `Pesanan #${order.orderNumber || order.id.slice(0, 8)}`,
				message: `Pesananmu (${currency(order.totalAmount)}) ${STATUS_MESSAGE[statusKey] ?? `berstatus ${order.status}`}.`,
				createdAt: order.createdAt,
				unread: order.createdAt > lastSeen,
			};
		});
	}, [orders, lastSeen]);

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button type="button" onClick={goHome} className="flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<ArrowLeft className="h-4 w-4" /> Kembali
						</button>
						<h1 className="ml-1 text-sm font-black tracking-tight">Notifikasi</h1>
					</div>
				</header>

				<main className="px-3 py-4">
					{authLoading ? (
						<CustomerSectionSkeleton label="Memeriksa akun" />
					) : !isAuthenticated ? (
						/* ── Guest: ajak login ── */
						<div className="flex flex-col items-center rounded-3xl border border-border bg-card px-4 py-10 text-center shadow-sm">
							<Bell aria-hidden="true" className="h-8 w-8 text-primary" strokeWidth={2} />
							<h2 className="mt-3 font-display text-base font-black">Notifikasi</h2>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								Masuk sebagai member untuk menerima update status pesanan dan info promo di sini.
							</p>
							<button
								type="button"
								onClick={goHome}
								className="mt-4 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
							>
								<LogIn className="h-3.5 w-3.5" /> Masuk / Daftar
							</button>
						</div>
					) : isLoading || notifications === undefined ? (
						<CustomerSectionSkeleton label="Memuat notifikasi" />
					) : notifications.length === 0 ? (
						<div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-10 text-center">
							<Bell className="h-6 w-6 text-muted-foreground/50" />
							<p className="mt-2 text-xs text-muted-foreground">Belum ada notifikasi. Update pesananmu akan muncul di sini.</p>
							<button
								type="button"
								onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })}
								className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-sm"
							>
								Pesan sekarang
							</button>
						</div>
					) : (
						<div className="space-y-2">
							{notifications.map((notif) => (
								<div key={notif.id} className={`flex gap-3 rounded-[20px] border px-3 py-3 shadow-sm ${notif.unread ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
									<div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${notif.unread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
										<Bell className="h-3.5 w-3.5" />
									</div>
									<div className="min-w-0">
										<div className="flex items-center gap-1.5">
											<p className="break-words text-xs font-black">{notif.title}</p>
											{notif.unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
										</div>
										<p className="text-[11px] leading-snug text-muted-foreground">{notif.message}</p>
										<p className="mt-0.5 text-[10px] text-muted-foreground/70">{timeAgo(notif.createdAt)}</p>
									</div>
								</div>
							))}
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
