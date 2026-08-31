import { Banknote, CheckCircle2, Clock3, MapPin, ReceiptText, X } from "lucide-react";
import type { PosNotification } from "@/hooks/use-pos-notifications";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type PosOrderDetailSheetProps = {
  open: boolean;
  order: Record<string, any> | null;
  notification: PosNotification | null;
  loading?: boolean;
  onClose: () => void;
  onMarkCashierPaid?: () => void | Promise<void>;
};

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function getPayload(notification: PosNotification | null) {
  return notification?.action_payload ?? {};
}

function getTableLabel(order: Record<string, any> | null, payload: Record<string, any>) {
  const value = order?.tableNumber ?? order?.table_number ?? order?.tableName ?? order?.table_name ?? payload.tableNumber ?? payload.table_number;
  if (value === null || value === undefined || String(value).trim() === "") {
    const orderType = String(order?.orderType ?? order?.order_type ?? payload.orderType ?? "").toLowerCase();
    return orderType.includes("take") || orderType.includes("delivery") ? "Takeaway" : "Nomor meja belum ditentukan";
  }
  return String(value).startsWith("Meja") ? String(value) : `Meja ${value}`;
}

function getItems(order: Record<string, any> | null, payload: Record<string, any>) {
  const orderItems = order?.items;
  const items = Array.isArray(orderItems) && orderItems.length > 0 ? orderItems : payload.items;
  return Array.isArray(items) ? items : [];
}

function getItemName(item: Record<string, any>) {
  return String(item.productName ?? item.name ?? item.title ?? "Item pesanan");
}

function getItemExtras(item: Record<string, any>) {
  const extras = item.addOns ?? item.addons ?? item.options ?? item.customizations;
  if (Array.isArray(extras)) return extras.map((extra) => typeof extra === "string" ? extra : extra?.name).filter(Boolean).join(", ");
  return typeof extras === "string" ? extras : "";
}

function getPaymentLabel(order: Record<string, any> | null, payload: Record<string, any>) {
  const method = String(order?.paymentMethod ?? order?.payment_method ?? payload.paymentMethod ?? "").toLowerCase();
  if (method.includes("wallet") || method.includes("djiwa_pay") || method === "djiwaapp") return "DJIWA PAY";
  return method.includes("qris") || method.includes("mayar") ? "QRIS" : "Bayar di Kasir";
}

function getStatusLabel(order: Record<string, any> | null, notification: PosNotification | null) {
  const status = String(order?.status ?? notification?.action_payload?.paymentStatus ?? "").toLowerCase();
  if (status === "paid" || status === "completed") return "Lunas";
  return "Menunggu Pembayaran";
}

