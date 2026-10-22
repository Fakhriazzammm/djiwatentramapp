import type { ReactNode } from "react";

type SurfaceProps = { children: ReactNode; className?: string };

export type CheckoutHeaderProps = {
  step: number;
  totalSteps: number;
  title: string;
  description?: string;
  className?: string;
};

export type CheckoutSectionProps = SurfaceProps & {
  as?: "section" | "div";
  labelledBy?: string;
};

export type PaymentMethodCardProps = {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  disabledDescription?: string;
  className?: string;
};

export type SummaryRow = { label: string; value: ReactNode };

export type OrderSummaryProps = {
  rows: readonly SummaryRow[];
  total?: SummaryRow;
  title?: string;
  className?: string;
};

export type PaymentNoticeProps = SurfaceProps & {
  title: string;
  tone?: "info" | "success" | "warning" | "danger";
};

export type CheckoutActionBarProps = {
  backLabel?: string;
  primaryLabel: string;
  busyLabel?: string;
  onBack?: () => void;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  className?: string;
};

export function CheckoutPage({ children, className = "" }: SurfaceProps) {
  return <main className={`djiwa-checkout-page ${className}`.trim()}>{children}</main>;
}

export function CheckoutHeader({ step, totalSteps, title, description, className = "" }: CheckoutHeaderProps) {
  return (
    <header className={`djiwa-checkout-header ${className}`.trim()}>
      <span className="djiwa-checkout-step">Langkah {step} dari {totalSteps}</span>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

export function CheckoutSection({ children, className = "", as = "section", labelledBy }: CheckoutSectionProps) {
  const props = labelledBy ? { "aria-labelledby": labelledBy } : {};
  if (as === "div") return <div className={`djiwa-checkout-section ${className}`.trim()} {...props}>{children}</div>;
  return <section className={`djiwa-checkout-section ${className}`.trim()} {...props}>{children}</section>;
}

export function PaymentMethodCard({ label, description, selected, onSelect, icon, disabled = false, disabledDescription, className = "" }: PaymentMethodCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      className={`djiwa-payment-method ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}
      onClick={onSelect}
    >
      {icon ? <span className="djiwa-payment-method-icon" aria-hidden="true">{icon}</span> : null}
      <span className="djiwa-payment-method-copy">
        <strong>{label}</strong>
        <small>{disabled && disabledDescription ? disabledDescription : description}</small>
      </span>
      <span className="djiwa-payment-radio" aria-hidden="true">{selected && !disabled ? "●" : "○"}</span>
    </button>
  );
}

export function OrderSummary({ rows, total, title = "Ringkasan pembayaran", className = "" }: OrderSummaryProps) {
  return (
    <section className={`djiwa-order-summary ${className}`.trim()} aria-label={title}>
      <h2>{title}</h2>
      <div className="djiwa-order-summary-rows">
        {rows.map((row) => <div className="djiwa-order-summary-row" key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}
        {total ? <div className="djiwa-order-summary-row is-total" key={total.label}><span>{total.label}</span><strong>{total.value}</strong></div> : null}
      </div>
    </section>
  );
}

export function PaymentNotice({ title, children, tone = "info", className = "" }: PaymentNoticeProps) {
  return <aside className={`djiwa-payment-notice is-${tone} ${className}`.trim()}><strong>{title}</strong><small>{children}</small></aside>;
}

export function CheckoutActionBar({ backLabel = "Kembali", primaryLabel, busyLabel = "Memproses...", onBack, onPrimary, primaryDisabled = false, busy = false, className = "" }: CheckoutActionBarProps) {
  return (
    <div className={`djiwa-checkout-actions ${className}`.trim()}>
      {onBack ? <button type="button" className="djiwa-checkout-back" onClick={onBack}>{backLabel}</button> : null}
      <button type="button" className="djiwa-checkout-primary" onClick={onPrimary} disabled={primaryDisabled || busy}>{busy ? busyLabel : primaryLabel}</button>
    </div>
  );
}
