import { useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getOfflineManager, type QueuedAction } from "@/lib/offline-manager";

const actionLabels: Record<QueuedAction["type"], string> = {
  createOrder: "Pesanan", updateProduct: "Perubahan produk", deleteProduct: "Penghapusan produk", other: "Aktivitas",
};
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function actionSummary(action: QueuedAction) {
  const data = action.data && typeof action.data === "object" ? action.data as Record<string, unknown> : {};
  const customer = data.customerName ?? data.customer_name;
  const amount = data.totalAmount ?? data.total ?? data.amount;
  return {
    customer: typeof customer === "string" ? customer : undefined,
    amount: typeof amount === "number" && Number.isFinite(amount) ? currency.format(amount) : undefined,
  };
}

export function OfflineSyncCenter({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [manager] = useState(() => getOfflineManager());
  const [state, setState] = useState(() => manager.getState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => manager.subscribe(setState), [manager]);
  const failed = state.queuedActions.filter((action) => action.status === "failed").length;
  const disabled = busy || state.isSyncing;

  async function run(actionId?: string) {
    setBusy(true);
    setError(null);
    try {
      if (actionId) await manager.retryAction(actionId);
      else await manager.syncQueuedActions();
    } catch {
      setError("Perubahan antrean belum tersimpan. Periksa ruang penyimpanan perangkat lalu coba lagi. Transaksi tetap dipertahankan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[94dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="shrink-0 border-b p-4 pr-12 text-left">
          <SheetTitle className="text-xl">Pusat sinkronisasi</SheetTitle>
          <SheetDescription className="text-sm">Antrean tersimpan di perangkat ini. Transaksi gagal tetap tersedia sampai berhasil dikirim.</SheetDescription>
        </SheetHeader>
        <div className="shrink-0 space-y-3 border-b p-4">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium">
            {state.isOnline ? <Wifi className="size-5" aria-hidden="true" /> : <WifiOff className="size-5" aria-hidden="true" />}
            {state.isOnline ? "Online · Siap menyinkronkan" : "Offline · Menunggu koneksi"}
            {state.isSyncing && <span className="text-muted-foreground">Mengirim…</span>}
          </div>
          <p className="text-sm"><strong>{state.pendingSyncCount}</strong> belum tersinkron · {state.pendingSyncCount - failed} menunggu · <strong>{failed}</strong> perlu dicoba ulang</p>
          <Button className="min-h-11 w-full" disabled={disabled || !state.isOnline || state.pendingSyncCount === failed} onClick={() => void run()}>
            <RefreshCw className={state.isSyncing ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
            Sinkronkan antrean menunggu
          </Button>
          {!state.isOnline && <p className="text-sm text-muted-foreground">Sambungkan internet untuk mengirim. Coba ulang saat offline akan menyiapkan transaksi untuk dikirim setelah koneksi kembali.</p>}
          {(error || state.storageError) && <p role="alert" className="text-sm text-destructive">{error || state.storageError}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {state.storageError && state.queuedActions.length === 0 ? <p className="py-8 text-center text-base text-muted-foreground">Antrean belum dapat diperiksa. Data tersimpan dipertahankan.</p> : state.queuedActions.length === 0 ? <p className="py-8 text-center text-base text-muted-foreground">Semua transaksi sudah tersinkron. Tidak ada antrean di perangkat ini.</p> : (
            <ul className="space-y-3" aria-label="Transaksi belum tersinkron">
              {state.queuedActions.map((action) => {
                const summary = actionSummary(action);
                const failedAction = action.status === "failed";
                return (
                  <li key={action.id} className="space-y-2 rounded-xl border bg-card p-4 text-card-foreground">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold">{actionLabels[action.type] ?? "Aktivitas"}</p>
                      <span className={failedAction ? "text-sm font-semibold text-destructive" : "text-sm text-muted-foreground"}>{failedAction ? "Perlu dicoba ulang" : "Menunggu sinkronisasi"}</span>
                    </div>
                    {summary.customer && <p className="break-words text-base">{summary.customer}</p>}
                    {summary.amount && <p className="text-base font-semibold">{summary.amount}</p>}
                    <p className="break-all text-xs text-muted-foreground">ID: {action.id}</p>
                    <p className="text-sm text-muted-foreground">Disimpan: {new Date(action.timestamp).toLocaleString("id-ID")}</p>
                    {action.lastAttemptAt && <p className="text-sm text-muted-foreground">Percobaan terakhir: {new Date(action.lastAttemptAt).toLocaleString("id-ID")} · {action.retries}/{action.maxRetries} percobaan</p>}
                    {action.lastError && <p className="break-words text-sm" role={failedAction ? "status" : undefined}>{action.lastError}</p>}
                    {failedAction && <>
                      <p className="text-sm text-muted-foreground">Periksa daftar transaksi sebelum mencoba ulang jika hasil pengiriman belum pasti.</p>
                      <Button variant="outline" className="min-h-11 w-full" disabled={disabled} onClick={() => void run(action.id)} aria-label={`Coba ulang ${summary.customer || actionLabels[action.type] || "aktivitas"} ${action.id}`}>
                        Coba ulang transaksi
                      </Button>
                    </>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
