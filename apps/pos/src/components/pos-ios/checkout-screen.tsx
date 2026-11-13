import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Banknote, Check, ChevronDown, CloudUpload, Clock3, Delete, Landmark, Loader2, QrCode, RotateCcw, Search, ShoppingBag, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { CartItem } from "@/context/cart-context";
import type { CheckoutSubmissionResult } from "@/lib/pos-checkout";
import { resolvePosAssetUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";
import { AnimatedNumber, formatRp, IOS_SPRING, IOS_SPRING_SOFT, IosChip, IosSegmented } from "./ios-kit";

type Step = "order" | "payment" | "result";
const STEP_INDEX: Record<Step, number> = { order: 0, payment: 1, result: 2 };
const TITLES: Record<Step, string> = { order: "Struk pesanan", payment: "Bayar", result: "Selesai" };
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"] as const;
const METHOD_LABEL: Record<string, string> = { tunai: "Tunai", cash: "Tunai", qris: "QRIS statis", qris_mayar: "QRIS dinamis", mayar: "QRIS dinamis", transfer: "Transfer bank" };

export interface CheckoutScreenProps {
	step: Step;
	onBack: () => void;
	onClose?: () => void;
	busy: boolean;
	submitError: string | null;
	// pemulihan pembayaran
	pendingPayment?: { customerName: string; total: number };
	onRecover: () => void;
	// pesanan
	items: CartItem[];
	totalItems: number;
	orderTypes: Array<{ id: string; label: string; requiresTableNumber?: boolean }>;
	platforms: Array<{ id: string; name: string; commissionRate?: number }>;
	customerInfo: any;
	updateCustomerInfo: (patch: Record<string, unknown>) => void;
	onClear: () => void;
	onQty: (item: CartItem, delta: number) => void;
	onPrice: (item: CartItem, price: number) => void;
	onSearchCustomer: () => void;
	// total
	total: number;
	grossAmount: number;
	promoDiscountAmount: number;
	voucherDiscountAmount: number;
	totalAmount: number;
	tax: { taxRate: number; taxAmount: number; serviceChargeAmount: number; serviceChargeRate: number; roundingAdjustment: number };
	taxEnabled: boolean;
	platformTotal: number;
	commissionAmount: number;
	netRevenue: number;
	// pembayaran
	paymentOptions: Array<{ id: string; label: string }>;
	draft: any;
	patch: (update: Record<string, unknown>) => void;
	change: number;
	validation: string | null;
	paymentUnavailable: boolean;
	validDiscounts: any[];
	appliedVoucher: any;
	applyVoucher: (voucher: any) => void;
	assignments: any[];
	staffByGroup: Record<string, string[]>;
	// hasil
	result: CheckoutSubmissionResult | null;
	onPrint?: () => void;
	onPrintKitchen?: () => void;
	onNewOrder: () => void;
	// aksi
	isShiftOpen: boolean;
	canPrintOpenBill: boolean;
	onPrintOpenBill?: () => void;
	canConfirm: boolean;
	onNext: () => void;
	onSaveBill: () => void;
	onPay: () => void;
}

function Thumb({ item }: { item: CartItem }) {
	const src = resolvePosAssetUrl(item.image);
	const [failed, setFailed] = useState(!src);
	useEffect(() => setFailed(!src), [src]);
	const initials = item.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
	return src && !failed ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-[46px] w-[46px] shrink-0 rounded-[13px] bg-muted object-cover" /> : <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px] bg-muted text-[14px] font-extrabold text-muted-foreground">{initials || <ShoppingBag className="h-5 w-5" />}</div>;
}

const inputClass = "h-11 w-full rounded-[13px] bg-muted px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]";

function Fold({ title, hint, children, defaultOpen = false }: { title: string; hint?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="mt-3">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex h-12 w-full items-center justify-between rounded-2xl bg-muted px-4 text-[14px] font-bold">
				<span>{title}</span>
				<span className="flex items-center gap-2">{hint}<ChevronDown className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")} aria-hidden="true" /></span>
			</button>
			<AnimatePresence initial={false}>
				{open ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={IOS_SPRING_SOFT} className="overflow-hidden"><div className="px-0.5 pt-2.5">{children}</div></motion.div> : null}
			</AnimatePresence>
		</div>
	);
}

function Totals({ p }: { p: CheckoutScreenProps }) {
	return (
		<div className="mt-3 rounded-[20px] bg-muted/70 px-4 py-3">
			<div className="flex items-baseline justify-between border-b border-border/70 pb-2">
				<span className="text-[15px] font-extrabold">Total</span>
				<AnimatedNumber value={p.total} className="text-[26px] font-extrabold tracking-tight" />
			</div>
			<dl className="space-y-1.5 pt-2 text-[13.5px] text-muted-foreground">
				<div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatRp(p.grossAmount)}</dd></div>
				{p.promoDiscountAmount > 0 ? <div className="flex justify-between"><dt>Promo</dt><dd className="tabular-nums text-emerald-600">−{formatRp(p.promoDiscountAmount)}</dd></div> : null}
				{p.voucherDiscountAmount > 0 ? <div className="flex justify-between"><dt>Voucher</dt><dd className="tabular-nums text-emerald-600">−{formatRp(p.voucherDiscountAmount)}</dd></div> : null}
				{p.taxEnabled ? (
					<>
						<div className="flex justify-between"><dt>Dasar pajak</dt><dd className="tabular-nums">{formatRp(Math.max(0, p.totalAmount - p.voucherDiscountAmount))}</dd></div>
						<div className="flex justify-between"><dt>PBJT ({p.tax.taxRate}%)</dt><dd className="tabular-nums">{formatRp(p.tax.taxAmount)}</dd></div>
					</>
				) : <p className="text-[11px] leading-snug">Harga menu sudah termasuk PBJT atas makanan dan/atau minuman sesuai ketentuan di Kota Tasikmalaya.</p>}
				{p.tax.serviceChargeAmount > 0 ? <div className="flex justify-between"><dt>Service charge ({p.tax.serviceChargeRate}%)</dt><dd className="tabular-nums">{formatRp(p.tax.serviceChargeAmount)}</dd></div> : null}
				{p.tax.roundingAdjustment !== 0 ? <div className="flex justify-between"><dt>Pembulatan</dt><dd className="tabular-nums">{formatRp(p.tax.roundingAdjustment)}</dd></div> : null}
				{p.customerInfo.orderType === "online" ? (
					<>
						<div className="flex justify-between"><dt>Total platform</dt><dd className="tabular-nums">{formatRp(p.platformTotal)}</dd></div>
						<div className="flex justify-between"><dt>Komisi</dt><dd className="tabular-nums">{formatRp(p.commissionAmount)}</dd></div>
						<div className="flex justify-between"><dt>Pendapatan bersih</dt><dd className="tabular-nums">{formatRp(p.netRevenue)}</dd></div>
					</>
				) : null}
			</dl>
		</div>
	);
}

