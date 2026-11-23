import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, I3, Ic, Seg, Sheet, bigAmountSize, iconOr, spring, type IconName } from "../shell/dpx-ui";
import { accountBalance, daysUntil, debtPaid, debtRemaining, debtTotals, goalPlan, goalProjection, goalSaved, uid } from "../../lib/finance/calc";
import { CATEGORY_ICONS, PAY_ACCOUNT_ID, TONES } from "../../lib/finance/categories";
import { parseEntries, type ParsedItem } from "../../lib/finance/parse";
import { streak } from "../../lib/finance/calc";
import { rupiah, formatDateTime } from "../../lib/djiwa-pay-format";
import type { Account, AccountScope, AccountType, Budget, Category, Debt, Entry, FinanceState, Goal, Pocket } from "../../lib/finance/types";
import type { Finance } from "../../lib/finance/use-finance";
import { accountScope, isCrossScope } from "../../lib/finance/scope";
import { AI_TAG, refineEntries } from "../../lib/finance/ai-category";
import { ScanCamera } from "../shell/scan-camera";
import { VoiceSheet } from "./voice-sheet";
import { ReceiptAttachment, ReceiptFlow, ReceiptReview } from "./fin-receipt";
import type { ScannedReceipt } from "../../lib/finance/receipt";
import { Breakdown } from "./breakdown";
import { EmailOrigin } from "../integrations/email-origin";

export type Notify = (text: string, undo?: () => void) => void;
export const catOf = (state: FinanceState, id: string): Category => state.categories.find((c) => c.id === id) ?? { id, name: id, icon: "tag", tone: "slate", income: false };
export const accName = (state: FinanceState, id: string) => (id === PAY_ACCOUNT_ID ? "Djiwa Pay" : (state.allAccounts ?? state.accounts).find((a) => a.id === id)?.name ?? "Dompet");
export const CatIcon = ({ cat, size = 44 }: { cat: Category; size?: number }) => <span className={`dpx-cat dpx-c-${cat.tone}`} style={{ width: size, height: size }}><Ic n={iconOr(cat.icon)} /></span>;

export function MoneyInput({ value, onChange, placeholder = "0", label, big = false }: { value: string; onChange: (digits: string) => void; placeholder?: string; label?: string; big?: boolean }) {
  const n = Number(value || 0);
  return big
    ? <div className="dpx-bigamt"><b>Rp</b><input style={{ fontSize: bigAmountSize(value) }} aria-label={label ?? "Nominal"} inputMode="numeric" value={n ? n.toLocaleString("id-ID") : ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 11))} /></div>
    : <div className="dpx-input"><b>Rp</b><input aria-label={label ?? "Nominal"} inputMode="numeric" value={n ? n.toLocaleString("id-ID") : ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 11))} /></div>;
}

/* ---------- pickers ---------- */
const shortName = (name: string) => { const n = name.replace(/ & .*/, ""); return n === "Biaya usaha" ? "Usaha" : n.length > 10 ? n.split(" ")[0] : n; };

