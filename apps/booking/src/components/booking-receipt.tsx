import { Check, Copy, Printer, RefreshCw } from "lucide-react";
import type { BookingResult } from "../lib/client";
import { currency, formatDate } from "../lib/booking-formatters";
import { useState } from "react";

type BookingReceiptProps = {
  result: BookingResult;
  onRetry: () => void;
  loading: boolean;
};

type ReceiptState = "paid" | "pending" | "failed" | "expired" | "cancelled";

function receiptState(paymentStatus: string): ReceiptState {
  const normalized = paymentStatus.toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "failed") return "failed";
  if (normalized === "expired") return "expired";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "pending";
}

const receiptCopy: Record<ReceiptState, { eyebrow: string; title: string; description: string }> = {
  paid: { eyebrow: "Pembayaran terverifikasi", title: "Booking siap digunakan", description: "Simpan bukti ini saat datang ke lokasi." },
  pending: { eyebrow: "Menunggu pembayaran", title: "Booking tercatat", description: "Selesaikan pembayaran, lalu cek kembali statusnya." },
  failed: { eyebrow: "Pembayaran gagal", title: "Booking belum terbayar", description: "Pembayaran belum berhasil. Periksa metode pembayaran atau hubungi kami." },
  expired: { eyebrow: "Pembayaran kedaluwarsa", title: "Booking belum terbayar", description: "Batas waktu pembayaran telah lewat. Hubungi kami untuk bantuan." },
  cancelled: { eyebrow: "Pembayaran dibatalkan", title: "Booking belum terbayar", description: "Pembayaran dibatalkan dan booking belum dapat digunakan." },
};

function ReceiptPaper({ result }: { result: BookingResult }) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

  async function copyBookingCode() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard tidak tersedia");
      await navigator.clipboard.writeText(result.bookingCode);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }
  const total = result.totalAmount ?? result.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const state = receiptState(result.paymentStatus);
  const paid = state === "paid";
  const copy = receiptCopy[state];

  return (
    <article className={`booking-receipt-paper ${paid ? "is-paid" : "is-pending"}`} data-receipt-export-root="true">
      <div className="booking-receipt-edge" aria-hidden="true" />
      <header className="booking-receipt-header">
        <div className={`booking-receipt-status-icon ${paid ? "is-paid" : "is-pending"}`} aria-hidden="true">
          {paid ? <Check size={20} strokeWidth={3} /> : <span>!</span>}
        </div>
        <span className="eyebrow">{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </header>

      <div className="booking-receipt-code">
        <span>Kode booking</span>
        <strong>{result.bookingCode}</strong>
        <button type="button" onClick={() => { void copyBookingCode(); }}>
          <Copy size={14} /> {copyState === "success" ? "Tersalin" : copyState === "error" ? "Gagal menyalin" : "Salin kode"}
        </button>
        {copyState === "error" && <span role="status">Salin kode tidak tersedia di perangkat ini.</span>}
      </div>

      <div className="receipt-meta">
        <div><span>Tanggal</span><strong>{formatDate(result.date)}</strong></div>
        <div><span>Jam datang</span><strong>{result.arrivalTime || "—"}</strong></div>
        <div><span>Tamu</span><strong>{result.guests}</strong></div>
        <div><span>Meja</span><strong>{result.tableCount}</strong></div>
      </div>

      <div className="receipt-lines">
        <div className="receipt-heading"><span>Menu</span><span>Total</span></div>
        {result.items.map((item, index) => (
          <div className="line" key={`${item.productId}-${index}`}>
            <span>{item.quantity} × {item.name}<small>{currency(item.price)} / item</small></span>
            <strong>{currency(item.price * item.quantity)}</strong>
          </div>
        ))}
      </div>
      <div className="total receipt-total"><span>Total pembayaran</span><strong>{currency(total)}</strong></div>
      <p className="receipt-note">Sumber status: verifikasi pembayaran booking.</p>
    </article>
  );
}

export function BookingReceipt({ result, onRetry, loading }: BookingReceiptProps) {
  const state = receiptState(result.paymentStatus);
  const paid = state === "paid";
  return (
    <div className="booking-receipt-shell">
      <ReceiptPaper result={result} />
      <div className="booking-receipt-actions">
        {paid ? <button type="button" className="button secondary" onClick={() => window.print()}><Printer size={16} /> Cetak / simpan PDF</button> : state === "pending" ? <button type="button" className="button secondary" onClick={onRetry} disabled={loading}><RefreshCw size={16} /> {loading ? "Memperbarui…" : "Coba lagi"}</button> : null}
      </div>
    </div>
  );
}
