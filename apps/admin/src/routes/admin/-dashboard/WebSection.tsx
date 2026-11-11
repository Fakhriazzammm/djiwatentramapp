import { motion, useReducedMotion } from "framer-motion";
import type { AdminOverview, Source } from "@/hooks/use-admin-overview";
import type { WebTrafficPayload } from "@/lib/dashboard-analytics";
import { AnimatedNumber, GrowBar } from "./motion";
import { BLUE, Card, Empty, Label, Masked, SectionTitle, SourceError, Skeleton, formatDateTimeWIB } from "./ui";

function valueOf<T>(source: Source<T>): T | null {
	return source.ok ? source.value : null;
}

const SOURCE_ROWS: ReadonlyArray<{ key: string; label: string; color: string }> = [
	{ key: "direct", label: "Langsung", color: "#2f5d9e" },
	{ key: "search", label: "Mesin pencari", color: "#9ca3af" },
	{ key: "social", label: "Sosial", color: "#be185d" },
	{ key: "ai", label: "Asisten AI", color: "#16a34a" },
	{ key: "referral", label: "Referral", color: "#b7791f" },
];
const DEVICE_LABEL: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet", unknown: "Lainnya" };

export function WebSection({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	const web = valueOf(overview.web);
	const error = overview.web.ok ? null : overview.web.error;
	return (
		<div>
			<SectionTitle color="#0e7490" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{periodLabel}</span>}>
				Web pelanggan · djiwatentram.web.id
			</SectionTitle>
			{error ? <SourceError message={error} /> : !web ? <Skeleton className="h-64 w-full" /> : <WebBody web={web} />}
		</div>
	);
}

function WebBody({ web }: { web: WebTrafficPayload }) {
	const reduceMotion = useReducedMotion();
	const sourceTotal = SOURCE_ROWS.reduce((sum, row) => sum + (web.sources[row.key] ?? 0), 0);
	const deviceTotal = Object.values(web.devices).reduce((sum, value) => sum + value, 0);
	const notTracking = web.trackingSince === null;

	return (
		<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
			<Card ariaLabel="Kunjungan web" label={<Label tone="blue">Halaman dibaca</Label>}>
				<div className="flex flex-wrap items-baseline gap-3">
					<span className="font-display text-[34px] font-semibold leading-none tabular-nums text-[#111114]"><AnimatedNumber value={web.views} /></span>
					<span className="font-mono text-[11px] text-[#666672]"><Masked>{web.visitors} pengunjung unik</Masked></span>
				</div>
				{notTracking || web.views === 0 ? (
					<Empty>
						Pelacakan web baru aktif setelah aplikasi pelanggan memuat pelacak ini. Angka akan terisi seiring kunjungan baru masuk.
					</Empty>
				) : (
					<p className="mt-3 font-mono text-[10px] text-[#666672]">Pelacakan aktif sejak {formatDateTimeWIB(web.trackingSince ?? 0)} WIB.</p>
				)}
				<p className="mt-4 font-mono text-[10px] leading-relaxed text-[#666672]">
					Hanya kunjungan yang menjalankan halaman (JavaScript) yang tercatat. Bot dan crawler tidak dihitung.
				</p>
			</Card>

			<Card ariaLabel="Sumber kunjungan" label={<Label tone="ink">Sumber kunjungan</Label>}>
				<ul className="space-y-3">
					{SOURCE_ROWS.map((row, index) => {
						const value = web.sources[row.key] ?? 0;
						return (
							<li key={row.key}>
								<div className="flex items-baseline justify-between gap-2 text-[12px]">
									<span>{row.label}</span>
									<span className="font-mono text-[11px] text-[#444450]"><Masked>{value}{sourceTotal ? ` · ${Math.round((value / sourceTotal) * 100)}%` : ""}</Masked></span>
								</div>
								<div className="mt-1 h-1.5 overflow-hidden bg-[#ececf0]">
									<GrowBar ratio={sourceTotal ? value / sourceTotal : 0} delay={index * 0.06 + 0.1} className="h-full" style={{ background: row.color }} />
								</div>
							</li>
						);
					})}
				</ul>
				<Label className="mb-2 mt-5">Perangkat</Label>
				<div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[#444450]">
					{Object.entries(web.devices).map(([key, value]) => (
						<span key={key}>
							{DEVICE_LABEL[key] ?? key}: <Masked>{value}{deviceTotal ? ` (${Math.round((value / deviceTotal) * 100)}%)` : ""}</Masked>
						</span>
					))}
				</div>
			</Card>

			<Card ariaLabel="Halaman terbanyak dibaca" label={<Label tone="ink">Halaman paling banyak dibaca</Label>}>
				{web.topPaths.length === 0 ? (
					<Empty>Belum ada halaman tercatat pada periode ini.</Empty>
				) : (
					<ol className="divide-y divide-[#efeff2]">
						{web.topPaths.map((row, index) => (
							<motion.li
								key={row.path}
								initial={reduceMotion ? false : { opacity: 0, x: -8 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ duration: 0.4, delay: index * 0.05 }}
								className="flex items-center justify-between gap-3 py-2.5"
							>
								<span className="min-w-0 truncate font-mono text-[12px] text-[#111114]">{row.path}</span>
								<span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: BLUE }}><Masked>{row.views}</Masked></span>
							</motion.li>
						))}
					</ol>
				)}
			</Card>
		</div>
	);
}
