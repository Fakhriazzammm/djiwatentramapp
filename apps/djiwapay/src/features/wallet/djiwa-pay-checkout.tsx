import type { ReactNode } from "react";
import { QrCode, WalletCards } from "lucide-react";
import {
  CheckoutField,
  CheckoutInput,
  CustomerCheckout,
  type CheckoutCartItem,
} from "@yumipos/djiwa-checkout-ui";
import {
  checkoutStep,
  paymentLabel,
  walletPaymentState,
  type PayCheckoutKind,
  type PayCheckoutStage,
  type PayPaymentMethod,
} from "../../lib/djiwa-pay-checkout";

type PayCheckoutProps = {
  kind: PayCheckoutKind;
  stage: PayCheckoutStage;
  amount: number;
  productName: string;
  productDescription?: string;
  productId: string;
  customerNumber?: string;
  onCustomerNumberChange?: (value: string) => void;
  amountEditor?: ReactNode;
  paymentMethod: PayPaymentMethod;
  onPaymentMethodChange: (method: PayPaymentMethod) => void;
  walletBalance: number;
  error?: string | null;
  notice?: ReactNode;
  fieldError?: string | null;
  busy?: boolean;
  pending?: boolean;
  onTopup?: () => void;
  onBack: () => void;
  onPrimary: () => void;
};

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function summaryRow(label: string, value: string, className = "") {
  return <div className={`djiwa-order-summary-row ${className}`.trim()}><span>{label}</span><strong>{value}</strong></div>;
}

export function DjiwaPayCheckout({
  kind,
  stage,
  amount,
  productName,
  productDescription,
  productId,
  customerNumber,
  onCustomerNumberChange,
  amountEditor,
  paymentMethod,
  onPaymentMethodChange,
  walletBalance,
  error,
  notice,
  fieldError,
  busy = false,
  pending = false,
  onTopup,
  onBack,
  onPrimary,
}: PayCheckoutProps) {
  const { step, totalSteps } = checkoutStep(kind, stage);
  const isPayment = stage === "payment";
  const amountIsValid = Number.isSafeInteger(amount) && amount >= 1000;
  const cart: CheckoutCartItem[] = [{ productId, name: productName, variant: productDescription, price: amount, quantity: 1 }];
  const wallet = walletPaymentState(walletBalance, amount);
  const paymentOptions = kind === "topup"
    ? [{ key: "mayar", label: "QRIS Mayar", description: "Bayar aman melalui halaman QRIS Mayar.", icon: <QrCode size={16} /> }]
    : [
        { key: "wallet", label: "Djiwa Pay", description: "Bayar langsung dari saldo Djiwa Pay.", icon: <WalletCards size={16} /> },
        { key: "mayar", label: "QRIS", description: "Bayar cepat dan cashierless dengan QRIS.", icon: <QrCode size={16} /> },
      ];

  const fields = !isPayment ? (
    kind === "topup" ? amountEditor : (
      <CheckoutField label="Nomor tujuan" required htmlFor="djiwa-ppob-customer-number" hint="Masukkan nomor pelanggan 8–20 digit.">
        <CheckoutInput
          id="djiwa-ppob-customer-number"
          inputMode="numeric"
          autoComplete="tel"
          value={customerNumber ?? ""}
          onChange={(event) => onCustomerNumberChange?.(event.currentTarget.value.replace(/\D/g, "").slice(0, 20))}
          placeholder="08xxxxxxxxxx"
        />
        {fieldError ? <small className="djiwa-checkout-field-error" role="alert">{fieldError}</small> : null}
      </CheckoutField>
    )
  ) : undefined;

  const summary = (
    <div className="djiwa-summary-rows">
      {summaryRow("Layanan", productName)}
      {productDescription ? summaryRow(kind === "ppob" ? "Operator" : "Metode", productDescription) : null}
      {kind === "ppob" && customerNumber ? summaryRow("Nomor tujuan", customerNumber) : null}
      {summaryRow(kind === "topup" ? "Nominal isi saldo" : "Total pembayaran", money(amount), "is-total")}
    </div>
  );

  return (
    <CustomerCheckout
      mode={isPayment ? "payment" : "review"}
      step={step}
      totalSteps={totalSteps}
      eyebrow={isPayment ? "Pembayaran" : "Detail layanan"}
      title={isPayment ? "Pilih metode pembayaran" : kind === "topup" ? "Isi saldo Djiwa Pay" : "Detail pembelian"}
      description={isPayment ? "Pilih satu metode untuk menyelesaikan pembayaran." : productDescription}
      cart={cart}
      currency={money}
      showOrderDetail={!isPayment}
      fields={fields}
      notesLabel="Catatan transaksi"
      notesPlaceholder="Opsional"
      notes=""
      setNotes={() => undefined}
      showNotes={false}
      showPayment={isPayment}
      paymentHeading="Pilih pembayaran"
      paymentOptions={paymentOptions}
      paymentChoice={paymentMethod}
      setPaymentChoice={(key) => onPaymentMethodChange(key as PayPaymentMethod)}
      walletBalance={walletBalance}
      walletShortage={kind === "ppob" && paymentMethod === "wallet" && wallet.disabled ? `Saldo tersedia ${money(walletBalance)}, masih kurang ${money(wallet.shortage)}.` : null}
      onTopup={onTopup}
      showReward={kind === "ppob" && isPayment}
      rewardTitle="Djiwa Pay +Rp1.000"
      rewardDescription="Reward saldo Djiwa Pay diberikan setelah transaksi berhasil."
      summary={summary}
      notices={notice}
      error={error}
      onBack={onBack}
      backLabel={isPayment ? "Kembali ke detail" : "Kembali"}
      primaryLabel={pending ? "Menunggu status provider" : isPayment ? paymentLabel(kind, paymentMethod, amount) : "Lanjutkan ke pembayaran"}
      onPrimary={onPrimary}
      primaryDisabled={busy || pending || (!isPayment && kind === "topup" && !amountIsValid) || (!isPayment && kind === "ppob" && !customerNumber?.match(/^\d{8,20}$/)) || (isPayment && kind === "ppob" && paymentMethod === "wallet" && wallet.disabled)}
      busy={busy}
      busyLabel="Memproses…"
    />
  );
}

