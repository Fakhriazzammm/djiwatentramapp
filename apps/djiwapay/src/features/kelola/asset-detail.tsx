import { useMemo, useState } from "react";
import { Btn, Ic, Seg } from "../shell/dpx-ui";
import { AreaChart } from "./kelola-ui";
import { FullPage, GainText, PriceNote, Sticker } from "./asset-ui";
import { BUYBACK_CUT, SUB_LABEL, assetStats, assetValue, holdingLabel, isEstimated, isGoldAsset, purityLabel, useGold } from "../../lib/finance/assets";
import { ASSET_KINDS } from "../../lib/finance/kelola";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Asset } from "../../lib/finance/types";

type Range = "1b" | "3b" | "1t" | "all";
const DAYS: Record<Range, number> = { "1b": 30, "3b": 90, "1t": 365, all: 100000 };
const monthShort = (d: string) => new Date(d).toLocaleDateString("id-ID", { month: "short" });
const dateLong = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const mask = (visible: boolean, s: string) => (visible ? s : "•••••");

export function AssetDetail({ asset, visible, onClose, onEdit, onDelete }: { asset: Asset; visible: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const gold = useGold(), [range, setRange] = useState<Range>("3b"), [confirm, setConfirm] = useState(false);
  const auto = isGoldAsset(asset), est = isEstimated(asset), value = assetValue(asset, gold?.points ?? null);
  const stats = useMemo(() => (est ? assetStats(asset, []) : auto && gold ? assetStats(asset, gold.points) : null), [asset, auto, est, gold]);
  const shown = useMemo(() => {
    if (!stats) return [];
    const cut = new Date(Date.now() - DAYS[range] * 864e5).toISOString().slice(0, 10);
    const rows = stats.series.filter((s) => s.day >= cut);
    return rows.length >= 2 ? rows : stats.series.slice(-2);
  }, [stats, range]);
  const gain = asset.cost ? value - asset.cost : null, pct = asset.cost ? ((value - asset.cost) / asset.cost) * 100 : null;
  const cut = BUYBACK_CUT[asset.sub ?? "lainnya"], buyback = Math.round(value * (1 - cut));
  const labels = shown.length ? [shown[0].day, shown[Math.floor(shown.length / 2)].day, shown[shown.length - 1].day] : [];
  return <FullPage title={asset.name} onBack={onClose} right={<Btn type="button" className="dpx-rb" onClick={onEdit} aria-label="Ubah aset"><Ic n="edit" size="sm" /></Btn>}>
    <div className="dpx-as-body">
      <div className="dpx-as-hero">
        <div className="dpx-as-hero-t">
          <div><div className="dpx-sub">{auto || est ? "Nilai sekarang (perkiraan)" : "Nilai sekarang"}</div><div className="dpx-as-big">{mask(visible, rupiah(value))}</div>
            {pct !== null && gain !== null && visible ? <GainText pct={pct} gain={gain} /> : <div className="dpx-sub">{asset.cost ? "" : "Isi harga beli untuk melihat untung rugi"}</div>}
            {asset.boughtOn ? <div className="dpx-sub">sejak {dateLong(asset.boughtOn)}</div> : null}</div>
          <Sticker asset={asset} size={96} />
        </div>
        <div className="dpx-as-tags"><i>{asset.sub ? SUB_LABEL[asset.sub] : ASSET_KINDS[asset.kind].label}</i>{asset.weight ? <i>{String(asset.weight).replace(".", ",")} g</i> : null}{asset.purity ? <i>{purityLabel(asset.purity)}</i> : null}{asset.shop ? <i>{asset.shop}</i> : null}</div>
      </div>

      {auto ? <>
        {stats && shown.length >= 2 ? <>
          <Seg id="as-range" label="Rentang grafik" value={range} onChange={setRange} options={[["1b", "1B"], ["3b", "3B"], ["1t", "1T"], ["all", "Semua"]] as const} />
          <div className="dpx-as-chart"><AreaChart points={shown.map((s) => s.value)} height={120} color="#c9961b" label={`Grafik nilai ${asset.name}`} />
            <div className="dpx-as-ax">{labels.map((l, i) => <span key={i}>{range === "1b" ? dateLong(l).slice(0, 6) : `${monthShort(l)} ${new Date(l).getFullYear().toString().slice(2)}`}</span>)}</div></div>
        </> : <p className="dpx-sub dpx-as-note">{gold ? "Grafik muncul setelah ada lebih dari satu hari data sejak tanggal beli." : "Memuat harga emas…"}</p>}
        <div className="dpx-as-stats">
          <div><span>Harga beli</span><b>{asset.cost && asset.weight ? `${rupiah(Math.round(asset.cost / asset.weight))}/g` : "—"}</b></div>
          <div><span>Nilai per gram</span><b>{asset.weight ? `${rupiah(Math.round(value / asset.weight))}/g` : "—"}</b></div>
          <div><span>Per tahun</span><b className={stats?.perYear != null ? (stats.perYear >= 0 ? "dpx-up" : "dpx-dn") : ""}>{stats?.perYear != null ? `${stats.perYear >= 0 ? "+" : "−"}${Math.abs(stats.perYear).toFixed(1).replace(".", ",")}%` : "—"}</b></div>
          <div><span>Tertinggi</span><b>{stats ? mask(visible, rupiah(stats.high)) : "—"}</b></div>
          <div><span>Terendah</span><b>{stats ? mask(visible, rupiah(stats.low)) : "—"}</b></div>
          <div><span>Lama simpan</span><b>{stats ? holdingLabel(stats.days) : "—"}</b></div>
        </div>
        <div className="dpx-group dpx-white dpx-flush dpx-as-rows">
          <div className="dpx-kv"><span>Harga jual kembali (perkiraan)</span><b>{mask(visible, rupiah(buyback))}</b></div>
          <div className="dpx-kv"><span>Potongan buyback (asumsi)</span><b className="dpx-dn">−{Math.round(cut * 100)}%</b></div>
        </div>
        <PriceNote gold={gold} />
      </> : est ? <>
        {stats && shown.length >= 2 ? <>
          <Seg id="as-range" label="Rentang grafik" value={range} onChange={setRange} options={[["1b", "1B"], ["3b", "3B"], ["1t", "1T"], ["all", "Semua"]] as const} />
          <div className="dpx-as-chart"><AreaChart points={shown.map((s) => s.value)} height={120} color={(asset.rate ?? 0) >= 0 ? "#4f7a2b" : "#c9461b"} label={`Grafik nilai ${asset.name}`} />
            <div className="dpx-as-ax">{labels.map((l, i) => <span key={i}>{range === "1b" ? dateLong(l).slice(0, 6) : `${monthShort(l)} ${new Date(l).getFullYear().toString().slice(2)}`}</span>)}</div></div>
        </> : <p className="dpx-sub dpx-as-note">Grafik muncul setelah lebih dari satu hari sejak tanggal beli.</p>}
        <div className="dpx-as-stats">
          <div><span>Harga beli</span><b>{mask(visible, rupiah(asset.cost ?? 0))}</b></div>
          <div><span>Nilai sekarang</span><b>{mask(visible, rupiah(value))}</b></div>
          <div><span>Per tahun</span><b className={(asset.rate ?? 0) >= 0 ? "dpx-up" : "dpx-dn"}>{(asset.rate ?? 0) >= 0 ? "+" : "−"}{Math.abs(asset.rate ?? 0).toFixed(1).replace(".", ",")}%</b></div>
          <div><span>{(gain ?? 0) >= 0 ? "Kenaikan" : "Penyusutan"}</span><b className={(gain ?? 0) >= 0 ? "dpx-up" : "dpx-dn"}>{gain !== null ? mask(visible, rupiah(Math.abs(gain))) : "—"}</b></div>
          <div><span>Lama simpan</span><b>{stats ? holdingLabel(stats.days) : "—"}</b></div>
          <div><span>Asumsi</span><b>Perkiraan</b></div>
        </div>
        <p className="dpx-sub dpx-as-note">Nilai dihitung otomatis dari harga beli dengan perubahan {(asset.rate ?? 0) >= 0 ? "naik" : "turun"} {Math.abs(asset.rate ?? 0).toFixed(1).replace(".", ",")}% per tahun. Ini perkiraan, bukan harga pasar. Ubah angkanya lewat tombol ubah kalau kondisinya berbeda.</p>
      </> : <p className="dpx-sub dpx-as-note">Nilai aset ini diperbarui manual. Ketuk ubah untuk memperbarui nilainya.</p>}
      {asset.note ? <div className="dpx-group dpx-white"><div className="dpx-sub">Catatan</div><div>{asset.note}</div></div> : null}
      {confirm
        ? <div className="dpx-as-del"><p>Hapus aset ini beserta stikernya dari daftar?</p><div className="dpx-as-chips"><Btn type="button" className="dpx-btn dpx-soft" onClick={() => setConfirm(false)}>Batal</Btn><Btn type="button" className="dpx-btn" onClick={onDelete}>Ya, hapus</Btn></div></div>
        : <Btn type="button" className="dpx-linkbtn" onClick={() => setConfirm(true)}>Hapus aset</Btn>}
    </div>
  </FullPage>;
}
