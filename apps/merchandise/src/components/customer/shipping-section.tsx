import { Check, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartItem, ShippingProvider } from "./types";
import { currency } from "./types";

export interface ShippingSectionProps {
	cart: CartItem[];
	shippingProvider: ShippingProvider | null;
	setShippingProvider: (value: ShippingProvider) => void;
	onBackToCheckout: () => void;
	onContinueToPayment: () => void;
	isSubmitting: boolean;
	productSubtotal: number;
	total: number;
	checkoutError?: string | null;
}

const PROVIDERS: Array<{ key: ShippingProvider; label: string; estimate: string }> = [
	{ key: "anteraja", label: "Anteraja", estimate: "Tarif dan layanan mengikuti pengaturan Mayar" },
	{ key: "sicepat", label: "SiCepat Express", estimate: "Tarif dan layanan mengikuti pengaturan Mayar" },
];

export function ShippingSection({
	cart,
	shippingProvider,
	setShippingProvider,
	onBackToCheckout,
	onContinueToPayment,
	isSubmitting,
	productSubtotal,
	total,
	checkoutError,
}: ShippingSectionProps) {
	return (
		<section className="space-y-2 px-2 py-2">
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Truck className="h-4 w-4" aria-hidden="true" /></div>
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">Langkah 3 dari 5 · Pengiriman</p>
						<h2 className="text-sm font-black">Pilih kurir pengiriman</h2>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Kurir yang tampil mengikuti kurir aktif pada pengaturan Mayar.</p>
					</div>
				</div>

				<div className="mt-3 space-y-2" role="radiogroup" aria-label="Kurir pengiriman">
					{PROVIDERS.map((provider) => {
						const selected = shippingProvider === provider.key;
						return (
							<button
								key={provider.key}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => setShippingProvider(provider.key)}
								className={cn("flex min-h-[4.25rem] w-full items-center justify-between rounded-2xl border px-3 text-left transition-all", selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40")}
							>
								<span className="flex min-w-0 items-center gap-3">
									<span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Truck className="h-4 w-4" aria-hidden="true" /></span>
									<span className="min-w-0"><span className="block text-xs font-black">{provider.label}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{provider.estimate}</span></span>
								</span>
								<span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/25")}>{selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}</span>
							</button>
						);
					})}
				</div>

				<div className="mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-3 text-[10px] leading-relaxed text-muted-foreground">
					Ongkir dan layanan akan mengikuti konfigurasi shipping Mayar saat pesanan diproses. Pilihan kurir ini ikut disimpan pada order dan invoice.
				</div>
			</div>

			{checkoutError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-red-800">{checkoutError}</div> : null}
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<div className="space-y-1.5 text-xs">
					<div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal merchandise</span><span className="font-black">{currency(productSubtotal)}</span></div>
					<div className="flex items-center justify-between border-t border-border pt-2"><span className="font-black">Total sementara</span><span className="text-sm font-black text-primary">{currency(total)}</span></div>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<button type="button" onClick={onBackToCheckout} className="min-h-11 rounded-[14px] border border-border bg-background px-3 py-2.5 text-xs font-black">Kembali</button>
					<button type="button" onClick={onContinueToPayment} disabled={!shippingProvider || isSubmitting} className="min-h-11 rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Memproses..." : "Lanjut ke pembayaran"}</button>
				</div>
			</div>
		</section>
	);
}
