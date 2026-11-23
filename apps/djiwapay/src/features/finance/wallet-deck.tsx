import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber, Btn, I3, Ic, Seg, Sheet, spring, type IconName } from "../shell/dpx-ui";
import type { FinCtx } from "./fin-pages";
import { EntryRow } from "./fin-pages";
import { accountBalance, inMonth } from "../../lib/finance/calc";
import { planAdjustment, type AdjustMode } from "../../lib/finance/adjust";
import { MoneyInput } from "./fin-sheets";
import { PAY_ACCOUNT_ID } from "../../lib/finance/categories";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Account } from "../../lib/finance/types";
import { accountScope } from "../../lib/finance/scope";
import { checkWalletMail } from "../../lib/finance/integrations";

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


/** Re-reads one wallet's bank or e-wallet mail in Gmail (last 30 days); what was missed is recorded or waits for approval in Temuan. */
function useMailCheck(ctx: FinCtx) {
  const [checking, setChecking] = useState(false);
  const run = async (id: string, label: string) => {
    if (checking) return; setChecking(true); ctx.notify(`Memeriksa email ${label}…`);
    try {
      const r = await checkWalletMail(id, 30);
      await Promise.all([ctx.disc.refresh(), ctx.fin.retrySync?.()]);
      const o = r.outcomes, added = o.auto ?? 0, wait = (o.review ?? 0) + (o.staged ?? 0);
      ctx.notify(added || wait ? `Email ${r.issuer} dicek: ${added} dicatat otomatis${wait ? `, ${wait} menunggu persetujuanmu` : ""}` : r.processed ? `Email ${r.issuer} dicek. Semua transaksi 30 hari terakhir sudah tercatat` : `Tidak ada email ${r.issuer} dalam 30 hari terakhir`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      ctx.notify(code === "NOT_CONNECTED" || code === "SCOPE_MISSING" ? "Hubungkan Gmail di Integrasi agar email bisa diperiksa" : code === "NO_ISSUER" ? "Dompet ini bukan bank atau e-wallet yang dikenali, jadi tidak ada email yang bisa dicari" : "Belum bisa memeriksa Gmail. Coba lagi sebentar lagi");
    } finally { setChecking(false); }
  };
  return { checking, run };
}

type View = "pouch" | "swipe" | "stack";
const VIEW_KEY = "djiwa-fin-wallet-view";
const readView = (): View => { try { const v = localStorage.getItem(VIEW_KEY); return v === "swipe" || v === "stack" || v === "pouch" ? v : "pouch"; } catch { return "pouch"; } };
const saveView = (v: View) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode: the choice just isn't remembered */ } };
const VIEWS: { id: View; title: string; sub: string; icon: IconName }[] = [
  { id: "pouch", title: "Kantong", sub: "Kartu muncul dari dompet, ketuk untuk ganti", icon: "wallet" },
  { id: "swipe", title: "Geser", sub: "Kartu berjajar ke samping", icon: "card" },
  { id: "stack", title: "Daftar", sub: "Semua dompet bertumpuk", icon: "list" },
];
/** Where a card sits in the pouch by its distance from the chosen one: front, two behind it, then tucked away inside. */
const POS = [{ y: 0, s: 1, dim: 0 }, { y: -16, s: 0.95, dim: 0.14 }, { y: -30, s: 0.9, dim: 0.26 }];
const TUCKED = { y: 70, s: 0.9, dim: 0.3 };
const SPRING = { type: "spring", stiffness: 260, damping: 26 } as const;
const ALL_ID = "all";
const tagOf = (c: { id: string; pay: boolean; name: string }) => (c.id === ALL_ID ? "TOTAL" : c.pay ? "PAY" : c.name.split(/[\s•]/)[0].toUpperCase());

/**
 * The default view: cards rise out of a pouch. The front card flips to the next on tap or a sideways flick, the cards behind it
 * shuffle forward, and the previous one slips back into the pouch. The balance box opens the wallet's detail.
 */
function Pouch({ cards, sel, go, ctx, stats, hint, cur }: { cards: Card[]; sel: number; go: (i: number) => void; ctx: FinCtx; stats: { inn: number; out: number }; hint: boolean; cur: Card }) {
  const n = cards.length, mask = (t: string) => (ctx.visible ? t : "•••••"), neg = cur.balance < 0;
  // The card that just left the front tips up and back over the pile, then settles behind it.
  const prev = useRef(sel), [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    if (prev.current === sel) return;
    const id = cards[prev.current]?.id ?? null; prev.current = sel;
    if (!id) return; setLeaving(id); const t = window.setTimeout(() => setLeaving(null), 750); return () => window.clearTimeout(t);
  }, [sel]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <motion.div className="dpx-pc" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }}>
    <div className="dpx-pc-stage">
      {cards.map((c, i) => {
        const p = (i - sel + n) % n, pos = p < 3 ? POS[p] : TUCKED, front = p === 0, flip = leaving === c.id && n > 1;
        return <motion.div key={c.id} className="dpx-pc-card" style={{ background: `linear-gradient(145deg, ${c.skin.from}, ${c.skin.to})`, zIndex: p < 3 ? 5 - p : 1, pointerEvents: p < 3 ? "auto" : "none", transformPerspective: 900 }}
          animate={flip ? { y: [0, -108, -50, -44], rotateX: [0, 52, 26, 0], scale: [1, 1.03, 0.9, 0.84], opacity: [1, 1, 1, 0], zIndex: [7, 7, 0, 0] } : { y: pos.y, rotateX: 0, scale: pos.s, opacity: p < 3 ? 1 : 0 }}
          transition={flip ? { duration: 0.85, times: [0, 0.42, 0.72, 1], ease: "easeInOut" } : SPRING}
          drag={front && n > 1 ? "x" : false} dragSnapToOrigin dragElastic={0.5} dragMomentum={false}
          onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 60 || Math.abs(info.velocity.x) > 500) go(sel + (info.offset.x < 0 ? 1 : -1)); }}
          onTap={() => go(front ? sel + 1 : i)} whileTap={front ? { scale: 0.985 } : undefined}
          role="button" tabIndex={p < 3 ? 0 : -1} aria-label={front ? `${c.name}. Ketuk untuk ganti kartu` : `Tampilkan ${c.name}`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(front ? sel + 1 : i); } else if (front && e.key === "ArrowRight") go(sel + 1); else if (front && e.key === "ArrowLeft") go(sel - 1); }}>
          <i className="dpx-wd-sheen" />
          <div className="dpx-wd-head">
            <span className="dpx-wd-logo">{c.pay ? <I3 name="payment-wallet" px={26} /> : <Ic n={iconOf(c.type)} />}</span>
            <span className="dpx-wd-name"><b>{c.name}</b><small>{c.account ? `${accountScope(c.account) === "business" ? "Bisnis" : "Pribadi"} · ` : ""}{c.type === "all" ? "Ringkasan semua dompet" : c.pay ? "Saldo digital" : c.type === "bank" ? "Rekening bank" : c.type === "ewallet" ? "Dompet digital" : c.type === "card" ? "Kartu" : c.type === "cash" ? "Tunai" : "Dompet"}</small></span>
            <span className="dpx-pc-tag">{tagOf(c)}</span>
          </div>
          <motion.i className="dpx-pc-dim" initial={false} animate={{ opacity: pos.dim }} transition={SPRING} />
        </motion.div>;
      })}
    </div>
    <AnimatePresence>{hint && n > 1 ? <motion.div className="dpx-pc-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.6 }} aria-hidden="true">Ketuk atau geser kartu untuk ganti</motion.div> : null}</AnimatePresence>
    <div className="dpx-pc-pouch">
      <div className="dpx-pc-dots" role="tablist" aria-label="Pilih dompet">{cards.map((c, i) => <button key={c.id} type="button" role="tab" aria-selected={i === sel} aria-label={c.name} className={i === sel ? "on" : ""} onClick={() => go(i)} />)}</div>
      <div className="dpx-pc-totalwrap">
        <Btn type="button" className="dpx-pc-eye" onClick={ctx.onToggleVisible} aria-label={ctx.visible ? "Sembunyikan saldo" : "Tampilkan saldo"} aria-pressed={!ctx.visible}><Ic n={ctx.visible ? "eye" : "eyeoff"} size="sm" /></Btn>
        <Btn type="button" className="dpx-pc-total" onClick={() => { if (cur.id !== ALL_ID) ctx.open({ k: "wallet-view", id: cur.id }); }} aria-label={cur.id === ALL_ID ? `Total saldo semua dompet` : `Saldo ${cur.name}, ketuk untuk detail`}>
          <span className={`dpx-pc-amt ${neg ? "neg" : ""}`}><small>Rp</small>{ctx.visible ? <>{neg ? "−" : ""}<AnimatedNumber key={cur.id} value={Math.abs(cur.balance)} /></> : "•••••••"}</span>
          <span className="dpx-pc-lab">{cur.id === ALL_ID ? "Total saldo semua dompet" : `Saldo ${cur.name} · Detail ›`}</span>
        </Btn>
      </div>
      <div className="dpx-pc-pills">
        <div className="dpx-pc-pill"><Ic n="down" size="sm" /><small>Masuk bulan ini</small><b>{mask(rupiah(stats.inn))}</b></div>
        <div className="dpx-pc-pill out"><Ic n="up" size="sm" /><small>Keluar bulan ini</small><b>{mask(rupiah(stats.out))}</b></div>
      </div>
    </div>
  </motion.div>;
}

