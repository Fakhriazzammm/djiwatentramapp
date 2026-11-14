import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerProfile } from "../../lib/identity-adapter";
import { Btn, Header, Ic, Screen, Seg, Sky } from "../shell/dpx-ui";
import { DjiwaPayWalletScanner } from "./djiwa-pay-wallet-scanner";
import { requestWalletWithdrawal, resolveWalletRecipient, transferWallet } from "../../lib/wallet-adapter";
import { validateWalletWithdrawal } from "../../lib/djiwa-pay-withdrawal";
import { buildWalletReceivePayload, formatWalletPhone, normalizeWalletPhone, parseWalletRecipientPayload, validateWalletTransfer } from "../../lib/djiwa-pay-transfer";
import { buildWalletQrPng, buildWalletQrSvg } from "../../lib/djiwa-pay-qr";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

type Props = {
  mode: "send" | "receive" | "withdraw";
  profile: CustomerProfile;
  balance: number;
  onClose: () => void;
  onSuccess: (message?: string) => void;
  initialRecipient?: string;
  initialMode?: "phone" | "scan";
};

export function DjiwaPayWalletAction({ mode, profile, balance, onClose, onSuccess, initialRecipient = "", initialMode = "phone" }: Props) {
  const [recipient, setRecipient] = useState(initialRecipient);
  const [transferMode, setTransferMode] = useState<"phone" | "scan">(initialMode);
  const [verifiedRecipient, setVerifiedRecipient] = useState<{ phone: string; name: string } | null>(null);
  const [checkingRecipient, setCheckingRecipient] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const initialCheckDone = useRef(false);
  const receivePhone = normalizeWalletPhone(profile.phone || "");
  const receivePayload = useMemo(() => buildWalletReceivePayload(receivePhone), [receivePhone]);
  const qrSvg = useMemo(() => receivePhone ? buildWalletQrSvg(receivePayload) : "", [receivePayload, receivePhone]);

  const copy = async (value: string) => {
    try { await navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setMessage("Salin manual nomor HP penerima di bawah."); }
  };

  const checkRecipient = async (value = recipient) => {
    const phone = normalizeWalletPhone(value);
    if (!/^628\d{8,11}$/.test(phone)) { setMessage("Nomor HP harus berupa nomor Indonesia yang valid."); return; }
    setCheckingRecipient(true); setMessage(null); setVerifiedRecipient(null);
    try {
      const result = await resolveWalletRecipient(phone);
      setVerifiedRecipient({ phone, name: result.recipient?.name || "Customer Djiwa" });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "RECIPIENT_NOT_FOUND";
      setMessage(code === "RECIPIENT_AMBIGUOUS" ? "Nomor HP terdaftar lebih dari satu akun. Gunakan nomor lain." : "Penerima tidak ditemukan. Pastikan nomor HP sudah terdaftar di Djiwa Pay.");
    } finally { setCheckingRecipient(false); }
  };

  useEffect(() => {
    if (initialCheckDone.current || mode !== "send" || !initialRecipient) return;
    initialCheckDone.current = true;
    void checkRecipient(initialRecipient);
  }, [initialRecipient, mode]);

  const selectTransferMode = (next: "phone" | "scan") => {
    setTransferMode(next);
    setScanNotice(null);
    setMessage(null);
  };

  const handleScan = (value: string) => {
    const phone = parseWalletRecipientPayload(value);
    if (!phone) {
      setScanNotice("QR ini bukan QR Djiwa Pay. Minta penerima membuka halaman Terima Saldo dan tampilkan QR-nya.");
      return false;
    }
    setScanNotice(null);
    setRecipient(phone);
    setVerifiedRecipient(null);
    setMessage(null);
    setTransferMode("phone");
    void checkRecipient(phone);
    return true;
  };

  const qrFile = async () => {
    const png = await buildWalletQrPng(receivePayload);
    return png
      ? { body: png, type: "image/png", extension: "png" }
      : { body: new Blob([qrSvg], { type: "image/svg+xml" }), type: "image/svg+xml", extension: "svg" };
  };

  const downloadQr = async () => {
    if (!qrSvg || !receivePhone) return;
    try {
      const file = await qrFile();
      const url = URL.createObjectURL(file.body);
      const link = document.createElement("a");
      link.href = url;
      link.download = `djiwa-qr-${receivePhone}.${file.extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setMessage("QR belum dapat diunduh. Gunakan Salin nomor HP."); }
  };

  const shareQr = async () => {
    if (!qrSvg || !receivePhone) return;
    const text = `Pindai QR ini untuk mengirim saldo ke ${profile.name || "akun Djiwa Pay"} (${profile.phone || receivePhone}).`;
    try {
      const data = await qrFile();
      const file = new File([data.body], `djiwa-qr-${receivePhone}.${data.extension}`, { type: data.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "QR Djiwa Pay", text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "QR Djiwa Pay", text, url: receivePayload });
        return;
      }
      await downloadQr();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      await downloadQr();
    }
  };

  const submit = async () => {
    const validation = validateWalletTransfer({ recipient, amount: Number(amount), note });
    if (!validation.valid) { setMessage(validation.message); return; }
    if (!verifiedRecipient || verifiedRecipient.phone !== normalizeWalletPhone(recipient)) { setMessage("Cek nomor HP penerima terlebih dahulu."); return; }
    if (Number(amount) > balance) { setMessage(`Saldo tersedia ${money(balance)}.`); return; }
    setBusy(true); setMessage(null);
    try { await transferWallet(recipient, Number(amount), note); onSuccess(); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "TRANSFER_FAILED";
      setMessage(code === "RECIPIENT_NOT_FOUND" ? "Penerima tidak ditemukan. Pastikan nomor HP sudah terdaftar di Djiwa Pay." : code === "RECIPIENT_AMBIGUOUS" ? "Nomor HP terdaftar lebih dari satu akun. Gunakan nomor lain." : code === "INSUFFICIENT_BALANCE" ? `Saldo tersedia ${money(balance)}.` : code === "SELF_TRANSFER" ? "Tidak dapat transfer ke wallet sendiri." : "Transfer belum berhasil. Coba lagi.");
    } finally { setBusy(false); }
  };

  const submitWithdrawal = async () => {
    const draft = { amount: Number(amount), bankName, accountNumber, accountName, note };
    const validation = validateWalletWithdrawal(draft);
    if (!validation.valid) { setMessage(validation.message); return; }
    if (draft.amount > balance) { setMessage(`Saldo tersedia ${money(balance)}.`); return; }
    setBusy(true); setMessage(null);
    try { await requestWalletWithdrawal(draft); onSuccess("Permintaan tarik dana masuk review. Saldo belum dipotong."); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "WITHDRAWAL_REQUEST_FAILED";
      setMessage(code === "INSUFFICIENT_BALANCE" ? `Saldo tersedia ${money(balance)}.` : code === "INVALID_INPUT" ? "Periksa kembali data rekening dan nominal." : "Permintaan tarik dana belum berhasil. Coba lagi.");
    } finally { setBusy(false); }
  };

  const title = mode === "send" ? "Kirim saldo" : mode === "withdraw" ? "Tarik dana" : "Terima saldo";
  const amountNumber = Number(amount);
  const phoneReady = Boolean(verifiedRecipient);
  const wrap = (content: React.ReactNode, cta?: React.ReactNode) => <Screen><Sky><div className="dpx-pad dpx-nobar" style={{ paddingBottom: cta ? 170 : 60 }}><Header title={title} onBack={onClose} />{content}</div>{cta ? <div className="dpx-sticky">{cta}</div> : null}</Sky></Screen>;
  const err = message ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{message}</div></div> : null;
  const amountField = (placeholder: string, hint: string) => <><div className="dpx-bigamt"><b>Rp</b><input aria-label="Nominal" value={amount ? Number(amount).toLocaleString("id-ID") : ""} inputMode="numeric" onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} placeholder={placeholder} /></div><p className="dpx-hint dpx-center">{hint}</p></>;

  if (mode === "withdraw") return wrap(<>
    <div className="dpx-center"><div className="dpx-sub">Saldo dapat ditarik</div><div className="dpx-money" style={{ fontSize: 22 }}>{money(balance)}</div></div>
    <div className="dpx-note dpx-info"><Ic n="info" /><div><b>Tarik saldo ke rekening</b>Permintaan akan ditinjau admin. Saldo belum dipotong sampai disetujui.</div></div>
    <label className="dpx-field"><span>Nama bank</span><div className="dpx-input"><input value={bankName} onChange={(event) => setBankName(event.currentTarget.value.slice(0, 80))} placeholder="Contoh: BCA" autoComplete="organization" /></div></label>
    <label className="dpx-field"><span>Nomor rekening</span><div className="dpx-input"><input value={accountNumber} inputMode="numeric" onChange={(event) => setAccountNumber(event.currentTarget.value.replace(/\D/g, "").slice(0, 30))} placeholder="Minimal 6 digit" autoComplete="off" /></div></label>
    <label className="dpx-field"><span>Nama pemilik rekening</span><div className="dpx-input"><input value={accountName} onChange={(event) => setAccountName(event.currentTarget.value.slice(0, 120))} placeholder="Sesuai rekening bank" autoComplete="name" /></div></label>
    <label className="dpx-field"><span>Nominal penarikan</span><div className="dpx-input"><b>Rp</b><input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} placeholder="10000" /></div><div className="dpx-hint">Minimal Rp10.000 · saldo tersedia {money(balance)}</div></label>
    <label className="dpx-field"><span>Catatan <em>opsional</em></span><div className="dpx-input"><input value={note} onChange={(event) => setNote(event.currentTarget.value.slice(0, 120))} placeholder="Catatan untuk admin" maxLength={120} /></div></label>
    {err}
  </>, <Btn type="button" className={`dpx-btn ${busy ? "dpx-off" : ""}`} onClick={() => void submitWithdrawal()} disabled={busy}>{busy ? "Mengirim permintaan..." : `Tarik ${amount ? money(amountNumber) : "saldo"}`}</Btn>);

  if (mode === "send" && transferMode === "scan") return <DjiwaPayWalletScanner onDetected={handleScan} onUseManual={() => selectTransferMode("phone")} notice={scanNotice} />;

  if (mode === "send") return wrap(<>
    <Seg id="send" label="Metode transfer" value="phone" onChange={(v) => selectTransferMode(v)} options={[["phone", "Nomor HP"], ["scan", "Scan QR"]] as const} />
    <label className="dpx-field"><span>Nomor HP penerima</span><div className="dpx-input"><Ic n="phone" size="sm" /><input value={recipient} onChange={(event) => { setRecipient(event.currentTarget.value.replace(/[^\d+\s-]/g, "")); setVerifiedRecipient(null); }} placeholder="0857 1122 3344" inputMode="tel" autoComplete="tel" /><Btn type="button" className="dpx-btn dpx-sm" style={{ minHeight: 36 }} onClick={() => void checkRecipient()} disabled={checkingRecipient}>{checkingRecipient ? "Mengecek…" : "Cek"}</Btn></div></label>
    {verifiedRecipient ? <div className="dpx-note dpx-ok" role="status" style={{ marginTop: 10 }}><Ic n="check" /><div><b>{verifiedRecipient.name}</b>Terverifikasi · {formatWalletPhone(recipient)}</div></div> : <div className="dpx-hint">Tekan Cek untuk memastikan nama penerima sebelum kirim.</div>}
    {phoneReady ? <>{amountField("0", `Saldo tersedia ${money(balance)} · min. Rp1.000`)}
    <label className="dpx-field"><span>Catatan <em>opsional</em></span><div className="dpx-input"><input value={note} onChange={(event) => setNote(event.currentTarget.value.slice(0, 120))} placeholder="Misalnya: patungan makan" maxLength={120} /></div></label></> : null}
    {err}
  </>, <Btn type="button" className={`dpx-btn ${busy || !verifiedRecipient ? "dpx-off" : ""}`} onClick={() => void submit()} disabled={busy || !verifiedRecipient}>{busy ? "Memproses transfer..." : `Kirim ${amount ? money(amountNumber) : "saldo"}`}</Btn>);

  return wrap(<>
    <div className="dpx-seg" role="group" aria-label="Tampilan penerimaan"><Btn type="button" className="dpx-on" aria-pressed="true">Kode QR</Btn><Btn type="button" aria-pressed="false" onClick={() => void copy(profile.phone || receivePhone)}>{copied ? "Nomor tersalin" : "Salin nomor HP"}</Btn></div>
    {receivePhone ? <>
      <div className="dpx-qrbox" style={{ marginTop: 22 }} role="img" aria-label={`QR penerimaan Djiwa Pay untuk ${profile.name || "akun ini"}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div className="dpx-center dpx-mt"><b style={{ fontSize: 19 }}>{profile.name || "Customer Djiwa"}</b><div className="dpx-sub">{formatWalletPhone(profile.phone || receivePhone)}</div><div className="dpx-sub">Pindai lewat menu Kirim → Scan QR</div></div>
      <div className="dpx-note dpx-info"><Ic n="shield" /><div>QR hanya berisi nomor HP penerima. Nama akun tetap diverifikasi sebelum saldo dikirim.</div></div>
    </> : <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>Nomor HP belum tersedia. Lengkapi nomor HP di profil agar bisa menerima saldo.</div></div>}
    {err}
  </>, receivePhone ? <div className="dpx-flex"><Btn type="button" className="dpx-btn dpx-ghost" style={{ margin: 0 }} onClick={() => void downloadQr()}><Ic n="down" size="sm" /> Unduh</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={() => void shareQr()}><Ic n="share" size="sm" /> Bagikan</Btn></div> : undefined);
}
