import { useEffect, useRef, useState } from "react";
import { Btn, Ic, Seg, Sheet, type IconName } from "../shell/dpx-ui";
import { MoneyInput, type Notify } from "../finance/fin-sheets";
import { uid } from "../../lib/finance/calc";
import { ASSET_KINDS, DEFAULT_POCKETS, monthKey, payoffPlan, weeklyReview } from "../../lib/finance/kelola";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Asset, Bill, Entry, Pocket } from "../../lib/finance/types";
import type { Finance } from "../../lib/finance/use-finance";

const BILL_PRESETS: { name: string; icon: string; tone: string }[] = [
  { name: "Listrik", icon: "flash", tone: "amber" }, { name: "Internet", icon: "wifi", tone: "blue" }, { name: "Air", icon: "drop", tone: "cyan" },
  { name: "Cicilan", icon: "card", tone: "violet" }, { name: "Langganan", icon: "tv", tone: "rose" }, { name: "Sewa", icon: "home", tone: "indigo" },
];

export function BillSheet({ fin, bill, onClose, notify }: { fin: Finance; bill?: Bill; onClose: () => void; notify: Notify }) {
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(String(bill?.amount ?? ""));
  const [day, setDay] = useState(String(bill?.day ?? new Date().getDate()));
  const [preset, setPreset] = useState(BILL_PRESETS.find((p) => p.icon === bill?.icon) ?? BILL_PRESETS[0]);
  const d = Number(day), ok = name.trim() && Number(amount) > 0 && d >= 1 && d <= 31;
  const save = () => { fin.dispatch({ type: "bill/upsert", bill: { id: bill?.id ?? uid(), name: name.trim(), amount: Number(amount), day: d, icon: preset.icon, tone: preset.tone, paid: bill?.paid ?? [] } }); onClose(); notify(bill ? "Tagihan diperbarui" : "Tagihan ditambahkan"); };
  return <Sheet title={bill ? "Ubah tagihan" : "Tagihan baru"} onClose={onClose}>
    <div className="dpx-chips2" style={{ marginBottom: 8 }}>{BILL_PRESETS.map((p) => <Btn key={p.name} type="button" className={`dpx-chip3 ${preset.name === p.name ? "dpx-on" : ""}`} aria-pressed={preset.name === p.name} onClick={() => { setPreset(p); if (!name.trim() || BILL_PRESETS.some((x) => x.name === name)) setName(p.name); }}><Ic n={p.icon as IconName} size="sm" /> {p.name}</Btn>)}</div>
    <label className="dpx-field"><span>Nama tagihan</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Listrik PLN" maxLength={40} /></div></label>
    <label className="dpx-field"><span>Jumlah per bulan</span><MoneyInput value={amount} onChange={setAmount} /></label>
    <label className="dpx-field"><span>Jatuh tempo (tanggal)</span><div className="dpx-input"><input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Tanggal jatuh tempo" /></div></label>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>Simpan</Btn>
    {bill ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "bill/delete", id: bill.id }); onClose(); notify("Tagihan dihapus", () => fin.dispatch({ type: "bill/upsert", bill })); }}>Hapus</Btn> : null}
  </Sheet>;
}

/** Pay a bill: through Layanan (real Djiwa Pay payment) or mark it as already paid and record it. */
export function BillPaySheet({ fin, bill, onClose, notify, goPay, accounts }: { fin: Finance; bill: Bill; onClose: () => void; notify: Notify; goPay: () => void; accounts: { id: string; name: string }[] }) {
  const [acc, setAcc] = useState(accounts[0]?.id ?? "tunai");
  const month = monthKey(new Date());
  const markPaid = () => {
    const entry = { id: uid(), kind: "out" as const, amount: bill.amount, categoryId: "tagihan", accountId: acc, at: new Date().toISOString(), note: bill.name, tags: [], source: "manual" as const, createdAt: new Date().toISOString() };
    fin.dispatch({ type: "entry/add", entry }); fin.dispatch({ type: "bill/pay", id: bill.id, month, paid: true });
    onClose(); notify(`${bill.name} lunas dan tercatat`, () => { fin.dispatch({ type: "entry/delete", id: entry.id }); fin.dispatch({ type: "bill/pay", id: bill.id, month, paid: false }); });
  };
  return <Sheet title={`Bayar ${bill.name}`} onClose={onClose}>
    <div className="dpx-group dpx-center"><div className="dpx-sub">Tagihan bulan ini</div><div className="dpx-money">{rupiah(bill.amount)}</div><div className="dpx-sub">Jatuh tempo tanggal {bill.day}</div></div>
    <Btn type="button" className="dpx-btn" onClick={() => { onClose(); goPay(); }}><Ic n="flash" size="sm" /> Bayar lewat Layanan Djiwa Pay</Btn>
    <div className="dpx-glabel">Atau sudah dibayar di tempat lain</div>
    <div className="dpx-chips2">{accounts.map((a) => <Btn key={a.id} type="button" className={`dpx-chip3 ${acc === a.id ? "dpx-on" : ""}`} aria-pressed={acc === a.id} onClick={() => setAcc(a.id)}>{a.name}</Btn>)}</div>
    <Btn type="button" className="dpx-btn dpx-ghost" onClick={markPaid}><Ic n="check" size="sm" /> Tandai lunas dan catat</Btn>
  </Sheet>;
}

