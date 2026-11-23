import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Btn, Ic, Sheet } from "../shell/dpx-ui";
import { ScanSweep, type SweepChip } from "../shell/scan-camera";
import { hideStatusBar } from "../../lib/native-chrome";
import { formatDateTime } from "../../lib/djiwa-pay-format";
import { SCAN_ERROR_TEXT, ScanError, compressImage, receiptImageUrl, scanReceipt, fetchReceipt, rereadReceipt, confirmScannedReceipt, attachScannedReceipt, reconcileReceipt, receiptNumber, roundMoney, type ScannedReceipt, type ReceiptDocument } from "../../lib/finance/receipt";
import { pushDiff } from "../../lib/finance/sync";
import type { Entry } from "../../lib/finance/types";
import type { Finance } from "../../lib/finance/use-finance";
import { Breakdown, type BreakdownRow } from "./breakdown";
import { AccountSheet, CategorySheet, accName, catOf, type Notify } from "./fin-sheets";

type FlowProps = { fin: Finance; notify: Notify; onClose: () => void; balances: Record<string, number> };
type Stage = { s: "reading"; preview: string } | { s: "reveal"; receipt: ScannedReceipt; preview: string } | { s: "error"; text: string } | { s: "result"; receipt: ScannedReceipt; preview: string };
const STEPS = ["Mengunggah foto dengan aman", "Membaca seluruh item dan harga", "Memeriksa subtotal, pajak, dan total"];
const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
const moneyText = (n: number | null) => n === null ? "Belum terbaca" : rupiah(n);
const dateInput = (s: string | null) => { if (!s || !Number.isFinite(Date.parse(s))) return ""; const d = new Date(s); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16); };

