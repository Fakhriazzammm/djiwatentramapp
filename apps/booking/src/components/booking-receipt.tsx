import { Check, Copy, Printer, RefreshCw } from "lucide-react";
import type { BookingResult } from "../lib/client";
import { currency, formatDate } from "../lib/booking-formatters";
import { useState } from "react";

type BookingReceiptProps = {
  result: BookingResult;
  onRetry: () => void;
  loading: boolean;
};

function ReceiptPaper({ result }: { result: BookingResult }) {
  const [copied, setCopied] = useState(false);
  const total = result.totalAmount ?? result.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const paid = result.paymentStatus.toLowerCase() === "paid";

  return (
    <article className={`booking-receipt-paper ${paid ? "is-paid" : "is-pending"}`} data-receipt-export-root="true">
      <div className="booking-receipt-edge" aria-hidden="true" />
      <header className="booking-receipt-header">
        <div className={`booking-receipt-status-icon ${paid ? "is-paid" : "is-pending"}`} aria-hidden="true">
          {paid ? <Check size={20} strokeWidth={3} /> : <span>!</span>}
        </div>
        <span className="eyebrow">{paid ? "Pembayaran terverifikasi" : "Menunggu pembayaran"}</span>
        <h2>{paid ? "Booking siap digunakan" : "Booking tercatat"}</h2>
        <p>{paid ? "Simpan bukti ini saat datang ke lokasi." : "Selesaikan pembayaran, lalu cek kembali statusnya."}</p>
      </header>

      <div className="booking-receipt-code">
        <span>Kode booking</span>
        <strong>{result.bookingCode}</strong>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(result.bookingCode); setCopied(true); }}>
          <Copy size={14} /> {copied ? "Tersalin" : "Salin kode"}
        </button>
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
  const paid = result.paymentStatus.toLowerCase() === "paid";
  return (
    <div className="booking-receipt-shell">
      <ReceiptPaper result={result} />
      <div className="booking-receipt-actions">
        {paid ? <button type="button" className="button secondary" onClick={() => window.print()}><Printer size={16} /> Cetak / simpan PDF</button> : <button type="button" className="button secondary" onClick={onRetry} disabled={loading}><RefreshCw size={16} /> {loading ? "Memperbarui…" : "Coba lagi"}</button>}
      </div>
    </div>
  );
}
