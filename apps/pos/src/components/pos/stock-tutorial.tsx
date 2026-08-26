import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

type TutorialStep = {
  target: string;
  eyebrow: string;
  title: string;
  description: string;
};

const STEPS: TutorialStep[] = [
  { target: "stock-button", eyebrow: "Fitur baru", title: "Atur stok lebih cepat", description: "Gunakan tombol Stok di samping pencarian untuk mengatur menu tanpa meninggalkan halaman kasir." },
  { target: "stock-category", eyebrow: "Langkah 1 dari 3", title: "Pilih kategori dan subkategori", description: "Filter kategori lalu subkategori agar produk yang ingin diubah cepat ditemukan." },
  { target: "stock-toggle", eyebrow: "Langkah 2 dari 3", title: "Tandai tersedia atau SOLD", description: "Toggle OFF menandai produk SOLD. Produk tetap tersimpan dan bisa diaktifkan kembali." },
  { target: "stock-checkbox", eyebrow: "Langkah 3 dari 3", title: "Ubah beberapa produk sekaligus", description: "Centang produk untuk menampilkan aksi massal di bagian bawah panel." },
];

function getWibDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function getShiftKey(shiftName: string) {
  const normalized = shiftName.trim().toLowerCase();
  if (normalized.includes("pagi")) return "pagi";
  if (normalized.includes("sore")) return "sore";
  return null;
}

export function shouldShowStockTutorial(shiftName: string) {
  const dateKey = getWibDateKey();
  if (dateKey > "2026-08-29") return false;
  const shiftKey = getShiftKey(shiftName);
  if (!shiftKey || typeof window === "undefined") return false;
  return window.localStorage.getItem(`pos-stock-tutorial:${dateKey}:${shiftKey}`) !== "done";
}

export function StockTutorial({ open, onOpenStock, onFinish }: { open: boolean; onOpenStock: () => void; onFinish: () => void }) {
  const reduceMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = STEPS[stepIndex];

  useEffect(() => {
    if (!open) return;
    const updateTarget = () => {
      const target = document.querySelector(`[data-stock-tutorial-target="${step.target}"]`);
      setTargetRect(target?.getBoundingClientRect() ?? null);
    };
    updateTarget();
    const timer = window.setTimeout(updateTarget, 180);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", updateTarget); window.removeEventListener("scroll", updateTarget, true); };
  }, [open, step.target, stepIndex]);

  const spotlightStyle = useMemo(() => targetRect ? ({ left: Math.max(8, targetRect.left - 6), top: Math.max(8, targetRect.top - 6), width: targetRect.width + 12, height: targetRect.height + 12 }) : undefined, [targetRect]);
  if (!open) return null;

  const finish = () => { onFinish(); };
  const next = () => {
    if (stepIndex === 0) onOpenStock();
    if (stepIndex >= STEPS.length - 1) { finish(); return; }
    setStepIndex((value) => value + 1);
  };

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Panduan Pengaturan Stok">
      <div className="absolute inset-0 bg-slate-950/55" onClick={finish} />
      {spotlightStyle ? <div className="pointer-events-none absolute rounded-2xl border-2 border-white shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]" style={spotlightStyle} /> : null}
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }} className="absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto max-w-md rounded-[24px] bg-white p-4 text-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">{step.eyebrow}</p><h2 className="mt-1 text-base font-black tracking-tight">{step.title}</h2></div><button type="button" onClick={finish} aria-label="Lewati panduan" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button></div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{step.description}</p>
        <div className="mt-4 flex items-center justify-between gap-3"><div className="flex gap-1.5" aria-label={`Langkah ${stepIndex + 1} dari ${STEPS.length}`}>{STEPS.map((item, index) => <span key={item.target} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? "w-6 bg-blue-600" : "w-1.5 bg-slate-200"}`} />)}</div><div className="flex items-center gap-2"><button type="button" onClick={finish} className="min-h-11 rounded-xl px-3 text-xs font-bold text-slate-500">Lewati</button><button type="button" onClick={next} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-black text-white active:scale-[.97]">{stepIndex === STEPS.length - 1 ? "Selesai" : "Berikutnya"}<ArrowRight className="h-3.5 w-3.5" /></button></div></div>
      </motion.div>
    </div>
  );
}
