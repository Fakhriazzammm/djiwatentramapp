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
import {
	saveManualStockDrafts,
	createManualStockDraft,
	isManualStockDraftDirty,
	MANUAL_STOCK_UNITS,
	type ManualStockDraft,
} from "./manual-stock-draft";

const statuses = { available: "Tersedia", out: "Habis", unknown: "Belum dicek" };
const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs";
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
	const saveLock = useRef(false);

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

	const saveAll = async () => {
		if (saveLock.current) return;
		const changed = items.filter(item => isManualStockDraftDirty(item, drafts[item.inventoryId] ?? createManualStockDraft(item)));
		if (!changed.length) return;
		saveLock.current = true;
		setSavingIds(new Set(changed.map(item => item.inventoryId)));
		setSuccess(null);
		try {
		const { saved: savedRows, errors } = await saveManualStockDrafts(changed, drafts, saveManualStock);
		const saved = savedRows.map(row => row.inventoryId);
		setRowErrors(errors);
		if (Object.keys(errors).length) { setFilter(""); setQuery(""); }
		if (savedRows.length) {
			const byId = new Map(savedRows.map(row => [row.inventoryId, row]));
			setItems(previous => previous.map(row => byId.get(row.inventoryId) ?? row));
			setDrafts(previous => { const next = { ...previous }; for (const row of savedRows) next[row.inventoryId] = createManualStockDraft(row); return next; });
		}
		if (saved.length) setSuccess(`${saved.length} bahan tersimpan${Object.keys(errors).length ? `; ${Object.keys(errors).length} gagal, periksa baris terkait.` : "."}`);
		await refresh(saved);
		} catch (err) {
			if (mounted.current) setError(message(err));
		} finally {
			saveLock.current = false;
			if (mounted.current) setSavingIds(new Set());
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
	const dirtyCount = items.filter(item => isManualStockDraftDirty(item, drafts[item.inventoryId] ?? createManualStockDraft(item))).length;
	const busy = savingIds.size > 0;
	const filters = [["", "Semua"], ["unknown", "Belum dicek"], ["out", "Habis"], ["available", "Tersedia"]] as const;
	const filterCount = (value: string) => value ? items.filter(item => item.status === value).length : items.length;
	return <main className="min-h-full space-y-4 bg-[#f2f2f5] p-4 md:p-6">
		<div className="flex flex-wrap items-center gap-2"><label className="min-w-48 flex-1"><span className="sr-only">Cari bahan</span><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari bahan…" className="h-11 rounded-none bg-white" /></label><Button variant="outline" className="h-11 rounded-none" disabled={busy} onClick={() => void refresh()}>Perbarui</Button><Button className="h-11 rounded-none" disabled={busy || !dirtyCount} onClick={() => void saveAll()}>{busy ? "Menyimpan…" : `Simpan perubahan (${dirtyCount})`}</Button></div>
		{success && <p role="status" className="text-sm">{success}</p>}
		{error && <div role="alert" className="border border-destructive bg-white p-3"><p>{error} Data yang ditampilkan mungkin belum terbaru.</p><Button variant="outline" onClick={() => void refresh()}>Coba lagi</Button></div>}
		<div className="grid grid-cols-2 gap-px border border-[#e4e4e8] bg-[#e4e4e8] md:grid-cols-4">{[["Bahan",items.length],["Tersedia",filterCount("available")],["Habis",filterCount("out")],["Belum dicek",filterCount("unknown")]].map(([label,count]) => <div className="bg-white p-4" key={label}><p className="font-mono text-[10px] uppercase tracking-wider text-[#666672]">{label}</p><p className="mt-1 text-2xl">{count}</p><p className="text-xs text-muted-foreground">bahan</p></div>)}</div>
		<div className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-mono text-xs font-semibold uppercase tracking-wider"><span className="mr-2 inline-block h-2 w-2 bg-[#d92d20]" />Daftar bahan</h1><span className="text-xs text-muted-foreground">{visible.length} bahan ditampilkan</span></div>
		<div className="flex overflow-x-auto">{filters.map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 whitespace-nowrap border border-[#e4e4e8] px-3 font-mono text-[10px] font-semibold uppercase tracking-wider ${filter === value ? "bg-[#111114] text-white" : "bg-white text-[#555560]"}`}>{label} · {filterCount(value)}</button>)}</div>
		{loading ? <p role="status">Memuat stok…</p> : <div className="overflow-x-auto border border-[#e4e4e8] bg-white"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#fafafa] font-mono text-[10px] uppercase tracking-wider text-[#666672]"><tr><th className="p-3">Bahan</th><th className="p-3">Status cepat</th><th className="p-3">Jumlah opsional</th><th className="p-3">Catatan</th><th className="p-3">Terakhir dicek</th><th className="p-3">Riwayat</th></tr></thead><tbody>
		{visible.map(item => { const draft = drafts[item.inventoryId] ?? createManualStockDraft(item); const dirty = isManualStockDraftDirty(item,draft); const currentStatus = draft.mode === "count" ? countStatus(draft) : draft.status; return <Fragment key={item.inventoryId}><tr className="border-t border-[#eeeef0] align-middle"><td className="min-w-[150px] p-3 font-medium">{item.name}{dirty && <span className="ml-2 text-emerald-700" aria-label="Belum disimpan">●</span>}<div className="mt-1 text-xs font-normal text-muted-foreground">{statuses[currentStatus]}</div></td><td className="p-2"><div className="inline-flex border border-[#dddde2]">{([ ["available","Tersedia"], ["out","Habis"] ] as const).map(([value,label]) => <button key={value} type="button" disabled={busy} aria-label={`${label}: ${item.name}`} aria-pressed={currentStatus === value} className={`min-h-10 px-3 text-xs ${currentStatus === value ? "bg-[#111114] text-white" : "bg-white"}`} onClick={() => currentStatus !== value && updateDraft(item, value === "out" && draft.mode === "count" ? {mode:"count",status:"out",quantity:"0"} : {mode:"availability",status:value,quantity:""})}>{label}</button>)}</div></td><td className="p-2"><div className="flex items-center gap-1"><Input type="number" min="0" max="2147483647" step="1" aria-label={`Jumlah ${item.name}`} placeholder="—" className="h-10 w-20 rounded-none text-right" disabled={busy} value={draft.mode === "count" ? draft.quantity : ""} onChange={event => { const quantity=event.target.value; updateDraft(item, quantity === "" ? {mode:"availability",quantity:"",status:currentStatus} : {mode:"count",quantity,status:quantity === "0" ? "out" : "available"}); }} /><select aria-label={`Satuan ${item.name}`} className={`${selectClass} w-24 rounded-none bg-white`} disabled={busy} value={draft.unit} onChange={event => updateDraft(item,{unit:event.target.value})}>{MANUAL_STOCK_UNITS.map(value => <option key={value} value={value}>{value}</option>)}</select></div></td><td className="p-2"><Input aria-label={`Catatan ${item.name}`} className="h-10 w-32 rounded-none" maxLength={500} placeholder="Opsional" disabled={busy} value={draft.note} onChange={event => updateDraft(item,{note:event.target.value})}/></td><td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{date(item.updatedAt)}<br/>{item.updatedBy || "—"}</td><td className="p-2">{dirty && <Button variant="ghost" className="h-10 rounded-none text-xs" disabled={busy} aria-label={`Batalkan perubahan ${item.name}`} onClick={() => { setDrafts(previous => ({...previous, [item.inventoryId]: createManualStockDraft(item)})); setRowErrors(previous => { const next = {...previous}; delete next[item.inventoryId]; return next; }); }}>Batal</Button>}<Button variant="ghost" className="h-10 rounded-none text-xs underline" onClick={() => toggleHistory(item)} aria-expanded={historyItemId === item.inventoryId} aria-label={`Riwayat ${item.name}`}>{historyItemId === item.inventoryId ? "Tutup" : "Lihat"}</Button></td></tr>
		{rowErrors[item.inventoryId] && <tr><td colSpan={6} className="border-t bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">{rowErrors[item.inventoryId]} <button type="button" className="underline" onClick={() => { setDrafts(prev => ({...prev,[item.inventoryId]:createManualStockDraft(item)})); setRowErrors(prev => { const next={...prev}; delete next[item.inventoryId]; return next; }); }}>Gunakan data terbaru</button></td></tr>}
		{historyItemId === item.inventoryId && <tr><td colSpan={6} className="border-t bg-muted/20 px-4 py-3"><p className="text-xs font-semibold">Riwayat {item.name}</p>{historyLoading ? <p role="status">Memuat riwayat…</p> : historyError ? <div role="alert">{historyError} <Button variant="outline" onClick={() => void loadHistory(item)}>Coba lagi</Button></div> : !history.length ? <p className="text-sm text-muted-foreground">Belum ada perubahan manual.</p> : <ol className="divide-y">{history.map(entry => <li key={entry.id} className="py-2 text-sm"><p>{date(entry.at)} · {entry.actorName || "Petugas"}</p><p>{snapshot(entry.before)} → {snapshot(entry.after)}</p>{entry.note && <p className="text-muted-foreground">{entry.note}</p>}</li>)}</ol>}</td></tr>}</Fragment>})}
		{!visible.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{items.length ? "Tidak ada bahan sesuai pencarian." : "Belum ada bahan tersedia."}</td></tr>}</tbody></table></div>}
		<div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border border-[#e4e4e8] bg-white p-3"><p className="text-xs text-muted-foreground">{dirtyCount ? `${dirtyCount} bahan belum disimpan.` : "Pilih status atau isi jumlah langsung di baris."} Jumlah 0 berarti habis.</p><Button className="rounded-none" disabled={busy || !dirtyCount} onClick={() => void saveAll()}>{busy ? "Menyimpan…" : `Simpan perubahan (${dirtyCount})`}</Button></div>
	</main>;
}
