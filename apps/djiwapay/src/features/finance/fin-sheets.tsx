import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, I3, Ic, Seg, Sheet, iconOr, type IconName } from "../shell/dpx-ui";
import { debtTotals, goalProjection, goalSaved, uid } from "../../lib/finance/calc";
import { CATEGORY_ICONS, PAY_ACCOUNT_ID, TONES } from "../../lib/finance/categories";
import { parseEntries, type ParsedItem } from "../../lib/finance/parse";
import { streak } from "../../lib/finance/calc";
import { rupiah, formatDateTime } from "../../lib/djiwa-pay-format";
import type { Account, AccountType, Budget, Category, Debt, Entry, FinanceState, Goal } from "../../lib/finance/types";
import type { Finance } from "../../lib/finance/use-finance";

export type Notify = (text: string, undo?: () => void) => void;
export const catOf = (state: FinanceState, id: string): Category => state.categories.find((c) => c.id === id) ?? { id, name: id, icon: "tag", tone: "slate", income: false };
export const accName = (state: FinanceState, id: string) => (id === PAY_ACCOUNT_ID ? "Djiwa Pay" : state.accounts.find((a) => a.id === id)?.name ?? "Dompet");
export const CatIcon = ({ cat, size = 44 }: { cat: Category; size?: number }) => <span className={`dpx-cat dpx-c-${cat.tone}`} style={{ width: size, height: size }}><Ic n={iconOr(cat.icon)} /></span>;

export function MoneyInput({ value, onChange, placeholder = "0", label, big = false }: { value: string; onChange: (digits: string) => void; placeholder?: string; label?: string; big?: boolean }) {
  const n = Number(value || 0);
  return big
    ? <div className="dpx-bigamt"><b>Rp</b><input aria-label={label ?? "Nominal"} inputMode="numeric" value={n ? n.toLocaleString("id-ID") : ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 11))} /></div>
    : <div className="dpx-input"><b>Rp</b><input aria-label={label ?? "Nominal"} inputMode="numeric" value={n ? n.toLocaleString("id-ID") : ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 11))} /></div>;
}

/* ---------- pickers ---------- */
export function CategorySheet({ categories, income, value, onPick, onClose, onAdd }: { categories: Category[]; income: boolean; value?: string; onPick: (id: string) => void; onClose: () => void; onAdd?: () => void }) {
  const list = categories.filter((c) => c.income === income);
  return <Sheet title="Kategori" onClose={onClose}>
    <div className="dpx-cats">
      {list.map((c) => <Btn key={c.id} type="button" className={`dpx-q ${value === c.id ? "dpx-on" : ""}`} onClick={() => { onPick(c.id); onClose(); }}><span className={`dpx-qi dpx-c-${c.tone}`} style={{ display: "grid", placeItems: "center" }}><Ic n={iconOr(c.icon)} size="lg" /></span>{c.name.split(" ")[0]}</Btn>)}
      {onAdd ? <Btn type="button" className="dpx-q" onClick={onAdd}><span className="dpx-qi" style={{ background: "var(--group)", color: "var(--navy)", display: "grid", placeItems: "center" }}><Ic n="plus" size="lg" /></span>Baru</Btn> : null}
    </div>
  </Sheet>;
}

export function AccountSheet({ state, balances, value, onPick, onClose, onAdd, includePay = false }: { state: FinanceState; balances: Record<string, number>; value?: string; onPick: (id: string) => void; onClose: () => void; onAdd?: () => void; includePay?: boolean }) {
  const list: Account[] = [...state.accounts.filter((a) => !a.archived), ...(includePay ? [{ id: PAY_ACCOUNT_ID, name: "Djiwa Pay", type: "ewallet" as const, opening: 0 }] : [])];
  return <Sheet title="Dompet" onClose={onClose}>
    <div className="dpx-group dpx-flush">{list.map((a) => <Btn key={a.id} type="button" className="dpx-row" onClick={() => { onPick(a.id); onClose(); }}><span className="dpx-ico"><Ic n={a.type === "bank" ? "bank" : a.type === "card" ? "card" : "wallet"} /></span><span className="dpx-main"><b>{a.name}</b><span>{rupiah(balances[a.id] ?? 0)}</span></span>{value === a.id ? <Ic n="check" size="sm" /> : null}</Btn>)}</div>
    {onAdd ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={onAdd}><Ic n="plus" size="sm" /> Tambah dompet</Btn> : null}
  </Sheet>;
}

