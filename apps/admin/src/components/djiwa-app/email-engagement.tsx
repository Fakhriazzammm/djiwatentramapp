import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { agoLabel, monoLabel, num, Pill } from "@/components/djiwa-app/ui";
import { automationApi, type EngagementPerson, type EngagementSummary } from "@/components/djiwa-app/email-api";

type Filter = "opened" | "clicked" | "all";
const FILTERS: Array<[Filter, string]> = [["opened", "Membuka"], ["clicked", "Mengklik"], ["all", "Semua penerima"]];
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Terjadi kesalahan");
const STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info" | ""]> = { sent: ["Terkirim", "info"], delivered: ["Sampai", "ok"], bounced: ["Bounce", "bad"], complained: ["Komplain", "bad"] };
const clock = (value: string | null) => (value ? new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Who opened and clicked our automatic emails (last 30 days), per automation and per person. */
export function Engagement() {
	const [filter, setFilter] = useState<Filter>("opened");
	const [key, setKey] = useState("");
	const [summary, setSummary] = useState<EngagementSummary[] | null>(null);
	const [people, setPeople] = useState<EngagementPerson[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const r = await automationApi<{ summary: EngagementSummary[]; people: EngagementPerson[] }>("engagement", { filter, key });
			setSummary(r.summary); setPeople(r.people); setError(null);
		} catch (e) { setError(errorMessage(e)); }
	}, [filter, key]);
	useEffect(() => { setPeople(null); void load(); }, [load]);

	if (error) return <div className="border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] text-red-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Coba lagi</button></div>;
	if (!summary || !people) return <Skeleton className="h-72 w-full rounded-none" />;

	const total = summary.reduce((acc, row) => ({ sent: acc.sent + row.sent, opened: acc.opened + row.opened, clicked: acc.clicked + row.clicked }), { sent: 0, opened: 0, clicked: 0 });
	return (
		<div className="grid gap-3">
			<div className="border border-border bg-card px-3.5 py-2.5 text-[12.5px] text-[#444450]">
				Siapa yang membuka dan mengklik email otomatis dalam 30 hari terakhir. Angka dibuka bisa lebih rendah dari kenyataan karena sebagian aplikasi email memblokir pelacak gambar; klik lebih bisa dipercaya.
				<span className="ml-2 font-mono text-[11px] text-muted-foreground">{num(total.sent)} terkirim · dibuka {pct(total.opened, total.sent)} · klik {pct(total.clicked, total.sent)}</span>
			</div>

			<div className="overflow-x-auto border border-border bg-card">
				<table className="w-full min-w-[560px] text-left text-[12.5px]">
					<thead><tr className="border-b border-border">{["Otomasi", "Terkirim", "Sampai", "Dibuka", "Klik"].map((h) => <th key={h} className={`${monoLabel} px-3 py-2 font-semibold`}>{h}</th>)}</tr></thead>
					<tbody>
						{summary.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Belum ada email otomatis terkirim.</td></tr> : null}
						{summary.map((row) => (
							<tr key={row.key} className={`cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 ${key === row.key ? "bg-blue-50/60" : ""}`} onClick={() => setKey(key === row.key ? "" : row.key)}>
								<td className="px-3 py-2 font-medium">{row.name}</td>
								<td className="px-3 py-2 tabular-nums">{num(row.sent)}</td>
								<td className="px-3 py-2 tabular-nums">{pct(row.delivered, row.sent)}</td>
								<td className="px-3 py-2 tabular-nums">{num(row.opened)} <span className="text-muted-foreground">({pct(row.opened, row.sent)})</span></td>
								<td className="px-3 py-2 tabular-nums">{num(row.clicked)} <span className="text-muted-foreground">({pct(row.clicked, row.sent)})</span></td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="flex border border-border bg-card" role="tablist">
					{FILTERS.map(([value, label]) => (
						<button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`h-[34px] px-3 text-xs font-semibold ${filter === value ? "bg-[#111114] text-white" : "hover:bg-muted"}`}>{label}</button>
					))}
				</div>
				{key ? <button type="button" className="h-[34px] border border-border bg-card px-3 text-xs font-semibold hover:border-foreground/30" onClick={() => setKey("")}>Filter: {summary.find((r) => r.key === key)?.name ?? key} ✕</button> : <span className="text-[11.5px] text-muted-foreground">Ketuk baris otomasi untuk menyaring.</span>}
			</div>

			<div className="overflow-x-auto border border-border bg-card">
				<table className="w-full min-w-[640px] text-left text-[12.5px]">
					<thead><tr className="border-b border-border">{["Penerima", "Otomasi", "Status", "Dibuka", "Klik"].map((h) => <th key={h} className={`${monoLabel} px-3 py-2 font-semibold`}>{h}</th>)}</tr></thead>
					<tbody>
						{people.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Belum ada data untuk filter ini.</td></tr> : null}
						{people.map((p) => {
							const [label, tone] = STATUS[p.status] ?? [p.status, "" as const];
							return (
								<tr key={p.id} className="border-b border-border last:border-0">
									<td className="px-3 py-2"><div className="font-medium">{p.name || "—"}</div><div className="text-[11.5px] text-muted-foreground">{p.email}</div></td>
									<td className="px-3 py-2">{p.automationName}</td>
									<td className="px-3 py-2"><Pill tone={tone}>{label}</Pill><div className="text-[11px] text-muted-foreground">{agoLabel(p.sent_at)}</div></td>
									<td className="px-3 py-2">{p.opened_at ? <><Pill tone="ok">Dibuka</Pill><div className="text-[11px] text-muted-foreground">{clock(p.opened_at)}</div></> : <span className="text-muted-foreground">—</span>}</td>
									<td className="px-3 py-2">{p.clicked_at ? <><Pill tone="info">Klik</Pill><div className="text-[11px] text-muted-foreground">{clock(p.clicked_at)}</div></> : <span className="text-muted-foreground">—</span>}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{people.length >= 200 ? <p className="text-[11.5px] text-muted-foreground">Menampilkan 200 terbaru.</p> : null}
		</div>
	);
}