/** Two levels: pick a category; if it has sub categories they open underneath (or keep the whole category). */
export function CategorySheet({ categories, income, value, onPick, onClose, onAdd }: { categories: Category[]; income: boolean; value?: string; onPick: (id: string) => void; onClose: () => void; onAdd?: () => void }) {
  const ids = new Set(categories.map((c) => c.id));
  const tail = (c: Category) => (c.id === "transfer" ? 2 : c.id === "lainnya" ? 1 : 0);   // "Lainnya" and "Transfer" stay last however the list grew
  const list = categories.filter((c) => c.income === income && !(c.parentId && ids.has(c.parentId))).sort((a, b) => tail(a) - tail(b));
  const subsOf = (id: string) => categories.filter((c) => c.parentId === id);
  const current = categories.find((c) => c.id === value), [open, setOpen] = useState<string | null>(current?.parentId && ids.has(current.parentId) ? current.parentId : null);
  const parent = list.find((c) => c.id === open), subs = parent ? subsOf(parent.id) : [];
  const done = (id: string) => { onPick(id); onClose(); };
  return <Sheet title="Kategori" onClose={onClose}>
    <div className="dpx-cats">
      {list.map((c) => { const has = subsOf(c.id).length > 0, on = value === c.id || current?.parentId === c.id;
        return <Btn key={c.id} type="button" className={`dpx-q ${on ? "dpx-on" : ""}`} aria-expanded={has ? open === c.id : undefined} onClick={() => (has ? setOpen(open === c.id ? null : c.id) : done(c.id))}><span className={`dpx-qi dpx-c-${c.tone}`} style={{ display: "grid", placeItems: "center" }}><Ic n={iconOr(c.icon)} size="lg" /></span>{shortName(c.name)}{has ? <i className="dpx-cat-more" aria-hidden="true">{open === c.id ? "▴" : "▾"}</i> : null}</Btn>; })}
      {onAdd ? <Btn type="button" className="dpx-q" onClick={onAdd}><span className="dpx-qi" style={{ background: "var(--group)", color: "var(--navy)", display: "grid", placeItems: "center" }}><Ic n="plus" size="lg" /></span>Baru</Btn> : null}
    </div>
    <AnimatePresence initial={false}>{parent ? <motion.div key={parent.id} className="dpx-subcats" role="group" aria-label={`Sub kategori ${parent.name}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
      <div className="dpx-glabel" style={{ marginTop: 12 }}>{parent.name}</div>
      <div className="dpx-chips dpx-subchips" style={{ margin: 0, padding: 0, flexWrap: "wrap", gap: 8, overflow: "visible" }}>
        <Btn type="button" className={`dpx-chip ${value === parent.id ? "dpx-on" : ""}`} onClick={() => done(parent.id)}>Semua {shortName(parent.name).toLowerCase()}</Btn>
        {subs.map((c) => <Btn key={c.id} type="button" className={`dpx-chip ${value === c.id ? "dpx-on" : ""}`} onClick={() => done(c.id)}>{c.name}</Btn>)}
      </div>
    </motion.div> : null}</AnimatePresence>
  </Sheet>;
}

export function AccountSheet({ state, balances, value, onPick, onClose, onAdd, includePay = false, allLabel, title = "Dompet" }: { state: FinanceState; balances: Record<string, number>; value?: string; onPick: (id: string) => void; onClose: () => void; onAdd?: () => void; includePay?: boolean; allLabel?: string; title?: string }) {
  const list: Account[] = [...state.accounts.filter((a) => !a.archived), ...(includePay ? [{ id: PAY_ACCOUNT_ID, name: "Djiwa Pay", type: "ewallet" as const, opening: 0 }] : [])];
  return <Sheet title={title} onClose={onClose}>
    <div className="dpx-group dpx-flush">{allLabel ? <Btn type="button" className="dpx-row" onClick={() => { onPick("all"); onClose(); }}><span className="dpx-ico"><Ic n="grid" /></span><span className="dpx-main"><b>{allLabel}</b><span>Tidak difilter</span></span>{value === "all" ? <span className="dpx-trail"><Ic n="check" size="sm" /></span> : null}</Btn> : null}{list.map((a) => <Btn key={a.id} type="button" className="dpx-row" onClick={() => { onPick(a.id); onClose(); }}><span className="dpx-ico"><Ic n={a.type === "bank" ? "bank" : a.type === "card" ? "card" : "wallet"} /></span><span className="dpx-main"><b>{a.name}{accountScope(a) === "business" && a.id !== PAY_ACCOUNT_ID ? <span className="dpx-scope-tag">Bisnis</span> : null}</b><span>{rupiah(balances[a.id] ?? 0)}</span></span>{value === a.id ? <Ic n="check" size="sm" /> : null}</Btn>)}</div>
    {onAdd ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={onAdd}><Ic n="plus" size="sm" /> Tambah dompet</Btn> : null}
  </Sheet>;
}

/* ---------- entry detail ---------- */
export function EntrySheet({ entry, fin, notify, onClose, onEdit, onPickCategory }: { entry: Entry; fin: Finance; notify: Notify; onClose: () => void; onEdit: () => void; onPickCategory: (id: string) => void }) {
  const { state, dispatch } = fin;
  const c = catOf(state, entry.categoryId);
  const pay = entry.source === "pay";
  const loanReceipt = entry.tags.includes("loan-receipt");
  const sign = entry.kind === "in" ? "+" : entry.kind === "out" ? "−" : "";
  const [confirm, setConfirm] = useState(false);
  const [receiptEdit, setReceiptEdit] = useState<ScannedReceipt | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const del = () => { const copy = entry; dispatch({ type: "entry/delete", id: entry.id }); onClose(); notify("Catatan dihapus", () => dispatch({ type: "entry/restore", entry: copy })); };
  if (attachFile) {
    const balances = Object.fromEntries(state.accounts.map(a=>[a.id, accountBalance(a, fin.entries)]));
    return <ReceiptFlow key={attachFile.name + attachFile.size} file={attachFile} fin={fin} notify={notify} balances={balances} onClose={onClose} onRetry={() => setAttachFile(null)} attach={entry} />;
  }
  if (receiptEdit) {
    const balances = Object.fromEntries(state.accounts.map(a=>[a.id, accountBalance(a, fin.entries)]));
    return <ReceiptReview fin={fin} notify={notify} onClose={onClose} balances={balances} initial={receiptEdit} entry={entry} />;
  }
  return <Sheet title="Detail catatan" onClose={onClose}>
    <div className="dpx-center" style={{ margin: "-4px 0 10px" }}><CatIcon cat={c} size={64} /><div className="dpx-money" style={{ marginTop: 8, color: entry.kind === "in" ? "var(--ok)" : undefined }}>{sign}{rupiah(entry.amount)}</div><div className="dpx-sub">{entry.note || c.name}</div></div>
    <div className="dpx-group">
      <div className="dpx-kv"><span>Kategori</span><b>{c.name}{entry.tags.includes(AI_TAG) ? <span className="dpx-ai-tag" title="Dipilih otomatis oleh AI. Ubah lewat Ubah catatan.">AI</span> : null}</b></div><div className="dpx-kv"><span>Dompet</span><b>{accName(state, entry.accountId)}</b></div>
      <div className="dpx-kv"><span>Waktu</span><b>{formatDateTime(entry.at)}</b></div><div className="dpx-kv"><span>Sumber</span><b>{pay ? "Djiwa Pay (otomatis)" : entry.source === "voice" ? "Suara / teks" : entry.source === "receipt" ? "Scan struk" : entry.source === "email" ? "Email pembayaran" : entry.source === "sheet" ? "Spreadsheet" : "Manual"}</b></div>
      {entry.tags.some((t) => t !== "loan-receipt" && !t.startsWith("loan:")) ? <div className="dpx-kv"><span>Tag</span><b>{entry.tags.filter((t) => t !== "loan-receipt" && !t.startsWith("loan:")).map((t) => `#${t}`).join(" ")}</b></div> : null}
    </div>
    {!entry.receiptId && !entry.inboundId ? <Breakdown title="Rincian" count="1 item"
      lines={[{ name: entry.note || c.name, sub: [c.name, ...entry.tags.map((t) => `#${t}`)].join(" \u00b7 "), amount: rupiah(entry.amount) }]}
      rows={[{ label: entry.kind === "in" ? "Total masuk" : entry.kind === "tf" ? "Total transfer" : "Total", value: rupiah(entry.amount), strong: true }]}>
      <p className="dpx-hint">{entry.source === "pay" ? "Transaksi Djiwa Pay otomatis." : "Dicatat manual. Untuk rincian per item, foto atau unggah strukanya."}</p>
    </Breakdown> : null}
    {entry.receiptId ? <ReceiptAttachment id={entry.receiptId} onEdit={setReceiptEdit} ledgerAmount={entry.amount} /> : null}
    {entry.source === "email" && !entry.receiptId && !loanReceipt ? <div className="dpx-scan-hint"><Ic n="scan" size="sm" /><span><b>Scan struknya</b> agar tercatat detail item, diskon, dan pajak. Email pembayaran biasanya tidak memuat rinciannya.</span></div> : null}
    {entry.inboundId ? <EmailOrigin inboundId={entry.inboundId} loanReceipt={loanReceipt} onUndo={() => { if (loanReceipt) { void fin.retrySync(); onClose(); notify("Catatan dan pelunasan angsuran diurungkan"); return; } const copy = entry; dispatch({ type: "entry/delete", id: entry.id }); onClose(); notify("Catatan dari email diurungkan", () => dispatch({ type: "entry/restore", entry: copy })); }} /> : null}
    {pay ? <><Btn type="button" className="dpx-btn dpx-ghost" onClick={() => onPickCategory(entry.categoryId)}><Ic n="tag" size="sm" /> Ubah kategori</Btn><p className="dpx-hint dpx-center">Nominal transaksi Djiwa Pay tidak dapat diubah. Kategori boleh.</p></>
      : loanReceipt ? null : confirm ? <div className="dpx-flex dpx-mt dpx-rc-bar dpx-del-confirm" role="alert" style={{ flexDirection: "column", gap: 8 }}><b>Hapus catatan ini?</b><span className="dpx-sub">Saldo dan anggaran dihitung ulang.</span><div className="dpx-es-bar" style={{ marginTop: 0 }}><Btn type="button" className="dpx-btn dpx-danger" style={{ margin: 0 }} onClick={del}>Ya, hapus</Btn><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setConfirm(false)}>Batal</Btn></div></div>
      : <div className="dpx-flex dpx-mt dpx-rc-bar dpx-es-bar">{entry.source === "email" && !entry.receiptId && !loanReceipt ? <label className="dpx-btn dpx-ghost" style={{ margin: 0, display: "flex", justifyContent: "center", gap: 6, cursor: "pointer" }}><Ic n="scan" size="sm" /> Scan struk<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setAttachFile(f); }} /></label> : null}{!entry.receiptId ? <Btn type="button" className="dpx-btn dpx-ghost" style={{ margin: 0 }} onClick={onEdit}><Ic n="edit" size="sm" /> Ubah</Btn> : null}<Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setConfirm(true)}><Ic n="trash" size="sm" /> Hapus</Btn></div>}
  </Sheet>;
}

