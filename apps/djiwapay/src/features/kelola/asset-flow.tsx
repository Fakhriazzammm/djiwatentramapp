import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Ic, Seg } from "../shell/dpx-ui";
import { MoneyInput, type Notify } from "../finance/fin-sheets";
import { FullPage, PriceNote, Sticker } from "./asset-ui";
import { uid } from "../../lib/finance/calc";
import { ASSET_KINDS } from "../../lib/finance/kelola";
import { DEFAULT_RATE, KARAT, SUB_LABEL, assetValue, createSticker, fetchRaw, goldNow, makeStickerPng, priceOn, stickerUrl, uploadSticker, useGold, type StickerMode } from "../../lib/finance/assets";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Asset, AssetKind, AssetSub } from "../../lib/finance/types";
import type { Finance } from "../../lib/finance/use-finance";

type Step = "shoot" | "work" | "sticker" | "form";
const SUBS: AssetSub[] = ["batangan", "perhiasan", "koin", "lainnya"];
const OTHER_KINDS: AssetKind[] = ["property", "vehicle", "electronics", "fund", "stock", "crypto", "other"];
const today = () => new Date().toISOString().slice(0, 10);

export function AssetFlow({ fin, asset, notify, onClose, noPhoto }: { fin: Finance; asset?: Asset; notify: Notify; onClose: () => void; noPhoto?: boolean }) {
  const [step, setStep] = useState<Step>(asset || noPhoto ? "form" : "shoot");
  const [stickerId, setStickerId] = useState<string | undefined>(asset?.stickerId);
  const gold = useGold();

  /* ----- camera ----- */
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), gallery = useRef<HTMLInputElement>(null), nativeCam = useRef<HTMLInputElement>(null);
  const [camOn, setCamOn] = useState(false), [camErr, setCamErr] = useState(false), [live, setLive] = useState(false);   // native camera first; the in-app viewfinder only when asked for
  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCamOn(false); };
  useEffect(() => {
    if (step !== "shoot" || !live) return;
    let dead = false; setCamErr(false);
    navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } }, audio: false })
      .then((s) => { if (dead) { s.getTracks().forEach((t) => t.stop()); return; } stream.current = s; if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); } setCamOn(true); })
      .catch(() => setCamErr(true));
    if (!navigator.mediaDevices?.getUserMedia) setCamErr(true);
    return () => { dead = true; stop(); };
  }, [step, live]);
  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && void process(b), "image/jpeg", 0.9);
  };

  /* ----- sticker ----- */
  const [err, setErr] = useState<string | null>(null);
  const [rawUrl, setRawUrl] = useState<string | null>(null), [png, setPng] = useState<string | null>(null), [mode, setMode] = useState<StickerMode>("local"), [view, setView] = useState<"cut" | "raw">("cut");
  const draftId = useRef<string | null>(null);
  const process = async (blob: Blob) => {
    stop(); setErr(null); setStep("work");
    try {
      const made = await createSticker(blob);
      draftId.current = made.id; setMode(made.mode);
      const raw = await fetchRaw(made.id);
      setRawUrl(URL.createObjectURL(blob));
      setPng(await makeStickerPng(raw, made.mode)); setView("cut"); setStep("sticker");
    } catch (e) { setErr(e instanceof Error ? e.message : "Foto belum bisa diproses."); setLive(false); setStep("shoot"); }
  };
  useEffect(() => () => { if (rawUrl) URL.revokeObjectURL(rawUrl); }, [rawUrl]);
  const [saving, setSaving] = useState(false);
  const useSticker = async () => {
    if (!png || !draftId.current) return;
    setSaving(true);
    try { await uploadSticker(draftId.current, png); setStickerId(draftId.current); setStep("form"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Stiker belum tersimpan."); }
    finally { setSaving(false); }
  };
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void process(f); };

  /* ----- form ----- */
  const [sub, setSub] = useState<AssetSub>(asset ? (asset.auto ? asset.sub ?? "batangan" : "lainnya") : "batangan");
  const [kind, setKind] = useState<AssetKind>(asset && asset.kind !== "gold" ? asset.kind : asset ? "other" : "property");
  const [est, setEst] = useState<boolean>(asset ? Boolean(asset.est) : true), [rate, setRate] = useState<string>(asset && typeof asset.rate === "number" ? String(asset.rate).replace(".", ",") : asset ? "" : "6");
  const rateNum = Number(rate.replace(",", ".")), canEst = Boolean(DEFAULT_RATE[kind]);
  const chooseKind = (k: AssetKind) => { setKind(k); const d = DEFAULT_RATE[k]; setEst(Boolean(d)); setRate(d ? String(d.rate).replace(".", ",") : ""); };
  const isGold = sub !== "lainnya";
  const [name, setName] = useState(asset?.name ?? "");
  const [weight, setWeight] = useState(asset?.weight ? String(asset.weight).replace(".", ",") : "");
  const [purity, setPurity] = useState(asset?.purity ?? 0.9999);
  const [boughtOn, setBoughtOn] = useState(asset?.boughtOn ?? today());
  const [shop, setShop] = useState(asset?.shop ?? "");
  const [cost, setCost] = useState(asset?.cost ? String(asset.cost) : "");
  const [value, setValue] = useState(asset && !asset.auto ? String(asset.value) : "");
  const [note, setNote] = useState(asset?.note ?? "");
  const w = Number(weight.replace(",", ".")) || 0;
  useEffect(() => { if (!asset) setPurity(sub === "perhiasan" ? 0.9167 : 0.9999); }, [sub, asset]);
  const draft: Asset = useMemo(() => ({ id: asset?.id ?? "draft", name, kind: isGold ? "gold" : kind, value: isGold ? Number(cost) || 0 : Number(value) || 0, sub, ...(isGold ? { weight: w, purity, boughtOn, cost: Number(cost) || undefined, auto: true } : { boughtOn, cost: Number(cost) || undefined, est: canEst && est, ...(Number.isFinite(rateNum) && rate.trim() !== "" ? { rate: rateNum } : {}) }) }), [asset?.id, name, isGold, kind, value, sub, w, purity, boughtOn, est, rate, canEst, cost]);
  const nowPrice = goldNow(), perGram = nowPrice ? Math.round(nowPrice * purity) : null, valueNow = assetValue(draft, gold?.points ?? null);
  const buyPrice = gold?.points.length && boughtOn ? priceOn(gold.points, boughtOn) : null;
  const useEst = !isGold && canEst && est, ok = name.trim().length > 0 && (isGold ? w > 0 : useEst ? Number(cost) > 0 && Boolean(boughtOn) && Number.isFinite(rateNum) && rate.trim() !== "" : value !== "" && Number(value) >= 0);
  const save = () => {
    const out: Asset = {
      id: asset?.id ?? uid(), name: name.trim(), kind: draft.kind, value: isGold ? valueNow || Number(cost) || 0 : useEst ? valueNow : Number(value), sub,
      ...(isGold ? { weight: w, purity, boughtOn, auto: true, ...(Number(cost) > 0 ? { cost: Number(cost) } : {}) } : { boughtOn, ...(Number(cost) > 0 ? { cost: Number(cost) } : {}), ...(useEst ? { est: true, rate: rateNum } : {}) }),
      ...(shop.trim() ? { shop: shop.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(stickerId ? { stickerId } : {}),
    };
    fin.dispatch({ type: "asset/upsert", asset: out });
    onClose(); notify(asset ? "Aset diperbarui" : "Aset ditambahkan");
  };

  const back = step === "form" && !asset ? () => setStep(stickerId ? "sticker" : "shoot") : step === "sticker" ? () => setStep("shoot") : onClose;
  const title = step === "shoot" ? "Foto aset" : step === "work" ? "Membuat stiker" : step === "sticker" ? "Stiker aset" : "Data aset";

  return <FullPage title={title} onBack={step === "work" ? () => {} : back} dark={step === "shoot" && live}>
    {step === "shoot" && !live ? <div className="dpx-as-shoot dpx-as-start">
      <div className="dpx-as-intro"><span className="dpx-as-intro-i"><Ic n="scan" /></span><b>Foto asetmu</b><p>Pakai kamera ponsel untuk hasil paling tajam. Latarnya kami potong jadi stiker.</p></div>
      <ul className="dpx-as-tips"><li>Taruh di tempat polos dan terang</li><li>Satu aset per foto, tepat di tengah</li><li>Hindari bayangan dan pantulan kuat</li></ul>
      {err ? <div className="dpx-as-err" role="alert">{err}</div> : null}
      <Btn type="button" className="dpx-btn" onClick={() => nativeCam.current?.click()}><Ic n="scan" size="sm" /> Buka kamera</Btn>
      <Btn type="button" className="dpx-btn dpx-soft" onClick={() => gallery.current?.click()}><Ic n="grid" size="sm" /> Pilih dari galeri</Btn>
      <div className="dpx-as-more"><Btn type="button" className="dpx-linkbtn" onClick={() => setLive(true)}>Pakai kamera dalam aplikasi dengan bingkai</Btn><Btn type="button" className="dpx-linkbtn" onClick={() => setStep("form")}>Isi tanpa foto</Btn></div>
      <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />
      <input ref={nativeCam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
    </div> : null}

    {step === "shoot" && live ? <div className="dpx-as-shoot">
      <div className="dpx-as-view">
        <video ref={video} playsInline muted aria-label="Pratinjau kamera" style={{ opacity: camOn ? 1 : 0 }} />
        {!camOn ? <div className="dpx-as-novideo"><Ic n="scan" /><p>{camErr ? "Kamera dalam aplikasi tidak bisa dibuka. Pakai kamera ponsel atau galeri." : "Membuka kamera…"}</p></div> : null}
        <i className="dpx-as-c a" /><i className="dpx-as-c b" /><i className="dpx-as-c c" /><i className="dpx-as-c d" />
        <div className="dpx-as-hint">Taruh emas di dalam bingkai, tempat polos dan terang.<br />Satu aset per foto.</div>
      </div>
      {err ? <div className="dpx-as-err" role="alert">{err}</div> : null}
      <div className="dpx-as-cam">
        <Btn type="button" className="dpx-as-side" onClick={() => setLive(false)} aria-label="Kembali ke pilihan kamera"><Ic n="back" /></Btn>
        <Btn type="button" className="dpx-as-shutter" onClick={() => (camOn ? snap() : nativeCam.current?.click())} aria-label="Ambil foto"><i /></Btn>
        <Btn type="button" className="dpx-as-side" onClick={() => gallery.current?.click()} aria-label="Pilih dari galeri"><Ic n="grid" /></Btn>
      </div>
      <p className="dpx-as-sub">Ketuk bulat untuk memotret · kiri kembali · kanan galeri</p>
      <input ref={gallery} type="file" accept="image/*" hidden onChange={pick} />
      <input ref={nativeCam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
    </div> : null}

    {step === "work" ? <div className="dpx-as-body dpx-as-center"><div className="dpx-as-spin" aria-hidden="true" /><b>Memotong latar…</b><p className="dpx-sub">Biasanya 10 sampai 30 detik. Jangan tutup layar ini.</p></div> : null}

    {step === "sticker" ? <div className="dpx-as-body">
      <div className={`dpx-as-cut ${view === "raw" ? "raw" : ""}`}>
        {view === "raw" ? <img src={rawUrl ?? ""} alt="Foto asli" /> : <div className="dpx-as-checker"><img className="dpx-as-stk" src={png ?? ""} alt="Stiker aset" /><span className="dpx-as-sp" style={{ top: 28, left: 40 }}>✦</span><span className="dpx-as-sp" style={{ top: 60, right: 36, animationDelay: ".7s" }}>✦</span><span className="dpx-as-sp" style={{ bottom: 40, left: 64, animationDelay: "1.2s" }}>✦</span></div>}
      </div>
      <Seg id="as-view" label="Tampilan" value={view} onChange={setView} options={[["raw", "Foto asli"], ["cut", "Stiker"]] as const} />
      <div className="dpx-as-live"><span>{mode === "ai" ? "Latar dipotong oleh AI" : "Latar dipotong di perangkat"}</span><span className="dpx-as-pill">{mode === "ai" ? "Hasil AI" : "Foto polos terbaik"}</span></div>
      <p className="dpx-sub">Tepi putih dan bayangan ditambahkan otomatis. Kalau hasilnya kurang rapi, foto ulang di tempat polos dengan cahaya merata.</p>
      {err ? <div className="dpx-as-err" role="alert">{err}</div> : null}
      <div className="dpx-as-chips"><Btn type="button" className="dpx-chip3" onClick={() => setStep("shoot")}><Ic n="refresh" size="sm" /> Foto ulang</Btn></div>
      <Btn type="button" className="dpx-btn" disabled={saving || !png} onClick={() => void useSticker()}>{saving ? "Menyimpan stiker…" : "Pakai stiker ini"}</Btn>
    </div> : null}

    {step === "form" ? <div className="dpx-as-body">
      <div className="dpx-as-namerow">
        <button type="button" className="dpx-as-pic" onClick={() => setStep("shoot")} aria-label={stickerId ? "Ganti foto" : "Tambah foto"}>{stickerId ? <img className="dpx-as-stk" src={stickerUrl(stickerId)} alt="" /> : <Sticker asset={{ kind: draft.kind }} size={64} />}</button>
        <label className="dpx-as-fld dpx-grow"><span>Nama aset</span><input id="as-name" value={name} maxLength={60} placeholder={isGold ? "Contoh: Emas Antam 10 g" : "Contoh: Reksa dana pasar uang"} onChange={(e) => setName(e.target.value)} /></label>
      </div>
      <div className="dpx-as-chips" role="group" aria-label="Jenis aset">{SUBS.map((s) => <Btn key={s} type="button" className={`dpx-chip3 ${sub === s ? "dpx-on" : ""}`} aria-pressed={sub === s} onClick={() => setSub(s)}>{SUB_LABEL[s]}</Btn>)}</div>

      {isGold ? <>
        <div className="dpx-as-two">
          <label className="dpx-as-fld"><span>Berat (gram)</span><input id="as-weight" inputMode="decimal" value={weight} placeholder="0" onChange={(e) => setWeight(e.target.value.replace(/[^0-9,.]/g, "").slice(0, 9))} /></label>
          <label className="dpx-as-fld"><span>Kadar</span><select id="as-purity" value={String(purity)} onChange={(e) => setPurity(Number(e.target.value))}>{KARAT.map(([l, v]) => <option key={l} value={v}>{l} · {(v * 100).toFixed(2).replace(".", ",")}%</option>)}</select></label>
        </div>
        <div className="dpx-as-two">
          <label className="dpx-as-fld"><span>Tanggal beli</span><input id="as-date" type="date" value={boughtOn} max={today()} onChange={(e) => setBoughtOn(e.target.value)} /></label>
          <label className="dpx-as-fld"><span>Tempat beli</span><input id="as-shop" value={shop} maxLength={60} placeholder="Butik, toko, marketplace" onChange={(e) => setShop(e.target.value)} /></label>
        </div>
        <label className="dpx-field dpx-as-money"><span>Harga beli total <em>kosongkan kalau tidak ingat</em></span><MoneyInput value={cost} onChange={setCost} label="Harga beli total" /></label>
        <div className="dpx-as-live"><span>Harga emas hari ini<br /><b>{perGram ? `${rupiah(perGram)} / gram (${KARAT.find(([, v]) => v === purity)?.[0] ?? ""})` : "memuat…"}</b></span><span className="dpx-as-pill">Otomatis</span></div>
        {w > 0 ? <div className="dpx-as-live"><span>Perkiraan nilai sekarang<br /><b>{rupiah(valueNow)}</b>{Number(cost) > 0 ? <em className={valueNow >= Number(cost) ? "dpx-up" : "dpx-dn"}> {valueNow >= Number(cost) ? "▲" : "▼"} {rupiah(Math.abs(valueNow - Number(cost)))}</em> : null}</span></div> : null}
        {buyPrice && Number(cost) > 0 && w > 0 ? <p className="dpx-sub dpx-as-note">Harga acuan saat beli {rupiah(Math.round(buyPrice * purity))}/gram. Harga beli Anda {rupiah(Math.round(Number(cost) / w))}/gram, selisihnya biasanya ongkos dan margin toko.</p> : null}
        <PriceNote gold={gold} />
      </> : <>
        <div className="dpx-as-chips" role="group" aria-label="Golongan">{OTHER_KINDS.map((k) => <Btn key={k} type="button" className={`dpx-chip3 ${kind === k ? "dpx-on" : ""}`} aria-pressed={kind === k} onClick={() => chooseKind(k)}>{ASSET_KINDS[k].label}</Btn>)}</div>
        <div className="dpx-as-two">
          <label className="dpx-as-fld"><span>Tanggal beli</span><input id="as-date2" type="date" value={boughtOn} max={today()} onChange={(e) => setBoughtOn(e.target.value)} /></label>
          <label className="dpx-as-fld"><span>Tempat beli</span><input id="as-shop2" value={shop} maxLength={60} placeholder="Dealer, toko, developer" onChange={(e) => setShop(e.target.value)} /></label>
        </div>
        <label className="dpx-field dpx-as-money"><span>Harga beli <em>{useEst ? "wajib untuk perkiraan otomatis" : "untuk melihat untung rugi"}</em></span><MoneyInput value={cost} onChange={setCost} label="Harga beli" /></label>
        {canEst ? <Btn type="button" className="dpx-opt" onClick={() => setEst((v) => !v)} aria-pressed={est}><span className="dpx-main"><b>Nilai sekarang diperkirakan otomatis</b><span>{est ? "Mengikuti perubahan per tahun di bawah" : "Isi nilai sekarang sendiri"}</span></span><span className="dpx-radio" style={est ? { borderColor: "var(--blue)", background: "var(--blue)" } : undefined} /></Btn> : null}
        {useEst ? <>
          <label className="dpx-as-fld"><span>Perubahan nilai per tahun (%)</span><input id="as-rate" inputMode="decimal" value={rate} placeholder={String(DEFAULT_RATE[kind]?.rate ?? 0)} onChange={(e) => setRate(e.target.value.replace(/[^0-9,.\-]/g, "").slice(0, 6))} /></label>
          <p className="dpx-sub dpx-as-note">{DEFAULT_RATE[kind]?.hint} Ubah angkanya sesuai kondisi barangmu.</p>
        </> : <label className="dpx-field dpx-as-money"><span>Nilai sekarang <em>diperbarui manual</em></span><MoneyInput value={value} onChange={setValue} label="Nilai sekarang" /></label>}
        {(() => { const now = useEst ? valueNow : Number(value) || 0, base = Number(cost) || 0; return now > 0 ? <div className="dpx-as-live"><span>{useEst ? "Perkiraan nilai sekarang" : "Nilai sekarang"}<br /><b>{rupiah(now)}</b>{base > 0 ? <em className={now >= base ? "dpx-up" : "dpx-dn"}> {now >= base ? "▲ naik" : "▼ turun"} {rupiah(Math.abs(now - base))} ({now >= base ? "+" : "−"}{Math.abs(((now - base) / base) * 100).toFixed(1).replace(".", ",")}%)</em> : null}</span>{useEst ? <span className="dpx-as-pill">Otomatis</span> : null}</div> : null; })()}
      </>}
      <label className="dpx-as-fld"><span>Catatan (surat, nomor seri, lokasi simpan)</span><input id="as-note" value={note} maxLength={300} placeholder="Contoh: sertifikat ada di brankas" onChange={(e) => setNote(e.target.value)} /></label>
      <Btn type="button" className={`dpx-btn ${ok ? "" : "dpx-off"}`} disabled={!ok} onClick={save}>Simpan aset</Btn>
    </div> : null}
  </FullPage>;
}
