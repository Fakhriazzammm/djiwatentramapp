import { useEffect } from "react";
import { AlertCircle, Check, ChevronLeft, Clock3, Lock, QrCode, ShieldCheck, Wallet } from "lucide-react";
import { MIN_TOPUP_AMOUNT, normalizeTopupAmount, normalizeTopupDigits } from "../../lib/djiwa-pay-topup";

type TopupStage = "detail" | "payment";
type TopupStatus = "idle" | "pending" | "success" | "expired";

type DjiwaPayTopupProps = {
  stage: TopupStage;
  status: TopupStatus;
  amount: string;
  balance: number;
  busy: boolean;
  pending: boolean;
  returningToPpob?: boolean;
  onAmountChange: (value: string) => void;
  onBack: () => void;
  onPrimary: () => void;
  onCheckStatus: () => void;
  onRestart: () => void;
  onDone: () => void;
};

const PRESET_AMOUNTS = [50000, 100000, 500000, 1000000] as const;

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
    .format(value)
    .replace(/\u00a0/g, " ");

function groupDigits(digits: string) {
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(digits));
}

export function DjiwaPayTopup({
  stage,
  status,
  amount,
  balance,
  busy,
  pending,
  returningToPpob = false,
  onAmountChange,
  onBack,
  onPrimary,
  onCheckStatus,
  onRestart,
  onDone,
}: DjiwaPayTopupProps) {
  const normalized = normalizeTopupAmount(amount);
  const value = normalized.value;
  const isDetail = stage === "detail";
  const isSuccess = status === "success";
  const isExpired = status === "expired";
  const isPending = pending || status === "pending";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [stage, status]);

  if (isSuccess) {
    return (
      <main className="pay-page topup-page topup-success-page">
        <div className="topup-stage topup-success" aria-live="polite">
          <div className="topup-success-badge" aria-hidden="true">
            <Check size={38} strokeWidth={2.8} />
          </div>
          <p className="topup-eyebrow">DJIWA PAY</p>
          <h1>Top up berhasil</h1>
          <strong className="topup-success-amount">+{money(value)}</strong>
          <p className="topup-lede">Saldo sudah ditambahkan ke akun Djiwa Pay kamu.</p>
          <section className="topup-success-card" aria-label="Detail top up">
            <div>
              <span>Saldo sekarang</span>
              <b>{money(balance)}</b>
            </div>
            <div>
              <span>Metode</span>
              <b>QRIS Mayar</b>
            </div>
            <div>
              <span>Status</span>
              <b className="is-success">Berhasil</b>
            </div>
          </section>
        </div>
        <div className="topup-actions">
          <button type="button" className="topup-primary" onClick={onDone}>
            {returningToPpob ? "Kembali ke Pembayaran" : "Selesai"}
          </button>
        </div>
      </main>
    );
  }

  const primaryLabel = isDetail
    ? "Lanjutkan ke Pembayaran"
    : isPending
      ? "Menunggu Pembayaran"
      : isExpired
        ? "Buat Invoice Baru"
        : "Lanjutkan ke QRIS";
  const primaryDisabled = busy || (isDetail ? !normalized.valid : isPending);

  return (
    <main className="pay-page topup-page">
      <header className="topup-nav">
        <button type="button" className="topup-nav-back" onClick={onBack} aria-label="Kembali">
          <ChevronLeft size={25} strokeWidth={2.3} />
        </button>
        <span className="topup-nav-title">{isDetail ? "Isi Saldo" : "Pembayaran"}</span>
        <span className="topup-nav-spacer" aria-hidden="true" />
      </header>

      <div className="topup-content topup-stage" key={stage}>
        <p className="topup-eyebrow">{isDetail ? "LANGKAH 1 DARI 2" : "LANGKAH 2 DARI 2"}</p>
        <h1>{isDetail ? "Isi saldo" : "Pembayaran"}</h1>
        <p className="topup-lede">
          {isDetail
            ? "Tambahkan saldo supaya pembayaran di Djiwa Pay makin cepat."
            : "Periksa nominal lalu lanjutkan pembayaran lewat QRIS."}
        </p>

        {isDetail ? (
          <>
            <section className="topup-hero" aria-label="Ringkasan isi saldo">
              <span className="topup-hero-glow" aria-hidden="true" />
              <div className="topup-hero-top">
                <span>
                  <Wallet size={13} strokeWidth={2.4} />
                  Nominal isi saldo
                </span>
                <span className="topup-hero-badge">
                  <QrCode size={12} strokeWidth={2.4} />
                  QRIS
                </span>
              </div>
              <strong className="topup-hero-amount">{money(value)}</strong>
              <div className="topup-hero-balance">
                <div>
                  <span>Saldo saat ini</span>
                  <b>{money(balance)}</b>
                </div>
                <div>
                  <span>Setelah top up</span>
                  <b>{money(balance + value)}</b>
                </div>
              </div>
            </section>

            <p className="topup-section-label">Pilih nominal</p>
            <div className="topup-presets" role="group" aria-label="Pilihan nominal isi saldo">
              {PRESET_AMOUNTS.map((preset) => {
                const selected = value === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={selected ? "topup-preset is-selected" : "topup-preset"}
                    aria-pressed={selected}
                    onClick={() => onAmountChange(String(preset))}
                  >
                    {money(preset)}
                  </button>
                );
              })}
            </div>

            <div className={normalized.valid || !amount ? "topup-custom" : "topup-custom is-invalid"}>
              <label htmlFor="topup-custom-amount">Nominal lainnya</label>
              <div className="topup-custom-field">
                <span aria-hidden="true">Rp</span>
                <input
                  id="topup-custom-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-describedby="topup-amount-hint"
                  placeholder="0"
                  value={groupDigits(amount)}
                  onChange={(event) => onAmountChange(normalizeTopupDigits(event.currentTarget.value))}
                />
              </div>
            </div>

            <p id="topup-amount-hint" className={normalized.valid || !amount ? "topup-hint" : "topup-hint is-error"}>
              {normalized.valid || !amount ? (
                <>
                  <Lock size={12} strokeWidth={2.4} />
                  Minimal {money(MIN_TOPUP_AMOUNT)}. Saldo masuk otomatis setelah pembayaran QRIS terkonfirmasi.
                </>
              ) : (
                <>Minimal isi saldo {money(MIN_TOPUP_AMOUNT)}.</>
              )}
            </p>
          </>
        ) : (
          <>
            <section className="topup-summary" aria-label="Ringkasan pembayaran">
              <div className="topup-summary-total">
                <span>Total pembayaran</span>
                <strong>{money(value)}</strong>
              </div>
              <div className="topup-summary-rows">
                <div>
                  <span>Nominal isi saldo</span>
                  <b>{money(value)}</b>
                </div>
                <div>
                  <span>Biaya layanan</span>
                  <b className="is-free">Gratis</b>
                </div>
              </div>
            </section>

            <p className="topup-section-label">Metode pembayaran</p>
            <div className="topup-method" role="group" aria-label="Metode pembayaran QRIS">
              <span className="topup-method-icon" aria-hidden="true">
                <QrCode size={21} strokeWidth={2.2} />
              </span>
              <span className="topup-method-copy">
                <b>QRIS</b>
                <small>Mayar · semua bank &amp; e-wallet</small>
              </span>
              <span className="topup-method-check" aria-label="Dipilih">
                <Check size={13} strokeWidth={3} />
              </span>
            </div>

            <div className="topup-info">
              <ShieldCheck size={18} strokeWidth={2.2} aria-hidden="true" />
              <p>
                <b>Pembayaran aman</b>
                <span>Kamu akan diarahkan ke halaman QRIS Mayar untuk menyelesaikan pembayaran.</span>
              </p>
            </div>

            {isPending ? (
              <div className="topup-notice is-warning" role="status" aria-live="polite">
                <span className="topup-notice-icon" aria-hidden="true">
                  <Clock3 size={18} strokeWidth={2.3} />
                </span>
                <div className="topup-notice-copy">
                  <b>Menunggu pembayaran</b>
                  <span>Status diperiksa otomatis setiap 5 detik. Selesaikan pembayaran QRIS sebelum batas waktu.</span>
                </div>
                <button type="button" className="topup-notice-action" onClick={onCheckStatus} disabled={busy}>
                  {busy ? "Memeriksa…" : "Periksa status"}
                </button>
              </div>
            ) : isExpired ? (
              <div className="topup-notice is-danger" role="alert">
                <span className="topup-notice-icon" aria-hidden="true">
                  <AlertCircle size={18} strokeWidth={2.3} />
                </span>
                <div className="topup-notice-copy">
                  <b>Invoice kedaluwarsa</b>
                  <span>Batas waktu pembayaran sudah lewat. Buat invoice baru untuk mencoba lagi.</span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="topup-actions">
        {!isDetail && !isPending ? (
          <button type="button" className="topup-secondary" onClick={onRestart}>
            Ubah nominal
          </button>
        ) : null}
        <button type="button" className="topup-primary" onClick={onPrimary} disabled={primaryDisabled} aria-busy={busy}>
          {busy && !isPending ? "Memproses…" : primaryLabel}
        </button>
      </div>
    </main>
  );
}
