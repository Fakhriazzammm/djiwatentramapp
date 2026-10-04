import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock3, PackageCheck } from "lucide-react";
import type { CustomerOrder } from "@/hooks/use-customer-data";

type Props = { order: CustomerOrder; onOpen: () => void };

const LABELS: Record<string, string> = {
  pending_payment: "Menunggu pembayaran",
  paid: "Pembayaran terkonfirmasi",
  received: "Pesanan diterima",
  preparing: "Sedang dibuat",
  ready_for_pickup: "Siap diambil",
  ready_for_table: "Siap diantar ke meja",
  out_for_delivery: "Sedang diantar",
  completed: "Pesanan selesai",
  cancelled: "Pesanan dibatalkan",
};

function etaText(value?: string | null) {
  if (!value) return "ETA belum tersedia";
  const remaining = Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(remaining) || remaining <= 0) return "Sedang diproses";
  return `Siap sekitar ${remaining} menit lagi`;
}

export function CustomerLiveOrderCard({ order, onOpen }: Props) {
  const status = order.trackingStatus || (order.status === "pending" ? "pending_payment" : order.status);
  const label = LABELS[status] || "Pesanan sedang diproses";
  const total = Math.max(0, order.trackingGroupCount || 0);
  const finished = Math.min(total, Math.max(0, order.trackingFinishedGroupCount || 0));
  const progress = total > 0 ? Math.max(8, Math.round((finished / total) * 100)) : status === "completed" ? 100 : 18;
  const terminal = status === "completed" || status === "cancelled";

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="w-full rounded-[22px] border border-primary/15 bg-card p-4 text-left shadow-sm"
      aria-label={`Lihat status pesanan ${order.orderNumber}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {terminal ? <CheckCircle2 className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">Pesanan aktif · #{order.orderNumber}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          </span>
          <span className="mt-1 block text-base font-black text-foreground">{label}</span>
          <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Clock3 className="h-3 w-3" />{terminal ? "Status final" : etaText(order.estimatedReadyAt)}</span>
        </span>
      </div>
      <span className="mt-3 block h-2 overflow-hidden rounded-full bg-muted" aria-label={`Progress ${progress}%`}>
        <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.45 }} />
      </span>
      <span className="mt-2 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
        <span>{total > 0 ? `${finished}/${total} bagian siap` : "Pembaruan otomatis"}</span>
        <span className="text-primary">Detail pesanan</span>
      </span>
    </motion.button>
  );
}
