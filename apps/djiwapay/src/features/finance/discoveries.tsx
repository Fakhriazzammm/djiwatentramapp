import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import { Btn, Header, Ic, Reveal, Seg, Sheet, Sky, spring, type IconName } from "../shell/dpx-ui";
import type { FinCtx } from "./fin-pages";
import { rupiah } from "../../lib/djiwa-pay-format";
import { billExists, mergeTargets, movedEntries, type Discovery, type DiscoveryGroup } from "../../lib/finance/discover";
import type { Account, AccountType } from "../../lib/finance/types";
import { useInbound } from "../integrations/integrations-pages";
import "./discoveries.css";

const GROUPS: readonly (readonly [DiscoveryGroup | "all", string])[] = [["all", "Semua"], ["dompet", "Dompet"], ["tagihan", "Tagihan"], ["langganan", "Langganan"]];
const TYPES: readonly (readonly [AccountType, string])[] = [["bank", "Bank"], ["ewallet", "E-wallet"], ["card", "Kartu"], ["cash", "Tunai"], ["other", "Lainnya"]];
const ICON: Record<Discovery["kind"], IconName> = { account: "wallet", recurring: "repeat", price: "trend", stopped: "clock" };
const TONE: Record<Discovery["kind"], string> = { account: "blue", recurring: "violet", price: "amber", stopped: "slate" };
const date = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

/** A number that counts up to its value, so a change is felt and not just replaced. */
function Count({ to, format = (n: number) => String(Math.round(n)) }: { to: number; format?: (n: number) => string }) {
  const v = useMotionValue(0), [text, setText] = useState(format(0)), reduce = useReducedMotion();
  useEffect(() => { if (reduce) { setText(format(to)); return; } const c = animate(v, to, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (n) => setText(format(n)) }); return () => c.stop(); }, [to]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <>{text}</>;
}

/** The last payments as small bars that grow in, the proof that a pattern is real. */
function Proof({ list }: { list: Discovery["proof"] }) {
  const max = Math.max(...list.map((p) => p.amount), 1), rows = [...list].reverse();
  return <div className="dpx-df-proof" aria-label={`Pembayaran terakhir: ${rows.map((p) => `${date(p.at)} ${rupiah(p.amount)}`).join(", ")}`}>
    {rows.map((p, i) => <div key={p.at + i} className="dpx-df-bar"><motion.i initial={{ scaleY: 0 }} animate={{ scaleY: Math.max(0.18, p.amount / max) }} transition={{ ...spring, delay: 0.12 + i * 0.07 }} /><span>{date(p.at)}</span></div>)}
  </div>;
}

function Card({ d, i, ctx, busy, onPrimary, onLater, onNo, onMore }: { d: Discovery; i: number; ctx: FinCtx; busy: boolean; onPrimary: () => void; onLater: () => void; onNo: () => void; onMore: () => void }) {
  const x = useMotionValue(0), reduce = useReducedMotion();
  const rightOp = useTransform(x, [20, 110], [0, 1]), leftOp = useTransform(x, [-110, -20], [1, 0]), tilt = useTransform(x, [-160, 0, 160], [-3, 0, 3]);
  const done = (_: unknown, info: PanInfo) => { if (info.offset.x > 110) onPrimary(); else if (info.offset.x < -110) onLater(); };
  const label = d.kind === "account" ? "Simpan" : d.kind === "recurring" ? "Simpan tagihan" : d.kind === "price" ? `Perbarui jadi ${rupiah(d.newAmount ?? 0)}` : "Sudah berhenti";
  const swipeRight = d.kind === "account" ? "Simpan" : d.kind === "stopped" ? "Berhenti" : d.kind === "price" ? "Perbarui" : "Simpan";
  return <motion.li layout="position" className="dpx-df-wrap" initial={reduce ? false : { opacity: 0, y: 26, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 80, scale: 0.94, transition: { duration: 0.22 } }} transition={{ ...spring, delay: Math.min(i, 6) * 0.06 }}>
    <motion.span className="dpx-df-hint is-yes" style={{ opacity: rightOp }} aria-hidden="true"><Ic n="check" size="sm" />{swipeRight}</motion.span>
    <motion.span className="dpx-df-hint is-later" style={{ opacity: leftOp }} aria-hidden="true">Nanti<Ic n="clock" size="sm" /></motion.span>
    <motion.article className={`dpx-df-card k-${d.kind}`} style={{ x, rotate: reduce ? 0 : tilt }} drag={reduce || busy ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5} dragSnapToOrigin onDragEnd={done} whileTap={{ cursor: "grabbing" }}>
      <header>
        <motion.span className={`dpx-df-ic t-${TONE[d.kind]}`} initial={{ rotate: -18, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...spring, delay: 0.1 + Math.min(i, 6) * 0.06 }}><Ic n={ICON[d.kind]} /></motion.span>
        <div><span className="dpx-df-lead">{d.lead}</span><h3>{d.title}</h3></div>
        {d.amount ? <b className="dpx-df-amt">{rupiah(d.amount)}</b> : null}
      </header>
      <p>{d.detail}</p>
      {d.kind === "price" ? <div className="dpx-df-diff" aria-hidden="true"><s>{rupiah(d.oldAmount ?? 0)}</s><Ic n="chev" size="sm" /><b>{rupiah(d.newAmount ?? 0)}</b></div> : null}
      {d.proof.length > 1 && d.kind !== "account" ? <Proof list={d.proof} /> : null}
      <footer>
        <Btn type="button" className="dpx-df-go" disabled={busy} onClick={onPrimary} whileTap={{ scale: 0.95 }}>{label}</Btn>
        {d.kind === "account" ? <Btn type="button" className="dpx-df-ghost" disabled={busy} onClick={onMore} whileTap={{ scale: 0.95 }}>Ubah / gabung</Btn> : <Btn type="button" className="dpx-df-ghost" disabled={busy} onClick={onLater} whileTap={{ scale: 0.95 }}>Nanti</Btn>}
        <Btn type="button" className="dpx-df-no" disabled={busy} onClick={onNo} whileTap={{ scale: 0.95 }} aria-label={`Bukan ini: ${d.title}`}>Bukan ini</Btn>
      </footer>
    </motion.article>
  </motion.li>;
}

