import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Package, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useManualStockMode } from "@yumipos/web-shared/lib/manual-stock";
import { cn } from "@/lib/utils";
import { useHybridAdjustReadyMenuStock, useHybridBulkUpdateProducts, useHybridUpdateProduct } from "@/hooks/use-hybrid-write-actions";
import { ConfirmSheet, IOS_SPRING } from "./ios-kit";

type Product = { _id: string; name: string; quantity?: number | null; isAvailable?: boolean; menuNumber?: number | null; categoryId?: string | null };
type Category = { _id: string; name: string; parentId?: string | null; track?: string | null };
type Filter = "all" | "low" | "out";

function statusFor(p: Product, integrated: boolean) {
	const q = Number(p.quantity ?? 0);
	if (p.isAvailable === false) return { label: "Habis", cls: "bg-rose-100 text-rose-700" };
	if (!integrated) return { label: "Tersedia", cls: "bg-emerald-100 text-emerald-700" };
	if (q <= 0) return { label: "Habis", cls: "bg-rose-100 text-rose-700" };
	if (q <= 10) return { label: "Menipis", cls: "bg-amber-100 text-amber-700" };
	return { label: "Tersedia", cls: "bg-emerald-100 text-emerald-700" };
}

export function StockSheet({ products, categories, onClose, onRefresh }: { products: Product[]; categories: Category[]; onClose: () => void; onRefresh?: () => void }) {
	const { mode } = useManualStockMode();
	const integrated = mode === "integrated";
	const [query, setQuery] = useState("");
	const [categoryId, setCategoryId] = useState("all");
	const [filter, setFilter] = useState<Filter>("all");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState<Set<string>>(new Set());
	const [confirmOut, setConfirmOut] = useState<string[] | null>(null);
	const updateProduct = useHybridUpdateProduct();
	const adjustStock = useHybridAdjustReadyMenuStock();
	const bulkUpdate = useHybridBulkUpdateProducts();

	const catById = useMemo(() => new Map(categories.map((c) => [c._id, c])), [categories]);
	const parents = useMemo(() => categories.filter((c) => !c.parentId && c.track !== "hidden"), [categories]);
	const parentOf = (p: Product) => {
		const c = p.categoryId ? catById.get(p.categoryId) : undefined;
		return c?.parentId ? catById.get(c.parentId) : c;
	};

	const visible = useMemo(() => {
		const n = query.trim().toLowerCase();
		return products.filter((p) => {
			const c = p.categoryId ? catById.get(p.categoryId) : undefined;
			const par = parentOf(p);
			const q = Number(p.quantity ?? 0);
			const okQ = !n || [p.name, p.menuNumber, c?.name, par?.name].some((v) => String(v ?? "").toLowerCase().includes(n));
			const okC = categoryId === "all" || par?._id === categoryId;
			const okS = filter === "all" || (filter === "low" && integrated && p.isAvailable !== false && q > 0 && q <= 10) || (filter === "out" && (p.isAvailable === false || (integrated && q <= 0)));
			return okQ && okC && okS;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [products, catById, query, categoryId, filter, integrated]);

	const groups = useMemo(() => {
		const map = new Map<string, Product[]>();
		for (const p of visible) {
			const c = p.categoryId ? catById.get(p.categoryId) : undefined;
			const par = parentOf(p);
			const label = par && c && par._id !== c._id ? `${par.name} / ${c.name}` : c?.name || "Tanpa kategori";
			map.set(label, [...(map.get(label) ?? []), p]);
		}
		return [...map.entries()];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible, catById]);

	const summary = useMemo(() => {
		let ok = 0, low = 0, out = 0;
		for (const p of products) {
			const s = statusFor(p, integrated).label;
			if (s === "Habis") out++; else if (s === "Menipis") low++; else ok++;
		}
		return { ok, low, out };
	}, [products, integrated]);

	const mark = (id: string, on: boolean) => setSaving((c) => { const n = new Set(c); on ? n.add(id) : n.delete(id); return n; });
	const toggleSel = (id: string) => setSelected((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

	const setAvailability = async (product: Product, next: boolean) => {
		const id = String(product._id);
		mark(id, true);
		try {
			await updateProduct({ id: product._id, isAvailable: next });
			toast.success(`${product.name} ${next ? "tersedia" : "habis"}`);
			onRefresh?.();
		} catch (e: any) {
			toast.error(e?.message || "Gagal mengubah ketersediaan produk");
		} finally {
			mark(id, false);
		}
	};

	const adjust = async (product: Product, delta: number) => {
		const cur = Number(product.quantity ?? 0);
		if (Math.max(0, cur + delta) === cur) return;
		const id = String(product._id);
		mark(id, true);
		try {
			const r = await adjustStock({ productId: product._id, delta, currentQuantity: cur });
			toast.success(`Stok ${product.name}: ${r.quantity} porsi`);
		} catch (e: any) {
			toast.error(e?.message || "Gagal mengubah stok");
		} finally {
			mark(id, false);
			onRefresh?.();
		}
	};

	const bulk = async (ids: string[], available: boolean) => {
		try {
			await bulkUpdate({ ids, updates: { isAvailable: available } });
			toast.success(`${ids.length} produk diperbarui`);
			setSelected(new Set());
			onRefresh?.();
		} catch (e: any) {
			toast.error(e?.message || "Gagal memperbarui produk");
		}
	};

	const allSelected = visible.length > 0 && visible.every((p) => selected.has(String(p._id)));
	const chip = (on: boolean) => cn("shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors active:scale-95", on ? "bg-primary text-primary-foreground" : "bg-card text-foreground");

	return (
		<div className="relative flex h-full min-h-0 flex-col bg-muted/40">
			<div className="px-4 pb-1 pt-1">
				<div className="flex items-center justify-between">
					<div><h2 className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight"><Package className="h-5 w-5 text-primary" />Pengaturan Stok</h2><p className="text-xs text-muted-foreground">Atur menu yang siap dijual dengan cepat.</p></div>
					<button type="button" aria-label="Tutup pengaturan stok" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-muted-foreground active:scale-90"><X className="h-4 w-4" /></button>
				</div>
				<div className="mt-3 grid grid-cols-3 gap-2">
					{([["Tersedia", summary.ok, ""], ["Menipis", summary.low, "text-amber-600"], ["Habis", summary.out, "text-rose-600"]] as const).map(([l, v, c]) => (
						<div key={l} className="rounded-2xl bg-card px-3 py-2"><b className={cn("block text-lg leading-tight", c)}>{v}</b><small className="text-[11px] text-muted-foreground">{l}</small></div>
					))}
				</div>
				<div className="relative mt-2.5"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari produk" className="h-10 w-full rounded-xl bg-card pl-9 pr-9 text-sm outline-none" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Bersihkan pencarian" className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"><X className="h-3.5 w-3.5" /></button> : null}</div>
			</div>
			<div className="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-none">
				<button type="button" className={chip(categoryId === "all")} onClick={() => setCategoryId("all")}>Semua</button>
				{parents.map((c) => <button type="button" key={c._id} className={chip(categoryId === c._id)} onClick={() => setCategoryId(c._id)}>{c.name}</button>)}
			</div>
			<div className="flex items-center justify-between px-4 pb-1">
				<div className="flex gap-1.5">{(["all", "low", "out"] as Filter[]).map((f) => <button type="button" key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground")}>{f === "all" ? "Semua status" : f === "low" ? "Menipis" : "Habis"}</button>)}</div>
				<button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((p) => String(p._id))))} className="px-1 text-[12px] font-bold text-primary">{allSelected ? "Batal pilih" : "Pilih semua"}</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28">
				{groups.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada produk yang cocok.</p> : groups.map(([label, list]) => (
					<section key={label} className="mb-3">
						<h3 className="px-1 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</h3>
						<div className="overflow-hidden rounded-2xl bg-card">
							{list.map((p) => {
								const id = String(p._id);
								const st = statusFor(p, integrated);
								const isSel = selected.has(id);
								const busy = saving.has(id);
								const on = p.isAvailable !== false && st.label !== "Habis";
								return (
									<div key={id} className={cn("flex min-h-[60px] items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-0 transition-opacity", !on && "opacity-60")}>
										<button type="button" role="checkbox" aria-checked={isSel} aria-label={`Pilih ${p.name}`} onClick={() => toggleSel(id)} className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90", isSel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
											<AnimatePresence>{isSel ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={IOS_SPRING}><Check className="h-3.5 w-3.5" strokeWidth={3} /></motion.span> : null}</AnimatePresence>
										</button>
										<div className="min-w-0 flex-1">
											<p className="truncate text-[13px] font-semibold">{p.name}</p>
											<div className="mt-0.5 flex items-center gap-1.5"><span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", st.cls)}>{st.label}</span>{p.menuNumber != null ? <span className="text-[10px] text-muted-foreground">#{p.menuNumber}</span> : null}</div>
										</div>
										{integrated ? (
											<div className="flex shrink-0 items-center gap-1">
												<button type="button" disabled={busy || Number(p.quantity ?? 0) <= 0} onClick={() => void adjust(p, -1)} aria-label={`Kurangi stok ${p.name}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-base active:scale-90 disabled:opacity-40">−</button>
												<span className="w-8 text-center text-xs font-black tabular-nums">{Number(p.quantity ?? 0)}</span>
												<button type="button" disabled={busy} onClick={() => void adjust(p, 1)} aria-label={`Tambah stok ${p.name}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-base active:scale-90 disabled:opacity-40">+</button>
											</div>
										) : null}
										<button type="button" role="switch" aria-checked={on} disabled={busy} aria-label={`${on ? "Nonaktifkan" : "Aktifkan"} ${p.name}`} onClick={() => (on ? setConfirmOut([id]) : void setAvailability(p, true))} className={cn("relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors", on ? "bg-emerald-500" : "bg-muted-foreground/30")}>
											<motion.span className="absolute left-0.5 top-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white shadow" animate={{ x: on ? 20 : 0 }} transition={IOS_SPRING}>{busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</motion.span>
										</button>
									</div>
								);
							})}
						</div>
					</section>
				))}
			</div>
			<AnimatePresence>
				{selected.size > 0 ? (
					<motion.div initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={IOS_SPRING} className="absolute inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex items-center gap-2 rounded-[20px] bg-zinc-900/90 py-2 pl-4 pr-2 text-white shadow-xl backdrop-blur-xl">
						<span className="flex-1 text-sm font-semibold">{selected.size} dipilih</span>
						<button type="button" onClick={() => setConfirmOut([...selected])} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold active:scale-95">Tandai habis</button>
						<button type="button" onClick={() => void bulk([...selected], true)} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold active:scale-95">Tersedia</button>
					</motion.div>
				) : null}
			</AnimatePresence>
			<ConfirmSheet
				open={confirmOut !== null}
				title="Tandai habis?"
				message={`${confirmOut?.length ?? 0} produk akan ditandai tidak tersedia.`}
				confirmLabel="Tandai habis"
				destructive
				onClose={() => setConfirmOut(null)}
				onConfirm={() => {
					const ids = confirmOut ?? [];
					setConfirmOut(null);
					if (ids.length === 1) { const p = products.find((x) => String(x._id) === ids[0]); if (p) void setAvailability(p, false); } else void bulk(ids, false);
				}}
			/>
		</div>
	);
}
