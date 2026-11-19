import { useMemo, useState } from "react";
import { Btn, Ic, Seg, AnimatedNumber } from "../shell/dpx-ui";
import { MoneyInput } from "../finance/fin-sheets";
import type { FinCtx } from "../finance/fin-pages";
import { BiRateChip } from "./loan-parts";
import { DEFAULT_PASS_THROUGH, biScenario, dsr, prepaymentGain, schedule, summarize, upfront, yearly, type Terms, type LoanInput } from "../../lib/finance/loans";
import { pct2, useBiRate } from "../../lib/finance/rates";
import { rupiah } from "../../lib/djiwa-pay-format";

type Kind = "kpr" | "kendaraan" | "lainnya";
const KINDS = [["kpr", "KPR"], ["kendaraan", "Kendaraan"], ["lainnya", "Lainnya"]] as const;
const num = (s: string) => Number(s.replace(",", ".")) || 0;
const dec = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 6);

/** Alat → Pinjaman: KPR with a fixed then floating rate, vehicle and other loans, what prepaying saves, and what a BI-Rate move would do. */
export function LoanCalc({ ctx }: { ctx: FinCtx }) {
  const bi = useBiRate();
  const [kind, setKind] = useState<Kind>("kpr");
  const [price, setPrice] = useState("1000000000"), [dpMode, setDpMode] = useState<"pct" | "rp">("pct"), [dpPct, setDpPct] = useState("20"), [dpRp, setDpRp] = useState("200000000");
  const [years, setYears] = useState("15"), [months, setMonths] = useState("36"), [sharia, setSharia] = useState<"konv" | "syariah">("konv"), [model, setModel] = useState<"anuitas" | "flat">("anuitas");
  const [fixRate, setFixRate] = useState("7"), [fixYears, setFixYears] = useState("3"), [floatRate, setFloatRate] = useState(""), [margin, setMargin] = useState("8"), [rate, setRate] = useState("12");
  const [income, setIncome] = useState(""), [extraMonthly, setExtraMonthly] = useState(""), [lumpAmount, setLumpAmount] = useState(""), [lumpYear, setLumpYear] = useState("5");
  const [pass, setPass] = useState<"0" | "0.5" | "1">("0.5"), [showTable, setShowTable] = useState(false), [showCosts, setShowCosts] = useState(false);

  const pick = (k: Kind) => { setKind(k); if (k === "kpr") { setPrice("1000000000"); setDpPct("20"); setDpMode("pct"); } else if (k === "kendaraan") { setPrice("250000000"); setDpPct("20"); setDpMode("pct"); setMonths("36"); setModel("flat"); setRate("6"); } else { setPrice("12000000"); setDpPct("0"); setDpMode("pct"); setMonths("12"); setModel("anuitas"); setRate("12"); } };
  const defaultFloat = bi?.current ? Math.round((bi.current.rate + 4.5) * 4) / 4 : 11;
  const kpr = kind === "kpr", konv = sharia === "konv";
  const p = Math.max(0, num(price)), dp = dpMode === "pct" ? Math.round((p * Math.min(100, num(dpPct))) / 100) : Math.min(p, num(dpRp)), principal = Math.max(0, p - dp);
  const tenor = kpr ? Math.round(num(years) * 12) : Math.round(num(months));
  const terms: Terms = useMemo(() => kpr
    ? { principal, months: tenor, model: konv ? "anuitas" : "syariah", fixedRate: konv ? num(fixRate) : num(margin), fixedMonths: konv ? Math.min(tenor, Math.round(num(fixYears) * 12)) : tenor, floatRate: konv ? (floatRate === "" ? defaultFloat : num(floatRate)) : num(margin) }
    : { principal, months: tenor, model, fixedRate: num(rate), fixedMonths: tenor, floatRate: num(rate) }, [kpr, principal, tenor, konv, fixRate, fixYears, floatRate, margin, model, rate, defaultFloat]);
  const ok = principal > 0 && tenor >= 1;
  const rows = useMemo(() => (ok ? schedule(terms) : []), [ok, terms]), s = useMemo(() => summarize(rows, terms), [rows, terms]), ys = useMemo(() => yearly(rows), [rows]);
  const maxYear = Math.max(1, ...ys.map((y) => y.payment));
  const floats = kpr && konv && terms.fixedMonths < terms.months;
  const gain = useMemo(() => {
    const lumps = num(lumpAmount) > 0 ? [{ at: Math.max(1, Math.round(num(lumpYear) * 12)), amount: num(lumpAmount) }] : [];
    return ok && (num(extraMonthly) > 0 || lumps.length) ? prepaymentGain(terms, { monthly: num(extraMonthly), lumps }) : null;
  }, [ok, terms, extraMonthly, lumpAmount, lumpYear]);
  const ratio = num(income) > 0 ? dsr(s.firstPayment, num(income)) : null;
  const costs = kpr ? upfront(p, dp) : null;
  const scn = useMemo(() => (floats && ok ? [-50, -25, 0, 25, 50].map((d) => ({ d, ...biScenario(terms, d, Number(pass)) })) : []), [floats, ok, terms, pass]);
  const draft = (): LoanInput => ({ name: kpr ? "KPR" : kind === "kendaraan" ? "Cicilan kendaraan" : "Pinjaman", kind: kpr ? "kpr" : kind === "kendaraan" ? "kendaraan" : "lainnya", lender: "", model: terms.model, principal, months: terms.months, dueDay: new Date().getDate(), fixedRate: terms.fixedRate, fixedMonths: terms.fixedMonths, floatRate: terms.floatRate, installment: null });
  const lvl = ratio?.level;

  return <div>
    <Seg id="ln-kind" label="Jenis pinjaman" value={kind} onChange={pick} options={KINDS} />
    <div style={{ height: 10 }} />
    {kpr ? <BiRateChip /> : null}
    <div className="dpx-group dpx-white">
      <label className="dpx-field" style={{ marginTop: 0 }}><span>{kpr ? "Harga properti" : kind === "kendaraan" ? "Harga kendaraan" : "Jumlah pinjaman"}</span><MoneyInput value={price} onChange={setPrice} /></label>
      {kind !== "lainnya" ? <>
        <Seg id="ln-dpm" label="Cara isi DP" value={dpMode} onChange={setDpMode} options={[["pct", "DP dalam %"], ["rp", "DP dalam Rp"]] as const} />
        {dpMode === "pct" ? <label className="dpx-field"><span>DP ({rupiah(dp)})</span><div className="dpx-input"><input inputMode="decimal" value={dpPct} onChange={(e) => setDpPct(dec(e.target.value))} aria-label="DP persen" /><b>%</b></div></label>
          : <label className="dpx-field"><span>DP</span><MoneyInput value={dpRp} onChange={setDpRp} /></label>}
      </> : null}
      {kpr ? <>
        <div className="dpx-glabel" style={{ marginTop: 8 }}>Tenor</div>
        <Seg id="ln-yr" label="Tenor tahun" value={years} onChange={setYears} options={[["10", "10 th"], ["15", "15 th"], ["20", "20 th"], ["25", "25 th"], ["30", "30 th"]] as const} />
        <div className="dpx-glabel" style={{ marginTop: 8 }}>Jenis KPR</div>
        <Seg id="ln-sh" label="Konvensional atau syariah" value={sharia} onChange={setSharia} options={[["konv", "Konvensional"], ["syariah", "Syariah"]] as const} />
        {konv ? <>
          <div className="dpx-ln-two"><label className="dpx-field"><span>Bunga tetap (%/thn)</span><div className="dpx-input"><input inputMode="decimal" value={fixRate} onChange={(e) => setFixRate(dec(e.target.value))} aria-label="Bunga tetap" /></div></label>
            <label className="dpx-field"><span>Masa tetap (tahun)</span><div className="dpx-input"><input inputMode="numeric" value={fixYears} onChange={(e) => setFixYears(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Masa bunga tetap" /></div></label></div>
          <label className="dpx-field"><span>Bunga mengambang setelahnya (%/thn)</span><div className="dpx-input"><input inputMode="decimal" value={floatRate} placeholder={String(defaultFloat).replace(".", ",")} onChange={(e) => setFloatRate(dec(e.target.value))} aria-label="Bunga mengambang" /></div></label>
          <p className="dpx-sub" style={{ margin: "-4px 4px 4px" }}>{floatRate === "" ? `Perkiraan sementara: BI-Rate + 4,5%. Isi dengan angka dari penawaran banknya.` : "Isi dari penawaran bank."}</p>
        </> : <label className="dpx-field"><span>Margin per tahun (%)</span><div className="dpx-input"><input inputMode="decimal" value={margin} onChange={(e) => setMargin(dec(e.target.value))} aria-label="Margin" /></div></label>}
      </> : <>
        <div className="dpx-glabel" style={{ marginTop: 8 }}>Tenor</div>
        <Seg id="ln-mo" label="Tenor bulan" value={months} onChange={setMonths} options={[["12", "12"], ["24", "24"], ["36", "36"], ["48", "48"], ["60", "60 bln"]] as const} />
        <Seg id="ln-md" label="Jenis bunga" value={model} onChange={setModel} options={[["anuitas", "Anuitas"], ["flat", "Flat"]] as const} />
        <label className="dpx-field"><span>Bunga per tahun (%)</span><div className="dpx-input"><input inputMode="decimal" value={rate} onChange={(e) => setRate(dec(e.target.value))} aria-label="Bunga per tahun" /></div></label>
      </>}
      {kpr ? <label className="dpx-field"><span>Penghasilan bulanan (opsional)</span><MoneyInput value={income} onChange={setIncome} /></label> : null}
    </div>

    {ok ? <>
      <div className="dpx-group dpx-white" style={{ marginTop: 12 }}>
        <div className="dpx-sub">Angsuran per bulan{floats ? ` (${Math.round(terms.fixedMonths / 12)} tahun pertama)` : ""}</div>
        <div className="dpx-ln-hero"><AnimatedNumber value={s.firstPayment} format={(n) => rupiah(n)} /></div>
        {floats && s.paymentAfterFixed ? <div className="dpx-sub" style={{ marginTop: 2 }}>Setelah itu sekitar <b>{rupiah(s.paymentAfterFixed)}</b> bila bunga {pct2(terms.floatRate)}{s.paymentAfterFixed > s.firstPayment ? ` (naik ${rupiah(s.paymentAfterFixed - s.firstPayment)})` : ""}</div> : null}
        <div className="dpx-ln-grid"><div><small>{kpr ? "Plafon kredit" : "Pokok"}</small><b>{rupiah(principal)}</b></div><div><small>Lama</small><b>{terms.months >= 24 ? `${Math.round(terms.months / 12 * 10) / 10} tahun` : `${terms.months} bulan`}</b></div><div><small>Total bunga</small><b>{rupiah(s.totalInterest)}</b></div><div><small>Total dibayar</small><b>{rupiah(s.totalPaid)}</b></div></div>
        {ratio ? <div className="dpx-note" style={{ marginTop: 10, background: lvl === "ok" ? "var(--ok-soft)" : lvl === "warn" ? "var(--warn-soft)" : "var(--danger-soft)", color: lvl === "ok" ? "var(--ok)" : lvl === "warn" ? "#6b4300" : "var(--danger)" }}><Ic n={lvl === "ok" ? "check" : "warn"} /><div><b>Angsuran {Math.round((ratio.ratio ?? 0) * 100)}% dari penghasilan.</b> {lvl === "ok" ? "Masih di batas aman (sekitar 30% atau kurang)." : lvl === "warn" ? "Mendekati batas yang biasa dipakai bank (sekitar 35%)." : "Di atas batas yang biasa dipakai bank, pengajuan bisa ditolak."}</div></div> : null}
      </div>

      {costs ? <div className="dpx-group dpx-white" style={{ marginTop: 12 }}>
        <Btn type="button" className="dpx-linkbtn" style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between" }} aria-expanded={showCosts} onClick={() => setShowCosts((v) => !v)}><b style={{ color: "var(--ink)" }}>Biaya di awal (perkiraan)</b><b>{rupiah(costs.total)}</b></Btn>
        {showCosts ? <div style={{ marginTop: 6 }}>{([["DP", costs.dp], ["Provisi bank (1%)", costs.provisi], ["Asuransi jiwa dan kebakaran (0,5%)", costs.asuransi], ["Notaris dan PPAT (1%)", costs.notaris], ["BPHTB (5% setelah Rp80 juta)", costs.bphtb], ["Appraisal", costs.appraisal]] as [string, number][]).map(([k, v]) => <div className="dpx-ln-row" key={k}><span>{k}</span><b>{rupiah(v)}</b></div>)}<p className="dpx-sub" style={{ margin: "8px 0 0" }}>Angka ini perkiraan umum. Batas bebas BPHTB dan biaya bank berbeda tiap daerah dan bank, tanyakan rinciannya sebelum akad.</p></div> : null}
      </div> : null}

      <div className="dpx-group dpx-white" style={{ marginTop: 12 }}>
        <div className="dpx-ln-sec" style={{ margin: 0 }}>Ke mana uangnya pergi</div>
        <div className="dpx-ln-chart" role="img" aria-label="Pokok dan bunga per tahun">{ys.map((y) => <i key={y.year} title={`Tahun ${y.year}`}><s style={{ height: `${(y.interest / maxYear) * 100}%` }} /><u style={{ height: `${(y.principal / maxYear) * 100}%` }} /></i>)}</div>
        <div className="dpx-ln-legend"><span><i style={{ background: "var(--navy)" }} />Pokok</span><span><i style={{ background: "var(--blue)" }} />Bunga</span><span style={{ marginLeft: "auto" }}>Tahun 1 sampai {ys.length}</span></div>
        <Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8 }} aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>{showTable ? "Sembunyikan jadwal per tahun" : "Lihat jadwal per tahun"}</Btn>
        {showTable ? <table className="dpx-ln-table"><thead><tr><th>Tahun</th><th>Angsuran</th><th>Bunga</th><th>Sisa pokok</th></tr></thead><tbody>{ys.map((y) => <tr key={y.year}><td>{y.year}</td><td>{rupiah(y.payment)}</td><td>{rupiah(y.interest)}</td><td>{rupiah(y.balance)}</td></tr>)}</tbody></table> : null}
      </div>

      <div className="dpx-group dpx-white" style={{ marginTop: 12 }}>
        <div className="dpx-ln-sec" style={{ margin: 0 }}>Kalau dilunasi lebih cepat</div>
        <label className="dpx-field"><span>Tambahan per bulan</span><MoneyInput value={extraMonthly} onChange={setExtraMonthly} placeholder="0" /></label>
        <div className="dpx-ln-two"><label className="dpx-field"><span>Sekali bayar</span><MoneyInput value={lumpAmount} onChange={setLumpAmount} placeholder="0" /></label>
          <label className="dpx-field"><span>Di tahun ke-</span><div className="dpx-input"><input inputMode="numeric" value={lumpYear} onChange={(e) => setLumpYear(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Tahun pelunasan sebagian" /></div></label></div>
        {gain ? <div className="dpx-note dpx-info" style={{ marginTop: 6 }}><Ic n="check" /><div><b>Lunas {gain.monthsSaved > 0 ? `${Math.floor(gain.monthsSaved / 12) ? `${Math.floor(gain.monthsSaved / 12)} tahun ` : ""}${gain.monthsSaved % 12 ? `${gain.monthsSaved % 12} bulan ` : ""}lebih cepat` : "di waktu yang sama"}</b>, hemat bunga {rupiah(Math.max(0, gain.interestSaved))}. Cek aturan pelunasan sebagian dan denda di banknya.</div></div> : <p className="dpx-sub" style={{ margin: "4px 4px 0" }}>Isi salah satu untuk melihat berapa bunga yang bisa dihemat.</p>}
      </div>

      {floats ? <div className="dpx-group dpx-white" style={{ marginTop: 12 }}>
        <div className="dpx-ln-sec" style={{ margin: 0 }}>Kalau BI-Rate berubah</div>
        <p className="dpx-sub" style={{ margin: "2px 0 8px" }}>Bank menentukan bunga mengambangnya sendiri. Ini perkiraan bila bank meneruskan sebagian dari perubahan BI-Rate.</p>
        <Seg id="ln-pt" label="Seberapa diteruskan bank" value={pass} onChange={setPass} options={[["0", "Tidak"], ["0.5", "Setengah"], ["1", "Penuh"]] as const} />
        <div className="dpx-ln-scn">{scn.map((x) => <div key={x.d} style={{ display: "contents" }}><span>{x.d === 0 ? "BI-Rate tetap" : `BI-Rate ${x.d > 0 ? "naik" : "turun"} ${Math.abs(x.d)} bps`}</span><span className="dpx-ln-d">{x.floatPaymentAfter ? rupiah(x.floatPaymentAfter) : "–"}</span><span className={x.deltaPayment > 0 ? "dpx-dn" : x.deltaPayment < 0 ? "dpx-up" : "dpx-sub"}>{x.deltaPayment === 0 ? "–" : `${x.deltaPayment > 0 ? "+" : "−"}${rupiah(Math.abs(x.deltaPayment))}`}</span></div>)}</div>
        <p className="dpx-sub" style={{ margin: "8px 0 0" }}>Angsuran setelah masa bunga tetap. Asumsi bawaan {Math.round(DEFAULT_PASS_THROUGH * 100)}% diteruskan; bunga sebenarnya mengikuti keputusan bank.</p>
      </div> : null}

      <Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "loan", draft: draft() })}><Ic n="plus" size="sm" /> Simpan sebagai pinjaman saya</Btn>
    </> : <p className="dpx-sub" style={{ margin: "12px 4px" }}>Isi harga dan tenor untuk melihat angsurannya.</p>}
  </div>;
}
