import { QrCode } from "lucide-react";
import {
  CheckoutField,
  CheckoutInput,
  CheckoutSummaryLines,
  CheckoutTextarea,
  CustomerCheckout,
} from "@yumipos/djiwa-checkout-ui";
import type { BookingOption } from "../lib/booking-constants";
import type { BookingCustomField, BookingSettings, Product } from "../lib/client";
import type { CustomerForm } from "../lib/booking-validation";

type CheckoutItem = Product & { quantity: number };

type CheckoutSectionProps = {
  step: number;
  totalSteps: number;
  settings?: BookingSettings | null;
  bookingType?: BookingOption;
  eventType?: BookingOption;
  date: string;
  arrivalTime: string;
  guests: number;
  tableCount: number;
  items: CheckoutItem[];
  total: number;
  customer: CustomerForm;
  setCustomer: (value: CustomerForm) => void;
  customAnswers: Record<string, unknown>;
  setCustomAnswers: (value: Record<string, unknown>) => void;
  error: string | null;
  submitting: boolean;
  onNext: () => void;
  onBack: () => void;
};

export function CheckoutSection({ step, totalSteps, settings, bookingType, eventType, date, arrivalTime, guests, tableCount, items, total, customer, setCustomer, customAnswers, setCustomAnswers, error, submitting, onNext, onBack }: CheckoutSectionProps) {
  const errors = validateCustomerFields(customer);
  const customFields = (settings?.customFields ?? []).filter((field) => !field.isBookingEventOption);
  const customErrors = requiredFieldErrors(customFields, customAnswers);
  const updateCustomer = (field: keyof CustomerForm, value: string) => setCustomer({ ...customer, [field]: value });
  const cart = items.map((item) => ({ productId: item.id, name: item.name, image: item.imageUrl, price: item.promoPrice ?? item.price, quantity: item.quantity }));

  return (
    <CustomerCheckout
      mode="checkout"
      step={step}
      totalSteps={totalSteps}
      eyebrow="Booking"
      title="Data pemesan & pembayaran"
      description="Periksa data booking, lalu lanjutkan ke pembayaran QRIS."
      cart={cart}
      currency={formatCurrency}
      emptyState={{ title: "Menu belum dipilih", description: "Pilih minimal satu menu sebelum melanjutkan pembayaran.", actionLabel: "Kembali ke menu" }}
      onBack={onBack}
      editMenu={{ label: "Ubah menu", onClick: onBack }}
      showOrderDetail
      orderDetailExtra={<BookingContext bookingType={bookingType} eventType={eventType} date={date} arrivalTime={arrivalTime} guests={guests} tableCount={tableCount} />}
      fields={(
        <div className="djiwa-checkout-fields">
          <div className="djiwa-checkout-field-row">
            <CheckoutField label="Nama lengkap" required htmlFor="booking-customer-name" hint={errors.name}>
              <CheckoutInput id="booking-customer-name" value={customer.name} onChange={(event) => updateCustomer("name", event.currentTarget.value)} placeholder="Nama lengkap" aria-invalid={Boolean(errors.name)} />
            </CheckoutField>
            <CheckoutField label="Nomor WhatsApp" required htmlFor="booking-customer-phone" hint={errors.phone}>
              <CheckoutInput id="booking-customer-phone" value={customer.phone} onChange={(event) => updateCustomer("phone", event.currentTarget.value)} placeholder="08… atau +62…" inputMode="tel" aria-invalid={Boolean(errors.phone)} />
            </CheckoutField>
          </div>
          <CheckoutField label="Email" htmlFor="booking-customer-email" hint={errors.email}>
            <CheckoutInput id="booking-customer-email" value={customer.email} onChange={(event) => updateCustomer("email", event.currentTarget.value)} placeholder="nama@email.com" inputMode="email" aria-invalid={Boolean(errors.email)} />
          </CheckoutField>
          <CheckoutField label="Catatan" htmlFor="booking-customer-notes">
            <CheckoutTextarea id="booking-customer-notes" value={customer.notes} onChange={(event) => updateCustomer("notes", event.currentTarget.value)} placeholder="Catatan tambahan (opsional)" rows={3} />
          </CheckoutField>
          {customFields.map((field) => <BookingCustomFieldInput key={field.id} field={field} value={customAnswers[field.id]} error={customErrors[field.id]} onChange={(value) => setCustomAnswers({ ...customAnswers, [field.id]: value })} />)}
        </div>
      )}
      showNotes={false}
      notesLabel="Catatan"
      notesPlaceholder=""
      notes=""
      setNotes={() => undefined}
      showPayment
      paymentHeading="Pilih pembayaran"
      paymentOptions={[{ key: "mayar", label: "QRIS", description: "Bayar cepat dan cashierless dengan QRIS", icon: <QrCode size={15} /> }]}
      paymentChoice="mayar"
      setPaymentChoice={() => undefined as never}
      walletBalance={0}
      showReward={false}
      summary={<CheckoutSummaryLines currency={formatCurrency} productGrossSubtotal={total} serviceChargeAmount={0} serviceChargeRate={0} taxEnabled={false} total={total} paymentChoice="mayar" />}
      notices={<p className="djiwa-summary-note">Invoice akan dibuat satu kali dan dapat dilanjutkan kembali dari status booking bila pembayaran belum selesai.</p>}
      error={error}
      primaryLabel="Lanjut ke pembayaran"
      onPrimary={onNext}
      primaryDisabled={Boolean(Object.keys(errors).length || Object.keys(customErrors).length)}
      busy={submitting}
      busyLabel="Menyiapkan pembayaran…"
    />
  );
}

