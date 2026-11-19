import "./saham.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Btn, Ic, Seg, Sheet, payAsset, spring, type IconName } from "../shell/dpx-ui";
import { FullPage } from "../kelola/asset-ui";
import { ConsentSheet, useGoogle } from "../integrations/integrations-pages";
import { connectGoogle, rememberAfterGoogle } from "../../lib/finance/integrations";
import { IDX_TICKERS, TICKER_NAME, hasLogo, isTicker, logoSrc, tickerColor } from "../../lib/finance/idx-tickers";
import { rupiah } from "../../lib/djiwa-pay-format";
import {
  DEFAULT_FEES, activateStocks, addStockTrade, deleteStockTrade, feeFor, grossOf, isStale, percent, portfolio, refreshStockPrices, reloadStocks, saveManualPrice, saveStockFees, signedRupiah, stampLabel,
  stockMessage, stocksErrorCode, useStocks, type StockSide, type StockState, type StockTrade, type Valued,
} from "../../lib/finance/stocks";
import type { FinCtx } from "./fin-pages";

/** Bar segments are told apart by position, not by ticker, so neighbours never share a colour. */
const BAR = ["#c9461b", "#1a5dc6", "#d9a21a", "#13804a", "#6a4c93", "#16a3b8", "#e0568a", "#958a7d"];
const CONSENT_EXTRA = ["Menambah tab Saham dan Portofolio Saham di Spreadsheet itu, dengan rumus GOOGLEFINANCE untuk harga saham"];
const mask = (visible: boolean, s: string) => (visible ? s : "•••••");
const num = (digits: string) => Number(digits || 0).toLocaleString("id-ID");
const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const dateLong = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/* ---------- shared pieces ---------- */
export function Onboard({ asset, title, desc, bullets, notice, primary, onPrimary, secondary, onSecondary, busy }: {
  asset: string; title: string; desc: string; bullets: [string, string][]; notice?: ReactNode; primary: string; onPrimary: () => void; secondary?: string; onSecondary?: () => void; busy?: boolean;
}) {
  return <motion.div className="dpx-group dpx-white dpx-onb" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
    <motion.img src={payAsset(asset)} alt="" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 18 }} />
    <h3>{title}</h3><p className="dpx-sub">{desc}</p>
    <div className="dpx-onb-list">{bullets.map(([b, t]) => <div className="dpx-onb-i" key={b}><span><Ic n="check" size="sm" /></span><div><b>{b}</b>{t}</div></div>)}</div>
    {notice}
    <Btn type="button" className="dpx-btn dpx-onb-go" disabled={busy} onClick={onPrimary}>{primary}</Btn>
    {secondary ? <Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={onSecondary}>{secondary}</Btn> : null}
  </motion.div>;
}

/** The company's own logo; a coloured tile with the code when we do not have one. */
function Logo({ t, size = 38 }: { t: string; size?: number }) {
  const [bad, setBad] = useState(false);
  if (hasLogo(t) && !bad) return <img className="dpx-st-logo" src={logoSrc(t)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBad(true)} style={{ width: size, height: size }} />;
  return <span className="dpx-st-mini" style={{ background: tickerColor(t), width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.max(8, Math.round(size / 4)) }}>{t}</span>;
}
const Mini = Logo;

function Banners({ s, onConnect }: { s: StockState; onConnect: () => void }) {
  const pf = portfolio(s);
  const [busy, setBusy] = useState(false);
  const err = s.sheet.error;
  if (!s.drive) return <div className="dpx-st-note dpx-info" role="status"><span aria-hidden="true">🔗</span><span><b>Harga belum otomatis.</b> Hubungkan Google agar harga terisi.</span><button type="button" onClick={onConnect}>Hubungkan</button></div>;
  if (err && !s.sheet.ready) return <div className="dpx-st-note" role="alert"><span aria-hidden="true">⚠️</span><span>{err === "SHEET_MISSING" ? <><b>Spreadsheet dihapus di Google Drive.</b> Ekspor ulang di Pengaturan → Integrasi.</> : err === "NOT_CONNECTED" ? <><b>Koneksi Google terputus.</b> Hubungkan lagi di Pengaturan → Integrasi.</> : <><b>Sinkron ke Sheets gagal.</b> Akan dicoba lagi otomatis.</>}</span></div>;
  if (isStale(pf.asOf)) return <div className="dpx-st-note" role="status"><span aria-hidden="true">🕘</span><span><b>Harga per {stampLabel(pf.asOf)}.</b> Sheet belum menghitung ulang.</span>
    <button type="button" disabled={busy} onClick={() => { setBusy(true); void refreshStockPrices().finally(() => setTimeout(() => setBusy(false), 2500)); }}>{busy ? "Menyegarkan…" : "Segarkan"}</button></div>;
  return null;
}

