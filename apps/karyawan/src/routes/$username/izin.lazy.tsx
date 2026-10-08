import { useState, useCallback } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";

const spring = { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 };
import { ArrowLeft, Check, AlertCircle, Clock, ClipboardList, Plane, Stethoscope, MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { toast } from "sonner";
import { createClient } from "@yumipos/web-shared/lib/client";
import { useStaffProfile } from "../$username.lazy";

const LEAVE_TYPES = [
  { value: "izin", label: "Izin", icon: ClipboardList, desc: "Keperluan pribadi" },
  { value: "cuti", label: "Cuti", icon: Plane, desc: "Cuti tahunan" },
  { value: "sakit", label: "Sakit", icon: Stethoscope, desc: "Surat dokter menyusul" },
  { value: "other", label: "Lainnya", icon: MoreHorizontal, desc: "Alasan lainnya" },
] satisfies Array<{ value: string; label: string; icon: LucideIcon; desc: string }>;

export const Route = createLazyFileRoute("/$username/izin")({
  component: IzinCutiSakitPage,
});

function IzinCutiSakitPage() {
  const navigate = useNavigate();
  const { staff, username } = useStaffProfile();

  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const canSubmit = leaveType && startDate && endDate && reason;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !staff?._id) return;

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("attendance_leave_requests").insert({
        user_id: staff._id,
        user_name: staff.name,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Pengajuan berhasil dikirim!");
      navigate({ to: "/$username/beranda", params: { username } });
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim pengajuan");
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, staff, leaveType, startDate, endDate, reason, navigate, username]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="min-w-0 bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 px-0 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button aria-label="Kembali ke beranda" variant="ghost" size="icon" onClick={() => navigate({ to: "/$username/beranda", params: { username } })} className="h-11 w-11 rounded-[14px]">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-black tracking-tight">Izin / Cuti / Sakit</h1>
        </div>
      </header>

      <div className="mt-4 space-y-5">
        {/* Staff Info */}
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          {staff?.photoUrl ? (
            <img src={staff.photoUrl} alt={staff.name} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-base font-black text-primary">
              {staff?.name?.charAt(0) || "?"}
            </div>
          )}
          <div>
            <p className="font-bold text-sm">{staff?.name || "Memuat..."}</p>
            <p className="text-[10px] text-muted-foreground">{staff?.roleName || ""}</p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-blue-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="text-[11px] font-medium">
              Pengajuan akan ditinjau oleh admin. Pastikan data yang diisi benar.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Leave Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">
              Tipe Pengajuan
            </label>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map((lt, i) => (
                <motion.button key={lt.value} type="button"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: i * 0.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => setLeaveType(lt.value)}
                  aria-pressed={leaveType === lt.value}
                  className={`karyawan-card flex min-h-28 flex-col items-center justify-center gap-1 border-2 p-3 transition-all ${
                    leaveType === lt.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-transparent bg-card hover:border-border"
                  }`}
                >
                  <lt.icon aria-hidden="true" className="h-5 w-5 text-primary" strokeWidth={2} />
                  <span className={`text-xs font-bold ${leaveType === lt.value ? "text-primary" : "text-foreground"}`}>
                    {lt.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{lt.desc}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Tanggal Mulai</label>
              <Input aria-label="Tanggal mulai" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={todayStr} className="karyawan-control font-bold text-xs" required />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Tanggal Selesai</label>
              <Input aria-label="Tanggal selesai" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || todayStr} className="karyawan-control font-bold text-xs" required />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Alasan</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan alasan pengajuan..."
              className="min-h-[112px] w-full rounded-[14px] border bg-card px-3 py-3 text-sm font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          {/* Submit */}
          <Button type="submit" className="h-12 w-full rounded-[14px] text-sm font-bold shadow-lg shadow-primary/20 active:scale-[.97]" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? <Clock className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isSubmitting ? "MENGIRIM..." : "AJUKAN SEKARANG"}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
