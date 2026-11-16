import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Download, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { SplitBillAssignment, SplitBillSourceItem } from "@/lib/split-bill-calculator";
import { calculateSplitBill } from "@/lib/split-bill-calculator";
import { captureReceiptElementAsPng } from "@/lib/receipt-png-export";
import { currency } from "./types";

type Props = {
	open: boolean;
	items: SplitBillSourceItem[];
	storeName: string;
	orderReference: string;
	total: number;
	onClose: () => void;
};

export function SplitBillSheet({ open, items, storeName, orderReference, total, onClose }: Props) {
	const [people, setPeople] = useState<string[]>(["Saya"]);
	const [assignments, setAssignments] = useState<SplitBillAssignment[]>([]);
	const [exporting, setExporting] = useState(false);
	const [exportMessage, setExportMessage] = useState<string | null>(null);
	const result = useMemo(() => calculateSplitBill(items, assignments), [items, assignments]);
	if (!open) return null;

	const addPerson = () => setPeople((current) => [...current, `Teman ${current.length}`]);
	const updatePersonName = (index: number, nextName: string) => {
		setPeople((current) => current.map((person, personIndex) => personIndex === index ? nextName : person));
		const previousName = people[index];
		if (!previousName || !nextName.trim()) return;
		setAssignments((current) => current.map((entry) => entry.person === previousName ? { ...entry, person: nextName } : entry));
	};
	const commitPersonName = (index: number) => {
		const currentName = people[index]?.trim();
		const baseName = currentName || `Orang ${index + 1}`;
		let nextName = baseName;
		let suffix = 2;
		while (people.some((person, personIndex) => personIndex !== index && person.trim().toLowerCase() === nextName.toLowerCase())) {
			nextName = `${baseName} (${suffix})`;
			suffix += 1;
		}
		updatePersonName(index, nextName);
	};
	const updateAssignment = (itemId: string, person: string, quantity: number) => {
		setAssignments((current) => {
			const next = current.filter((entry) => !(entry.itemId === itemId && entry.person === person));
			return quantity > 0 ? [...next, { itemId, person, quantity }] : next;
		});
	};
	const handleDownload = async () => {
		if (!result.isBalanced || exporting) return;
		setExporting(true);
		setExportMessage("Menyiapkan PNG Split Bill…");
		try {
			const receiptElement = document.querySelector<HTMLElement>("[data-receipt-export-root='true']");
			if (!receiptElement) throw new Error("Struk belum siap diunduh");
			await captureReceiptElementAsPng(receiptElement, `split-bill-${orderReference.replace(/[^a-zA-Z0-9-]/g, "-")}.png`, (clone) => {
				const itemSection = clone.querySelector<HTMLElement>("[data-receipt-section='items']");
				if (!itemSection) return;
				const title = itemSection.querySelector("p");
				const rows = document.createElement("div");
				rows.className = "mt-1.5 space-y-1";
				for (const personName of people) {
					const person = result.people.find((entry) => entry.name === personName);
					const personRow = document.createElement("div");
					personRow.className = "flex items-start justify-between gap-2 text-[11px]";
					const personItems = document.createElement("span");
					personItems.className = "min-w-0 break-words text-foreground";
					personItems.textContent = `${personName}: ${person?.items.map((item) => `${item.assignedQuantity}x ${item.name}`).join(", ") || "—"}`;
					const personTotal = document.createElement("span");
					personTotal.className = "shrink-0 font-semibold";
					personTotal.textContent = currency(person?.subtotal ?? 0);
					personRow.append(personItems, personTotal);
					rows.appendChild(personRow);
				}
				if (title) title.textContent = "Split Bill · Detail item";
				itemSection.replaceChildren(title ?? document.createElement("p"), rows);
			});
			toast.success("Split bill berhasil diunduh sebagai PNG high-res");
			setExportMessage("PNG Split Bill siap disimpan");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Split bill gagal diunduh";
			setExportMessage(`Gagal: ${message}`);
			toast.error(message);
		} finally { setExporting(false); }
	};

	return <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/35 p-2" role="dialog" aria-modal="true" aria-label="Split Bill">
		<div className="mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl">
			<div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Split Bill</p><h3 className="text-lg font-black">Pisahkan item</h3></div><button type="button" aria-label="Tutup Split Bill" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted" onClick={onClose}><X className="h-4 w-4" /></button></div>
			<div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
				<div className="flex gap-2 overflow-x-auto pb-1">{people.map((person, personIndex) => <div key={`participant-${personIndex}`} className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1.5 text-xs font-bold text-primary"><input aria-label={`Nama peserta ${personIndex + 1}`} className="w-24 bg-transparent px-1 py-1 text-xs font-bold text-primary outline-none placeholder:text-primary/60" value={person} placeholder={`Peserta ${personIndex + 1}`} onChange={(event) => updatePersonName(personIndex, event.target.value)} onBlur={() => commitPersonName(personIndex)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />{people.length > 1 ? <button type="button" aria-label={`Hapus ${person || `peserta ${personIndex + 1}`}`} onClick={() => { setPeople((current) => current.filter((_, index) => index !== personIndex)); setAssignments((current) => current.filter((entry) => entry.person !== person)); }}><Trash2 className="h-3 w-3" /></button> : null}</div>)}<button type="button" className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 px-3 py-2 text-xs font-bold text-primary" onClick={addPerson}><Plus className="h-3 w-3" />Teman</button></div>
				{items.map((item) => <div key={item.id} className="rounded-2xl border border-border bg-card p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">{item.name}</p><p className="text-xs text-muted-foreground">{item.quantity}x · {currency(item.unitPrice)} / item</p></div><span className="text-xs font-black">{currency(item.quantity * item.unitPrice)}</span></div><div className="mt-2 grid grid-cols-2 gap-1.5">{people.map((person) => { const current = assignments.find((entry) => entry.itemId === item.id && entry.person === person)?.quantity ?? 0; return <label key={person} className="flex items-center justify-between rounded-xl bg-muted/60 px-2.5 py-2 text-xs font-bold"><span>{person}</span><input aria-label={`${item.name} untuk ${person}`} className="w-12 rounded-lg border border-border bg-background px-1.5 py-1 text-center" type="number" min={0} max={item.quantity} value={current} onChange={(event) => updateAssignment(item.id, person, Number(event.target.value))} /></label>; })}</div></div>)}
				<div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs"><div className="flex justify-between"><span>Sudah dibagi</span><strong>{currency(result.assignedTotal)}</strong></div><div className="mt-1 flex justify-between"><span>Belum dibagi</span><strong>{currency(result.unassignedTotal)}</strong></div>{result.errors.map((error) => <p key={error} className="mt-2 font-bold text-destructive">{error}</p>)}</div>
			</div>
			<div className="border-t border-border px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"><button type="button" disabled={!result.isBalanced || exporting} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground disabled:opacity-50" onClick={() => void handleDownload()}><Download className="h-4 w-4" />{exporting ? "Menyiapkan PNG…" : "Download Split Bill PNG"}</button>{exportMessage ? <p aria-live="polite" className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">{exportMessage}</p> : null}</div>
		</div>
	</div>;
}

type ReceiptActionLine = { label: string; value: string };

export function ReceiptActions({
	items,
	storeName,
	orderReference,
	payment,
	status,
	total,
	onRetryPayment,
	retryPaymentLabel = "Bayar ulang",
	retryingPayment = false,
}: {
	items: SplitBillSourceItem[];
	storeName: string;
	orderReference: string;
	payment: string;
	status: string;
	total: number;
	onRetryPayment?: () => Promise<void>;
	retryPaymentLabel?: string;
	retryingPayment?: boolean;
}) {
	const [splitOpen, setSplitOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [exportMessage, setExportMessage] = useState<string | null>(null);
	const safeFilename = orderReference.replace(/[^a-zA-Z0-9-]/g, "-");
	const lines: ReceiptActionLine[] = items.map((item) => ({ label: `${item.quantity}x ${item.name}${item.variant ? ` (${item.variant})` : ""}`, value: currency(item.quantity * item.unitPrice) }));
	const handleReceiptDownload = async () => {
		if (exporting) return;
		setExporting(true);
		setExportMessage("Menyiapkan bukti bayar PNG…");
		try {
			const receiptElement = document.querySelector<HTMLElement>("[data-receipt-export-root='true']");
			if (!receiptElement) throw new Error("Struk belum siap diunduh");
			await captureReceiptElementAsPng(receiptElement, `struk-${safeFilename}.png`);
			toast.success("Bukti bayar berhasil diunduh sebagai PNG high-res");
			setExportMessage("Bukti bayar PNG siap disimpan");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Bukti bayar gagal diunduh";
			setExportMessage(`Gagal: ${message}`);
			toast.error(message);
		} finally { setExporting(false); }
	};
	const tile = "flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[20px] bg-white/80 px-2 py-2.5 text-[11px] font-bold text-primary shadow-[0_6px_20px_rgba(15,35,71,0.08)] ring-1 ring-black/5 backdrop-blur-xl disabled:opacity-60";
	const spring = { type: "spring" as const, stiffness: 420, damping: 26 };
	return <>
		<motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.9 }} className="mt-4">
			<div className={onRetryPayment ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
				<motion.button whileTap={{ scale: 0.94 }} transition={spring} type="button" aria-label="Split Bill — pisahkan item" className={tile} onClick={() => setSplitOpen(true)}>
					<img src="/receipt-actions/split-bill-3d.png" alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover" />
					<span className="truncate">Split Bill</span>
				</motion.button>
				<motion.button whileTap={{ scale: 0.94 }} transition={spring} type="button" aria-label="Bagi Bukti Bayar — download struk" className={tile} onClick={() => void handleReceiptDownload()} disabled={exporting}>
					<img src="/receipt-actions/payment-proof-3d.png" alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover" />
					<span className="truncate">{exporting ? "Menyiapkan…" : "Bukti Bayar"}</span>
				</motion.button>
				{onRetryPayment ? <motion.button whileTap={{ scale: 0.94 }} transition={spring} type="button" aria-label="Buat link pembayaran baru" className={tile} onClick={() => void onRetryPayment()} disabled={retryingPayment}>
					{retryingPayment ? <Loader2 className="h-8 w-8 shrink-0 animate-spin rounded-xl bg-primary/10 p-1.5" /> : <Link2 className="h-8 w-8 shrink-0 rounded-xl bg-primary/10 p-1.5" />}
					<span className="truncate">Link Bayar</span>
				</motion.button> : null}
			</div>
			{exportMessage ? <p aria-live="polite" className="px-2 pt-2 text-center text-[11px] font-semibold text-muted-foreground">{exportMessage}</p> : null}
		</motion.div>
		<SplitBillSheet open={splitOpen} items={items} storeName={storeName} orderReference={orderReference} total={total} onClose={() => setSplitOpen(false)} />
	</>;
}
