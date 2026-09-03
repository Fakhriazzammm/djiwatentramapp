import { motion, useReducedMotion } from "framer-motion";
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, Gift, Mail, Phone, ShoppingCart, Sparkles, Star } from "lucide-react";
import { useState } from "react";

type MemberOnboardingProps = {
  name: string;
  onStartOrdering: () => void;
  onDismiss: () => void;
};

type ProfileCompletionOnboardingProps = {
  name: string;
  email: string;
  phone: string;
  onSave: (phone: string) => Promise<void>;
};

export function ProfileCompletionOnboarding({ name, email, phone, onSave }: ProfileCompletionOnboardingProps) {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(1);
  const [phoneValue, setPhoneValue] = useState(phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = () => {
    const normalized = phoneValue.replace(/[^\d]/g, "");
    if (normalized.length < 10) {
      setError("Nomor WhatsApp harus minimal 10 digit.");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(phoneValue);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan data profil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-6 backdrop-blur-[3px]">
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 360, damping: 30 }} role="dialog" aria-modal="true" aria-labelledby="profile-completion-title" className="w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-background shadow-2xl">
        <div className="flex justify-center pt-3"><span className="h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" /></div>
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Phone className="h-6 w-6" /></div>
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Langkah {step} dari 2</p><h2 id="profile-completion-title" className="mt-0.5 text-xl font-black tracking-tight">Lengkapi profil untuk lanjut</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Halo {name}, data ini diperlukan untuk invoice Mayar, top up, dan status pembayaran.</p></div>
          </div>
          <div className="mt-5 flex gap-1.5" aria-label="Progress pengisian profil"><span className="h-1.5 flex-1 rounded-full bg-primary" /><span className={`h-1.5 flex-1 rounded-full ${step === 2 ? "bg-primary" : "bg-muted"}`} /></div>

          {step === 1 ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-border bg-muted/35 p-3"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email akun</p><p className="text-sm font-bold">{email || "Belum tersedia"}</p></div></div></div>
              <label className="block space-y-1.5"><span className="flex items-center gap-2 text-xs font-bold"><Phone className="h-3.5 w-3.5 text-primary" />Nomor WhatsApp <span className="text-destructive">*</span></span><input autoFocus className="min-h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" inputMode="tel" onChange={(event) => setPhoneValue(event.target.value)} placeholder="08xxxxxxxxxx" type="tel" value={phoneValue} /></label>
              {error ? <p className="text-xs font-semibold text-destructive" role="alert">{error}</p> : <p className="text-[11px] leading-relaxed text-muted-foreground">Nomor ini digunakan untuk konfirmasi pembayaran dan komunikasi pesanan.</p>}
              <button className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm active:scale-[.97]" onClick={handleContinue} type="button"><span>Lanjutkan</span><ChevronRight className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="text-sm font-black">Konfirmasi data pembayaran</p></div><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-emerald-800/70">Email</dt><dd className="font-bold">{email}</dd></div><div className="flex justify-between gap-3"><dt className="text-emerald-800/70">WhatsApp</dt><dd className="font-bold">{phoneValue}</dd></div></dl></div>
              {error ? <p className="text-xs font-semibold text-destructive" role="alert">{error}</p> : <p className="text-[11px] leading-relaxed text-muted-foreground">Pastikan nomor WhatsApp benar. Setelah disimpan, kamu dapat melanjutkan top up dan pembayaran online.</p>}
              <div className="flex gap-2"><button className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-2xl border border-border px-3 text-xs font-bold text-muted-foreground" disabled={saving} onClick={() => setStep(1)} type="button"><ChevronLeft className="h-4 w-4" />Kembali</button><button className="flex min-h-12 flex-[1.4] items-center justify-center rounded-2xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-60" disabled={saving} onClick={() => void handleSave()} type="button">{saving ? "Menyimpan..." : "Simpan & Lanjut"}</button></div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function MemberOnboarding({ name, onStartOrdering, onDismiss }: MemberOnboardingProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-3 pb-[max(0.75rem,var(--safe-area-bottom))] pt-6 backdrop-blur-[2px]">
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 40, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.8 }} role="dialog" aria-modal="true" aria-labelledby="member-onboarding-title" className="w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-background shadow-2xl">
        <div className="flex justify-center pt-3"><span className="h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" /></div>
        <div className="px-5 pb-5 pt-4"><div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-6 w-6" aria-hidden="true" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Member baru</p><h2 id="member-onboarding-title" className="mt-0.5 text-xl font-black tracking-tight">Selamat datang, {name}!</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Akun member kamu sudah aktif. Ini cara cepat menikmati fitur Djiwa Tentram.</p></div></div><div className="mt-5 space-y-2"><div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5"><ShoppingCart className="h-4 w-4 shrink-0 text-primary" /><p className="text-xs font-semibold">Pesan menu favoritmu dengan cepat.</p></div><div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5"><Star className="h-4 w-4 shrink-0 text-amber-500" /><p className="text-xs font-semibold">Gunakan Djiwa Pay untuk transaksi yang lebih praktis.</p></div><div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5"><Gift className="h-4 w-4 shrink-0 text-primary" /><p className="text-xs font-semibold">Cek promo, favorit, dan benefit member.</p></div><div className="flex items-center gap-3 rounded-2xl bg-muted/55 px-3 py-2.5"><Bell className="h-4 w-4 shrink-0 text-primary" /><p className="text-xs font-semibold">Update pesanan akan muncul di Notifikasi.</p></div></div><button type="button" onClick={onStartOrdering} className="mt-5 flex min-h-12 w-full items-center justify-between rounded-[16px] bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm active:scale-[.97]"><span>Mulai pesan</span><ChevronRight className="h-4 w-4" /></button><button type="button" onClick={onDismiss} className="mt-2 min-h-11 w-full rounded-[16px] px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted">Nanti saja</button></div>
      </motion.div>
    </div>
  );
}
