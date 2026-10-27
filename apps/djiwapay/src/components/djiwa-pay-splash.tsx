import { DjiwaPayLogoLoader } from "./djiwa-pay-logo-loader";

type DjiwaPaySplashProps = {
  visible?: boolean;
  leaving?: boolean;
  slow?: boolean;
  label?: string;
  brand?: string;
};

/**
 * Opaque iOS-style splash shown on boot and while Djiwa Pay swaps pages. The
 * opaque background hides the incoming page until its data is ready, then the
 * overlay fades out to reveal the finished screen.
 */
export function DjiwaPaySplash({
  visible = true,
  leaving = false,
  slow = false,
  label = "Menyiapkan halaman",
  brand = "Djiwa Pay",
}: DjiwaPaySplashProps) {
  if (!visible) return null;

  return (
    <div
      className={`djiwa-splash${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={slow ? `${label}. Masih memuat data.` : label}
    >
      <div className="djiwa-splash-content">
        <DjiwaPayLogoLoader size={92} className="djiwa-splash-logo" />
        <p className="djiwa-splash-brand">{brand}</p>
        <p className="djiwa-splash-label">{label}</p>
        {slow ? <p className="djiwa-splash-hint">Masih memuat data…</p> : null}
      </div>
    </div>
  );
}
