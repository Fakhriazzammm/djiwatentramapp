import { useState } from "react";
import { rupiah } from "../../lib/djiwa-pay-format";
import { schedule, summarize, type Terms } from "../../lib/finance/loans";
import { dayLabel, pct2, useBiRate } from "../../lib/finance/rates";
import { MoneyInput } from "../finance/fin-sheets";

const decimal = (value: string) => Number(value.replace(",", "."));
const SBDK = [
  { bank: "BCA", rate: 9.07, period: "September 2026", source: "https://www.bca.co.id/id/informasi/Suku-Bunga-Dasar-Kredit" },
  { bank: "BNI", rate: 8.50, period: "Oktober 2026", source: "https://bni.co.id/id-id/beranda/suku-bunga-dasar-kredit" },
  { bank: "Mandiri", rate: 12.10, period: "Agustus 2026", source: "https://www.bankmandiri.co.id/web/guest/suku-bunga-dasar-kredit" },
] as const;

export function KprRates() {
  const bi = useBiRate();
  return <details className="dpx-group dpx-white dpx-ln-panel">
    <summary className="dpx-ln-sec">Suku bunga BI dan SBDK KPR</summary>
    {bi?.history.length ? <table className="dpx-ln-table"><thead><tr><th scope="col">Keputusan BI</th><th scope="col">BI-Rate</th></tr></thead>
      <tbody>{bi.history.slice(0, 12).map((point) => <tr key={point.day}><td>{dayLabel(point.day)}</td><td>{pct2(point.rate)}</td></tr>)}</tbody>
    </table> : null}
    <p className="dpx-sub">RDG 18 November 2026 · Deposit Facility 5,25% · Lending Facility 6,75%. <a href="https://www.bi.go.id/en/publikasi/ruang-media/news-release/Pages/sp_2825426.aspx" target="_blank" rel="noreferrer">Siaran pers BI ↗</a></p>
    <p className="dpx-sub">Referensi SBDK KPR/KPA, diperiksa 20 November 2026. Bunga dalam penawaran bank juga mempertimbangkan premi risiko debitur dan ketentuan produk.</p>
    <table className="dpx-ln-table">
      <thead><tr><th scope="col">Bank</th><th scope="col">SBDK</th><th scope="col">Periode data</th></tr></thead>
      <tbody>{SBDK.map((row) => <tr key={row.bank}>
        <td><a href={row.source} target="_blank" rel="noreferrer">{row.bank}</a></td>
        <td>{pct2(row.rate)}</td><td>{row.period}</td>
      </tr>)}</tbody>
    </table>
    <a className="dpx-linkbtn" href="https://data.ojk.go.id/SJKPublic/Dataset/Dataset/Dataset/380" target="_blank" rel="noreferrer">Lihat dataset SBDK di OJK ↗</a>
  </details>;
}

