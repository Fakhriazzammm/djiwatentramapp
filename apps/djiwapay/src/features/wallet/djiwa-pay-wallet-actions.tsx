import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Copy, Download, ScanLine, Share2, WalletCards } from "lucide-react";
import type { CustomerProfile } from "../../lib/identity-adapter";
import { DjiwaPayPageHeader } from "./djiwa-pay-page-header";
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

  const title = mode === "send" ? "Kirim Saldo" : mode === "withdraw" ? "Tarik Dana" : "Terima Saldo";
  const subtitle = mode === "send" ? "Transfer ke sesama pengguna Djiwa Pay." : mode === "withdraw" ? "Kirim permintaan pencairan ke rekening Anda." : "Bagikan QR atau nomor HP untuk menerima transfer.";

  return <main className="pay-page wallet-action-page">
    <DjiwaPayPageHeader title={title} subtitle={subtitle} onBack={onClose} />
    <section className="wallet-action-sheet" aria-label={title}>
      {mode === "withdraw" ? <>
        <div className="wallet-action-intro"><span className="wallet-action-icon receive"><ArrowDownLeft size={20} /></span><div><strong>Tarik saldo ke rekening</strong><small>Permintaan akan ditinjau admin. Saldo belum dipotong sampai disetujui.</small></div></div>
        <label className="wallet-action-field"><span>Nama bank</span><input value={bankName} onChange={(event) => setBankName(event.currentTarget.value.slice(0, 80))} placeholder="Contoh: BCA" autoComplete="organization" /></label>
        <label className="wallet-action-field"><span>Nomor rekening</span><input value={accountNumber} inputMode="numeric" onChange={(event) => setAccountNumber(event.currentTarget.value.replace(/\D/g, "").slice(0, 30))} placeholder="Minimal 6 digit" autoComplete="off" /></label>
        <label className="wallet-action-field"><span>Nama pemilik rekening</span><input value={accountName} onChange={(event) => setAccountName(event.currentTarget.value.slice(0, 120))} placeholder="Sesuai rekening bank" autoComplete="name" /></label>
        <label className="wallet-action-field"><span>Nominal penarikan</span><div className="wallet-action-amount"><b>Rp</b><input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} placeholder="10000" /></div><small>Minimal Rp10.000 · saldo tersedia {money(balance)}</small></label>
        <label className="wallet-action-field"><span>Catatan <em>opsional</em></span><input value={note} onChange={(event) => setNote(event.currentTarget.value.slice(0, 120))} placeholder="Catatan untuk admin" maxLength={120} /></label>
        {message ? <p className="wallet-action-message" role="alert">{message}</p> : null}
        <button type="button" className="primary-action" onClick={() => void submitWithdrawal()} disabled={busy}>{busy ? "Mengirim permintaan..." : `Tarik ${amount ? money(Number(amount)) : "saldo"}`}</button>
      </> : mode === "send" ? <>
        <div className="wallet-action-intro"><span className="wallet-action-icon send"><ArrowUpRight size={20} /></span><div><strong>Kirim ke customer Djiwa Pay</strong><small>Masukkan nomor HP atau pindai QR penerima. Nama penerima selalu dicek sebelum saldo dikirim.</small></div></div>
        <div className="ios-segmented-control wallet-action-mode" role="group" aria-label="Metode transfer">
          <button type="button" className={transferMode === "phone" ? "is-active" : ""} aria-pressed={transferMode === "phone"} onClick={() => selectTransferMode("phone")}>Nomor HP</button>
          <button type="button" className={transferMode === "scan" ? "is-active" : ""} aria-pressed={transferMode === "scan"} onClick={() => selectTransferMode("scan")}>Scan QR</button>
        </div>
        {transferMode === "scan" ? <DjiwaPayWalletScanner onDetected={handleScan} onUseManual={() => selectTransferMode("phone")} notice={scanNotice} /> : <>
          <label className="wallet-action-field"><span>Nomor HP penerima</span><div className="wallet-action-recipient"><input value={recipient} onChange={(event) => { setRecipient(event.currentTarget.value.replace(/[^\d+\s-]/g, "")); setVerifiedRecipient(null); }} placeholder="08xxxxxxxxxx" inputMode="tel" autoComplete="tel" /><button type="button" className="secondary-action" onClick={() => void checkRecipient()} disabled={checkingRecipient}>{checkingRecipient ? "Mengecek..." : "Cek penerima"}</button></div><small>Pastikan nama penerima sesuai sebelum mengirim saldo.</small></label>
          {verifiedRecipient ? <div className="wallet-recipient-verified" role="status"><span>✓</span><div><small>Penerima terverifikasi</small><strong>{verifiedRecipient.name}</strong><em>{formatWalletPhone(recipient)}</em></div></div> : null}
          <p className="wallet-action-helper wallet-action-scan-hint"><ScanLine size={14} />Punya QR Djiwa Pay? Pilih <b>Scan QR</b> di atas.</p>
          <label className="wallet-action-field"><span>Nominal transfer</span><div className="wallet-action-amount"><b>Rp</b><input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} placeholder="1000" /></div><small>Minimal Rp1.000 · saldo tersedia {money(balance)}</small></label>
          <label className="wallet-action-field"><span>Catatan <em>opsional</em></span><input value={note} onChange={(event) => setNote(event.currentTarget.value.slice(0, 120))} placeholder="Misalnya: patungan makan" maxLength={120} /></label>
          {message ? <p className="wallet-action-message" role="alert">{message}</p> : null}
          <button type="button" className="primary-action" onClick={() => void submit()} disabled={busy || !verifiedRecipient}>{busy ? "Memproses transfer..." : `Kirim ${amount ? money(Number(amount)) : "saldo"}`}</button>
        </>}
      </> : <>
        <div className="wallet-action-intro"><span className="wallet-action-icon receive"><ArrowDownLeft size={20} /></span><div><strong>QR penerimaan Anda</strong><small>Penerima cukup memindai QR ini dari menu Kirim → Scan QR. Nomor HP tetap bisa dibagikan manual.</small></div></div>
        {receivePhone ? <>
          <div className="wallet-qr-card">
            <div className="wallet-qr-code" role="img" aria-label={`QR penerimaan Djiwa Pay untuk ${profile.name || "akun ini"}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="wallet-qr-identity"><small>QR PENERIMAAN</small><strong>{profile.name || "Customer Djiwa"}</strong><span>{formatWalletPhone(profile.phone || receivePhone)}</span></div>
            <p className="wallet-qr-hint"><ScanLine size={14} />Pindai lewat menu Kirim → Scan QR.</p>
          </div>
          <div className="wallet-qr-actions">
            <button type="button" className="primary-action" onClick={() => void shareQr()}><Share2 size={16} />Bagikan QR</button>
            <button type="button" className="secondary-action" onClick={() => void downloadQr()}><Download size={16} />Unduh QR</button>
          </div>
          <div className="wallet-receive-card"><WalletCards size={24} /><span><small>Nomor HP penerima</small><strong>{formatWalletPhone(profile.phone || receivePhone)}</strong></span><button type="button" onClick={() => void copy(profile.phone || "")} aria-label="Salin nomor HP penerima"><Copy size={17} /></button></div>
        </> : <div className="wallet-action-message" role="alert">Nomor HP belum tersedia. Lengkapi nomor HP di profil agar bisa menerima saldo.</div>}
        {message ? <p className="wallet-action-message" role="alert">{message}</p> : null}
        <p className="wallet-action-helper">QR hanya berisi nomor HP penerima. Nama akun tetap diverifikasi sebelum saldo dikirim.</p>
      </>}
    </section>
  </main>;
}
