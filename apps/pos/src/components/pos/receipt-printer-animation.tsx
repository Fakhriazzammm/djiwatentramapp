import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const currency = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export type ReceiptPrinterStage = "processing" | "printing" | "complete";

type ReceiptPrinterAnimationProps = {
  orderReference: string;
  total: number;
  paymentLabel: string;
  statusLabel: string;
  finalStage?: ReceiptPrinterStage;
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

export function ReceiptPrinterAnimation({ orderReference, total, paymentLabel, statusLabel, finalStage = "complete", children }: ReceiptPrinterAnimationProps) {
  const reduceMotion = useReducedMotion();
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
      <div className="relative isolate overflow-visible rounded-[24px] border border-border bg-muted/70 p-3 pb-7 shadow-[0_20px_36px_-20px_rgba(9,9,11,0.35),inset_0_1px_0_rgba(255,255,255,0.35)]">
        <div className="relative z-10 flex h-10 items-start justify-between px-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-[10px] font-black text-primary-foreground">D</div>
          <div className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Djiwa Tentram</div>
        </div>

        <div className="relative z-10 overflow-hidden rounded-[14px] border border-border bg-zinc-900 p-3 text-zinc-100 shadow-inner">
          <div className="space-y-2 font-mono text-[10px]">
            <div className="flex items-center justify-between gap-2 text-zinc-400"><span>ORDER</span><span className="truncate font-bold text-zinc-100">{orderReference}</span></div>
            <div className="flex items-center justify-between gap-2 text-zinc-400"><span>PAYMENT</span><span className="font-bold text-zinc-100">{paymentLabel}</span></div>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-700 pt-2 text-zinc-400"><span>TOTAL</span><span className="font-black text-zinc-100">{currency(total)}</span></div>
            <div className="flex items-center gap-2 pt-1 text-zinc-400"><AnimatePresence initial={false} mode="wait"><motion.span key={isComplete ? "complete" : "working"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.16 }} aria-hidden="true">{isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400 motion-reduce:animate-none" />}</motion.span></AnimatePresence><span aria-live="polite">{statusText}</span></div>
          </div>
        </div>

        <div className={cn("relative z-10 -mt-1 px-5", stage === "complete" ? "h-auto overflow-visible" : "h-[26rem] overflow-hidden")}>
          <motion.div
            ref={paperRef}
            animate={{ opacity: 1, transform: stage === "processing" && !reduceMotion ? "translateY(-92%)" : stage === "printing" && !reduceMotion ? paperFeedKeyframes : "translateY(0%)" }}
            className="relative min-h-[26rem] bg-white px-3 py-4 font-mono text-zinc-900 shadow-[0_8px_24px_rgba(9,9,11,0.16)]"
            initial={false}
            transition={{ opacity: { duration: 0.18 }, transform: { duration: reduceMotion ? 0 : stage === "printing" ? 2.4 : 0.35, ease: stage === "printing" ? "linear" : [0.23, 1, 0.32, 1] } }}
            style={{ clipPath: receiptClipPath }}
          >
            <div className="receipt-paper-content text-[10px] leading-relaxed">{children}</div>
          </motion.div>
        </div>

        <div aria-hidden="true" className="absolute inset-x-6 top-[10.6rem] z-40 h-2 rounded bg-zinc-900 shadow-inner" />
      </div>
    </section>
  );
}
