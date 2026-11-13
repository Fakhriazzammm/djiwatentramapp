import { motion } from "framer-motion";
import { Delete, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useHybridInventory } from "@/hooks/use-hybrid-pos-data";
import { useHybridCreateTransaction, useHybridRecordExpenseIntake, useHybridSyncMenuStockFromInventory } from "@/hooks/use-hybrid-write-actions";
import { cn } from "@/lib/utils";
import { formatRp, IOS_SPRING, IosChip, IosSegmented, IosSheet } from "./ios-kit";

export type CashEntryType = "income" | "expense";

const CATEGORIES: Record<CashEntryType, string[]> = {
	income: ["Modal Awal", "Tambah Modal", "Setoran Shift", "Lainnya"],
	expense: ["Bahan Baku", "Belanja Stok", "Operasional", "Lainnya"],
};
const PAY_METHODS = [
	{ value: "tunai", label: "Tunai" },
	{ value: "QRIS", label: "QRIS" },
	{ value: "BANK_TRANSFER", label: "Transfer" },
	{ value: "CREDIT_CARD", label: "Kartu" },
];
const STRUCTURED_RE = /(?:—|--|–|-)\s*(?:QRIS|Tunai|Transfer|Bank|Cash|Cashless|Kartu|Debit|Gopay|Ovo|Dana)/i;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"] as const;

