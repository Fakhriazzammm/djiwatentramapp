import "./loan.css";
import { useMemo, useState } from "react";
import { Btn, Ic, Seg, Sheet, type IconName } from "../shell/dpx-ui";
import { FullPage } from "./asset-ui";
import { MoneyInput } from "../finance/fin-sheets";
import type { FinCtx } from "../finance/fin-pages";
import { BiRateChip } from "./loan-parts";
import { uid } from "../../lib/finance/calc";
import { KIND_META, MODEL_LABEL, biScenario, currentRate, fixedLeft, floatsAfter, inFixedPeriod, isDone, monthKeyOf, monthsLeft, newLoan, nextInstallment, paidShare, progressOf, remainingRows, schedule, termsOf, totalInterestLeft, type LoanInput } from "../../lib/finance/loans";
import { DEFAULT_PASS_THROUGH } from "../../lib/finance/loans";
import { bpsLabel, dayLabel, pct2, useBiRate } from "../../lib/finance/rates";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Finance } from "../../lib/finance/use-finance";
import type { Loan, LoanKind } from "../../lib/finance/types";

type Notify = (text: string, undo?: () => void) => void;
const mask = (v: boolean, s: string) => (v ? s : "•••••");
const dec = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 6);
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
const years = (m: number) => (m >= 24 ? `${Math.floor(m / 12)} tahun${m % 12 ? ` ${m % 12} bln` : ""}` : `${m} bulan`);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* ---------- the card in Kewajiban ---------- */
const pctShare = (l: Loan) => { const v = paidShare(l) * 100; return `${(v < 10 && v > 0 ? Math.round(v * 10) / 10 : Math.round(v)).toString().replace(".", ",")}%`; };
export function LoanCard({ loan, visible, onOpen }: { loan: Loan; visible: boolean; onOpen: () => void }) {
  const bi = useBiRate();
  const m = KIND_META[loan.kind], done = isDone(loan), next = nextInstallment(loan), left = fixedLeft(loan);
  const lastChange = bi?.current?.lastChange;
  const impact = loan.kind === "kpr" && !done && floatsAfter(loan) && !inFixedPeriod(loan) && lastChange
    ? biScenario(termsOf(loan), lastChange.bps, DEFAULT_PASS_THROUGH, progressOf(loan)).deltaPayment : null;
  return <Btn type="button" className="dpx-ln-card" onClick={onOpen} aria-label={`Buka ${loan.name}`}>
    <div className="dpx-ln-top"><span className={`dpx-cat dpx-c-${m.tone}`}><Ic n={m.icon as IconName} /></span><div style={{ flex: 1, minWidth: 0 }}><b>{loan.name}</b><div className="dpx-sub">{loan.lender ? `${loan.lender} · ` : ""}{m.label}</div></div>
      <div style={{ textAlign: "right" }}><b style={{ fontVariantNumeric: "tabular-nums" }}>{done ? "Lunas" : mask(visible, rupiah(loan.balance))}</b>{done ? null : <div className="dpx-sub">sisa pokok</div>}</div></div>
    {done ? null : <><div className="dpx-ln-meter" role="img" aria-label={`${Math.round(paidShare(loan) * 100)}% pokok terbayar`}><i style={{ width: `${Math.max(2, paidShare(loan) * 100)}%` }} /></div>
      <div className="dpx-ln-chips"><span>Angsuran {mask(visible, rupiah(next))} · tgl {loan.dueDay}</span><span>{loan.paid} dari {loan.months} bulan</span>
        {inFixedPeriod(loan) ? <span className={left <= 6 ? "dpx-warn" : ""}>Bunga tetap {left} bln lagi</span> : floatsAfter(loan) ? <span className="dpx-warn">Bunga mengambang {pct2(currentRate(loan))}</span> : null}</div>
      {impact !== null && lastChange ? <div className="dpx-sub">BI-Rate {bpsLabel(lastChange.bps)} · dampak perkiraan {mask(visible, `${impact >= 0 ? "+" : "−"}${rupiah(Math.abs(impact))}/bulan`)}</div> : null}
    </>}
  </Btn>;
}