function StepOrder({ p }: { p: CheckoutScreenProps }) {
	const online = p.customerInfo.orderType === "online";
	const selectedType = p.orderTypes.find((type) => type.id === p.customerInfo.orderType);
	const setType = (id: string) => p.updateCustomerInfo({ orderType: id, ...(id !== "online" ? { platform: undefined, platformCommission: undefined } : {}) });
	return (
		<div>
			<div className="mb-2.5 flex items-baseline justify-between">
				<h2 className="text-[22px] font-extrabold tracking-tight">Pesanan <span className="text-muted-foreground">({p.totalItems})</span></h2>
				<button type="button" disabled={!p.items.length || p.busy} onClick={p.onClear} className="text-[13px] font-bold text-muted-foreground disabled:opacity-40">Kosongkan</button>
			</div>
			{p.orderTypes.length <= 3 ? (
				<IosSegmented id="checkout-type" value={p.customerInfo.orderType} onChange={setType} options={p.orderTypes.map((type) => ({ value: type.id, label: type.label }))} />
			) : (
				<div className="flex flex-wrap gap-2">{p.orderTypes.map((type) => <IosChip key={type.id} active={p.customerInfo.orderType === type.id} onClick={() => setType(type.id)}>{type.label}</IosChip>)}</div>
			)}
			<AnimatePresence initial={false}>
				{online ? (
					<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
						<p className="px-1 pb-1.5 pt-3 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">PLATFORM PESANAN</p>
						<div className="flex flex-wrap gap-2">{p.platforms.map((platform) => <IosChip key={platform.id} active={p.customerInfo.platform === platform.id} onClick={() => p.updateCustomerInfo({ platform: platform.id, platformCommission: platform.commissionRate })}>{platform.name}</IosChip>)}</div>
					</motion.div>
				) : null}
			</AnimatePresence>

			<div className="mt-3 rounded-[20px] border border-border bg-card px-3.5">
				{p.items.length === 0 ? <p className="py-8 text-center text-[14px] text-muted-foreground">Belum ada menu. Tambahkan menu untuk mulai memesan.</p> : null}
				<AnimatePresence initial={false}>
					{p.items.map((item) => (
						<motion.div key={`${item.productId}-${item.variant || "default"}`} layout exit={{ opacity: 0, height: 0 }} transition={IOS_SPRING_SOFT} className="overflow-hidden border-b border-border/70 last:border-b-0">
							<div className="flex items-center gap-3 py-2.5">
								<Thumb item={item} />
								<div className="min-w-0 flex-1">
									<p className="truncate text-[14px] font-bold">{item.name}</p>
									{item.variant ? <p className="truncate text-[12px] text-muted-foreground">{item.variant}</p> : <p className="text-[12px] text-muted-foreground">{formatRp(item.price)} / porsi</p>}
								</div>
								<div className="shrink-0 text-right">
									<p className="mb-1 text-[14px] font-extrabold tabular-nums">{formatRp(item.price * item.quantity)}</p>
									<div className="inline-flex items-center rounded-full bg-muted">
										<button type="button" disabled={p.busy} aria-label={`Kurangi ${item.name}${item.variant ? ` ${item.variant}` : ""}`} onClick={() => p.onQty(item, -1)} className="flex h-9 w-9 items-center justify-center text-primary"><span className="text-[19px] font-bold leading-none">−</span></button>
										<motion.b key={item.quantity} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={IOS_SPRING} className="min-w-5 text-center text-[14px] tabular-nums" aria-label="Jumlah">{item.quantity}</motion.b>
										<button type="button" disabled={p.busy} aria-label={`Tambah ${item.name}${item.variant ? ` ${item.variant}` : ""}`} onClick={() => p.onQty(item, 1)} className="flex h-9 w-9 items-center justify-center text-primary"><span className="text-[19px] font-bold leading-none">+</span></button>
									</div>
								</div>
							</div>
							{online ? (
								<label className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-muted/70 px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground">
									Harga platform / item
									<input type="number" inputMode="numeric" min={0} value={item.platformPrice ?? item.price} onChange={(event) => { const price = Number(event.target.value); if (Number.isFinite(price) && price >= 0) p.onPrice(item, price); }} className="h-9 w-28 rounded-lg bg-background px-2 text-right text-[14px] font-bold text-foreground outline-none" />
								</label>
							) : null}
						</motion.div>
					))}
				</AnimatePresence>
			</div>

			<Fold title="Detail & promo (opsional)">
				<div className="space-y-2">
					<div className="flex gap-2">
						<input value={p.customerInfo.name} onChange={(event) => p.updateCustomerInfo({ name: event.target.value })} placeholder="Nama pelanggan" autoComplete="name" aria-label="Nama pelanggan" className={inputClass} />
						<motion.button type="button" whileTap={{ scale: 0.92 }} onClick={p.onSearchCustomer} aria-label="Cari pelanggan" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-muted"><Search className="h-[18px] w-[18px]" /></motion.button>
					</div>
					{selectedType?.requiresTableNumber ? <input value={p.customerInfo.tableNumber} onChange={(event) => p.updateCustomerInfo({ tableNumber: event.target.value })} placeholder="Nomor meja (opsional)" aria-label="Nomor meja" className={inputClass} /> : null}
					<input value={p.customerInfo.notes} onChange={(event) => p.updateCustomerInfo({ notes: event.target.value })} placeholder="Catatan pesanan (opsional)" aria-label="Catatan pesanan" className={inputClass} />
					<label className="flex min-h-11 items-center gap-3 rounded-[13px] bg-muted px-3.5 text-[14px] font-semibold">
						<input type="checkbox" className="h-5 w-5 accent-primary" checked={Boolean(p.customerInfo.isFreeRefill)} onChange={(event) => p.updateCustomerInfo({ isFreeRefill: event.target.checked })} />
						Free refill minuman (sesuai promo aktif)
					</label>
				</div>
			</Fold>
			<Totals p={p} />
		</div>
	);
}