/* ---------- the Saham tab ---------- */
export function SahamTab({ ctx }: { ctx: FinCtx }) {
  const { state: s, loaded } = useStocks(), { g } = useGoogle();
  const [sub, setSub] = useState<"hold" | "log">("hold");
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const ready = Boolean(s?.activated && s.drive && s.sheet.ready);
  useEffect(() => { if (ready) void refreshStockPrices(); }, [ready]);

  const connect = async () => {
    setBusy(true); rememberAfterGoogle("/kekayaan?saham=aktifkan");
    try { const { url } = await connectGoogle(["drive"]); window.location.assign(url); }
    catch (e) { setBusy(false); ctx.notify(stocksErrorCode(e) === "NOT_CONFIGURED" ? "Integrasi Google belum tersedia" : "Tidak bisa membuka Google. Coba lagi."); }
  };
  const startWithoutGoogle = async () => { setBusy(true); try { await activateStocks(); ctx.open({ k: "stock-add", first: true }); } catch { ctx.notify("Gagal mengaktifkan. Coba lagi."); } finally { setBusy(false); } };

  if (!loaded) return <div className="dpx-vt-pn"><div className="dpx-skel" style={{ height: 220 }} /></div>;

  if (!s?.activated) {
    const available = g?.configured !== false, linked = Boolean(g?.connected && g.features.drive);
    return <div key="saham" className="dpx-vt-pn">
      <Onboard asset="trend" title="Lacak saham Anda" desc="Catat pembelian saham IDX. Harga dan untung rugi dihitung otomatis oleh Google Sheets milik Anda, dan ikut masuk ke kekayaan bersih."
        bullets={[["Datanya di Drive Anda, ", "bukan di server kami."], ["Harga otomatis ", "lewat GOOGLEFINANCE."], ["Fee broker ", "dihitung otomatis."]]}
        notice={linked ? <div className="dpx-note dpx-info"><Ic n="check" /><div><b>Google Sheets Anda sudah terhubung</b>{g?.email ? ` (${g.email})` : ""}. Cukup menambah 2 tab ke spreadsheet yang sama. Tanpa izin baru.</div></div>
          : g?.connected ? <div className="dpx-note dpx-info"><Ic n="info" /><div><b>Koneksi Google Anda belum mencakup Drive.</b> Satu izin tambahan diperlukan untuk menambah tab Saham.</div></div> : null}
        primary={!available ? "Mulai catat saham" : linked ? "Aktifkan Saham" : "Hubungkan Google Sheets"} busy={busy}
        onPrimary={() => (!available ? void startWithoutGoogle() : linked ? ctx.open({ k: "stock-activate" }) : setConsent(true))}
        secondary={available ? "Catat dulu tanpa harga otomatis" : undefined} onSecondary={() => void startWithoutGoogle()} />
      {consent ? <ConsentSheet features={["drive"]} busy={busy} onClose={() => setConsent(false)} onGo={() => void connect()} extra={CONSENT_EXTRA} /> : null}
    </div>;
  }

  const pf = portfolio(s), visible = ctx.visible;
  const items: (Valued | null)[] = [...pf.rows, null], shelves: (Valued | null)[][] = [];
  for (let i = 0; i < items.length; i += 3) shelves.push(items.slice(i, i + 3));
  const total = pf.priced ? pf.value : pf.cost;
  const addTrade = () => ctx.open({ k: "stock-add" });
  const log = [...s.trades].reverse();

  return <div key="saham" className="dpx-vt-pn">
    <Seg id="stock-sub" label="Isi tab Saham" value={sub} onChange={setSub} options={[["hold", "Kepemilikan"], ["log", "Riwayat"]] as const} />
    {sub === "log" ? <div className="dpx-group dpx-white dpx-flush">{log.length ? log.map((t) => <TradeRow key={t.id} t={t} visible={visible} onOpen={() => ctx.open({ k: "stock-trade", id: t.id })} />) : <p className="dpx-sub" style={{ padding: 12 }}>Belum ada transaksi.</p>}</div> : <>
      <Banners s={s} onConnect={() => setConsent(true)} />
      {shelves.map((row, si) => <div className="dpx-vt-shelf" key={si}>{row.map((r, i) => r
        ? <motion.button type="button" key={r.ticker} className="dpx-vt-slot" onClick={() => ctx.open({ k: "stock-view", ticker: r.ticker })} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: (si * 3 + i) * 0.05 }} whileTap={{ scale: 0.95 }}>
          <span className="dpx-vt-stk"><span className="dpx-st-tile"><Logo t={r.ticker} size={68} />{pf.priced && r.source !== "sheet" ? <em>manual</em> : null}</span></span>
          <b>{r.ticker}</b><span className="dpx-sub">{mask(visible, rupiah(pf.priced ? r.value : r.cost))}</span>
          {pf.priced ? <span className={r.pl >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontSize: 10.5, fontWeight: 700 }}>{percent(r.plPct)}</span> : <span className="dpx-sub" style={{ fontSize: 10.5 }}>modal</span>}
        </motion.button>
        : <button type="button" key="add" className="dpx-vt-slot dpx-vt-add" onClick={addTrade}><span className="dpx-vt-stk"><span className="dpx-vt-plus"><Ic n="plus" /></span></span><b style={{ color: "var(--mute)" }}>Catat saham</b></button>)}</div>)}
      <div className="dpx-group dpx-white dpx-vt-sum">
        <div className="dpx-st-sumrow"><div style={{ flex: 1 }}><div className="dpx-sub">Nilai semua saham</div><div className="dpx-vt-sumamt">{mask(visible, rupiah(total))}</div></div>
          <Btn type="button" className="dpx-st-gear" onClick={() => ctx.open({ k: "stock-fee" })} aria-label="Pengaturan fee broker"><Ic n="edit" size="sm" /></Btn></div>
        <div className="dpx-sub">{pf.priced ? <>Modal {mask(visible, rupiah(pf.cost))} · {visible ? <span className={pf.pl >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontWeight: 700 }}>{percent(pf.plPct)} ({signedRupiah(pf.pl)})</span> : "•••"}</> : <>Modal {mask(visible, rupiah(pf.cost))} · tanpa harga terkini</>}</div>
        <div className="dpx-vt-bar" role="img" aria-label="Komposisi saham">{pf.rows.map((r, i) => <i key={r.ticker} style={{ width: `${total ? ((pf.priced ? r.value : r.cost) / total) * 100 : 0}%`, background: BAR[i % BAR.length] }} />)}</div>
        <div className="dpx-vt-leg">{pf.rows.map((r, i) => <span key={r.ticker}><i style={{ background: BAR[i % BAR.length] }} />{r.ticker} {total ? Math.round(((pf.priced ? r.value : r.cost) / total) * 100) : 0}%</span>)}</div>
        {pf.priced && pf.asOf ? <div className="dpx-sub" style={{ marginTop: 6 }}>Harga per {stampLabel(pf.asOf)} · dari Google Sheets</div> : null}
        {s.sheet.url ? <a className="dpx-linkbtn" style={{ textAlign: "center", padding: "8px 0 2px" }} href={s.sheet.url} target="_blank" rel="noreferrer">Buka di Google Sheets ›</a> : null}
      </div>
    </>}
    {consent ? <ConsentSheet features={["drive"]} busy={busy} onClose={() => setConsent(false)} onGo={() => void connect()} extra={CONSENT_EXTRA} /> : null}
  </div>;
}