/* ---------- catat (sentence / voice) ---------- */
export type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };
export const speechCtor = (): (new () => SpeechRecognitionLike) | null => { const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };

const atDaysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); if (n > 0) d.setHours(12, 0, 0, 0); return d.toISOString(); };

export function CatatSheet({ fin, notify, onClose, onManual, onPay, onAsset, balances }: { fin: Finance; notify: Notify; onClose: () => void; onManual: (kind: "out" | "in") => void; onPay: () => void; onAsset: () => void; balances: Record<string, number> }) {
  const { state, dispatch } = fin;
  const [text, setText] = useState("");
  const [items, setItems] = useState<(ParsedItem & { key: string })[] | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pick, setPick] = useState<{ key: string; kind: "cat" | "acc" } | null>(null);
  const [accountId, setAccountId] = useState(() => state.accounts.find((a) => !a.archived)?.id ?? "tunai");
  const [scanFile, setScanFile] = useState<File | null>(null), [camOpen, setCamOpen] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const choose = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setScanFile(f); };
  const supported = typeof window !== "undefined" && speechCtor() !== null;
  const submit = (override?: string) => {
    const input = override ?? text;
    const parsed = parseEntries(input, state.accounts, state.categories);
    if (!parsed.length) { notify("Belum ada nominal. Contoh: “kopi 25rb dan parkir 5rb”"); return; }
    setItems(parsed.map((p) => ({ ...p, key: uid() })));
  };
  const update = (key: string, patch: Partial<ParsedItem>) => setItems((cur) => cur?.map((i) => (i.key === key ? { ...i, ...patch } : i)) ?? null);
  const save = () => {
    if (!items?.length) return;
    const now = new Date().toISOString();
    const entries: Entry[] = items.map((i) => ({ id: uid(), kind: i.kind, amount: i.amount, categoryId: i.categoryId, accountId: i.accountId ?? accountId, at: atDaysAgo(i.daysAgo), note: i.title, tags: [], source: "voice", createdAt: now }));
    dispatch({ type: "entry/addMany", entries });
    onClose();
    notify(`${entries.length} catatan tersimpan`, () => entries.forEach((e) => dispatch({ type: "entry/delete", id: e.id })));
    void refineEntries(fin, notify, entries.filter((e) => e.kind === "out"), { force: true });   // sharpen the keyword guess into a specific sub category
  };
  if (camOpen) return <ScanCamera kind="receipt" onClose={() => setCamOpen(false)} onCapture={(f) => { setCamOpen(false); setScanFile(f); }} />;
  if (voiceOpen) return <VoiceSheet accounts={state.accounts} categories={state.categories} onClose={() => setVoiceOpen(false)} onUse={(t) => { setText(t); setVoiceOpen(false); submit(t); }} />;
  if (scanFile) return <ReceiptFlow key={scanFile.name + scanFile.size + scanFile.lastModified} file={scanFile} fin={fin} notify={notify} balances={balances} onClose={onClose} onRetry={() => setScanFile(null)} />;
  if (pick && items) {
    const item = items.find((i) => i.key === pick.key)!;
    return pick.kind === "cat"
      ? <CategorySheet categories={state.categories} income={item.kind === "in"} value={item.categoryId} onPick={(id) => update(pick.key, { categoryId: id })} onClose={() => setPick(null)} />
      : <AccountSheet state={state} balances={balances} value={item.accountId ?? accountId} onPick={(id) => update(pick.key, { accountId: id })} onClose={() => setPick(null)} />;
  }
  if (items) {
    const total = items.reduce((s, i) => s + (i.kind === "in" ? i.amount : -i.amount), 0);
    return <Sheet title="Periksa catatan" onClose={onClose}>
      <div className="dpx-note dpx-info" style={{ marginTop: 0 }}><Ic n="spark" /><div>“{text}” — <b>{items.length} catatan</b> terbaca. Ketuk untuk mengubah.</div></div>
      <div className="dpx-group dpx-white" style={{ marginTop: 12, boxShadow: "none", background: "var(--group)" }}>
        {items.map((i) => { const c = catOf(state, i.categoryId); return <div className="dpx-item-edit" key={i.key}>
          <Btn type="button" className="dpx-cat" style={{ width: 44, height: 44 }} onClick={() => setPick({ key: i.key, kind: "cat" })} aria-label={`Kategori ${c.name}`}><CatIcon cat={c} /></Btn>
          <div className="dpx-nm"><b>{i.title}</b><span>{c.name} · {accName(state, i.accountId ?? accountId)}{i.daysAgo ? ` · ${i.daysAgo === 1 ? "Kemarin" : "2 hari lalu"}` : " · Hari ini"}</span></div>
          <b style={{ color: i.kind === "in" ? "var(--ok)" : undefined }}>{i.kind === "in" ? "+" : ""}{rupiah(i.amount)}</b>
          <Btn type="button" className="dpx-sh-x" style={{ width: 34, height: 34 }} onClick={() => setItems((cur) => cur?.filter((x) => x.key !== i.key) ?? null)} aria-label="Hapus baris"><Ic n="close" size="sm" /></Btn>
        </div>; })}
      </div>
      <Btn type="button" className="dpx-walletpick" onClick={() => setPick({ key: items[0]?.key ?? "", kind: "acc" })}><Ic n="wallet" size="lg" /><span><small>Dompet</small><b>{accName(state, items[0]?.accountId ?? accountId)}</b></span><em>Ganti</em><Ic n="chev" size="sm" /></Btn>
      <div className="dpx-kv"><span>Total</span><b>{total < 0 ? "−" : "+"}{rupiah(total)}</b></div>
      <Btn type="button" className="dpx-btn" disabled={!items.length} onClick={save}>Simpan {items.length} catatan</Btn>
      <Btn type="button" className="dpx-btn dpx-soft" onClick={() => setItems(null)}>Ubah kalimat</Btn>
    </Sheet>;
  }
  return <Sheet title="Catat" onClose={onClose}>
    <span className="dpx-bubble">Cukup tulis atau bilang: “kopi 25rb dan parkir 5rb”</span>
    <button type="button" className="dpx-glow" aria-label="Tulis catatan" onClick={() => noteInput.current?.focus()}
      style={{ width: 88, height: 88, border: 0, margin: "14px auto 6px", boxShadow: "0 0 0 10px rgba(209,75,26,.10)" }}>
      <picture>
        <source media="(prefers-reduced-motion: no-preference)" srcSet={text.trim() ? "/assets/djiwapay-studio/catat-writing.gif" : "/assets/djiwapay-studio/catat.gif"} />
        <img src="/assets/djiwapay-studio/catat-rest.webp" width={58} height={58} alt="" />
      </picture>
    </button>
    <textarea ref={noteInput} className="dpx-textarea" aria-label="Catatan dalam satu kalimat" placeholder="Atau ketik di sini" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
    <div className="dpx-flex dpx-mt">
      <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0, flex: 1 }} onClick={() => setVoiceOpen(true)}><Ic n="mic" size="sm" /> Bicara</Btn>
      <Btn type="button" className={`dpx-btn dpx-soft ${text.trim() ? "" : "dpx-off"}`} style={{ margin: 0, width: 96, padding: 0 }} onClick={() => submit()} disabled={!text.trim()}><Ic n="up" size="sm" /> Kirim</Btn>
    </div>
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} />
    <div className="dpx-tile3 dpx-mt" style={{ gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
      <Btn type="button" className="dpx-tile dpx-t-scan" style={{ minHeight: 84 }} onClick={() => setCamOpen(true)}><Ic n="scan" size="lg" /><span style={{ fontSize: 13 }}>Foto struk</span></Btn>
      <Btn type="button" className="dpx-tile dpx-t-sky" style={{ minHeight: 84 }} onClick={() => gallery.current?.click()}><Ic n="receipt" size="lg" /><span style={{ fontSize: 13 }}>Unggah struk</span></Btn>
      <Btn type="button" className="dpx-tile dpx-t-mint" style={{ minHeight: 84 }} onClick={() => onManual("out")}><Ic n="edit" size="lg" /><span style={{ fontSize: 13 }}>Catat manual</span></Btn>
      <Btn type="button" className="dpx-tile dpx-t-lav" style={{ minHeight: 84 }} onClick={() => onManual("in")}><Ic n="down" size="lg" /><span style={{ fontSize: 13 }}>Pemasukan</span></Btn>
      <Btn type="button" className="dpx-tile dpx-t-gold" style={{ minHeight: 84, gridColumn: "1 / -1", flexDirection: "row", gap: 12 }} onClick={onAsset}><Ic n="scan" size="lg" /><span style={{ fontSize: 14, textAlign: "left" }}><b style={{ display: "block" }}>Foto aset</b><span style={{ fontWeight: 500, opacity: 0.75 }}>Emas, perhiasan, aset lain. Dibuat jadi stiker dan dipantau nilainya</span></span></Btn>
    </div>
    <div className="dpx-group dpx-flush" style={{ marginTop: 12 }}><Btn type="button" className="dpx-row" onClick={onPay}><span className="dpx-ico"><I3 name="payment-wallet" px={30} /></span><span className="dpx-main"><b>Bayar atau isi saldo</b><span>Scan QR, pulsa, PLN — otomatis tercatat</span></span><Ic n="chev" size="sm" /></Btn></div>
  </Sheet>;
}

/* ---------- budgets, goals, debts ---------- */
export function BudgetSheet({ fin, categoryId, suggested, onClose, notify }: { fin: Finance; categoryId?: string; suggested: Record<string, number>; onClose: () => void; notify: Notify }) {
  const { state, dispatch } = fin;
  const expense = state.categories.filter((c) => !c.income);
  const existing = categoryId ? state.budgets.find((b) => b.categoryId === categoryId) : undefined;
  const [cid, setCid] = useState(categoryId ?? expense.find((c) => !state.budgets.some((b) => b.categoryId === c.id))?.id ?? expense[0].id);
  const [limit, setLimit] = useState(String(existing?.limit ?? ""));
  const [rollover, setRollover] = useState(existing?.rollover ?? false);
  const tip = suggested[cid];
  const ok = Number(limit) >= 1000;
  const save = () => { dispatch({ type: "budget/set", budget: { categoryId: cid, limit: Number(limit), rollover } satisfies Budget }); onClose(); notify("Anggaran disimpan"); };
  return <Sheet title={existing ? "Atur anggaran" : "Anggaran baru"} onClose={onClose}>
    {!existing ? <div className="dpx-chips" style={{ margin: "0 -18px 8px" }}>{expense.map((c) => <Btn key={c.id} type="button" className={`dpx-chip ${cid === c.id ? "dpx-on" : ""}`} onClick={() => setCid(c.id)}>{c.name.split(" ")[0]}</Btn>)}</div> : <div className="dpx-group dpx-white dpx-flex" style={{ boxShadow: "none", background: "var(--group)" }}><CatIcon cat={catOf(state, cid)} /><b>{catOf(state, cid).name}</b></div>}
    <MoneyInput big value={limit} onChange={setLimit} label="Batas per bulan" />
    <p className="dpx-hint dpx-center">per bulan{tip ? ` · rata-rata 3 bulan terakhir ${rupiah(tip)}` : ""}</p>
    {tip ? <div className="dpx-amt-presets">{[Math.round(tip * 0.9 / 10000) * 10000, Math.round(tip / 10000) * 10000, Math.round(tip * 1.15 / 10000) * 10000].filter((v) => v >= 1000).map((v) => <Btn key={v} type="button" className={`dpx-preset ${Number(limit) === v ? "dpx-on" : ""}`} onClick={() => setLimit(String(v))}>{(v / 1000).toLocaleString("id-ID")} rb</Btn>)}</div> : null}
    <Btn type="button" className="dpx-opt" onClick={() => setRollover((v) => !v)} aria-pressed={rollover} style={{ marginTop: 14 }}><span className="dpx-main"><b>Sisa dibawa ke bulan depan</b><span>Rollover {rollover ? "aktif" : "nonaktif"}</span></span><span className={`dpx-radio`} style={rollover ? { borderColor: "var(--blue)", background: "var(--blue)" } : undefined} /></Btn>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>Simpan anggaran</Btn>
    {existing ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { dispatch({ type: "budget/delete", categoryId: cid }); onClose(); notify("Anggaran dihapus"); }}>Hapus anggaran</Btn> : null}
  </Sheet>;
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const Confirm = ({ label, onYes }: { label: string; onYes: () => void }) => { const [ask, setAsk] = useState(false); return ask ? <div className="dpx-confirm"><span>Yakin? Ini tidak bisa dibatalkan.</span><Btn type="button" className="dpx-btn dpx-soft" onClick={() => setAsk(false)}>Batal</Btn><Btn type="button" className="dpx-btn" style={{ background: "var(--danger)" }} onClick={onYes}>Ya, hapus</Btn></div> : <Btn type="button" className="dpx-btn dpx-soft" onClick={() => setAsk(true)}>{label}</Btn>; };

export function GoalSheet({ fin, goal, onClose, notify }: { fin: Finance; goal?: Goal; onClose: () => void; notify: Notify }) {
  const { dispatch } = fin;
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(String(goal?.target ?? ""));
  const [due, setDue] = useState(goal?.due ?? "");
  const ok = name.trim().length > 0 && Number(target) >= 1000;
  const saved = goal ? goalSaved(goal) : 0;
  return <Sheet title={goal ? "Ubah tujuan" : "Tujuan baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama tujuan</span><div className="dpx-input"><input value={name} placeholder="Contoh: Dana darurat" maxLength={40} onChange={(e) => setName(e.target.value)} /></div></label>
    <div className="dpx-chips" style={{ margin: "0 -18px 4px" }}>{["Dana darurat", "Liburan", "Gadget baru", "DP rumah", "Pendidikan"].map((n) => <Btn key={n} type="button" className={`dpx-chip ${name === n ? "dpx-on" : ""}`} onClick={() => setName(n)}>{n}</Btn>)}</div>
    <label className="dpx-field"><span>Target</span><MoneyInput value={target} onChange={setTarget} label="Target" /></label>
    <label className="dpx-field"><span>Target tanggal <em>opsional</em></span><div className="dpx-input"><input type="date" value={due} min={todayStr()} onChange={(e) => setDue(e.target.value)} /></div></label>
    {goal && saved > 0 && Number(target) > 0 && Number(target) < saved ? <p className="dpx-hint">Target lebih kecil dari yang sudah ditabung ({rupiah(saved)}). Tujuan akan tampil tercapai.</p> : null}
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { dispatch({ type: "goal/upsert", goal: { id: goal?.id ?? uid(), name: name.trim(), target: Number(target), deposits: goal?.deposits ?? [], ...(due ? { due } : {}), createdAt: goal?.createdAt ?? new Date().toISOString() } }); onClose(); notify("Tujuan disimpan"); }}>Simpan tujuan</Btn>
    {goal ? <Confirm label="Hapus tujuan" onYes={() => { dispatch({ type: "goal/delete", id: goal.id }); onClose(); notify("Tujuan dihapus", () => dispatch({ type: "goal/upsert", goal })); }} /> : null}
  </Sheet>;
}

export function GoalDetailSheet({ fin, goal, onClose, onEdit, notify }: { fin: Finance; goal: Goal; onClose: () => void; onEdit: () => void; notify: Notify }) {
  const [amount, setAmount] = useState(""), [editing, setEditing] = useState<number | null>(null), [editAmount, setEditAmount] = useState("");
  const plan = goalPlan(goal), saved = plan.saved, pct = Math.round(plan.pct);
  const left = plan.left, hints = [plan.perMonthNeeded, Math.round(left / 4 / 10000) * 10000, 100_000, 500_000].filter((v): v is number => Boolean(v) && (v as number) >= 1000);
  const presets = [...new Set(hints)].slice(0, 3);
  const rows = goal.deposits.map((d, i) => ({ d, i })).reverse();
  return <Sheet title={goal.name} onClose={onClose}>
    <div className="dpx-group dpx-white dpx-center" style={{ boxShadow: "none", background: "var(--group)" }}><div className="dpx-money">{rupiah(saved)}</div><div className="dpx-sub">dari {rupiah(goal.target)} · {pct}%{goal.due ? ` · target ${dateLabel(goal.due)}` : ""}</div><div className="dpx-bar" style={{ marginTop: 10 }}><i style={{ width: `${Math.max(2, pct)}%` }} /></div></div>
    {plan.done ? <div className="dpx-note dpx-ok"><Ic n="check" /><div><b>Tujuan tercapai!</b></div></div> : <>
      {plan.perMonthNeeded ? <div className={`dpx-note ${plan.onTrack === false ? "dpx-warn" : "dpx-info"}`}><Ic n="target" /><div>Agar tepat waktu, sisihkan <b>{rupiah(plan.perMonthNeeded)}/bulan</b>. {plan.onTrack === false ? "Lajumu sekarang belum cukup." : plan.onTrack ? "Lajumu sekarang sudah di jalur." : ""}</div></div> : null}
      {plan.eta ? <div className="dpx-note dpx-info"><Ic n="spark" /><div>Rata-rata menabung <b>{rupiah(plan.perMonth)}/bulan</b> → tercapai sekitar <b>{plan.eta.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>.</div></div> : null}</>}
    <label className="dpx-field"><span>Setor ke tujuan</span><MoneyInput value={amount} onChange={setAmount} label="Jumlah setoran" /></label>
    {presets.length ? <div className="dpx-amt-presets">{presets.map((v) => <Btn key={v} type="button" className={`dpx-preset ${Number(amount) === v ? "dpx-on" : ""}`} onClick={() => setAmount(String(v))}>{v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : `${(v / 1000).toLocaleString("id-ID")} rb`}</Btn>)}</div> : null}
    <Btn type="button" className={`dpx-btn ${Number(amount) > 0 ? "" : "dpx-off"}`} disabled={!(Number(amount) > 0)} onClick={() => { fin.dispatch({ type: "goal/deposit", id: goal.id, at: new Date().toISOString(), amount: Number(amount) }); setAmount(""); notify(`Setoran ${rupiah(Number(amount))} dicatat`); }}>Setor</Btn>
    {rows.length ? <><div className="dpx-glabel">Riwayat setoran ({rows.length})</div><div className="dpx-group dpx-flush">{rows.slice(0, 20).map(({ d, i }) => editing === i
      ? <div className="dpx-row" key={i}><div style={{ flex: 1 }}><MoneyInput value={editAmount} onChange={setEditAmount} label="Jumlah setoran" /></div><Btn type="button" className="dpx-rb" aria-label="Simpan" onClick={() => { if (Number(editAmount) > 0) { fin.dispatch({ type: "goal/depositEdit", id: goal.id, index: i, amount: Number(editAmount) }); notify("Setoran diubah"); } setEditing(null); }}><Ic n="check" size="sm" /></Btn></div>
      : <div className="dpx-row" key={i}><span className="dpx-cat dpx-c-emerald"><Ic n="down" /></span><span className="dpx-main"><b>{rupiah(d.amount)}</b><span>{dateLabel(d.at)}</span></span>
        <Btn type="button" className="dpx-rb" aria-label="Ubah setoran" onClick={() => { setEditing(i); setEditAmount(String(d.amount)); }}><Ic n="edit" size="sm" /></Btn>
        <Btn type="button" className="dpx-rb" aria-label="Hapus setoran" onClick={() => { fin.dispatch({ type: "goal/depositDelete", id: goal.id, index: i }); notify("Setoran dihapus", () => fin.dispatch({ type: "goal/upsert", goal })); }}><Ic n="del" size="sm" /></Btn></div>)}</div></> : null}
    <Btn type="button" className="dpx-btn dpx-ghost" onClick={onEdit}><Ic n="edit" size="sm" /> Ubah tujuan</Btn>
  </Sheet>;
}

export function DebtSheet({ fin, debt, onClose, notify }: { fin: Finance; debt?: Debt; onClose: () => void; notify: Notify }) {
  const [dir, setDir] = useState<Debt["direction"]>(debt?.direction ?? "owed_to_me");
  const [person, setPerson] = useState(debt?.person ?? "");
  const [amount, setAmount] = useState(String(debt?.amount ?? ""));
  const [note, setNote] = useState(debt?.note ?? "");
  const [due, setDue] = useState(debt?.due ?? "");
  const [pay, setPay] = useState(""), [editFields, setEditFields] = useState(!debt);
  const ok = person.trim() && Number(amount) > 0;
  const paid = debt ? debtPaid(debt) : 0, remaining = debt ? debtRemaining(debt) : 0, mine = (debt?.direction ?? dir) === "i_owe";
  const pct = debt && debt.amount > 0 ? Math.min(100, (paid / debt.amount) * 100) : 0, late = daysUntil(debt?.due);
  const payments = (debt?.payments ?? []).map((p, i) => ({ p, i })).reverse();
  const save = () => { fin.dispatch({ type: "debt/upsert", debt: { id: debt?.id ?? uid(), person: person.trim(), direction: dir, amount: Number(amount), note: note.trim(), due: due || undefined, settled: debt?.settled ?? false, ...(debt?.payments?.length ? { payments: debt.payments } : {}), createdAt: debt?.createdAt ?? new Date().toISOString() } }); onClose(); notify("Tersimpan"); };
  return <Sheet title={debt ? debt.person : "Hutang & piutang"} onClose={onClose}>
    {debt ? <div className="dpx-group dpx-white dpx-center" style={{ boxShadow: "none", background: "var(--group)" }}>
      <div className="dpx-sub">{mine ? "Kamu berutang ke" : "Berutang padamu"} {debt.person}</div>
      <div className="dpx-money">{debt.settled ? "Lunas" : rupiah(remaining)}</div>
      <div className="dpx-sub">dari {rupiah(debt.amount)}{paid > 0 ? ` · sudah ${mine ? "dibayar" : "diterima"} ${rupiah(paid)}` : ""}</div>
      <div className="dpx-bar" style={{ marginTop: 10 }}><i className={debt.settled ? "dpx-ok" : ""} style={{ width: `${debt.settled ? 100 : Math.max(2, pct)}%` }} /></div>
      {late !== null && !debt.settled ? <div className={late < 0 ? "dpx-dn" : "dpx-sub"} style={{ marginTop: 8, fontWeight: 600 }}>{late < 0 ? `Terlambat ${-late} hari` : late === 0 ? "Jatuh tempo hari ini" : `Jatuh tempo ${late} hari lagi`}</div> : null}</div> : null}
    {debt && !debt.settled ? <>
      <label className="dpx-field"><span>{mine ? "Catat pembayaran" : "Catat terima cicilan"}</span><MoneyInput value={pay} onChange={setPay} label="Jumlah" /></label>
      <div className="dpx-amt-presets">{[remaining, Math.round(remaining / 2 / 1000) * 1000, Math.round(remaining / 4 / 1000) * 1000].filter((v, i, a) => v >= 1000 && a.indexOf(v) === i).map((v, k) => <Btn key={v} type="button" className={`dpx-preset ${Number(pay) === v ? "dpx-on" : ""}`} onClick={() => setPay(String(v))}>{k === 0 ? "Lunas" : v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : `${(v / 1000).toLocaleString("id-ID")} rb`}</Btn>)}</div>
      <Btn type="button" className={`dpx-btn ${Number(pay) > 0 ? "" : "dpx-off"}`} disabled={!(Number(pay) > 0)} onClick={() => { const v = Math.min(Number(pay), remaining); fin.dispatch({ type: "debt/pay", id: debt.id, at: new Date().toISOString(), amount: v }); setPay(""); notify(v >= remaining ? "Lunas" : `${rupiah(v)} dicatat`); }}>Catat</Btn></> : null}
    {payments.length ? <><div className="dpx-glabel">Riwayat pembayaran ({payments.length})</div><div className="dpx-group dpx-flush">{payments.map(({ p, i }) => <div className="dpx-row" key={i}><span className="dpx-cat dpx-c-emerald"><Ic n="down" /></span><span className="dpx-main"><b>{rupiah(p.amount)}</b><span>{dateLabel(p.at)}</span></span><Btn type="button" className="dpx-rb" aria-label="Hapus pembayaran" onClick={() => { fin.dispatch({ type: "debt/payDelete", id: debt!.id, index: i }); notify("Pembayaran dihapus"); }}><Ic n="del" size="sm" /></Btn></div>)}</div></> : null}
    {debt && !editFields ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => setEditFields(true)}><Ic n="edit" size="sm" /> Ubah data</Btn> : <>
      <Seg id="debt" label="Jenis" value={dir} onChange={setDir} options={[["owed_to_me", "Dia berutang"], ["i_owe", "Saya berutang"]] as const} />
      <label className="dpx-field"><span>Nama</span><div className="dpx-input"><input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Contoh: Budi" maxLength={40} /></div></label>
      <label className="dpx-field"><span>Jumlah awal</span><MoneyInput value={amount} onChange={setAmount} /></label>
      <label className="dpx-field"><span>Keterangan <em>opsional</em></span><div className="dpx-input"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Makan bareng" maxLength={80} /></div></label>
      <label className="dpx-field"><span>Jatuh tempo <em>opsional</em></span><div className="dpx-input"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div></label>
      <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>Simpan</Btn></>}
    {debt ? <>
      {debt.settled ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "debt/unsettle", id: debt.id }); onClose(); notify("Dibuka lagi"); }}>Buka lagi</Btn> : <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "debt/settle", id: debt.id }); onClose(); notify("Ditandai lunas", () => fin.dispatch({ type: "debt/unsettle", id: debt.id })); }}>Tandai lunas</Btn>}
      <Confirm label="Hapus catatan" onYes={() => { fin.dispatch({ type: "debt/delete", id: debt.id }); onClose(); notify("Catatan dihapus", () => fin.dispatch({ type: "debt/upsert", debt })); }} /></> : null}
  </Sheet>;
}

