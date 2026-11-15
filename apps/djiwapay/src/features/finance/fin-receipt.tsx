import { useEffect, useRef, useState } from "react";
import { Btn, Ic, Sheet } from "../shell/dpx-ui";
import { rupiah } from "../../lib/djiwa-pay-format";
import { uid } from "../../lib/finance/calc";
import { SCAN_ERROR_TEXT, ScanError, compressImage, receiptImageUrl, receiptToEntries, scanReceipt, toDraftItems, type ReceiptDraftItem, type ScannedReceipt } from "../../lib/finance/receipt";
import type { Finance } from "../../lib/finance/use-finance";
import { AccountSheet, CatIcon, CategorySheet, accName, catOf, type Notify } from "./fin-sheets";

type Stage = { s: "reading"; preview: string } | { s: "error"; text: string; code: string } | { s: "result"; receipt: ScannedReceipt; items: ReceiptDraftItem[]; preview: string };
const STEPS = ["Mengunggah foto dengan aman", "Membaca teks struk", "Menyusun item dan kategori"];

/** Runs after a photo is chosen in the Catat sheet: read -> review -> save, all in the same sheet. */
export function ReceiptFlow({ fin, notify, onClose, onRetry, balances, file }: { fin: Finance; notify: Notify; onClose: () => void; onRetry: () => void; balances: Record<string, number>; file: File }) {
  const { state, dispatch } = fin;
  const [stage, setStage] = useState<Stage>({ s: "reading", preview: "" });
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"one" | "split">("split");
  const [accountId, setAccountId] = useState(() => state.accounts.find((a) => !a.archived)?.id ?? "tunai");
  const [pick, setPick] = useState<{ kind: "cat"; key: string } | { kind: "acc" } | null>(null);
  const started = useRef(false);
  useEffect(() => { if (stage.s !== "reading") return; setStep(0); const t = [setTimeout(() => setStep(1), 900), setTimeout(() => setStep(2), 2600)]; return () => t.forEach(clearTimeout); }, [stage.s]);

  const run = async () => {
    try {
      const image = await compressImage(file);
      setStage({ s: "reading", preview: image });
      const receipt = await scanReceipt(image);
      const items = toDraftItems(receipt.items, state.categories);
      if (receipt.mismatch > 0) items.push({ key: uid(), name: "Pajak / biaya lain", qty: 1, price: receipt.mismatch, categoryId: items.sort((a, b) => b.price - a.price)[0]?.categoryId ?? "belanja", confidence: 0.6 });
      setStage({ s: "result", receipt, items, preview: image });
    } catch (e) {
      const code = e instanceof ScanError ? e.code : "BAD_IMAGE";
      setStage({ s: "error", code, text: SCAN_ERROR_TEXT[code as keyof typeof SCAN_ERROR_TEXT] ?? SCAN_ERROR_TEXT.SCAN_FAILED });
    }
  };
  useEffect(() => { if (started.current) return; started.current = true; void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (stage.s === "error") return <Sheet title="Struk belum terbaca" onClose={onClose}>
    <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 0 }}><Ic n="warn" /><div>{stage.text}</div></div>
    <Btn type="button" className="dpx-btn" onClick={onRetry}><Ic n="scan" size="sm" /> Coba foto lagi</Btn>
    <Btn type="button" className="dpx-btn dpx-soft" onClick={onClose}>Tutup</Btn>
  </Sheet>;

  if (stage.s === "reading") return <Sheet title="Membaca struk" onClose={onClose}>
    <div style={{ position: "relative", height: 190, borderRadius: 20, overflow: "hidden", background: "var(--group)" }}>{stage.preview ? <img src={stage.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55, filter: "blur(1px)" }} /> : null}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "18px 4px 6px" }} role="status" aria-live="polite">
      {STEPS.map((t, i) => <div key={t} style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: i <= step ? 600 : 400, color: i <= step ? "inherit" : "var(--faint)" }}><span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", background: i < step ? "var(--ok)" : "var(--group)", color: "#fff", fontSize: 12 }}>{i < step ? <Ic n="check" size="sm" /> : ""}</span>{t}{i === step ? "…" : ""}</div>)}
    </div>
    <p className="dpx-hint dpx-center">Biasanya 3–8 detik.</p>
  </Sheet>;

  const { receipt, items, preview } = stage;
  const setItems = (fn: (cur: ReceiptDraftItem[]) => ReceiptDraftItem[]) => setStage({ ...stage, items: fn(items) });
  if (pick?.kind === "cat") { const it = items.find((i) => i.key === pick.key)!; return <CategorySheet categories={state.categories} income={false} value={it.categoryId} onPick={(id) => setItems((c) => c.map((x) => (x.key === pick.key ? { ...x, categoryId: id } : x)))} onClose={() => setPick(null)} />; }
  if (pick?.kind === "acc") return <AccountSheet state={state} balances={balances} value={accountId} onPick={setAccountId} onClose={() => setPick(null)} />;
  const total = items.reduce((s, i) => s + i.price, 0);
  const off = receipt.total > 0 && Math.abs(receipt.total - total) > 0;
  const save = () => {
    const entries = receiptToEntries({ receiptId: receipt.id, merchant: receipt.merchant, items, mode, accountId, at: receipt.purchasedAt ?? new Date().toISOString(), categories: state.categories });
    if (!entries.length) return;
    dispatch({ type: "entry/addMany", entries });
    onClose();
    notify(`${entries.length} catatan dari struk tersimpan`, () => entries.forEach((e) => dispatch({ type: "entry/delete", id: e.id })));
  };
  return <Sheet title="Hasil baca struk" onClose={onClose}>
    <div className="dpx-group" style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <img src={preview} alt="Foto struk" style={{ width: 56, height: 72, objectFit: "cover", borderRadius: 10 }} />
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 16 }}>{receipt.merchant || "Struk"}</b><div className="dpx-sub">{receipt.purchasedAt ? new Date(receipt.purchasedAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Tanggal tidak terbaca · pakai hari ini"}</div></div>
      <span className={`dpx-tag ${receipt.confidence >= 0.85 ? "dpx-ok" : ""}`}>Yakin {Math.round(receipt.confidence * 100)}%</span>
    </div>
    <div className="dpx-seg" style={{ marginTop: 12 }}>{([["one", "Satu catatan"], ["split", "Pecah per kategori"]] as const).map(([k, l]) => <Btn type="button" key={k} className={mode === k ? "dpx-on" : ""} onClick={() => setMode(k)}>{l}</Btn>)}</div>
    <div className="dpx-group dpx-white" style={{ marginTop: 12, boxShadow: "none", background: "var(--group)" }}>
      {items.map((i) => { const c = catOf(state, i.categoryId); return <div className="dpx-item-edit" key={i.key} style={i.confidence < 0.7 ? { boxShadow: "0 0 0 2px #f4c36a inset", borderRadius: 12 } : undefined}>
        <Btn type="button" className="dpx-cat" style={{ width: 44, height: 44 }} onClick={() => setPick({ kind: "cat", key: i.key })} aria-label={`Kategori ${c.name}`}><CatIcon cat={c} /></Btn>
        <div className="dpx-nm"><input aria-label="Nama item" value={i.name} onChange={(e) => setItems((cur) => cur.map((x) => (x.key === i.key ? { ...x, name: e.target.value } : x)))} style={{ font: "inherit", fontWeight: 600, background: "transparent", border: 0, width: "100%", padding: 0 }} /><span>{c.name}{i.qty > 1 ? ` · ×${i.qty}` : ""}{i.confidence < 0.7 ? " · periksa" : ""}</span></div>
        <input aria-label="Harga" inputMode="numeric" value={i.price ? String(i.price) : ""} onChange={(e) => setItems((cur) => cur.map((x) => (x.key === i.key ? { ...x, price: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} style={{ width: 88, textAlign: "right", font: "inherit", fontWeight: 700, background: "transparent", border: 0 }} />
        <Btn type="button" className="dpx-sh-x" style={{ width: 34, height: 34 }} onClick={() => setItems((cur) => cur.filter((x) => x.key !== i.key))} aria-label="Hapus item"><Ic n="close" size="sm" /></Btn>
      </div>; })}
    </div>
    <div className="dpx-chips2 dpx-mt8"><Btn type="button" className="dpx-chip3" onClick={() => setPick({ kind: "acc" })}>Dompet: {accName(state, accountId)}</Btn><Btn type="button" className="dpx-chip3" onClick={() => setItems((cur) => [...cur, { key: uid(), name: "Item", qty: 1, price: 0, categoryId: "belanja", confidence: 1 }])}><Ic n="plus" size="sm" /> Tambah item</Btn></div>
    <div className="dpx-kv"><span>Total dicatat</span><b>{rupiah(total)}</b></div>
    {off ? <div className="dpx-note dpx-warn" role="status"><Ic n="warn" /><div>Total di struk {rupiah(receipt.total)}, jumlah item {rupiah(total)} (selisih {rupiah(Math.abs(receipt.total - total))}). Periksa item sebelum menyimpan.</div></div> : null}
    <Btn type="button" className="dpx-btn" disabled={total <= 0} onClick={save}>{mode === "split" ? "Simpan catatan" : "Simpan 1 catatan"}</Btn>
    <Btn type="button" className="dpx-btn dpx-soft" onClick={onRetry}>Scan ulang</Btn>
  </Sheet>;
}

/** Receipt photo + items under an entry's detail. */
export function ReceiptAttachment({ id }: { id: string }) {
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false);
  if (failed) return null;
  return <><Btn type="button" className="dpx-row" style={{ marginTop: 12 }} onClick={() => setOpen((v) => !v)}><span className="dpx-ico"><Ic n="receipt" /></span><span className="dpx-main"><b>Struk terlampir</b><span>{open ? "Ketuk untuk menutup" : "Ketuk untuk melihat foto asli"}</span></span><Ic n="chev" size="sm" /></Btn>
    {open ? <img src={receiptImageUrl(id)} alt="Foto struk asli" onError={() => setFailed(true)} style={{ width: "100%", borderRadius: 16, marginTop: 8 }} /> : null}</>;
}
