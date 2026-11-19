import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { currency } from "@/components/customer/types";
import { groupDigits, operatorOf, payMessage, postpaidCatalog, postpaidInquiry, postpaidPay, PPOB_SERVICES, ppobCatalog, ppobPurchase, productName, type PostpaidInquiry, type PostpaidProduct, type PpobProduct } from "@/lib/pay-bridge";
import { ErrorNote, Field, inputCls, PaySheet, PinStep, PrimaryButton, Result, Step } from "./pay-ui";

const TABS = [...PPOB_SERVICES.map((s) => ({ key: s.key, label: s.tab })), { key: "bill-pln", label: "Tagihan PLN" }, { key: "bill-pdam", label: "PDAM" }];
type Stage = "pick" | "pin" | "done";
type Outcome = { kind: "success" | "pending" | "failed"; title: string; detail: string; serial?: string | null };

export function PpobFlow({ open, balance, onClose, onTopup, onDone }: { open: boolean; balance: number; onClose: () => void; onTopup: () => void; onDone: () => void }) {
	const [tab, setTab] = useState("pulsa");
	const [stage, setStage] = useState<Stage>("pick");
	const [number, setNumber] = useState("");
	const [catalog, setCatalog] = useState<PpobProduct[] | null>(null);
	const [catalogErr, setCatalogErr] = useState<string | null>(null);
	const [operator, setOperator] = useState("all");
	const [picked, setPicked] = useState<PpobProduct | null>(null);
	const [bills, setBills] = useState<PostpaidProduct[]>([]);
	const [billCode, setBillCode] = useState("");
	const [inquiry, setInquiry] = useState<PostpaidInquiry | null>(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [outcome, setOutcome] = useState<Outcome | null>(null);

	const isBill = tab.startsWith("bill-");
	const service = PPOB_SERVICES.find((s) => s.key === tab);
	const billType = tab === "bill-pdam" ? "pdam" : "pln";

	const loadCatalog = () => { setCatalog(null); setCatalogErr(null); ppobCatalog().then(setCatalog).catch((e: Error) => setCatalogErr(e.message)); };
	useEffect(() => { if (open) { setStage("pick"); setTab("pulsa"); setNumber(""); setPicked(null); setInquiry(null); setErr(null); setOutcome(null); setOperator("all"); if (!catalog) loadCatalog(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
	useEffect(() => { setNumber(""); setPicked(null); setInquiry(null); setErr(null); setOperator("all"); }, [tab]);
	useEffect(() => {
		if (!open || !isBill) return;
		let on = true; setBills([]); setBillCode("");
		void postpaidCatalog(billType).then((r) => { if (!on) return; const list = (r.data?.products ?? []).filter((p) => p.status === "active"); setBills(list); setBillCode(list[0]?.code ?? ""); if (!r.ok) setErr(payMessage(r.error)); });
		return () => { on = false; };
	}, [open, isBill, billType]);

	const digits = number.replace(/\D/g, "");
	const min = isBill ? 6 : service?.min ?? 8, max = isBill ? 20 : service?.max ?? 19;
	const numberOk = digits.length >= min && digits.length <= max;
	const products = useMemo(() => (catalog ?? []).filter((p) => p.product_type.toLowerCase() === tab && (operator === "all" || operatorOf(p) === operator)).sort((a, b) => a.product_price - b.product_price).slice(0, 60), [catalog, tab, operator]);
	const operators = useMemo(() => (["pulsa", "data"].includes(tab) ? Array.from(new Set((catalog ?? []).filter((p) => p.product_type.toLowerCase() === tab).map(operatorOf))) : []), [catalog, tab]);

	const total = isBill ? inquiry?.totalAmount ?? 0 : picked?.product_price ?? 0;
	const short = total > balance;

	const checkBill = async () => {
		if (!numberOk || !billCode) return;
		setBusy(true); setErr(null);
		const r = await postpaidInquiry(billType, billCode, digits);
		setBusy(false);
		if (!r.ok || !r.data) { setErr(payMessage(r.error)); return; }
		setInquiry(r.data);
	};

	const finish = (o: Outcome, ok: boolean) => { setOutcome(o); setStage("done"); if (ok) onDone(); };
	const run = (pin: string) => (isBill ? postpaidPay(inquiry!.refId, pin) : ppobPurchase(picked!.product_code, digits, pin));

	return (
		<PaySheet open={open} title={stage === "pin" ? "Konfirmasi" : "Bayar & beli"} onClose={onClose} onBack={stage === "pin" ? () => setStage("pick") : undefined} tall={stage === "pick"} locked={busy}>
			<AnimatePresence mode="wait" initial={false}>
				{stage === "pick" && (
					<Step id="pick">
						<div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
							{TABS.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className="relative shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold">{tab === t.key && <motion.span layoutId="ppob-tab" className="absolute inset-0 rounded-full bg-[#0f2347]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}<span className={`relative ${tab === t.key ? "text-white" : "text-[#6b7080]"}`}>{t.label}</span></button>)}
						</div>
						<Field label={isBill ? "Nomor pelanggan" : service?.label ?? "Nomor tujuan"}><input inputMode="numeric" autoComplete="off" aria-label="Nomor tujuan" placeholder={isBill ? "Nomor pelanggan" : service?.placeholder} value={isBill ? number : groupDigits(digits, service?.group ?? [])} onChange={(e) => { setNumber(e.target.value.replace(/\D/g, "").slice(0, max)); setInquiry(null); setErr(null); }} className={inputCls} /></Field>
						<ErrorNote message={err} />

						{isBill ? (
							<div className="mt-3">
								{bills.length > 1 && <select aria-label="Layanan" value={billCode} onChange={(e) => { setBillCode(e.target.value); setInquiry(null); }} className="mb-3 w-full rounded-2xl bg-[#f1f3f8] px-4 py-3 text-sm font-semibold outline-none">{bills.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select>}
								<AnimatePresence initial={false}>{inquiry && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="divide-y divide-[#e4e8f1] rounded-3xl bg-[#f1f3f8] px-4">
									{([["Pelanggan", inquiry.customerName || "-"], ["Periode", inquiry.period || "-"], ["Tagihan", currency(inquiry.billAmount)], ["Biaya admin", currency(inquiry.adminFee)], ["Total", currency(inquiry.totalAmount)]] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between py-2.5 text-sm"><span className="text-[#6b7080]">{k}</span><b>{v}</b></div>)}
								</motion.div>}</AnimatePresence>
								{!inquiry ? <PrimaryButton disabled={!numberOk || !billCode || busy} onClick={() => void checkBill()}>{busy ? "Memeriksa…" : "Cek tagihan"}</PrimaryButton> : <Pay total={total} short={short} balance={balance} onTopup={onTopup} onPay={() => setStage("pin")} />}
							</div>
						) : (
							<div className="mt-3">
								{operators.length > 1 && <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1.5 py-1 [scrollbar-width:none]">{["all", ...operators].map((o) => <button key={o} type="button" onClick={() => setOperator(o)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${operator === o ? "bg-[#e6efff] text-[#1a5dc6] ring-1 ring-[#1a5dc6]" : "bg-[#f1f3f8] text-[#6b7080]"}`}>{o === "all" ? "Semua" : o}</button>)}</div>}
								{catalogErr ? <p className="rounded-2xl bg-[#fdecea] px-3 py-3 text-xs text-[#d23a2a]">{catalogErr} <button type="button" onClick={loadCatalog} className="font-bold underline">Coba lagi</button></p>
									: !catalog ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-[#f1f3f8]" />)}</div>
									: !products.length ? <p className="py-6 text-center text-sm text-[#6b7080]">Produk belum tersedia.</p>
									: <div className="space-y-1.5">{products.map((p, i) => <motion.button key={p.product_code} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.02 }} whileTap={{ scale: 0.98 }} onClick={() => setPicked(p)} aria-pressed={picked?.product_code === p.product_code} className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${picked?.product_code === p.product_code ? "bg-[#e6efff] ring-2 ring-[#1a5dc6]" : "bg-[#f1f3f8]"}`}><span className="min-w-0 pr-3"><b className="block truncate text-sm">{productName(p)}</b>{p.product_description && <span className="block truncate text-xs text-[#6b7080]">{p.product_description}</span>}</span><b className="shrink-0 text-sm text-[#0f2347]">{currency(p.product_price)}</b></motion.button>)}</div>}
								{picked && numberOk && <Pay total={total} short={short} balance={balance} onTopup={onTopup} onPay={() => setStage("pin")} />}
								{picked && !numberOk && <p className="mt-3 text-center text-xs text-[#6b7080]">Lengkapi nomor tujuan untuk melanjutkan.</p>}
							</div>
						)}
					</Step>
				)}
				{stage === "pin" && (
					<Step id="pin">
						<PinStep title="Konfirmasi dengan PIN" summary={<div className="rounded-3xl bg-[#f1f3f8] p-4"><p className="text-xs text-[#6b7080]">{isBill ? `Tagihan ${billType.toUpperCase()} · ${digits}` : `${productName(picked!)} · ${digits}`}</p><p className="text-3xl font-bold text-[#0f2347]">{currency(total)}</p></div>}
							run={run}
							onResult={(r) => {
								const status = r.status as Outcome["kind"] | undefined;
								const serial = (r.serialNumber ?? r.data?.serialNumber) as string | undefined;
								if (r.ok && status === "success") finish({ kind: "success", title: "Pembayaran berhasil", detail: r.message ?? "Transaksi selesai.", serial }, true);
								else if (r.ok && status === "pending") finish({ kind: "pending", title: "Sedang diproses", detail: r.message ?? "Transaksi sedang diproses penyedia. Saldo diperbarui otomatis.", serial }, true);
								else finish({ kind: "failed", title: "Pembayaran gagal", detail: r.message ?? payMessage(r.error) }, false);
							}} />
					</Step>
				)}
				{stage === "done" && outcome && <Step id="done"><Result kind={outcome.kind} title={outcome.title} detail={outcome.detail} onDone={onClose} rows={outcome.serial ? [["Kode / SN", outcome.serial]] : undefined} /></Step>}
			</AnimatePresence>
		</PaySheet>
	);
}

function Pay({ total, short, balance, onTopup, onPay }: { total: number; short: boolean; balance: number; onTopup: () => void; onPay: () => void }) {
	return (
		<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="sticky bottom-0 -mx-1 bg-white px-1 pb-1 pt-2">
			{short && <p className="rounded-2xl bg-[#fff3dc] px-3 py-2 text-xs text-[#a05d00]">Saldo {currency(balance)} kurang {currency(total - balance)}. <button type="button" onClick={onTopup} className="font-bold underline">Isi saldo</button></p>}
			<PrimaryButton disabled={short} onClick={onPay}>Bayar {currency(total)}</PrimaryButton>
		</motion.div>
	);
}
