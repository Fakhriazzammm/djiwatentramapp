import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Header, Ic, Reveal, Seg, Sheet, Sky, SuccessMark, spring } from "../shell/dpx-ui";
import type { FinCtx } from "../finance/fin-pages";
import { CatIcon, MoneyInput, accName, catOf } from "../finance/fin-sheets";
import { rupiah } from "../../lib/djiwa-pay-format";
import { monthLabel } from "../../lib/djiwa-pay-summary";
import { CHANNEL_NAME, approveItem, approveReviewGroup, bulkReview, getReview, getReviewGroups, rejectItem, rejectReviewGroup, rereadItem, type ReviewGroup, type ReviewItem } from "../../lib/finance/integrations";
import { PaymentDetails } from "./payment-details";
import { ProcessingOverlay, type Proc } from "./review-progress";
import { tidyTitle } from "../../lib/finance/review-format";
import "./integrations-review.css";

const WIB = 7 * 3600_000;
const dayKey = (iso: string) => new Date(new Date(iso).getTime() + WIB).toISOString().slice(0, 10);
const dayLabel = (key: string) => {
  const today = dayKey(new Date().toISOString()), yesterday = dayKey(new Date(Date.now() - 86400_000).toISOString());
  if (key === today) return "Hari ini";
  if (key === yesterday) return "Kemarin";
  return new Date(`${key}T12:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
};
const timeOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".") : "");
const titleOf = (it: ReviewItem) => it.parsed.bill ? `Tagihan ${it.parsed.merchant ?? CHANNEL_NAME[it.channel] ?? ""}`.trim() : tidyTitle(it.parsed.details?.description || it.parsed.merchant || it.parsed.subject || CHANNEL_NAME[it.channel] || "Email pembayaran");
const kindOf = (it: ReviewItem): "in" | "out" => (it.parsed.kind === "in" || (!it.parsed.kind && it.parsed.direction === "in") ? "in" : "out");
/** A top-up moves the person's own money into a wallet: it is neither income nor spending. */
const isMove = (it: ReviewItem) => Boolean(it.parsed.transfer);
/** A sender we have no template for: nothing is recorded until the person says whether it was income or spending. */
/** A reminder that something is owed: it becomes a bill under "Kamu berutang", not an expense. */
const isBill = (it: ReviewItem) => Boolean(it.parsed.bill);
const dueLabel = (due?: string | null) => (due ? new Date(`${due}T12:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "tanpa tanggal");
const isGeneric = (it: ReviewItem) => Boolean(it.parsed.generic) && !it.parsed.kind;
const moveAmount = (it: ReviewItem) => it.parsed.transfer?.amount ?? it.parsed.amount ?? 0;
const sourceOf = (it: ReviewItem) => `${CHANNEL_NAME[it.channel] ?? it.parsed.issuer ?? "Email"}${it.parsed.accountHint ? ` ••${it.parsed.accountHint}` : ""}`;
const needsLook = (it: ReviewItem) => Boolean(it.parsed.flags?.length) || (it.parsed.categoryId ?? "lainnya") === "lainnya";

/** Shows the processing overlay while `fn` runs, then a short confirmation. `tick` reports how far a multi-step job is. */
async function withProc<T>(set: (p: Proc | null) => void, label: string, total: number, fn: (tick: (done: number) => void) => Promise<T>, doneText: (r: T) => string | null): Promise<T> {
  set({ label, done: 0, total, phase: "run" });
  const started = Date.now();
  try {
    const r = await fn((done) => set({ label, done, total, phase: "run" }));
    const text = doneText(r);
    await new Promise((res) => setTimeout(res, Math.max(0, 650 - (Date.now() - started))));   // a job that finishes at once still shows itself
    if (text) { set({ label, done: total, total, phase: "done", doneText: text }); await new Promise((res) => setTimeout(res, 850)); }
    return r;
  } finally { set(null); }
}

/* ---------- one row ---------- */
function Row({ item, ctx, selecting, selected, onToggle, onOpen, onQuick, busy }: { item: ReviewItem; ctx: FinCtx; selecting: boolean; selected: boolean; onToggle: () => void; onOpen: () => void; onQuick: () => void; busy: boolean }) {
  const p = item.parsed, state = ctx.fin.state, kind = kindOf(item), cat = catOf(state, p.categoryId ?? "lainnya"), ok = (p.amount ?? 0) > 0;
  return <div className={`dpx-rv-row ${selected ? "is-on" : ""}`}>
    <Btn type="button" className="dpx-rv-main" onClick={selecting ? onToggle : onOpen} aria-pressed={selecting ? selected : undefined} aria-label={`${selecting ? "Pilih" : "Buka"} ${titleOf(item)}`}>
      {selecting ? <span className={`dpx-rv-tick ${selected ? "is-on" : ""}`} aria-hidden="true">{selected ? <Ic n="check" size="sm" /> : null}</span> : <CatIcon cat={cat} size={44} />}
      <span className="dpx-rv-text">
        <b>{titleOf(item)}</b>
        <span className="dpx-rv-sub">{sourceOf(item)}{p.at ? ` · ${timeOf(p.at)}` : ""}</span>
        <span className="dpx-rv-chips">{p.settlement ? <i>Settlement</i> : null}<i>{isBill(item) ? "Belum dibayar" : isMove(item) ? `Pindah dana ke ${p.transfer?.toName ?? "dompet"}` : cat.name}</i>{isBill(item) ? <i className="is-warn">Jatuh tempo {dueLabel(p.due)}</i> : isGeneric(item) ? <i className="is-warn">Pemasukan atau pengeluaran?</i> : !isMove(item) && needsLook(item) ? <i className="is-warn">{(p.categoryId ?? "lainnya") === "lainnya" ? "Pilih kategori" : "Perlu dicek"}</i> : null}</span>
      </span>
      <span className={`dpx-rv-amt ${kind === "in" && !isMove(item) && !isGeneric(item) && !isBill(item) ? "is-in" : ""}`}>{ok ? (isMove(item) ? `⇄ ${rupiah(moveAmount(item))}` : isGeneric(item) || isBill(item) ? rupiah(p.amount ?? 0) : `${kind === "in" ? "+" : "−"}${rupiah(p.amount ?? 0)}`) : <em style={{ fontSize: 12, fontStyle: "normal", color: "var(--warn, #b4691a)", fontWeight: 600 }}>Nominal belum terbaca</em>}</span>
    </Btn>
    {!selecting && ok && !isGeneric(item) && !p.loanMail ? <Btn type="button" className="dpx-rv-ok" onClick={onQuick} disabled={busy} aria-label={`${isBill(item) ? "Jadikan tagihan" : "Setujui"} ${titleOf(item)}`}><Ic n="check" size="sm" /></Btn> : null}
  </div>;
}

/* ---------- detail sheet ---------- */
function DetailSheet({ item, ctx, onClose, onDone }: { item: ReviewItem; ctx: FinCtx; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const p = item.parsed, state = ctx.fin.state;
  const generic = isGeneric(item);
  const [kind, setKind] = useState<"in" | "out" | null>(generic ? p.suggest ?? null : kindOf(item));   // an unknown sender starts on the guess, if there is one, and still waits for "Setujui"
  const move = isMove(item);
  const [amount, setAmount] = useState(String(Math.round(move ? moveAmount(item) : p.amount ?? 0)));
  const [note, setNote] = useState(tidyTitle(p.details?.description || p.merchant || p.subject || ""));
  const [cat, setCat] = useState(generic && kind === "in" ? "bonus" : p.categoryId ?? (kind === "in" ? "bonus" : "lainnya"));   // a guessed spending category must not ride along with income
  const [account, setAccount] = useState(p.accountId ?? "tunai");
  const [busy, setBusy] = useState(false), [proc, setProc] = useState<Proc | null>(null);
  const [detail, setDetail] = useState(Boolean(p.details?.items?.length));
  const cats = state.categories.filter((c) => c.income === (kind === "in")), accounts = state.accounts.filter((a) => !a.archived);
  const accountOptions = accounts.some((a) => a.id === account) ? accounts : [...accounts, { id: account, name: accName(state, account) } as (typeof accounts)[number]];
  const act = async (fn: () => Promise<unknown>, done: string) => { setBusy(true); try { await withProc(setProc, "Memproses…", 1, async () => { await fn(); }, () => done); await onDone(done); } catch { ctx.notify("Gagal memproses. Datanya tetap aman. Coba lagi."); } finally { setBusy(false); } };
  const approve = () => act(async () => { await approveItem(item.id, { amount: Number(amount), kind: kind ?? undefined, categoryId: cat, accountId: account, note: note || undefined }); await ctx.fin.retrySync(); }, `${note || "Catatan"} ${rupiah(Number(amount))} tercatat`);
  return <Sheet title="Tinjau catatan" onClose={onClose}>
    <div className="dpx-rv-hero"><CatIcon cat={catOf(state, cat)} size={56} /><div><b>{tidyTitle(p.details?.description || p.merchant || p.subject || "Email pembayaran")}</b><span>{sourceOf(item)}{p.at ? ` · ${new Date(p.at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}, ${timeOf(p.at)}` : ""}</span></div></div>
    {!((p.amount ?? 0) > 0) ? <div className="dpx-note" style={{ marginTop: 0 }}><Ic n="info" /><div><b>Nominal belum terbaca.</b> Email ini tidak memuat angka yang bisa dibaca otomatis. Coba &quot;Lengkapi dari isi email&quot; di bawah, atau isi nominal sendiri lalu setujui.</div></div> : null}
    {move ? <div className="dpx-note" style={{ marginTop: 0 }}><Ic n="info" /><div><b>Top-up dicatat sebagai pindah dana.</b> Uang pindah dari akun asal ke {p.transfer?.toName ?? "dompet digital"}, jadi tidak dihitung sebagai pemasukan atau pengeluaran.{(p.transfer?.fee ?? 0) > 0 ? ` Biaya ${rupiah(p.transfer?.fee ?? 0)} dicatat sebagai pengeluaran terpisah.` : ""}</div></div> : null}
    {!move && !generic && needsLook(item) ? <div className="dpx-note" style={{ marginTop: 0 }}><Ic n="info" /><div>{p.flags?.length ? <><b>Perlu dicek.</b> {p.flags.join(", ")}</> : <><b>Kategori belum jelas.</b> Pilih yang paling pas di bawah.</>}</div></div> : null}
    <div className="dpx-glabel">Yang dicatat</div>
    {generic ? <div className="dpx-rv-ask"><div className="dpx-rv-ask-h"><b>Pengirim baru: {p.issuer ?? "belum dikenal"}</b><span>Uang ini masuk atau keluar? Kamu yang menentukan.{p.suggestFrom === "hint" ? " Pilihan di bawah dari jawabanmu sebelumnya untuk pengirim ini." : p.suggestFrom === "mail" ? " Pilihan di bawah hanya dugaan dari kata-kata di email, periksa dulu." : ""}</span></div>
      <div className="dpx-rv-kind" role="group" aria-label="Jenis catatan">
        <Btn type="button" className={`dpx-rv-kbtn is-out ${kind === "out" ? "is-on" : ""}`} aria-pressed={kind === "out"} onClick={() => { setKind("out"); setCat("lainnya"); }}><Ic n="down" /><b>Pengeluaran</b><small>Uang keluar</small></Btn>
        <Btn type="button" className={`dpx-rv-kbtn is-in ${kind === "in" ? "is-on" : ""}`} aria-pressed={kind === "in"} onClick={() => { setKind("in"); setCat("bonus"); }}><Ic n="up" /><b>Pemasukan</b><small>Uang masuk</small></Btn></div></div>
    : move ? null : <Seg id="rv-kind" label="Jenis" value={(kind ?? "") as "in" | "out"} onChange={(v) => { setKind(v); setCat(v === "in" ? "bonus" : "lainnya"); }} options={[["out", "Pengeluaran"], ["in", "Pemasukan"]] as const} />}
    <div style={{ marginTop: 10 }}><MoneyInput value={amount} onChange={setAmount} label="Nominal" /></div>
    <div className="dpx-input" style={{ marginTop: 8 }}><input aria-label="Keterangan" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Nama toko atau tujuan" /></div>
    {move ? null : <div className="dpx-glabel">Kategori</div>}
    {move ? null : <div className="dpx-rv-pick" role="group" aria-label="Kategori">{cats.map((c) => <Btn key={c.id} type="button" className={cat === c.id ? "is-on" : ""} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Btn>)}</div>}
    {move ? null : <div className="dpx-glabel">Dompet</div>}
    {move ? null : <div className="dpx-rv-pick" role="group" aria-label="Dompet">{accountOptions.map((a) => <Btn key={a.id} type="button" className={account === a.id ? "is-on" : ""} aria-pressed={account === a.id} onClick={() => setAccount(a.id)}>{a.name}</Btn>)}</div>}
    <Btn type="button" className="dpx-rv-disc" aria-expanded={detail} onClick={() => setDetail((v) => !v)}><span><b>Detail email</b><small>Rincian, pengirim, dan baca ulang</small></span><Ic n="chev" size="sm" /></Btn>
    {detail ? <div className="dpx-rv-detail">
      <div className="dpx-group dpx-white dpx-rv-details"><PaymentDetails details={p.details} /></div>
      <div className="dpx-rv-tools">
        <Btn type="button" className="dpx-rv-tool" disabled={busy} onClick={() => void act(() => rereadItem(item.id), "Rincian dibaca dari isi email")}><Ic n="refresh" size="sm" />{p.details ? "Baca ulang isi email" : "Lengkapi dari isi email"}</Btn>
        <div className="dpx-rv-from"><span>Dari {p.issuer ?? "pengirim"}</span><b>{p.subject || "Judul tidak tersedia"}</b></div>
      </div></div> : null}
    <div className="dpx-rv-footer">
      <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} disabled={busy} onClick={() => void act(() => rejectItem(item.id), "Email diabaikan")}>Abaikan</Btn>
      <Btn type="button" className="dpx-btn" style={{ margin: 0 }} disabled={busy || !(Number(amount) > 0) || (generic && !kind)} onClick={() => void approve()}>{busy ? "Memproses…" : generic && !kind ? "Pilih jenis dulu" : "Setujui"}</Btn>
    </div>
  <ProcessingOverlay proc={proc} />
  </Sheet>;
}

/* ---------- a bill reminder: confirm it as something owed ---------- */
function BillSheet({ item, ctx, onClose, onDone }: { item: ReviewItem; ctx: FinCtx; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const p = item.parsed;
  const [name, setName] = useState(p.merchant ?? CHANNEL_NAME[item.channel] ?? "Tagihan"), [amount, setAmount] = useState(String(Math.round(p.amount ?? 0))), [due, setDue] = useState(p.due ?? "");
  const [busy, setBusy] = useState(false), [proc, setProc] = useState<Proc | null>(null);
  const act = async (fn: () => Promise<unknown>, done: string) => { setBusy(true); try { await withProc(setProc, "Memproses…", 1, async () => { await fn(); await ctx.fin.retrySync(); }, () => done); await onDone(done); } catch { ctx.notify("Gagal memproses. Datanya tetap aman. Coba lagi."); } finally { setBusy(false); } };
  return <Sheet title="Tagihan dari email" onClose={onClose}>
    <div className="dpx-rv-hero"><CatIcon cat={catOf(ctx.fin.state, "tagihan")} size={56} /><div><b>Tagihan {name}</b><span>{p.issuer ?? "Email"} · jatuh tempo {dueLabel(due || null)}</span></div></div>
    <div className="dpx-note dpx-info" style={{ marginTop: 0 }}><Ic n="info" /><div><b>Belum dibayar, jadi belum jadi pengeluaran.</b> Setelah kamu setujui, tagihan ini masuk ke Kekayaan → Kewajiban → Tagihan bulanan, lengkap dengan jatuh tempo dan pengingat. Saat pembayarannya tercatat dari email, bulan itu otomatis ditandai lunas.</div></div>
    <div className="dpx-glabel">Tagihan bulanan</div>
    <div className="dpx-input"><input aria-label="Nama tagihan" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Nama tagihan" /></div>
    <div style={{ marginTop: 8 }}><MoneyInput value={amount} onChange={setAmount} label="Nominal tagihan" /></div>
    <label className="dpx-chip3 dpx-datefield" style={{ cursor: "pointer", marginTop: 8, display: "inline-flex" }}><Ic n="cal" size="sm" /> {due ? new Date(`${due}T12:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "Pilih jatuh tempo"}<input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Jatuh tempo" /></label>
    <p className="dpx-sub dpx-rv-from" style={{ marginTop: 10 }}><b>{p.subject || "Judul tidak tersedia"}</b></p>
    <div className="dpx-rv-footer">
      <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} disabled={busy} onClick={() => void act(() => rejectItem(item.id), "Email diabaikan")}>Abaikan</Btn>
      <Btn type="button" className="dpx-btn" style={{ margin: 0 }} disabled={busy || !(Number(amount) > 0) || !name.trim()} onClick={() => void act(() => approveItem(item.id, { amount: Number(amount), note: name.trim(), at: due || undefined }), `Tagihan ${name.trim()} masuk ke Tagihan bulanan`)}>{busy ? "Memproses…" : "Jadikan tagihan"}</Btn>
    </div>
  <ProcessingOverlay proc={proc} />
  </Sheet>;
}

function LoanMailSheet({ item, ctx, onClose, onDone }: { item: ReviewItem; ctx: FinCtx; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const parsed = item.parsed;
  const reminder = parsed.loanMail === "reminder";
  const loans = ctx.fin.state.loans.filter((loan) => loan.kind === "kpr" && loan.balance > 0);
  const [loanId, setLoanId] = useState("");
  const [account, setAccount] = useState(parsed.accountId ?? "tunai");
  const [amount, setAmount] = useState(parsed.amount ? String(Math.round(parsed.amount)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (reject: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (reject) await rejectItem(item.id);
      else await approveItem(item.id, { loanId, accountId: account, amount: Number(amount) });
      await ctx.fin.retrySync();
      await onDone(reject ? "Email diabaikan" : reminder ? "Email ditautkan ke KPR" : "Angsuran KPR tercatat");
    } catch {
      setError("Email belum diproses. Periksa pinjaman, riwayat angsuran, dan nominalnya.");
    } finally {
      setBusy(false);
    }
  };
  return <Sheet title={reminder ? "Tagihan KPR dari email" : "Bukti bayar KPR dari email"} onClose={onClose}>
    <p className="dpx-sub">{parsed.issuer} · {parsed.subject}</p>
    {reminder ? <p className="dpx-sub">Tagihan {rupiah(parsed.amount ?? 0)} · jatuh tempo {dueLabel(parsed.due)}. Pilih KPR untuk menautkan pengingat ke tagihan yang sudah ada.</p> : <p className="dpx-sub">Pilih KPR dan dompet pencatatan. Angsuran akan ditandai lunas dan porsi pokok mengurangi sisa pinjaman.</p>}
    <label className="dpx-field"><span>Pinjaman KPR</span><div className="dpx-input"><select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
      <option value="">Pilih KPR</option>{loans.map((loan) => <option value={loan.id} key={loan.id}>{loan.name}</option>)}
    </select></div></label>
    {!reminder ? <>
      <label className="dpx-field"><span>Nominal angsuran</span><MoneyInput value={amount} onChange={setAmount} /></label>
      <label className="dpx-field"><span>Dompet pencatatan</span><div className="dpx-input"><select value={account} onChange={(e) => setAccount(e.target.value)}>
        {ctx.fin.state.accounts.some((a) => a.id === account) ? null : <option value={account}>{accName(ctx.fin.state, account)}</option>}
        {ctx.fin.state.accounts.filter((a) => !a.archived || a.id === account).map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}
      </select></div></label>
    </> : null}
    {error ? <p role="alert" className="dpx-error">{error}</p> : null}
    <div className="dpx-rv-footer">
      <Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={() => void act(true)}>Abaikan</Btn>
      <Btn type="button" className="dpx-btn" disabled={busy || !loanId || (!reminder && !(Number(amount) > 0))} onClick={() => void act(false)}>{reminder ? "Tautkan ke KPR" : "Catat angsuran"}</Btn>
    </div>
    <Btn type="button" className="dpx-linkbtn" onClick={() => {
      onClose();
      ctx.open({ k: "loan", draft: {
        name: `KPR ${parsed.issuer ?? ""}`.trim(), kind: "kpr", lender: parsed.issuer ?? "", model: "anuitas",
        principal: 0, months: 0, dueDay: parsed.due ? Number(parsed.due.slice(-2)) : 0,
        fixedRate: 0, fixedMonths: 0, floatRate: 0, installment: parsed.amount ?? null,
      } });
    }}>Jadikan KPR baru</Btn>
  </Sheet>;
}

/* ---------- grouped by shop ---------- */
const span = (g: ReviewGroup) => {
  if (!g.firstAt || !g.lastAt) return "";
  const f = new Date(g.firstAt), l = new Date(g.lastAt), fmt = (d: Date) => d.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
  return fmt(f) === fmt(l) ? fmt(l) : `${fmt(f)} – ${fmt(l)}`;
};

function GroupRow({ g, ctx, onOpen }: { g: ReviewGroup; ctx: FinCtx; onOpen: () => void }) {
  const cat = catOf(ctx.fin.state, g.categoryId);
  return <Btn type="button" className="dpx-rv-grow" onClick={onOpen} aria-label={`Buka kelompok ${tidyTitle(g.name)}, ${g.count} transaksi`}>
    <CatIcon cat={cat} size={44} />
    <span className="dpx-rv-text">
      <b>{tidyTitle(g.name)}</b>
      <span className="dpx-rv-sub">{g.count} transaksi{span(g) ? ` · ${span(g)}` : ""}</span>
      <span className="dpx-rv-chips"><i>{cat.name}</i>{g.categoryId === "lainnya" ? <i className="is-warn">Pilih kategori</i> : null}{g.flagged ? <i className="is-warn">{g.flagged} perlu dicek</i> : null}</span>
    </span>
    <span className={`dpx-rv-amt ${g.kind === "in" ? "is-in" : ""}`}>{g.kind === "in" ? "+" : "−"}{rupiah(g.total)}</span>
  </Btn>;
}

function GroupSheet({ g, ctx, onClose, onApproved, onRejected }: { g: ReviewGroup; ctx: FinCtx; onClose: () => void; onApproved: (result: Result) => Promise<void>; onRejected: (n: number) => Promise<void> }) {
  const state = ctx.fin.state;
  const [cat, setCat] = useState(g.categoryId);
  const [busy, setBusy] = useState(false), [confirmReject, setConfirmReject] = useState(false), [proc, setProc] = useState<Proc | null>(null);
  const cats = state.categories.filter((c) => c.income === (g.kind === "in"));
  const ready = g.count - g.flagged;
  const approve = async () => {
    setBusy(true);
    try {
      const r = await withProc(setProc, `Mencatat ${ready} transaksi ${g.name}…`, 1, async () => { const x = await approveReviewGroup(g.key, cat); await ctx.fin.retrySync(); return x; }, (x) => `${x.approved} transaksi dicatat`);
      await onApproved({ count: r.approved, income: r.income, expense: r.expense, uncategorised: cat === "lainnya" ? r.approved : 0, remaining: 0, months: r.months });
    } catch { ctx.notify("Gagal memproses. Datanya tetap aman. Coba lagi."); } finally { setBusy(false); }
  };
  const reject = async () => { setBusy(true); try { const r = await withProc(setProc, "Mengabaikan…", 1, () => rejectReviewGroup(g.key), (x) => `${x.rejected} email diabaikan`); await onRejected(r.rejected); } catch { ctx.notify("Gagal memproses. Coba lagi."); } finally { setBusy(false); } };
  return <Sheet title="Satu toko, sekali putus" onClose={onClose}>
    <div className="dpx-rv-hero"><CatIcon cat={catOf(state, cat)} size={56} /><div><b>{tidyTitle(g.name)}</b><span>{g.count} transaksi{span(g) ? ` · ${span(g)}` : ""} · {g.kind === "in" ? "+" : "−"}{rupiah(g.total)}</span></div></div>
    <div className="dpx-group dpx-white dpx-flush">{g.sample.map((x, i) => <div key={i} className="dpx-kv"><span>{x.at ? new Date(x.at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "Tanggal belum terbaca"}</span><b>{g.kind === "in" ? "+" : "−"}{rupiah(x.amount)}</b></div>)}{g.count > g.sample.length ? <div className="dpx-kv"><span>dan {g.count - g.sample.length} transaksi lain</span><b /></div> : null}</div>
    <div className="dpx-glabel">Kategori untuk semuanya</div>
    <div className="dpx-rv-pick" role="group" aria-label="Kategori">{cats.map((c) => <Btn key={c.id} type="button" className={cat === c.id ? "is-on" : ""} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Btn>)}</div>
    {cat === "lainnya" ? <div className="dpx-note"><Ic n="info" /><div>“Lainnya” membuat laporan per kategori tidak berguna. Pilih yang paling pas bila bisa.</div></div> : <div className="dpx-note dpx-info"><Ic n="check" /><div>Toko ini akan diingat. Email berikutnya dari {tidyTitle(g.name)} langsung masuk ke <b>{catOf(state, cat).name}</b>.</div></div>}
    {g.flagged ? <div className="dpx-note dpx-danger"><Ic n="warn" /><div><b>{g.flagged} transaksi tidak ikut.</b> Pembaca menandainya perlu dicek. Tinjau satu per satu di tampilan “Per hari”.</div></div> : null}
    {confirmReject ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Abaikan {g.count} email dari toko ini?</b> Tidak ada yang dicatat.<div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" disabled={busy} onClick={() => void reject()}>Ya, abaikan</Btn><Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => setConfirmReject(false)}>Batal</Btn></div></div></div> : null}
    <div className="dpx-rv-footer">
      <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} disabled={busy} onClick={() => setConfirmReject(true)}>Abaikan</Btn>
      <Btn type="button" className="dpx-btn" style={{ margin: 0 }} disabled={busy || ready <= 0} onClick={() => void approve()}>{busy ? "Mencatat…" : `Catat ${ready} transaksi`}</Btn>
    </div>
    <ProcessingOverlay proc={proc} />
    </Sheet>;
}

/* ---------- what just happened ---------- */
type Result = { count: number; income: number; expense: number; uncategorised: number; remaining: number; months: { y: number; m: number; n: number; out: number; inc: number }[] };
const resultOf = (list: ReviewItem[], remaining: number): Result => {
  const months = new Map<string, Result["months"][number]>();
  let income = 0, expense = 0, uncategorised = 0;
  for (const it of list) {
    const amount = it.parsed.amount ?? 0, kind = kindOf(it), d = new Date(it.parsed.at ?? it.createdAt), key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = months.get(key) ?? { y: d.getFullYear(), m: d.getMonth(), n: 0, out: 0, inc: 0 };
    row.n++; if (kind === "in") { row.inc += amount; income += amount; } else { row.out += amount; expense += amount; }
    months.set(key, row);
    if ((it.parsed.categoryId ?? "lainnya") === "lainnya") uncategorised++;
  }
  return { count: list.length, income, expense, uncategorised, remaining: Math.max(0, remaining), months: [...months.values()].sort((a, b) => b.y * 12 + b.m - (a.y * 12 + a.m)) };
};
const monthParam = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

function ResultSheet({ r, ctx, onClose }: { r: Result; ctx: FinCtx; onClose: () => void }) {
  const go = (path: string) => { onClose(); ctx.nav.go(path); };
  const latest = r.months[0];
  return <Sheet title="Berhasil dicatat" onClose={onClose}>
    <div className="dpx-rv-ok-hero"><SuccessMark /><b>{r.count} transaksi masuk ke Catatan</b>
      <span>{r.expense ? `Keluar ${rupiah(r.expense)}` : ""}{r.expense && r.income ? " · " : ""}{r.income ? `Masuk +${rupiah(r.income)}` : ""}</span></div>
    <div className="dpx-glabel" style={{ marginTop: 6 }}>Tercatat di bulan</div>
    <div className="dpx-group dpx-white dpx-flush">{r.months.slice(0, 6).map((x) => <Btn key={`${x.y}-${x.m}`} type="button" className="dpx-rv-mrow" onClick={() => go(`/riwayat?bulan=${monthParam(x.y, x.m)}`)}>
      <span><b>{monthLabel(x.y, x.m)}</b><small>{x.n} transaksi</small></span><span className="dpx-rv-mamt">{x.out ? `−${rupiah(x.out)}` : ""}{x.inc ? <em>+{rupiah(x.inc)}</em> : null}</span><Ic n="chev" size="sm" />
    </Btn>)}{r.months.length > 6 ? <div className="dpx-kv"><span>dan {r.months.length - 6} bulan lain</span><b /></div> : null}</div>
    {r.uncategorised ? <div className="dpx-note"><Ic n="info" /><div><b>{r.uncategorised} masih berkategori “Lainnya”.</b> Laporan per kategori baru bermakna setelah dipilihkan. Ubah di Catatan, dan toko yang sama akan dikenali lain kali.</div></div> : null}
    <div className="dpx-note dpx-info"><Ic n="shield" /><div>Catatan ini ikut muncul di Spreadsheet-mu dalam beberapa menit bila Google sudah terhubung. Salah catat? Buka catatannya lalu pilih Hapus.</div></div>
    <div className="dpx-rv-next">
      <Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={() => latest ? go(`/riwayat?bulan=${monthParam(latest.y, latest.m)}`) : go("/riwayat")}>Lihat di Catatan</Btn>
      {r.remaining > 0 ? <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={onClose}>Lanjut meninjau ({r.remaining})</Btn> : <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => go("/ringkasan")}>Lihat laporan</Btn>}
    </div>
  </Sheet>;
}

/* ---------- page ---------- */
export function ReviewPage({ ctx, onBack, onOpenIntegrations }: { ctx: FinCtx; onBack: () => void; onOpenIntegrations: () => void }) {
  const [items, setItems] = useState<ReviewItem[]>([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null), [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<{ count: number; y: number; m: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null), [proc, setProc] = useState<Proc | null>(null);
  const [view, setView] = useState<"toko" | "hari">("toko");
  const [shops, setShops] = useState<ReviewGroup[]>([]), [groupedItems, setGroupedItems] = useState(0), [groupsLoading, setGroupsLoading] = useState(true), [openGroup, setOpenGroup] = useState<string | null>(null);
  const loadGroups = useCallback(async () => { setGroupsLoading(true); try { const r = await getReviewGroups(); setShops(r.groups); setGroupedItems(r.groupedItems); setError(false); } catch { setError(true); } finally { setGroupsLoading(false); } }, []);
  /** Remember what was just recorded, so the page can point at where it went (a past month is not on the default Catatan view). */
  const markDone = (list: ReviewItem[]) => {
    if (!list.length) return;
    const latest = list.map((i) => new Date(i.parsed.at ?? i.createdAt)).sort((a, b) => b.getTime() - a.getTime())[0];
    setDone((cur) => ({ count: (cur?.count ?? 0) + list.length, y: latest.getFullYear(), m: latest.getMonth() }));
  };

  const load = useCallback(async (more = false) => {
    setLoading(true);
    try { const r = await getReview(more ? items.length : 0); setItems((prev) => more ? [...new Map([...prev, ...r.items].map((x) => [x.id, x])).values()] : r.items); setTotal(r.total); setError(false); }
    catch { setError(true); } finally { setLoading(false); }
  }, [items.length]);
  useEffect(() => { void load(); void loadGroups(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, ReviewItem[]>();
    for (const it of items) { const k = dayKey(it.parsed.at ?? it.createdAt); m.set(k, [...(m.get(k) ?? []), it]); }
    return [...m].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [items]);
  const chosen = items.filter((i) => selected.has(i.id)), approvable = chosen.filter((i) => (i.parsed.amount ?? 0) > 0 && !isGeneric(i) && !i.parsed.loanMail && !isBill(i));
  const outTotal = items.filter((i) => !isMove(i) && !isGeneric(i) && !i.parsed.loanMail && !isBill(i) && kindOf(i) === "out").reduce((n, i) => n + (i.parsed.amount ?? 0), 0), inTotal = items.filter((i) => !isMove(i) && !isGeneric(i) && !i.parsed.loanMail && !isBill(i) && kindOf(i) === "in").reduce((n, i) => n + (i.parsed.amount ?? 0), 0);
  const open = items.find((i) => i.id === openId) ?? null;
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const leaveSelect = () => { setSelecting(false); setSelected(new Set()); setConfirm(null); };

  // The selection must always point at records that still exist: after a refresh a stale id would leave "49 dipilih" on an empty list.
  useEffect(() => {
    if (!selecting || loading) return;
    const present = new Set(items.map((i) => i.id));
    setSelected((prev) => { const n = new Set([...prev].filter((id) => present.has(id))); return n.size === prev.size ? prev : n; });
    if (!items.length) { setSelecting(false); setConfirm(null); }
  }, [items, selecting, loading]);

  const quick = async (it: ReviewItem) => {
    if (busy) return; setBusy(true);
    try {
      if (isBill(it)) {
        await withProc(setProc, "Menyimpan tagihan…", 1, async () => { await approveItem(it.id, { amount: it.parsed.amount, note: it.parsed.merchant, at: it.parsed.due ?? undefined }); await ctx.fin.retrySync(); await load(); }, () => "Masuk ke Tagihan");
        ctx.notify(`${titleOf(it)} ${rupiah(it.parsed.amount ?? 0)} masuk ke Tagihan`);
        return;
      }
      const r = await withProc(setProc, "Mencatat…", 1, async () => { const x = await approveItem(it.id, { amount: isMove(it) ? moveAmount(it) : it.parsed.amount, kind: kindOf(it), categoryId: it.parsed.categoryId, accountId: it.parsed.accountId }); await ctx.fin.retrySync(); markDone([it]); await load(); return x; }, () => "Tercatat");
      ctx.notify(`${titleOf(it)} ${rupiah(it.parsed.amount ?? 0)} tercatat`, () => ctx.fin.dispatch({ type: "entry/delete", id: r.entryId }));
    } catch { ctx.notify("Gagal memproses. Coba lagi."); } finally { setBusy(false); }
  };
  const run = async (action: "approve" | "reject") => {
    if (busy) return; setBusy(true); setConfirm(null);
    try {
      const ids = chosen.filter((i) => action === "reject" || ((i.parsed.amount ?? 0) > 0 && !isGeneric(i) && !i.parsed.loanMail && !isBill(i))).map((i) => i.id);
      const okIds = await withProc(setProc, action === "approve" ? `Menyetujui ${ids.length} transaksi…` : `Mengabaikan ${ids.length} email…`, ids.length, async (tick) => {
        const results: { id: string; ok: boolean }[] = [];
        for (let at = 0; at < ids.length; at += 100) { results.push(...(await bulkReview(ids.slice(at, at + 100), action)).results); tick(Math.min(ids.length, at + 100)); }
        const ok = new Set(results.filter((x) => x.ok).map((x) => x.id));
        await ctx.fin.retrySync();
        if (action === "approve") { const okItems = chosen.filter((i) => ok.has(i.id)); markDone(okItems); if (okItems.length) setResult(resultOf(okItems, total - okItems.length)); }
        await load();
        return ok;
      }, (ok) => `${ok.size} ${action === "approve" ? "transaksi dicatat" : "email diabaikan"}`);
      setSelected((prev) => new Set([...prev].filter((id) => !okIds.has(id))));
      ctx.notify(`${okIds.size} ${action === "approve" ? "disetujui" : "diabaikan"}${okIds.size < ids.length ? `; ${ids.length - okIds.size} belum diproses, periksa kembali` : ""}`);
      if (okIds.size === ids.length) leaveSelect();
    } catch { ctx.notify("Gagal memproses pilihan. Muat ulang sebelum mencoba lagi."); await load(); } finally { setBusy(false); }
  };

  return <div className="dpx-page dpx-rv-page"><Sky><div className="dpx-pad dpx-rv-pad">
    <Header title="Perlu ditinjau" onBack={onBack} right={items.length && view === "hari" ? <Btn type="button" className={`dpx-rv-pill ${selecting ? "is-on" : ""}`} onClick={() => (selecting ? leaveSelect() : setSelecting(true))}>{selecting ? "Selesai" : "Pilih"}</Btn> : <Btn type="button" className="dpx-rb" onClick={onOpenIntegrations} aria-label="Pengaturan integrasi"><Ic n="grid" /></Btn>} />
    {total > 0 ? <Reveal i={0}><div className="dpx-rv-summary"><div><b>{total}</b><span>email menunggu</span></div><div><span>Keluar</span><b>{rupiah(outTotal)}</b></div>{inTotal ? <div><span>Masuk</span><b className="is-in">+{rupiah(inTotal)}</b></div> : null}</div></Reveal> : null}
    {done ? <Reveal i={0}><div className="dpx-rv-done" role="status"><Ic n="check" /><div><b>{done.count} transaksi masuk ke Catatan</b><span>Terakhir untuk {monthLabel(done.y, done.m)}. Catatan menampilkan satu bulan, pilih bulannya di sana.</span></div><Btn type="button" className="dpx-btn dpx-sm" style={{ margin: 0 }} onClick={() => ctx.nav.go(`/riwayat?bulan=${done.y}-${String(done.m + 1).padStart(2, "0")}`)}>Lihat</Btn></div></Reveal> : null}
    {total > 0 ? <div className="dpx-rv-view"><Seg id="rv-view" label="Tampilan antrean" value={view} onChange={(v) => { setView(v); if (v === "toko") { leaveSelect(); void loadGroups(); } }} options={[["toko", "Per toko"], ["hari", "Per hari"]] as const} /></div> : null}
    {view === "toko" && total > 0 ? <>
      <p className="dpx-hint dpx-rv-hint">Satu keputusan untuk semua email dari toko yang sama. Toko yang sudah kamu pilihkan kategorinya diingat untuk email berikutnya.</p>
      {shops.length ? <div className="dpx-rv-card dpx-rv-shops">{shops.map((g) => <GroupRow key={g.key} g={g} ctx={ctx} onOpen={() => setOpenGroup(g.key)} />)}</div> : !groupsLoading ? <div className="dpx-note dpx-info"><Ic n="info" /><div>Belum ada email yang bisa dikelompokkan per toko. Lihat satu per satu di “Per hari”.</div></div> : null}
      {groupsLoading && !shops.length ? <div className="dpx-sub dpx-center" role="status" style={{ padding: 30 }}>Memuat…</div> : null}
      {total > groupedItems && shops.length ? <p className="dpx-hint dpx-rv-hint">{total - groupedItems} email lain belum terbaca jelas dan tidak masuk kelompok. Lihat di “Per hari”.</p> : null}
    </> : null}
    {view === "hari" && !selecting && items.length ? <p className="dpx-hint dpx-rv-hint">Ketuk baris untuk memeriksa. Tombol centang menyetujui langsung.</p> : null}
    {error ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Antrean belum bisa dimuat.</b><div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-sm" onClick={() => void load()}>Coba lagi</Btn></div></div></div> : null}
    {view === "hari" ? groups.map(([key, list]) => <section key={key} className="dpx-rv-group"><h2>{dayLabel(key)}</h2>
      <div className="dpx-rv-card">{list.map((it) => <Row key={it.id} item={it} ctx={ctx} selecting={selecting} selected={selected.has(it.id)} busy={busy} onToggle={() => toggle(it.id)} onOpen={() => setOpenId(it.id)} onQuick={() => void quick(it)} />)}</div>
    </section>) : null}
    {loading && !items.length ? <div className="dpx-sub dpx-center" role="status" style={{ padding: 40 }}>Memuat…</div> : null}
    {view === "hari" && !loading && items.length < total ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => void load(true)}>Muat berikutnya · {items.length} dari {total}</Btn> : null}
    {!loading && !error && !items.length ? <div className="dpx-empty" style={{ paddingTop: 56 }}><Ic n="check" size="lg" /><b>Semua sudah ditinjau</b><p>Pembayaran berikutnya dari email muncul di sini bila perlu dicek.</p><Btn type="button" className="dpx-btn dpx-ghost" style={{ maxWidth: 260 }} onClick={onOpenIntegrations}>Atur email pembayaran</Btn></div> : null}

    <AnimatePresence>{selecting && view === "hari" && items.length > 0 ? <motion.div key="bar" className="dpx-rv-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={spring}>
      <Btn type="button" className="dpx-rv-all" disabled={busy || !items.length} onClick={() => setSelected(items.every((x) => selected.has(x.id)) ? new Set() : new Set(items.map((x) => x.id)))}>{items.every((x) => selected.has(x.id)) ? "Batal semua" : "Pilih semua"}</Btn>
      <span className="dpx-rv-count">{selected.size ? `${selected.size} dipilih` : "Belum ada dipilih"}</span>
      <Btn type="button" className="dpx-rv-soft" disabled={busy || !chosen.length} onClick={() => setConfirm("reject")}>Abaikan</Btn>
      <Btn type="button" className="dpx-rv-go" disabled={busy || !approvable.length} onClick={() => setConfirm("approve")}>Setujui{approvable.length ? ` ${approvable.length}` : ""}</Btn>
    </motion.div> : null}</AnimatePresence>

    <ProcessingOverlay proc={proc} />
    <AnimatePresence>
      {confirm ? <Sheet key="confirm" title={confirm === "approve" ? "Setujui yang dipilih?" : "Abaikan yang dipilih?"} onClose={() => setConfirm(null)}>
        <p className="dpx-sub" style={{ marginTop: -6 }}>{confirm === "approve" ? `${approvable.length} transaksi dicatat sesuai nominal, kategori, dan dompet yang tampil di daftar.${chosen.length > approvable.length && chosen.some(isGeneric) ? ` ${chosen.filter(isGeneric).length} dari pengirim baru tidak ikut: pilih pemasukan atau pengeluaran satu per satu.` : ""}` : `${chosen.length} email tidak akan dicatat.`}</p>
        <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setConfirm(null)}>Batal</Btn><Btn type="button" className={`dpx-btn ${confirm === "reject" ? "dpx-danger" : ""}`} style={{ margin: 0 }} disabled={busy} onClick={() => void run(confirm)}>{confirm === "approve" ? "Ya, setujui" : "Ya, abaikan"}</Btn></div>
      </Sheet> : null}
      {openGroup && shops.find((x) => x.key === openGroup) ? <GroupSheet key={openGroup} g={shops.find((x) => x.key === openGroup)!} ctx={ctx} onClose={() => setOpenGroup(null)}
        onApproved={async (r) => { setOpenGroup(null); const latest = r.months[0]; if (latest) setDone((cur) => ({ count: (cur?.count ?? 0) + r.count, y: latest.y, m: latest.m })); setResult({ ...r, remaining: Math.max(0, total - r.count) }); await Promise.all([load(), loadGroups()]); }}
        onRejected={async (n) => { setOpenGroup(null); ctx.notify(`${n} email diabaikan`); await Promise.all([load(), loadGroups()]); }} /> : null}
      {result ? <ResultSheet key="result" r={result} ctx={ctx} onClose={() => setResult(null)} /> : null}
      {open?.parsed.loanMail ? <LoanMailSheet key={open.id} item={open} ctx={ctx} onClose={() => setOpenId(null)} onDone={async (message) => { setOpenId(null); await load(); ctx.notify(message); }} /> : null}
      {open && !open.parsed.loanMail && isBill(open) ? <BillSheet key={open.id} item={open} ctx={ctx} onClose={() => setOpenId(null)} onDone={async (message) => { setOpenId(null); await load(); ctx.notify(message); }} /> : null}
      {open && !open.parsed.loanMail && !isBill(open) ? <DetailSheet key={open.id + JSON.stringify(open.parsed.details)} item={open} ctx={ctx} onClose={() => setOpenId(null)} onDone={async (message) => { const it = open; setOpenId(null); const recorded = Boolean(it && message.includes("tercatat")); if (it && recorded) { markDone([it]); setResult(resultOf([it], total - 1)); } await load(); if (!recorded) ctx.notify(message); }} /> : null}
    </AnimatePresence>
  </div></Sky></div>;
}
