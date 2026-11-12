import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
	fetchManualStock,
	fetchManualStockHistory,
	saveManualStock,
	useManualStockMode,
	type ManualStockHistory,
	type ManualStockItem,
} from "../../lib/manual-stock";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Djiwa3DIcon } from "../ui/djiwa-3d-icon";
import {
	buildManualStockSaveInput,
	createManualStockDraft,
	isManualStockDraftDirty,
	MANUAL_STOCK_UNITS,
	type ManualStockDraft,
} from "./manual-stock-draft";

const statuses = { available: "Tersedia", out: "Habis", unknown: "Belum dicek" };
const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs";
const tableColumns = [
	{ label: "Bahan", width: "w-[142px]" },
	{ label: "Cara catat", width: "w-[126px]" },
	{ label: "Status", width: "w-[130px]" },
	{ label: "Sisa", width: "w-[96px]" },
	{ label: "Satuan", width: "w-[95px]" },
	{ label: "Catatan", width: "w-[150px]" },
	{ label: "Diperbarui", width: "w-[130px]" },
	{ label: "Oleh", width: "w-[85px]" },
	{ label: "Tindakan", width: "w-[170px]" },
];
const date = (at: number | null) => at ? new Date(at).toLocaleString("id-ID") : "Belum diperbarui";
const message = (error: unknown) => error instanceof Error ? error.message : "Permintaan gagal. Silakan coba lagi.";

function snapshot(value: unknown) {
	if (!value || typeof value !== "object") return "Belum dicatat";
	const entry = value as { mode?: string; status?: keyof typeof statuses; quantity?: number | null; unit?: string };
	return entry.mode === "count" ? `${entry.quantity ?? "—"} ${entry.unit || ""}` : statuses[entry.status || "unknown"] || "Belum dicek";
}

function countStatus(draft: ManualStockDraft): keyof typeof statuses {
	if (!/^\d+$/.test(draft.quantity) || !Number.isSafeInteger(Number(draft.quantity))) return "unknown";
	return Number(draft.quantity) === 0 ? "out" : "available";
}

function statusTone(status: keyof typeof statuses) {
	if (status === "available") return "border-emerald-200 bg-emerald-50 text-emerald-700";
	if (status === "out") return "border-rose-200 bg-rose-50 text-rose-700";
	return "border-amber-200 bg-amber-50 text-amber-800";
}