/* ---------- entry detail ---------- */
export function EntrySheet({ entry, fin, notify, onClose, onEdit, onPickCategory }: { entry: Entry; fin: Finance; notify: Notify; onClose: () => void; onEdit: () => void; onPickCategory: (id: string) => void }) {
  const { state, dispatch } = fin;
  const c = catOf(state, entry.categoryId);
  const pay = entry.source === "pay";
  const sign = entry.kind === "in" ? "+" : entry.kind === "out" ? "−" : "";
  const [confirm, setConfirm] = useState(false);
  const del = () => { const copy = entry; dispatch({ type: "entry/delete", id: entry.id }); onClose(); notify("Catatan dihapus", () => dispatch({ type: "entry/restore", entry: copy })); };
  return <Sheet title="Detail catatan" onClose={onClose}>
    <div className="dpx-center" style={{ margin: "-4px 0 10px" }}><CatIcon cat={c} size={64} /><div className="dpx-money" style={{ marginTop: 8, color: entry.kind === "in" ? "var(--ok)" : undefined }}>{sign}{rupiah(entry.amount)}</div><div className="dpx-sub">{entry.note || c.name}</div></div>
    <div className="dpx-group">
      <div className="dpx-kv"><span>Kategori</span><b>{c.name}</b></div><div className="dpx-kv"><span>Dompet</span><b>{accName(state, entry.accountId)}</b></div>
      <div className="dpx-kv"><span>Waktu</span><b>{formatDateTime(entry.at)}</b></div><div className="dpx-kv"><span>Sumber</span><b>{pay ? "Djiwa Pay (otomatis)" : entry.source === "voice" ? "Suara / teks" : "Manual"}</b></div>
      {entry.tags.length ? <div className="dpx-kv"><span>Tag</span><b>{entry.tags.map((t) => `#${t}`).join(" ")}</b></div> : null}
    </div>
    {pay ? <><Btn type="button" className="dpx-btn dpx-ghost" onClick={() => onPickCategory(entry.categoryId)}><Ic n="tag" size="sm" /> Ubah kategori</Btn><p className="dpx-hint dpx-center">Nominal transaksi Djiwa Pay tidak dapat diubah. Kategori boleh.</p></>
      : <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-ghost" style={{ margin: 0 }} onClick={onEdit}><Ic n="edit" size="sm" /> Ubah</Btn><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setConfirm(true)}><Ic n="trash" size="sm" /> Hapus</Btn></div>}
    {confirm ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 12 }}><Ic n="warn" /><div><b>Hapus catatan ini?</b> Saldo dan anggaran dihitung ulang.<div className="dpx-flex" style={{ marginTop: 10 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" onClick={del}>Hapus</Btn><Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => setConfirm(false)}>Batal</Btn></div></div></div> : null}
  </Sheet>;
}

/* ---------- catat (sentence / voice) ---------- */
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const speechCtor = (): (new () => SpeechRecognitionLike) | null => { const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };

const atDaysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); if (n > 0) d.setHours(12, 0, 0, 0); return d.toISOString(); };

