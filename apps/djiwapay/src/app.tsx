import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import type { WalletResponse } from "./lib/wallet-adapter";
import { createTopup } from "./lib/payment-adapter";
import { resolveIdentity, type CustomerProfile } from "./lib/identity-adapter";
import { readWallet } from "./lib/wallet-adapter";
import { DjiwaPayScreen } from "./features/wallet/djiwa-pay-screen";

export function DjiwaPayApp() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(null); try { const next = await resolveIdentity(); setProfile(next); if (next) setWallet(await readWallet(next)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat Djiwa Pay"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const topup = async (amount: number) => { if (!profile) return; setBusy(true); try { window.location.assign(await createTopup(profile, amount)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal membuat invoice"); setBusy(false); } };
  if (loading && !profile) return <main className="pay-page"><section className="surface loading-state">Memuat sesi Djiwa Pay...</section></main>;
  if (!profile) return <main className="pay-page"><section className="surface empty-state"><LogIn size={30} /><h1>Masuk untuk menggunakan Djiwa Pay</h1><p>{error ?? "Sesi login dari Djiwa App diperlukan."}</p></section></main>;
  return <DjiwaPayScreen profile={profile} wallet={wallet} loading={loading} error={error} busy={busy} onRefresh={() => void load()} onTopup={topup} />;
}