/** One spending pocket: its share of income and which categories it covers. */
export function PocketSheet({ fin, pocket, others, onClose, notify }: { fin: Finance; pocket?: Pocket; others: Pocket[]; onClose: () => void; notify: Notify }) {
  const used = others.filter((p) => p.id !== pocket?.id).reduce((n, p) => n + p.percent, 0), free = Math.max(0, 100 - used);
  const [name, setName] = useState(pocket?.name ?? ""), [percent, setPercent] = useState(String(pocket?.percent ?? Math.min(free, 10) ?? 10)), [cats, setCats] = useState<string[]>(pocket?.categoryIds ?? []);
  const [tone, setTone] = useState(pocket?.tone ?? "blue"), [icon, setIcon] = useState(pocket?.icon ?? "pie");
  const expense = fin.state.categories.filter((c) => !c.income), takenBy = (id: string) => others.find((p) => p.id !== pocket?.id && p.categoryIds.includes(id))?.name;
  const pct = Math.round(Number(percent) || 0), ok = name.trim().length > 0 && pct >= 1 && pct <= 100;
  const save = () => { const item: Pocket = { id: pocket?.id ?? uid(), name: name.trim(), percent: pct, categoryIds: cats, tone, icon }; const list = pocket ? others.map((p) => (p.id === item.id ? item : p)) : [...others, item]; fin.dispatch({ type: "pocket/set", pockets: list }); onClose(); notify("Kantong disimpan"); };
  return <Sheet title={pocket ? "Ubah kantong" : "Kantong baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama kantong</span><div className="dpx-input"><input value={name} maxLength={30} placeholder="Contoh: Sedekah" onChange={(e) => setName(e.target.value)} /></div></label>
    <label className="dpx-field"><span>Porsi dari pemasukan (%)</span><div className="dpx-input"><input inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div></label>
    <p className={`dpx-hint ${used + pct > 100 ? "dpx-dn" : ""}`}>{used + pct > 100 ? `Total jadi ${used + pct}%, melebihi 100%.` : `Sisa yang belum dibagi: ${100 - used - pct}%`}</p>
    <div className="dpx-glabel">Kategori yang dihitung <em>opsional</em></div>
    <div className="dpx-rv-pick" role="group" aria-label="Kategori">{expense.map((c) => { const other = takenBy(c.id); return <Btn key={c.id} type="button" className={cats.includes(c.id) ? "is-on" : ""} aria-pressed={cats.includes(c.id)} disabled={Boolean(other)} title={other ? `Dipakai kantong ${other}` : undefined} onClick={() => setCats((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))}>{c.name}</Btn>; })}</div>
    <div className="dpx-glabel">Warna</div>
    <div className="dpx-chips" style={{ margin: "0 -18px 4px" }}>{(["blue", "emerald", "violet", "amber", "rose", "cyan"] as const).map((t) => <Btn key={t} type="button" className={`dpx-chip ${tone === t ? "dpx-on" : ""}`} onClick={() => setTone(t)}><span className={`dpx-cat dpx-c-${t}`} style={{ width: 22, height: 22, display: "inline-grid" }} /></Btn>)}</div>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>Simpan kantong</Btn>
    {pocket ? <Confirm label="Hapus kantong" onYes={() => { fin.dispatch({ type: "pocket/set", pockets: others.filter((p) => p.id !== pocket.id) }); onClose(); notify("Kantong dihapus", () => fin.dispatch({ type: "pocket/set", pockets: others })); }} /> : null}
  </Sheet>;
}

export function SplitSheet({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const [total, setTotal] = useState("240000");
  const [people, setPeople] = useState(4);
  const [what, setWhat] = useState("Makan malam");
  const share = Number(total) > 0 ? Math.ceil(Number(total) / people / 100) * 100 : 0;
  const message = `${what}: total ${rupiah(Number(total))} dibagi ${people} orang = ${rupiah(share)} per orang.`;
  return <Sheet title="Patungan" onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Untuk</span><div className="dpx-input"><input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={40} /></div></label>
    <label className="dpx-field"><span>Total tagihan</span><MoneyInput value={total} onChange={setTotal} /></label>
    <div className="dpx-spread dpx-mt"><b>Jumlah orang</b><div className="dpx-flex"><Btn type="button" className="dpx-rb" onClick={() => setPeople((p) => Math.max(2, p - 1))} aria-label="Kurangi orang"><b style={{ fontSize: 20 }}>−</b></Btn><b style={{ fontSize: 20, minWidth: 28, textAlign: "center" }}>{people}</b><Btn type="button" className="dpx-rb" onClick={() => setPeople((p) => Math.min(30, p + 1))} aria-label="Tambah orang"><Ic n="plus" /></Btn></div></div>
    <div className="dpx-group dpx-white dpx-center dpx-mt" style={{ boxShadow: "none", background: "var(--group)" }}><div className="dpx-sub">Per orang</div><div className="dpx-money">{rupiah(share)}</div></div>
    <Btn type="button" className="dpx-btn" onClick={() => { void navigator.clipboard?.writeText(message).then(() => notify("Ringkasan disalin")); }}><Ic n="copy" size="sm" /> Salin ringkasan</Btn>
  </Sheet>;
}

export function StreakSheet({ entries, onClose, onCatat }: { entries: Entry[]; onClose: () => void; onCatat: () => void }) {
  const s = streak(entries);
  const labels = ["M", "S", "S", "R", "K", "J", "S"];
  return <Sheet title="Streak mencatat" onClose={onClose}>
    <div className="dpx-center" style={{ margin: "-6px 0 8px" }}><span className="dpx-cat dpx-c-amber" style={{ width: 72, height: 72, margin: "0 auto" }}><Ic n="flame" size="lg" /></span><div className="dpx-money dpx-mt8">{s.count} hari</div><div className="dpx-sub">{s.loggedToday ? "Hari ini sudah tercatat. Pertahankan!" : "Catat sesuatu hari ini agar streak berlanjut."}</div></div>
    <div className="dpx-streak">{s.week.map((d, i) => <div key={i} className={d.today ? "dpx-today" : d.logged ? "dpx-on" : ""}><i>{d.logged ? <Ic n="check" size="sm" /> : "•"}</i>{labels[d.date.getDay()]}</div>)}</div>
    {s.loggedToday ? null : <Btn type="button" className="dpx-btn" onClick={onCatat}>Catat sekarang</Btn>}
  </Sheet>;
}

/* ---------- accounts & categories editing ---------- */
const ACCOUNT_TYPES: [AccountType, string][] = [["cash", "Tunai"], ["bank", "Rekening bank"], ["ewallet", "E-wallet"], ["card", "Kartu kredit"], ["other", "Lainnya"]];
export function AccountEditSheet({ fin, account, onClose, notify }: { fin: Finance; account?: Account; onClose: () => void; notify: Notify }) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [opening, setOpening] = useState(String(Math.abs(account?.opening ?? 0) || ""));
  const [negative, setNegative] = useState((account?.opening ?? 0) < 0 || type === "card");
  const [scope, setScope] = useState<AccountScope>(account ? accountScope(account) : fin.scope === "business" ? "business" : "personal");
  const ok = name.trim().length > 0;
  return <Sheet title={account ? "Ubah dompet" : "Dompet baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: BCA, OVO, Celengan" maxLength={30} /></div></label>
    <div className="dpx-chips" style={{ margin: "10px -18px 0" }}>{ACCOUNT_TYPES.map(([k, l]) => <Btn key={k} type="button" className={`dpx-chip ${type === k ? "dpx-on" : ""}`} onClick={() => { setType(k); setNegative(k === "card"); }}>{l}</Btn>)}</div>
    <div className="dpx-glabel" style={{ marginTop: 14 }}>Untuk apa dompet ini?</div>
    <Seg id="acc-scope" label="Jenis dompet" fit value={scope} onChange={setScope} options={[["personal", "Pribadi"], ["business", "Bisnis"]] as const} />
    <p className="dpx-sub" style={{ margin: "6px 4px 0" }}>{scope === "business" ? "Pemasukan dan pengeluaran dompet ini masuk hitungan bisnis, terpisah dari pribadi." : "Dihitung bersama keuangan pribadi."}</p>
    <label className="dpx-field"><span>{type === "card" ? "Tagihan saat ini" : "Saldo awal"}</span><MoneyInput value={opening} onChange={setOpening} label="Saldo awal" /></label>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { fin.dispatch({ type: "account/upsert", account: { id: account?.id ?? uid(), name: name.trim(), type, opening: (negative ? -1 : 1) * Number(opening || 0), scope } }); onClose(); notify(scope === "business" ? "Dompet bisnis disimpan" : "Dompet disimpan"); }}>Simpan dompet</Btn>
    {account && account.id !== "tunai" ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "account/archive", id: account.id }); onClose(); notify("Dompet diarsipkan"); }}>Arsipkan dompet</Btn> : null}
  </Sheet>;
}