/**
 * Wallets as a deck of cards. The chosen card sits on top at full size, the others are stacked under it as strips.
 * Tap a strip to bring it forward, swipe the top card sideways to flip through, tap the list button to see every card as a strip.
 */
export function WalletDeck({ ctx, accounts, balances, onSelect, hideRecent }: { ctx: FinCtx; accounts: Account[]; balances: Record<string, number>; /** Told which wallet is chosen ("all" for the total card), so the page can show that wallet's records. */ onSelect?: (id: string) => void; hideRecent?: boolean }) {
  const { state, entries } = ctx.fin, now = new Date();
  const cards = useMemo<Card[]>(() => { const base: Card[] = [
    ...(ctx.fin.scope === "business" ? [] : [{ id: PAY_ACCOUNT_ID, name: "Djiwa Pay", type: "pay", balance: ctx.payBalance, skin: skinOf("Djiwa Pay", "pay"), pay: true, needsOpening: false }]),   // Djiwa Pay is personal
    ...accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: balances[a.id] ?? 0, skin: skinOf(a.name, a.type), pay: false, account: a, needsOpening: a.opening === 0 && (balances[a.id] ?? 0) < 0 })),
  ];
    if (base.length < 2) return base;
    return [{ id: ALL_ID, name: "Semua dompet", type: "all", balance: base.reduce((n, c) => n + c.balance, 0), skin: { from: "#4a4036", to: "#241d17", accent: "#f1e6d6" }, pay: false, needsOpening: false }, ...base];
  }, [accounts, balances, ctx.payBalance, ctx.fin.scope]);
  const mail = useMailCheck(ctx), [sel, setSel] = useState(0), [view, setView] = useState<View>(readView), [dir, setDir] = useState(1), [hint, setHint] = useState(true), [menu, setMenu] = useState(false);
  const lastMain = useRef<"pouch" | "swipe">(view === "stack" ? "pouch" : view);
  const pick = (v: View) => { setView(v); if (v !== "stack") lastMain.current = v; saveView(v); setMenu(false); };
  const cur = cards[Math.min(sel, cards.length - 1)];
  const statsOf = useMemo(() => { const m = new Map<string, { inn: number; out: number }>(); for (const e of entries) if (inMonth(e, now.getFullYear(), now.getMonth())) { const t = m.get(e.accountId) ?? { inn: 0, out: 0 }; if (e.kind === "in") t.inn += e.amount; else if (e.kind === "out") t.out += e.amount; m.set(e.accountId, t); } return m; }, [entries]);   // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => entries.filter((e) => cur.id === ALL_ID || e.accountId === cur.id).slice(0, 3), [entries, cur.id]);
  const statFor = (id: string) => { if (id !== ALL_ID) return statsOf.get(id) ?? { inn: 0, out: 0 }; let inn = 0, out = 0; statsOf.forEach((v) => { inn += v.inn; out += v.out; }); return { inn, out }; };
  const curId = cur.id;
  useEffect(() => { onSelect?.(curId); }, [curId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mask = (s: string) => (ctx.visible ? s : "•••••");
  const track = useRef<HTMLDivElement>(null);
  const scrollTo = (i: number, smooth = true) => { const el = track.current?.children[i] as HTMLElement | undefined; if (el && track.current) track.current.scrollTo({ left: el.offsetLeft - (track.current.clientWidth - el.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" }); };
  const go = (i: number) => { const n = (i + cards.length) % cards.length; setDir(n >= sel ? 1 : -1); setSel(n); setHint(false); if (view === "swipe") scrollTo(n); else if (view === "stack") pick(lastMain.current); };
  useEffect(() => { if (view === "swipe") scrollTo(sel, false); }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hintOn = useRef(true); hintOn.current = hint;
  useEffect(() => {   // nudge the row sideways a few times so people see it moves; stops at the first touch
    if (view !== "swipe" || cards.length < 2) return;
    let dead = false; const t = track.current; const timers: number[] = [];
    const nudge = () => { if (dead || !t || !hintOn.current || t.scrollLeft > 4) return; const t0 = performance.now(); t.style.scrollSnapType = "none";
      const step = (now: number) => { const k = Math.min(1, (now - t0) / 800); if (!hintOn.current || dead) { t.scrollLeft = 0; t.style.scrollSnapType = ""; return; } t.scrollLeft = Math.sin(k * Math.PI) * 56; if (k < 1) requestAnimationFrame(step); else { t.scrollLeft = 0; t.style.scrollSnapType = ""; } };
      requestAnimationFrame(step); };
    [900, 3400, 5900].forEach((d) => timers.push(window.setTimeout(nudge, d)));
    return () => { dead = true; timers.forEach(clearTimeout); if (t) t.style.scrollSnapType = ""; };
  }, [view, cards.length]);
  const raf = useRef(0);
  const onScroll = () => { if (raf.current) return; raf.current = requestAnimationFrame(() => { raf.current = 0; measure(); }); };
  const measure = () => { const t = track.current; if (!t) return; const mid = t.scrollLeft + t.clientWidth / 2; let best = 0, d = Infinity; Array.from(t.children).forEach((c, i) => { const el = c as HTMLElement, dd = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (dd < d) { d = dd; best = i; } }); if (best !== sel) { setDir(best > sel ? 1 : -1); setSel(best); } if (t.scrollLeft > 8) setHint(false); };
  const body = (c: Card, full: boolean) => { const st = statFor(c.id); return <>
    <motion.i className="dpx-wd-sheen" />
    <div className="dpx-wd-head">
      <span className="dpx-wd-logo">{c.pay ? <I3 name="payment-wallet" px={26} /> : <Ic n={iconOf(c.type)} />}</span>
      <span className="dpx-wd-name"><b>{c.name}</b><small>{c.account ? `${accountScope(c.account) === "business" ? "Bisnis" : "Pribadi"} · ` : ""}{c.type === "all" ? "Ringkasan semua dompet" : c.pay ? "Saldo digital" : c.type === "bank" ? "Rekening bank" : c.type === "ewallet" ? "Dompet digital" : c.type === "card" ? "Kartu" : c.type === "cash" ? "Tunai" : "Dompet"}</small></span>
      {full ? (c.needsOpening ? <span className="dpx-wd-warn">Saldo awal belum diisi</span> : null) : <span className={`dpx-wd-mini ${c.balance < 0 ? "neg" : ""}`}>{c.balance < 0 ? "−" : ""}{ctx.visible ? <>Rp {Math.abs(Math.round(c.balance)).toLocaleString("id-ID")}</> : "•••••"}</span>}
    </div>
    {full ? <>
      <div className={`dpx-wd-amt ${c.balance < 0 ? "neg" : ""}`}><small>Rp</small>{ctx.visible ? <>{c.balance < 0 ? "−" : ""}<AnimatedNumber key={c.id} value={Math.abs(c.balance)} /></> : "•••••••"}</div>
      <div className="dpx-wd-foot"><div><small>Masuk bulan ini</small><b>{mask(rupiah(st.inn))}</b></div><i /><div><small>Keluar bulan ini</small><b>{mask(rupiah(st.out))}</b></div></div>
    </> : null}</>; };
  const STACK_H = cards.length * (STRIP_H - 18) + 36;

  return <div className="dpx-wd">
    <div className="dpx-wd-top"><span className="dpx-sub">{cards.length} dompet</span>
      <div className="dpx-wd-tools"><div className="dpx-wd-menuwrap">
        <Btn type="button" className={`dpx-wd-tool ${view !== "pouch" ? "on" : ""}`} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Pilih tampilan kartu"><Ic n={VIEWS.find((v) => v.id === view)!.icon} size="sm" /></Btn>
        <AnimatePresence>{menu ? <>
          <div className="dpx-wd-scrim" onClick={() => setMenu(false)} />
          <motion.div className="dpx-wd-menu" role="menu" aria-label="Tampilan kartu" initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -4 }} transition={{ duration: 0.16 }} onKeyDown={(e) => { if (e.key === "Escape") setMenu(false); }}>
            {VIEWS.map((v) => <button key={v.id} type="button" role="menuitemradio" aria-checked={view === v.id} className={view === v.id ? "on" : ""} onClick={() => pick(v.id)}><Ic n={v.icon} /><span><b>{v.title}</b><small>{v.sub}</small></span><i aria-hidden="true">✓</i></button>)}
          </motion.div></> : null}</AnimatePresence></div>
        {cur.id !== ALL_ID && cur.id !== PAY_ACCOUNT_ID ? <Btn type="button" className="dpx-wd-tool" disabled={mail.checking} aria-busy={mail.checking} onClick={() => void mail.run(cur.id, cur.name)} aria-label={`Cek email ${cur.name}`}><motion.span style={{ display: "grid" }} animate={mail.checking ? { rotate: 360 } : { rotate: 0 }} transition={mail.checking ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}><Ic n="refresh" size="sm" /></motion.span></Btn> : null}
        {cur.id !== ALL_ID ? <Btn type="button" className="dpx-wd-tool" onClick={() => ctx.open({ k: "wallet-view", id: cur.id })} aria-label={`Detail ${cur.name}`}><Ic n="info" size="sm" /></Btn> : null}
        <Btn type="button" className="dpx-wd-tool dpx-wd-find" onClick={() => ctx.nav.go("/temuan?jenis=dompet")} aria-label={`Cari dompet dari email${ctx.disc.items.some((d) => d.group === "dompet") ? `, ${ctx.disc.items.filter((d) => d.group === "dompet").length} ditemukan` : ""}`}><Ic n="search" size="sm" />{ctx.disc.items.some((d) => d.group === "dompet") ? <i className="dpx-wd-badge">{ctx.disc.items.filter((d) => d.group === "dompet").length}</i> : null}</Btn>
        <Btn type="button" className="dpx-wd-tool" onClick={() => ctx.open({ k: "account" })} aria-label="Tambah dompet"><Ic n="plus" size="sm" /></Btn></div></div>
    {view === "swipe" ? <div className="dpx-wd-swipe">
      <div className="dpx-wd-track" ref={track} onScroll={onScroll} onPointerDown={() => setHint(false)} onTouchStart={() => setHint(false)}>
        {cards.map((c, i) => <div key={c.id} className={`dpx-wd-card swipe ${i === sel ? "front" : ""}`} style={{ background: `linear-gradient(145deg, ${c.skin.from}, ${c.skin.to})`, height: FOCUS_H }}
          role="button" aria-label={`${c.name}, saldo ${ctx.visible ? rupiah(c.balance) : "disembunyikan"}. Ketuk untuk detail`} tabIndex={0}
          onClick={() => { if (i !== sel) go(i); else (c.id !== ALL_ID ? ctx.open({ k: "wallet-view", id: c.id }) : undefined); }}
          onKeyDown={(e) => { if (e.key === "ArrowRight") go(sel + 1); else if (e.key === "ArrowLeft") go(sel - 1); else if ((e.key === "Enter" || e.key === " ") && i === sel) { e.preventDefault(); (c.id !== ALL_ID ? ctx.open({ k: "wallet-view", id: c.id }) : undefined); } }}>{body(c, true)}</div>)}
      </div>
      <AnimatePresence>{hint && cards.length > 1 ? <motion.div className="dpx-wd-hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.5 }} aria-hidden="true"><motion.span animate={{ x: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1 }}>‹</motion.span> Geser untuk dompet lain <motion.span animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 1 }}>›</motion.span></motion.div> : null}</AnimatePresence>
    </div> : view === "pouch" ? <Pouch cards={cards} sel={Math.min(sel, cards.length - 1)} go={go} ctx={ctx} stats={statFor(cur.id)} hint={hint} cur={cur} /> : <div className="dpx-wd-deck" style={{ height: STACK_H }}>
      {cards.map((c, idx) => <motion.div key={c.id} className="dpx-wd-card" style={{ background: `linear-gradient(145deg, ${c.skin.from}, ${c.skin.to})`, zIndex: idx, height: STRIP_H + 18, top: idx * (STRIP_H - 18) }}
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.025 }}
        role="button" tabIndex={0} aria-label={`${c.name}, ketuk untuk membuka`} onClick={() => go(idx)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(idx); } }} whileTap={{ scale: 0.99 }}>{body(c, false)}</motion.div>)}
    </div>}
    {view === "swipe" ? <div className="dpx-wd-dots" role="tablist" aria-label="Pilih dompet">{cards.map((c, i) => <button key={c.id} type="button" role="tab" aria-selected={i === sel} aria-label={c.name} className={i === sel ? "on" : ""} onClick={() => go(i)} />)}<button type="button" className="add" aria-label="Tambah dompet" onClick={() => ctx.open({ k: "account" })}>+</button></div> : null}
    {hideRecent ? null : <AnimatePresence mode="wait" initial={false}>
      <motion.div key={cur.id} className="dpx-wd-panel" initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir }} transition={{ duration: 0.2 }}>
        {recent.length ? <><div className="dpx-glabel">Terakhir di {cur.name}</div><div className="dpx-group dpx-flush dpx-white">{recent.map((e, i) => <EntryRow key={e.id} entry={e} state={state} i={i} onOpen={(id) => ctx.open({ k: "entry", id })} />)}</div></> : <p className="dpx-sub dpx-center" style={{ margin: "8px 0 0" }}>Belum ada catatan di {cur.name}.</p>}
      </motion.div>
    </AnimatePresence>}
  </div>;
}