function TradeRow({ t, visible, onOpen }: { t: StockTrade; visible: boolean; onOpen: () => void }) {
  return <button type="button" className="dpx-row-btn" style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid var(--line)", textAlign: "left" }} onClick={onOpen}>
    <Mini t={t.ticker} size={36} /><div style={{ flex: 1, minWidth: 0 }}><b>{t.ticker} <span className={`dpx-st-chip ${t.side === "buy" ? "dpx-ok" : "dpx-bad"}`}>{t.side === "buy" ? "Beli" : "Jual"}</span></b>
      <div className="dpx-sub">{t.lots} lot @ {rupiah(t.price)} · {dateLong(t.at)}</div></div><b style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{mask(visible, rupiah(grossOf(t.lots, t.price)))}</b></button>;
}

/* ---------- Activation: adds the tabs to the workbook the user already has ---------- */
export function StockActivate({ ctx, onClose }: { ctx: FinCtx; onClose: () => void }) {
  const { state: s } = useStocks();
  const [phase, setPhase] = useState(0), [failed, setFailed] = useState<string | null>(null), [attempt, setAttempt] = useState(0), [timedOut, setTimedOut] = useState(false);
  const activated = useRef(false);
  useEffect(() => {
    let live = true; activated.current = false; setPhase(1); setFailed(null); setTimedOut(false);
    void activateStocks().then(() => { activated.current = true; if (live) setPhase((p) => Math.max(p, 2)); }).catch((e) => { if (live) setFailed(stockMessage(stocksErrorCode(e))); });
    const started = Date.now();
    const poll = setInterval(() => { void reloadStocks(); if (Date.now() - started > 90_000) { setTimedOut(true); clearInterval(poll); } }, 2000);
    return () => { live = false; clearInterval(poll); };
  }, [attempt]);
  const ready = Boolean(s?.sheet.ready), err = s?.sheet.error && !s.sheet.ready ? s.sheet.error : null;
  useEffect(() => { if (ready) { setPhase(3); const a = setTimeout(() => setPhase(4), 700); return () => clearTimeout(a); } }, [ready]);
  const done = phase >= 4, bad = failed ?? (err && err !== "NOT_CONNECTED" ? "Spreadsheet belum bisa disiapkan." : err ? "Koneksi Google terputus." : null);
  const steps = ["Memakai koneksi Google Anda", "Memeriksa spreadsheet Djiwa Pay", "Menambah tab Saham dan Portofolio Saham", "Memasang rumus harga otomatis"];
  return <FullPage title="Aktifkan Saham" onBack={onClose}>
    <div className="dpx-st-body">
      <div className="dpx-st-hero"><motion.div className="dpx-st-ico" key={done ? "d" : "w"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 18 }}><img src={payAsset(done ? "check" : bad ? "warn" : "refresh")} alt="" /></motion.div>
        <h2>{done ? "Siap dipakai" : bad ? "Belum berhasil" : "Menyiapkan spreadsheet…"}</h2>
        <p className="dpx-sub">{done ? "Dua tab baru sudah ada di spreadsheet keuangan Anda." : bad ? bad : timedOut ? "Masih disiapkan di latar belakang. Anda bisa mulai mencatat sekarang." : "Hanya menambah tab. Data Catatan Anda tidak tersentuh."}</p></div>
      <div className="dpx-group dpx-white" style={{ marginTop: 16 }}>{steps.map((t, i) => <div key={t} className={`dpx-st-prog ${phase > i ? "dpx-on dpx-done" : phase === i ? "dpx-on" : ""}`}><i>{phase > i ? "✓" : ""}</i>{t}</div>)}</div>
    </div>
    <div className="dpx-st-foot">
      {done ? <Btn type="button" className="dpx-btn dpx-onb-go" onClick={() => ctx.open({ k: "stock-add", first: true })}>Catat saham pertama</Btn>
        : bad ? <><Btn type="button" className="dpx-btn dpx-soft" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Btn><Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "stock-add", first: true })}>Catat dulu</Btn></>
        : timedOut ? <Btn type="button" className="dpx-btn dpx-onb-go" onClick={() => ctx.open({ k: "stock-add", first: true })}>Mulai catat saham</Btn> : null}
    </div>
  </FullPage>;
}

