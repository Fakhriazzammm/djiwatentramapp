import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Coins, Loader2, LogIn, Star } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerPoints } from "@/hooks/use-customer-data";

export const Route = createLazyFileRoute("/$username/poin")({
	component: PoinPage,
});

const fmtDate = (iso: string) => {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const REASON_LABEL: Record<string, string> = {
	order: "Pesanan",
	order_reward: "Reward pesanan",
	redeem: "Penukaran poin",
	adjustment: "Penyesuaian",
	bonus: "Bonus",
	minigame: "Minigames",
};

function PoinPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { isAuthenticated, customer, isLoading: authLoading } = useCustomerAuth();
	const { points, isLoading, error } = useCustomerPoints();

	const goHome = () => navigate({ to: "/$username", params: { username } });

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button type="button" onClick={goHome} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<ArrowLeft className="h-4 w-4" /> Kembali
						</button>
						<h1 className="ml-1 text-sm font-black tracking-tight">Poin Saya</h1>
					</div>
				</header>

				<main className="px-3 py-4">
					{authLoading ? (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="h-5 w-5 animate-spin text-primary" />
						</div>
					) : !isAuthenticated || !customer ? (
						/* ── Guest: ajak login ── */
						<div className="flex flex-col items-center rounded-xl border border-border bg-card px-4 py-10 text-center shadow-sm">
							<span className="text-4xl">🪙</span>
							<h2 className="mt-3 text-base font-black">Kumpulkan Poin</h2>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								Masuk atau daftar sebagai member untuk mengumpulkan poin dari setiap pesanan dan menukarnya dengan reward.
							</p>
							<button
								type="button"
								onClick={goHome}
								className="mt-4 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
							>
								<LogIn className="h-3.5 w-3.5" /> Masuk / Daftar
							</button>
						</div>
					) : (
						<>
							{/* ── Saldo poin ── */}
							<div className="rounded-xl bg-gradient-to-r from-primary/15 to-primary/5 border border-border px-4 py-4 shadow-sm">
								<div className="flex items-center gap-2">
									<Star className="h-4 w-4 text-amber-500" />
									<span className="text-xs font-bold text-muted-foreground">Yumi Poin</span>
								</div>
								<p className="mt-1 text-3xl font-black tracking-tight">{customer.totalPoints.toLocaleString("id-ID")}</p>
								{customer.lifetimePoints > 0 ? (
									<p className="mt-0.5 text-[10px] text-muted-foreground">
										Total terkumpul: {customer.lifetimePoints.toLocaleString("id-ID")} poin seumur hidup
									</p>
								) : null}
							</div>

							{/* ── Riwayat poin ── */}
							<h2 className="mt-5 mb-2 text-xs font-black uppercase tracking-wider text-foreground">Riwayat Poin</h2>
							{isLoading ? (
								<div className="flex items-center justify-center py-10">
									<Loader2 className="h-5 w-5 animate-spin text-primary" />
								</div>
							) : error ? (
								<p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">{error}</p>
							) : !points || points.length === 0 ? (
								<div className="flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-8 text-center">
									<Coins className="h-6 w-6 text-muted-foreground/50" />
									<p className="mt-2 text-xs text-muted-foreground">Belum ada riwayat poin. Yuk mulai pesan untuk kumpulkan poin!</p>
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
									{points.map((entry) => {
										const positive = entry.points >= 0;
										return (
											<div key={entry.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
												<div className="min-w-0">
													<p className="truncate text-xs font-bold">
														{REASON_LABEL[entry.reason] ?? entry.reason ?? "Aktivitas"}
													</p>
													{entry.note ? <p className="truncate text-[10px] text-muted-foreground">{entry.note}</p> : null}
													<p className="text-[10px] text-muted-foreground">{fmtDate(entry.createdAt)}</p>
												</div>
												<div className="ml-3 shrink-0 text-right">
													<p className={`text-sm font-black ${positive ? "text-emerald-600" : "text-red-500"}`}>
														{positive ? "+" : ""}{entry.points.toLocaleString("id-ID")}
													</p>
													<p className="text-[10px] text-muted-foreground">Saldo: {entry.balanceAfter.toLocaleString("id-ID")}</p>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</>
					)}
				</main>
			</div>
		</div>
	);
}
