import { parseWalletPath } from "../lib/djiwa-pay-routes";
import { DJIWA_PAY_SESSION_SPLASH_LABEL } from "../lib/djiwa-pay-splash";
import { DjiwaPayLogoLoader, type MascotAction } from "./djiwa-pay-logo-loader";

function splashAction(pathname: string): MascotAction {
  if (pathname.startsWith("/ppob/") && pathname.endsWith("/struk")) return "write";
  if (pathname === "/ppob" || pathname.startsWith("/ppob/")) return "juggle";
  switch (parseWalletPath(pathname)?.page) {
    case "wallet": case "assets": case "budget": case "topup": return "save";
    case "catat": case "history": case "summary": case "review": return "write";
    case "services": case "transfer": case "receive": return "juggle";
    default: return "bounce";
  }
}

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
        <DjiwaPayLogoLoader action={label === DJIWA_PAY_SESSION_SPLASH_LABEL ? "spin" : splashAction(window.location.pathname)} size={112} className="djiwa-splash-logo" />
        <p className="djiwa-splash-brand">{brand}</p>
        <p className="djiwa-splash-label">{label}</p>
        {slow ? <p className="djiwa-splash-hint">Masih memuat data…</p> : null}
      </div>
    </div>
  );
}
