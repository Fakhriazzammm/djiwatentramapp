import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { currency } from "./types";
import { ReceiptPrinterAnimation } from "./receipt-printer-animation";

export type PaymentDocumentAnimationProps = {
  children: ReactNode;
  isCashierTicket: boolean;
  orderReference: string;
  paymentLabel: string;
  statusLabel: string;
  total: number;
};

type PaymentDocumentBodyProps = Omit<PaymentDocumentAnimationProps, "isCashierTicket">;

function CashierTicketAnimation({ children, orderReference, paymentLabel, statusLabel, total }: PaymentDocumentBodyProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-label="Tiket pembayaran tunai" className="mx-auto mb-3 w-full max-w-sm">
      <div className="relative overflow-hidden rounded-[24px] border border-amber-200 bg-amber-50 p-3 pb-5 shadow-[0_20px_36px_-20px_rgba(146,64,14,0.35)]">
        <div className="flex items-center justify-between px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-600 text-white"><Wallet className="h-4 w-4" /></div>
          <div className="rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-amber-800">Tiket pembayaran</div>
        </div>
        <div className="mt-2 overflow-hidden rounded-[14px] border border-amber-300 bg-white shadow-sm">
          <div className="border-b border-dashed border-amber-200 px-3 py-2 font-mono text-[10px] text-amber-950">
            <div className="flex items-center justify-between gap-2"><span className="text-amber-700">ORDER</span><span className="font-black">{orderReference}</span></div>
            <div className="mt-1 flex items-center justify-between gap-2"><span className="text-amber-700">PAYMENT</span><span className="font-black">{paymentLabel}</span></div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-amber-100 pt-2"><span className="text-amber-700">TOTAL BAYAR</span><span className="text-sm font-black">{currency(total)}</span></div>
          </div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="px-3 py-3 text-center"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Belum lunas</p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-amber-950">Tunjukkan tiket ini ke kasir untuk menyelesaikan pembayaran.</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800"><LoaderCircle className="h-3 w-3" /> {statusLabel}</div>
          </motion.div>
          <div aria-hidden="true" className="h-2 border-t border-dashed border-amber-300 bg-amber-100" />
        </div>
      </div>
      <AnimatePresence initial={false}>
        <motion.div
          key="cashier-ticket-content"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: reduceMotion ? 0 : 0.28 }}
          className="sr-only"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

export function PaymentDocumentAnimation(props: PaymentDocumentAnimationProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {props.isCashierTicket ? (
        <motion.div key="cashier-ticket" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.28 }}>
          <CashierTicketAnimation {...props} />
        </motion.div>
      ) : (
        <motion.div key="paid-receipt" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.28 }}>
          <ReceiptPrinterAnimation orderReference={props.orderReference} total={props.total} paymentLabel={props.paymentLabel} statusLabel={props.statusLabel}>
            {props.children}
          </ReceiptPrinterAnimation>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
