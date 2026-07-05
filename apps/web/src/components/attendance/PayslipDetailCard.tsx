import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

interface PayslipDetailCardProps {
  payslip: any;
  onDownload: (p: any) => void;
}

export function PayslipDetailCard({ payslip, onDownload }: PayslipDetailCardProps) {
  const [expandedShifts, setExpandedShifts] = useState(false);
  const [expandedBonus, setExpandedBonus] = useState(false);
  const b = payslip.breakdown ?? {};
  const badgeMap: Record<string, { label: string; cls: string }> = {
    generated: { label: "Generated", cls: "bg-gray-100 text-gray-600" },
    sent: { label: "Dikirim", cls: "bg-blue-100 text-blue-600" },
    acknowledged: { label: "Diterima", cls: "bg-emerald-100 text-emerald-600" },
    disputed: { label: "Dispute", cls: "bg-red-100 text-red-600" },
  };
  const badge = badgeMap[payslip.status] ?? badgeMap.generated;

  const items: { label: string; value: number; color?: string }[] = [];
  if ((b.monthly_fixed_salary ?? 0) > 0) items.push({ label: "Gaji Tetap", value: b.monthly_fixed_salary });
  const shiftWorkDates = b.shift_work_dates ?? [];
  if ((b.total_allowance ?? 0) > 0) items.push({ label: "Tunjangan Transportasi", value: b.total_allowance });
  if ((b.total_overtime_bonus ?? 0) > 0) items.push({ label: "Bonus Lembur", value: b.total_overtime_bonus, color: "text-emerald-600" });
  const bonusTarget = b.bonus_target ?? {};
  const bonusShifts = bonusTarget.shifts ?? [];
  if ((b.total_penalty ?? 0) > 0) items.push({ label: "Denda Keterlambatan", value: -Math.abs(b.total_penalty), color: "text-red-600" });

  return (
    <div className="group rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.02]">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-xs">{payslip.period_name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{b.role_name ?? payslip.role_name ?? ""}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Breakdown */}
      {items.length > 0 && (
        <div className="space-y-1 mb-3">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">{item.label}</span>
              <span className={`font-semibold tabular-nums ${item.color ?? ""}`}>
                {item.value < 0
                  ? `-${formatCurrency(Math.abs(item.value))}`
                  : formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Gaji Shift — clickable expandable */}
      {(b.total_shift_pay ?? 0) > 0 && (
        <div className="space-y-1 mb-3">
          <button
            onClick={() => setExpandedShifts(!expandedShifts)}
            className="flex w-full items-center justify-between text-[11px] group/collapse"
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              Gaji Shift ({b.shifts ?? 0} shift)
              {shiftWorkDates.length > 0 && (
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expandedShifts ? "rotate-180" : ""}`} />
              )}
            </span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(b.total_shift_pay ?? 0)}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {expandedShifts && shiftWorkDates.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 pl-2 border-l-2 border-primary/30 space-y-1">
                  {shiftWorkDates.map((dateStr: string, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />
                        <span className="text-muted-foreground">{dateStr}</span>
                      </div>
                      <span className="font-semibold shrink-0 ml-2">
                        {formatCurrency(b.base_shift_rate ?? 0)}/shift
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Bonus Target — clickable expandable */}
      {(bonusTarget.total_bonus ?? 0) > 0 && (
        <div className="space-y-1 mb-3">
          <button
            onClick={() => setExpandedBonus(!expandedBonus)}
            className="flex w-full items-center justify-between text-[11px] group/collapse"
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              Bonus Target
              {bonusShifts.length > 0 && (
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expandedShifts ? "rotate-180" : ""}`} />
              )}
            </span>
            <span className="font-semibold tabular-nums text-emerald-600">
              {formatCurrency(bonusTarget.total_bonus ?? 0)}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {expandedBonus && bonusShifts.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 pl-2 border-l-2 border-emerald-200 space-y-1">
                  {bonusShifts.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-muted-foreground truncate">{s.shiftName}</span>
                        <span className="text-muted-foreground/50 shrink-0">• {s.date}</span>
                      </div>
                      <span className="font-semibold text-emerald-600 shrink-0 ml-2">
                        +{formatCurrency(s.bonus)}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Summaries */}
      <div className="border-t border-border/50 my-2" />
      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Total Gross</span>
          <span className="font-semibold tabular-nums">{formatCurrency(payslip.gross_pay ?? 0)}</span>
        </div>
        {(payslip.deductions ?? 0) > 0 && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Potongan</span>
            <span className="font-semibold tabular-nums text-red-600">-{formatCurrency(payslip.deductions)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/30">
          <span>Net Diterima</span>
          <span className="text-emerald-600 tabular-nums">{formatCurrency(payslip.net_pay ?? 0)}</span>
        </div>
      </div>

      {/* Timestamps */}
      {(payslip.sent_at || payslip.acknowledged_at) && (
        <p className="text-[9px] text-muted-foreground/60 mb-2">
          {payslip.sent_at && `Dikirim: ${new Date(payslip.sent_at).toLocaleDateString("id-ID")}`}
          {payslip.sent_at && payslip.acknowledged_at && " · "}
          {payslip.acknowledged_at && `Diterima: ${new Date(payslip.acknowledged_at).toLocaleDateString("id-ID")}`}
        </p>
      )}

      {/* Download */}
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-lg text-[10px] font-bold h-8"
        onClick={() => onDownload(payslip)}
      >
        <Download className="mr-1.5 h-3 w-3" />
        Download PDF
      </Button>
    </div>
  );
}