export function ReceiptFlow({ file, onRetry, ...props }: FlowProps & { file: File; onRetry: () => void; attach?: Entry }) {
  const [stage, setStage] = useState<Stage>({ s: "reading", preview: "" });
  const [step, setStep] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    void (async () => {
      try { const image = await compressImage(file); setStage({ s: "reading", preview: image }); const receipt = await scanReceipt(image); setStage({ s: "reveal", receipt, preview: image }); }
      catch (e) { setStage({ s: "error", text: e instanceof ScanError ? SCAN_ERROR_TEXT[e.code] : "Gambar belum dapat dibuka. Gunakan JPG, PNG, atau WebP." }); }
    })();
  }, [file]);
  useEffect(() => { if (stage.s !== "reading") return; const a = setTimeout(()=>setStep(1),900), b = setTimeout(()=>setStep(2),2600); return ()=>{clearTimeout(a);clearTimeout(b);}; }, [stage.s]);
  if (stage.s === "reveal") { const { boxes, ...receipt } = stage.receipt; const r = stage.receipt;
    const d = r.purchasedAt ? new Date(r.purchasedAt) : null, p2 = (n: number) => String(n).padStart(2, "0");
    const chips = [boxes?.merchant && r.merchant ? { box: boxes.merchant, text: r.merchant.toUpperCase() } : null, boxes?.date && d && Number.isFinite(d.getTime()) ? { box: boxes.date, text: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}.${p2(d.getMinutes())}` } : null, boxes?.total && r.total ? { box: boxes.total, text: r.total.toLocaleString("id-ID") } : null].filter((c): c is SweepChip => Boolean(c));
    return <ScanSweep src={stage.preview} kind="receipt" chips={chips} onDone={() => setStage({ s: "result", receipt: receipt as ScannedReceipt, preview: stage.preview })} />; }
  if (stage.s === "result") return <ReceiptReview {...props} initial={stage.receipt} preview={stage.preview} onRetry={onRetry} />;
  if (stage.s === "reading" && stage.preview) return <ScanSweep src={stage.preview} kind="receipt" onClose={props.onClose} />;
  return <Sheet title={stage.s === "error" ? "Struk belum terbaca" : "Membaca struk"} onClose={props.onClose}>
    {stage.s === "error" ? <><div className="dpx-note dpx-danger" role="alert">{stage.text}</div><Btn type="button" className="dpx-btn dpx-soft" onClick={onRetry}>Pilih foto lain</Btn></> : <>
      {stage.preview ? <div className="dpx-receipt-scan"><img className="dpx-receipt-preview" src={stage.preview} alt="Struk yang sedang dibaca" /></div> : null}
      <div role="status" aria-live="polite" className="dpx-receipt-progress">{STEPS[step]}…</div><p className="dpx-hint">Rincian yang kurang jelas akan ditandai untuk diperiksa.</p>
    </>}
  </Sheet>;
}

function Field({ label, grow, children }: { label: string; grow?: boolean; children: ReactNode }) {
  return <label className={`dpx-ed-f ${grow ? "grow" : ""}`}><span>{label}</span>{children}</label>;
}
function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label className="dpx-ed-sw"><span>{children}</span><input type="checkbox" role="switch" checked={checked} onChange={e=>onChange(e.target.checked)} /><i aria-hidden="true" /></label>;
}
function NumberField({ label, value, onChange, money, strong }: { label: string; value: number | null; onChange: (n: number | null) => void; money?: boolean; strong?: boolean }) {
  const [input, setInput] = useState(value === null ? "" : String(value));
  useEffect(()=>{setInput(current=>receiptNumber(current) === value ? current : value === null ? "" : String(value));}, [value]);
  return <label className={`dpx-ed-f ${strong ? "strong" : ""}`}><span>{label}</span><div className="dpx-ed-in">{money ? <em>Rp</em> : null}<input type="text" inputMode="decimal" value={input} placeholder="—" aria-label={label} onChange={e=>{setInput(e.target.value);onChange(receiptNumber(e.target.value));}} /></div></label>;
}

/** Same editor for new camera/upload results and persistent receipt corrections. */
function RxScreen({ title, aurora, onClose, onRetry, footer, children }: { title: string; aurora: boolean; onClose: () => void; onRetry?: () => void; footer: ReactNode; children: ReactNode }) {
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; const release = hideStatusBar(); const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); release(); }; }, [onClose]);
  const node = <div className="dpx dpx-rxv" role="dialog" aria-modal="true" aria-label={title}>
    {aurora ? <div className="dpx-aurora" aria-hidden="true"><i /></div> : null}
    <div className="dpx-rxv-top"><button type="button" className="dpx-rxv-x" onClick={onClose} aria-label="Tutup"><Ic n="close" /></button>{onRetry ? <button type="button" className="dpx-rxv-retake" onClick={onRetry}>Ulangi</button> : <span />}</div>
    <h1 className="dpx-rxv-title">{title}</h1>
    <div className="dpx-rxv-body">{children}</div>
    <div className="dpx-rxv-foot">{footer}</div>
  </div>;
  return createPortal(node, document.body);
}

export function ReceiptReview({ initial, preview, onRetry, entry, attach, ...props }: FlowProps & { initial: ScannedReceipt; preview?: string; onRetry?: () => void; entry?: Entry; attach?: Entry }) {
  const { fin, notify, onClose, balances } = props;
  const [doc, setDoc] = useState<ScannedReceipt>(()=>({ ...initial, purchasedAt: initial.purchasedAt ?? attach?.at ?? null, items: initial.items.map(i=>({...i,components:i.components ?? []})), charges: initial.charges.map(c=>({...c})) }));
  const [accountId, setAccountId] = useState(()=>{
    if(entry || attach)return (entry ?? attach)!.accountId;
    const method=(initial.paymentMethod ?? "").toLowerCase().replace(/[^a-z0-9]/g,"");
    return method ? fin.state.accounts.find(a=>!a.archived && a.name.toLowerCase().replace(/[^a-z0-9]/g,"").includes(method))?.id ?? "" : "";
  });
  const [categoryId, setCategoryId] = useState((entry ?? attach)?.categoryId ?? "belanja");
  const [pick, setPick] = useState<"account" | "category" | null>(null);
  const [editing, setEditing] = useState(false), [checked, setChecked] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const savingRef = useRef(false);
  const change = (patch: Partial<ScannedReceipt>) => { setDoc(d=>({...d,...patch})); setChecked(false); setError(""); };
  const itemChange = (index: number, patch: Partial<ScannedReceipt["items"][number]>, recalc = false) => {
    change({ items: doc.items.map((i,k)=>{if(k!==index)return i;const n={...i,...patch};if(recalc && n.qty!==null && n.unitPrice!==null)n.price=roundMoney(n.qty*n.unitPrice-n.discount);return n;}) });
  };
  const totals = reconcileReceipt(doc);
  const metadataValid = doc.merchant.trim() && doc.purchasedAt && Number.isFinite(Date.parse(doc.purchasedAt));
  const selectionValid = fin.state.accounts.some(a=>a.id===accountId && !a.archived) && fin.state.categories.some(c=>c.id===categoryId && !c.income);
  const save = async () => {
    if (savingRef.current || !totals.valid || !metadataValid || !selectionValid || !checked) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      const account = fin.state.accounts.find(a=>a.id===accountId), category=fin.state.categories.find(c=>c.id===categoryId);
      if (!account || account.archived || !category || category.income) throw new Error("Pilih dompet dan kategori yang aktif.");
      // Make the selected local-first account/category available before the atomic receipt save.
      await pushDiff({ upserts: { accounts: [account], categories: [category] }, deletes: {} });
      const saved = attach ? await attachScannedReceipt(doc, attach) : await confirmScannedReceipt(doc, accountId, categoryId, Boolean(entry));
      fin.dispatch({ type: "entry/restore", entry: saved });
      onClose(); notify(attach ? "Rincian struk ditambahkan ke catatan" : entry ? "Rincian struk dan nominal catatan diperbarui" : "Struk lengkap tersimpan sebagai 1 catatan");
    } catch (e) { setError(e instanceof Error ? e.message : "Belum tersimpan. Coba lagi."); }
    finally { savingRef.current=false;setSaving(false); }
  };
  if (pick === "account") return <AccountSheet state={fin.state} balances={balances} value={accountId} onPick={id=>{setAccountId(id);setChecked(false);}} onClose={()=>setPick(null)} />;
  if (pick === "category") return <CategorySheet categories={fin.state.categories} income={false} value={categoryId} onPick={id=>{setCategoryId(id);setChecked(false);}} onClose={()=>setPick(null)} />;
  const needsCheck = totals.problems.length > 0 || doc.warnings.length > 0 || doc.items.some(i=>i.confidence < .7);
  const canSave = !saving && totals.valid && Boolean(metadataValid) && selectionValid && (!needsCheck || checked);
  const photoSrc = preview ?? receiptImageUrl(doc.id);
  const money = (n: number | null) => n === null ? "—" : rupiah(n);
  const when = doc.purchasedAt ? formatDateTime(doc.purchasedAt) : "Waktu belum terbaca";
  const account = accountId ? accName(fin.state, accountId) : "Pilih dompet";
  return <RxScreen title={attach ? "Tambah rincian struk" : entry ? "Ubah rincian struk" : "Pengeluaran baru"} aurora={Boolean(preview) && !editing} onClose={()=>{if(!savingRef.current)onClose();}} onRetry={onRetry && !editing ? onRetry : undefined}
    footer={<>
      {error ? <div className="dpx-rxv-err" role="alert">{error}</div> : null}
      {needsCheck && !editing ? <label className="dpx-rxv-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} /><span>Saya sudah memeriksa item, total, dan dompet.</span></label> : null}
      {editing ? <Btn type="button" className="dpx-btn" onClick={()=>setEditing(false)}>Selesai mengubah</Btn> : <Btn type="button" className="dpx-btn" disabled={!canSave} onClick={()=>void save()}>{saving ? "Menyimpan…" : attach ? "Simpan rincian struk" : entry ? "Simpan perubahan struk" : `Simpan 1 catatan · ${rupiah(doc.total)}`}</Btn>}
    </>}>
    {attach ? <p className="dpx-rxv-note">Nominal bayar {rupiah(attach.amount)}, dompet, dan waktu dari email tidak berubah. Struk menambahkan item, pajak, dan diskon.</p> : null}
    {editing ? <>
    <fieldset className="dpx-ed" disabled={saving}>
      <section className="dpx-ed-g"><h3>Toko</h3><div className="dpx-ed-card">
        <Field label="Nama toko"><input value={doc.merchant} maxLength={160} onChange={e=>change({merchant:e.target.value})} /></Field>
        <Field label="Alamat (opsional)"><input value={doc.merchantAddress} onChange={e=>change({merchantAddress:e.target.value})} /></Field>
      </div></section>
      <section className="dpx-ed-g"><h3>Transaksi</h3><div className="dpx-ed-card">
        <Field label="Tanggal dan waktu"><input type="datetime-local" value={dateInput(doc.purchasedAt)} onChange={e=>change({purchasedAt:e.target.value ? new Date(e.target.value).toISOString() : null})} /></Field>
        {!metadataValid ? <p className="dpx-ed-hint bad">Lengkapi nama toko dan tanggal sesuai struk.</p> : null}
        <div className="dpx-ed-row"><Field label="Nomor struk"><input value={doc.reference} onChange={e=>change({reference:e.target.value})} /></Field><Field label="Metode bayar"><input value={doc.paymentMethod} onChange={e=>change({paymentMethod:e.target.value})} /></Field></div>
      </div></section>
      <section className="dpx-ed-g"><h3>Item <b>{doc.items.length}</b></h3>
      {doc.items.map((i,k)=><div className="dpx-ed-card dpx-ed-item" key={k}>
        <div className="dpx-ed-ih"><span className={`dpx-ed-n ${i.confidence < .7 ? "chk" : ""}`}>{k+1}</span><Field label={i.confidence < .7 ? "Nama item · periksa" : "Nama item"} grow><input aria-label={`Nama item ${k+1}`} value={i.name} maxLength={160} onChange={e=>itemChange(k,{name:e.target.value})} /></Field><button type="button" className="dpx-ed-del" aria-label={`Hapus item ${k+1}`} onClick={()=>change({items:doc.items.filter((_,n)=>n!==k)})}><Ic n="trash" size="sm" /></button></div>
        <div className="dpx-ed-row"><NumberField label="Jumlah" value={i.qty} onChange={qty=>itemChange(k,{qty},true)} /><Field label="Satuan"><input aria-label={`Satuan item ${k+1}`} placeholder="pcs, kg…" value={i.unit} onChange={e=>itemChange(k,{unit:e.target.value})} /></Field></div>
        <div className="dpx-ed-row"><NumberField money label="Harga satuan" value={i.unitPrice} onChange={unitPrice=>itemChange(k,{unitPrice},true)} /><NumberField money label="Diskon" value={i.discount} onChange={discount=>itemChange(k,{discount:discount ?? 0},true)} /></div>
        {i.components.length ? <div className="dpx-ed-sub"><small>Isi paket / varian</small>{i.components.map((c,n)=><div className="dpx-ed-comp" key={n}><Field label={`Varian ${n+1}`} grow><input value={c.name} onChange={e=>itemChange(k,{components:i.components.map((x,j)=>j===n?{...x,name:e.target.value}:x)})} /></Field><NumberField label="Qty" value={c.qty} onChange={qty=>itemChange(k,{components:i.components.map((x,j)=>j===n?{...x,qty}:x)})} /></div>)}</div> : null}
        <NumberField money strong label="Jumlah baris" value={i.price} onChange={price=>itemChange(k,{price})} />
      </div>)}
      <button type="button" className="dpx-ed-add" disabled={doc.items.length>=200} onClick={()=>change({items:[...doc.items,{name:"",qty:1,unit:"",unitPrice:null,discount:0,price:null,categoryId:"belanja",confidence:1,components:[]}]})}><Ic n="plus" size="sm" /> Tambah item</button></section>
      <section className="dpx-ed-g"><h3>Ringkasan</h3><div className="dpx-ed-card">
        <div className="dpx-ed-kv"><span>Jumlah seluruh item</span><b>{rupiah(totals.itemSum)}</b></div>
        <div className="dpx-ed-row"><NumberField money label="Subtotal struk" value={doc.subtotal} onChange={subtotal=>change({subtotal})} /><NumberField money label="Diskon struk" value={doc.discount} onChange={discount=>change({discount:discount ?? 0})} /></div>
        <Switch checked={doc.subtotalBeforeItemDiscounts} onChange={v=>change({subtotalBeforeItemDiscounts:v})}>Subtotal tercetak sebelum diskon item</Switch>
        <p className="dpx-ed-hint">Diskon item sudah mengurangi jumlah baris. Isi diskon struk hanya bila belum dikurangi pada item.</p>
      </div>
      {doc.charges.map((c,k)=><div className="dpx-ed-card dpx-ed-item" key={k}>
        <div className="dpx-ed-ih"><Field label="Pajak / biaya" grow><input value={c.label} onChange={e=>change({charges:doc.charges.map((x,n)=>n===k?{...x,label:e.target.value}:x)})} /></Field><button type="button" className="dpx-ed-del" aria-label={`Hapus biaya ${k+1}`} onClick={()=>change({charges:doc.charges.filter((_,n)=>n!==k)})}><Ic n="trash" size="sm" /></button></div>
        <div className="dpx-ed-row"><Field label="Jenis"><select value={c.kind} onChange={e=>change({charges:doc.charges.map((x,n)=>n===k?{...x,kind:e.target.value as typeof c.kind}:x)})}><option value="tax">Pajak</option><option value="service">Layanan</option><option value="shipping">Ongkir</option><option value="rounding">Pembulatan (+/−)</option><option value="other">Biaya lain</option></select></Field><NumberField money label="Nominal" value={c.amount} onChange={amount=>change({charges:doc.charges.map((x,n)=>n===k?{...x,amount}:x)})} /></div>
        <Switch checked={c.included} onChange={v=>change({charges:doc.charges.map((x,n)=>n===k?{...x,included:v}:x)})}>Sudah termasuk dalam harga item</Switch>
      </div>)}
      <button type="button" className="dpx-ed-add" disabled={doc.charges.length>=50} onClick={()=>change({charges:[...doc.charges,{label:"",kind:"tax",amount:null,included:false}]})}><Ic n="plus" size="sm" /> Tambah pajak / biaya</button>
      <div className="dpx-ed-card"><NumberField money strong label="Total akhir struk" value={doc.total} onChange={total=>change({total:total ?? 0})} />
        <div className="dpx-ed-row"><NumberField money label="Uang dibayar" value={doc.tendered} onChange={tendered=>change({tendered})} /><NumberField money label="Kembalian" value={doc.change} onChange={changeValue=>change({change:changeValue})} /></div></div></section>
      <div className={`dpx-rxv-verdict ${totals.valid ? "ok" : "bad"}`} role="status"><i />{totals.valid ? `Total cocok · ${rupiah(totals.computed)}` : `Belum cocok · hitungan ${rupiah(totals.computed)}, selisih ${rupiah(totals.difference)}`}</div>
      {totals.problems.length || doc.warnings.length ? <ul className="dpx-rxv-warn">{[...totals.problems,...doc.warnings].map((w,k)=><li key={k}>{w}</li>)}</ul> : null}
      {attach ? null : <div className="dpx-rxv-pick"><button type="button" onClick={()=>setPick("account")}><Ic n="wallet" /><span><small>Dompet</small><b>{account}</b></span><Ic n="chev" size="sm" /></button><button type="button" onClick={()=>setPick("category")}><Ic n="tag" /><span><small>Kategori</small><b>{catOf(fin.state,categoryId).name}</b></span><Ic n="chev" size="sm" /></button></div>}
    </fieldset>
    </> : <>
    <section className="dpx-rxv-card">
      <header><span className="dpx-rxv-logo"><Ic n="receipt" /></span><div><b>{doc.merchant || "Toko belum terbaca"}</b>{doc.merchantAddress ? <small>{doc.merchantAddress}</small> : null}</div></header>
      <div className="dpx-rxv-meta"><div><span>{when}</span>{doc.reference ? <small>No. {doc.reference}</small> : null}</div></div>
      <ul className="dpx-rxv-items">{doc.items.map((i,k)=><li key={k}><div><b>{i.name || "Item"}</b>{i.confidence < .7 ? <em>periksa</em> : null}<small>{i.qty ?? 1}{i.unit ? ` ${i.unit}` : " ×"}{i.unitPrice !== null ? ` · ${rupiah(i.unitPrice)}` : ""}{i.discount ? ` · diskon ${rupiah(i.discount)}` : ""}</small>{i.components.length ? <small className="dpx-rxv-sub">{i.components.map(c=>c.name).join(" · ")}</small> : null}</div><span>{money(i.price)}</span></li>)}</ul>
      <dl className="dpx-rxv-sum">
        <div><dt>Subtotal</dt><dd>{rupiah(totals.itemSum)}</dd></div>
        {doc.discount ? <div><dt>Diskon</dt><dd>−{rupiah(doc.discount)}</dd></div> : null}
        {doc.charges.map((c,k)=><div key={k} className={c.included ? "inc" : ""}><dt>{c.label || "Biaya"}{c.included ? " (termasuk)" : ""}</dt><dd>{money(c.amount)}</dd></div>)}
        <div className="tot"><dt>Total</dt><dd>{rupiah(doc.total)}</dd></div>
      </dl>
      {doc.paymentMethod || doc.tendered ? <footer><span>{doc.paymentMethod || "Tunai"}</span>{doc.tendered ? <span>Dibayar {rupiah(doc.tendered)}</span> : null}</footer> : null}
    </section>
    <div className={`dpx-rxv-verdict ${totals.valid ? "ok" : "bad"}`} role="status"><i />{totals.valid ? "Total cocok dengan struk" : `Belum cocok · selisih ${rupiah(totals.difference)}`}</div>
    {totals.problems.length || doc.warnings.length ? <ul className="dpx-rxv-warn">{[...totals.problems,...doc.warnings].map((w,k)=><li key={k}>{w}</li>)}</ul> : null}
    {attach ? null : <div className="dpx-rxv-pick"><button type="button" onClick={()=>setPick("account")}><Ic n="wallet" /><span><small>Dompet</small><b>{account}</b></span><Ic n="chev" size="sm" /></button><button type="button" onClick={()=>setPick("category")}><Ic n="tag" /><span><small>Kategori</small><b>{catOf(fin.state,categoryId).name}</b></span><Ic n="chev" size="sm" /></button></div>}
    <div className="dpx-rxv-photo"><img src={photoSrc} alt="Foto struk asli" /><span><b>Foto asli</b><small>Terlampir di catatan ini</small></span></div>
    <button type="button" className="dpx-rxv-edit" onClick={()=>setEditing(true)}><Ic n="edit" size="sm" /> Ubah rincian</button>
    </>}
  </RxScreen>;
}

export function ReceiptBreakdown({ receipt }: { receipt: ReceiptDocument }) {
  const sum = reconcileReceipt(receipt);
  const rows: BreakdownRow[] = [{ label: "Jumlah item", value: rupiah(sum.itemSum) }];
  if (receipt.subtotal !== null) rows.push({ label: `Subtotal pada struk${receipt.subtotalBeforeItemDiscounts ? " (sebelum diskon item)" : ""}`, value: rupiah(receipt.subtotal) });
  if (receipt.discount) rows.push({ label: "Diskon struk", value: `\u2212${rupiah(receipt.discount)}` });
  for (const c of receipt.charges) rows.push({ label: `${c.label}${c.included ? " (termasuk harga)" : ""}`, value: moneyText(c.amount) });
  rows.push({ label: "Total pada struk", value: rupiah(receipt.total), strong: true });
  if (receipt.tendered !== null) rows.push({ label: "Uang dibayar", value: rupiah(receipt.tendered) });
  if (receipt.change !== null) rows.push({ label: "Kembalian", value: rupiah(receipt.change) });
  return <Breakdown title="Rincian struk" count={`${receipt.items.length} item`}
    lines={receipt.items.map(i => ({
      name: i.name || "Belum terbaca",
      sub: `${i.qty === null ? "Kuantitas belum terbaca" : `${i.qty.toLocaleString("id-ID")}${i.unit ? ` ${i.unit}` : ""}`}${i.unitPrice !== null ? ` \u00d7 ${rupiah(i.unitPrice)}` : ""}${i.discount ? ` \u00b7 diskon \u2212${rupiah(i.discount)}` : ""}`,
      subs: i.components.map(c => `${c.qty !== null ? `${c.qty} \u00d7 ` : ""}${c.name}`),
      amount: i.price === null ? "\u2014" : rupiah(i.price),
    }))}
    rows={rows} empty="Rincian item belum tersedia pada pembacaan ini.">
    {receipt.reference || receipt.paymentMethod || receipt.merchantAddress ? <p className="dpx-hint">{[receipt.reference ? `No. struk ${receipt.reference}` : "", receipt.paymentMethod ? `Bayar: ${receipt.paymentMethod}` : "", receipt.merchantAddress].filter(Boolean).join(" \u00b7 ")}</p> : null}
    {!sum.valid ? <div className="dpx-note dpx-warn"><div>Rincian lama belum cocok atau belum lengkap. Saldo tidak diubah otomatis.<ul>{sum.problems.map((p, k) => <li key={k}>{p}</li>)}</ul></div></div> : null}
    {receipt.warnings.length ? <div className="dpx-hint">{receipt.warnings.join(" \u00b7 ")}</div> : null}
  </Breakdown>;
}

/** Load the durable document, not just the image, including on another device. */
export function ReceiptAttachment({ id, onEdit, ledgerAmount }: { id: string; onEdit?: (receipt: ScannedReceipt)=>void; ledgerAmount?: number }) {
  const [rereading,setRereading]=useState(false);
  const [receipt,setReceipt]=useState<ScannedReceipt|null>(null), [error,setError]=useState(""), [imageFailed,setImageFailed]=useState(false), [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setError("");setReceipt(null);void fetchReceipt(id).then(r=>{if(active)setReceipt(r);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[id,attempt]);
  return <>
    {!receipt && !error ? <p role="status">Memuat rincian struk…</p> : null}
    {error ? <div className="dpx-note dpx-warn" role="alert"><div>{error}<Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={()=>setAttempt(a=>a+1)}>Coba lagi</Btn></div></div> : null}
    {receipt ? <><p className="dpx-sub">{receipt.merchant} · {receipt.purchasedAt ? formatDateTime(receipt.purchasedAt) : "Tanggal belum terbaca"}</p><ReceiptBreakdown receipt={receipt} />{ledgerAmount !== undefined && receipt.total > 0 && Math.abs(ledgerAmount - receipt.total) > 0.5 ? <div className="dpx-note dpx-warn" role="status"><div><b>Nominal catatan berbeda</b>Catatan ini tercatat {rupiah(ledgerAmount)}, sedangkan total pada struk {rupiah(receipt.total)}. Ketuk Ubah rincian untuk menyamakannya.</div></div> : null}{onEdit ? <div className="dpx-rb-actions"><Btn type="button" className="dpx-btn dpx-soft" onClick={()=>onEdit(receipt)}><Ic n="edit" size="sm" /> Ubah rincian</Btn><Btn type="button" className="dpx-btn dpx-soft" disabled={rereading} onClick={async()=>{if(rereading)return;setRereading(true);try{onEdit(await rereadReceipt(id));}catch(e){setError(e instanceof Error?e.message:"Belum dapat dibaca ulang.");}finally{setRereading(false);}}}>{rereading ? "Membaca ulang…" : "Baca ulang foto"}</Btn></div> : null}</> : null}
    <details className="dpx-receipt-photo"><summary>Foto struk asli</summary>{imageFailed ? <p role="status">Foto belum dapat dimuat. <button type="button" onClick={()=>setImageFailed(false)}>Coba lagi</button></p> : <img src={receiptImageUrl(id)} alt="Foto struk asli" onError={()=>setImageFailed(true)} />}</details>
  </>;
}
