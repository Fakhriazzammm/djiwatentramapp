import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Coins, Copy, Gift, LogIn, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerPoints } from "@/hooks/use-customer-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";

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
	order_points: "Yumi Poin",
	order_reward: "Reward pesanan",
	redeem: "Penukaran poin",
	adjustment: "Penyesuaian",
	bonus: "Bonus",
	minigame: "Minigames",
};

type Reward = {
	id: string;
	name: string;
	cost: number;
	description?: string;
	enabled?: boolean;
};

type Tier = {
	name: string;
	minLifetimePoints: number;
	perks?: string;
};

function getTier(tiers: Tier[], lifetimePoints: number): { current?: Tier; next?: Tier; progress: number } {
	const sorted = [...tiers].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
	const current = [...sorted].reverse().find((t) => lifetimePoints >= t.minLifetimePoints);
	const next = sorted.find((t) => lifetimePoints < t.minLifetimePoints);
	if (!current) {
		return { current: undefined, next: sorted[0], progress: sorted[0] ? Math.min(100, Math.round((lifetimePoints / sorted[0].minLifetimePoints) * 100)) : 100 };
	}
	if (!next) return { current, next: undefined, progress: 100 };
	const span = next.minLifetimePoints - current.minLifetimePoints;
	const earned = lifetimePoints - current.minLifetimePoints;
	return { current, next, progress: Math.min(100, Math.round((earned / span) * 100)) };
}

function PoinPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { isAuthenticated, customer, isLoading: authLoading, refreshCustomer } = useCustomerAuth();
	const { points, isLoading, error, refetch } = useCustomerPoints();
	const siteSettings = useHybridSiteSettings();

	const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
	const [redeeming, setRedeeming] = useState(false);
	const [voucher, setVoucher] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const rewards: Reward[] = Array.isArray(siteSettings?.loyaltyRewards)
		? (siteSettings?.loyaltyRewards as Reward[]).filter((r) => r.enabled !== false)
		: [];
	const tiers: Tier[] = Array.isArray(siteSettings?.loyaltyTiers)
		? (siteSettings?.loyaltyTiers as Tier[]).filter((t) => t.name && t.minLifetimePoints != null)
		: [];

	const balance = customer?.totalPoints ?? 0;
	const tierInfo = tiers.length > 0 ? getTier(tiers, customer?.lifetimePoints ?? 0) : null;

	const goHome = () => navigate({ to: "/$username", params: { username } });

	const doRedeem = async () => {
		if (!selectedReward || !customer) return;
		setRedeeming(true);
		setVoucher(null);
		try {
			const result = await invokeEdgeFunction<{ voucherCode: string; remainingPoints: number }>("customer-sync", {
				action: "redeem",
				sourceId: customer.sourceId,
				email: customer.email ?? undefined,
				rewardId: selectedReward.id,
			});
			setVoucher(result.voucherCode);
			setSelectedReward(null);
			toast.success("Poin berhasil ditukar!");
			// Refresh saldo & riwayat
			if (customer) void refetch(customer);
			void refreshCustomer();
		} catch (err) {
			toast.error((err as Error).message || "Gagal menukar poin");
		} finally {
			setRedeeming(false);
		}
	};

	const copyVoucher = async () => {
		if (!voucher) return;
		try {
			await navigator.clipboard.writeText(voucher);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Gagal menyalin kode");
		}
	};

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button type="button" onClick={goHome} className="flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<ArrowLeft className="h-4 w-4" /> Kembali
						</button>
						<h1 className="ml-1 text-sm font-black tracking-tight">Poin</h1>
					</div>
				</header>

				<main className="px-3 py-4">
					{authLoading ? (
						<CustomerSectionSkeleton label="Memeriksa akun" />
					) : !isAuthenticated || !customer ? (
						/* ── Guest: ajak login ── */
						<div className="flex flex-col items-center rounded-3xl border border-border bg-card px-4 py-10 text-center shadow-sm">
							<Coins aria-hidden="true" className="h-8 w-8 text-primary" strokeWidth={2} />
							<h2 className="mt-3 font-display text-base font-black">Kumpulkan Poin</h2>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								Masuk atau daftar sebagai member untuk mengumpulkan poin dari setiap pesanan dan menukarnya dengan reward.
							</p>
							<button
								type="button"
								onClick={goHome}
								className="mt-4 flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
							>
								<LogIn className="h-3.5 w-3.5" /> Kembali ke beranda untuk masuk
							</button>
						</div>
					) : (
						<>
							{/* ── Saldo poin ── */}
							<div className="rounded-3xl bg-gradient-to-r from-primary/15 to-primary/5 border border-border px-4 py-5 shadow-sm">
								<div className="flex items-center gap-2">
									<Star className="h-4 w-4 text-amber-500" />
									<span className="text-xs font-bold text-muted-foreground">Poin</span>
									{tierInfo?.current ? (
										<span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
											<Sparkles className="h-3 w-3" /> {tierInfo.current.name}
										</span>
									) : null}
								</div>
								<p className="mt-1 text-3xl font-black tracking-tight">{balance.toLocaleString("id-ID")}</p>
								{customer.lifetimePoints > 0 ? (
									<p className="mt-0.5 text-[10px] text-muted-foreground">
										Total terkumpul: {customer.lifetimePoints.toLocaleString("id-ID")} poin seumur hidup
									</p>
								) : null}
							</div>

							{/* ── Tier progress ── */}
							{tierInfo ? (
								<div className="mt-2.5 rounded-3xl border border-border bg-card p-3.5 shadow-sm">
									<div className="flex items-center justify-between">
										<p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Tier membership</p>
										{!tierInfo.current ? (
											<p className="text-[10px] font-bold text-primary">Menuju {tierInfo.next?.name}</p>
										) : tierInfo.next ? (
											<p className="text-[10px] font-bold text-muted-foreground">{tierInfo.current.name} → {tierInfo.next.name}</p>
										) : (
											<p className="text-[10px] font-bold text-primary">Tier tertinggi tercapai</p>
										)}
									</div>
									<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
										<div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${tierInfo.progress}%` }} />
									</div>
									<p className="mt-1.5 text-[10px] text-muted-foreground">
										{tierInfo.next
											? `Butuh ${(tierInfo.next.minLifetimePoints - (customer?.lifetimePoints ?? 0)).toLocaleString("id-ID")} poin lagi untuk naik ke ${tierInfo.next.name}${tierInfo.next.perks ? ` — ${tierInfo.next.perks}` : ""}.`
											: tierInfo.current?.perks ? tierInfo.current.perks : "Kamu sudah di tier tertinggi."}
									</p>
								</div>
							) : null}

							{/* ── Tukar poin ── */}
							{voucher ? (
								<div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-center">
									<Gift aria-hidden="true" className="mx-auto h-8 w-8 text-emerald-600" strokeWidth={2} />
									<h2 className="mt-2 font-display text-base font-black text-emerald-900">Poin berhasil ditukar!</h2>
									<p className="mt-1 text-[11px] text-emerald-800">Simpan kode voucher ini. Staff akan memverifikasi saat kamu menukarkan hadiah.</p>
									<div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-white px-3 py-2.5">
										<span className="font-mono text-sm font-black tracking-[0.14em] text-emerald-900">{voucher}</span>
										<button
											type="button"
											onClick={copyVoucher}
											aria-label="Salin kode voucher"
											className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition-transform duration-[180ms] active:scale-[.97]"
										>
											{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
										</button>
									</div>
									<button
										type="button"
										onClick={() => setVoucher(null)}
										className="mt-3 min-h-11 w-full rounded-[14px] bg-emerald-600 px-3 py-2.5 text-xs font-black text-white shadow-sm"
									>
										Tukar lagi
									</button>
								</div>
							) : rewards.length > 0 ? (
								<div className="mt-5">
									<h2 className="mb-2 text-xs font-black uppercase tracking-wider text-foreground">Tukar Poin</h2>
									<div className="space-y-2.5">
										{rewards.map((reward) => {
											const affordable = balance >= reward.cost;
											return (
												<div key={reward.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
													<div className="flex items-center gap-3 px-3 py-3">
														<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
															<Gift className="h-5 w-5" />
														</div>
														<div className="min-w-0 flex-1">
															<p className="break-words font-display text-sm font-black">{reward.name}</p>
															{reward.description ? <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{reward.description}</p> : null}
															<p className="mt-1 text-xs font-black text-primary">{reward.cost.toLocaleString("id-ID")} poin</p>
														</div>
														<button
															type="button"
															disabled={!affordable || redeeming}
															onClick={() => setSelectedReward(reward)}
															className={`min-h-11 shrink-0 rounded-[14px] px-3.5 py-2.5 text-xs font-black shadow-sm transition-transform duration-[180ms] active:scale-[.97] disabled:opacity-40 ${affordable ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground"}`}
														>
															{affordable ? "Tukar" : "Kurang poin"}
														</button>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							) : null}

							{/* ── Konfirmasi tukar ── */}
							{selectedReward ? (
								<div className="mt-3 rounded-3xl border border-primary/20 bg-primary/5 p-4">
									<p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Konfirmasi penukaran</p>
									<p className="mt-1.5 text-xs font-black">{selectedReward.name}</p>
									<p className="mt-0.5 text-[11px] text-muted-foreground">
										Saldo kamu <span className="font-bold text-foreground">{balance.toLocaleString("id-ID")} poin</span> → sisa{" "}
										<span className="font-bold text-foreground">{(balance - selectedReward.cost).toLocaleString("id-ID")} poin</span> setelah ditukar.
									</p>
									<p className="mt-1 text-[10px] text-muted-foreground/80">Tukar poin bersifat final dan tidak dapat dibatalkan.</p>
									<div className="mt-3 flex gap-2">
										<button
											type="button"
											onClick={() => setSelectedReward(null)}
											disabled={redeeming}
											className="min-h-11 flex-1 rounded-[14px] border border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground"
										>
											Batal
										</button>
										<button
											type="button"
											onClick={doRedeem}
											disabled={redeeming}
											className="min-h-11 flex-1 rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground shadow-sm disabled:opacity-50"
										>
											{redeeming ? "Memproses..." : "Ya, tukar sekarang"}
										</button>
									</div>
								</div>
							) : null}

							{/* ── Riwayat poin ── */}
							<h2 className="mt-5 mb-2 text-xs font-black uppercase tracking-wider text-foreground">Riwayat Poin</h2>
							{isLoading ? (
								<CustomerSectionSkeleton label="Memuat riwayat poin" />
							) : error ? (
								<CustomerErrorState message={error} />
							) : !points || points.length === 0 ? (
								<div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-8 text-center">
									<Coins className="h-6 w-6 text-muted-foreground/50" />
									<p className="mt-2 text-xs text-muted-foreground">Belum ada riwayat poin. Yuk mulai pesan untuk kumpulkan poin!</p>
									<button
										type="button"
										onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })}
										className="mt-3 min-h-11 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
									>
										Pesan sekarang
									</button>
								</div>
							) : (
								<div className="space-y-2">
									{points.map((entry) => {
										const positive = entry.points >= 0;
										return (
											<div key={entry.id} className="flex items-center justify-between rounded-[20px] border border-border bg-card px-3 py-3 shadow-sm">
												<div className="min-w-0">
													<p className="break-words text-xs font-bold">
														{REASON_LABEL[entry.reason] ?? entry.reason ?? "Aktivitas"}
													</p>
													{entry.note ? <p className="break-words text-[10px] text-muted-foreground">{entry.note}</p> : null}
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
