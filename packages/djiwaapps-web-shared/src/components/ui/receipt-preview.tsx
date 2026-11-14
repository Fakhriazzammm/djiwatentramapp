import { useMemo } from "react";

export type ReceiptPrintMode = "open_bill" | "paid" | "kitchen";

export function ReceiptPreview({
	settings,
	storeName,
	storeAddress,
	storePhone,
	logoSrc,
	mode,
}: {
	settings: {
		receiptFooter: string;
		receiptLogo: string;
		receiptHeader: string;
		receiptShowLogo: boolean;
		receiptShowAddress: boolean;
		receiptShowPhone: boolean;
		receiptShowOrderNumber: boolean;
		receiptShowCustomerName: boolean;
		receiptShowCashierName: boolean;
		receiptShowNotes: boolean;
		receiptFontSize: string;
	};
	storeName: string;
	storeAddress: string;
	storePhone: string;
	logoSrc?: string;
	mode: ReceiptPrintMode;
}) {
	const fontClass = useMemo(() => {
		if (settings.receiptFontSize === "small") return "text-[10px]";
		if (settings.receiptFontSize === "large") return "text-[12px]";
		return "text-[11px]";
	}, [settings.receiptFontSize]);

	const headerText = settings.receiptHeader || storeName || "YUMI POS";
	const paidItems = [
		{
			qty: 1,
			name: "TENTREM KOFFIE CLASSIC",
			variant: "Size Large, Less Sugar, Oat Milk",
			price: "25.000",
			total: "25.000",
		},
		{
			qty: 2,
			name: "CROISSANT BUTTER",
			variant: "Hangat",
			price: "9.000",
			total: "18.000",
			discounted: true,
			originalTotal: "36.000",
		},
	];
	const kitchenItems = [
		{ qty: 2, name: "TENTREM KOFFIE CLASSIC", variant: "Less Sugar, Oat Milk" },
		{ qty: 1, name: "CROISSANT BUTTER", variant: "Hangat" },
	];
	const infoRows = [
		settings.receiptShowOrderNumber ? ["ORDER", "ORD-POS-D-0035-310826"] : null,
		[null, "#001 / DINE IN"],
		settings.receiptShowCashierName ? ["KASIR", "AYU"] : null,
		settings.receiptShowCashierName ? ["SHIFT", "SORE"] : null,
		["WAKTU", "31/03/2026 15:09"],
		mode === "paid" ? ["BAYAR", "QRIS"] : null,
		mode === "open_bill" ? ["STATUS", "OPEN BILL"] : null,
		["TIPE", "MAKAN DI SINI"],
		["MEJA", "07"],
		settings.receiptShowCustomerName ? ["PELANGGAN", "PELANGGAN UMUM"] : null,
	].filter(Boolean) as Array<[string | null, string]>;
	const receiptKindLabel = " / DINE IN";
	const statusLabel =
		mode === "kitchen"
			? "TIKET KITCHEN"
			: mode === "open_bill"
				? "OPEN BILL"
				: "LUNAS";
	const statusTone =
		mode === "kitchen"
			? "bg-amber-100 text-amber-700"
			: mode === "open_bill"
				? "bg-orange-100 text-orange-700"
				: "bg-emerald-100 text-emerald-700";
	const promotionLabels =
		mode === "kitchen"
			? []
			: ["HAPPY HOUR - KOPI SORE", "VOUCHER - MEMBER 10%"];

	return (
		<div className="space-y-4 rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,245,0.92))] p-4 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
						Preview Struk
					</h4>
					<p className="text-muted-foreground text-xs">
						Tampilan {mode === "kitchen" ? "tiket kitchen" : "struk"} berubah real-time sesuai pengaturan saat ini.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<span className={`rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-widest ${statusTone}`}>
						{statusLabel}
					</span>
					<span className="rounded-full bg-primary/10 px-3 py-1 font-bold text-[10px] uppercase tracking-widest text-primary">
						Realtime
					</span>
				</div>
			</div>

			<div className="flex justify-center">
				<div className="w-full max-w-[330px] rounded-[30px] bg-[radial-gradient(circle_at_top,#3f3f46,#18181b_68%)] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
					<div className="rounded-[22px] bg-white px-4 py-5 shadow-inner">
						<div className={`font-mono text-zinc-900 leading-relaxed ${fontClass}`}>
							<div className="space-y-1.5 text-center">
								{settings.receiptShowLogo && logoSrc ? (
									<div className="flex justify-center pb-1">
										<img
											alt="Preview logo struk"
											className="max-h-14 max-w-[92px] object-contain grayscale contrast-125"
											src={logoSrc}
										/>
									</div>
								) : null}
								<p className="font-bold text-[13px] uppercase tracking-[0.22em]">
									{headerText}
								</p>
								{settings.receiptShowAddress && storeAddress ? (
									<p className="text-[10px] leading-snug text-zinc-600">
										{storeAddress}
									</p>
								) : null}
								{settings.receiptShowPhone && storePhone ? (
									<p className="text-[10px] text-zinc-600">{storePhone}</p>
								) : null}
							</div>

							<div className="my-3 border-zinc-300 border-t border-dashed" />

							<div className="space-y-1">
								{infoRows.map(([label, value]) => (
									<div className="flex items-start justify-between gap-3" key={value}>
										<span className="text-zinc-500">{label ?? "STRUK"}</span>
										<span className="max-w-[58%] text-right font-semibold">
											{label === null && mode !== "kitchen" ? receiptKindLabel : value}
										</span>
									</div>
								))}
							</div>

							<div className="my-3 border-zinc-300 border-t border-dashed" />

							{promotionLabels.length > 0 ? (
								<>
									<div className="space-y-1.5 text-center">
										{promotionLabels.map((label) => (
											<p className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-700" key={label}>
												{label}
											</p>
										))}
									</div>
									<div className="my-3 border-zinc-300 border-t border-dashed" />
								</>
							) : null}

							{mode === "kitchen" ? (
								<div className="space-y-2">
									<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
										Item Yang Dibuat
									</p>
									<div className="border-zinc-300 border-t border-dashed" />
									{kitchenItems.map((item) => (
										<div className="space-y-1.5" key={item.name}>
											<p className="font-bold uppercase leading-snug">
												{item.qty}x {item.name}
											</p>
											<p className="pl-3 text-[10px] leading-snug text-zinc-500">
												- {item.variant}
											</p>
										</div>
									))}
								</div>
							) : (
								<>
									<div className="space-y-1.5">
										<div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
											<span>Item</span>
											<span>Total</span>
										</div>
										<div className="border-zinc-300 border-t border-dashed" />
										{paidItems.map((item) => (
											<div className="space-y-1.5" key={item.name}>
												<div className="flex items-start justify-between gap-3">
													<span className="max-w-[72%] font-bold uppercase leading-snug">
														{item.name}
													</span>
													<span className="shrink-0 font-bold">{item.total}</span>
												</div>
										<p className="text-zinc-500">
											{item.qty} x {item.price}{item.discounted ? ` ~~${item.originalTotal}~~` : ""}
										</p>
												{item.variant ? (
													<p className="pl-3 text-[10px] leading-snug text-zinc-500">
														+ {item.variant}
													</p>
												) : null}
											</div>
										))}
									</div>

									<div className="my-3 border-zinc-300 border-t border-dashed" />

									<div className="space-y-1">
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">SUBTOTAL</span>
											<span>RP 61.000</span>
										</div>
										<div className="flex justify-between gap-3 text-zinc-700">
											<span>PROMO / HAPPY HOUR</span>
											<span>-RP 6.000</span>
										</div>
										<div className="flex justify-between gap-3 text-zinc-700">
											<span>VOUCHER / DISKON</span>
											<span>-RP 6.100</span>
										</div>
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">PAJAK</span>
											<span>RP 0</span>
										</div>
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">SERVICE CHARGE</span>
											<span>RP 3.000</span>
										</div>
										<div className="border-zinc-300 border-t border-dashed pt-1" />
										<div className="flex justify-between gap-3 font-bold text-[13px]">
											<span>TOTAL</span>
											<span>{mode === "open_bill" ? "RP 49.900" : "RP 49.900"}</span>
										</div>
									</div>
								</>
							)}

							{settings.receiptShowNotes ? (
								<>
									<div className="my-3 border-zinc-300 border-t border-dashed" />
									<div className="space-y-1">
										<p className="font-bold uppercase tracking-[0.2em]">
											Catatan
										</p>
										<p className="leading-snug text-zinc-600">
											Pastikan less sugar dan tanpa sedotan.
										</p>
									</div>
								</>
							) : null}

							<div className="my-3 border-zinc-300 border-t border-dashed" />

							<div className="space-y-1.5 text-center">
								<p className="font-bold uppercase tracking-[0.22em]">
									{settings.receiptFooter || "Terima kasih atas kunjungan Anda!"}
								</p>
								{mode === "kitchen" ? (
									<p className="font-bold text-[10px] uppercase tracking-[0.18em] text-zinc-500">
										TANPA HARGA - UNTUK PRODUKSI
									</p>
								) : null}
								<p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
									{mode === "kitchen" ? "tiket produksi 58mm" : "preview thermal 58mm"}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