/* ---------- Add a trade ---------- */
export function StockAdd({ ctx, ticker: presetTicker, side: presetSide, first, onClose }: { ctx: FinCtx; ticker?: string; side?: StockSide; first?: boolean; onClose: () => void }) {
  const { state: s } = useStocks();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(presetTicker ? 2 : 1);
  const [side, setSide] = useState<StockSide>(presetSide ?? "buy"), [ticker, setTicker] = useState(presetTicker ?? ""), [q, setQ] = useState("");
  const [lots, setLots] = useState(""), [price, setPrice] = useState(() => { const p = presetTicker ? s?.prices[presetTicker] : undefined; const v = p?.price ?? p?.manual ?? s?.holdings.find((h) => h.ticker === presetTicker)?.avg; return v ? String(Math.round(v)) : ""; });
  const [date, setDate] = useState(todayWib), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const fees = s?.fees ?? DEFAULT_FEES, held = s?.holdings.find((h) => h.ticker === ticker)?.lots ?? 0;
  const nLots = Number(lots || 0), nPrice = Number(price || 0), gross = grossOf(nLots, nPrice), fee = feeFor(side, gross, fees), total = side === "buy" ? gross + fee : gross - fee;
  const over = side === "sell" && nLots > held, valid = nLots > 0 && nPrice > 0 && !over;

  const matches = useMemo(() => { const k = q.trim().toUpperCase(); return IDX_TICKERS.filter(([c, n]) => !k || c.includes(k) || n.toUpperCase().includes(k)).slice(0, 30); }, [q]);
  const custom = q.trim().toUpperCase(), canCustom = isTicker(custom) && !TICKER_NAME.has(custom);
  const pick = (t: string) => { setTicker(t); const p = s?.prices[t]; const v = p?.price ?? p?.manual; setPrice(v ? String(Math.round(v)) : ""); setStep(2); };
  const back = () => (step === 2 && !presetTicker ? setStep(1) : step === 3 ? setStep(2) : onClose());
  const save = async () => {
    setBusy(true); setErr(null);
    try { await addStockTrade({ ticker, side, lots: nLots, price: nPrice, at: date === todayWib() ? new Date().toISOString() : new Date(`${date}T12:00:00+07:00`).toISOString() }); setStep(4); }
    catch (e) { setErr(stockMessage(stocksErrorCode(e))); } finally { setBusy(false); }
  };
  const again = () => { setStep(1); setTicker(""); setQ(""); setLots(""); setPrice(""); setSide("buy"); setDate(todayWib()); setErr(null); };

  // After saving, watch for the sheet catching up.
  useEffect(() => { if (step !== 4 || !s?.drive) return; const t = setInterval(() => void reloadStocks(), 2500); return () => clearInterval(t); }, [step, s?.drive]);
  const written = Boolean(s?.drive && !s.sheet.pending);
  const dots = (n: number) => <div className="dpx-st-steps">{[1, 2, 3].map((i) => <i key={i} className={i <= n ? "dpx-on" : ""} />)}</div>;

  return <FullPage title={step === 1 ? (first ? "Saham pertama" : "Pilih saham") : step === 4 ? "Tercatat" : step === 3 ? "Konfirmasi" : ticker} onBack={back}>
    <div className="dpx-st-body">
      {step === 1 ? <>{dots(1)}
        <label className="dpx-input"><Ic n="search" size="sm" /><input autoFocus aria-label="Cari kode atau nama saham" placeholder="Cari kode atau nama, mis. BBCA" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="dpx-st-list" style={{ marginTop: 6 }}>
          {canCustom ? <button type="button" onClick={() => pick(custom)}><Mini t={custom} /><div style={{ flex: 1 }}><b>Gunakan kode {custom}</b><div className="dpx-sub">Saham lain di IDX</div></div></button> : null}
          {matches.map(([c, n]) => { const p = s?.prices[c]; const v = p?.price ?? p?.manual; return <button type="button" key={c} onClick={() => pick(c)}><Mini t={c} /><div style={{ flex: 1 }}><b>{c}</b><div className="dpx-sub">{n}</div></div>{v ? <span className="dpx-sub num">{rupiah(v)}</span> : null}</button>; })}
          {!matches.length && !canCustom ? <p className="dpx-sub" style={{ padding: "16px 4px" }}>Tidak ketemu. Masukkan kode 4 huruf.</p> : null}
        </div></> : null}

      {step === 2 ? <>{dots(2)}
        <div className="dpx-st-sw" role="group" aria-label="Jenis transaksi"><button type="button" className={`dpx-buy ${side === "buy" ? "dpx-on" : ""}`} aria-pressed={side === "buy"} onClick={() => setSide("buy")}>Beli</button><button type="button" className={`dpx-sell ${side === "sell" ? "dpx-on" : ""}`} aria-pressed={side === "sell"} onClick={() => setSide("sell")}>Jual</button></div>
        <label className="dpx-st-field"><span>Jumlah lot{side === "sell" ? ` · punya ${held} lot` : ""}</span><div><input inputMode="numeric" aria-label="Jumlah lot" placeholder="0" value={lots} onChange={(e) => setLots(e.target.value.replace(/\D/g, "").slice(0, 7))} /><small>lot</small></div></label>
        <label className="dpx-st-field"><span>Harga per lembar</span><div><small>Rp</small><input inputMode="numeric" aria-label="Harga per lembar" placeholder="0" value={price ? num(price) : ""} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 8))} /></div></label>
        <div className="dpx-st-chips">{[1, 5, 10, 20].map((n) => <button type="button" key={n} aria-pressed={lots === String(n)} onClick={() => setLots(String(n))}>{n} lot</button>)}
          <label className="dpx-chip3 dpx-datefield" style={{ cursor: "pointer" }}><Ic n="cal" size="sm" /> {new Date(`${date}T12:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}<input type="date" value={date} max={todayWib()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Tanggal transaksi" /></label></div>
        <div className="dpx-group dpx-white">{over ? <div className="dpx-dn" style={{ fontSize: 13, fontWeight: 700 }}>Lot melebihi kepemilikan.</div> : <>
          <div className="dpx-st-kv"><span>Nilai ({nLots * 100} lembar)</span><b>{rupiah(gross)}</b></div>
          <div className="dpx-st-kv"><span>Fee {side === "buy" ? "beli" : "jual"} {String(fees[side]).replace(".", ",")}%</span><b>{rupiah(fee)}</b></div>
          <div className="dpx-st-kv"><b style={{ fontFamily: "inherit" }}>{side === "buy" ? "Total" : "Diterima"}</b><b style={{ fontSize: 18 }}>{rupiah(total)}</b></div></>}</div>
        <Btn type="button" className="dpx-btn dpx-onb-go" disabled={!valid} onClick={() => setStep(3)}>Lanjut</Btn></> : null}

      {step === 3 ? <>{dots(3)}
        <div className="dpx-group dpx-white"><div className="dpx-st-sumrow" style={{ marginBottom: 10 }}><Mini t={ticker} size={46} /><div style={{ flex: 1 }}><b>{ticker}</b><div className="dpx-sub">{TICKER_NAME.get(ticker) ?? "Saham IDX"}</div></div><span className={`dpx-st-chip ${side === "buy" ? "dpx-ok" : "dpx-bad"}`}>{side === "buy" ? "Beli" : "Jual"}</span></div>
          {([["Tanggal", dateLong(date === todayWib() ? new Date().toISOString() : `${date}T12:00:00+07:00`)], ["Jumlah", `${nLots} lot (${nLots * 100} lembar)`], ["Harga", rupiah(nPrice)], ["Nilai transaksi", rupiah(gross)], [`Fee ${String(fees[side]).replace(".", ",")}%`, rupiah(fee)]] as [string, string][]).map(([k, v]) => <div className="dpx-st-kv" key={k}><span>{k}</span><b>{v}</b></div>)}
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "8px 0" }} /><div className="dpx-st-kv"><b style={{ fontFamily: "inherit" }}>{side === "buy" ? "Total dibayar" : "Total diterima"}</b><b style={{ fontSize: 19 }}>{rupiah(total)}</b></div></div>
        <div className="dpx-note dpx-info"><Ic n="info" /><div>{s?.drive ? <>Akan ditulis sebagai baris baru di tab <b>Saham</b> pada spreadsheet Anda.</> : "Disimpan di Djiwa Pay. Ditulis ke spreadsheet setelah Google terhubung."}</div></div>
        {err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : null}
        <Btn type="button" className="dpx-btn dpx-onb-go" disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan transaksi"}</Btn></> : null}

      {step === 4 ? <div className="dpx-st-hero"><motion.div className="dpx-st-ico" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 16 }}><img src={payAsset("check")} alt="" /></motion.div>
        <h2>Tercatat</h2><p className="dpx-sub">{side === "buy" ? "Pembelian" : "Penjualan"} {ticker} {nLots} lot @ {rupiah(nPrice)} sudah masuk ke portofolio.</p>
        <div className="dpx-group dpx-white" style={{ textAlign: "left", marginTop: 16 }}>
          <div className="dpx-st-prog dpx-on dpx-done"><i>✓</i>Disimpan di Djiwa Pay</div>
          <div className={`dpx-st-prog ${s?.drive ? "dpx-on" : ""} ${written ? "dpx-done" : ""}`}><i>{written ? "✓" : ""}</i>{!s?.drive ? "Menunggu Google terhubung" : written ? "Ditulis ke Google Sheets" : "Menulis ke Google Sheets…"}</div>
          <div className="dpx-st-prog dpx-on dpx-done"><i>✓</i>Kekayaan bersih diperbarui</div></div></div> : null}
    </div>
    {step === 4 ? <div className="dpx-st-foot" style={{ flexDirection: "column" }}><Btn type="button" className="dpx-btn dpx-onb-go" onClick={onClose}>Lihat di Kekayaan</Btn><Btn type="button" className="dpx-btn dpx-soft" onClick={again}>Catat lagi</Btn></div> : null}
  </FullPage>;
}

/* ---------- One stock ---------- */
export function StockDetail({ ctx, ticker, onClose }: { ctx: FinCtx; ticker: string; onClose: () => void }) {
  const { state: s } = useStocks();
  if (!s) return null;
  const h = s.holdings.find((x) => x.ticker === ticker), pf = portfolio(s), row = pf.rows.find((r) => r.ticker === ticker);
  const trades = s.trades.filter((t) => t.ticker === ticker).reverse(), visible = ctx.visible;
  if (!h) return null;
  const open = h.shares > 0, noGoogleData = s.drive && row && row.source !== "sheet";
  return <FullPage title={ticker} onBack={onClose}>
    <div className="dpx-st-body">
      <div className="dpx-st-sumrow" style={{ margin: "4px 0 12px" }}><Mini t={ticker} size={52} /><div><b style={{ fontSize: 16 }}>{TICKER_NAME.get(ticker) ?? "Saham IDX"}</b><div className="dpx-sub">IDX:{ticker}</div></div></div>
      <div style={{ marginBottom: 12 }}><Banners s={s} onConnect={() => { onClose(); }} /></div>
      {open && row ? <>
        <div className="dpx-group dpx-white"><div className="dpx-sub">{row.source === "manual" ? "Harga manual" : row.source === "none" ? "Harga belum tersedia · memakai rata-rata beli" : "Harga terkini"}</div>
          <div className="dpx-st-sumrow" style={{ alignItems: "baseline" }}><b style={{ fontSize: 30, flex: 1, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums" }}>{mask(visible, rupiah(row.price))}</b>
            {noGoogleData ? <span className="dpx-st-chip dpx-warn">{row.source === "manual" ? "Harga manual" : "Tidak ada data Google"}</span> : s.drive && row.asOf ? <span className="dpx-sub" style={{ fontSize: 11 }}>per {stampLabel(row.asOf)}</span> : null}</div>
          {noGoogleData ? <Btn type="button" className="dpx-btn dpx-soft" style={{ minHeight: 40, fontSize: 13, marginTop: 10 }} onClick={() => ctx.open({ k: "stock-manual", ticker })}>{row.source === "manual" ? "Ubah" : "Isi"} harga manual</Btn> : null}</div>
        <div className="dpx-group dpx-white" style={{ marginTop: 12 }}>
          <div className="dpx-st-sumrow" style={{ gap: 0 }}>{([["Lot", String(h.lots)], ["Rata-rata", rupiah(h.avg)], ["Modal", mask(visible, rupiah(h.cost))]] as [string, string][]).map(([a, b]) => <div key={a} style={{ flex: 1 }}><div className="dpx-sub">{a}</div><b style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{b}</b></div>)}</div>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "12px 0" }} />
          <div className="dpx-st-sumrow"><div style={{ flex: 1 }}><div className="dpx-sub">Untung/rugi belum terealisasi</div><b className={row.pl >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontSize: 18 }}>{s.drive ? mask(visible, signedRupiah(row.pl)) : "–"}</b></div>{s.drive ? <span className={`dpx-st-chip ${row.pl >= 0 ? "dpx-ok" : "dpx-bad"}`}>{percent(row.plPct)}</span> : null}</div>
          {h.realized ? <div className="dpx-sub" style={{ marginTop: 6 }}>Terealisasi: <b className={h.realized >= 0 ? "dpx-up" : "dpx-dn"}>{mask(visible, signedRupiah(h.realized))}</b></div> : null}</div></>
        : <div className="dpx-group dpx-white"><div className="dpx-sub">Sudah terjual semua</div><b className={h.realized >= 0 ? "dpx-up" : "dpx-dn"} style={{ fontSize: 22 }}>{mask(visible, signedRupiah(h.realized))}</b><div className="dpx-sub">untung/rugi terealisasi</div></div>}
      <h3 style={{ margin: "18px 2px 6px", font: "700 15px var(--font)" }}>Riwayat</h3>
      <div className="dpx-group dpx-white dpx-flush">{trades.map((t) => <TradeRow key={t.id} t={t} visible={visible} onOpen={() => ctx.open({ k: "stock-trade", id: t.id })} />)}</div>
    </div>
    <div className="dpx-st-foot">
      {open ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => ctx.open({ k: "stock-add", ticker, side: "sell" })}>Jual</Btn> : null}
      <Btn type="button" className="dpx-btn dpx-onb-go" onClick={() => ctx.open({ k: "stock-add", ticker, side: "buy" })}>Beli lagi</Btn>
    </div>
  </FullPage>;
}

/* ---------- Sheets ---------- */
export function StockTradeSheet({ id, onClose, notify }: { id: string; onClose: () => void; notify: (m: string) => void }) {
  const { state: s } = useStocks(), t = s?.trades.find((x) => x.id === id);
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [confirm, setConfirm] = useState(false);
  if (!t) return null;
  const del = async () => { setBusy(true); setErr(null); try { await deleteStockTrade(t.id); notify("Transaksi dihapus"); onClose(); } catch (e) { setErr(stockMessage(stocksErrorCode(e))); setConfirm(false); } finally { setBusy(false); } };
  return <Sheet title={`${t.side === "buy" ? "Beli" : "Jual"} ${t.ticker}`} onClose={onClose}>
    <div className="dpx-group dpx-white">{([["Tanggal", dateLong(t.at)], ["Jumlah", `${t.lots} lot (${t.lots * 100} lembar)`], ["Harga", rupiah(t.price)], ["Nilai transaksi", rupiah(grossOf(t.lots, t.price))], ["Fee", rupiah(t.fee)]] as [string, string][]).map(([k, v]) => <div className="dpx-st-kv" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    {err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : null}
    {confirm ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Hapus transaksi ini?</b> Rata-rata beli dan untung/rugi dihitung ulang, dan barisnya dihapus dari sheet.<div className="dpx-flex" style={{ marginTop: 10, gap: 8 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" disabled={busy} onClick={() => void del()}>{busy ? "Menghapus…" : "Ya, hapus"}</Btn><Btn type="button" className="dpx-btn dpx-ghost dpx-sm" onClick={() => setConfirm(false)}>Batal</Btn></div></div></div>
      : <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => setConfirm(true)}><Ic n={"trash" as IconName} size="sm" /> Hapus transaksi</Btn>}
  </Sheet>;
}

export function StockFeeSheet({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const { state: s } = useStocks();
  const [buy, setBuy] = useState(String(s?.fees.buy ?? DEFAULT_FEES.buy).replace(".", ",")), [sell, setSell] = useState(String(s?.fees.sell ?? DEFAULT_FEES.sell).replace(".", ","));
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const n = (v: string) => Number(v.replace(",", "."));
  const ok = [buy, sell].every((v) => v !== "" && Number.isFinite(n(v)) && n(v) >= 0 && n(v) <= 5);
  const save = async () => { setBusy(true); setErr(null); try { await saveStockFees({ buy: n(buy), sell: n(sell) }); notify("Fee disimpan"); onClose(); } catch (e) { setErr(stockMessage(stocksErrorCode(e))); } finally { setBusy(false); } };
  return <Sheet title="Fee broker" onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>Berlaku untuk transaksi berikutnya. Fee jual sudah termasuk pajak penghasilan final 0,1%.</p>
    <div style={{ display: "flex", gap: 10 }}>
      <label className="dpx-st-field" style={{ flex: 1 }}><span>Fee beli</span><div><input inputMode="decimal" aria-label="Fee beli" value={buy} onChange={(e) => setBuy(e.target.value.replace(/[^\d,]/g, "").slice(0, 6))} /><small>%</small></div></label>
      <label className="dpx-st-field" style={{ flex: 1 }}><span>Fee jual</span><div><input inputMode="decimal" aria-label="Fee jual" value={sell} onChange={(e) => setSell(e.target.value.replace(/[^\d,]/g, "").slice(0, 6))} /><small>%</small></div></label></div>
    <div className="dpx-st-chips">{([["Standar", "0,15", "0,35"], ["Tanpa fee", "0", "0"]] as const).map(([name, b, sl]) => <button type="button" key={name} onClick={() => { setBuy(b); setSell(sl); }}>{name}</button>)}</div>
    {err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : null}
    <Btn type="button" className="dpx-btn dpx-onb-go" disabled={!ok || busy} onClick={() => void save()}>Simpan</Btn>
  </Sheet>;
}

export function StockManualSheet({ ticker, onClose, notify }: { ticker: string; onClose: () => void; notify: (m: string) => void }) {
  const { state: s } = useStocks();
  const [v, setV] = useState(s?.prices[ticker]?.manual ? String(s.prices[ticker].manual) : ""), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const save = async (value: number | null) => { setBusy(true); setErr(null); try { await saveManualPrice(ticker, value); notify(value === null ? "Harga manual dihapus" : "Harga manual disimpan"); onClose(); } catch (e) { setErr(stockMessage(stocksErrorCode(e))); } finally { setBusy(false); } };
  return <Sheet title={`Harga manual ${ticker}`} onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>Google tidak punya data harga saham ini. Isi sendiri, dan ubah kapan saja. Bila nanti Google punya datanya, harga Google yang dipakai.</p>
    <label className="dpx-st-field"><span>Harga per lembar</span><div><small>Rp</small><input autoFocus inputMode="numeric" aria-label="Harga manual per lembar" placeholder="0" value={v ? num(v) : ""} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 8))} /></div></label>
    {err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : null}
    <Btn type="button" className="dpx-btn dpx-onb-go" disabled={!Number(v) || busy} onClick={() => void save(Number(v))}>Simpan</Btn>
    {s?.prices[ticker]?.manual ? <Btn type="button" className="dpx-btn dpx-ghost" disabled={busy} onClick={() => void save(null)}>Hapus harga manual</Btn> : null}
  </Sheet>;
}
