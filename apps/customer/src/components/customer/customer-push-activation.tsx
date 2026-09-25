import { Bell, BellOff, Loader2 } from "lucide-react";
import { useCustomerPush } from "@/hooks/use-customer-push";

export function CustomerPushActivation() {
  const { state, busy, supported, enable, disable } = useCustomerPush();

  if (!supported || state === "unsupported") return null;
  if (state === "denied") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
        <div className="flex items-start gap-2">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Notifikasi diblokir browser. Buka pengaturan situs untuk mengizinkannya kembali.</p>
        </div>
      </div>
    );
  }

  const subscribed = state === "subscribed";
  return (
    <section className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-primary/[0.06] px-3 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black">Update pesanan otomatis</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {subscribed ? "Aktif — tetap menerima kabar saat app tertutup." : "Aktifkan agar status pesanan tetap masuk saat app tertutup."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void (subscribed ? disable() : enable())}
        disabled={busy}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-[11px] font-black text-primary-foreground shadow-sm disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {subscribed ? "Matikan" : "Aktifkan"}
      </button>
    </section>
  );
}
