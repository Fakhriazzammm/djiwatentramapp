import { Banknote, CheckCircle2, Clock3, MapPin, ReceiptText, Truck, X } from "lucide-react";
import { isDeliveryNotification, type PosNotification } from "@/hooks/use-pos-notifications";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
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
  const orderNumber = getDisplayOrderNumber(order?.orderNumber ?? notification?.order_number ?? payload.orderNumber, { sequence: order?.dailyReceiptNo ?? (notification as any)?.daily_receipt_no, createdAt: order?.createdAt ?? (notification as any)?.created_at, source: order?.source ?? (notification as any)?.source, orderType: order?.orderType ?? (notification as any)?.order_type });
  const customerName = order?.customerName ?? payload.customerName ?? "Pelanggan DjiwaApp";
  const customerDescription = order?.customerDescription ?? order?.customer_description ?? payload.customerDescription ?? payload.customer_description ?? "";
  const total = order?.totalAmount ?? payload.totalAmount ?? 0;
  const payment = getPaymentLabel(order, payload);
  const status = getStatusLabel(order, notification);
  const paid = ["paid", "completed"].includes(String(order?.status ?? notification?.action_payload?.paymentStatus ?? "").toLowerCase());
  const table = getTableLabel(order, payload);
  const delivery = isDeliveryNotification(notification) || String(order?.orderType ?? order?.order_type ?? "").toLowerCase().includes("delivery");
  const courier = order?.deliveryProvider ?? order?.delivery_provider ?? payload.deliveryProvider ?? payload.shippingProvider;
  const address = order?.deliveryAddress ?? order?.delivery_address ?? payload.deliveryAddress ?? payload.delivery_address;
  const deliveryFee = order?.shippingFee ?? order?.deliveryFee ?? payload.shippingFee ?? payload.deliveryFee;

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-hidden border-l border-border/70 bg-background p-0 shadow-2xl sm:max-w-md">
        <SheetHeader className="border-b border-border/70 bg-background px-3 py-3 pr-11 sm:px-4">
          <div className="flex items-start gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-sm"><ReceiptText className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{delivery ? "Delivery Customer" : "Pesanan masuk · DjiwaApp"}</p>
              <SheetTitle className="font-display text-base font-extrabold tracking-tight">Detail pesanan</SheetTitle>
              <SheetDescription className="mt-0.5 break-all text-[10px] font-semibold text-muted-foreground">#{orderNumber}</SheetDescription>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup detail pesanan" className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[.97]"><X className="h-3.5 w-3.5" /></button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {loading ? <div className="space-y-3"><div className="h-20 animate-pulse rounded-3xl bg-muted" /><div className="h-32 animate-pulse rounded-3xl bg-muted" /><div className="h-24 animate-pulse rounded-3xl bg-muted" /></div> : (
            <>
              <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-2.5 py-2">
                <div><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Status pembayaran</p><p className={`mt-0.5 text-xs font-extrabold ${paid ? "text-emerald-700" : "text-amber-700"}`}>{status}</p></div>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`} aria-hidden="true">{paid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}</span>
              </div>

              <section aria-labelledby="customer-info-heading">
                <h3 id="customer-info-heading" className="mb-2 font-display text-xs font-extrabold tracking-tight">Informasi pelanggan</h3>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="min-w-0 rounded-lg border border-border/70 bg-card p-2 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Pelanggan</p><p className="mt-1 break-words font-extrabold">{customerName}</p></div>
                  <div className="min-w-0 rounded-lg border border-border/70 bg-card p-2 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Nomor meja</p><p className="mt-1 flex items-start gap-1 break-words font-extrabold"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary" />{table}</p></div>
                  <div className="col-span-2 rounded-lg border border-amber-200/80 bg-amber-50/70 p-2"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-amber-700">Ciri khusus customer</p><p className="mt-1 text-[11px] font-semibold text-amber-950">{customerDescription || "Belum diisi"}</p></div>
                </div>
              </section>

              {delivery ? <section aria-labelledby="delivery-info-heading" className="mt-4"><h3 id="delivery-info-heading" className="mb-2 font-display text-xs font-extrabold tracking-tight">Detail pengantaran</h3><div className="space-y-1.5 text-xs"><div className="rounded-lg border border-sky-200 bg-sky-50/70 p-2"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-700">Kurir</p><p className="mt-1.5 flex items-start gap-1.5 font-extrabold"><Truck className="mt-0.5 h-3 w-3 shrink-0 text-sky-700" />{String(courier || "Kurir belum dipilih")}</p></div><div className="rounded-lg border border-border/70 bg-card p-2"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Alamat pengantaran</p><p className="mt-1.5 break-words font-semibold">{String(address || "Alamat belum tersedia")}</p></div>{Number(deliveryFee ?? 0) > 0 ? <div className="flex justify-between rounded-lg border border-border/70 bg-card p-2"><span className="font-semibold text-muted-foreground">Biaya pengantaran</span><span className="font-extrabold">{formatCurrency(deliveryFee)}</span></div> : null}</div></section> : null}

              <section aria-labelledby="payment-info-heading" className="mt-4">
                <h3 id="payment-info-heading" className="mb-2 font-display text-xs font-extrabold tracking-tight">Pembayaran</h3>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-lg border border-border/70 bg-card p-2 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Metode</p><p className="mt-1.5 font-extrabold">{payment}</p></div>
                  <div className="rounded-lg border border-border/70 bg-card p-2 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Sumber</p><p className="mt-1.5 font-extrabold">DjiwaApp</p></div>
                </div>
              </section>

              <section className="mt-7">
                <div className="mb-2 flex items-end justify-between gap-2"><h3 className="font-display text-sm font-extrabold tracking-tight">Detail item</h3><span className="text-[10px] font-bold text-muted-foreground">{items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0)} item</span></div>
                <div className="space-y-1.5">
                  {items.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Detail item belum tersedia.</div> : items.map((item: any, index: number) => {
                    const quantity = Number(item.quantity ?? 0);
                    const price = Number(item.price ?? 0);
                    const extras = getItemExtras(item);
                    return <article key={`${getItemName(item)}-${index}`} className="rounded-lg border border-border/70 bg-card p-2 shadow-sm"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-extrabold leading-snug">{quantity}× {getItemName(item)}</p>{item.variant ? <p className="mt-1.5 text-xs text-muted-foreground">Varian: {item.variant}</p> : null}{extras ? <p className="mt-1 text-xs text-muted-foreground">Add-on: {extras}</p> : null}{item.notes || item.note ? <p className="mt-1 text-xs text-muted-foreground">Catatan: {item.notes ?? item.note}</p> : null}</div><p className="shrink-0 text-xs font-extrabold">{formatCurrency(price * quantity)}</p></div></article>;
                  })}
                </div>
              </section>

              <section aria-labelledby="total-heading" className="mt-4 rounded-lg border border-border/70 bg-muted/25 p-3 shadow-sm"><h3 id="total-heading" className="sr-only">Ringkasan pembayaran</h3><div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span className="font-bold">{formatCurrency(order?.subtotalAmount ?? order?.subtotal ?? total)}</span></div>{Number(order?.discountAmount ?? 0) > 0 ? <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Diskon</span><span className="font-bold text-rose-600">-{formatCurrency(order?.discountAmount)}</span></div> : null}<div className="mt-2 flex items-end justify-between gap-2 border-t border-border/70 pt-2"><span className="font-display text-sm font-extrabold">Total</span><span className="text-lg font-black tracking-tight text-primary">{formatCurrency(total)}</span></div>{order && String(order.status).toLowerCase() === "pending" && String(order.paymentMethod ?? order.payment_method ?? "").toLowerCase() === "cash" && onMarkCashierPaid ? <button type="button" onClick={() => void onMarkCashierPaid()} className="mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 active:scale-[.98]"><Banknote className="h-4 w-4" />Konfirmasi bayar tunai</button> : null}</section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