/** Catat pemasukan / pengeluaran manual. Aturan simpan sama dengan form lama (termasuk sinkron stok & gerbang AI Bantu). */
export function CashEntrySheet({ open, initialType, onClose }: { open: boolean; initialType: CashEntryType; onClose: () => void }) {
	const createTransaction = useHybridCreateTransaction();
	const recordExpenseIntake = useHybridRecordExpenseIntake();
	const syncMenuStock = useHybridSyncMenuStockFromInventory();
	const inventory = useHybridInventory();

	const [type, setType] = useState<CashEntryType>(initialType);
	const [lastOpen, setLastOpen] = useState(false);
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("");
	const [note, setNote] = useState("");
	const [method, setMethod] = useState("tunai");
	const [merchant, setMerchant] = useState("");
	const [itemName, setItemName] = useState("");
	const [itemQty, setItemQty] = useState("1");
	const [itemUnit, setItemUnit] = useState("");
	const [newItem, setNewItem] = useState(false);
	const [aiUsed, setAiUsed] = useState(false);
	const [aiBusy, setAiBusy] = useState(false);
	const [busy, setBusy] = useState(false);

	if (open !== lastOpen) {
		setLastOpen(open);
		if (open) {
			setType(initialType);
			setAmount(""); setCategory(""); setNote(""); setMethod("tunai"); setMerchant(""); setItemName(""); setItemQty("1"); setItemUnit(""); setNewItem(false); setAiUsed(false);
		}
	}

	const inventoryItems: any[] = useMemo(() => inventory ?? [], [inventory]);
	const matched = useMemo(() => {
		const name = itemName.trim().toLowerCase();
		return name ? inventoryItems.find((item) => String(item?.ingredientName || "").trim().toLowerCase() === name) ?? null : null;
	}, [inventoryItems, itemName]);
	const suggestions = useMemo(() => {
		const q = itemName.trim().toLowerCase();
		if (!q || matched) return [];
		return inventoryItems.filter((item) => String(item?.ingredientName || "").toLowerCase().includes(q)).slice(0, 5);
	}, [inventoryItems, itemName, matched]);

	const numeric = Number(amount) || 0;
	const structured = STRUCTURED_RE.test(note.trim());
	const needsAi = type === "expense" && note.trim().length >= 5 && !structured && !aiUsed;

	const press = (key: (typeof KEYS)[number]) => setAmount((current) => (key === "del" ? current.slice(0, -1) : `${current}${key}`.replace(/^0+(?=\d)/, "").slice(0, 9)));

	const runAi = async () => {
		const text = (note || amount).trim();
		if (text.length < 5) return void toast.warning("Ketik catatan dulu (min 5 karakter)");
		setAiBusy(true);
		setAiUsed(false);
		try {
			const res = await fetch("http://localhost:8002/ai-parse-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
			const data = await res.json();
			if (!data.ok) throw new Error(data.error || "AI parsing gagal");
			if (data.category) setCategory(data.category);
			if (data.merchant) setMerchant(data.merchant);
			if (data.payment_method && !["CASH", "cash", "tunai"].includes(data.payment_method)) setMethod(String(data.payment_method).toLowerCase());
			if (data.description && data.description !== note) setNote(data.description);
			if (data.items?.length) {
				setItemName(data.items[0].name || "");
				setItemQty(String(data.items[0].qty || 1));
				setItemUnit(data.items[0].unit || "");
			}
			toast.success(`AI: ${data.reply || "Form terisi"}`);
			setAiUsed(true);
		} catch (error: any) {
			toast.error(error.message || "Gagal hubungi AI");
		} finally {
			setAiBusy(false);
		}
	};

	const submit = async () => {
		if (busy) return;
		if (numeric <= 0) return void toast.error(type === "expense" ? "Jumlah pengeluaran harus lebih dari Rp 0" : "Masukkan nominal dulu");
		const cat = category || (type === "income" ? "Setoran Shift" : "Operasional");
		setBusy(true);
		try {
			if (type === "income") {
				await createTransaction({ type: "income", amount: numeric, category: cat, description: note, merchant: merchant || undefined, date: Date.now(), status: "completed", paymentMethod: method || "tunai" });
				toast.success("Pemasukan berhasil dicatat");
			} else {
				if (needsAi) return void toast.error("Ketik catatan dengan format '— QRIS — Toko' atau ketuk AI Bantu.");
				const hasItem = itemName.trim().length > 0;
				if (hasItem && !matched && !newItem) return void toast.error("Pilih item dari inventory, atau aktifkan 'item baru'.");
				const qty = Number(itemQty) || 1;
				const name = matched?.ingredientName || itemName.trim();
				const unit = itemUnit.trim() || matched?.unit || undefined;
				await recordExpenseIntake({
					source: "pos_menu_sidebar",
					syncMode: hasItem ? "finance_plus_inventory" : "finance_only",
					allowCreateInventoryItem: newItem,
					transaction: { type: "expense", amount: numeric, category: cat, description: note || name, merchant: merchant || undefined, date: Date.now(), status: "completed", paymentMethod: method || "tunai" },
					items: hasItem ? [{ name, quantity: qty, unit, price: numeric / qty, total: numeric }] : undefined,
					metadata: { inputMode: "pos_menu_sidebar_expense", sourceLabel: "Menu Kas", inventoryItemId: matched?._id, allowNewInventoryItem: newItem },
				});
				if (hasItem) {
					try { await syncMenuStock(); } catch (error) { console.error("[cash-entry] syncMenuStock failed", error); }
				}
				toast.success(hasItem ? "Pengeluaran & stok berhasil dicatat" : "Pengeluaran berhasil dicatat");
			}
			onClose();
		} catch (error: any) {
			console.error(error);
			toast.error(error?.message || (type === "income" ? "Gagal mencatat pemasukan" : "Gagal mencatat pengeluaran"));
		} finally {
			setBusy(false);
		}
	};

	const isIncome = type === "income";
	return (
		<IosSheet
			open={open}
			onClose={onClose}
			heightClass="max-h-[92dvh]"
			footer={
				<motion.button type="button" whileTap={{ scale: 0.97 }} transition={IOS_SPRING} disabled={busy} onClick={() => void submit()} className={cn("flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-white disabled:opacity-60", isIncome ? "bg-emerald-600" : "bg-rose-600")}>
					{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
					Simpan {isIncome ? "pemasukan" : "pengeluaran"}
				</motion.button>
			}
		>
			<IosSegmented id="cash-type" value={type} onChange={(v) => { setType(v); setCategory(""); }} options={[{ value: "income", label: "Pemasukan" }, { value: "expense", label: "Pengeluaran" }]} />
			<motion.p key={amount} initial={{ scale: 1.06 }} animate={{ scale: 1 }} transition={IOS_SPRING} className="my-2 text-center text-[36px] font-extrabold tracking-tight tabular-nums">{formatRp(numeric)}</motion.p>
			<div className="flex flex-wrap justify-center gap-2 pb-2">
				{CATEGORIES[type].map((item) => <IosChip key={item} active={category === item} onClick={() => setCategory(item)} className="h-8 px-3.5 text-[12.5px]">{item}</IosChip>)}
			</div>
			<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={isIncome ? "Catatan (opsional)" : "Catatan, mis. Es batu — QRIS — Toko"} aria-label="Catatan" className="h-11 w-full rounded-[13px] bg-muted px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />
			{needsAi ? (
				<div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
					<span>Gunakan format “— QRIS — Toko” atau biarkan AI merapikan.</span>
					<button type="button" onClick={() => void runAi()} disabled={aiBusy} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 text-white disabled:opacity-60">{aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}AI Bantu</button>
				</div>
			) : null}
			<div className="mt-2 flex flex-wrap gap-2">
				{PAY_METHODS.map((item) => <IosChip key={item.value} active={method === item.value} onClick={() => setMethod(item.value)} className="h-8 px-3.5 text-[12.5px]">{item.label}</IosChip>)}
			</div>
			<input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder={isIncome ? "Sumber (opsional)" : "Toko / merchant (opsional)"} aria-label="Merchant atau sumber" className="mt-2 h-11 w-full rounded-[13px] bg-muted px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />
			{!isIncome ? (
				<details className="mt-2 rounded-[13px] bg-muted/60 px-3.5 py-2.5">
					<summary className="cursor-pointer text-[13px] font-bold">Tambah ke stok inventory (opsional)</summary>
					<div className="mt-2.5 space-y-2">
						<input value={itemName} onChange={(event) => { setItemName(event.target.value); setNewItem(false); }} placeholder="Nama item" aria-label="Nama item stok" className="h-10 w-full rounded-xl bg-background px-3 text-[14px] outline-none" />
						{suggestions.length > 0 ? <div className="flex flex-wrap gap-1.5">{suggestions.map((item) => <button key={item._id ?? item.ingredientName} type="button" onClick={() => { setItemName(String(item.ingredientName)); setItemUnit(String(item.unit || "")); }} className="rounded-full bg-background px-3 py-1.5 text-[12px] font-semibold">{item.ingredientName}</button>)}</div> : null}
						<div className="flex gap-2">
							<input value={itemQty} onChange={(event) => setItemQty(event.target.value)} inputMode="decimal" placeholder="Jumlah" aria-label="Jumlah item" className="h-10 w-24 rounded-xl bg-background px-3 text-[14px] outline-none" />
							<input value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} placeholder="Satuan" aria-label="Satuan item" className="h-10 min-w-0 flex-1 rounded-xl bg-background px-3 text-[14px] outline-none" />
						</div>
						{itemName.trim() && !matched ? <label className="flex items-center gap-2 text-[12.5px] font-semibold"><input type="checkbox" checked={newItem} onChange={(event) => setNewItem(event.target.checked)} />Item baru (belum ada di inventory)</label> : null}
					</div>
				</details>
			) : null}
			<div className="mt-3 grid grid-cols-3 gap-2 pb-1">
				{KEYS.map((key) => (
					<motion.button key={key} type="button" whileTap={{ scale: 0.92, backgroundColor: "var(--border)" }} transition={IOS_SPRING} onClick={() => press(key)} aria-label={key === "del" ? "Hapus angka" : key} className="flex h-[50px] items-center justify-center rounded-2xl bg-muted text-[21px] font-semibold">
						{key === "del" ? <Delete className="h-5 w-5" /> : key}
					</motion.button>
				))}
			</div>
		</IosSheet>
	);
}
