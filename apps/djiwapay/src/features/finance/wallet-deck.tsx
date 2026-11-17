import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { AnimatedNumber, Btn, I3, Ic, spring, type IconName } from "../shell/dpx-ui";
import type { FinCtx } from "./fin-pages";
import { EntryRow } from "./fin-pages";
import { inMonth } from "../../lib/finance/calc";
import { PAY_ACCOUNT_ID } from "../../lib/finance/categories";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Account } from "../../lib/finance/types";

type Skin = { from: string; to: string; accent: string; tint?: string };
/** Card colours by brand name first, then by account type. Every skin is dark enough for white text. */
const BRANDS: [RegExp, Skin][] = [
  [/djiwa pay/i, { from: "#e8833a", to: "#b83f17", accent: "#ffe2c4" }], [/mandiri/i, { from: "#12356b", to: "#0a1f45", accent: "#f5c542" }], [/bca/i, { from: "#2368c8", to: "#0c3a85", accent: "#bcd7ff" }],
  [/blu/i, { from: "#13a4c9", to: "#0b6584", accent: "#c8f1ff" }], [/gopay|go-pay/i, { from: "#0a9fd0", to: "#05638a", accent: "#bff0ff" }], [/shopee/i, { from: "#f0552f", to: "#b3351b", accent: "#ffd9cf" }],
  [/ovo/i, { from: "#5b2e9e", to: "#3a1c6b", accent: "#e1ccff" }], [/dana/i, { from: "#1f7fe0", to: "#0f4fa3", accent: "#cfe5ff" }], [/telkom|indihome/i, { from: "#d6121f", to: "#8d0a14", accent: "#ffd0d4" }],
  [/jago/i, { from: "#f5a623", to: "#b87408", accent: "#fff0cf" }], [/bri\b/i, { from: "#1d5fb4", to: "#0b3567", accent: "#ffd35a" }], [/bni/i, { from: "#e56b1f", to: "#9a3d08", accent: "#ffe1c8" }], [/tunai|cash/i, { from: "#35523a", to: "#17261a", accent: "#d6ecd3" }],
];
const BY_TYPE: Record<string, Skin> = { bank: { from: "#3d4f6b", to: "#1c2638", accent: "#d6e2f7" }, ewallet: { from: "#16899a", to: "#0b4f5c", accent: "#c8f3fa" }, card: { from: "#b03a64", to: "#6b1c3b", accent: "#ffd3e3" }, cash: { from: "#35523a", to: "#17261a", accent: "#d6ecd3" }, other: { from: "#5a5148", to: "#2b2620", accent: "#eadfd0" } };
const skinOf = (name: string, type: string): Skin => BRANDS.find(([re]) => re.test(name))?.[1] ?? BY_TYPE[type] ?? BY_TYPE.other;
const iconOf = (type: string): IconName => (type === "bank" ? "bank" : type === "card" ? "card" : "wallet");

type Card = { id: string; name: string; type: string; balance: number; skin: Skin; pay: boolean; account?: Account; needsOpening: boolean };
const FOCUS_H = 196, STRIP_H = 70;

/**
 * Wallets as a deck of cards. The chosen card sits on top at full size, the others are stacked under it as strips.
 * Tap a strip to bring it forward, swipe the top card sideways to flip through, tap the list button to see every card as a strip.
 */
