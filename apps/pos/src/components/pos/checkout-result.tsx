import { Button } from "@/components/ui/button";
import type { CheckoutSubmissionResult } from "@/lib/pos-checkout";
import { CheckCircle2, Clock3, CloudUpload } from "lucide-react";

export const formatCheckoutAmount = (amount: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(amount);

export function CheckoutResult({
	result,
	onPrint,
	onPrintKitchen,
}: {
	result: CheckoutSubmissionResult;
	onPrint?: () => void;
	onPrintKitchen?: () => void;
}) {
	const labels = {
		paid: "Lunas",
		pending: "Menunggu pembayaran",
		queued: "Tersimpan di antrean offline",
	};
	const StatusIcon = result.status === "paid" ? CheckCircle2 : result.status === "queued" ? CloudUpload : Clock3;
	// Only allow web invoice links; a result must never inject a script URL.
	const invoiceUrl =
		result.invoiceUrl && /^https?:\/\//i.test(result.invoiceUrl)
			? result.invoiceUrl
			: undefined;
	return (
		<section
			className="space-y-2.5 p-3 text-xs"
			aria-label="Hasil transaksi"
			aria-live="polite"
		>
			<div className={`rounded-xl border p-3 ${result.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"}`}>
				<StatusIcon className="mb-2 h-7 w-7" aria-hidden="true" />
				<p className="mb-1 text-xs font-medium">Hasil transaksi</p>
				<h2 className="text-lg font-bold">{labels[result.status]}</h2>
				<p className="mt-1 text-xl font-bold tabular-nums">{formatCheckoutAmount(result.total)}</p>
			</div>
			<p>
				{result.orderId ? (
					<>
						Nomor / ID pesanan:{" "}
						<strong className="break-all">{result.orderId}</strong>
					</>
				) : (
					"Nomor pesanan tersedia setelah sinkronisasi."
				)}
			</p>
			{result.customerName && <p>{result.customerName}</p>}
			{result.status === "queued" && (
				<p className="text-muted-foreground">
					Pesanan belum disinkronkan. Periksa pusat sinkronisasi sebelum
					mencetak struk.
				</p>
			)}
			{result.status === "pending" && (
				<p className="text-muted-foreground">
					Pembayaran belum dikonfirmasi. Selesaikan pembayaran lalu periksa
					status pesanan.
				</p>
			)}
			<dl className="space-y-1.5 rounded-xl border border-border p-2.5">
				<div className="flex justify-between gap-3">
					<dt>Total</dt>
					<dd className="font-bold">{formatCheckoutAmount(result.total)}</dd>
				</div>
				<div className="flex justify-between gap-3">
					<dt>Metode</dt>
					<dd>
						{(
							{
								tunai: "Tunai",
								cash: "Tunai",
								qris: "QRIS statis",
								qris_mayar: "QRIS dinamis",
								mayar: "QRIS dinamis",
								transfer: "Transfer bank",
							} as Record<string, string>
						)[result.paymentMethod] || result.paymentMethod}
					</dd>
				</div>
				{result.cashReceived !== undefined && (
					<div className="flex justify-between gap-3">
						<dt>Uang diterima</dt>
						<dd>{formatCheckoutAmount(result.cashReceived)}</dd>
					</div>
				)}
				{result.changeAmount !== undefined && (
					<div className="flex justify-between gap-3">
						<dt>Kembalian</dt>
						<dd>{formatCheckoutAmount(result.changeAmount)}</dd>
					</div>
				)}
			</dl>
			{invoiceUrl && (
				<a
					className="flex min-h-9 items-center justify-center rounded-lg border border-primary px-3 text-xs font-medium text-primary"
					href={invoiceUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					Buka pembayaran
				</a>
			)}
			{result.status !== "queued" && (
				<div className="grid gap-2">
					{onPrint && (
						<Button
							variant="outline"
							className="min-h-9 text-xs"
							onClick={onPrint}
						>
							{result.status === "paid"
								? "Cetak struk lunas"
								: "Cetak pesanan belum lunas"}
						</Button>
					)}
					{onPrintKitchen && (
						<Button
							variant="outline"
							className="min-h-9 text-xs"
							onClick={onPrintKitchen}
						>
							Cetak dapur
						</Button>
					)}
				</div>
			)}
		</section>
	);
}
