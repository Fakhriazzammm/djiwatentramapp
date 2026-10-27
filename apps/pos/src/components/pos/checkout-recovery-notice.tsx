import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCheckoutAmount } from "./checkout-result";

export function CheckoutRecoveryNotice({
	customerName,
	total,
	busy,
	onRecover,
}: {
	customerName: string;
	total: number;
	busy: boolean;
	onRecover: () => void;
}) {
	return (
		<section
			role="status"
			aria-live="polite"
			className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
		>
			<div className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
				<div className="min-w-0 space-y-0.5">
					<h2 className="text-xs font-bold">Pesanan sebelumnya belum pasti</h2>
					<p className="text-[11px] leading-snug">
						Server mungkin sudah menerima pesanan ini, tetapi hasilnya belum
						sempat kembali ke kasir.
					</p>
				</div>
			</div>
			<div className="rounded-lg border border-amber-200 bg-white/60 p-2 text-[11px] dark:border-amber-900 dark:bg-black/10">
				<div className="flex justify-between gap-3">
					<span>Pelanggan</span>
					<strong className="truncate">{customerName || "Pelanggan"}</strong>
				</div>
				<div className="mt-1 flex justify-between gap-3">
					<span>Total</span>
					<strong className="tabular-nums">{formatCheckoutAmount(total)}</strong>
				</div>
			</div>
			<p className="text-[11px] font-medium leading-snug">
				Pemulihan memakai data pesanan awal. Perubahan checkout ini tidak digunakan.
				Jangan membuat pesanan pengganti agar tidak terjadi transaksi ganda.
			</p>
			<Button
				type="button"
				variant="outline"
				className="min-h-9 w-full rounded-lg border-amber-400 bg-background text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:text-amber-50 dark:hover:bg-amber-900/50"
				disabled={busy}
				onClick={onRecover}
			>
				<RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
				{busy ? "Memulihkan pesanan…" : "Pulihkan pesanan awal"}
			</Button>
		</section>
	);
}
