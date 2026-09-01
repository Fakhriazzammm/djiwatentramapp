import { useMemo, useState } from "react";
import { Download, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { SplitBillAssignment, SplitBillSourceItem } from "@/lib/split-bill-calculator";
import { calculateSplitBill } from "@/lib/split-bill-calculator";
import { buildReceiptSvg, downloadSvgAsPng } from "@/lib/receipt-png-export";
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
	const result = useMemo(() => calculateSplitBill(items, assignments), [items, assignments]);
	if (!open) return null;

	const addPerson = () => setPeople((current) => [...current, `Teman ${current.length}`]);
	const updateAssignment = (itemId: string, person: string, quantity: number) => {
		setAssignments((current) => {
			const next = current.filter((entry) => !(entry.itemId === itemId && entry.person === person));
			return quantity > 0 ? [...next, { itemId, person, quantity }] : next;
		});
	};
	const handleDownload = async () => {
		if (!result.isBalanced || exporting) return;
		setExporting(true);
		try {
			const lines = result.people.flatMap((person) => [
				{ label: person.name, value: person.items.map((item) => `${item.assignedQuantity}x ${item.name}`).join(", ") || "—" },
				{ label: `Subtotal ${person.name}`, value: currency(person.subtotal) },
			]);
			if (result.unassigned.length) lines.push({ label: "Belum dibagi", value: result.unassigned.map((item) => `${item.assignedQuantity}x ${item.name}`).join(", ") });
			await downloadSvgAsPng(buildReceiptSvg({ title: "Split Bill", storeName, orderReference, status: "Pembagian item", payment: "Tidak mengubah pembayaran", total: currency(total), lines, note: "Split bill ini hanya membagi item secara lokal dan tidak mengubah transaksi." }), `split-bill-${orderReference.replace(/[^a-zA-Z0-9-]/g, "-")}.png`, 3);
			toast.success("Split bill berhasil diunduh sebagai PNG high-res");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Split bill gagal diunduh");
		} finally { setExporting(false); }
	};

	return <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/35 p-2" role="dialog" aria-modal="true" aria-label="Split Bill">
		<div className="mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl">
			<div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Split Bill</p><h3 className="text-lg font-black">Pisahkan item</h3></div><button type="button" aria-label="Tutup Split Bill" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted" onClick={onClose}><X className="h-4 w-4" /></button></div>
			<div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
				<div className="flex gap-2 overflow-x-auto pb-1">{people.map((person) => <div key={person} className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary"><span>{person}</span>{people.length > 1 ? <button type="button" aria-label={`Hapus ${person}`} onClick={() => { setPeople((current) => current.filter((entry) => entry !== person)); setAssignments((current) => current.filter((entry) => entry.person !== person)); }}><Trash2 className="h-3 w-3" /></button> : null}</div>)}<button type="button" className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 px-3 py-2 text-xs font-bold text-primary" onClick={addPerson}><Plus className="h-3 w-3" />Teman</button></div>
				{items.map((item) => <div key={item.id} className="rounded-2xl border border-border bg-card p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">{item.name}</p><p className="text-xs text-muted-foreground">{item.quantity}x · {currency(item.unitPrice)} / item</p></div><span className="text-xs font-black">{currency(item.quantity * item.unitPrice)}</span></div><div className="mt-2 grid grid-cols-2 gap-1.5">{people.map((person) => { const current = assignments.find((entry) => entry.itemId === item.id && entry.person === person)?.quantity ?? 0; return <label key={person} className="flex items-center justify-between rounded-xl bg-muted/60 px-2.5 py-2 text-xs font-bold"><span>{person}</span><input aria-label={`${item.name} untuk ${person}`} className="w-12 rounded-lg border border-border bg-background px-1.5 py-1 text-center" type="number" min={0} max={item.quantity} value={current} onChange={(event) => updateAssignment(item.id, person, Number(event.target.value))} /></label>; })}</div></div>)}
				<div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs"><div className="flex justify-between"><span>Sudah dibagi</span><strong>{currency(result.assignedTotal)}</strong></div><div className="mt-1 flex justify-between"><span>Belum dibagi</span><strong>{currency(result.unassignedTotal)}</strong></div>{result.errors.map((error) => <p key={error} className="mt-2 font-bold text-destructive">{error}</p>)}</div>
			</div>
			<div className="border-t border-border px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"><button type="button" disabled={!result.isBalanced || exporting} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-black text-primary-foreground disabled:opacity-50" onClick={() => void handleDownload()}><Download className="h-4 w-4" />{exporting ? "Menyiapkan PNG..." : "Download Split Bill PNG"}</button></div>
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
	const safeFilename = orderReference.replace(/[^a-zA-Z0-9-]/g, "-");
	const lines: ReceiptActionLine[] = items.map((item) => ({ label: `${item.quantity}x ${item.name}${item.variant ? ` (${item.variant})` : ""}`, value: currency(item.quantity * item.unitPrice) }));
	const handleReceiptDownload = async () => {
		if (exporting) return;
		setExporting(true);
		try {
			await downloadSvgAsPng(buildReceiptSvg({ title: "Bukti Pembayaran", storeName, orderReference, status, payment, total: currency(total), lines }), `struk-${safeFilename}.png`, 3);
			toast.success("Bukti bayar berhasil diunduh sebagai PNG high-res");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Bukti bayar gagal diunduh");
		} finally { setExporting(false); }
	};
	return <>
		<div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md border-t border-border/80 bg-background/95 px-2 pb-1.5 pt-1.5 shadow-[0_-6px_18px_rgba(15,23,42,0.08)] backdrop-blur-md">
			<div className={onRetryPayment ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-2 gap-1.5"}>
				<button type="button" aria-label="Split Bill — pisahkan item" className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border border-primary/20 bg-primary/5 px-1.5 text-[10px] font-black text-primary shadow-sm transition-transform active:scale-[.98]" onClick={() => setSplitOpen(true)}>
					<img src="/receipt-actions/split-bill-3d.png" alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" />
					<span className="truncate">Split Bill</span>
				</button>
				<button type="button" aria-label="Bagi Bukti Bayar — download struk" className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border border-primary/20 bg-primary/5 px-1.5 text-[10px] font-black text-primary shadow-sm transition-transform active:scale-[.98] disabled:opacity-60" onClick={() => void handleReceiptDownload()} disabled={exporting}>
					<img src="/receipt-actions/payment-proof-3d.png" alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" />
					<span className="truncate">Bukti Bayar</span>
				</button>
				{onRetryPayment ? <button type="button" aria-label="Buat link pembayaran baru" className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border border-primary/20 bg-primary/5 px-1.5 text-[10px] font-black text-primary shadow-sm transition-transform active:scale-[.98] disabled:opacity-60" onClick={() => void onRetryPayment()} disabled={retryingPayment}>
					{retryingPayment ? <Loader2 className="h-6 w-6 shrink-0 animate-spin rounded-lg bg-primary/10 p-1" /> : <Link2 className="h-6 w-6 shrink-0 rounded-lg bg-primary/10 p-1" />}
					<span className="truncate">Link Pembayaran</span>
				</button> : null}
			</div>
		</div>
		<SplitBillSheet open={splitOpen} items={items} storeName={storeName} orderReference={orderReference} total={total} onClose={() => setSplitOpen(false)} />
	</>;
}
