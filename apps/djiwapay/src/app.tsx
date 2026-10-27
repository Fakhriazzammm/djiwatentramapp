import { useEffect, useState } from "react";
import type { WalletResponse } from "./lib/wallet-adapter";
import { createTopup } from "./lib/payment-adapter";
import { resolveIdentity, getPayNavigationContext, type CustomerProfile } from "./lib/identity-adapter";
import { readWallet } from "./lib/wallet-adapter";
import { DjiwaPayAuth } from "./features/auth/djiwa-pay-auth";
import { DjiwaPayScreen } from "./features/wallet/djiwa-pay-screen";
import { isKnownPayPath } from "./lib/djiwa-pay-routes";
import { DjiwaPaySplash } from "./components/djiwa-pay-splash";
import { useDjiwaPaySplash } from "./hooks/use-djiwa-pay-splash";

const localPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";
const previewProfile: CustomerProfile = { source_id: "LOCAL-DEMO-0001", name: "Azzam", email: "preview@example.test", phone: "081234567890" };
const previewTransactions: NonNullable<WalletResponse["transactions"]> = [
  { id: 1, transfer_id: null, direction: "credit", category: "adjustment", type: "manual_credit", amount: 1000, balance_after: 125000, status: "success", counterparty_name: null, counterparty_phone: null, reference_type: null, reference_id: null, note: "Reward transaksi Djiwa Pay", created_at: "2026-10-26T08:10:00+07:00" },
  { id: 2, transfer_id: null, direction: "debit", category: "payment", type: "order_debit", amount: 6400, balance_after: 124000, status: "success", counterparty_name: null, counterparty_phone: null, reference_type: "order", reference_id: "DEMO-1042", note: "Pembayaran pesanan", created_at: "2026-10-26T07:55:00+07:00" },
  { id: 3, transfer_id: null, direction: "credit", category: "topup", type: "topup_completed", amount: 50000, balance_after: 130400, status: "success", counterparty_name: null, counterparty_phone: null, reference_type: "topup", reference_id: "DEMO-TOPUP-01", note: "Top up saldo via Mayar", created_at: "2026-10-25T14:25:00+07:00" },
  { id: 4, transfer_id: null, direction: "credit", category: "transfer", type: "wallet_transfer_received", amount: 10000, balance_after: 80400, status: "success", counterparty_name: "Dina", counterparty_phone: null, reference_type: "transfer", reference_id: "DEMO-TRF-01", note: "Patungan makan siang", created_at: "2026-10-24T12:05:00+07:00" },
];
const previewWallet: WalletResponse = { wallet: { available_balance: 125000, held_balance: 0, total_credited: 64000, total_debited: 6400, status: "active" }, ledger: [], transactions: previewTransactions };

function DjiwaPayNotFound() {
  return <main className="pay-page"><section className="surface loading-state" role="alert"><span className="eyebrow">404 · DJIWA PAY</span><h1>Halaman tidak ditemukan</h1><p>Route yang Anda buka tidak tersedia.</p><a className="primary-action" href="/">Kembali ke Djiwa Pay</a></section></main>;
}

export function DjiwaPayApp() {
  if (!isKnownPayPath(window.location.pathname)) return <DjiwaPayNotFound />;
  const navigationContext = getPayNavigationContext(); const [profile, setProfile] = useState<CustomerProfile | null>(localPreview ? previewProfile : null); const [wallet, setWallet] = useState<WalletResponse | null>(localPreview ? previewWallet : null); const [loading, setLoading] = useState(!localPreview); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(null); try { const next = await resolveIdentity(); setProfile(next); if (next) setWallet(await readWallet(next)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat Djiwa Pay"); } finally { setLoading(false); } };
  useEffect(() => { if (!localPreview) void load(); }, []);
  const splash = useDjiwaPaySplash();
  // Auth and not-found identities have no page data to wait for: release the
  // boot splash as soon as the session check settles.
  useEffect(() => { if (!loading && !profile) splash.release(); }, [loading, profile, splash.release]);
  const topup = async (amount: number) => { if (localPreview) throw new Error("Transaksi dinonaktifkan pada pratinjau lokal"); if (!profile) throw new Error("Sesi Djiwa Pay tidak tersedia"); setBusy(true); try { return await createTopup(profile, amount); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal membuat invoice"); setBusy(false); throw cause; } };
  return <>
    {profile ? (
      <DjiwaPayScreen profile={profile} wallet={wallet} loading={loading} error={error} busy={busy} onRefresh={() => { if (!localPreview) void load(); }} onTopup={topup} navigationContext={navigationContext} onNavigate={splash.start} onPageReady={splash.release} transitionId={splash.sequence} previewOnly={localPreview} />
    ) : loading ? null : (
      <DjiwaPayAuth error={error} />
    )}
    <DjiwaPaySplash visible={splash.visible} leaving={splash.leaving} slow={splash.slow} label={splash.label} />
  </>;
}
