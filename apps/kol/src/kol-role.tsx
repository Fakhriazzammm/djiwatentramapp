import { useEffect, useState, type ReactNode } from "react";
import { Building2, Sparkles } from "lucide-react";
import { inAppBrowserName } from "./kol-lib";

export type AccountRole = "creator" | "brand";

export function RolePicker({
  loading,
  error,
  signed,
  hasCreator,
  hasBrand,
  onChoose,
  onGoogle,
}: {
  loading?: boolean;
  error?: string;
  signed?: boolean;
  hasCreator?: boolean;
  hasBrand?: boolean;
  onChoose?: (role: AccountRole) => Promise<void>;
  onGoogle?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<AccountRole | null>(null);
  const [copied, setCopied] = useState(false);
  const inApp = inAppBrowserName();
  useEffect(() => {
    if (error) setBusy(null);
  }, [error]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setBusy(null), 10000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  const choose = async (role: AccountRole) => {
    if (busy || loading) return;
    setBusy(role);
    try { await onChoose?.(role); } finally { setBusy(null); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      window.prompt("Salin link ini lalu buka di Chrome atau Safari", window.location.href);
    }
  };
  return (
    <div className="kx kx-wrap">
      <div className="kx-view" style={{ paddingTop: "calc(24px + env(safe-area-inset-top))" }}>
        <img className="kx-logo" src="/logo-djiwa.png" alt="Djiwa Tentram" />
        <p className="kx-eyebrow" style={{ marginTop: 16 }}>
          Djiwa Tentram
        </p>
        <h1 className="kx-h1">{signed ? "Pilih akun yang ingin dibuka" : "Masuk ke Portal KOL"}</h1>
        <p className="kx-lead">
          {signed
            ? "Satu akun Google bisa menjadi Creator, Brand, atau keduanya."
            : "Masuk dengan Google, lalu langsung daftar sebagai Creator atau Brand."}
        </p>
        {inApp && !signed && (
          <div className="kx-note" role="note" style={{ marginTop: 14 }}>
            <b>Kamu membuka halaman ini di {inApp}.</b> Google tidak mengizinkan masuk dari browser dalam
            aplikasi. Buka link ini di <b>Chrome</b> atau <b>Safari</b>.
            <button type="button" className="kx-link" style={{ display: "flex" }} onClick={copy}>
              {copied ? "✓ Link disalin" : "Salin link"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="kx-note kx-note--err" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}
        {loading ? (
          <p className="kx-sub" style={{ textAlign: "center", marginTop: 18 }}>
            Memeriksa sesi Google…
          </p>
        ) : (
          !signed ? <button type="button" className="kx-btn" style={{ marginTop: 18 }} onClick={() => void onGoogle?.()}>Lanjutkan dengan Google</button> :
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <RoleCard
              icon={<Sparkles size={20} />}
              title="Creator"
              description="Ikut campaign, bikin konten, dan dapat reward."
              action={hasCreator ? "Buka Portal Creator" : signed ? "Daftar sebagai Creator" : "Masuk sebagai Creator"}
              busy={busy === "creator"}
              busyLabel={signed ? "Membuka…" : "Membuka Google…"}
              disabled={Boolean(busy)}
              onClick={() => choose("creator")}
            />
            <RoleCard
              icon={<Building2 size={20} />}
              title="Brand"
              description="Buat campaign, atur anggaran, dan review laporan KOL."
              action={hasBrand ? "Buka Portal Brand" : signed ? "Daftar sebagai Brand" : "Masuk sebagai Brand"}
              busy={busy === "brand"}
              busyLabel={signed ? "Membuka…" : "Membuka Google…"}
              disabled={Boolean(busy)}
              onClick={() => choose("brand")}
            />
          </div>
        )}
        <p className="kx-sub" style={{ textAlign: "center", marginTop: 14 }}>
          Dengan melanjutkan, kamu menyetujui syarat kolaborasi Djiwa Tentram.
        </p>
      </div>
    </div>
  );
}

function RoleCard({
  icon,
  title,
  description,
  action,
  busy,
  busyLabel,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  busy: boolean;
  busyLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <section className="kx-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span className="kx-ico">{icon}</span>
        <div style={{ flex: 1 }}>
          <b className="kx-card-title">{title}</b>
          <p className="kx-card-desc">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className="kx-btn kx-btn--ghost"
        style={{ marginTop: 14 }}
        disabled={disabled}
        aria-busy={busy}
        onClick={onClick}
      >
        {busy ? busyLabel : action}
      </button>
    </section>
  );
}