export function CatatSheet({ fin, notify, onClose, onManual, onPay, balances }: { fin: Finance; notify: Notify; onClose: () => void; onManual: (kind: "out" | "in") => void; onPay: () => void; balances: Record<string, number> }) {
  const { state, dispatch } = fin;
  const [text, setText] = useState("");
  const [items, setItems] = useState<(ParsedItem & { key: string })[] | null>(null);
  const [listening, setListening] = useState(false);
  const [pick, setPick] = useState<{ key: string; kind: "cat" | "acc" } | null>(null);
  const [accountId, setAccountId] = useState(() => state.accounts.find((a) => !a.archived)?.id ?? "tunai");
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const supported = typeof window !== "undefined" && speechCtor() !== null;
  useEffect(() => () => rec.current?.stop(), []);
  const listen = () => {
    const Ctor = speechCtor();
    if (!Ctor) { notify("Suara belum didukung di browser ini — ketik saja."); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor(); r.lang = "id-ID"; r.interimResults = true; r.continuous = false;
    r.onresult = (event) => { setText(Array.from(event.results).map((x) => x[0].transcript).join(" ")); };
    r.onend = () => setListening(false); r.onerror = () => { setListening(false); notify("Mikrofon tidak dapat dipakai. Periksa izin."); };
    rec.current = r; setListening(true); r.start();
  };
  const submit = () => {
    const parsed = parseEntries(text, state.accounts, state.categories);
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
  };
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
      <div className="dpx-chips2 dpx-mt8"><Btn type="button" className="dpx-chip3" onClick={() => setPick({ key: items[0]?.key ?? "", kind: "acc" })}>Dompet: {accName(state, items[0]?.accountId ?? accountId)}</Btn></div>
      <div className="dpx-kv"><span>Total</span><b>{total < 0 ? "−" : "+"}{rupiah(total)}</b></div>
      <Btn type="button" className="dpx-btn" disabled={!items.length} onClick={save}>Simpan {items.length} catatan</Btn>
      <Btn type="button" className="dpx-btn dpx-soft" onClick={() => setItems(null)}>Ubah kalimat</Btn>
    </Sheet>;
  }
  return <Sheet title="Catat" onClose={onClose}>
    <span className="dpx-bubble">Cukup tulis atau bilang: “kopi 25rb dan parkir 5rb”</span>
    <div className={listening ? "dpx-glow" : "dpx-glow"} style={{ width: 88, height: 88, margin: "14px auto 6px", boxShadow: listening ? "0 0 0 12px rgba(26,93,198,.18),0 0 0 26px rgba(26,93,198,.08)" : "0 0 0 10px rgba(26,93,198,.10)" }}><I3 name="business-ai-assistant" px={58} /></div>
    <textarea className="dpx-textarea" aria-label="Catatan dalam satu kalimat" placeholder="Atau ketik di sini" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
    <div className="dpx-flex dpx-mt">
      <Btn type="button" className="dpx-btn" style={{ margin: 0, flex: 1 }} onClick={listen} aria-pressed={listening}><Ic n="mic" size="sm" /> {listening ? "Mendengarkan… ketuk selesai" : supported ? "Bicara" : "Bicara (tidak didukung)"}</Btn>
      <Btn type="button" className={`dpx-btn dpx-soft ${text.trim() ? "" : "dpx-off"}`} style={{ margin: 0, width: 96, padding: 0 }} onClick={submit} disabled={!text.trim()}><Ic n="up" size="sm" /> Kirim</Btn>
    </div>
    <div className="dpx-tile3 dpx-mt" style={{ gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
      <Btn type="button" className="dpx-tile dpx-t-mint" style={{ minHeight: 84 }} onClick={() => onManual("out")}><Ic n="edit" size="lg" /><span style={{ fontSize: 13 }}>Catat manual</span></Btn>
      <Btn type="button" className="dpx-tile dpx-t-lav" style={{ minHeight: 84 }} onClick={() => onManual("in")}><Ic n="down" size="lg" /><span style={{ fontSize: 13 }}>Pemasukan</span></Btn>
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

export function GoalSheet({ fin, goal, onClose, notify }: { fin: Finance; goal?: Goal; onClose: () => void; notify: Notify }) {
  const { dispatch } = fin;
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(String(goal?.target ?? ""));
  const ok = name.trim().length > 0 && Number(target) >= 1000;
  return <Sheet title={goal ? "Ubah tujuan" : "Tujuan baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama tujuan</span><div className="dpx-input"><input value={name} placeholder="Contoh: Dana darurat" maxLength={40} onChange={(e) => setName(e.target.value)} /></div></label>
    <label className="dpx-field"><span>Target</span><MoneyInput value={target} onChange={setTarget} label="Target" /></label>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { dispatch({ type: "goal/upsert", goal: { id: goal?.id ?? uid(), name: name.trim(), target: Number(target), deposits: goal?.deposits ?? [], createdAt: goal?.createdAt ?? new Date().toISOString() } }); onClose(); notify("Tujuan disimpan"); }}>Simpan tujuan</Btn>
    {goal ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { dispatch({ type: "goal/delete", id: goal.id }); onClose(); notify("Tujuan dihapus"); }}>Hapus tujuan</Btn> : null}
  </Sheet>;
}

export function GoalDetailSheet({ fin, goal, onClose, onEdit, notify }: { fin: Finance; goal: Goal; onClose: () => void; onEdit: () => void; notify: Notify }) {
  const [amount, setAmount] = useState("");
  const saved = goalSaved(goal);
  const pct = Math.min(100, Math.round((saved / goal.target) * 100));
  const proj = goalProjection(goal);
  return <Sheet title={goal.name} onClose={onClose}>
    <div className="dpx-group dpx-white dpx-center" style={{ boxShadow: "none", background: "var(--group)" }}><div className="dpx-money">{rupiah(saved)}</div><div className="dpx-sub">dari {rupiah(goal.target)} · {pct}%</div><div className="dpx-bar" style={{ marginTop: 10 }}><i style={{ width: `${Math.max(2, pct)}%` }} /></div></div>
    {proj.done ? <div className="dpx-note dpx-ok"><Ic n="check" /><div><b>Tujuan tercapai!</b></div></div> : proj.eta ? <div className="dpx-note dpx-info"><Ic n="spark" /><div>Rata-rata menabung <b>{rupiah(proj.perMonth)}/bulan</b> → tercapai sekitar <b>{proj.eta.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>.</div></div> : null}
    <label className="dpx-field"><span>Setor ke tujuan</span><MoneyInput value={amount} onChange={setAmount} label="Jumlah setoran" /></label>
    <Btn type="button" className={`dpx-btn ${Number(amount) > 0 ? "" : "dpx-off"}`} disabled={!(Number(amount) > 0)} onClick={() => { fin.dispatch({ type: "goal/deposit", id: goal.id, at: new Date().toISOString(), amount: Number(amount) }); setAmount(""); notify(`Setoran ${rupiah(Number(amount))} dicatat`); }}>Setor</Btn>
    {goal.deposits.length ? <><div className="dpx-glabel">Riwayat setoran</div><div className="dpx-group dpx-flush">{[...goal.deposits].reverse().slice(0, 5).map((d, i) => <div className="dpx-row" key={i}><span className="dpx-cat dpx-c-emerald"><Ic n="down" /></span><span className="dpx-main"><b>Setoran</b><span>{new Date(d.at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span></span><span className="dpx-trail"><b className="dpx-in">+{rupiah(d.amount)}</b></span></div>)}</div></> : null}
    <Btn type="button" className="dpx-btn dpx-ghost" onClick={onEdit}><Ic n="edit" size="sm" /> Ubah tujuan</Btn>
  </Sheet>;
}

export function DebtSheet({ fin, debt, onClose, notify }: { fin: Finance; debt?: Debt; onClose: () => void; notify: Notify }) {
  const [dir, setDir] = useState<Debt["direction"]>(debt?.direction ?? "owed_to_me");
  const [person, setPerson] = useState(debt?.person ?? "");
  const [amount, setAmount] = useState(String(debt?.amount ?? ""));
  const [note, setNote] = useState(debt?.note ?? "");
  const [due, setDue] = useState(debt?.due ?? "");
  const ok = person.trim() && Number(amount) > 0;
  return <Sheet title={debt ? "Ubah catatan hutang" : "Hutang & piutang"} onClose={onClose}>
    <Seg id="debt" label="Jenis" value={dir} onChange={setDir} options={[["owed_to_me", "Dia berutang"], ["i_owe", "Saya berutang"]] as const} />
    <label className="dpx-field"><span>Nama</span><div className="dpx-input"><input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Contoh: Budi" maxLength={40} /></div></label>
    <label className="dpx-field"><span>Jumlah</span><MoneyInput value={amount} onChange={setAmount} /></label>
    <label className="dpx-field"><span>Keterangan <em>opsional</em></span><div className="dpx-input"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Makan bareng" maxLength={80} /></div></label>
    <label className="dpx-field"><span>Jatuh tempo <em>opsional</em></span><div className="dpx-input"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div></label>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { fin.dispatch({ type: "debt/upsert", debt: { id: debt?.id ?? uid(), person: person.trim(), direction: dir, amount: Number(amount), note: note.trim(), due: due || undefined, settled: debt?.settled ?? false, createdAt: debt?.createdAt ?? new Date().toISOString() } }); onClose(); notify("Tersimpan"); }}>Simpan</Btn>
    {debt ? <><Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "debt/settle", id: debt.id }); onClose(); notify("Ditandai lunas"); }}>Tandai lunas</Btn><Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "debt/delete", id: debt.id }); onClose(); notify("Catatan dihapus"); }}>Hapus</Btn></> : null}
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
    <div className="dpx-streak">{s.week.map((d, i) => <div key={i} className={d.today ? "dpx-today" : d.logged ? "dpx-on" : ""}><i>{d.logged ? "✓" : "•"}</i>{labels[d.date.getDay()]}</div>)}</div>
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
  const ok = name.trim().length > 0;
  return <Sheet title={account ? "Ubah dompet" : "Dompet baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: BCA, OVO, Celengan" maxLength={30} /></div></label>
    <div className="dpx-chips" style={{ margin: "10px -18px 0" }}>{ACCOUNT_TYPES.map(([k, l]) => <Btn key={k} type="button" className={`dpx-chip ${type === k ? "dpx-on" : ""}`} onClick={() => { setType(k); setNegative(k === "card"); }}>{l}</Btn>)}</div>
    <label className="dpx-field"><span>{type === "card" ? "Tagihan saat ini" : "Saldo awal"}</span><MoneyInput value={opening} onChange={setOpening} label="Saldo awal" /></label>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { fin.dispatch({ type: "account/upsert", account: { id: account?.id ?? uid(), name: name.trim(), type, opening: (negative ? -1 : 1) * Number(opening || 0) } }); onClose(); notify("Dompet disimpan"); }}>Simpan dompet</Btn>
    {account && account.id !== "tunai" ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "account/archive", id: account.id }); onClose(); notify("Dompet diarsipkan"); }}>Arsipkan dompet</Btn> : null}
  </Sheet>;
}

