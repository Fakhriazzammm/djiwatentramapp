import { useEffect, useState } from "react";
import type { WalletResponse } from "./lib/wallet-adapter";
import { createTopup } from "./lib/payment-adapter";
import { resolveIdentity, getPayNavigationContext, type CustomerProfile } from "./lib/identity-adapter";
import { readWallet } from "./lib/wallet-adapter";
import { DjiwaPayAuth } from "./features/auth/djiwa-pay-auth";
import { DjiwaPayScreen } from "./features/wallet/djiwa-pay-screen";
import { isKnownPayPath } from "./lib/djiwa-pay-routes";
import { DjiwaPaySplash } from "./components/djiwa-pay-splash";
import { useDjiwaPaySplash, useDjiwaPaySessionSplash } from "./hooks/use-djiwa-pay-splash";

function DjiwaPayNotFound() {
  return <main className="pay-page"><section className="surface loading-state" role="alert"><span className="eyebrow">404 · DJIWA PAY</span><h1>Halaman tidak ditemukan</h1><p>Route yang Anda buka tidak tersedia.</p><a className="primary-action" href="/">Kembali ke Djiwa Pay</a></section></main>;
}

export function DjiwaPayApp() {
  if (!isKnownPayPath(window.location.pathname)) return <DjiwaPayNotFound />;
  const navigationContext = getPayNavigationContext(); const [profile, setProfile] = useState<CustomerProfile | null>(null); const [wallet, setWallet] = useState<WalletResponse | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(null); try { const next = await resolveIdentity(); setProfile(next); if (next) setWallet(await readWallet(next)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat Djiwa Pay"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const splash = useDjiwaPaySplash();
  const sessionSplash = useDjiwaPaySessionSplash(!loading);
  const topup = async (amount: number) => { if (!profile) throw new Error("Sesi Djiwa Pay tidak tersedia"); setBusy(true); try { return await createTopup(profile, amount); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal membuat invoice"); setBusy(false); throw cause; } };
  // The boot splash stays mounted from first paint through the first session
  // load, so resolving identity fades it out instead of remounting the brand mark.
  const booting = loading && !profile;
  return <>
    {profile ? (
      <DjiwaPayScreen profile={profile} wallet={wallet} loading={loading} error={error} busy={busy} onRefresh={() => void load()} onTopup={topup} navigationContext={navigationContext} onNavigate={splash.start} />
    ) : loading ? null : (
      <DjiwaPayAuth error={error} />
    )}
    <DjiwaPaySplash visible={booting || sessionSplash.visible} leaving={booting ? false : sessionSplash.leaving} label="Menyiapkan sesi Djiwa Pay" />
    <DjiwaPaySplash visible={splash.visible} leaving={splash.leaving} label={splash.label} />
  </>;
}
