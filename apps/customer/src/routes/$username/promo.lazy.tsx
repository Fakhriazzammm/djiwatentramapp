import { CustomerHeader } from "@/components/customer/customer-shell";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, TicketPercent } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useHybridActiveDiscounts } from "@/hooks/use-hybrid-pos-data";
import { currency } from "@/components/customer/types";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/promo")({
	component: PromoPage,
});

const fmtDate = (ms: number | null | undefined) => {
	if (!ms) return null;
	const d = new Date(ms);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const fmtDays = (days: unknown) => {
	if (!Array.isArray(days) || days.length === 0 || days.length >= 7) return "Setiap hari";
	const labels = days.map((day) => DAY_LABELS[Number(day)]).filter(Boolean);
	return labels.length > 0 ? labels.join(", ") : "Setiap hari";
};

const fmtTime = (time: unknown) => {
	const value = String(time ?? "").trim();
	return /^\\d{2}:\\d{2}$/.test(value) ? value : null;
};

function discountValueLabel(discount: Record<string, any>): string {
	const value = Number(discount.value ?? 0);
	const type = String(discount.type ?? "").toLowerCase();
	if (type.includes("percent")) return `${value}%`;
	return currency(value);
}

function PromoPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const discounts = useHybridActiveDiscounts();

	const [copiedCode, setCopiedCode] = useState<string | null>(null);
	const copyCode = async (code: string) => {
		try {
			await navigator.clipboard.writeText(code);
			setCopiedCode(code);
			toast.success("Kode promo disalin");
			window.setTimeout(() => setCopiedCode(null), 1800);
		} catch {
			toast.error("Kode promo tidak bisa disalin otomatis");
		}
	};

	const goHome = () => navigate({ to: "/$username", params: { username } });

	const activePromos = useMemo(() => {
		if (!discounts) return undefined;
		const now = Date.now();
		return discounts.filter((d) => {
			if (d.isActive === false) return false;
			if (d.startDate && Number(d.startDate) > now) return false;
			if (d.endDate && Number(d.endDate) < now) return false;
			return true;
		});
	}, [discounts]);

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<CustomerHeader title="Promo" subtitle="Djiwa Tentram" onBack={goHome} leading={<ArrowLeft className="h-4 w-4" />} />

				<main className="px-3 py-4">
					{activePromos === undefined ? (
						<CustomerSectionSkeleton label="Memuat promo" />
					) : activePromos.length === 0 ? (
						<div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-10 text-center">
							<TicketPercent aria-hidden="true" className="h-8 w-8 text-primary" strokeWidth={2} />
							<h2 className="mt-3 font-display text-base font-black">Belum Ada Promo</h2>
							<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
								Saat ini belum ada promo aktif. Cek lagi nanti ya — promo spesial member akan muncul di sini!
							</p>
							<button
								type="button"
								onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })}
								className="mt-4 min-h-11 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm"
							>
								Lihat menu
							</button>
						</div>
					) : (
						<div className="space-y-2.5">
							{activePromos.map((promo) => {
								const validUntil = fmtDate(promo.endDate);
								const minOrder = promo.minOrderValue ? Number(promo.minOrderValue) : null;
								const isDjiwaPayCampaign = promo.code === "DJIWA-PAY-50-SEPTEMBER-2026";
								const startTime = fmtTime(promo.startTime) || (isDjiwaPayCampaign ? "08:00" : null);
								const endTime = fmtTime(promo.endTime) || (isDjiwaPayCampaign ? "21:00" : null);
								const hasSchedule = Boolean(startTime && endTime);
								const targetLabel = promo.targetType === "ALL" ? "Semua menu" : "Menu pilihan sesuai promo";
								const maxDiscount = Number(promo.maxDiscount ?? promo.maxDiscountAmount ?? 0);
								const paymentRule = isDjiwaPayCampaign ? "Khusus pembayaran Djiwa Pay" : promo.paymentMethod ? String(promo.paymentMethod) : Array.isArray(promo.paymentMethods) && promo.paymentMethods.length > 0 ? promo.paymentMethods.join(", ") : null;
								return (
									<div key={String(promo._id)} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
										<div className="flex items-center gap-3 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-3">
											<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
												<TicketPercent className="h-5 w-5" />
											</div>
											<div className="min-w-0">
												<p className="break-words font-display text-sm font-black">{promo.name || "Promo"}</p>
												<p className="text-xs font-bold text-primary">Diskon {discountValueLabel(promo)}</p>{isDjiwaPayCampaign ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Menu Rp30.000 menjadi Rp15.000. Khusus pembayaran Djiwa Pay; top up saldo terlebih dahulu jika belum cukup.</p> : null}
											</div>
										</div>
										{(promo.code || minOrder || validUntil) ? (
											<div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
												{promo.code ? (
													<button type="button" onClick={() => copyCode(String(promo.code))} className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1 text-[10px] font-black tracking-wider text-primary">
														<Copy className="h-3 w-3" /> {copiedCode === String(promo.code) ? "Disalin" : promo.code}
													</button>
												) : null}
												{minOrder ? (
													<span className="text-[10px] text-muted-foreground">Min. order {currency(minOrder)}</span>
												) : null}
												{validUntil ? (
													<span className="text-[10px] text-muted-foreground">Berlaku s/d {validUntil}</span>
												) : null}
											</div>
										) : null}
										<div className="border-t border-border bg-muted/20 px-3 py-3">
											<p className="text-[10px] font-black uppercase tracking-[0.12em] text-foreground">Syarat & ketentuan</p>
											<ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-muted-foreground">
												{validUntil ? <li><span className="font-bold text-foreground">Periode:</span> berlaku s/d {validUntil}</li> : null}
												{hasSchedule ? <li><span className="font-bold text-foreground">Jam promo:</span> {startTime}–{endTime} WIB</li> : null}
												<li><span className="font-bold text-foreground">Hari:</span> {fmtDays(promo.days)}</li>
												<li><span className="font-bold text-foreground">Berlaku untuk:</span> {targetLabel}</li>
												{paymentRule ? <li><span className="font-bold text-foreground">Pembayaran:</span> {paymentRule}</li> : null}
												{minOrder ? <li><span className="font-bold text-foreground">Minimum order:</span> {currency(minOrder)}</li> : null}
												{maxDiscount > 0 ? <li><span className="font-bold text-foreground">Maksimal potongan:</span> {currency(maxDiscount)}</li> : null}
											</ul>
											<div className="mt-2.5 rounded-xl bg-background px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground"><span className="font-bold text-foreground">Cara menggunakan:</span> salin kode jika tersedia, tekan “Gunakan promo”, lalu pilih menu dan metode pembayaran yang sesuai saat checkout.</div>
										</div>
										<button type="button" onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })} className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-border px-3 py-2.5 text-xs font-black text-primary hover:bg-primary/5">Gunakan promo <ArrowLeft className="h-3.5 w-3.5 rotate-180" /></button>
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