/* ---------- create / edit ---------- */
export function LoanSheet({ fin, loan, draft, notify, onClose }: { fin: Finance; loan?: Loan; draft?: LoanInput; notify: Notify; onClose: () => void }) {
  const base = loan ?? draft;
  const [name, setName] = useState(base?.name ?? ""), [kind, setKind] = useState<LoanKind>(base?.kind ?? "kpr"), [lender, setLender] = useState(base?.lender ?? "");
  const [model, setModel] = useState<Loan["model"]>(base?.model ?? "anuitas"), [principal, setPrincipal] = useState(base?.principal ? String(Math.round(base.principal)) : "");
  const [tenor, setTenor] = useState(base?.months ? String(base.months) : ""), [dueDay, setDueDay] = useState(String(base?.dueDay || (draft ? "" : new Date().getDate())));
  const [fixedRate, setFixedRate] = useState(base?.fixedRate !== undefined ? String(base.fixedRate).replace(".", ",") : ""), [fixedMonths, setFixedMonths] = useState(base?.fixedMonths ? String(base.fixedMonths) : "");
  const [floatRate, setFloatRate] = useState(base?.floatRate !== undefined ? String(base.floatRate).replace(".", ",") : "");
  const [paid, setPaid] = useState(base?.paid === undefined ? "" : String(base.paid)), [balance, setBalance] = useState(base?.balance === undefined ? "" : String(Math.round(base.balance))), [installment, setInstallment] = useState(base?.installment ? String(Math.round(base.installment)) : "");
  const properties = fin.state.assets.filter((asset) => asset.kind === "property");
  const [assetId, setAssetId] = useState(base?.assetId ?? "");
  const anuitas = model === "anuitas", months = Math.round(num(tenor)), day = Math.round(num(dueDay));
  const ok = name.trim() && num(principal) > 0 && months >= 1 && months <= 600 && day >= 1 && day <= 31;
  const save = () => {
    const input: LoanInput = { name: name.trim(), kind, assetId: kind === "kpr" && properties.some((asset) => asset.id === assetId) ? assetId : "", lender: lender.trim(), model, principal: num(principal), months, dueDay: day, fixedRate: num(fixedRate), fixedMonths: anuitas ? Math.min(months, Math.round(num(fixedMonths))) : months, floatRate: anuitas ? num(floatRate) : num(fixedRate), installment: num(installment) > 0 ? num(installment) : null };
    if (loan) { fin.dispatch({ type: "loan/upsert", loan: { ...loan, ...input, startDate: loan.startDate, balance: balance === "" ? loan.balance : num(balance), paid: paid === "" ? loan.paid : Math.round(num(paid)) } }); notify("Pinjaman diperbarui"); }
    else {
      const n = Math.round(num(paid)), l0 = newLoan(uid(), { ...input, paid: n });
      const bal = balance !== "" ? num(balance) : n > 0 ? schedule(termsOf(l0))[n - 1]?.balance ?? l0.principal : l0.principal;
      fin.dispatch({ type: "loan/upsert", loan: { ...l0, balance: Math.round(bal) } }); notify(`${input.name} disimpan. Angsurannya masuk ke tagihan bulanan.`);
    }
    onClose();
  };
  return <Sheet title={loan ? "Ubah pinjaman" : "Pinjaman baru"} onClose={onClose}><div className="dpx-ln-sheet">
    <Seg id="ls-kind" label="Jenis" value={kind} onChange={(k) => { setKind(k); if (!loan && !name) setName(KIND_META[k].label); }} options={[["kpr", "KPR"], ["kendaraan", "Kendaraan"], ["multiguna", "Multiguna"], ["lainnya", "Lainnya"]] as const} />
    <label className="dpx-field"><span>Nama</span><div className="dpx-input"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Contoh: KPR BTN rumah" aria-label="Nama pinjaman" /></div></label>
    <label className="dpx-field"><span>Bank atau pemberi pinjaman</span><div className="dpx-input"><input value={lender} maxLength={60} onChange={(e) => setLender(e.target.value)} placeholder="Contoh: BTN" aria-label="Pemberi pinjaman" /></div></label>
    {kind === "kpr" ? <label className="dpx-field"><span>Properti terkait</span><div className="dpx-input"><select value={properties.some((asset) => asset.id === assetId) ? assetId : ""} onChange={(e) => setAssetId(e.target.value)}>
      <option value="">Tanpa tautan properti</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
    </select></div>{properties.length ? null : <small>Tambahkan properti di Kekayaan → Aset untuk melihat ekuitas rumah.</small>}</label> : null}
    <Seg id="ls-model" label="Jenis bunga" value={model} onChange={setModel} options={[["anuitas", "Anuitas"], ["flat", "Flat"], ["syariah", "Syariah"]] as const} />
    <label className="dpx-field"><span>Plafon atau pokok awal</span><MoneyInput value={principal} onChange={setPrincipal} /></label>
    <div className="dpx-ln-two"><label className="dpx-field"><span>Tenor (bulan)</span><div className="dpx-input"><input inputMode="numeric" value={tenor} onChange={(e) => setTenor(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Tenor bulan" placeholder="180" /></div></label>
      <label className="dpx-field"><span>Jatuh tempo (tanggal)</span><div className="dpx-input"><input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Tanggal jatuh tempo" /></div></label></div>
    <div className="dpx-ln-two"><label className="dpx-field"><span>{anuitas ? "Bunga tetap (%/thn)" : "Bunga atau margin (%/thn)"}</span><div className="dpx-input"><input inputMode="decimal" value={fixedRate} onChange={(e) => setFixedRate(dec(e.target.value))} aria-label="Bunga" /></div></label>
      {anuitas ? <label className="dpx-field"><span>Masa tetap (bulan)</span><div className="dpx-input"><input inputMode="numeric" value={fixedMonths} onChange={(e) => setFixedMonths(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Masa bunga tetap bulan" placeholder="36" /></div></label> : null}</div>
    {anuitas ? <label className="dpx-field"><span>Bunga mengambang setelahnya (%/thn)</span><div className="dpx-input"><input inputMode="decimal" value={floatRate} onChange={(e) => setFloatRate(dec(e.target.value))} aria-label="Bunga mengambang" /></div></label> : null}
    <div className="dpx-glabel">Sudah berjalan? (opsional)</div>
    <div className="dpx-ln-two"><label className="dpx-field"><span>Angsuran sudah dibayar</span><div className="dpx-input"><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Angsuran sudah dibayar" placeholder="0" /></div></label>
      <label className="dpx-field"><span>Sisa pokok (sesuai bank)</span><MoneyInput value={balance} onChange={setBalance} placeholder="otomatis" /></label></div>
    <label className="dpx-field"><span>Angsuran sesuai bank (opsional)</span><MoneyInput value={installment} onChange={setInstallment} placeholder="dihitung otomatis" /></label>
    <p className="dpx-sub" style={{ margin: "0 4px" }}>Hitungan di aplikasi perkiraan. Isi angsuran dan sisa pokok dari mutasi bank bila angkanya berbeda.</p>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>Simpan</Btn>
    {loan ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "loan/delete", id: loan.id }); onClose(); notify("Pinjaman dihapus", () => fin.dispatch({ type: "loan/upsert", loan })); }}>Hapus pinjaman</Btn> : null}
  </div></Sheet>;
}

/* ---------- pay an instalment or prepay ---------- */
export function LoanPaySheet({ ctx, loan, extra, onClose }: { ctx: FinCtx; loan: Loan; extra: boolean; onClose: () => void }) {
  const { fin, notify } = ctx, accounts = fin.state.accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState(extra ? "" : String(nextInstallment(loan))), [date, setDate] = useState(today()), [account, setAccount] = useState(accounts[0]?.id ?? "tunai");
  const [mode, setMode] = useState<"shorter" | "lower">("shorter"), [record, setRecord] = useState(true);
  const at = date === today() ? new Date().toISOString() : new Date(`${date}T12:00:00+07:00`).toISOString();
  const alreadyPaid = !extra && (loan.payments.some((p) => !p.extra && monthKeyOf(p.at) === monthKeyOf(at)) ||
    fin.state.bills.find((bill) => bill.id === (loan.billId ?? `ln-${loan.id}`))?.paid.includes(monthKeyOf(at)));
  const amt = num(amount), ok = amt > 0 && !alreadyPaid && (!extra || amt <= loan.balance + 0.5);
  const save = () => {
    const prev = loan, entryId = uid(), month = monthKeyOf(at);
    fin.dispatch({ type: "loan/pay", id: loan.id, at, amount: amt, extra, mode });
    if (record) fin.dispatch({ type: "entry/add", entry: { id: entryId, kind: "out", amount: amt, categoryId: "tagihan", accountId: account, at, note: extra ? `Pelunasan sebagian ${loan.name}` : `Angsuran ${loan.name}`, tags: [`loan:${loan.id}`], source: "manual", createdAt: new Date().toISOString() } });
    notify(extra ? `Pelunasan sebagian ${rupiah(amt)} tercatat` : `Angsuran ${loan.name} ${rupiah(amt)} tercatat`, () => {
      fin.dispatch({ type: "loan/upsert", loan: prev }); if (record) fin.dispatch({ type: "entry/delete", id: entryId });
      if (!extra) fin.dispatch({ type: "bill/pay", id: prev.billId ?? `ln-${prev.id}`, month, paid: false });
    });
    onClose();
  };
  return <Sheet title={extra ? "Pelunasan sebagian" : "Bayar angsuran"} onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>{loan.name} · sisa pokok {rupiah(loan.balance)}</p>
    <label className="dpx-field"><span>{extra ? "Jumlah tambahan untuk pokok" : "Jumlah dibayar"}</span><MoneyInput value={amount} onChange={setAmount} /></label>
    {!extra ? <p className="dpx-sub" style={{ margin: "-2px 4px 6px" }}>Angsuran bulan ini {rupiah(nextInstallment(loan))}. Isi sesuai yang dipotong bank.</p> : <>
      <Seg id="lp-mode" label="Setelah pelunasan sebagian" value={mode} onChange={setMode} options={[["shorter", "Lunas lebih cepat"], ["lower", "Angsuran lebih kecil"]] as const} />
      <p className="dpx-sub" style={{ margin: "6px 4px" }}>{mode === "shorter" ? "Angsuran tetap, tenor memendek. Biasanya paling hemat bunga." : "Tenor tetap, angsuran per bulan turun."} Cek aturan dan denda pelunasan di banknya.</p></>}
    <label className="dpx-field"><span>Tanggal</span><div className="dpx-input"><input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Tanggal pembayaran" /></div></label>
    <label className="dpx-ln-row" style={{ cursor: "pointer", alignItems: "center", borderTop: 0 }}><span style={{ color: "var(--ink)" }}>Catat juga sebagai pengeluaran</span><input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} aria-label="Catat sebagai pengeluaran" /></label>
    {record ? <><div className="dpx-glabel">Dari dompet</div><div className="dpx-chips2">{accounts.map((a) => <Btn key={a.id} type="button" className={`dpx-chip3 ${account === a.id ? "dpx-on" : ""}`} aria-pressed={account === a.id} onClick={() => setAccount(a.id)}>{a.name}</Btn>)}</div></> : null}
    {alreadyPaid ? <p className="dpx-sub" role="status">Angsuran untuk bulan ini sudah tercatat.</p> : null}
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>{extra ? "Catat pelunasan" : "Catat pembayaran"}</Btn>
  </Sheet>;
}