function BookingContext({ bookingType, eventType, date, arrivalTime, guests, tableCount }: Pick<CheckoutSectionProps, "bookingType" | "eventType" | "date" | "arrivalTime" | "guests" | "tableCount">) {
  return <div className="djiwa-checkout-booking-context" aria-label="Ringkasan booking">
    <div className="djiwa-checkout-booking-context__primary">
      <span>{bookingType?.label || "Booking"}{eventType ? ` · ${eventType.label}` : ""}</span>
      <strong>{formatDate(date)} · {arrivalTime || "Jam belum diisi"}</strong>
    </div>
    <div className="djiwa-checkout-booking-context__meta"><span>{guests} tamu</span><span aria-hidden="true">·</span><span>{tableCount} meja</span></div>
  </div>;
}

function BookingCustomFieldInput({ field, value, error, onChange }: { field: BookingCustomField; value: unknown; error?: string; onChange: (value: unknown) => void }) {
  const current = typeof value === "string" ? value : value == null ? "" : String(value);
  return <CheckoutField label={field.label} required={field.required} htmlFor={`booking-custom-${field.id}`} hint={error}>{field.type === "textarea" ? <CheckoutTextarea id={`booking-custom-${field.id}`} value={current} onChange={(event) => onChange(event.currentTarget.value)} placeholder={field.placeholder} rows={3} aria-invalid={Boolean(error)} /> : field.type === "dropdown" ? <select id={`booking-custom-${field.id}`} className="djiwa-checkout-input" value={current} onChange={(event) => onChange(event.currentTarget.value)} aria-invalid={Boolean(error)}><option value="">Pilih {field.label.toLowerCase()}</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <CheckoutInput id={`booking-custom-${field.id}`} value={current} onChange={(event) => onChange(event.currentTarget.value)} placeholder={field.placeholder} aria-invalid={Boolean(error)} />}</CheckoutField>;
}

function validateCustomerFields(customer: CustomerForm) {
  const errors: Record<string, string> = {};
  if (!customer.name.trim()) errors.name = "Nama wajib diisi.";
  if (!customer.phone.trim()) errors.phone = "Nomor WhatsApp wajib diisi.";
  if (customer.email.trim() && !/^\S+@\S+\.\S+$/.test(customer.email.trim())) errors.email = "Email belum valid.";
  return errors;
}

function requiredFieldErrors(fields: BookingCustomField[], values: Record<string, unknown>) {
  return fields.filter((field) => field.required && !String(values[field.id] ?? "").trim()).reduce<Record<string, string>>((errors, field) => { errors[field.id] = `${field.label} wajib diisi.`; return errors; }, {});
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  if (!value) return "Tanggal belum diisi";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