/** Keep, rename, retype or merge a wallet that e-mail created. Merging moves every record and makes later mail for the old one land in the chosen wallet. */
function AccountSheet({ d, ctx, onClose, onSaved }: { d: Discovery; ctx: FinCtx; onClose: () => void; onSaved: (message: string, undo?: () => void) => void }) {
  const fin = ctx.fin, acct = fin.raw.accounts.find((a) => a.id === d.accountId);
  const [name, setName] = useState(acct?.name ?? d.title), [type, setType] = useState<AccountType>(acct?.type ?? "bank"), [into, setInto] = useState<string>(""), [busy, setBusy] = useState(false);
  const targets = useMemo(() => mergeTargets(fin.raw, d.accountId ?? ""), [fin.raw, d.accountId]);
  const count = fin.raw.entries.filter((e) => e.accountId === d.accountId || e.toAccountId === d.accountId).length;
  if (!acct) return null;
  const save = async () => {
    setBusy(true);
    try {
      if (into) {
        const target = fin.raw.accounts.find((a) => a.id === into)!, moved = movedEntries(fin.raw.entries, acct.id, into);
        await ctx.disc.merge(acct.id, into);
        for (const e of moved) fin.dispatch({ type: "entry/update", entry: e });
        fin.dispatch({ type: "account/archive", id: acct.id });
        await ctx.disc.decide([d.key], "saved");
        const back = moved.map((e) => fin.raw.entries.find((o) => o.id === e.id)!);
        onSaved(`${moved.length} catatan digabung ke ${target.name}`, () => { for (const e of back) fin.dispatch({ type: "entry/update", entry: e }); fin.dispatch({ type: "account/upsert", account: acct }); void ctx.disc.unmerge(acct.id); void ctx.disc.undo([d.key]); });
      } else {
        const next: Account = { ...acct, name: name.trim() || acct.name, type };
        fin.dispatch({ type: "account/upsert", account: next });
        await ctx.disc.decide([d.key], "saved");
        onSaved(`${next.name} disimpan`, () => { fin.dispatch({ type: "account/upsert", account: acct }); void ctx.disc.undo([d.key]); });
      }
      onClose();
    } catch { ctx.notify("Belum bisa menggabungkan. Coba lagi."); } finally { setBusy(false); }
  };
  return <Sheet title="Simpan dompet ini" onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>{d.lead}. Beri nama yang mudah dikenali, atau gabungkan bila ini sebenarnya dompet yang sudah ada.</p>
    <label className="dpx-field"><span>Nama</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} disabled={Boolean(into)} /></div></label>
    <div className="dpx-chips" style={{ margin: "10px -18px 0" }}>{TYPES.map(([k, l]) => <Btn key={k} type="button" className={`dpx-chip ${type === k ? "dpx-on" : ""}`} disabled={Boolean(into)} onClick={() => setType(k)}>{l}</Btn>)}</div>
    {targets.length ? <>
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Atau gabungkan ke dompet yang sudah ada</div>
      <div className="dpx-df-merge" role="radiogroup" aria-label="Gabungkan ke">
        {targets.map((t) => <Btn key={t.id} type="button" role="radio" aria-checked={into === t.id} className={`dpx-df-opt ${into === t.id ? "is-on" : ""}`} onClick={() => setInto(into === t.id ? "" : t.id)}><Ic n={t.type === "ewallet" ? "phone" : t.type === "cash" ? "wallet" : "bank"} size="sm" /><span>{t.name}</span>{into === t.id ? <motion.i layoutId="df-tick" transition={spring}><Ic n="check" size="sm" /></motion.i> : null}</Btn>)}
      </div>
      <AnimatePresence>{into ? <motion.p className="dpx-note dpx-info" style={{ marginTop: 10 }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><Ic n="info" /><span>{count} catatan dipindah ke {targets.find((t) => t.id === into)?.name}. Email berikutnya dari akun ini langsung masuk ke sana. Bisa dibatalkan setelahnya.</span></motion.p> : null}</AnimatePresence>
    </> : null}
    <Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : into ? "Gabungkan" : "Simpan dompet"}</Btn>
  </Sheet>;
}

