import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
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
			className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-50"
		>
			{busy ? (
				<LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
			) : (
				<AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
			)}
			<div className="min-w-0 flex-1">
				<p className="font-semibold">{busy ? "Mengecek status pesanan…" : "Status pesanan belum terkonfirmasi"}</p>
				{!busy && (
					<p className="mt-0.5 truncate text-[11px] text-amber-900/75 dark:text-amber-100/75">
						{customerName || "Pelanggan"} · {formatCheckoutAmount(total)}
					</p>
				)}
			</div>
			<Button
				type="button"
				variant="outline"
				className="min-h-10 shrink-0 rounded-xl border-amber-300 bg-background px-3 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:text-amber-50 dark:hover:bg-amber-900/50"
				disabled={busy}
				onClick={onRecover}
			>
				<RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
				Cek lagi
			</Button>
		</section>
	);
}
