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
			className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50"
		>
			<div className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
				<div className="min-w-0 space-y-1">
					<h2 className="font-bold">Pesanan sebelumnya belum selesai</h2>
					<p className="text-sm">
						Status pesanan sebelumnya belum tampil. Jangan kirim atau bayar
						pesanan ini lagi agar tidak tercatat dua kali.
					</p>
				</div>
			</div>
			<div className="rounded-xl border border-amber-200 bg-white/60 p-3 text-sm dark:border-amber-900 dark:bg-black/10">
				<div className="flex justify-between gap-3">
					<span>Pelanggan</span>
					<strong className="truncate">{customerName || "Pelanggan"}</strong>
				</div>
				<div className="mt-1 flex justify-between gap-3">
					<span>Total</span>
					<strong className="tabular-nums">{formatCheckoutAmount(total)}</strong>
				</div>
			</div>
			<p className="text-sm font-medium">
				Gunakan pesanan awal di atas untuk melanjutkan. Pesanan yang sedang
				dibuka akan digantikan.
			</p>
			<Button
				type="button"
				variant="outline"
				className="min-h-11 w-full border-amber-400 bg-background text-amber-950 hover:bg-amber-100 dark:text-amber-50 dark:hover:bg-amber-900/50"
				disabled={busy}
				onClick={onRecover}
			>
				<RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
				{busy ? "Memeriksa pesanan…" : "Lanjutkan pesanan sebelumnya"}
			</Button>
		</section>
	);
}
