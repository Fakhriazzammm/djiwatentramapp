import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Sankey, rpShort } from "@/components/finance/sankey";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridMoneyFlow, type MoneyFlow } from "@/hooks/use-hybrid-finance-analytics-data";

const PERIODS = [
	{ id: "today", label: "Hari Ini" },
	{ id: "yesterday", label: "Kemarin" },
	{ id: "week", label: "7 Hari" },
	{ id: "month", label: "Bulan Ini" },
	{ id: "last_month", label: "Bulan Lalu" },
] as const;

export function getFlowRange(id: string): { startDate: number; endDate?: number } {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	switch (id) {
		case "today": return { startDate: today };
		case "yesterday": return { startDate: today - 86_400_000, endDate: today - 1 };
		case "week": return { startDate: today - 6 * 86_400_000 };
		case "last_month": return { startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), endDate: new Date(now.getFullYear(), now.getMonth(), 0).setHours(23, 59, 59, 999) };
		default: return { startDate: new Date(now.getFullYear(), now.getMonth(), 1).getTime() };
	}
}

const idr = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function MoneyFlowPage() {
	const [period, setPeriod] = useState<string>("month");
	const flow = useHybridMoneyFlow(getFlowRange(period)) as MoneyFlow | null | undefined;
	return (
		<main className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold">Arus dana</h1>
				<p className="mt-1 text-xs text-muted-foreground">
					Dari mana uang masuk (aplikasi/sumber, metode bayar) dan ke mana keluar (kategori pengeluaran). Angka sama dengan Overview; persen membandingkan dengan periode sebelumnya yang sama panjang.
				</p>
			</header>
			<nav className="flex flex-wrap gap-1" aria-label="Periode arus dana">
				{PERIODS.map((p) => (
					<button type="button" key={p.id} aria-pressed={period === p.id} className={`border px-3 py-2 font-mono text-xs ${period === p.id ? "bg-black text-white" : "bg-white"}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
				))}
			</nav>
			{flow === undefined && <Skeleton className="h-[460px] w-full" />}
			{flow === null && <p role="alert">Data arus dana gagal dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
			{flow && (
				<>
					<p className="font-mono text-xs text-muted-foreground">
						{dateLabel(flow.startDate)} – {dateLabel(flow.endDate)} · Masuk {idr(flow.totalInflow)} · Keluar {idr(flow.totalOutflow)} · Kas bersih {idr(flow.net)}
					</p>
					{flow.nodes.length === 0 || flow.totalInflow + flow.totalOutflow === 0 ? (
						<p className="border bg-white p-6 text-sm text-muted-foreground">Belum ada transaksi pada periode ini.</p>
					) : (
						<section className="border bg-white p-4">
							<Sankey nodes={flow.nodes} links={flow.links} share={flow.totalInflow} />
							<ul className="mt-3 space-y-1 text-xs text-muted-foreground">
								<li>Sumber = aplikasi/kanal asal transaksi (POS, DjiwaApp, Booking, Merchandise, Operasional, dst.). Metode = cara bayar.</li>
								<li>Pengeluaran memakai definisi arus kas yang sama dengan Overview: tanpa HPP otomatis dan transaksi non-kas.</li>
								<li>Bila pengeluaran melebihi pemasukan, selisihnya tampil sebagai "Ditutup dari kas sebelumnya".</li>
								<li>Sumber data: <Link to="/admin/finance/transactions" className="underline">Transaksi keuangan</Link> (pos.financial_transactions) dan order POS/DjiwaApp yang sudah dibayar.</li>
							</ul>
							<details className="mt-3">
								<summary className="cursor-pointer text-sm">Setiap baris (Rp)</summary>
								<table className="mt-2 w-full text-left text-xs">
									<thead><tr className="font-mono uppercase text-muted-foreground"><th className="py-1">Kelompok</th><th>Nama</th><th className="text-right">Nilai</th><th className="text-right">vs periode lalu</th></tr></thead>
									<tbody>
										{flow.rows.map((r) => (
											<tr key={`${r.group}:${r.label}`} className="border-t">
												<td className="py-1.5">{r.group}</td><td>{r.label}</td>
												<td className="text-right font-mono">{idr(r.value)}</td>
												<td className="text-right font-mono">{r.delta === null ? "—" : `${r.delta >= 0 ? "+" : "−"}${Math.abs(r.delta).toFixed(1)}%`}</td>
											</tr>
										))}
									</tbody>
								</table>
							</details>
						</section>
					)}
					<p className="sr-only">{rpShort(flow.net)}</p>
				</>
			)}
		</main>
	);
}