export function DiscoveryPage({ ctx, onBack, onOpenReview }: { ctx: FinCtx; onBack: () => void; onOpenReview: () => void }) {
  const { disc, fin } = ctx, inbound = useInbound();
  const [group, setGroup] = useState<DiscoveryGroup | "all">("all"), [busy, setBusy] = useState(false), [open, setOpen] = useState<Discovery | null>(null), [bulk, setBulk] = useState(false);
  const list = useMemo(() => disc.items.filter((d) => group === "all" || d.group === group), [disc.items, group]);
  const counts = useMemo(() => Object.fromEntries(GROUPS.map(([k]) => [k, k === "all" ? disc.items.length : disc.items.filter((d) => d.group === k).length])) as Record<string, number>, [disc.items]);
  const sure = disc.items.filter((d) => d.confidence >= 0.9 && (d.kind === "recurring" || d.kind === "account"));
  const waiting = inbound.data?.review ?? 0, first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  useEffect(() => { if (group !== "all" && counts[group] === 0) setGroup("all"); }, [counts, group]);

  /** Every answer that changes a record, with the way back. */
  const accept = async (d: Discovery, quiet = false) => {
    if (d.kind === "account") { await disc.decide([d.key], "saved"); if (!quiet) ctx.notify(`${d.title} disimpan`, () => void disc.undo([d.key])); return; }
    if (d.kind === "recurring" && d.bill) {
      if (billExists(fin.raw.bills, d.bill)) { await disc.decide([d.key], "saved"); if (!quiet) ctx.notify(`${d.title} sudah ada di tagihan`); return; }
      const bill = { ...d.bill, paid: [] as string[] };
      fin.dispatch({ type: "bill/upsert", bill });
      await disc.decide([d.key], "saved");
      if (!quiet) ctx.notify(`${d.title} disimpan sebagai tagihan tiap tanggal ${bill.day}`, () => { fin.dispatch({ type: "bill/delete", id: bill.id }); void disc.undo([d.key]); });
      return;
    }
    if (d.kind === "price" && d.billId) {
      const old = fin.raw.bills.find((b) => b.id === d.billId);
      if (old) { fin.dispatch({ type: "bill/upsert", bill: { ...old, amount: d.newAmount ?? old.amount } }); }
      await disc.decide([d.key], "saved");
      if (!quiet) ctx.notify(`${d.title} kini ${rupiah(d.newAmount ?? 0)}`, () => { if (old) fin.dispatch({ type: "bill/upsert", bill: old }); void disc.undo([d.key]); });
      return;
    }
    await disc.decide([d.key], "dismissed");
    if (!quiet) ctx.notify(`${d.title} ditandai berhenti`, () => void disc.undo([d.key]));
  };
  const later = async (d: Discovery) => { await disc.decide([d.key], "snoozed", d.kind === "stopped" ? 30 : 7); ctx.notify("Ditunda, muncul lagi nanti", () => void disc.undo([d.key])); };
  const no = async (d: Discovery) => { await disc.decide([d.key], "dismissed"); ctx.notify("Tidak akan ditanyakan lagi", () => void disc.undo([d.key])); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const saveAll = () => run(async () => {
    setBulk(true);
    const keys: string[] = [];
    for (const d of sure) { await accept(d, true); keys.push(d.key); await new Promise((r) => setTimeout(r, 160)); }
    setBulk(false);
    ctx.notify(`${keys.length} temuan disimpan`, () => { void disc.undo(keys); for (const d of sure) if (d.bill) fin.dispatch({ type: "bill/delete", id: d.bill.id }); });
  });

  return <div className="dpx-page dpx-df-page"><Sky><div className="dpx-pad">
    <Header title="Temuan" onBack={onBack} />
    <Reveal>
      <section className="dpx-df-hero" aria-live="polite">
        <motion.span className="dpx-df-orb" aria-hidden="true" animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}><Ic n="spark" /></motion.span>
        <div><b className="dpx-df-big"><Count to={disc.items.length} /></b><span>{disc.items.length ? "temuan menunggu jawabanmu" : disc.ready ? "semua sudah terjawab" : "memeriksa catatanmu…"}</span></div>
        {!disc.ready ? <motion.i className="dpx-df-scan" aria-hidden="true" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }} /> : null}
      </section>
      <p className="dpx-df-lede">Djiwa Pay membaca email dan catatanmu untuk menemukan dompet baru, tagihan rutin, langganan, dan perubahan harga. Tidak ada yang disimpan tanpa persetujuanmu.</p>
    </Reveal>

    {disc.items.length > 1 ? <Seg id="df-group" label="Jenis temuan" fit value={group} onChange={setGroup} options={GROUPS.filter(([k]) => k === "all" || counts[k] > 0).map(([k, l]) => [k, <>{l}{counts[k] ? <em className="dpx-df-n">{counts[k]}</em> : null}</>] as const)} /> : null}

    <AnimatePresence>{sure.length > 1 && group === "all" ? <motion.div key="bulk" className="dpx-df-bulk" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
      <Btn type="button" className="dpx-df-all" disabled={busy} onClick={() => void saveAll()} whileTap={{ scale: 0.97 }}><Ic n="check" size="sm" />{bulk ? "Menyimpan…" : `Simpan ${sure.length} yang paling yakin`}</Btn>
    </motion.div> : null}</AnimatePresence>

    <ul className="dpx-df-list">
      <AnimatePresence mode="popLayout" initial={false}>
        {list.map((d, i) => <Card key={d.key} d={d} i={first.current ? i : 0} ctx={ctx} busy={busy} onPrimary={() => void run(() => accept(d))} onLater={() => void run(() => later(d))} onNo={() => void run(() => no(d))} onMore={() => setOpen(d)} />)}
      </AnimatePresence>
    </ul>

    {disc.ready && !disc.items.length ? <motion.div className="dpx-empty" style={{ paddingTop: 36 }} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
      <motion.span className="dpx-df-done" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.1 }}><Ic n="check" size="lg" /></motion.span>
      <b>Tidak ada temuan baru</b><p>Dompet, tagihan, dan langganan baru dari emailmu akan muncul di sini begitu terdeteksi.</p>
    </motion.div> : null}

    {waiting > 0 ? <Reveal i={2}><Btn type="button" className="dpx-df-review" onClick={onOpenReview} whileTap={{ scale: 0.98 }}><span className="dpx-df-rc">{waiting > 9 ? "9+" : waiting}</span><span><b>{waiting} email menunggu ditinjau</b><small>Pengirim baru dan tagihan dari email dikelola di sini agar tidak dobel</small></span><Ic n="chev" size="sm" /></Btn></Reveal> : null}

    <AnimatePresence>{open ? <AccountSheet key={open.key} d={open} ctx={ctx} onClose={() => setOpen(null)} onSaved={(m, undo) => ctx.notify(m, undo)} /> : null}</AnimatePresence>
  </div></Sky></div>;
}

/** Beranda: a small chip that counts the findings and opens the page. */
export function DiscoveryChip({ ctx }: { ctx: FinCtx }) {
  const n = ctx.disc.items.length;
  return <AnimatePresence>{n > 0 ? <motion.div key="chip" initial={{ opacity: 0, y: -10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring}>
    <Btn type="button" className="dpx-reviewchip dpx-df-chip" onClick={() => ctx.nav.go("/temuan")} whileTap={{ scale: 0.98 }} aria-label={`${n} temuan baru dari email dan catatanmu`}>
      <span className="dpx-rc-dot" aria-hidden="true"><motion.i className="dpx-df-pulse" animate={{ scale: [1, 1.9], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} /><Ic n="spark" size="sm" /></span>
      <span className="dpx-rc-t"><b>{n} temuan baru</b><span>Dompet, tagihan, atau langganan yang bisa disimpan</span></span><Ic n="chev" size="sm" />
    </Btn>
  </motion.div> : null}</AnimatePresence>;
}