export function WalletDeck({ ctx, accounts, balances }: { ctx: FinCtx; accounts: Account[]; balances: Record<string, number> }) {
  const { state, entries } = ctx.fin, now = new Date();
  const cards = useMemo<Card[]>(() => [
    { id: PAY_ACCOUNT_ID, name: "Djiwa Pay", type: "pay", balance: ctx.payBalance, skin: skinOf("Djiwa Pay", "pay"), pay: true, needsOpening: false },
    ...accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: balances[a.id] ?? 0, skin: skinOf(a.name, a.type), pay: false, account: a, needsOpening: a.opening === 0 && (balances[a.id] ?? 0) < 0 })),
  ], [accounts, balances, ctx.payBalance]);
  const [sel, setSel] = useState(0), [view, setView] = useState<"focus" | "stack">("focus"), [dir, setDir] = useState(1);
  const cur = cards[Math.min(sel, cards.length - 1)];
  const stats = useMemo(() => { let inn = 0, out = 0; for (const e of entries) if (e.accountId === cur.id && inMonth(e, now.getFullYear(), now.getMonth())) { if (e.kind === "in") inn += e.amount; else if (e.kind === "out") out += e.amount; } return { inn, out }; }, [entries, cur.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => entries.filter((e) => e.accountId === cur.id).slice(0, 3), [entries, cur.id]);
  const go = (i: number) => { const n = (i + cards.length) % cards.length; setDir(i >= sel ? 1 : -1); setSel(n); setView("focus"); };
  const mask = (s: string) => (ctx.visible ? s : "•••••");
  const order = view === "focus" ? [sel, ...cards.map((_, i) => i).filter((i) => i !== sel)] : cards.map((_, i) => i);

  // tilt and sheen follow the finger or cursor over the front card
  const px = useMotionValue(0), py = useMotionValue(0), sx = useSpring(px, { stiffness: 180, damping: 18 }), sy = useSpring(py, { stiffness: 180, damping: 18 });
  const rotY = useTransform(sx, [-1, 1], [-7, 7]), rotX = useTransform(sy, [-1, 1], [6, -6]), sheen = useTransform(sx, [-1, 1], ["20%", "80%"]);
  const frontRef = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => { const r = frontRef.current?.getBoundingClientRect(); if (!r) return; px.set(((e.clientX - r.left) / r.width) * 2 - 1); py.set(((e.clientY - r.top) / r.height) * 2 - 1); };
  const dragX = useMotionValue(0), dragRot = useTransform(dragX, [-200, 0, 200], [-9, 0, 9]);

  return <div className="dpx-wd">
    <div className="dpx-wd-top"><span className="dpx-sub">{cards.length} dompet</span>
      <div className="dpx-wd-tools"><Btn type="button" className={`dpx-wd-tool ${view === "stack" ? "on" : ""}`} onClick={() => setView((v) => (v === "focus" ? "stack" : "focus"))} aria-pressed={view === "stack"} aria-label={view === "stack" ? "Kembali ke satu kartu" : "Lihat semua kartu"}><Ic n="list" size="sm" /></Btn>
        <Btn type="button" className="dpx-wd-tool" onClick={() => ctx.open({ k: "account" })} aria-label="Tambah dompet"><Ic n="plus" size="sm" /></Btn></div></div>
    <div className="dpx-wd-deck" style={{ height: view === "focus" ? FOCUS_H + Math.max(0, cards.length - 1) * (STRIP_H - 18) + 18 : cards.length * (STRIP_H - 18) + 36 }}>
      {order.map((idx, pos) => {
        const c = cards[idx], front = view === "focus" && idx === sel, y = view === "focus" ? (front ? 0 : FOCUS_H - 18 + (pos - 1) * (STRIP_H - 18)) : pos * (STRIP_H - 18);
        return <motion.div key={c.id} className={`dpx-wd-card ${front ? "front" : ""}`} ref={front ? frontRef : undefined}
          style={{ background: `linear-gradient(145deg, ${c.skin.from}, ${c.skin.to})`, zIndex: front ? 50 : pos, ...(front ? { x: dragX, rotate: dragRot, rotateX: rotX, rotateY: rotY } : {}) }}
          initial={false} animate={{ y, height: front ? FOCUS_H : STRIP_H + 18, scale: front ? 1 : 1 - Math.min(pos, 6) * 0.0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}
          drag={front ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7} onDragEnd={(_, info) => { if (info.offset.x < -70 || info.velocity.x < -500) go(sel + 1); else if (info.offset.x > 70 || info.velocity.x > 500) go(sel - 1); }}
          onPointerMove={front ? onMove : undefined} onPointerLeave={front ? () => { px.set(0); py.set(0); } : undefined}
          role="button" tabIndex={0} aria-label={`${c.name}, saldo ${ctx.visible ? rupiah(c.balance) : "disembunyikan"}${front ? "" : ". Ketuk untuk membuka"}`} aria-current={front ? "true" : undefined}
          onClick={() => { if (!front) go(idx); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!front) go(idx); } else if (front && e.key === "ArrowRight") go(sel + 1); else if (front && e.key === "ArrowLeft") go(sel - 1); }} whileTap={front ? { scale: 0.985 } : { scale: 0.99 }}>
          <motion.i className="dpx-wd-sheen" style={front ? { backgroundPositionX: sheen } : undefined} />
          <div className="dpx-wd-head">
            <span className="dpx-wd-logo">{c.pay ? <I3 name="payment-wallet" px={26} /> : <Ic n={iconOf(c.type)} />}</span>
            <span className="dpx-wd-name"><b>{c.name}</b><small>{c.pay ? "Saldo digital" : c.type === "bank" ? "Rekening bank" : c.type === "ewallet" ? "Dompet digital" : c.type === "card" ? "Kartu" : c.type === "cash" ? "Tunai" : "Dompet"}</small></span>
            {front ? (c.needsOpening ? <span className="dpx-wd-warn">Saldo awal belum diisi</span> : null) : <span className={`dpx-wd-mini ${c.balance < 0 ? "neg" : ""}`}>{c.balance < 0 ? "−" : ""}{ctx.visible ? <>Rp {Math.abs(Math.round(c.balance)).toLocaleString("id-ID")}</> : "•••••"}</span>}
          </div>
          {front ? <>
            <div className={`dpx-wd-amt ${c.balance < 0 ? "neg" : ""}`}><small>Rp</small>{ctx.visible ? <>{c.balance < 0 ? "−" : ""}<AnimatedNumber key={c.id} value={Math.abs(c.balance)} /></> : "•••••••"}</div>
            <div className="dpx-wd-foot"><div><small>Masuk bulan ini</small><b>{mask(rupiah(stats.inn))}</b></div><i /><div><small>Keluar bulan ini</small><b>{mask(rupiah(stats.out))}</b></div></div>
          </> : null}
        </motion.div>; })}
    </div>
    <div className="dpx-wd-dots" role="tablist" aria-label="Pilih dompet">{cards.map((c, i) => <button key={c.id} type="button" role="tab" aria-selected={i === sel} aria-label={c.name} className={i === sel ? "on" : ""} onClick={() => go(i)} />)}<button type="button" className="add" aria-label="Tambah dompet" onClick={() => ctx.open({ k: "account" })}>+</button></div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={cur.id} className="dpx-wd-panel" initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir }} transition={{ duration: 0.2 }}>
        <div className="dpx-wd-acts">
          {cur.pay ? <>
            <Btn type="button" className="dpx-wd-act" onClick={() => ctx.nav.go("/wallet/topup")}><Ic n="plus" /><span>Isi saldo</span></Btn><Btn type="button" className="dpx-wd-act" onClick={() => ctx.nav.go("/wallet/transfer")}><Ic n="send" /><span>Kirim</span></Btn><Btn type="button" className="dpx-wd-act" onClick={() => ctx.nav.go("/wallet/transfer?mode=scan")}><Ic n="scan" /><span>Scan QR</span></Btn><Btn type="button" className="dpx-wd-act" onClick={() => ctx.nav.go("/bayar")}><Ic n="flash" /><span>Bayar</span></Btn></>
            : <>
            <Btn type="button" className="dpx-wd-act" onClick={() => ctx.open({ k: "account", id: cur.id })}><Ic n="edit" /><span>{cur.needsOpening ? "Isi saldo awal" : "Ubah"}</span></Btn><Btn type="button" className="dpx-wd-act" onClick={() => ctx.open({ k: "catat" })}><Ic n="plus" /><span>Catat</span></Btn><Btn type="button" className="dpx-wd-act" onClick={() => ctx.nav.go("/riwayat")}><Ic n="list" /><span>Catatan</span></Btn></>}
        </div>
        {recent.length ? <><div className="dpx-glabel">Terakhir di {cur.name}</div><div className="dpx-group dpx-flush dpx-white">{recent.map((e, i) => <EntryRow key={e.id} entry={e} state={state} i={i} onOpen={(id) => ctx.open({ k: "entry", id })} />)}</div></> : <p className="dpx-sub dpx-center" style={{ margin: "8px 0 0" }}>Belum ada catatan di {cur.name}.</p>}
      </motion.div>
    </AnimatePresence>
  </div>;
}