function MethodIcon({ id }: { id: string }) {
	const Icon = id === "tunai" || id === "cash" ? Banknote : id.includes("qris") ? QrCode : Landmark;
	return <Icon className="h-[22px] w-[22px]" aria-hidden="true" />;
}

function StepPayment({ p }: { p: CheckoutScreenProps }) {
	const method = p.draft.paymentMethod;
	const received = typeof p.draft.cashReceived === "number" ? p.draft.cashReceived : 0;
	const press = (key: (typeof KEYS)[number]) => {
		const current = p.draft.cashReceived === "" ? "" : String(p.draft.cashReceived);
		const next = key === "del" ? current.slice(0, -1) : `${current}${key}`.replace(/^0+(?=\d)/, "").slice(0, 9);
		p.patch({ cashReceived: next === "" ? "" : Number(next) });
	};
	return (
		<div>
			<p className="text-center text-[12px] font-bold tracking-[0.08em] text-muted-foreground">TOTAL BAYAR</p>
			<AnimatedNumber value={p.total} className="mb-3 block text-center text-[40px] font-extrabold leading-tight tracking-tight" />
			{p.paymentOptions.length === 0 ? <p role="alert" className="mb-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-700">Tidak ada metode pembayaran aktif. Hubungi admin.</p> : null}
			<div className="mb-3 flex gap-2" role="group" aria-label="Metode pembayaran">
				{p.paymentOptions.map((option) => {
					const on = method === option.id;
					return (
						<motion.button key={option.id} type="button" whileTap={{ scale: 0.94 }} animate={{ y: on ? -2 : 0 }} transition={IOS_SPRING} aria-pressed={on} onClick={() => p.patch({ paymentMethod: option.id })} className={cn("flex h-[66px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 text-[12.5px] font-bold", on ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-muted")}>
							<MethodIcon id={option.id} />
							<span className="truncate">{option.label}</span>
						</motion.button>
					);
				})}
			</div>

			<AnimatePresence mode="wait" initial={false}>
				<motion.div key={method} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
					{method === "tunai" || method === "cash" ? (
						<>
							<motion.p key={received} initial={{ scale: 1.06 }} animate={{ scale: 1 }} transition={IOS_SPRING} className="text-center text-[34px] font-extrabold tracking-tight tabular-nums">{formatRp(received)}</motion.p>
							<p className={cn("min-h-5 text-center text-[14px] font-bold", received >= p.total && received > 0 ? "text-emerald-600" : "text-muted-foreground")} aria-live="polite">{received >= p.total && received > 0 ? `Kembalian ${formatRp(p.change)}` : "Uang diterima (wajib)"}</p>
							<div className="my-2 flex justify-center gap-2">
								<IosChip onClick={() => p.patch({ cashReceived: p.total })} className="h-9 bg-primary/10 text-primary">Uang pas</IosChip>
								{[50000, 100000].filter((v) => v >= p.total).map((amount) => <IosChip key={amount} onClick={() => p.patch({ cashReceived: amount })}>{formatRp(amount)}</IosChip>)}
							</div>
							<div className="grid grid-cols-3 gap-2">
								{KEYS.map((key) => <motion.button key={key} type="button" whileTap={{ scale: 0.92 }} transition={IOS_SPRING} onClick={() => press(key)} aria-label={key === "del" ? "Hapus angka" : key} className="flex h-[48px] items-center justify-center rounded-2xl bg-muted text-[21px] font-semibold">{key === "del" ? <Delete className="h-5 w-5" /> : key}</motion.button>)}
							</div>
						</>
					) : method === "qris_mayar" ? (
						<div className="space-y-2 rounded-2xl bg-muted/60 p-3.5">
							<p className="text-[13px]">QRIS dinamis memerlukan koneksi internet. Nama, email, dan telepon wajib diisi sebelum membuat pembayaran.</p>
							<input value={p.customerInfo.name} onChange={(event) => p.updateCustomerInfo({ name: event.target.value })} placeholder="Nama pelanggan (wajib)" autoComplete="name" aria-label="Nama pelanggan" className={cn(inputClass, "bg-background")} />
							<input type="email" inputMode="email" value={p.customerInfo.email || ""} onChange={(event) => p.updateCustomerInfo({ email: event.target.value })} placeholder="Email (wajib)" autoComplete="email" aria-label="Email" className={cn(inputClass, "bg-background")} />
							<input type="tel" inputMode="tel" value={p.customerInfo.phone || ""} onChange={(event) => p.updateCustomerInfo({ phone: event.target.value })} placeholder="Telepon (wajib)" autoComplete="tel" aria-label="Telepon" className={cn(inputClass, "bg-background")} />
						</div>
					) : method === "qris" ? (
						<p className="rounded-2xl bg-muted/60 p-4 text-center text-[14px] leading-relaxed">Minta pelanggan scan QRIS toko. Pastikan pembayaran QRIS statis sudah diterima sebelum konfirmasi.</p>
					) : method === "transfer" ? (
						<p className="rounded-2xl bg-muted/60 p-4 text-center text-[14px] leading-relaxed">Pastikan transfer bank sudah diterima sebelum konfirmasi.</p>
					) : null}
				</motion.div>
			</AnimatePresence>

			<Fold title="Diskon & opsi pesanan" hint={p.appliedVoucher ? <span className="max-w-[120px] truncate text-[12px] font-semibold text-primary">{p.appliedVoucher.name}</span> : null}>
				<div className="space-y-3">
					{p.validDiscounts.length > 0 || p.appliedVoucher ? (
						<div>
							<p className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">VOUCHER / DISKON</p>
							<div className="flex flex-wrap gap-2">
								<IosChip active={!p.appliedVoucher} onClick={() => p.applyVoucher(null)}>Tanpa voucher</IosChip>
								{p.appliedVoucher && !p.validDiscounts.some((d) => d._id === p.appliedVoucher._id) ? <IosChip active>{p.appliedVoucher.name}</IosChip> : null}
								{p.validDiscounts.map((d) => <IosChip key={d._id} active={p.appliedVoucher?._id === d._id} onClick={() => p.applyVoucher({ _id: d._id, name: d.name, type: d.type, value: d.value, targetType: d.targetType, targetIds: d.targetIds })}>{d.name}</IosChip>)}
							</div>
						</div>
					) : null}
					<label className="flex min-h-11 items-center gap-3 rounded-[13px] bg-muted px-3.5 text-[14px] font-semibold"><input type="checkbox" className="h-5 w-5 accent-primary" checked={Boolean(p.draft.autoComplete)} onChange={(event) => p.patch({ autoComplete: event.target.checked })} />Otomatis selesaikan pesanan</label>
					<details className="rounded-[13px] bg-muted px-3.5 py-1">
						<summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold">Atur tim (opsional)</summary>
						<p className="mb-2 text-[12px] text-muted-foreground">Pesanan dapat dikirim tanpa penugasan khusus.</p>
						{p.assignments.map((group) => (
							<div key={group.groupType} className="mb-3 space-y-1.5">
								<label className="block text-[12.5px] font-bold"><span>{group.groupType === "barista" ? "Barista" : "Dapur"}</span>
									<select className="mt-1 h-10 w-full rounded-xl bg-background px-2.5 text-[14px] font-normal" value={group.assignedTo} onChange={(event) => p.patch({ assignments: p.assignments.map((g) => (g.groupType === group.groupType ? { ...g, assignedTo: event.target.value, items: g.items.map((i: any) => ({ ...i, assignedTo: event.target.value })) } : g)) })}>
										<option value="">Tanpa penugasan khusus</option>
										{[...new Set([...(p.staffByGroup[group.groupType] ?? []), group.assignedTo].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}
									</select>
								</label>
								{group.items.map((item: any, index: number) => (
									<label key={`${item.productId}-${item.variant}`} className="block text-[12.5px] font-semibold"><span>{item.quantity}× {item.productName}{item.variant ? ` (${item.variant})` : ""}</span>
										<select className="mt-1 h-10 w-full rounded-xl bg-background px-2.5 text-[14px] font-normal" value={item.assignedTo} onChange={(event) => p.patch({ assignments: p.assignments.map((g) => (g.groupType === group.groupType ? { ...g, items: g.items.map((i: any, n: number) => (n === index ? { ...i, assignedTo: event.target.value } : i)) } : g)) })}>
											<option value="">Tanpa penugasan khusus</option>
											{[...new Set([...(p.staffByGroup[group.groupType] ?? []), item.assignedTo].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}
										</select>
									</label>
								))}
							</div>
						))}
					</details>
				</div>
			</Fold>
			<Totals p={p} />
		</div>
	);
}

function StepResult({ p }: { p: CheckoutScreenProps }) {
	const r = p.result!;
	const paid = r.status === "paid";
	const invoiceUrl = r.invoiceUrl && /^https?:\/\//i.test(r.invoiceUrl) ? r.invoiceUrl : undefined;
	const title = paid ? "Pembayaran berhasil" : r.status === "queued" ? "Tersimpan di antrean offline" : "Menunggu pembayaran";
	const Icon = paid ? Check : r.status === "queued" ? CloudUpload : Clock3;
	return (
		<div className="flex flex-col items-center pt-2 text-center" role="status" aria-live="polite">
			<motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...IOS_SPRING, delay: 0.05 }} className={cn("flex h-[88px] w-[88px] items-center justify-center rounded-full text-white shadow-lg", paid ? "bg-emerald-500 shadow-emerald-500/30" : "bg-amber-500 shadow-amber-500/30")}>
				<Icon className="h-11 w-11" strokeWidth={3} aria-hidden="true" />
			</motion.div>
			<motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-3 text-[22px] font-extrabold tracking-tight">{title}</motion.h2>
			<motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mt-1 text-[32px] font-extrabold tracking-tight tabular-nums">{formatRp(r.total)}</motion.p>
			{r.customerName ? <p className="text-[13px] text-muted-foreground">{r.customerName}</p> : null}
			{r.status === "queued" ? <p className="mt-2 text-[13px] text-muted-foreground">Pesanan belum disinkronkan. Periksa pusat sinkronisasi sebelum mencetak struk.</p> : null}
			{r.status === "pending" ? <p className="mt-2 text-[13px] text-muted-foreground">Pembayaran belum dikonfirmasi. Selesaikan pembayaran lalu periksa status pesanan.</p> : null}
			<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...IOS_SPRING_SOFT, delay: 0.35 }} className="relative mt-4 w-full rounded-[20px] border border-border bg-card p-4 text-left">
				<dl className="space-y-1.5 text-[14px]">
					<div className="flex justify-between"><dt className="text-muted-foreground">Total</dt><dd className="font-extrabold tabular-nums">{formatRp(r.total)}</dd></div>
					<div className="flex justify-between"><dt className="text-muted-foreground">Metode</dt><dd className="font-semibold">{METHOD_LABEL[r.paymentMethod] || r.paymentMethod}</dd></div>
					{r.cashReceived !== undefined ? <div className="flex justify-between"><dt className="text-muted-foreground">Uang diterima</dt><dd className="tabular-nums">{formatRp(r.cashReceived)}</dd></div> : null}
					{r.changeAmount !== undefined ? <div className="flex justify-between"><dt className="text-muted-foreground">Kembalian</dt><dd className="font-bold tabular-nums">{formatRp(r.changeAmount)}</dd></div> : null}
					<div className="flex justify-between gap-3 border-t border-dashed border-border pt-2"><dt className="shrink-0 text-muted-foreground">No. pesanan</dt><dd className="break-all text-right text-[12.5px] font-semibold">{r.orderId ?? "Tersedia setelah sinkronisasi"}</dd></div>
				</dl>
			</motion.div>
			{invoiceUrl ? <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex h-11 w-full items-center justify-center rounded-2xl border border-primary text-[14px] font-bold text-primary">Buka pembayaran</a> : null}
			{r.status !== "queued" && (p.onPrint || p.onPrintKitchen) ? (
				<div className="mt-3 flex w-full gap-2">
					{p.onPrint ? <button type="button" onClick={p.onPrint} className="h-12 flex-1 rounded-2xl bg-muted text-[14px] font-bold">{paid ? "Cetak struk lunas" : "Cetak pesanan"}</button> : null}
					{p.onPrintKitchen ? <button type="button" onClick={p.onPrintKitchen} className="h-12 flex-1 rounded-2xl bg-muted text-[14px] font-bold">Cetak dapur</button> : null}
				</div>
			) : null}
		</div>
	);
}

/** Checkout 3 langkah gaya iOS: struk pesanan → bayar (total raksasa + numpad) → tiket hasil. Semua aturan transaksi ada di pemanggil. */
export function CheckoutScreen(p: CheckoutScreenProps) {
	const idx = STEP_INDEX[p.step];
	const hasPending = Boolean(p.pendingPayment);
	return (
		<div className="relative flex h-full min-h-0 flex-col bg-background text-foreground">
			<div className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-1.5">
				<motion.button type="button" whileTap={{ scale: 0.9 }} onClick={p.onBack} disabled={p.busy} aria-label="Kembali ke pesanan" className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-opacity disabled:opacity-40", p.step === "payment" ? "opacity-100" : "pointer-events-none opacity-0")} tabIndex={p.step === "payment" ? 0 : -1}><ArrowLeft className="h-[18px] w-[18px]" /></motion.button>
				<AnimatePresence mode="wait" initial={false}><motion.h1 key={p.step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="flex-1 text-[17px] font-extrabold">{TITLES[p.step]}</motion.h1></AnimatePresence>
				<div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={idx + 1} aria-label={`Langkah ${idx + 1} dari 3`}>
					{[0, 1, 2].map((n) => <motion.i key={n} layout animate={{ width: n === idx ? 22 : 7, backgroundColor: n === idx ? "var(--primary)" : n < idx ? "#16a34a" : "var(--border)" }} transition={IOS_SPRING} className="block h-[7px] rounded-full" />)}
				</div>
				{p.onClose ? <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={p.onClose} disabled={p.busy} aria-label="Tutup checkout" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted disabled:opacity-40"><X className="h-[18px] w-[18px]" /></motion.button> : null}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
				{hasPending && p.pendingPayment ? (
					<section role="status" aria-live="polite" className="mb-3 flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-amber-950">
						{p.busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
						<div className="min-w-0 flex-1"><p className="text-[13px] font-bold">{p.busy ? "Mengecek status pesanan…" : "Status pesanan belum terkonfirmasi"}</p>{!p.busy ? <p className="truncate text-[12px] opacity-75">{p.pendingPayment.customerName || "Pelanggan"} · {formatRp(p.pendingPayment.total)}</p> : null}</div>
						<button type="button" disabled={p.busy} onClick={p.onRecover} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-background px-3 text-[13px] font-bold disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" />Cek lagi</button>
					</section>
				) : null}
				<fieldset disabled={p.busy || hasPending} className="min-w-0 disabled:opacity-60">
					<AnimatePresence mode="wait" initial={false}>
						<motion.div key={p.step} initial={{ opacity: 0, x: p.step === "order" ? -24 : 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: p.step === "order" ? 24 : -24 }} transition={{ duration: 0.2 }}>
							{p.step === "result" && p.result ? <StepResult p={p} /> : p.step === "payment" ? <StepPayment p={p} /> : <StepOrder p={p} />}
						</motion.div>
					</AnimatePresence>
				</fieldset>
			</div>

			<div className="shrink-0 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
				{p.submitError ? <p role="alert" className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700">{p.submitError}</p> : null}
				{p.step === "result" ? (
					<motion.button type="button" whileTap={{ scale: 0.97 }} onClick={p.onNewOrder} className="h-[52px] w-full rounded-2xl bg-primary text-[16px] font-extrabold text-primary-foreground">Pesanan baru</motion.button>
				) : hasPending ? null : p.step === "payment" ? (
					<>
						<p id="checkout-payment-help" aria-live="polite" className={cn("mb-1.5 min-h-4 text-center text-[12px]", p.validation || p.paymentUnavailable ? "text-rose-600" : "text-muted-foreground")}>{p.paymentUnavailable ? "Pilih metode pembayaran yang tersedia." : p.validation || "Periksa nominal sebelum mengonfirmasi pembayaran."}</p>
						<motion.button type="button" whileTap={{ scale: p.canConfirm ? 0.97 : 1 }} disabled={!p.canConfirm} onClick={p.onPay} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[16px] font-extrabold text-white transition-colors disabled:bg-muted disabled:text-muted-foreground">
							{p.busy ? <><Loader2 className="h-5 w-5 animate-spin" />Memproses…</> : p.draft.paymentMethod === "qris_mayar" ? `Buat pembayaran · ${formatRp(p.total)}` : `Konfirmasi pembayaran · ${formatRp(p.total)}`}
						</motion.button>
					</>
				) : (
					<>
						{!p.isShiftOpen ? <p className="mb-1.5 text-center text-[12.5px] font-semibold text-rose-600">Buka shift terlebih dahulu di menu Shift untuk menyimpan atau membayar.</p> : null}
						<motion.button type="button" whileTap={{ scale: 0.97 }} disabled={!p.items.length || p.busy} onClick={p.onNext} className="h-[52px] w-full rounded-2xl bg-primary text-[16px] font-extrabold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">Bayar · {formatRp(p.total)}</motion.button>
						<div className="mt-2 flex gap-2">
							<button type="button" disabled={!p.items.length || p.busy || !p.isShiftOpen} onClick={p.onSaveBill} className="h-11 flex-1 rounded-[14px] bg-primary/10 text-[14px] font-bold text-primary disabled:opacity-50">{p.busy ? "Menyimpan…" : "Simpan"}</button>
							{p.canPrintOpenBill && p.onPrintOpenBill ? <button type="button" disabled={!p.items.length || p.busy} onClick={p.onPrintOpenBill} className="h-11 flex-1 rounded-[14px] bg-muted text-[14px] font-bold disabled:opacity-50">Cetak open bill</button> : null}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