/* ---------- when the bank changes the rate ---------- */
export function LoanRateSheet({ fin, loan, notify, onClose }: { fin: Finance; loan: Loan; notify: Notify; onClose: () => void }) {
  const bi = useBiRate();
  const [rate, setRate] = useState(String(currentRate(loan)).replace(".", ",")), [installment, setInstallment] = useState(loan.installment ? String(Math.round(loan.installment)) : "");
  const floating = !inFixedPeriod(loan) && floatsAfter(loan);
  const save = () => {
    const r = num(rate), next: Loan = floating || loan.model !== "anuitas" ? { ...loan, floatRate: r, ...(loan.model !== "anuitas" ? { fixedRate: r } : {}), installment: num(installment) > 0 ? num(installment) : null } : { ...loan, fixedRate: r, installment: num(installment) > 0 ? num(installment) : null };
    fin.dispatch({ type: "loan/upsert", loan: next }); notify(`Bunga ${pct2(r)} disimpan. Angsuran dihitung ulang.`); onClose();
  };
  return <Sheet title="Ubah bunga" onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>Isi bila bank memberi tahu bunga baru, misalnya saat masa bunga tetap berakhir atau bunga mengambang berubah.</p>
    {bi?.current ? <p className="dpx-sub" style={{ margin: "0 4px 8px" }}>BI-Rate sekarang {pct2(bi.current.rate)} ({dayLabel(bi.current.day)}). Bunga KPR ditentukan bank, bukan BI.</p> : null}
    <label className="dpx-field"><span>Bunga baru per tahun (%)</span><div className="dpx-input"><input inputMode="decimal" autoFocus value={rate} onChange={(e) => setRate(dec(e.target.value))} aria-label="Bunga baru" /></div></label>
    <label className="dpx-field"><span>Angsuran baru sesuai bank (opsional)</span><MoneyInput value={installment} onChange={setInstallment} placeholder="dihitung otomatis" /></label>
    <Btn type="button" className={`dpx-btn ${num(rate) > 0 ? "" : "dpx-off"}`} disabled={!(num(rate) > 0)} onClick={save}>Simpan</Btn>
  </Sheet>;
}