export function ManualStockGate({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
	const { mode, error, loading } = useManualStockMode();
	if (loading) return <p className="p-6" role="status">Memuat pengaturan stok…</p>;
	if (error || !mode) return <div className="p-6" role="alert">{error || "Pengaturan stok belum tersedia."} Muat ulang halaman untuk mencoba lagi.</div>;
	if (mode === "integrated") return <>{children}</>;
	if (disabled) return <section className="m-4 space-y-3 rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Resep dan HPP sementara dinonaktifkan</h1><p className="text-muted-foreground">Mode stok manual aktif. Pengelolaan bahan dilakukan langsung melalui ketersediaan atau jumlah stok.</p><a className="inline-flex min-h-11 items-center text-primary underline" href="/admin/inventory">Buka stok manual</a></section>;
	return <ManualStockPage />;
}

export function ManualStockPage() {
	const [items, setItems] = useState<ManualStockItem[]>([]);
	const [drafts, setDrafts] = useState<Record<string, ManualStockDraft>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("");
	const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
	const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
	const [success, setSuccess] = useState<string | null>(null);
	const [historyItemId, setHistoryItemId] = useState<string | null>(null);
	const [history, setHistory] = useState<ManualStockHistory[]>([]);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [historyLoading, setHistoryLoading] = useState(false);
	const historyRequest = useRef(0);
	const mounted = useRef(true);

	const refresh = useCallback(async (forceDraftIds: string[] = []) => {
		try {
			const result = await fetchManualStock();
			if (!mounted.current) return;
			setItems(result.items);
			setError(null);
			const forceDrafts = new Set(forceDraftIds);
			const itemIds = new Set(result.items.map(item => item.inventoryId));
			setDrafts(previous => {
				const next = { ...previous };
				for (const item of result.items) {
					const draft = previous[item.inventoryId];
					if (forceDrafts.has(item.inventoryId) || !draft || !isManualStockDraftDirty(item, draft)) {
						next[item.inventoryId] = createManualStockDraft(item);
					}
				}
				for (const inventoryId of Object.keys(next)) {
					if (!itemIds.has(inventoryId)) delete next[inventoryId];
				}
				return next;
			});
		} catch (err) {
			if (mounted.current) setError(message(err));
		} finally {
			if (mounted.current) setLoading(false);
		}
	}, []);

	useEffect(() => {
		mounted.current = true;
		void refresh();
		const interval = setInterval(() => void refresh(), 30000);
		return () => { mounted.current = false; clearInterval(interval); };
	}, [refresh]);

	const updateDraft = (item: ManualStockItem, patch: Partial<ManualStockDraft>) => {
		setDrafts(previous => ({
			...previous,
			[item.inventoryId]: { ...(previous[item.inventoryId] ?? createManualStockDraft(item)), ...patch },
		}));
		setRowErrors(previous => {
			if (!previous[item.inventoryId]) return previous;
			const next = { ...previous };
			delete next[item.inventoryId];
			return next;
		});
		setSuccess(null);
	};

	const save = async (item: ManualStockItem) => {
		if (savingIds.has(item.inventoryId)) return;
		const draft = drafts[item.inventoryId] ?? createManualStockDraft(item);
		const result = buildManualStockSaveInput(item, draft);
		if (result.input === null) {
			setRowErrors(previous => ({ ...previous, [item.inventoryId]: result.error }));
			return;
		}
		const input = result.input;

		const marksOut = input.mode === "count"
			? input.quantity === 0
			: input.status === "out";
		if (marksOut && !window.confirm(`Tandai ${item.name} sebagai habis?`)) return;

		setSavingIds(previous => new Set(previous).add(item.inventoryId));
		setRowErrors(previous => {
			const next = { ...previous };
			delete next[item.inventoryId];
			return next;
		});
		setSuccess(null);
		try {
			await saveManualStock(input);
			setSuccess(`Stok ${item.name} tersimpan.`);
			await refresh([item.inventoryId]);
		} catch (err) {
			setRowErrors(previous => ({ ...previous, [item.inventoryId]: message(err) }));
		} finally {
			setSavingIds(previous => {
				const next = new Set(previous);
				next.delete(item.inventoryId);
				return next;
			});
		}
	};

	const loadHistory = async (item: ManualStockItem) => {
		const request = ++historyRequest.current;
		setHistoryItemId(item.inventoryId);
		setHistory([]);
		setHistoryError(null);
		setHistoryLoading(true);
		try {
			const result = await fetchManualStockHistory(item.inventoryId);
			if (request === historyRequest.current) setHistory(result);
		} catch (err) {
			if (request === historyRequest.current) setHistoryError(message(err));
		} finally {
			if (request === historyRequest.current) setHistoryLoading(false);
		}
	};

	const toggleHistory = (item: ManualStockItem) => {
		if (historyItemId === item.inventoryId) {
			historyRequest.current++;
			setHistoryItemId(null);
			setHistory([]);
			setHistoryError(null);
			setHistoryLoading(false);
			return;
		}
		void loadHistory(item);
	};

	const visible = items.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!filter || item.status === filter));

	return <main className="space-y-5 p-4 md:p-6">
		<header className="flex items-center gap-3"><Djiwa3DIcon name="inventory-stock" size="sm" alt="" /><div><h1 className="text-xl font-semibold">Stok manual</h1><p className="text-sm text-muted-foreground">Ubah ketersediaan, jumlah, satuan, dan catatan langsung pada tabel.</p></div></header>
		<p className="text-sm text-muted-foreground">Pembaruan stok dilakukan manual dan tidak menghitung resep, menu, atau HPP. Daftar diperbarui setiap 30 detik.</p>
		{success && <p role="status" className="text-sm">{success}</p>}
		{error && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3"><p>{error}</p><p className="text-sm">Data yang ditampilkan mungkin belum terbaru.</p><Button variant="outline" onClick={() => void refresh()}>Coba lagi</Button></div>}
		<div className="flex flex-wrap gap-3"><label className="min-w-48 flex-1"><span className="sr-only">Cari bahan</span><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama bahan…" className="h-11" /></label><label><span className="sr-only">Filter status</span><select className={`${selectClass} min-w-[112px]`} value={filter} onChange={event => setFilter(event.target.value)}><option value="">Semua status</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Button variant="outline" onClick={() => void refresh()}>Perbarui</Button></div>
		{loading ? <p role="status">Memuat stok…</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1124px] table-fixed text-left text-sm"><thead className="bg-muted/40"><tr>{tableColumns.map(column => <th key={column.label} scope="col" className={`${column.width} whitespace-nowrap p-3 font-medium`}>{column.label}</th>)}</tr></thead><tbody>
			{visible.map(item => {
				const draft = drafts[item.inventoryId] ?? createManualStockDraft(item);
				const saving = savingIds.has(item.inventoryId);
				const dirty = isManualStockDraftDirty(item, draft);
				const currentStatus = draft.mode === "count" ? countStatus(draft) : draft.status;
				return <Fragment key={item.inventoryId}>
					<tr className="border-t align-middle">
						<td className="w-[142px] truncate p-3 font-medium" title={item.name}>{item.name}</td>
						<td className="w-[126px] p-2"><label className="sr-only" htmlFor={`stock-mode-${item.inventoryId}`}>Cara catat {item.name}</label><select id={`stock-mode-${item.inventoryId}`} aria-label={`Cara catat ${item.name}`} className={selectClass} disabled={saving} value={draft.mode} onChange={event => updateDraft(item, { mode: event.target.value as ManualStockDraft["mode"] })}><option value="availability">Ketersediaan</option><option value="count">Jumlah</option></select></td>
						<td className="w-[130px] p-2">{draft.mode === "availability" ? <><label className="sr-only" htmlFor={`stock-status-${item.inventoryId}`}>Status {item.name}</label><select id={`stock-status-${item.inventoryId}`} aria-label={`Status ${item.name}`} className={selectClass} disabled={saving} value={draft.status} onChange={event => updateDraft(item, { status: event.target.value as ManualStockDraft["status"] })}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></> : <span className={`inline-flex min-h-9 items-center rounded-full border px-2 text-xs font-medium ${statusTone(currentStatus)}`}>{statuses[currentStatus]}</span>}</td>
						<td className="w-[96px] p-2">{draft.mode === "count" ? <><label className="sr-only" htmlFor={`stock-count-${item.inventoryId}`}>Jumlah {item.name}</label><Input id={`stock-count-${item.inventoryId}`} aria-label={`Jumlah ${item.name}`} className="h-10 w-[72px] px-2 tabular-nums" type="number" min="0" step="1" disabled={saving} value={draft.quantity} onChange={event => updateDraft(item, { quantity: event.target.value })} /></> : <span className="px-2 text-muted-foreground">—</span>}</td>
						<td className="w-[95px] p-2"><label className="sr-only" htmlFor={`stock-unit-${item.inventoryId}`}>Satuan {item.name}</label><select id={`stock-unit-${item.inventoryId}`} aria-label={`Satuan ${item.name}`} className={selectClass} disabled={saving || draft.mode !== "count"} value={draft.unit} onChange={event => updateDraft(item, { unit: event.target.value })}>{MANUAL_STOCK_UNITS.map(value => <option key={value} value={value}>{value}</option>)}</select></td>
						<td className="w-[150px] p-2"><label className="sr-only" htmlFor={`stock-note-${item.inventoryId}`}>Catatan {item.name}</label><Input id={`stock-note-${item.inventoryId}`} aria-label={`Catatan ${item.name}`} className="h-10 min-w-0" maxLength={500} placeholder="Opsional" disabled={saving} value={draft.note} onChange={event => updateDraft(item, { note: event.target.value })} /></td>
						<td className="w-[130px] whitespace-nowrap p-2 text-[11px] text-muted-foreground">{date(item.updatedAt)}</td>
						<td className="w-[85px] max-w-[85px] truncate p-2 text-xs" title={item.updatedBy || undefined}>{item.updatedBy || "—"}</td>
						<td className="w-[170px] p-2"><div className="flex items-center gap-1"><Button variant="outline" className="h-9 px-2 text-xs" disabled={saving || !dirty} onClick={() => void save(item)} aria-label={`Simpan stok ${item.name}`}>{saving ? "Menyimpan…" : "Simpan"}</Button><Button variant="ghost" className="h-9 px-1.5 text-xs" onClick={() => toggleHistory(item)} aria-expanded={historyItemId === item.inventoryId} aria-label={`${historyItemId === item.inventoryId ? "Tutup riwayat" : "Riwayat"} ${item.name}`}>{historyItemId === item.inventoryId ? "Tutup" : "Riwayat"}</Button></div></td>
					</tr>
					{rowErrors[item.inventoryId] && <tr><td colSpan={9} className="border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">{rowErrors[item.inventoryId]}</td></tr>}
					{historyItemId === item.inventoryId && <tr><td colSpan={9} className="border-t bg-muted/20 px-4 py-3"><div className="space-y-2"><p className="text-xs font-semibold">Riwayat {item.name}</p>{historyLoading ? <p role="status" className="text-sm text-muted-foreground">Memuat riwayat…</p> : historyError ? <div className="flex flex-wrap items-center gap-3" role="alert"><p className="text-sm">{historyError}</p><Button variant="outline" className="h-8" onClick={() => void loadHistory(item)}>Coba lagi</Button></div> : !history.length ? <p className="text-sm text-muted-foreground">Belum ada perubahan manual.</p> : <ol className="divide-y">{history.map(entry => <li key={entry.id} className="space-y-1 py-2 text-sm"><p className="font-medium">{date(entry.at)} · {entry.actorName || "Petugas"}</p><p>{snapshot(entry.before)} → {snapshot(entry.after)}</p>{entry.note && <p className="text-muted-foreground">{entry.note}</p>}</li>)}</ol>}</div></td></tr>}
				</Fragment>;
			})}
			{!visible.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{items.length ? "Tidak ada bahan sesuai pencarian." : "Belum ada bahan tersedia."}</td></tr>}
		</tbody></table></div>}
	</main>;
}
