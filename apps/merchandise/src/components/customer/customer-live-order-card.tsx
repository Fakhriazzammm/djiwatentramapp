import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock3, PackageCheck, X } from "lucide-react";
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
  if (!value) return "Estimasi maksimal 30 menit";
  const remaining = Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(remaining) || remaining <= 0) return "Melewati estimasi";
  return `Estimasi maksimal ${remaining} menit lagi`;
}

function lateText(deadline?: string | null) {
  if (!deadline) return "";
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(deadline).getTime()) / 60000));
  return `Maaf, pesananmu mengalami keterlambatan · Terlambat ${minutes} menit`;
}

export function CustomerLiveOrderCard({ order, onOpen }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [, refreshClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refreshClock((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const status = order.trackingStatus || (order.status === "pending" ? "pending_payment" : order.status);
  const label = LABELS[status] || "Pesanan sedang diproses";
  const total = Math.max(0, order.trackingGroupCount || 0);
  const finished = Math.min(total, Math.max(0, order.trackingFinishedGroupCount || 0));
  const progress = total > 0 ? Math.max(8, Math.round((finished / total) * 100)) : status === "completed" ? 100 : 18;
  const terminal = status === "completed" || status === "cancelled";
  const deadlinePassed = Boolean(order.slaDeadlineAt && new Date(order.slaDeadlineAt).getTime() <= Date.now());
  const late = !terminal && deadlinePassed && (total === 0 || finished < total);
  const trackingExpired = Boolean(order.slaDeadlineAt && Date.now() >= new Date(order.slaDeadlineAt).getTime() + 10 * 60 * 1000);
  if (dismissed || trackingExpired) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
      className="fixed inset-x-3 bottom-[calc(4.125rem+max(1.25rem,var(--safe-area-bottom)))] z-30 mx-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-primary/20 bg-card p-2.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
      aria-label={`Lihat status pesanan ${order.orderNumber}`}
    >
      <button type="button" aria-label="Sembunyikan tracking pesanan" onClick={(event) => { event.stopPropagation(); setDismissed(true); }} className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-2 pr-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {terminal ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Pesanan aktif · #{order.orderNumber}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-black text-foreground">{label}</span>
          <span className={`mt-0.5 flex items-center gap-1 text-[9px] font-bold ${late ? "text-destructive" : "text-muted-foreground"}`}><Clock3 className="h-3 w-3" />{terminal ? "Status final" : late ? lateText(order.slaDeadlineAt) : etaText(order.estimatedReadyAt || order.slaDeadlineAt)}</span>
        </span>
      </div>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`Progress ${progress}%`}>
        <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.45 }} />
      </span>
      <span className="mt-1.5 flex items-center justify-between text-[9px] font-bold text-muted-foreground">
        <span>{total > 0 ? `${finished}/${total} bagian siap` : "Pembaruan otomatis"}</span>
        <span className="rounded-full bg-primary px-2 py-1 text-[9px] font-black text-primary-foreground">Detail</span>
      </span>
    </motion.div>
  );
}