export function CategoryEditSheet({ fin, category, onClose, notify }: { fin: Finance; category?: Category; onClose: () => void; notify: Notify }) {
  const [name, setName] = useState(category?.name ?? "");
  const [income, setIncome] = useState(category?.income ?? false);
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  const [tone, setTone] = useState(category?.tone ?? "blue");
  const ok = name.trim().length > 0;
  return <Sheet title={category ? "Ubah kategori" : "Kategori baru"} onClose={onClose}>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Nama</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Hobi" maxLength={24} /></div></label>
    {!category ? <div style={{ marginTop: 12 }}><Seg id="cat-kind" label="Jenis" value={income ? "in" : "out"} onChange={(v) => setIncome(v === "in")} options={[["out", "Pengeluaran"], ["in", "Pemasukan"]] as const} /></div> : null}
    <div className="dpx-glabel">Ikon</div>
    <div className="dpx-chips" style={{ margin: "0 -18px" }}>{CATEGORY_ICONS.map((i) => <Btn key={i} type="button" className={`dpx-chip ${icon === i ? "dpx-on" : ""}`} onClick={() => setIcon(i)} aria-label={i}><Ic n={i as IconName} size="sm" /></Btn>)}</div>
    <div className="dpx-glabel">Warna</div>
    <div className="dpx-chips" style={{ margin: "0 -18px" }}>{TONES.map((t) => <Btn key={t} type="button" className={`dpx-cat dpx-c-${t}`} style={{ width: 38, height: 38, flex: "none", outline: tone === t ? "3px solid var(--navy)" : "none", outlineOffset: 2 }} onClick={() => setTone(t)} aria-label={t} />)}</div>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { fin.dispatch({ type: "category/upsert", category: { id: category?.id ?? `c-${uid().slice(0, 8)}`, name: name.trim(), icon, tone, income, custom: category ? category.custom : true } }); onClose(); notify("Kategori disimpan"); }}>Simpan kategori</Btn>
    {category?.custom ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "category/delete", id: category.id }); onClose(); notify("Kategori dihapus · catatan dipindah ke Lainnya"); }}>Hapus kategori</Btn> : null}
  </Sheet>;
}

export { debtTotals };