export function DjiwaPaySuccess({ productName, operator, customerNumber, amount, serialNumber, reference, onDone }: { productName: string; operator: string; customerNumber: string; amount: number; serialNumber?: string; reference?: string; onDone: () => void }) {
  const currency = money;
  const cart: CheckoutCartItem[] = [{ productId: "djiwa-pay-success", name: productName, variant: operator, price: amount, quantity: 1 }];
  const summary = (
    <div className="djiwa-summary-rows">
      {summaryRow("Operator", operator)}
      {summaryRow("Produk", productName)}
      {summaryRow("Nomor tujuan", customerNumber)}
      {serialNumber ? summaryRow("Serial number", serialNumber) : null}
      {reference ? summaryRow("Referensi", reference) : null}
      {summaryRow("Total pembayaran", currency(amount), "is-total")}
    </div>
  );
  return (
    <CustomerCheckout
      mode="payment"
      step={3}
      totalSteps={3}
      eyebrow="Transaksi selesai"
      title="Pembayaran berhasil"
      description="Struk digital transaksi PPOB tersimpan di halaman ini."
      cart={cart}
      currency={currency}
      showOrderDetail={false}
      fields={<div className="djiwa-payment-notice is-success" role="status"><strong>Transaksi selesai</strong><small>Saldo Djiwa Pay telah dipotong dan provider mengonfirmasi pembelian.</small></div>}
      notesLabel="Catatan transaksi"
      notesPlaceholder="Opsional"
      notes=""
      setNotes={() => undefined}
      showNotes={false}
      showPayment={false}
      paymentHeading="Pembayaran"
      paymentOptions={[]}
      paymentChoice=""
      setPaymentChoice={() => undefined}
      walletBalance={0}
      showReward={false}
      summary={summary}
      primaryLabel="Selesai"
      onPrimary={onDone}
    />
  );
}
