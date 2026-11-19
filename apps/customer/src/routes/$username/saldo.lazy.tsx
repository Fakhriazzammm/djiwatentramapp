import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ArrowUpRight, Bell, CheckCircle2, ChevronRight, CircleAlert, Clock3, Eye, EyeOff, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerWallet, type CustomerWalletLedgerEntry } from "@/hooks/use-customer-data";
import { currency } from "@/components/customer/types";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";
import { getCustomerPayPath } from "@/lib/customer-pay-navigation";
import { PpobFlow } from "@/components/saldo/ppob-flow";
import { ScanFlow } from "@/components/saldo/scan-flow";
import { SendFlow } from "@/components/saldo/send-flow";

export const Route = createLazyFileRoute("/$username/saldo")({ component: SaldoPage });

const PENDING_KEY = "djiwa-topup-pending";
const VERIFY_WINDOW_MS = 10 * 60_000;
const MIN_TOPUP = 1000;
const PRESETS = [25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
const EASE = [0.32, 0.72, 0, 1] as const;
const ICON = (name: string) => `/assets/djiwa-pay-actions/${name}.webp`;

const LABELS: Record<string, string> = {
	topup_completed: "Top up saldo", order_debit: "Pembayaran pesanan", wallet_release: "Saldo dikembalikan", refund: "Refund pesanan",
	wallet_hold: "Saldo ditahan", manual_credit: "Saldo masuk", adjustment: "Penyesuaian saldo", wallet_transfer_sent: "Saldo dikirim", wallet_transfer_received: "Saldo diterima",
};
const entryLabel = (e: CustomerWalletLedgerEntry) => (e.transaction_type === "wallet_hold" && e.status === "cancelled" ? "Penahanan dibatalkan" : LABELS[e.transaction_type] ?? "Transaksi saldo");
const entryDate = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const mask = "Rp ••••••";

function Money({ value, hidden, className }: { value: number; hidden?: boolean; className?: string }) {
	const reduce = useReducedMotion();
	const mv = useMotionValue(value);
	const text = useTransform(mv, (v) => currency(Math.round(v)));
	useEffect(() => { if (reduce) { mv.set(value); return; } const c = animate(mv, value, { duration: 0.8, ease: EASE }); return () => c.stop(); }, [value, reduce, mv]);
	return hidden ? <span className={className}>{mask}</span> : <motion.span className={className}>{text}</motion.span>;
}

type Pending = { amount: number; startedAt: number; creditedBefore: number };

function SaldoPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const reduce = useReducedMotion();
	const { isAuthenticated, customer, isLoading: authLoading } = useCustomerAuth();
	const { wallet, ledger, isLoading, error, refetch } = useCustomerWallet();
	const [hidden, setHidden] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [sheet, setSheet] = useState(false);
	const [amount, setAmount] = useState(100_000);
	const [busy, setBusy] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState<Pending | null>(null);
	const [done, setDone] = useState<number | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const [filter, setFilter] = useState<"all" | "in" | "out">("all");
	const [showAll, setShowAll] = useState(false);
	const [flow, setFlow] = useState<"send" | "scan" | "ppob" | null>(null);
	const [sendPhone, setSendPhone] = useState<string | undefined>();

	const pendingKey = customer?.sourceId ? `${PENDING_KEY}:${customer.sourceId}` : PENDING_KEY;
	const missing = getMissingCustomerFields(customer);
	const balance = Number(wallet?.available_balance ?? customer?.walletBalance ?? 0);

	useEffect(() => { if (!authLoading && !isAuthenticated) window.location.replace("/masuk?next=saldo"); }, [authLoading, isAuthenticated]);
	useEffect(() => {
		if (customer && customer.username !== username) navigate({ to: "/$username/saldo", params: { username: customer.username }, replace: true });
	}, [customer, navigate, username]);

	useEffect(() => {
		try {
			const raw = window.sessionStorage.getItem(pendingKey);
			if (!raw) return;
			const p = JSON.parse(raw) as Partial<Pending>;
			if (Number.isFinite(p.amount) && Number.isFinite(p.startedAt) && Date.now() - Number(p.startedAt) < VERIFY_WINDOW_MS) setPending({ amount: Number(p.amount), startedAt: Number(p.startedAt), creditedBefore: Number(p.creditedBefore ?? 0) });
			else window.sessionStorage.removeItem(pendingKey);
		} catch { /* storage tidak tersedia */ }
	}, [pendingKey]);

	useEffect(() => {
		if (!pending) return;
		let active = true;
		const clear = () => { try { window.sessionStorage.removeItem(pendingKey); } catch { /* noop */ } };
		const verify = async () => {
			const latest = await refetch();
			if (!active) return;
			if (pending.amount > 0 && Number(latest?.wallet?.total_credited ?? 0) >= pending.creditedBefore + pending.amount) { setDone(pending.amount); setPending(null); clear(); }
			else if (Date.now() - pending.startedAt >= VERIFY_WINDOW_MS) { setTimedOut(true); setPending(null); clear(); }
		};
		void verify();
		const t = window.setInterval(() => void verify(), 6000);
		return () => { active = false; window.clearInterval(t); };
	}, [pending, pendingKey, refetch]);

	useEffect(() => { if (done === null) return; const t = window.setTimeout(() => setDone(null), 6000); return () => window.clearTimeout(t); }, [done]);

	const submitTopup = async () => {
		if (missing.length > 0) { setFormError(getCustomerContactMessage(missing)); return; }
		if (!customer?.sourceId || !customer.email) return;
		if (!Number.isSafeInteger(amount) || amount < MIN_TOPUP) { setFormError("Nominal top up minimal Rp1.000"); return; }
		setBusy(true); setFormError(null);
		try {
			const result = await invokeEdgeFunction<{ result?: { invoice_url?: string } }>("customer-wallet", { action: "topup", sourceId: customer.sourceId, email: customer.email, amount, origin: `${window.location.origin}/${encodeURIComponent(username)}/saldo`, idempotencyKey: `topup-${customer.sourceId}-${Date.now()}` });
			if (!result.result?.invoice_url) throw new Error("Invoice top up tidak tersedia");
			try { window.sessionStorage.setItem(pendingKey, JSON.stringify({ amount, startedAt: Date.now(), creditedBefore: Number(wallet?.total_credited ?? 0) })); } catch { /* noop */ }
			window.location.assign(result.result.invoice_url);
		} catch (err) { setFormError(err instanceof Error ? err.message : "Gagal membuat invoice top up"); setBusy(false); }
	};

	const refresh = async () => { if (refreshing) return; setRefreshing(true); setTimedOut(false); try { await refetch(); } finally { setRefreshing(false); } };
	const openPay = () => window.location.assign(getCustomerPayPath(username));

	const stats = { in: Number(wallet?.total_credited ?? 0), out: Number(wallet?.total_debited ?? 0) };
	const rows = useMemo(() => ledger.filter((e) => e.status !== "cancelled").filter((e) => filter === "all" || (filter === "in" ? e.direction === "credit" : e.direction === "debit")), [ledger, filter]);
	const visible = showAll ? rows : rows.slice(0, 4);

	const fade = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.4, ease: EASE } }) as const;
	const press = reduce ? {} : { whileTap: { scale: 0.96 } };

	const quick = [
		{ label: "Isi Saldo", icon: "topup", onClick: () => { setFormError(null); setSheet(true); } },
		{ label: "Riwayat", icon: "history", onClick: () => document.getElementById("saldo-riwayat")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
		{ label: "Pesan", icon: "send", onClick: () => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } }) },
		{ label: "Bantuan", icon: "help", onClick: () => navigate({ to: "/$username/notifikasi", params: { username } }) },
	];
	const openTopup = () => { setFlow(null); setFormError(null); setSheet(true); };
	const inPay = [
		{ label: "Kirim saldo", sub: "Ke pengguna Djiwa", icon: "send", onClick: () => { setSendPhone(undefined); setFlow("send"); } },
		{ label: "Scan QR", sub: "Kirim lewat QR penerima", icon: "scan-qr", onClick: () => setFlow("scan") },
		{ label: "Bayar & beli", sub: "Pulsa, data, token PLN, tagihan", icon: "bills", onClick: () => setFlow("ppob") },
	];

	return (
		<div className="app-page min-h-app bg-[#f6f7fb]">
			<div className="mx-auto min-h-app max-w-md bg-gradient-to-b from-[#c6dafc] via-[#e4ecff] to-[#f6f7fb] bg-[length:100%_330px] bg-no-repeat px-4 pb-32 pt-6">
				<motion.header {...fade(0)} className="flex items-start justify-between">
					<div><p className="text-xs font-semibold text-[#6b7080]">DJIWA TENTRAM</p><h1 className="mt-0.5 text-[32px] font-bold leading-tight tracking-tight text-[#14161c]">Saldo</h1></div>
					<div className="flex gap-2">
						<motion.button {...press} type="button" onClick={() => void refresh()} aria-label="Muat ulang saldo" className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(15,35,71,.08)]"><RefreshCw className={`h-[18px] w-[18px] ${refreshing ? "animate-spin" : ""}`} /></motion.button>
						<motion.button {...press} type="button" onClick={() => navigate({ to: "/$username/notifikasi", params: { username } })} aria-label="Notifikasi" className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(15,35,71,.08)]"><Bell className="h-[18px] w-[18px]" /></motion.button>
					</div>
				</motion.header>

				<AnimatePresence initial={false}>
					{pending && <motion.div key="p" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div role="status" className="mt-4 flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm"><span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#e6efff] text-[#1a5dc6]"><Clock3 className="h-5 w-5" /><span className="absolute inset-0 animate-ping rounded-full border border-[#1a5dc6]/40 motion-reduce:animate-none" /></span><div><p className="text-sm font-bold">Menunggu pembayaran {currency(pending.amount)}</p><p className="text-xs text-[#6b7080]">Saldo bertambah otomatis setelah terkonfirmasi.</p></div></div></motion.div>}
					{done !== null && <motion.div key="d" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 26 }} className="mt-4 flex items-center gap-3 rounded-3xl bg-[#e5f5ec] p-4 text-[#13804a]" role="status"><CheckCircle2 className="h-6 w-6" /><div><p className="text-sm font-bold">Top up berhasil</p><p className="text-xs">Saldo bertambah {currency(done)}.</p></div></motion.div>}
					{timedOut && <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex items-start gap-3 rounded-3xl bg-[#fff3dc] p-4 text-[#a05d00]" role="status"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-bold">Pembayaran sedang diverifikasi</p><p className="text-xs">Jangan buat top up baru. <button type="button" onClick={() => void refresh()} className="font-bold underline">Cek saldo lagi</button></p></div></motion.div>}
				</AnimatePresence>

				<motion.section {...fade(1)} className="mt-4 rounded-[34px] bg-white p-5 shadow-[0_14px_40px_rgba(15,35,71,.10)]">
					<div className="flex items-center justify-between text-[13px] font-semibold text-[#6b7080]"><span>Saldo tersedia</span><span className="rounded-full bg-[#e5f5ec] px-2.5 py-0.5 text-[11px] font-bold text-[#13804a]">{wallet?.status === "blocked" ? "Diblokir" : "Aktif"}</span></div>
					<div className="mt-2 flex items-center gap-2.5">
						<Money value={balance} hidden={hidden} className="text-[38px] font-bold leading-none tracking-tight text-[#0f2347]" />
						<motion.button {...press} type="button" onClick={() => setHidden((v) => !v)} aria-label={hidden ? "Tampilkan saldo" : "Sembunyikan saldo"} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3f8]">{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</motion.button>
					</div>
					<p className="mt-1 text-xs text-[#6b7080]">{customer?.name ? `${customer.name} · ` : ""}dipakai untuk semua pesanan</p>
					{error && !wallet ? <p className="mt-2 text-xs text-[#d23a2a]">Saldo belum bisa dimuat. Tarik muat ulang di atas.</p> : null}
					<motion.button {...press} type="button" onClick={() => { setFormError(null); setSheet(true); }} className="mt-4 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[#0f2347] text-base font-bold text-white"><img src={ICON("topup")} alt="" className="h-6 w-6 object-contain" />Isi Saldo</motion.button>
				</motion.section>

				<motion.div {...fade(2)} className="mt-3 grid grid-cols-2 gap-2.5">
					{[{ l: "Total masuk", v: stats.in, c: "text-[#13804a]" }, { l: "Total digunakan", v: stats.out, c: "text-[#0f2347]" }].map((s) => <div key={s.l} className="rounded-3xl bg-white p-4 shadow-[0_0_0_1px_rgba(15,35,71,.05)]"><span className="text-xs font-semibold text-[#6b7080]">{s.l}</span><Money value={s.v} hidden={hidden} className={`mt-1 block text-[17px] font-bold ${s.c}`} /></div>)}
				</motion.div>

				<motion.section {...fade(3)}>
					<p className="mb-2.5 ml-1 mt-6 text-[13px] font-bold text-[#6b7080]">AKSI CEPAT</p>
					<div className="grid grid-cols-4 rounded-[30px] bg-[#f1f3f8] px-1 py-3">
						{quick.map((q) => <motion.button {...press} key={q.label} type="button" onClick={q.onClick} className="flex flex-col items-center gap-2 text-xs font-semibold"><span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(15,35,71,.05)]"><img src={ICON(q.icon)} alt="" className="h-[30px] w-[30px] object-contain" /></span>{q.label}</motion.button>)}
					</div>
				</motion.section>

				<motion.section {...fade(4)}>
					<div className="mb-2.5 ml-1 mt-6 flex items-baseline justify-between"><p className="text-[13px] font-bold text-[#6b7080]">KIRIM & BAYAR</p></div>
					<div className="rounded-[30px] bg-[#f1f3f8] p-2">
						{inPay.map((r, i) => <motion.button {...press} key={r.label} type="button" onClick={r.onClick} className={`flex min-h-16 w-full items-center gap-3 px-2.5 py-2 text-left ${i ? "border-t border-[#e4e8f1]" : ""}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white"><img src={ICON(r.icon)} alt="" className="h-[26px] w-[26px] object-contain" /></span><span className="min-w-0 flex-1"><b className="block text-[15px] font-semibold">{r.label}</b><span className="text-xs text-[#6b7080]">{r.sub}</span></span><ChevronRight className="h-4 w-4 text-[#9aa0ae]" /></motion.button>)}
					</div>
				</motion.section>

				<motion.button {...fade(5)} {...press} type="button" onClick={openPay} className="mt-3 flex w-full items-center gap-3 rounded-[30px] bg-white p-3 pr-4 text-left shadow-[0_0_0_1px_rgba(15,35,71,.05)]">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e6efff]"><img src={ICON("card")} alt="" className="h-7 w-7 object-contain" /></span>
					<span className="min-w-0 flex-1"><b className="block text-[15px] font-semibold">Keuangan di Djiwa Pay</b><span className="text-xs text-[#6b7080]">Pencatatan, anggaran, dan fitur lengkap</span></span>
					<span className="flex items-center gap-1 rounded-full bg-[#0f2347] px-3 py-2 text-xs font-bold text-white">Buka <ArrowUpRight className="h-3.5 w-3.5" /></span>
				</motion.button>

				<motion.section {...fade(6)} id="saldo-riwayat" className="scroll-mt-4">
					<p className="mb-2.5 ml-1 mt-6 text-[13px] font-bold text-[#6b7080]">RIWAYAT</p>
					<div className="relative mb-2.5 flex rounded-full bg-[#f1f3f8] p-1">
						{([["all", "Semua"], ["in", "Masuk"], ["out", "Keluar"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => { setFilter(k); setShowAll(false); }} className="relative flex-1 rounded-full py-2 text-[13px] font-semibold"><AnimatePresence>{filter === k && <motion.span layoutId="seg" className="absolute inset-0 rounded-full bg-white shadow-[0_1px_4px_rgba(15,35,71,.1)]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}</AnimatePresence><span className={`relative ${filter === k ? "text-[#0f2347]" : "text-[#6b7080]"}`}>{l}</span></button>)}
					</div>
					<div className="rounded-[30px] bg-[#f1f3f8] p-2">
						{isLoading && !ledger.length ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-white/70" />)}</div> : !rows.length ? <p className="px-4 py-8 text-center text-sm text-[#6b7080]">Belum ada transaksi.</p> : (
							<AnimatePresence initial={false} mode="popLayout">
								{visible.map((e, i) => <motion.div key={e.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: EASE, delay: Math.min(i, 6) * 0.03 }} className={`flex min-h-16 items-center gap-3 px-2.5 py-2 ${i ? "border-t border-[#e4e8f1]" : ""}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white"><img src={ICON(e.direction === "credit" ? "receive" : "bills")} alt="" className="h-[26px] w-[26px] object-contain" /></span><span className="min-w-0 flex-1"><b className="block truncate text-[15px] font-semibold">{entryLabel(e)}</b><span className="text-xs text-[#6b7080]">{entryDate(e.created_at)}</span></span><b className={`text-[15px] ${e.direction === "credit" ? "text-[#13804a]" : "text-[#14161c]"}`}>{hidden ? "••••" : `${e.direction === "credit" ? "+" : "−"}${currency(Math.abs(e.amount))}`}</b></motion.div>)}
							</AnimatePresence>
						)}
						{rows.length > 4 && <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full py-3 text-[13px] font-semibold text-[#1a5dc6]">{showAll ? "Tampilkan lebih sedikit" : `Lihat semua (${rows.length})`}</button>}
					</div>
				</motion.section>
			</div>

			<SendFlow open={flow === "send"} initialPhone={sendPhone} balance={balance} onClose={() => setFlow(null)} onScan={() => setFlow("scan")} onTopup={openTopup} onDone={() => void refetch()} />
			<ScanFlow open={flow === "scan"} onClose={() => setFlow(null)} onPhone={(phone) => { setSendPhone(phone); setFlow("send"); }} onManual={() => { setSendPhone(undefined); setFlow("send"); }} />
			<PpobFlow open={flow === "ppob"} balance={balance} onClose={() => setFlow(null)} onTopup={openTopup} onDone={() => void refetch()} />

			<AnimatePresence>
				{sheet && (
					<motion.div className="fixed inset-0 z-[2000] flex items-end justify-center bg-[#0f2347]/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && setSheet(false)}>
						<motion.section role="dialog" aria-modal="true" aria-labelledby="topup-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-[34px] bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2.5" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }} drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (!busy && (i.offset.y > 120 || i.velocity.y > 600)) setSheet(false); }}>
							<div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d5d9e3]" />
							<div className="flex items-start justify-between"><div><h2 id="topup-title" className="text-[22px] font-bold">Isi Saldo</h2><p className="mt-0.5 text-[13px] text-[#6b7080]">Pilih nominal, lalu bayar dengan QRIS.</p></div><button type="button" disabled={busy} onClick={() => setSheet(false)} aria-label="Tutup" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3f8]"><X className="h-4 w-4" /></button></div>
							<div className="mt-4 grid grid-cols-3 gap-2">
								{PRESETS.map((p) => <motion.button {...press} key={p} type="button" aria-pressed={amount === p} onClick={() => { setAmount(p); setFormError(null); }} className={`rounded-2xl py-3 text-sm font-bold transition-colors ${amount === p ? "bg-[#e6efff] text-[#1a5dc6] ring-2 ring-[#1a5dc6]" : "bg-[#f1f3f8]"}`}>{currency(p)}</motion.button>)}
							</div>
							<label className="mt-3 block rounded-[20px] bg-[#f1f3f8] px-4 py-3"><span className="text-xs font-semibold text-[#6b7080]">Nominal top up</span>
								<div className="flex items-center gap-1 text-[26px] font-bold text-[#0f2347]">Rp<input inputMode="numeric" autoComplete="off" aria-label="Nominal top up" value={amount ? new Intl.NumberFormat("id-ID").format(amount) : ""} onChange={(e) => { setAmount(Number(e.target.value.replace(/\D/g, "").slice(0, 8)) || 0); setFormError(null); }} className="w-full bg-transparent outline-none" placeholder="0" /></div></label>
							<p className="mt-1.5 px-1 text-xs text-[#6b7080]">Minimal Rp1.000 · saldo setelah top up <b className="text-[#0f2347]">{currency(balance + (amount || 0))}</b></p>
							<AnimatePresence>{formError && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert" className="mt-2 overflow-hidden rounded-2xl bg-[#fdecea] px-3 py-2 text-xs text-[#d23a2a]">{formError}{missing.length > 0 && <> <button type="button" onClick={() => navigate({ to: "/$username/profile", params: { username } })} className="font-bold underline">Lengkapi profil</button></>}</motion.p>}</AnimatePresence>
							<div className="mt-3 rounded-2xl bg-[#e6efff] px-3.5 py-2.5 text-xs leading-relaxed text-[#1a4a9a]">Saldo masuk otomatis setelah pembayaran terkonfirmasi, dan bisa dipakai di semua channel Djiwa Tentram.</div>
							<motion.button {...press} type="button" disabled={busy || amount < MIN_TOPUP} onClick={() => void submitTopup()} aria-busy={busy} className="mt-4 min-h-[54px] w-full rounded-full bg-[#0f2347] text-base font-bold text-white disabled:opacity-40">{busy ? "Menyiapkan pembayaran…" : "Lanjut ke pembayaran"}</motion.button>
						</motion.section>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