export function PosOrderDetailSheet({ open, order, notification, loading = false, onClose, onMarkCashierPaid }: PosOrderDetailSheetProps) {
  const payload = getPayload(notification);
  const items = getItems(order, payload);
  const orderNumber = order?.orderNumber ?? notification?.order_number ?? payload.orderNumber ?? "-";
  const customerName = order?.customerName ?? payload.customerName ?? "Pelanggan DjiwaApp";
  const customerDescription = order?.customerDescription ?? order?.customer_description ?? payload.customerDescription ?? payload.customer_description ?? "";
  const total = order?.totalAmount ?? payload.totalAmount ?? 0;
  const payment = getPaymentLabel(order, payload);
  const status = getStatusLabel(order, notification);
  const paid = ["paid", "completed"].includes(String(order?.status ?? notification?.action_payload?.paymentStatus ?? "").toLowerCase());
  const table = getTableLabel(order, payload);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col overflow-hidden border-l border-border/70 bg-background p-0 shadow-2xl sm:max-w-xl">
        <SheetHeader className="border-b border-border/70 bg-background px-5 py-5 pr-14 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm"><ReceiptText className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Pesanan masuk · DjiwaApp</p>
              <SheetTitle className="font-display text-xl font-extrabold tracking-tight">Detail pesanan</SheetTitle>
              <SheetDescription className="mt-1 break-all text-xs font-semibold text-muted-foreground">#{orderNumber}</SheetDescription>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup detail pesanan" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[.97]"><X className="h-4 w-4" /></button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {loading ? <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-32 animate-pulse rounded-3xl bg-muted" /><div className="h-24 animate-pulse rounded-3xl bg-muted" /></div> : (
            <>
              <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3">
                <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Status pembayaran</p><p className={`mt-1 text-sm font-extrabold ${paid ? "text-emerald-700" : "text-amber-700"}`}>{status}</p></div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`} aria-hidden="true">{paid ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}</span>
              </div>

              <section aria-labelledby="customer-info-heading">
                <h3 id="customer-info-heading" className="mb-3 font-display text-sm font-extrabold tracking-tight">Informasi pelanggan</h3>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Pelanggan</p><p className="mt-1.5 break-words font-extrabold">{customerName}</p></div>
                  <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Nomor meja</p><p className="mt-1.5 flex items-start gap-1.5 break-words font-extrabold"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{table}</p></div>
                  <div className="col-span-2 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-700">Ciri khusus customer</p><p className="mt-1.5 text-sm font-semibold text-amber-950">{customerDescription || "Belum diisi"}</p></div>
                </div>
              </section>

              <section aria-labelledby="payment-info-heading" className="mt-6">
                <h3 id="payment-info-heading" className="mb-3 font-display text-sm font-extrabold tracking-tight">Pembayaran</h3>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Metode</p><p className="mt-1.5 font-extrabold">{payment}</p></div>
                  <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Sumber</p><p className="mt-1.5 font-extrabold">DjiwaApp</p></div>
                </div>
              </section>

              <section className="mt-7">
                <div className="mb-3 flex items-end justify-between gap-3"><h3 className="font-display text-sm font-extrabold tracking-tight">Detail item</h3><span className="text-xs font-bold text-muted-foreground">{items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0)} item</span></div>
                <div className="space-y-2">
                  {items.length === 0 ? <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">Detail item belum tersedia.</div> : items.map((item: any, index: number) => {
                    const quantity = Number(item.quantity ?? 0);
                    const price = Number(item.price ?? 0);
                    const extras = getItemExtras(item);
                    return <article key={`${getItemName(item)}-${index}`} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-extrabold leading-snug">{quantity}× {getItemName(item)}</p>{item.variant ? <p className="mt-1.5 text-xs text-muted-foreground">Varian: {item.variant}</p> : null}{extras ? <p className="mt-1 text-xs text-muted-foreground">Add-on: {extras}</p> : null}{item.notes || item.note ? <p className="mt-1 text-xs text-muted-foreground">Catatan: {item.notes ?? item.note}</p> : null}</div><p className="shrink-0 text-sm font-extrabold">{formatCurrency(price * quantity)}</p></div></article>;
                  })}
                </div>
              </section>

              <section aria-labelledby="total-heading" className="mt-7 rounded-3xl border border-border/70 bg-muted/25 p-5 shadow-sm"><h3 id="total-heading" className="sr-only">Ringkasan pembayaran</h3><div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-bold">{formatCurrency(order?.subtotalAmount ?? order?.subtotal ?? total)}</span></div>{Number(order?.discountAmount ?? 0) > 0 ? <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Diskon</span><span className="font-bold text-rose-600">-{formatCurrency(order?.discountAmount)}</span></div> : null}<div className="mt-4 flex items-end justify-between gap-3 border-t border-border/70 pt-4"><span className="font-display text-base font-extrabold">Total</span><span className="text-2xl font-black tracking-tight text-primary">{formatCurrency(total)}</span></div>{order && String(order.status).toLowerCase() === "pending" && String(order.paymentMethod ?? order.payment_method ?? "").toLowerCase() === "cash" && onMarkCashierPaid ? <button type="button" onClick={() => void onMarkCashierPaid()} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 active:scale-[.98]"><Banknote className="h-4 w-4" />Konfirmasi bayar tunai</button> : null}</section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
