import { motion, useReducedMotion } from "framer-motion";
import type { AdminOverview, Source } from "@/hooks/use-admin-overview";
import type { EcosystemCard } from "@/lib/dashboard-analytics";
import { formatCompactRupiah } from "@/lib/dashboard-analytics";
import { AnimatedNumber, LiveDot } from "./motion";
import { Empty, Label, Masked, SectionTitle, SourceError, Skeleton, Sparkline } from "./ui";

// Hanya aplikasi dengan sumber data yang terverifikasi di migrasi yang muncul di sini.
// Aplikasi lain (B2B, KOL, Investor) tidak ditampilkan sampai sumbernya tersedia.

const CARD_COLOR: Record<string, string> = {
	pos: "#2f5d9e",
	web: "#0e7490",
	djiwapay: "#6d4fd8",
	booking: "#b7791f",
	karyawan: "#166534",
	merchandise: "#475569",
	jumat: "#166534",
	rekrutmen: "#7c3aed",
	stok: "#b7791f",
};

const CARD_HREF: Record<string, string> = {
	stok: "/admin/inventory",
};

function valueOf<T>(source: Source<T>): T | null {
	return source.ok ? source.value : null;
}

export function EcosystemSection({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	const cards = valueOf(overview.ecosystem);
	const error = overview.ecosystem.ok ? null : overview.ecosystem.error;
	return (
		<div>
			<SectionTitle color="#111114" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{periodLabel}</span>}>
				Ekosistem aplikasi
			</SectionTitle>
			{error ? (
				<SourceError message={error} />
			) : !cards ? (
				<div className="grid gap-[14px] sm:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
					{Array.from({ length: 6 }).map((_, index) => (
						<Skeleton key={index} className="h-[120px] w-full" />
					))}
				</div>
			) : cards.length === 0 ? (
				<Empty>Belum ada aplikasi dengan data terverifikasi.</Empty>
			) : (
				<div className="grid gap-[14px] sm:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
					{cards.map((card, index) => (
						<EcosystemTile key={card.key} card={card} index={index} periodLabel={periodLabel} />
					))}
				</div>
			)}
		</div>
	);
}

function EcosystemTile({ card, index, periodLabel }: { card: EcosystemCard; index: number; periodLabel: string }) {
	const reduceMotion = useReducedMotion();
	const color = CARD_COLOR[card.key] ?? "#111114";
	const internal = CARD_HREF[card.key];
	const href = internal ?? `https://${card.domain}`;
	const isWarn = card.status === "warn";
	const formatted = card.valueKind === "rupiah" ? (next: number) => formatCompactRupiah(next) : undefined;

	return (
		<motion.a
			href={href}
			target={internal ? undefined : "_blank"}
			rel={internal ? undefined : "noopener noreferrer"}
			initial={reduceMotion ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.05 * index, ease: [0.2, 0.7, 0.2, 1] }}
			whileHover={reduceMotion ? undefined : { y: -3 }}
			className="group relative flex min-w-0 flex-col border border-[#e4e4e8] bg-white px-4 py-3.5 transition-[border-color,box-shadow] duration-300 hover:border-[#cfcfd6] hover:shadow-[0_10px_26px_rgba(17,17,20,0.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114]"
		>
			<span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100" style={{ background: color }} />
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-[13px] font-semibold text-[#111114]">{card.name}</div>
					<div className="truncate font-mono text-[10px] text-[#666672]">{card.domain}</div>
				</div>
				<span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[#444450]">
					<LiveDot tone={isWarn ? "amber" : "green"} />
					{isWarn ? "perhatian" : "normal"}
				</span>
			</div>
			<div className="mt-3 flex items-end justify-between gap-3">
				<div className="min-w-0">
					<div className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#111114]">
						<Masked>
							<AnimatedNumber value={card.value} format={formatted} />
						</Masked>
					</div>
					<Label className="mt-2 truncate">{card.label}</Label>
				</div>
				{card.spark.length > 0 ? (
					<Sparkline values={card.spark} color={color} redrawKey={`${periodLabel}-${card.key}-${card.value}`} />
				) : null}
			</div>
		</motion.a>
	);
}
