import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, Delete, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { isPinError, payMessage, pinSet, pinStatus, type PayResult } from "@/lib/pay-bridge";

export const EASE = [0.32, 0.72, 0, 1] as const;

/** Bottom sheet shared by every wallet flow: spring in, drag down to close, optional back arrow. */
export function PaySheet({ open, title, onClose, onBack, locked, children, tall }: { open: boolean; title: string; onClose: () => void; onBack?: () => void; locked?: boolean; children: ReactNode; tall?: boolean }) {
	const reduce = useReducedMotion();
	return (
		<AnimatePresence>
			{open && (
				<motion.div className="fixed inset-0 z-[2000] flex items-end justify-center bg-[#0f2347]/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !locked && onClose()}>
					<motion.section role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className={`flex w-full max-w-md flex-col rounded-t-[34px] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2.5 ${tall ? "h-[92dvh]" : "max-h-[92dvh]"}`}
						initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }}
						drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (!locked && (i.offset.y > 120 || i.velocity.y > 600)) onClose(); }}>
						<div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-[#d5d9e3]" />
						<div className="mb-3 flex shrink-0 items-center gap-2">
							{onBack && <button type="button" onClick={onBack} disabled={locked} aria-label="Kembali" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3f8]"><ArrowLeft className="h-4 w-4" /></button>}
							<h2 className="flex-1 text-[22px] font-bold">{title}</h2>
							<button type="button" onClick={onClose} disabled={locked} aria-label="Tutup" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3f8]"><X className="h-4 w-4" /></button>
						</div>
						<div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">{children}</div>
					</motion.section>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** Cross-fade between steps of a flow. */
export function Step({ id, children }: { id: string; children: ReactNode }) {
	return <motion.div key={id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.26, ease: EASE }}>{children}</motion.div>;
}

export const PrimaryButton = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
	<motion.button whileTap={{ scale: 0.97 }} type="button" {...(p as object)} className="mt-4 min-h-[54px] w-full rounded-full bg-[#0f2347] text-base font-bold text-white disabled:opacity-40">{children}</motion.button>
);

export function ErrorNote({ message }: { message: string | null }) {
	return <AnimatePresence>{message && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="mt-2 overflow-hidden rounded-2xl bg-[#fdecea] px-3 py-2 text-xs text-[#d23a2a]">{message}</motion.p>}</AnimatePresence>;
}

