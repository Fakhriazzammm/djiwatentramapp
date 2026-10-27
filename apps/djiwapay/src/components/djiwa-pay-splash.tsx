import { DjiwaPayLogoLoader } from "./djiwa-pay-logo-loader";

type DjiwaPaySplashProps = {
  visible?: boolean;
  leaving?: boolean;
  label?: string;
  brand?: string;
};

/**
 * Opaque iOS-style splash shown while Djiwa Pay swaps pages. The opaque
 * background hides the incoming page until the brand mark finishes tracing,
 * then the overlay fades out to reveal it.
 */
export function DjiwaPaySplash({
  visible = true,
  leaving = false,
  label = "Menyiapkan halaman",
  brand = "Djiwa Pay",
}: DjiwaPaySplashProps) {
  if (!visible) return null;

  return (
    <div
      className={`djiwa-splash${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="djiwa-splash-content">
        <DjiwaPayLogoLoader size={92} className="djiwa-splash-logo" />
        <p className="djiwa-splash-brand">{brand}</p>
        <p className="djiwa-splash-label">{label}</p>
      </div>
    </div>
  );
}
