import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { adminProtectedAction, adminProtectedRpc } from "@/lib/admin-protected-read";

type Area = "bar" | "kitchen" | null;
type Material = { inventoryId: string; name: string; area: Area; mode: "availability" | "count"; status: string; quantity: number | null; unit: string; updatedAt: number | null; updatedBy: string | null };
type Filter = "all" | "bar" | "kitchen" | "none";

const AREAS: Array<{ value: Area; label: string }> = [{ value: "bar", label: "Bar" }, { value: "kitchen", label: "Dapur" }, { value: null, label: "Tidak" }];
const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/** Daftar bahan yang wajib dihitung kasir saat tutup shift (tabel pos.shift_opname_materials). */
export function ShiftOpnameMaterials() {
	const [rows, setRows] = useState<Material[] | null>(null);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const [busy, setBusy] = useState<Set<string>>(new Set());

	const load = useCallback(async () => {
		try {
			const data = await adminProtectedRpc<Material[]>("shift_opname_admin_list");
			setRows(Array.isArray(data) ? data : []);
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal memuat bahan");
		}
	}, []);
	useEffect(() => { void load(); }, [load]);

	const setArea = async (row: Material, area: Area) => {
		if (row.area === area || busy.has(row.inventoryId)) return;
		const before = rows;
		setBusy((p) => new Set(p).add(row.inventoryId));
		setRows((p) => p?.map((r) => (r.inventoryId === row.inventoryId ? { ...r, area } : r)) ?? p);
		try {
			await adminProtectedAction("shift_opname_admin_set", { inventoryId: row.inventoryId, area });
			toast.success(area ? `${row.name} masuk opname ${area === "bar" ? "Bar" : "Dapur"}` : `${row.name} keluar dari opname`);
		} catch (e) {
			setRows(before);
			toast.error(`Gagal: ${e instanceof Error ? e.message : "tidak tersimpan"}`);
		} finally {
			setBusy((p) => { const n = new Set(p); n.delete(row.inventoryId); return n; });
		}
	};

	const counts = useMemo(() => ({ bar: rows?.filter((r) => r.area === "bar").length ?? 0, kitchen: rows?.filter((r) => r.area === "kitchen").length ?? 0, none: rows?.filter((r) => !r.area).length ?? 0 }), [rows]);
	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (rows ?? []).filter((r) => (filter === "all" || (filter === "none" ? !r.area : r.area === filter)) && (!q || r.name.toLowerCase().includes(q)));
	}, [rows, query, filter]);

	if (error) return <div className="panel"><div className="empty" role="alert">DATA BELUM BERHASIL DIMUAT · {error} <button className="btn s" onClick={() => void load()}>Coba lagi</button></div></div>;
	if (!rows) return <div className="panel"><div className="empty">MEMUAT…</div></div>;

	const chip = (key: Filter, label: string, n?: number) => <button key={key} className={`chipb ${filter === key ? "on" : ""}`} onClick={() => setFilter(key)}>{filter === key ? "✓ " : ""}{label}{n === undefined ? "" : ` · ${n}`}</button>;
	return (
		<div className="panel">
			<div className="ph"><span className="lab">Bahan opname kasir</span><span className="meta">{counts.bar + counts.kitchen} bahan dihitung kasir saat tutup shift</span></div>
			<div className="panel pad opstrip">
				{chip("all", "Semua", rows.length)}{chip("bar", "Bar", counts.bar)}{chip("kitchen", "Dapur", counts.kitchen)}{chip("none", "Tidak diopname", counts.none)}
				<input className="f" style={{ maxWidth: 220 }} placeholder="Cari bahan" aria-label="Cari bahan" value={query} onChange={(e) => setQuery(e.target.value)} />
			</div>
			<div className="tw2">
				<table>
					<thead><tr><th>Bahan</th><th>Dihitung kasir</th><th>Area opname</th><th>Diubah</th></tr></thead>
					<tbody>
						<AnimatePresence initial={false}>
							{visible.map((r) => (
								<motion.tr key={r.inventoryId} layout="position" initial={{ opacity: 0 }} animate={{ opacity: busy.has(r.inventoryId) ? 0.6 : 1 }} exit={{ opacity: 0 }} transition={SPRING}>
									<td>{r.name}</td>
									<td><span className="tg">{r.mode === "count" ? `Jumlah (${r.unit})` : "Ada / Habis"}</span>{r.mode === "count" && r.quantity !== null ? <span className="meta"> · terakhir {r.quantity}</span> : null}</td>
									<td>
										<div role="group" aria-label={`Area opname ${r.name}`} style={{ display: "inline-flex", gap: 4 }}>
											{AREAS.map((a) => <button key={a.label} type="button" aria-pressed={r.area === a.value} className={`chipb ${r.area === a.value ? "on" : ""}`} onClick={() => void setArea(r, a.value)}>{a.label}</button>)}
										</div>
									</td>
									<td className="meta">{r.updatedBy ?? "—"}</td>
								</motion.tr>
							))}
						</AnimatePresence>
					</tbody>
				</table>
				{visible.length === 0 && <div className="empty">TIDAK ADA BAHAN YANG COCOK</div>}
			</div>
			<div className="meta" style={{ padding: "8px 12px" }}>Cara hitung (Ada/Habis atau Jumlah) diatur per bahan di Inventaris. Kasir hanya melihat bahan di area Bar atau Dapur.</div>
		</div>
	);
}
