/**
 * Djiwa Pay inside the Android app (Capacitor shell loading djiwapay.web.id).
 * Everything here is inert in a normal browser: `window.Capacitor` only exists inside the app,
 * and no Capacitor package is bundled, so the website is unchanged.
 */
type Plugin = Record<string, (...args: any[]) => Promise<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Bridge = { isNativePlatform?: () => boolean; Plugins?: Record<string, Plugin> };
const bridge = (): Bridge | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: Bridge }).Capacitor);

export const isNativeApp = (): boolean => { try { return bridge()?.isNativePlatform?.() === true; } catch { return false; } };
export const nativePlugin = (name: string): Plugin | undefined => (isNativeApp() ? bridge()?.Plugins?.[name] : undefined);

/** The web OAuth client of the Google project: the ID token's audience must match what the auth server expects. */
export const GOOGLE_WEB_CLIENT_ID = "559298319721-pivu1oompqkc21t3sgau2oao39jpms9r.apps.googleusercontent.com";

/** Native Google account picker. Returns an ID token for Better Auth, or null when the person cancelled. */
export async function nativeGoogleIdToken(): Promise<string | null> {
  const social = nativePlugin("SocialLogin");
  if (!social) throw new Error("Masuk dengan Google belum tersedia di aplikasi ini");
  await social.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
  try {
    const res = await social.login({ provider: "google", options: { scopes: ["email", "profile"] } });
    const token = res?.result?.idToken as string | null | undefined;
    if (!token) throw new Error("Google tidak mengirim token masuk");
    return token;
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    if (/cancel|dismiss|user closed/i.test(msg)) return null;
    throw cause;
  }
}

export async function nativeShare(title: string, text: string): Promise<boolean> {
  const share = nativePlugin("Share");
  if (!share) return false;
  try { await share.share({ title, text, dialogTitle: title }); return true; } catch { return false; }
}

/** Android back: close the top sheet first, then go back in the app, and only then leave. */
export function installBackButton(): void {
  const app = nativePlugin("App");
  if (!app || (window as unknown as { __dpBack?: boolean }).__dpBack) return;
  (window as unknown as { __dpBack?: boolean }).__dpBack = true;
  void (app as unknown as { addListener: (e: string, cb: () => void) => Promise<unknown> }).addListener("backButton", () => {
    const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).pop();
    const close = dialog?.querySelector<HTMLElement>('[aria-label*="utup" i], [aria-label*="lose" i], [data-close], .dpx-sheet-x, .dpx-x');
    if (close) { close.click(); return; }
    if (dialog) { dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return; }
    if (window.history.length > 1 && window.location.pathname !== "/") { window.history.back(); return; }
    void app.exitApp();
  });
}

/** Colours the system bars and drops the splash once the page is ready. */
export function setupNativeChrome(): void {
  if (!isNativeApp()) return;
  void nativePlugin("StatusBar")?.setBackgroundColor?.({ color: "#ffffff" }).catch(() => undefined);
  void nativePlugin("StatusBar")?.setStyle?.({ style: "LIGHT" }).catch(() => undefined);
  void nativePlugin("SplashScreen")?.hide?.().catch(() => undefined);
  installBackButton();
}