/** Opens when a wallet card is tapped: balance, personal/business switch, this month, quick actions and the latest records. */
export function WalletDetailSheet({ ctx, id, onClose }: { ctx: FinCtx; id: string; onClose: () => void }) {
  const { fin } = ctx, pay = id === PAY_ACCOUNT_ID, account = pay ? undefined : fin.raw.accounts.find((a) => a.id === id);
  const now = new Date();
  if (!pay && !account) return null;
  const { checking, run: runCheck } = useMailCheck(ctx), checkMail = () => runCheck(id, account?.name ?? "");
  const name = pay ? "Djiwa Pay" : account!.name, balance = pay ? ctx.payBalance : accountBalance(account!, fin.allRecords);
  const mine = fin.allRecords.filter((e) => e.accountId === id || (e.kind === "tf" && e.toAccountId === id));
  const month = mine.filter((e) => inMonth(e, now.getFullYear(), now.getMonth())), inn = month.filter((e) => e.kind === "in").reduce((n, e) => n + e.amount, 0), out = month.filter((e) => e.kind === "out").reduce((n, e) => n + e.amount, 0);
  const skin = pay ? skinOf("Djiwa Pay", "pay") : skinOf(account!.name, account!.type), scope = account ? accountScope(account) : "personal";
  const mask = (t: string) => (ctx.visible ? t : "•••••");
  const go = (fn: () => void) => () => { onClose(); fn(); };
  const acts: [IconName, string, () => void][] = pay
    ? [["plus", "Isi saldo", () => ctx.nav.go("/wallet/topup")], ["send", "Kirim", () => ctx.nav.go("/wallet/transfer")], ["scan", "Scan QR", () => ctx.nav.go("/wallet/transfer?mode=scan")], ["flash", "Bayar", () => ctx.nav.go("/bayar")]]
    : [["wallet", "Sesuaikan", () => ctx.open({ k: "wallet-adjust", id })], ["edit", "Ubah", () => ctx.open({ k: "account", id })], ["plus", "Catat", () => ctx.open({ k: "catat" })], ["list", "Catatan", () => ctx.nav.go("/riwayat")]];
  return <Sheet title={name} onClose={onClose}>
    <motion.div className="dpx-wd-card dpx-wd-sheetcard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} style={{ background: `linear-gradient(145deg, ${skin.from}, ${skin.to})`, position: "relative", height: "auto", minHeight: 120 }}>
      <div className="dpx-wd-amt"><small>Rp</small>{ctx.visible ? <>{balance < 0 ? "−" : ""}<AnimatedNumber value={Math.abs(balance)} /></> : "•••••••"}</div>
      <div className="dpx-wd-foot"><div><small>Masuk bulan ini</small><b>{mask(rupiah(inn))}</b></div><i /><div><small>Keluar bulan ini</small><b>{mask(rupiah(out))}</b></div></div>
    </motion.div>
    {account ? <><div className="dpx-glabel" style={{ marginTop: 14 }}>Jenis dompet</div>
      <Seg id="wd-scope" label="Jenis dompet" fit value={scope} onChange={(next) => { fin.dispatch({ type: "account/upsert", account: { ...account, scope: next } }); ctx.notify(next === "business" ? `${account.name} jadi dompet bisnis` : `${account.name} jadi dompet pribadi`); }} options={[["personal", "Pribadi"], ["business", "Bisnis"]] as const} />
      <p className="dpx-sub" style={{ margin: "6px 4px 0" }}>{scope === "business" ? "Dihitung di keuangan bisnis, terpisah dari pribadi." : "Dihitung bersama keuangan pribadi."}</p></> : null}
    <div className="dpx-wd-acts dpx-wd-sheetacts" style={{ marginTop: 14, gridTemplateColumns: `repeat(${acts.length}, minmax(0, 1fr))` }}>
      {acts.map(([icon, label, fn]) => <Btn key={label} type="button" className="dpx-wd-act" onClick={go(fn)}><Ic n={icon} /><span>{label}</span></Btn>)}
    </div>
    {pay ? null : <Btn type="button" className="dpx-wd-act" style={{ width: "100%", marginTop: 10, flexDirection: "row", gap: 8 }} disabled={checking} onClick={() => void checkMail()} aria-busy={checking}><Ic n="refresh" size="sm" /><span>{checking ? "Memeriksa email…" : `Cek email ${name}`}</span></Btn>}
    {mine.length ? <><div className="dpx-glabel">Terakhir di {name}</div><div className="dpx-group dpx-flush dpx-white">{mine.slice(0, 4).map((e, i) => <EntryRow key={e.id} entry={e} state={fin.state} i={i} onOpen={(eid) => { onClose(); ctx.open({ k: "entry", id: eid }); }} />)}</div></> : <p className="dpx-sub dpx-center" style={{ margin: "10px 0 0" }}>Belum ada catatan di {name}.</p>}
  </Sheet>;
}

