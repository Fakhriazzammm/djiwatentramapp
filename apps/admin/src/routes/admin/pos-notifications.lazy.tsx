import { createLazyFileRoute } from "@tanstack/react-router";
import { Bell, Megaphone, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useYumiAuth } from "@/hooks/useYumiAuth";

export const Route = createLazyFileRoute("/admin/pos-notifications")({
  component: PosNotificationsAdminPage,
});

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-notifications`;

function PosNotificationsAdminPage() {
  const { token, isAdmin } = useYumiAuth();
  const [notificationType, setNotificationType] = useState<"admin_info" | "admin_briefing">("admin_info");
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!token || !isAdmin) {
      toast.error("Sesi admin tidak tersedia.");
      return;
    }
    if (!title.trim() || !message.trim()) {
      toast.error("Judul dan isi wajib diisi.");
      return;
    }
    setSending(true);
    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "create_admin",
          notificationType,
          priority,
          title: title.trim(),
          message: message.trim(),
          targetRole: targetRole.trim() || null,
          targetBranchId: targetBranchId.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || "Gagal mengirim notifikasi");
      toast.success("Notifikasi berhasil dikirim ke POS.");
      setTitle("");
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengirim notifikasi");
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Halaman ini hanya untuk admin.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bell className="h-5 w-5" /></div>
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">POS communication</p><h1 className="text-2xl font-black tracking-tight">Notifikasi POS</h1><p className="mt-1 text-sm text-muted-foreground">Kirim informasi operasional atau briefing ke kasir melalui pusat notifikasi POS.</p></div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold">Jenis notifikasi<select value={notificationType} onChange={(event) => setNotificationType(event.target.value as typeof notificationType)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="admin_info">Informasi admin</option><option value="admin_briefing">Briefing shift</option></select></label>
          <label className="text-xs font-bold">Prioritas<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="normal">Normal — tanpa suara</option><option value="high">Tinggi — alert visual</option><option value="urgent">Urgent — alert + suara</option></select></label>
        </div>
        <label className="mt-4 block text-xs font-bold">Judul<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Briefing Shift Sore" className="mt-2" maxLength={160} /></label>
        <label className="mt-4 block text-xs font-bold">Isi pesan<Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tulis informasi atau instruksi untuk tim POS..." className="mt-2 min-h-32" maxLength={4000} /></label>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-xs font-bold">Target role <Input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Kosongkan untuk semua role" className="mt-2" /></label><label className="text-xs font-bold">Target branch ID <Input value={targetBranchId} onChange={(event) => setTargetBranchId(event.target.value)} placeholder="Kosongkan untuk semua cabang" className="mt-2" /></label></div>
        <div className="mt-5 flex justify-end"><Button type="button" disabled={sending} onClick={submit} className="gap-2"><Send className="h-4 w-4" />{sending ? "Mengirim..." : "Kirim ke POS"}</Button></div>
      </section>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-relaxed text-blue-900"><Megaphone className="mb-1 inline h-4 w-4" /> Notifikasi order dan status pembayaran tetap dibuat dari data order server. Halaman ini hanya membuat informasi/briefing admin.</div>
    </div>
  );
}
