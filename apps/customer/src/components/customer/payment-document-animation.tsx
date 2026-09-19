import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { ReceiptPrinterAnimation } from "./receipt-printer-animation";

export type PaymentDocumentAnimationProps = {
  children: ReactNode;
  isCashierTicket: boolean;
  orderReference: string;
  paymentLabel: string;
  statusLabel: string;
  total: number;
};

export function PaymentDocumentAnimation(props: PaymentDocumentAnimationProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={props.isCashierTicket ? "cashier-ticket" : "paid-receipt"}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.28 }}
      >
        <ReceiptPrinterAnimation
          orderReference={props.orderReference}
          total={props.total}
          paymentLabel={props.paymentLabel}
          statusLabel={props.statusLabel}
          variant={props.isCashierTicket ? "cashier-ticket" : "paid"}
        >
          {props.children}
        </ReceiptPrinterAnimation>
      </motion.div>
    </AnimatePresence>
  );
}
