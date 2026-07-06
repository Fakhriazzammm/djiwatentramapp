import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";

const spring = { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 };

function fmtIDR(n: number) { return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:0}).format(n); }

function SaldoItem({ emoji, label, value, visible, accentClass }: { emoji: string; label: string; value: number; visible: boolean; accentClass: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs">{emoji}</span>
      <span className="text-[7px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
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
  return (<div className="rounded-lg border bg-card p-2"><div className="flex items-center justify-between mb-1.5"><div className="h-2.5 w-20 animate-pulse rounded bg-muted"/><div className="h-4 w-4 animate-pulse rounded-full bg-muted"/></div><div className="grid grid-cols-3">{[1,2,3].map(i=><div key={i} className="flex flex-col items-center"><div className="h-4 w-4 animate-pulse rounded-full bg-muted"/><div className="h-1 w-8 animate-pulse rounded bg-muted mt-0.5"/><div className="h-2 w-12 animate-pulse rounded bg-muted mt-0.5"/></div>)}</div></div>);
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
      className="rounded-lg border bg-card p-2 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
            <Wallet className="h-2.5 w-2.5" />
          </div>
          <p className="text-[9px] font-extrabold">Saldo {ml}</p>
        </div>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setVisible(v => { localStorage.setItem("saldo_visible", String(!v)); return !v; })}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors">
          {visible ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
        </motion.button>
      </div>
      <div className="grid grid-cols-3">
        <SaldoItem emoji="💵" label="Gaji" value={d.gaji} visible={visible} accentClass="text-emerald-600" />
        <SaldoItem emoji="🎁" label="Tunjangan" value={d.tunjangan} visible={visible} accentClass="text-blue-600" />
        <SaldoItem emoji="🏆" label="Bonus" value={d.bonus} visible={visible} accentClass="text-amber-600" />
      </div>
    </motion.div>
  );
}