export function KprOffers({ terms, propertyPrice, initialFees }: { terms: Terms; propertyPrice: number; initialFees: number }) {
  const [firstBank, setFirstBank] = useState("");
  const [secondBank, setSecondBank] = useState("");
  const [price, setPrice] = useState("");
  const [termYears, setTermYears] = useState("");
  const [fixed, setFixed] = useState("");
  const [fixYears, setFixYears] = useState("");
  const [floating, setFloating] = useState("");
  const [feesA, setFeesA] = useState("");
  const [feesB, setFeesB] = useState("");
  const numeric = (label: string, value: string, set: (value: string) => void) =>
    <label className="dpx-field"><span>{label}</span><div className="dpx-input"><input inputMode="decimal" value={value} onChange={(event) => set(event.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} /></div></label>;
  const first = summarize(schedule(terms), terms);
  const months = Math.round(decimal(termYears) * 12);
  const fixedMonths = Math.round(decimal(fixYears) * 12);
  const secondTerms: Terms = {
    principal: price ? Number(price) : terms.principal, months, model: "anuitas",
    fixedRate: decimal(fixed), fixedMonths, floatRate: decimal(floating),
  };
  const valid = secondTerms.principal > 0 && secondTerms.principal <= propertyPrice && months >= 12 && months <= 360 &&
    fixYears !== "" && fixedMonths >= 0 && fixedMonths <= months &&
    (fixedMonths === 0 || (fixed !== "" && secondTerms.fixedRate >= 0 && secondTerms.fixedRate <= 60)) &&
    (fixedMonths === months || (floating !== "" && secondTerms.floatRate >= 0 && secondTerms.floatRate <= 60));
  const second = valid ? summarize(schedule(secondTerms), secondTerms) : null;
  const costA = propertyPrice - terms.principal + (feesA === "" ? initialFees : Number(feesA)) + first.totalPaid;
  const costB = second ? propertyPrice - secondTerms.principal + Number(feesB) + second.totalPaid : 0;
  return <details className="dpx-group dpx-white dpx-ln-panel">
    <summary className="dpx-ln-sec">Bandingkan dua penawaran bank</summary>
    <p className="dpx-sub">Penawaran A memakai simulasi di atas. Masukkan angka penawaran B untuk properti yang sama. Biaya awal di bawah diisi di luar uang muka.</p>
    <div className="dpx-ln-two">
      <label className="dpx-field"><span>Bank A</span><div className="dpx-input"><input value={firstBank} onChange={(e) => setFirstBank(e.target.value)} maxLength={40} /></div></label>
      <label className="dpx-field"><span>Bank B</span><div className="dpx-input"><input value={secondBank} onChange={(e) => setSecondBank(e.target.value)} maxLength={40} /></div></label>
      <label className="dpx-field"><span>Biaya awal A</span><MoneyInput value={feesA} onChange={setFeesA} placeholder={initialFees.toLocaleString("id-ID")} /></label>
      <label className="dpx-field"><span>Biaya awal B</span><MoneyInput value={feesB} onChange={setFeesB} placeholder="0" /></label>
      <label className="dpx-field"><span>Plafon B</span><MoneyInput value={price} onChange={setPrice} placeholder="Sama dengan A" /></label>
      {numeric("Tenor B (tahun)", termYears, setTermYears)}
      {numeric("Bunga tetap B (%/tahun)", fixed, setFixed)}
      {numeric("Masa tetap B (tahun)", fixYears, setFixYears)}
      {numeric("Bunga mengambang B (%/tahun)", floating, setFloating)}
    </div>
    {second ? <>
      <table className="dpx-ln-table">
        <thead><tr><th scope="col">Perkiraan</th><th scope="col">{firstBank.trim() || "Bank A"}</th><th scope="col">{secondBank.trim() || "Bank B"}</th></tr></thead>
        <tbody>
          <tr><th scope="row">Angsuran awal</th><td>{rupiah(first.firstPayment)}</td><td>{rupiah(second.firstPayment)}</td></tr>
          <tr><th scope="row">Setelah masa tetap</th><td>{first.paymentAfterFixed ? rupiah(first.paymentAfterFixed) : "—"}</td><td>{second.paymentAfterFixed ? rupiah(second.paymentAfterFixed) : "—"}</td></tr>
          <tr><th scope="row">Total bunga</th><td>{rupiah(first.totalInterest)}</td><td>{rupiah(second.totalInterest)}</td></tr>
          <tr><th scope="row">Total dengan DP dan biaya</th><td>{rupiah(costA)}</td><td>{rupiah(costB)}</td></tr>
        </tbody>
      </table>
      <p className="dpx-sub">{Math.round(costA - costB) === 0 ? "Total kedua penawaran sama." : `${(costA < costB ? firstBank : secondBank).trim() || (costA < costB ? "Bank A" : "Bank B")} lebih rendah sekitar ${rupiah(Math.abs(costA - costB))} selama tenor.`}</p>
    </> : <p className="dpx-sub">Isi tenor dan bunga sesuai penawaran B untuk melihat perbandingan.</p>}
  </details>;
}