/** Match a wallet to what the bank app shows: type the real balance, see the gap, choose how to record it. */
export function WalletAdjustSheet({ ctx, id, onClose }: { ctx: FinCtx; id: string; onClose: () => void }) {
  const { fin } = ctx, account = fin.raw.accounts.find((a) => a.id === id);
  const current = account ? accountBalance(account, fin.allRecords) : 0;
  const [digits, setDigits] = useState(""), [minus, setMinus] = useState(current < 0 && account?.type === "card"), [mode, setMode] = useState<AdjustMode>(fin.allRecords.some((e) => e.accountId === id) ? "entry" : "opening");
  if (!account) return null;
  const typed = digits !== "", target = (minus ? -1 : 1) * Number(digits || 0), plan = typed ? planAdjustment(account, current, target, mode) : null, diff = plan?.diff ?? 0;
  const mask = (t: string) => (ctx.visible ? t : "•••••");
  const money = (n: number) => `${n < 0 ? "−" : ""}${rupiah(Math.abs(n))}`;
  const save = () => {
    if (!plan || plan.diff === 0) return;
    if (plan.account) { const before = account; fin.dispatch({ type: "account/upsert", account: plan.account }); ctx.notify(`Saldo ${account.name} disesuaikan`, () => fin.dispatch({ type: "account/upsert", account: before })); }
    else if (plan.entry) { const eid = plan.entry.id; fin.dispatch({ type: "entry/add", entry: plan.entry }); ctx.notify(`Selisih ${money(diff)} dicatat di ${account.name}`, () => fin.dispatch({ type: "entry/delete", id: eid })); }
    onClose();
  };
  return <Sheet title="Sesuaikan saldo" onClose={onClose}>
    <p className="dpx-sub" style={{ margin: "0 4px 10px" }}>Samakan saldo {account.name} di aplikasi dengan saldo sebenarnya di bank atau dompetnya.</p>
    <div className="dpx-group dpx-white" style={{ padding: "12px 16px" }}><div className="dpx-sub">Saldo di aplikasi sekarang</div><div style={{ font: "800 24px var(--font)", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{mask(money(current))}</div></div>
    <label className="dpx-field"><span>Saldo sebenarnya</span><MoneyInput value={digits} onChange={setDigits} label="Saldo sebenarnya" placeholder="0" big /></label>
    <label className="dpx-check" style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 4px 0", fontSize: 13, color: "var(--mute)" }}><input type="checkbox" checked={minus} onChange={(e) => setMinus(e.target.checked)} /> Saldo minus (misalnya tagihan kartu)</label>
    <AnimatePresence initial={false}>{typed ? <motion.div key="plan" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
      <div className={`dpx-note ${diff === 0 ? "" : diff > 0 ? "dpx-ok" : "dpx-danger"}`} role="status" style={{ marginTop: 12 }}><Ic n={diff === 0 ? "check" : "info"} /><div>{diff === 0 ? "Saldo sudah sama. Tidak ada yang perlu disesuaikan." : <><b>Selisih {diff > 0 ? "+" : "−"}{rupiah(Math.abs(diff))}</b> {diff > 0 ? "saldo sebenarnya lebih besar dari catatan." : "saldo sebenarnya lebih kecil dari catatan."}</>}</div></div>
      {diff !== 0 ? <><div className="dpx-glabel" style={{ marginTop: 14 }}>Cara mencatat</div>
        <Seg id="adj-mode" label="Cara mencatat selisih" fit value={mode} onChange={setMode} options={[["opening", "Koreksi saldo"], ["entry", "Catat selisih"]] as const} />
        <p className="dpx-sub" style={{ margin: "6px 4px 0" }}>{mode === "opening" ? "Mengubah saldo awal. Tidak muncul sebagai pemasukan atau pengeluaran, jadi laporan tidak terpengaruh." : `Dicatat sebagai ${diff > 0 ? "pemasukan" : "pengeluaran"} “Penyesuaian saldo” dan ikut dihitung di laporan.`}</p></> : null}
    </motion.div> : null}</AnimatePresence>
    <Btn type="button" className={`dpx-btn ${typed && diff !== 0 ? "" : "dpx-off"}`} disabled={!typed || diff === 0} onClick={save} style={{ marginTop: 14 }}>Sesuaikan saldo</Btn>
  </Sheet>;
}
