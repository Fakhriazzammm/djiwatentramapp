import { useState, useCallback } from "react";
import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, FileText, Clock, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createClient } from "@/lib/client";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { useHybridStaffBySlug } from "@/hooks/use-hybrid-attendance-data";

const LEAVE_TYPES = [
  { value: "izin", label: "Izin", emoji: "📋", desc: "Keperluan pribadi" },
  { value: "cuti", label: "Cuti", emoji: "🏖️", desc: "Cuti tahunan" },
  { value: "sakit", label: "Sakit", emoji: "🏥", desc: "Surat dokter menyusul" },
  { value: "other", label: "Lainnya", emoji: "📌", desc: "Alasan lainnya" },
];

function IzinCutiSakitPage() {
  const { username } = useParams({ from: "/karyawan/$username/izin" as any }) as { username: string };
  const navigate = useNavigate();
  const { user: authUser } = useYumiAuth();
  const staff = useHybridStaffBySlug(username);

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
      navigate({ to: `/karyawan/${username}` as any });
    } catch (err: any) {
      toast.error(err.message || "Gagal mengirim pengajuan");
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, staff, leaveType, startDate, endDate, reason, navigate, username]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: `/karyawan/${username}` as any })} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-black tracking-tight">Izin / Cuti / Sakit</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
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
            {/* Leave Type Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground ml-1">
                Tipe Pengajuan
              </label>
              <div className="grid grid-cols-2 gap-2">
                {LEAVE_TYPES.map((lt) => (
                  <button
                    key={lt.value}
                    type="button"
                    onClick={() => setLeaveType(lt.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
                      leaveType === lt.value
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-transparent bg-card hover:border-border"
                    }`}
                  >
                    <span className="text-xl">{lt.emoji}</span>
                    <span className={`text-xs font-bold ${leaveType === lt.value ? "text-primary" : "text-foreground"}`}>
                      {lt.label}
                    </span>
                    <span className="text-[8px] text-muted-foreground">{lt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Tanggal Mulai</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={todayStr}
                    className="h-10 rounded-xl pl-9 font-bold text-xs"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Tanggal Selesai</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || todayStr}
                    className="h-10 rounded-xl pl-9 font-bold text-xs"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Alasan</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Jelaskan alasan pengajuan..."
                className="flex min-h-[100px] w-full rounded-xl border bg-card px-3 py-2 text-xs font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-sm font-black shadow-lg shadow-primary/20"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isSubmitting ? "MENGIRIM..." : "AJUKAN SEKARANG"}
            </Button>
          </form>
        </motion.div>
      </main>
    </div>
  );
}

export const Route = createLazyFileRoute("/karyawan/$username/izin" as any)({
  component: IzinCutiSakitPage,
});
