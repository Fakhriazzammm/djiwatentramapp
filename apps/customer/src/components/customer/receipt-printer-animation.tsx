import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { currency } from "./types";

export type ReceiptPrinterStage = "processing" | "printing" | "complete";

type ReceiptPrinterAnimationProps = {
  orderReference: string;
  total: number;
  paymentLabel: string;
  statusLabel: string;
  finalStage?: ReceiptPrinterStage;
  variant?: "paid" | "cashier-ticket";
  children: ReactNode;
};

const toothCount = 32;
const toothDepth = 4;
const toothPoints = Array.from({ length: toothCount * 2 }, (_, index) => {
  const x = 100 - ((index + 1) * 100) / (toothCount * 2);
  const y = index % 2 === 0 ? "100%" : `calc(100% - ${toothDepth}px)`;
  return `${x}% ${y}`;
}).join(", ");
const receiptClipPath = `polygon(0 0, 100% 0, 100% calc(100% - ${toothDepth}px), ${toothPoints})`;
const paperFeedKeyframes = ["translateY(-92%)", "translateY(-68%)", "translateY(-40%)", "translateY(0%)"];

export function ReceiptPrinterAnimation({ orderReference, total, paymentLabel, statusLabel, finalStage = "complete", variant = "paid", children }: ReceiptPrinterAnimationProps) {
  const reduceMotion = useReducedMotion();
  const isCashierTicket = variant === "cashier-ticket";
  const accent = isCashierTicket ? {
    shell: "border-amber-200 bg-amber-50 shadow-[0_20px_36px_-20px_rgba(146,64,14,0.35),inset_0_1px_0_rgba(255,255,255,0.5)]",
    mark: "bg-amber-600 text-white",
    badge: "border-amber-200 bg-white/80 text-amber-800",
    terminal: "border-amber-300 bg-amber-950 text-amber-50",
    terminalMuted: "text-amber-200",
    terminalText: "text-amber-50",
    terminalBorder: "border-amber-800",
    paper: "bg-amber-50",
    bar: "bg-amber-950",
  } : {
    shell: "border-border bg-muted/70 shadow-[0_20px_36px_-20px_rgba(9,9,11,0.35),inset_0_1px_0_rgba(255,255,255,0.35)]",
    mark: "bg-primary text-primary-foreground",
    badge: "border-border bg-background/80 text-muted-foreground",
    terminal: "border-border bg-zinc-900 text-zinc-100",
    terminalMuted: "text-zinc-400",
    terminalText: "text-zinc-100",
    terminalBorder: "border-zinc-700",
    paper: "bg-white",
    bar: "bg-zinc-900",
  };
  const paperRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<ReceiptPrinterStage>(reduceMotion ? finalStage : "processing");

  useEffect(() => {
    if (reduceMotion) {
      setStage(finalStage);
      return;
    }
    setStage("processing");
    const printingTimer = window.setTimeout(() => setStage("printing"), 420);
    const completeTimer = window.setTimeout(() => setStage(finalStage), 2350);
    return () => {
      window.clearTimeout(printingTimer);
      window.clearTimeout(completeTimer);
    };
  }, [finalStage, reduceMotion, orderReference]);

  useEffect(() => {
    if (stage !== "printing" && stage !== "complete") return;
    const scrollTimer = window.setTimeout(() => {
      paperRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    }, stage === "printing" ? 120 : 180);
    return () => window.clearTimeout(scrollTimer);
  }, [reduceMotion, stage]);

  const statusText = useMemo(() => {
    if (stage === "processing") return "Memproses pesanan";
    if (stage === "printing") return "Menyiapkan struk";
    return statusLabel;
  }, [stage, statusLabel]);
  const isComplete = stage === "complete";

  return (
    <section aria-label="Status pembuatan struk" className="mx-auto mb-3 w-full max-w-sm">
      <div className={cn("relative isolate overflow-visible rounded-[24px] border p-3 pb-7", accent.shell)}>
        <div className="relative z-10 flex h-10 items-start justify-between px-1">
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black", accent.mark)}>{isCashierTicket ? "T" : "D"}</div>
          <div className={cn("rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em]", accent.badge)}>{isCashierTicket ? "Tiket Pembayaran" : "Djiwa Tentram"}</div>
        </div>

        <div className={cn("relative z-10 overflow-hidden rounded-[14px] border p-3 shadow-inner", accent.terminal)}>
          <div className="space-y-2 font-mono text-[10px]">
            <div className={cn("flex items-center justify-between gap-2", accent.terminalMuted)}><span>ORDER</span><span className={cn("truncate font-bold", accent.terminalText)}>{orderReference}</span></div>
            <div className={cn("flex items-center justify-between gap-2", accent.terminalMuted)}><span>PAYMENT</span><span className={cn("font-bold", accent.terminalText)}>{paymentLabel}</span></div>
            <div className={cn("flex items-center justify-between gap-2 border-t pt-2", accent.terminalMuted, accent.terminalBorder)}><span>{isCashierTicket ? "TOTAL BAYAR" : "TOTAL"}</span><span className={cn("font-black", accent.terminalText)}>{currency(total)}</span></div>
            <div className={cn("flex items-center gap-2 pt-1", accent.terminalMuted)}><AnimatePresence initial={false} mode="wait"><motion.span key={isComplete ? "complete" : "working"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.16 }} aria-hidden="true">{isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400 motion-reduce:animate-none" />}</motion.span></AnimatePresence><span aria-live="polite">{statusText}</span></div>
          </div>
        </div>

        <div className={cn("relative z-10 -mt-1 px-5", stage === "complete" ? "h-auto overflow-visible" : "h-[46rem] overflow-hidden")}>
          <motion.div
            ref={paperRef}
            animate={{ opacity: 1, transform: stage === "processing" && !reduceMotion ? "translateY(-92%)" : stage === "printing" && !reduceMotion ? paperFeedKeyframes : "translateY(0%)" }}
            className={cn("relative min-h-[46rem] px-3 py-4 font-mono text-zinc-900 shadow-[0_8px_24px_rgba(9,9,11,0.16)]", accent.paper)}
            data-receipt-export-root="true"
            initial={false}
            transition={{ opacity: { duration: 0.18 }, transform: { duration: reduceMotion ? 0 : stage === "printing" ? 2.4 : 0.35, ease: stage === "printing" ? "linear" : [0.23, 1, 0.32, 1] } }}
            style={{ clipPath: receiptClipPath }}
          >
            <div className="receipt-paper-content text-[10px] leading-relaxed">{children}</div>
          </motion.div>
        </div>

        <div className={cn("absolute inset-x-6 top-[10.6rem] z-40 h-2 rounded shadow-inner", accent.bar)} />
      </div>
    </section>
  );
}
