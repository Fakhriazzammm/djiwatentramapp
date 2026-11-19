import { AnimatePresence } from "framer-motion";
import { ScanLine, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { currency } from "@/components/customer/types";
import { formatPhone, isPhone, payMessage, resolveRecipient, TRANSFER_MAX, TRANSFER_MIN, transfer } from "@/lib/pay-bridge";
import { ErrorNote, Field, inputCls, PaySheet, PinStep, PrimaryButton, Result, Step } from "./pay-ui";

type Stage = "phone" | "amount" | "pin" | "done";
const CHIPS = [10_000, 25_000, 50_000, 100_000];

export function SendFlow({ open, initialPhone, balance, onClose, onScan, onTopup, onDone }: { open: boolean; initialPhone?: string; balance: number; onClose: () => void; onScan: () => void; onTopup: () => void; onDone: () => void }) {
	const [stage, setStage] = useState<Stage>("phone");
	const [phone, setPhone] = useState("");
	const [recipient, setRecipient] = useState<{ name: string; phone: string } | null>(null);
	const [amount, setAmount] = useState(0);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
	const key = useRef("");

	useEffect(() => {
		if (!open) return;
		setStage("phone"); setRecipient(null); setAmount(0); setNote(""); setErr(null); setResult(null); setBusy(false);
		key.current = `djiwapay-transfer-${crypto.randomUUID()}`;
		setPhone(initialPhone ? formatPhone(initialPhone) : "");
		if (initialPhone) void lookup(initialPhone);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, initialPhone]);

	async function lookup(value: string) {
		if (!isPhone(value)) { setErr("Masukkan nomor HP Indonesia yang valid."); return; }
		setBusy(true); setErr(null);
		const r = await resolveRecipient(value);
		setBusy(false);
		if (!r.ok || !r.recipient) { setErr(payMessage(r.error)); return; }
		setRecipient(r.recipient); setStage("amount");
	}

	const short = amount > balance;
	const amountError = amount && (amount < TRANSFER_MIN ? "Minimal Rp1.000" : amount > TRANSFER_MAX ? "Maksimal Rp10.000.000" : null);
	const canContinue = amount >= TRANSFER_MIN && amount <= TRANSFER_MAX && !short;
	const back = stage === "amount" ? () => setStage("phone") : stage === "pin" ? () => setStage("amount") : undefined;

	return (
		<PaySheet open={open} title={stage === "done" ? "Kirim saldo" : "Kirim saldo"} onClose={onClose} onBack={back} locked={busy}>
			<AnimatePresence mode="wait" initial={false}>
				{stage === "phone" && (
					<Step id="phone">
						<p className="text-[13px] text-[#6b7080]">Masukkan nomor HP penerima yang terdaftar di Djiwa.</p>
						<Field label="Nomor HP penerima"><input autoFocus inputMode="tel" autoComplete="off" aria-label="Nomor HP penerima" placeholder="0812 3456 7890" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 18)); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && void lookup(phone)} className={inputCls} /></Field>
						<ErrorNote message={err} />
						<button type="button" onClick={onScan} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#f1f3f8] py-3 text-sm font-semibold text-[#0f2347]"><ScanLine className="h-4 w-4" />Scan QR penerima</button>
						<PrimaryButton disabled={busy || !phone.trim()} onClick={() => void lookup(phone)}>{busy ? "Mencari…" : "Lanjut"}</PrimaryButton>
					</Step>
				)}
				{stage === "amount" && recipient && (
					<Step id="amount">
						<div className="flex items-center gap-3 rounded-3xl bg-[#f1f3f8] p-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#1a5dc6]"><UserRound className="h-5 w-5" /></span><div><b className="block text-[15px]">{recipient.name}</b><span className="text-xs text-[#6b7080]">{formatPhone(recipient.phone)}</span></div></div>
						<div className="mt-3 grid grid-cols-4 gap-2">{CHIPS.map((c) => <button key={c} type="button" onClick={() => setAmount(c)} aria-pressed={amount === c} className={`rounded-2xl py-2.5 text-[13px] font-bold ${amount === c ? "bg-[#e6efff] text-[#1a5dc6] ring-2 ring-[#1a5dc6]" : "bg-[#f1f3f8]"}`}>{c / 1000}rb</button>)}</div>
						<Field label="Nominal" hint={<>{amountError ? <span className="text-[#d23a2a]">{amountError}</span> : <>Saldo kamu <b className="text-[#0f2347]">{currency(balance)}</b></>}</>}><div className="flex items-center gap-1 text-[26px] font-bold text-[#0f2347]">Rp<input inputMode="numeric" autoComplete="off" aria-label="Nominal transfer" placeholder="0" value={amount ? new Intl.NumberFormat("id-ID").format(amount) : ""} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "").slice(0, 8)) || 0)} className="w-full bg-transparent outline-none" /></div></Field>
						<Field label="Catatan (opsional)"><input maxLength={120} aria-label="Catatan" placeholder="Contoh: patungan makan" value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-transparent text-[15px] font-semibold outline-none" /></Field>
						{short && amount >= TRANSFER_MIN && <p className="mt-2 rounded-2xl bg-[#fff3dc] px-3 py-2 text-xs text-[#a05d00]">Saldo kurang {currency(amount - balance)}. <button type="button" onClick={onTopup} className="font-bold underline">Isi saldo</button></p>}
						<PrimaryButton disabled={!canContinue} onClick={() => setStage("pin")}>Lanjut</PrimaryButton>
					</Step>
				)}
				{stage === "pin" && recipient && (
					<Step id="pin">
						<PinStep title="Konfirmasi dengan PIN" summary={<div className="rounded-3xl bg-[#f1f3f8] p-4"><p className="text-xs text-[#6b7080]">Kirim ke {recipient.name}</p><p className="text-3xl font-bold text-[#0f2347]">{currency(amount)}</p></div>}
							run={(pin) => transfer(recipient.phone, amount, note.trim(), pin, key.current)}
							onResult={(r) => { setResult({ ok: r.ok, message: r.ok ? `Saldo ${currency(amount)} terkirim ke ${recipient.name}.` : payMessage(r.error) }); setStage("done"); if (r.ok) onDone(); }} />
					</Step>
				)}
				{stage === "done" && result && recipient && (
					<Step id="done"><Result kind={result.ok ? "success" : "failed"} title={result.ok ? "Transfer berhasil" : "Transfer gagal"} detail={result.message} onDone={onClose} rows={result.ok ? [["Penerima", recipient.name], ["Nominal", currency(amount)], ...(note.trim() ? [["Catatan", note.trim()] as [string, string]] : [])] : undefined} /></Step>
				)}
			</AnimatePresence>
		</PaySheet>
	);
}
