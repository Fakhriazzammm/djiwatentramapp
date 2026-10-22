import type { ReactNode } from "react";
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
  busy?: boolean;
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
  busy = false,
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
    ? [{ key: "mayar", label: "QRIS Mayar", description: "Bayar aman melalui halaman QRIS Mayar." }]
    : [
        { key: "wallet", label: "Djiwa Pay", description: "Bayar langsung dari saldo Djiwa Pay." },
        { key: "mayar", label: "QRIS", description: "Bayar cepat dan cashierless dengan QRIS." },
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
      </CheckoutField>
    )
  ) : undefined;

  const summary = (
    <div className="djiwa-summary-rows">
      {summaryRow("Layanan", productName)}
      {productDescription ? summaryRow("Detail", productDescription) : null}
      {kind === "ppob" && customerNumber ? summaryRow("Nomor tujuan", customerNumber) : null}
      {summaryRow("Total pembayaran", money(amount), "is-total")}
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
      showOrderDetail
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
      primaryLabel={isPayment ? paymentLabel(kind, paymentMethod, amount) : "Lanjutkan"}
      onPrimary={onPrimary}
      primaryDisabled={busy || (!isPayment && kind === "topup" && !amountIsValid) || (isPayment && kind === "ppob" && paymentMethod === "wallet" && wallet.disabled)}
      busy={busy}
      busyLabel="Memproses…"
    />
  );
}
