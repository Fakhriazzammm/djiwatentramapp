import { Link, createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, Loader2, XCircle } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHybridHppProductMap, useHybridOrders } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateOrderStatus } from "@/hooks/use-hybrid-write-actions";

export const Route = createLazyFileRoute("/admin/orders/$orderNumber")({ component: AdminOrderDetailPage });

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const normalize = (value: unknown) => String(value ?? "").trim().replace(/^#/, "").toUpperCase();
const statusLabel: Record<string, string> = { pending: "Menunggu", paid: "Dibayar", completed: "Selesai", cancelled: "Dibatalkan" };

function AdminOrderDetailPage() {
  const { orderNumber } = useParams({ from: "/admin/orders/$orderNumber" });
  const navigate = useNavigate();
  const orders = useHybridOrders({ limit: 500 });
  const hppMap = useHybridHppProductMap();
  const updateStatus = useHybridUpdateOrderStatus();
  const order = useMemo(() => (orders ?? []).find((item: any) => {
    const canonical = item.orderNumber ? getDisplayOrderNumber(String(item.orderNumber), { source: item.source, sourceApp: item.sourceApp, businessUnit: item.businessUnit, brandSlug: item.brandSlug, orderType: item.orderType, createdAt: Number(item.createdAt ?? item.created_at) }) : null;
    return [canonical, item.orderNumber, item.order_number, item.displayId, item._id, item.source_id].some((candidate) => normalize(candidate) === normalize(orderNumber));
  }), [orders, orderNumber]);

  if (!orders) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!order) return <div className="mx-auto max-w-3xl p-4"><Link to="/admin/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" />Kembali ke pesanan</Link><div className="mt-6 rounded-2xl border border-dashed p-10 text-center"><p className="font-bold">Order tidak ditemukan</p><p className="mt-1 text-sm text-muted-foreground">Nomor {orderNumber} belum tersedia di data order.</p></div></div>;

  const rawNumber = String(order.orderNumber ?? order.order_number ?? order.displayId ?? orderNumber);
  const displayNumber = getDisplayOrderNumber(rawNumber, { source: order.source, sourceApp: order.sourceApp, businessUnit: order.businessUnit, brandSlug: order.brandSlug, orderType: order.orderType, createdAt: Number(order.createdAt ?? order.created_at) });
  const items = Array.isArray(order.items) ? order.items : [];
  const hpp = items.reduce((sum: number, item: any) => sum + Number(hppMap?.[item.productId]?.hppPerServing ?? 0) * Number(item.quantity ?? 0), 0);
  const total = Number(order.totalAmount ?? order.total_amount ?? 0);
  const profit = total - hpp;
  const status = String(order.status ?? "").toLowerCase();
  const update = async (nextStatus: "pending" | "completed" | "cancelled") => { try { await updateStatus({ id: order._id ?? order.source_id, status: nextStatus }); toast.success(`Status diubah menjadi ${statusLabel[nextStatus]}`); } catch { toast.error("Status order gagal diperbarui"); } };

  return <div className="min-h-full bg-background px-4 pb-10 pt-4 md:px-8"><div className="mx-auto max-w-3xl"><Link to="/admin/orders" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" />Kembali ke pesanan</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Detail transaksi</p><h1 className="mt-1 font-mono text-xl font-black tracking-tight">#{displayNumber}</h1><p className="mt-1 text-xs text-muted-foreground">{new Date(Number(order.createdAt ?? order.created_at)).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}</p></div><Badge className="gap-1 px-3 py-1.5 text-xs" variant={status === "paid" || status === "completed" ? "default" : status === "cancelled" ? "destructive" : "secondary"}>{status === "paid" || status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{statusLabel[status] ?? status}</Badge></div><div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_.8fr]"><Card className="rounded-2xl"><CardHeader className="pb-3"><CardTitle className="text-sm">Item pesanan</CardTitle></CardHeader><CardContent className="space-y-3">{items.map((item: any, index: number) => <div key={`${item.productId ?? item.productName}-${index}`} className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.productName ?? item.name ?? "Item"}</p><p className="text-xs text-muted-foreground">{item.quantity ?? 0} × {rupiah(Number(item.price ?? 0))}</p></div><p className="shrink-0 text-sm font-bold">{rupiah(Number(item.price ?? 0) * Number(item.quantity ?? 0))}</p></div>)}<div className="flex items-center justify-between border-t pt-3 text-sm font-black"><span>Total pembayaran</span><span className="text-primary">{rupiah(total)}</span></div></CardContent></Card><Card className="rounded-2xl"><CardHeader className="pb-3"><CardTitle className="text-sm">Ringkasan pembayaran</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Pelanggan</span><span className="font-semibold">{order.customerName ?? order.customer_name ?? "Pelanggan"}</span></div><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><CreditCard className="h-3.5 w-3.5" />Metode</span><span className="font-semibold uppercase">{order.paymentMethod ?? order.payment_method ?? "-"}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Diskon</span><span>{rupiah(Number(order.discountAmount ?? order.discount_amount ?? 0))}</span></div>{hpp > 0 && <><div className="flex items-center justify-between border-t pt-3"><span className="text-muted-foreground">HPP (COGS)</span><span className="font-semibold text-orange-600">{rupiah(hpp)}</span></div><div className="flex items-center justify-between"><span className="font-bold">Laba Kotor</span><span className={`font-black ${profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rupiah(profit)} ({total ? ((profit / total) * 100).toFixed(1) : "0.0"}%)</span></div></>}</CardContent></Card></div><Card className="mt-4 rounded-2xl"><CardHeader className="pb-3"><CardTitle className="text-sm">Tindakan status</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" disabled={status === "pending"} onClick={() => void update("pending")}><Clock3 className="mr-1.5 h-4 w-4" />Pending</Button><Button variant="outline" disabled={status === "completed"} onClick={() => void update("completed")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Selesai</Button><Button variant="destructive" disabled={status === "cancelled"} onClick={() => void update("cancelled")}><XCircle className="mr-1.5 h-4 w-4" />Batalkan</Button></CardContent></Card></div></div>;
}