export function AssetSheet({ fin, asset, onClose, notify }: { fin: Finance; asset?: Asset; onClose: () => void; notify: Notify }) {
  const [kind, setKind] = useState<Asset["kind"]>(asset?.kind ?? "gold");
  const [name, setName] = useState(asset?.name ?? "");
  const [value, setValue] = useState(String(asset?.value ?? ""));
  const ok = name.trim() && Number(value) >= 0 && value !== "";
  return <Sheet title={asset ? "Ubah aset" : "Tambah aset"} onClose={onClose}>
    <div className="dpx-chips2" style={{ marginBottom: 8 }}>{(Object.keys(ASSET_KINDS) as Asset["kind"][]).map((k) => <Btn key={k} type="button" className={`dpx-chip3 ${kind === k ? "dpx-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}><Ic n={ASSET_KINDS[k].icon as IconName} size="sm" /> {ASSET_KINDS[k].label}</Btn>)}</div>
    <label className="dpx-field"><span>Nama aset</span><div className="dpx-input"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Emas 10 gram" maxLength={40} /></div></label>
    <label className="dpx-field"><span>Nilai sekarang <em>diisi manual</em></span><MoneyInput value={value} onChange={setValue} /></label>
    <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={() => { fin.dispatch({ type: "asset/upsert", asset: { id: asset?.id ?? uid(), name: name.trim(), kind, value: Number(value) } }); onClose(); notify(asset ? "Aset diperbarui" : "Aset ditambahkan"); }}>Simpan</Btn>
    {asset ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { fin.dispatch({ type: "asset/delete", id: asset.id }); onClose(); notify("Aset dihapus", () => fin.dispatch({ type: "asset/upsert", asset })); }}>Hapus</Btn> : null}
  </Sheet>;
}

const RULES: [string, number[]][] = [["50 / 30 / 20", [50, 30, 20]], ["60 / 20 / 20", [60, 20, 20]], ["70 / 10 / 20", [70, 10, 20]]];
export function PocketRuleSheet({ fin, current, onClose, notify }: { fin: Finance; current: Pocket[]; onClose: () => void; notify: Notify }) {
  const [rule, setRule] = useState(() => Math.max(0, RULES.findIndex(([, r]) => r.every((v, i) => current[i]?.percent === v))));
  const apply = () => { fin.dispatch({ type: "pocket/set", pockets: DEFAULT_POCKETS.map((p, i) => ({ ...p, percent: RULES[rule][1][i] })) }); onClose(); notify(`Pola ${RULES[rule][0]} dipakai`); };
  return <Sheet title="Pola pembagian gaji" onClose={onClose}>
    <p className="dpx-sub" style={{ marginBottom: 10 }}>Pembagian ini hanya catatan perencanaan. Saldo Djiwa Pay tetap satu dompet.</p>
    <Seg id="rule" label="Pola" value={String(rule)} onChange={(v) => setRule(Number(v))} options={RULES.map(([l], i) => [String(i), l] as const)} />
    <div className="dpx-group dpx-mt">{DEFAULT_POCKETS.map((p, i) => <div key={p.id} className="dpx-flex" style={{ justifyContent: "space-between", padding: "5px 0" }}><b>{p.name}</b><span>{RULES[rule][1][i]}%</span></div>)}</div>
    <Btn type="button" className="dpx-btn" onClick={apply}>Terapkan</Btn>
  </Sheet>;
}

export function PayoffSheet({ debts, onClose }: { debts: { person: string; amount: number }[]; onClose: () => void }) {
  const total = debts.reduce((s, d) => s + d.amount, 0);
  const [monthly, setMonthly] = useState(String(Math.max(100_000, Math.round(total / 12 / 50_000) * 50_000)));
  const plan = payoffPlan(debts, Number(monthly) || 0);
  return <Sheet title="Rencana pelunasan" onClose={onClose}>
    <p className="dpx-sub" style={{ marginBottom: 8 }}>Metode bola salju: lunasi hutang terkecil dulu, lalu sisanya mengalir ke berikutnya.</p>
    <label className="dpx-field" style={{ marginTop: 0 }}><span>Bayar per bulan</span><MoneyInput value={monthly} onChange={setMonthly} /></label>
    <div className="dpx-group dpx-center dpx-mt"><div className="dpx-sub">Bebas hutang dalam</div><div className="dpx-money">{plan.feasible ? `${plan.months} bulan` : plan.order.length ? "Naikkan cicilan" : "Tidak ada hutang"}</div></div>
    {plan.order.length ? <div className="dpx-group dpx-flush dpx-white dpx-mt">{plan.order.map((d, i) => <div key={d.person} className="dpx-row"><span className="dpx-ico">{i + 1}</span><span className="dpx-main"><b>{d.person}</b><span>{rupiah(d.total)}</span></span><span className="dpx-trail">{d.doneMonth ? <span className="dpx-tag dpx-ok">Lunas bulan {d.doneMonth}</span> : <span className="dpx-tag">Belum</span>}</span></div>)}</div> : null}
    <Btn type="button" className="dpx-btn dpx-soft" onClick={onClose}>Tutup</Btn>
  </Sheet>;
}

const weeklyArt = "/assets/email/android-tester";
const dayLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function WeeklyMascot({ scene }: { scene: "budget" | "receipt" }) {
  return <picture className="dpx-weekly-mascot">
    <source media="(prefers-reduced-motion: reduce)" srcSet="/assets/djiwapay-studio/mascot.webp" />
    <img src={`${weeklyArt}/${scene}.gif`} width="54" height="54" alt="" />
  </picture>;
}

function WeeklyAnalysis({ payload }: { payload: string }) {
  const [result, setResult] = useState<{ insight: string; action: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function analyze() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/finance/weekly-analysis", {
        method: "POST", credentials: "include", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: payload,
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Tunggu sebentar sebelum mencoba lagi." : "Analisis belum tersedia. Coba lagi nanti.");
        return;
      }
      const data = await response.json();
      if (typeof data.insight !== "string" || typeof data.action !== "string") throw new Error();
      setResult(data);
    } catch {
      if (!controller.signal.aborted) setError("Analisis belum tersedia. Periksa koneksi lalu coba lagi.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <section className="dpx-weekly-block" aria-busy={busy}>
    <h3>Analisis AI</h3>
    <div aria-live="polite">{result ? <>
      <p>{result.insight}</p><p><b>Untuk minggu depan</b><br />{result.action}</p>
    </> : <>
      <p>Lihat pola belanja dan satu langkah untuk minggu depan. AI menggunakan ringkasan angka dan kategori pada laporan ini.</p>
      {error && <p>{error}</p>}
      <Btn type="button" className="dpx-weekly-more" disabled={busy} onClick={analyze}>{busy ? "Menganalisis…" : error ? "Coba lagi" : "Analisis minggu ini"}</Btn>
    </>}</div>
  </section>;
}

export function WeeklySheet({ entries, categoryName, visible, onClose }: { entries: Entry[]; categoryName: (id: string) => string; visible: boolean; onClose: () => void }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const w = weeklyReview(entries, today);
  const amount = (value: number) => visible ? rupiah(value) : "•••••";
  const comparison = w.delta === null ? "Belum ada pengeluaran pada tujuh hari sebelumnya untuk dibandingkan."
    : w.delta === 0 ? "Total belanjamu setara dengan minggu lalu."
    : `Belanjamu ${w.delta > 0 ? "naik" : "turun"}${visible ? ` ${Math.abs(w.delta)}%` : ""} dari minggu lalu.`;

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [allCategories, setAllCategories] = useState(false);
  const peak = w.days.reduce((highest, day) => day.spent > highest.spent ? day : highest, w.days[0]);
  const active = selectedDay === null ? (peak.spent ? peak : w.days[6]) : w.days[selectedDay];
  const net = w.income - w.spent;

  const payload = JSON.stringify({
    income: w.income, previous: w.previous,
    days: w.days.map(day => {
      const date = new Date(day.at);
      const localDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      return { date: localDate, count: day.count, spent: day.spent };
    }),
    categories: w.categories.slice(0, 3).map(c => ({ name: categoryName(c.id).slice(0, 100), amount: c.amount })),
  });

  return <Sheet title="Jeda mingguan" onClose={onClose}>
    <article className="dpx-weekly-report">
      <header className="dpx-weekly-cover">
        <img src={`${weeklyArt}/hero.jpg`} alt="" className="dpx-weekly-photo" />
        <div className="dpx-weekly-brand"><img src="/pwa-192.png" width="27" height="27" alt="" />Djiwa Pay</div>
      </header>
      <section className="dpx-weekly-total">
        <small>{dayLabel.format(start)} – {dayLabel.format(today)}</small>
        <h3>Pengeluaran tujuh hari ini</h3>
        <strong>{amount(w.spent)}</strong>
        <p>{w.count ? `Dari ${w.count} transaksi pengeluaran yang tercatat.` : "Belum ada pengeluaran yang tercatat minggu ini."}</p>
      </section>
      {visible && (w.spent > 0 || w.income > 0 || w.previous > 0) ? <WeeklyAnalysis key={payload} payload={payload} /> : <section className="dpx-weekly-block">
        <h3>Analisis AI</h3><p>{visible ? "Analisis tersedia setelah ada catatan pemasukan atau pengeluaran untuk dibandingkan." : "Tampilkan nominal untuk menganalisis laporan ini."}</p>
      </section>}
      <section className="dpx-weekly-block">
        <h3>Arus kas minggu ini</h3>
        <dl className="dpx-weekly-cash">
          <div><dt>Pemasukan</dt><dd>{amount(w.income)}</dd></div>
          <div><dt>Pengeluaran</dt><dd>{amount(w.spent)}</dd></div>
          <div><dt>Selisih</dt><dd>{visible && net < 0 ? "−" : ""}{amount(net)}</dd></div>
        </dl>
      </section>
      <section className="dpx-weekly-block">
        <h3>Belanja per hari</h3>
        {visible ? <div className="dpx-weekly-bars" role="group" aria-label="Pilih hari untuk melihat pengeluaran">
          {w.days.map((day, i) => <button type="button" key={day.at} aria-pressed={active === day}
            aria-label={`${dayLabel.format(day.at)}, ${rupiah(day.spent)}, ${day.count} transaksi`}
            onClick={() => setSelectedDay(i)}>
            <span className="dpx-weekly-track"><i style={{ height: peak.spent ? `${day.spent / peak.spent * 100}%` : "0%" }} /></span>
            {new Date(day.at).toLocaleDateString("id-ID", { weekday: "short" })}
          </button>)}
        </div> : null}
        <p aria-live="polite">{visible ? <><b>{dayLabel.format(active.at)}</b> · {amount(active.spent)} dari {active.count} transaksi.</> : "Grafik disembunyikan saat nominal disamarkan."}</p>
        {visible && peak.spent > 0 && active.spent === peak.spent && <small>Pengeluaran harian tertinggi minggu ini.</small>}
      </section>
      <section className="dpx-weekly-detail"><WeeklyMascot scene="budget" /><div>
        <h3>Dibanding minggu lalu</h3><p>{comparison}</p>
        <small>Pengeluaran sebelumnya · {amount(w.previous)}</small>
      </div></section>
      {w.topCategory && <section className="dpx-weekly-detail"><WeeklyMascot scene="receipt" /><div>
        <h3>Paling banyak untuk apa?</h3>
        <ol className="dpx-weekly-ranks">
          {(allCategories ? w.categories : w.categories.slice(0, 3)).map(c => <li key={c.id}>
            <span>{categoryName(c.id)}</span><b>{amount(c.amount)}</b>
          </li>)}
        </ol>
        {w.categories.length > 3 && <button type="button" className="dpx-weekly-more" aria-expanded={allCategories} onClick={() => setAllCategories(!allCategories)}>
          {allCategories ? "Ringkas kategori" : `Lihat semua ${w.categories.length} kategori`}
        </button>}
      </div></section>}
      <footer>Djiwa Pay by Djiwa Tentram &amp; Zantara Technology</footer>
    </article>
    <Btn type="button" className="dpx-btn" onClick={onClose}>Selesai</Btn>
  </Sheet>;
}
