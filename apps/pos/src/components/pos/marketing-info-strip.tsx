import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Megaphone, Tag } from "lucide-react";
import { useHybridActiveDiscounts } from "@/hooks/use-hybrid-pos-data";

const DJIWA_PAY_CAMPAIGN_CODE = "DJIWA-PAY-50-SEPTEMBER-2026";

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

function isDjiwaPayCampaign(discount: any) {
	const codeCandidates = [discount?.code, discount?.raw?.code, discount?.raw?.campaignCode, discount?.raw?.djiwaPayCampaignCode];
	return codeCandidates.some((code) => String(code ?? "").toUpperCase() === DJIWA_PAY_CAMPAIGN_CODE) || String(discount?.name ?? "").toLowerCase().includes("djiwa pay 50");
}

function wibMinutes(date: Date) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Jakarta",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function isCurrentlyActive(discount: any, now: Date) {
	if (!discount?.isActive) return false;
	const timestamp = now.getTime();
	if (discount.startDate && timestamp < Number(discount.startDate)) return false;
	if (discount.endDate && timestamp > Number(discount.endDate) + 86399999) return false;
	const start = typeof discount.startTime === "string" ? discount.startTime.split(":").map(Number) : null;
	const end = typeof discount.endTime === "string" ? discount.endTime.split(":").map(Number) : null;
	if (start?.length === 2 && end?.length === 2) {
		const current = wibMinutes(now);
		const startValue = start[0] * 60 + start[1];
		const endValue = end[0] * 60 + end[1];
		if (current < startValue || current > endValue) return false;
	}
	return true;
}

function scopeLabel(discount: any) {
	if (isDjiwaPayCampaign(discount)) return "Djiwa App";
	const channel = String(discount?.raw?.channel ?? discount?.channel ?? "").toLowerCase();
	if (channel === "djiwa_app") return "Djiwa App";
	if (channel === "pos" || channel === "cashier") return "POS Kasir";
	return "Global";
}

function valueLabel(discount: any) {
	if (discount?.discountType === "PERCENTAGE" || discount?.type === "PERCENTAGE") return `${Number(discount.value ?? 0)}%`;
	if (discount?.discountType === "FLAT_PRICE" || discount?.type === "FLAT_PRICE") return `Harga ${formatCurrency(Number(discount.value ?? 0))}`;
	if (discount?.discountType === "FIXED" || discount?.type === "FIXED") return `Potongan ${formatCurrency(Number(discount.value ?? 0))}`;
	return "Info promo";
}

export function MarketingInfoStrip() {
	const discounts = useHybridActiveDiscounts();
	const [expanded, setExpanded] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("pos-marketing-strip-expanded") === "1");
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(new Date()), 60_000);
		return () => window.clearInterval(timer);
	}, []);

	const activePromos = useMemo(() => (discounts ?? []).filter((discount: any) => isCurrentlyActive(discount, now)), [discounts, now]);
	if (activePromos.length === 0) return null;

	const toggle = () => {
		setExpanded((current) => {
			const next = !current;
			window.localStorage.setItem("pos-marketing-strip-expanded", next ? "1" : "0");
			return next;
		});
	};
	const firstPromo = activePromos[0];

	return (
		<section className="mx-3 mb-2 overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/70 shadow-sm" aria-label="Informasi marketing aktif">
			<button type="button" onClick={toggle} aria-expanded={expanded} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-indigo-100/70">
				<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white"><Megaphone className="h-3.5 w-3.5" /></span>
				<span className="min-w-0 flex-1 truncate text-xs font-black text-indigo-950">Marketing aktif · {firstPromo.name || "Promo terbaru"}</span>
				<span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-indigo-700">{activePromos.length} info</span>
				{expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-indigo-600" /> : <ChevronDown className="h-4 w-4 shrink-0 text-indigo-600" />}
			</button>
			{expanded && <div className="space-y-1.5 border-t border-indigo-100 px-3 pb-2.5 pt-2">
				{activePromos.map((promo: any) => <div key={String(promo._id ?? promo.sourceId ?? promo.name)} className="flex items-center gap-2 rounded-lg bg-white/75 px-2.5 py-2 text-[11px]">
					<Tag className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
					<span className="min-w-0 flex-1 truncate font-bold text-slate-800">{promo.name || "Promo aktif"}</span>
					<span className="shrink-0 font-black text-indigo-700">{valueLabel(promo)}</span>
					<span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{scopeLabel(promo)}</span>
				</div>)}
				{activePromos.some(isDjiwaPayCampaign) && <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-[11px] leading-relaxed text-indigo-950">
					<p className="font-black">Cara menjelaskan ke customer:</p>
					<p>Promo hanya berlaku di Djiwa App untuk menu harga Rp30.000, menjadi Rp15.000 saat dibayar dengan Djiwa Pay.</p>
					<p>Berlaku pukul 08.00–21.00 WIB. Harga di POS Kasir tetap normal.</p>
				</div>}
				<p className="px-1 text-[10px] text-indigo-700/70">Kasir: arahkan customer melakukan pemesanan dan pembayaran melalui Djiwa App.</p>
			</div>}
		</section>
	);
}
