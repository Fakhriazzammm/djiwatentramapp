import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { Djiwa3DIcon, type Djiwa3DIconName, Skeleton } from "@yumipos/web-shared";

const spring = { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 };

function fmtIDR(n: number) { return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:0}).format(n); }

function SaldoItem({ illustration, label, value, visible, accentClass }: { illustration: Djiwa3DIconName; label: string; value: number; visible: boolean; accentClass: string }) {
  return (
    <div className="flex flex-col items-center">
      <Djiwa3DIcon alt="" className="mb-1 h-10 w-10 origin-center scale-[1.25]" name={illustration} size="md" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <AnimatePresence mode="wait">
        {visible ? (
          <motion.span key="s" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring}
            className={`text-[10px] font-extrabold ${accentClass}`}>{fmtIDR(value)}</motion.span>
        ) : (
          <motion.span key="h" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[10px] font-extrabold text-muted-foreground/40 tracking-[0.2em]">****</motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoadingSkeleton() {
  return (<div className="karyawan-card border bg-card p-4" role="status" aria-label="Memuat saldo"><Skeleton className="mb-3 h-4 w-28 rounded-lg"/><div className="grid grid-cols-3 gap-3">{[1,2,3].map(i=><div key={i} className="space-y-2"><Skeleton className="mx-auto h-4 w-4 rounded-full"/><Skeleton className="mx-auto h-3 w-14 rounded-lg"/><Skeleton className="mx-auto h-3 w-16 rounded-lg"/></div>)}</div></div>);
}

type SaldoData = { gaji: number; tunjangan: number; bonus: number; total: number };

export function SaldoCard({ staffId }: { staffId: string }) {
  const [saldo, setSaldo] = useState<SaldoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(() => typeof window !== "undefined" && localStorage.getItem("saldo_visible") === "true");

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const s = createClient();
        const { data } = await s.schema("pos").from("payroll_run_items").select("shift_pay,daily_allowance_total,bonus_pay,gross_pay").eq("user_id",staffId).order("created_at",{ascending:false}).limit(1);
        if (!c) data?.length ? setSaldo({ gaji: data[0].shift_pay??0, tunjangan: data[0].daily_allowance_total??0, bonus: data[0].bonus_pay??0, total: data[0].gross_pay??0 }) : setSaldo(null);
      } catch { if (!c) setSaldo(null); }
      finally { if (!c) setLoading(false); }
    })();
    return () => { c = true; };
  }, [staffId]);

  if (loading) return <LoadingSkeleton />;
  const d = saldo ?? { gaji: 0, tunjangan: 0, bonus: 0, total: 0 };
  const ml = new Date().toLocaleDateString("id-ID",{month:"long",year:"numeric"});

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="karyawan-card border bg-card p-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
            <Wallet className="h-2.5 w-2.5" />
          </div>
          <p className="text-[11px] font-extrabold">Saldo {ml}</p>
        </div>
        <motion.button aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"} whileTap={{ scale: 0.97 }} onClick={() => setVisible(v => { localStorage.setItem("saldo_visible", String(!v)); return !v; })}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] text-muted-foreground transition-colors hover:bg-muted">
          {visible ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
        </motion.button>
      </div>
      <div className="grid grid-cols-3">
        <SaldoItem illustration="payment-wallet" label="Gaji" value={d.gaji} visible={visible} accentClass="text-emerald-600" />
        <SaldoItem illustration="suppliers-purchase-order" label="Tunjangan" value={d.tunjangan} visible={visible} accentClass="text-primary" />
        <SaldoItem illustration="loyalty-points" label="Bonus" value={d.bonus} visible={visible} accentClass="text-amber-600" />
      </div>
    </motion.div>
  );
}
