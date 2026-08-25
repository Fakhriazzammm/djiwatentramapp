import { CheckCircle2, Clock3, MapPin, ReceiptText, X } from "lucide-react";
import type { PosNotification } from "@/hooks/use-pos-notifications";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type PosOrderDetailSheetProps = {
  open: boolean;
  order: Record<string, any> | null;
  notification: PosNotification | null;
  loading?: boolean;
  onClose: () => void;
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
  const items = Array.isArray(order?.items) && order.items.length > 0 ? order.items : payload.items;
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

export function PosOrderDetailSheet({ open, order, notification, loading = false, onClose }: PosOrderDetailSheetProps) {
  const payload = getPayload(notification);
  const items = getItems(order, payload);
  const orderNumber = order?.orderNumber ?? notification?.order_number ?? payload.orderNumber ?? "-";
  const customerName = order?.customerName ?? payload.customerName ?? "Pelanggan DjiwaApp";
  const customerDescription = order?.customerDescription ?? order?.customer_description ?? payload.customerDescription ?? payload.customer_description ?? "";
  const total = order?.totalAmount ?? payload.totalAmount ?? 0;
  const payment = getPaymentLabel(order, payload);
  const status = getStatusLabel(order, notification);
  const table = getTableLabel(order, payload);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 py-4 pr-14">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ReceiptText className="h-5 w-5" /></span>
            <div className="min-w-0">
              <SheetTitle className="text-base font-black">Detail Pesanan DjiwaApp</SheetTitle>
              <SheetDescription className="mt-1 text-xs font-bold">#{orderNumber} · {status}</SheetDescription>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup detail pesanan" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted"><X className="h-4 w-4" /></button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? <div className="space-y-3"><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted" /></div> : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border bg-muted/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pelanggan</p><p className="mt-1 font-black">{customerName}</p></div>
                <div className="rounded-xl border bg-muted/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Nomor meja</p><p className="mt-1 flex items-center gap-1 font-black"><MapPin className="h-3.5 w-3.5 text-primary" />{table}</p></div>
                <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Ciri khusus customer</p><p className="mt-1 font-semibold text-amber-900">{customerDescription || "Belum diisi"}</p></div>
                <div className="rounded-xl border bg-muted/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pembayaran</p><p className="mt-1 font-black">{payment}</p></div>
                <div className="rounded-xl border bg-muted/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1 flex items-center gap-1 font-black"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{status}</p></div>
              </div>

              <section className="mt-5">
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black">Detail item</h3><span className="text-xs font-bold text-muted-foreground">{items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0)} item</span></div>
                <div className="space-y-2">
                  {items.length === 0 ? <div className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">Detail item sedang dimuat dari pesanan.</div> : items.map((item: any, index: number) => {
                    const quantity = Number(item.quantity ?? 0);
                    const price = Number(item.price ?? 0);
                    const extras = getItemExtras(item);
                    return <div key={`${getItemName(item)}-${index}`} className="rounded-2xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{quantity}× {getItemName(item)}</p>{item.variant ? <p className="mt-1 text-xs text-muted-foreground">Varian: {item.variant}</p> : null}{extras ? <p className="mt-1 text-xs text-muted-foreground">Add-on: {extras}</p> : null}{item.notes || item.note ? <p className="mt-1 text-xs text-muted-foreground">Catatan: {item.notes ?? item.note}</p> : null}</div><p className="shrink-0 text-sm font-black">{formatCurrency(price * quantity)}</p></div></div>;
                  })}
                </div>
              </section>

              <section className="mt-5 rounded-2xl border bg-muted/20 p-4"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span className="font-bold">{formatCurrency(order?.subtotalAmount ?? order?.subtotal ?? total)}</span></div>{Number(order?.discountAmount ?? 0) > 0 ? <div className="mt-2 flex justify-between text-xs"><span className="text-muted-foreground">Diskon</span><span className="font-bold text-rose-600">-{formatCurrency(order.discountAmount)}</span></div> : null}<div className="mt-3 flex justify-between border-t pt-3"><span className="font-black">Total</span><span className="text-lg font-black text-primary">{formatCurrency(total)}</span></div><p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" /> Sumber: DjiwaApp</p></section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
