import { useEffect } from "react";
import { AnimatedNumber, Btn, Header, Ic, Screen, Sky, SuccessMark } from "../shell/dpx-ui";
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

const PRESET_AMOUNTS = [20000, 50000, 100000, 200000, 500000, 1000000] as const;
const presetLabel = (value: number) => (value >= 1_000_000 ? `${value / 1_000_000} jt` : `${value / 1000} rb`);

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
  const availableBalance = Number.isSafeInteger(Number(balance)) ? Number(balance) : 0;
  const projectedBalance = Number.isSafeInteger(availableBalance + value) ? availableBalance + value : availableBalance;
  const isDetail = stage === "detail";
  const isSuccess = status === "success";
  const isExpired = status === "expired";
  const isPending = pending || status === "pending";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [stage, status]);

  if (isSuccess) {
    return (
      <Screen><Sky>
        <div className="dpx-pad dpx-nobar" aria-live="polite">
          <div className="dpx-center" style={{ marginTop: 34 }}>
            <SuccessMark />
            <h1 className="dpx-title">Isi saldo berhasil</h1>
            <div className="dpx-money" style={{ marginTop: 8 }}>+Rp <AnimatedNumber value={value} /></div>
            <p className="dpx-sub" style={{ margin: "8px auto 0", maxWidth: 290, fontSize: 14 }}>Saldo sudah ditambahkan ke akun Djiwa Pay kamu.</p>
          </div>
          <div className="dpx-group dpx-white dpx-mt" aria-label="Detail top up">
            <div className="dpx-kv"><span>Saldo sekarang</span><b>{money(availableBalance)}</b></div>
            <div className="dpx-kv"><span>Metode</span><b>QRIS Mayar</b></div>
            <div className="dpx-kv"><span>Status</span><b style={{ color: "var(--ok)" }}>Berhasil</b></div>
          </div>
        </div>
        <div className="dpx-sticky"><Btn type="button" className="dpx-btn" onClick={onDone}>{returningToPpob ? "Kembali ke Pembayaran" : "Selesai"}</Btn></div>
      </Sky></Screen>
    );
  }

  const primaryLabel = isDetail ? "Lanjut ke pembayaran" : isPending ? "Menunggu pembayaran" : isExpired ? "Buat invoice baru" : "Lanjut ke QRIS";
  const primaryDisabled = busy || (isDetail ? !normalized.valid : isPending);
  const invalid = !normalized.valid && !!amount;

  return (
    <Screen><Sky>
      <div className="dpx-pad dpx-nobar" style={{ paddingBottom: 170 }} key={stage}>
        <Header title={isDetail ? "Isi saldo" : "Pembayaran"} onBack={onBack} />
        {isDetail ? (
          <>
            <div className="dpx-center"><div className="dpx-sub">Saldo saat ini</div><div className="dpx-money" style={{ fontSize: 22 }}>{money(availableBalance)}</div></div>
            <div className="dpx-bigamt"><b>Rp</b>
              <input id="topup-custom-amount" inputMode="numeric" autoComplete="off" enterKeyHint="done" aria-label="Nominal isi saldo" aria-describedby="topup-amount-hint" placeholder="0" value={groupDigits(amount)} onChange={(event) => onAmountChange(normalizeTopupDigits(event.currentTarget.value))} />
            </div>
            <p id="topup-amount-hint" className={`dpx-hint dpx-center ${invalid ? "dpx-err" : ""}`}>{invalid ? `Minimal isi saldo ${money(MIN_TOPUP_AMOUNT)}.` : `Minimal ${money(MIN_TOPUP_AMOUNT)} · saldo setelah top up ${money(projectedBalance)}`}</p>
            <div className="dpx-amt-presets" role="group" aria-label="Pilihan nominal isi saldo">
              {PRESET_AMOUNTS.map((preset) => <Btn key={preset} type="button" className={`dpx-preset ${value === preset ? "dpx-on" : ""}`} animate={{ scale: value === preset ? 1.05 : 1 }} aria-pressed={value === preset} onClick={() => onAmountChange(String(preset))}>{presetLabel(preset)}</Btn>)}
            </div>
            <div className="dpx-glabel">Metode pembayaran</div>
            <div className="dpx-opt dpx-on" role="group" aria-label="Metode pembayaran QRIS"><span className="dpx-cat dpx-c-blue dpx-sq"><Ic n="qr" /></span><span className="dpx-main"><b>QRIS</b><span>Mayar · semua bank &amp; e-wallet</span></span><span className="dpx-radio" aria-label="Dipilih" /></div>
            <div className="dpx-note dpx-info"><Ic n="info" /><div>Saldo masuk otomatis setelah pembayaran QRIS terkonfirmasi.</div></div>
          </>
        ) : (
          <>
            <div className="dpx-center"><div className="dpx-sub">Total pembayaran</div><div className="dpx-money">{money(value)}</div></div>
            <div className="dpx-group dpx-white dpx-mt" aria-label="Ringkasan pembayaran">
              <div className="dpx-kv"><span>Nominal isi saldo</span><b>{money(value)}</b></div>
              <div className="dpx-kv"><span>Biaya layanan</span><b style={{ color: "var(--ok)" }}>Gratis</b></div>
              <div className="dpx-kv dpx-total"><span>Total</span><b>{money(value)}</b></div>
            </div>
            <div className="dpx-glabel">Metode pembayaran</div>
            <div className="dpx-opt dpx-on" role="group" aria-label="Metode pembayaran QRIS"><span className="dpx-cat dpx-c-blue dpx-sq"><Ic n="qr" /></span><span className="dpx-main"><b>QRIS</b><span>Mayar · semua bank &amp; e-wallet</span></span><span className="dpx-radio" aria-label="Dipilih" /></div>
            <div className="dpx-note dpx-info"><Ic n="shield" /><div><b>Pembayaran aman</b>Kamu akan diarahkan ke halaman QRIS Mayar untuk menyelesaikan pembayaran.</div></div>
            {isPending ? (
              <div className="dpx-note" role="status" aria-live="polite"><Ic n="clock" /><div><b>Menunggu pembayaran</b>Status diperiksa otomatis setiap 5 detik. Selesaikan pembayaran QRIS sebelum batas waktu.<br /><Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8, fontWeight: 600 }} onClick={onCheckStatus} disabled={busy}>{busy ? "Memeriksa…" : "Periksa status"}</Btn></div></div>
            ) : isExpired ? (
              <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Invoice kedaluwarsa</b>Batas waktu pembayaran sudah lewat. Buat invoice baru untuk mencoba lagi.</div></div>
            ) : null}
          </>
        )}
      </div>
      <div className="dpx-sticky">
        {isDetail ? <div className="dpx-spread" style={{ margin: "0 6px 10px" }}><span className="dpx-sub">Total bayar</span><b style={{ fontSize: 18 }}>{money(value)}</b></div> : null}
        <Btn type="button" className={`dpx-btn ${primaryDisabled ? "dpx-off" : ""}`} onClick={onPrimary} disabled={primaryDisabled} aria-busy={busy}>{busy && !isPending ? "Memproses…" : primaryLabel}</Btn>
        {!isDetail && !isPending ? <Btn type="button" className="dpx-btn dpx-soft" style={{ marginTop: 10 }} onClick={onRestart}>Ubah nominal</Btn> : null}
      </div>
    </Sky></Screen>
  );
}
