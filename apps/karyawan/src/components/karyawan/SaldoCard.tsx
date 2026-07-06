import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Wallet, TrendingUp } from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";

// ── Inline formatter ──────────────────────────────────────────

function fmtIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Types ─────────────────────────────────────────────────────

type SaldoData = {
  gaji: number;
  tunjangan: number;
  bonus: number;
  total: number;
};

interface SaldoCardProps {
  staffId: string;
}

// ── Sub-components ────────────────────────────────────────────

function SaldoItem({
  emoji,
  label,
  value,
  visible,
  accentClass,
}: {
  emoji: string;
  label: string;
  value: number;
  visible: boolean;
  accentClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-lg">{emoji}</span>
      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <AnimatePresence mode="wait">
        {visible ? (
          <motion.span
            key="show"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.25 }}
            className={`text-[13px] font-extrabold ${accentClass}`}
          >
            {fmtIDR(value)}
          </motion.span>
        ) : (
          <motion.span
            key="hide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-[13px] font-extrabold text-muted-foreground/40 tracking-[0.3em]"
          >
            ****
          </motion.span>
        )}
      </AnimatePresence>
      <div className="mt-1 h-0.5 w-8 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${accentClass.replace("text-", "bg-")}`}
          initial={{ width: 0 }}
          animate={{ width: value > 0 ? "100%" : "0%" }}
          transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
            <div className="h-2 w-12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-muted" />
    </div>
  );
}


// ── Main Component ────────────────────────────────────────────

export function SaldoCard({ staffId }: SaldoCardProps) {
  const [saldo, setSaldo] = useState<SaldoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("saldo_visible") === "true";
  });

  const toggleVisible = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      localStorage.setItem("saldo_visible", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();

        // Ambil payroll run items untuk bulan ini
        const now = new Date();
        const monthName = now.toLocaleDateString("id-ID", { month: "long" });
        const year = now.getFullYear();
        const periodName = `${monthName} ${year}`;

        const { data } = await supabase
          .schema("pos")
          .from("payroll_run_items")
          .select(
            "shift_pay, daily_allowance_total, bonus_pay, gross_pay, payroll_run_id"
          )
          .eq("user_id", staffId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!cancelled) {
          if (data && data.length > 0) {
            const item = data[0];
            setSaldo({
              gaji: item.shift_pay ?? 0,
              tunjangan: item.daily_allowance_total ?? 0,
              bonus: item.bonus_pay ?? 0,
              total: item.gross_pay ?? 0,
            });
          } else {
            setSaldo(null);
          }
        }
      } catch (e) {
        console.error("[saldo] fetch error", e);
        if (!cancelled) setSaldo(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  // ── Render ──────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;

  // Fallback: jika belum ada data, tampilkan 0 semua (bukan empty)
  const display = saldo ?? { gaji: 0, tunjangan: 0, bonus: 0, total: 0 };

  const monthLabel = new Date().toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  // Progress: total vs 4.5jt default target
  const target = 4_500_000;
  const progress = Math.min((display.total / target) * 100, 100);
  const progressColor =
    progress > 70
      ? "bg-emerald-500"
      : progress > 40
        ? "bg-amber-500"
        : "bg-slate-300";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-card p-4 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold tracking-tight">
              Saldo {monthLabel}
            </p>
          </div>
        </div>
        <button
          onClick={toggleVisible}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={visible ? "Sembunyikan nominal" : "Tampilkan nominal"}
        >
          {visible ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* 3 Kolom */}
      <div className="grid grid-cols-3 gap-1 py-1">
        <SaldoItem
          emoji="💵"
          label="Gaji"
          value={display.gaji}
          visible={visible}
          accentClass="text-emerald-600"
        />
        <SaldoItem
          emoji="🎁"
          label="Tunjangan"
          value={display.tunjangan}
          visible={visible}
          accentClass="text-blue-600"
        />
        <SaldoItem
          emoji="🏆"
          label="Bonus"
          value={display.bonus}
          visible={visible}
          accentClass="text-amber-600"
        />
      </div>

      {/* Progress Bar */}
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5" />
            Progress target
          </span>
          <span className="font-bold tabular-nums">
            {visible ? fmtIDR(display.total) : "****"} / {fmtIDR(target)}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${progressColor} shadow-sm`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