export function CategoryEditSheet({ fin, category, onClose, notify }: { fin: Finance; category?: Category; onClose: () => void; notify: Notify }) {
  const [name, setName] = useState(category?.name ?? "");
  const [income, setIncome] = useState(category?.income ?? false);
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  const [tone, setTone] = useState(category?.tone ?? "blue");
  const [parentId, setParentId] = useState<string>(category?.parentId ?? "");
  const hasSubs = category ? fin.state.categories.some((c) => c.parentId === category.id) : false;
  const parents = fin.state.categories.filter((c) => !c.parentId && c.income === income && c.id !== category?.id && c.id !== "transfer");
  const ok = name.trim().length > 0;
  return <Sheet title={category ? "Ubah kategori" : "Kategori baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Hobi" maxLength={24} /></div></label>
    {!category ? <div style={{ marginTop: 12 }}><Seg id="cat-kind" label="Jenis" value={income ? "in" : "out"} onChange={(v) => setIncome(v === "in")} options={[["out", "Pengeluaran"], ["in", "Pemasukan"]] as const} /></div> : null}
    {!hasSubs ? <><div className="dpx-glabel">Sub dari</div>
      <div className="dpx-chips" style={{ margin: "0 -18px" }}><Btn type="button" className={`dpx-chip ${parentId === "" ? "dpx-on" : ""}`} onClick={() => setParentId("")}>Kategori utama</Btn>{parents.map((c) => <Btn key={c.id} type="button" className={`dpx-chip ${parentId === c.id ? "dpx-on" : ""}`} onClick={() => { setParentId(c.id); setIcon(c.icon); setTone(c.tone); }}>{c.name}</Btn>)}</div></> : <p className="dpx-sub" style={{ margin: "8px 4px 0" }}>Kategori ini punya sub kategori, jadi tidak bisa menjadi sub dari yang lain.</p>}
    <div className="dpx-glabel">Ikon</div>
    <div className="dpx-chips" style={{ margin: "0 -18px" }}>{CATEGORY_ICONS.map((i) => <Btn key={i} type="button" className={`dpx-chip ${icon === i ? "dpx-on" : ""}`} onClick={() => setIcon(i)} aria-label={i}><Ic n={i as IconName} size="sm" /></Btn>)}</div>
    <div className="dpx-glabel">Warna</div>
    <div className="dpx-chips" style={{ margin: "0 -18px" }}>{TONES.map((t) => <Btn key={t} type="button" className={`dpx-cat dpx-c-${t}`} style={{ width: 38, height: 38, flex: "none", outline: tone === t ? "3px solid var(--navy)" : "none", outlineOffset: 2 }} onClick={() => setTone(t)} aria-label={t} />)}</div>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { fin.dispatch({ type: "category/upsert", category: { id: category?.id ?? `c-${uid().slice(0, 8)}`, name: name.trim(), icon, tone, income, custom: category ? category.custom : true, ...(parentId && !hasSubs ? { parentId } : {}) } }); onClose(); notify("Kategori disimpan"); }}>Simpan kategori</Btn>
    {category?.custom ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "category/delete", id: category.id }); onClose(); notify("Kategori dihapus · catatan dipindah ke Lainnya"); }}>Hapus kategori</Btn> : null}
  </Sheet>;
}

export { debtTotals };
