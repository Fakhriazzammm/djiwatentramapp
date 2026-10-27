import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Copy, Share2, WalletCards } from "lucide-react";
import type { CustomerProfile } from "../../lib/identity-adapter";
import { DjiwaPayPageHeader } from "./djiwa-pay-page-header";
import { requestWalletWithdrawal, resolveWalletRecipient, transferWallet } from "../../lib/wallet-adapter";
import { validateWalletWithdrawal } from "../../lib/djiwa-pay-withdrawal";
import { buildWalletReceivePayload, normalizeWalletPhone, validateWalletTransfer } from "../../lib/djiwa-pay-transfer";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

type Props = {
  mode: "send" | "receive" | "withdraw";
  profile: CustomerProfile;
  balance: number;
  onClose: () => void;
  onSuccess: (message?: string) => void;
  initialRecipient?: string;
};

export function DjiwaPayWalletAction({ mode, profile, balance, onClose, onSuccess, initialRecipient = "" }: Props) {
  const [recipient, setRecipient] = useState(initialRecipient);
  const [verifiedRecipient, setVerifiedRecipient] = useState<{ phone: string; name: string } | null>(null);
  const [checkingRecipient, setCheckingRecipient] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const receivePhone = normalizeWalletPhone(profile.phone || "");
  const receivePayload = useMemo(() => buildWalletReceivePayload(receivePhone), [receivePhone]);

  const copy = async (value: string) => {
    try { await navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setMessage("Salin manual nomor HP penerima di bawah."); }
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

  const checkRecipient = async () => {
    const phone = normalizeWalletPhone(recipient);
    const validation = validateWalletTransfer({ recipient, amount: 1000, note: "" });
    if (!validation.valid && !phone) { setMessage(validation.message); return; }
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
  const subtitle = mode === "send" ? "Transfer ke sesama pengguna Djiwa Pay." : mode === "withdraw" ? "Kirim permintaan pencairan ke rekening Anda." : "Bagikan detail akun untuk menerima transfer.";

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
        <div className="wallet-action-intro"><span className="wallet-action-icon send"><ArrowUpRight size={20} /></span><div><strong>Kirim ke customer Djiwa Pay</strong><small>Transfer internal diproses langsung dan aman.</small></div></div>
        <label className="wallet-action-field"><span>Nomor HP penerima</span><div className="wallet-action-recipient"><input value={recipient} onChange={(event) => { setRecipient(event.currentTarget.value.replace(/[^\d+\s-]/g, "")); setVerifiedRecipient(null); }} placeholder="08xxxxxxxxxx" inputMode="tel" autoComplete="tel" /><button type="button" className="secondary-action" onClick={() => void checkRecipient()} disabled={checkingRecipient}>{checkingRecipient ? "Mengecek..." : "Cek penerima"}</button></div><small>Pastikan nama penerima sesuai sebelum mengirim saldo.</small></label>
        {verifiedRecipient ? <div className="wallet-recipient-verified" role="status"><span>✓</span><div><small>Penerima terverifikasi</small><strong>{verifiedRecipient.name}</strong><em>{recipient}</em></div></div> : null}
        <label className="wallet-action-field"><span>Nominal transfer</span><div className="wallet-action-amount"><b>Rp</b><input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} placeholder="1000" /></div><small>Minimal Rp1.000 · saldo tersedia {money(balance)}</small></label>
        <label className="wallet-action-field"><span>Catatan <em>opsional</em></span><input value={note} onChange={(event) => setNote(event.currentTarget.value.slice(0, 120))} placeholder="Misalnya: patungan makan" maxLength={120} /></label>
        {message ? <p className="wallet-action-message" role="alert">{message}</p> : null}
        <button type="button" className="primary-action" onClick={() => void submit()} disabled={busy || !verifiedRecipient}>{busy ? "Memproses transfer..." : `Kirim ${amount ? money(Number(amount)) : "saldo"}`}</button>
      </> : <>
        <div className="wallet-action-intro"><span className="wallet-action-icon receive"><ArrowDownLeft size={20} /></span><div><strong>Bagikan nomor HP Anda</strong><small>Pengirim akan mengecek nama Anda sebelum mengirim saldo.</small></div></div>
        {receivePhone ? <div className="wallet-receive-card"><WalletCards size={24} /><span><small>Nomor HP penerima</small><strong>{profile.phone}</strong></span><button type="button" onClick={() => void copy(profile.phone || "")} aria-label="Salin nomor HP penerima"><Copy size={17} /></button></div> : <div className="wallet-action-message" role="alert">Nomor HP belum tersedia. Lengkapi nomor HP di profil agar bisa menerima saldo.</div>}
        {receivePhone ? <><div className="wallet-receive-payload"><small>Payload QR / scanner</small><code>{receivePayload}</code></div><div className="wallet-action-buttons"><button type="button" className="secondary-action" onClick={() => void copy(receivePayload)}><Copy size={16} />{copied ? "Tersalin" : "Salin payload"}</button><button type="button" className="primary-action" onClick={() => { if (navigator.share) void navigator.share({ title: "Djiwa Pay", text: `Kirim saldo ke nomor HP ${profile.phone}`, url: receivePayload }); else void copy(receivePayload); }}><Share2 size={16} />Bagikan</button></div></> : null}
        <p className="wallet-action-helper">Nomor HP digunakan untuk menemukan akun dan menampilkan nama penerima sebelum transfer.</p>
      </>}
    </section>
  </main>;
}

