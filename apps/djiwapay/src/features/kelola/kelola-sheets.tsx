import { useState } from "react";
import { Btn, Ic, Seg, Sheet, type IconName } from "../shell/dpx-ui";
import { MoneyInput, type Notify } from "../finance/fin-sheets";
import { uid } from "../../lib/finance/calc";
import { ASSET_KINDS, DEFAULT_POCKETS, monthKey } from "../../lib/finance/kelola";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Asset, Bill, Pocket } from "../../lib/finance/types";
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