/* ---------- detail ---------- */
export function LoanDetail({ ctx, id, onClose }: { ctx: FinCtx; id: string; onClose: () => void }) {
  const loan = ctx.fin.state.loans.find((l) => l.id === id), visible = ctx.visible, bi = useBiRate();
  const [all, setAll] = useState(false);
  const rows = useMemo(() => (loan ? remainingRows(loan) : []), [loan]);
  if (!loan) return null;
  const done = isDone(loan), m = KIND_META[loan.kind], next = nextInstallment(loan), left = fixedLeft(loan), pt = DEFAULT_PASS_THROUGH;
  const biNote = bi?.current && floatsAfter(loan) && !done ? (() => {
    const up = biScenario(termsOf(loan), 25, pt, progressOf(loan)), c = bi.current!, last = c.lastChange;
    const effect = inFixedPeriod(loan) ? (up.floatPaymentAfter && up.floatPayment ? `Setelah masa tetap, tiap kenaikan 25 bps yang diteruskan setengahnya menambah sekitar ${rupiah(Math.abs(up.floatPaymentAfter - up.floatPayment))} per bulan.` : "") : `Bila bank meneruskan setengah dari kenaikan 25 bps, angsuran berubah sekitar ${rupiah(Math.abs(up.deltaPayment))} per bulan.`;
    return { last, effect, c };
  })() : null;
  const shown = all ? rows : rows.slice(0, 12);
  const biYear = bi?.history.filter((point) => Date.parse(point.day) >= Date.parse(bi.current?.day ?? "") - 365 * 86400_000).reverse() ?? [];
  const yearEnd = rows.filter((row, index) => (index + 1) % 12 === 0 || index === rows.length - 1);
  return <FullPage title={loan.name} onBack={onClose} right={<Btn type="button" className="dpx-rb" onClick={() => ctx.open({ k: "loan", id: loan.id })} aria-label="Ubah pinjaman"><Ic n="edit" size="sm" /></Btn>}>
    <div className="dpx-sk-body" style={{ padding: "6px 16px 24px" }}>
      <div className="dpx-group dpx-white">
        <div className="dpx-sub">{done ? "Pinjaman lunas" : "Sisa pokok"}</div>
        <div className="dpx-ln-hero">{done ? "Lunas" : mask(visible, rupiah(loan.balance))}</div>
        <div className="dpx-ln-meter" role="img" aria-label={`${Math.round(paidShare(loan) * 100)}% terbayar`}><i style={{ width: `${Math.max(2, paidShare(loan) * 100)}%` }} /></div>
        <div className="dpx-sub">{pctShare(loan)} pokok terbayar · {loan.paid} dari {loan.months} bulan{loan.lender ? ` · ${loan.lender}` : ""}</div>
        {done ? null : <div className="dpx-ln-grid"><div><small>Angsuran berikut (tgl {loan.dueDay})</small><b>{mask(visible, rupiah(next))}</b></div><div><small>Bunga sekarang</small><b>{pct2(currentRate(loan))}</b></div><div><small>Sisa tenor</small><b>{years(monthsLeft(loan))}</b></div><div><small>Bunga yang masih akan dibayar</small><b>{mask(visible, rupiah(totalInterestLeft(loan)))}</b></div></div>}
      </div>
      {done ? null : <div style={{ display: "flex", gap: 10, marginTop: 12 }}><Btn type="button" className="dpx-btn dpx-onb-go" style={{ margin: 0 }} onClick={() => ctx.open({ k: "loan-pay", id: loan.id })}>Bayar angsuran</Btn><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => ctx.open({ k: "loan-pay", id: loan.id, extra: true })}>Pelunasan sebagian</Btn></div>}

      {!done && floatsAfter(loan) ? <div style={{ marginTop: 12 }}>
        <BiRateChip />
        <div className="dpx-group dpx-white">
          {inFixedPeriod(loan) ? <div className="dpx-note" style={{ marginTop: 0, background: left <= 6 ? "var(--warn-soft)" : "var(--group)", color: left <= 6 ? "#6b4300" : "var(--ink)" }}><Ic n="info" /><div><b>Bunga tetap berakhir dalam {left} bulan.</b> Setelah itu bunga mengambang (perkiraan {pct2(loan.floatRate)}) dan angsuran menjadi sekitar {rupiah(rows.find((r) => r.n === loan.fixedMonths + 1)?.payment ?? 0)}.</div></div>
            : <div className="dpx-note dpx-info" style={{ marginTop: 0 }}><Ic n="info" /><div><b>Bunga mengambang {pct2(currentRate(loan))}.</b> Bila bank mengumumkan bunga baru, ubah di bawah supaya angsuran dihitung ulang.</div></div>}
          {biNote ? <p className="dpx-sub" style={{ margin: "8px 2px 0" }}>{biNote.last ? `BI-Rate ${bpsLabel(biNote.last.bps)} ke ${pct2(biNote.last.to)} pada ${dayLabel(biNote.last.day)}. ` : ""}{biNote.effect} Ini perkiraan, bunga sebenarnya mengikuti keputusan bank.</p> : null}
          {biYear.length ? <>
            <div className="dpx-ln-chart" role="img" aria-label="Riwayat BI-Rate selama 12 bulan">
              {biYear.map((point) => <i key={point.day} title={`${dayLabel(point.day)} · ${pct2(point.rate)}`}><s style={{ height: `${point.rate / Math.max(...biYear.map((p) => p.rate)) * 100}%` }} /></i>)}
            </div>
            <div className="dpx-ln-legend"><span>BI-Rate · 12 bulan</span><span>Bunga KPR sekarang {pct2(currentRate(loan))}</span></div>
          </> : null}
          <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => ctx.open({ k: "loan-rate", id: loan.id })}>Ubah bunga</Btn>
        </div></div> : null}

      {!done ? <><div className="dpx-ln-sec">Jadwal berikutnya</div>
        <div className="dpx-group dpx-white">
          {yearEnd.length > 1 && visible ? <>
            <div className="dpx-ln-chart" role="img" aria-label="Perkiraan penurunan sisa pokok per tahun">{yearEnd.map((row) => <i key={row.n} title={`Angsuran ke-${row.n}: ${rupiah(row.balance)}`}><u style={{ height: `${row.balance / loan.balance * 100}%` }} /></i>)}</div>
            <div className="dpx-ln-legend"><span>Sisa pokok per tahun</span></div>
          </> : null}
          <table className="dpx-ln-table"><thead><tr><th>Ke-</th><th>Angsuran</th><th>Bunga</th><th>Sisa pokok</th></tr></thead><tbody>{shown.map((r) => <tr key={r.n}><td>{r.n}</td><td>{mask(visible, rupiah(r.payment))}</td><td>{mask(visible, rupiah(r.interest))}</td><td>{mask(visible, rupiah(r.balance))}</td></tr>)}</tbody></table>
          {rows.length > 12 ? <Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>{all ? "Tampilkan 12 bulan saja" : `Lihat semua (${rows.length} bulan)`}</Btn> : null}
          <p className="dpx-sub" style={{ margin: "8px 0 0" }}>Perkiraan. Bank bisa membulatkan dan menghitung hari sedikit berbeda.</p></div></> : null}

      <div className="dpx-ln-sec">Riwayat pembayaran</div>
      <div className="dpx-group dpx-white dpx-flush">{loan.payments.length ? [...loan.payments].reverse().map((p, i) => <div className="dpx-ln-row" key={`${p.at}-${i}`}><span>{new Date(p.at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} · {p.extra ? "pelunasan sebagian" : "angsuran"}<small style={{ display: "block", fontSize: 11.5 }}>pokok {mask(visible, rupiah(p.principal))}{p.interest ? ` · bunga ${mask(visible, rupiah(p.interest))}` : ""}</small></span><b>{mask(visible, rupiah(p.amount))}</b></div>) : <p className="dpx-sub" style={{ padding: 12, margin: 0 }}>Belum ada pembayaran tercatat di aplikasi.</p>}</div>
      <p className="dpx-sub" style={{ margin: "10px 4px 0" }}>{m.label} · {MODEL_LABEL[loan.model]} · perkiraan, bukan nasihat keuangan.</p>
    </div>
  </FullPage>;
}