export function Result({ kind, title, detail, onDone, doneLabel = "Selesai", rows }: { kind: "success" | "pending" | "failed"; title: string; detail?: string; onDone: () => void; doneLabel?: string; rows?: [string, string][] }) {
	const tone = kind === "success" ? "#13804a" : kind === "pending" ? "#a05d00" : "#d23a2a";
	const bg = kind === "success" ? "#e5f5ec" : kind === "pending" ? "#fff3dc" : "#fdecea";
	const Icon = kind === "success" ? CheckCircle2 : kind === "pending" ? Clock3 : CircleAlert;
	return (
		<div className="pb-1 pt-2 text-center" role="status" aria-live="polite">
			<motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 18 }} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ background: bg, color: tone }}><Icon className="h-10 w-10" /></motion.div>
			<h3 className="mt-4 text-xl font-bold">{title}</h3>
			{detail && <p className="mx-auto mt-1 max-w-[290px] text-sm text-[#6b7080]">{detail}</p>}
			{rows && <div className="mt-4 divide-y divide-[#e4e8f1] rounded-3xl bg-[#f1f3f8] px-4 text-left">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-3 text-sm"><span className="text-[#6b7080]">{k}</span><b className="break-all text-right">{v}</b></div>)}</div>}
			<PrimaryButton onClick={onDone}>{doneLabel}</PrimaryButton>
		</div>
	);
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

/**
 * Collects the 6-digit PIN. First use asks to create one (twice). `run` performs the guarded action; PIN errors stay here
 * (shake + attempts left), any other outcome goes to `onResult`.
 */
export function PinStep({ title, summary, run, onResult }: { title: string; summary?: ReactNode; run: (pin: string) => Promise<PayResult<any>>; onResult: (r: PayResult<any>) => void }) {
	const reduce = useReducedMotion();
	const [mode, setMode] = useState<"loading" | "enter" | "create" | "confirm">("loading");
	const [pin, setPin] = useState("");
	const [first, setFirst] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [shake, setShake] = useState(0);

	useEffect(() => { let on = true; void pinStatus().then((r) => { if (on) setMode(r.ok && r.set ? "enter" : r.ok ? "create" : "enter"); }); return () => { on = false; }; }, []);

	const fail = (message: string) => { setErr(message); setPin(""); setShake((n) => n + 1); };
	const submit = async (value: string) => {
		setBusy(true); setErr(null);
		try {
			if (mode === "create") { setFirst(value); setPin(""); setMode("confirm"); return; }
			if (mode === "confirm") {
				if (value !== first) { setMode("create"); setFirst(""); fail("PIN tidak sama. Ulangi."); return; }
				const set = await pinSet(value);
				if (!set.ok) { setMode("create"); setFirst(""); fail(payMessage(set.error)); return; }
			}
			const r = await run(value);
			if (isPinError(r.error)) { setMode("enter"); fail(r.error === "PIN_LOCKED" ? payMessage("PIN_LOCKED") : `PIN salah${r.attemptsLeft !== undefined ? `, sisa ${r.attemptsLeft} percobaan` : ""}.`); return; }
			onResult(r);
		} finally { setBusy(false); }
	};
	const press = (k: string) => {
		if (busy || mode === "loading") return;
		if (k === "del") { setPin((p) => p.slice(0, -1)); return; }
		const next = (pin + k).slice(0, 6);
		setPin(next);
		if (next.length === 6) window.setTimeout(() => void submit(next), 120);
	};
	useEffect(() => {
		const on = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("del"); };
		window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
	});

	const heading = mode === "create" ? "Buat PIN Djiwa Pay" : mode === "confirm" ? "Ulangi PIN" : title;
	const hint = mode === "create" ? "PIN 6 angka untuk mengamankan setiap pembayaran." : mode === "confirm" ? "Masukkan PIN yang sama sekali lagi." : "Masukkan PIN 6 angka.";
	return (
		<div className="text-center">
			{summary}
			<h3 className="mt-2 text-base font-bold">{heading}</h3>
			<p className="mt-0.5 text-xs text-[#6b7080]">{hint}</p>
			<motion.div key={shake} animate={reduce || !shake ? undefined : { x: [0, -10, 10, -8, 8, 0] }} transition={{ duration: 0.4 }} className="my-4 flex justify-center gap-3" aria-label={`${pin.length} dari 6 angka`}>
				{Array.from({ length: 6 }).map((_, i) => <motion.span key={i} animate={{ scale: pin.length === i + 1 ? [1, 1.35, 1] : 1, backgroundColor: i < pin.length ? "#0f2347" : "#d5d9e3" }} transition={{ duration: 0.18 }} className="h-3.5 w-3.5 rounded-full" />)}
			</motion.div>
			<ErrorNote message={err} />
			<div className="mx-auto mt-2 grid max-w-[300px] grid-cols-3 gap-1.5">
				{KEYS.map((k, i) => k ? <motion.button whileTap={{ scale: 0.9, backgroundColor: "#e6efff" }} key={k} type="button" disabled={busy} onClick={() => press(k)} aria-label={k === "del" ? "Hapus" : `Angka ${k}`} className="flex h-14 items-center justify-center rounded-2xl text-2xl font-semibold">{k === "del" ? <Delete className="h-5 w-5" /> : k}</motion.button> : <span key={`e${i}`} />)}
			</div>
			{busy && <p className="mt-2 text-xs text-[#6b7080]">Memproses…</p>}
		</div>
	);
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
	<div className="mt-3"><label className="block rounded-[20px] bg-[#f1f3f8] px-4 py-3 transition-shadow focus-within:shadow-[0_0_0_2px_rgba(26,93,198,.35)]"><span className="text-xs font-semibold text-[#6b7080]">{label}</span>{children}</label>{hint && <p className="mt-1.5 px-1 text-xs text-[#6b7080]">{hint}</p>}</div>
);
export const inputCls = "field-bare w-full bg-transparent text-[20px] font-bold text-[#0f2347] outline-none placeholder:text-[#9aa0ae]";
