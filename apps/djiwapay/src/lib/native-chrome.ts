/** Hide the Android status bar while a full-screen scanner is open (Capacitor shell only; no-op on the web). */
type StatusBarPlugin = { hide?: () => Promise<void>; show?: () => Promise<void> };
let holders = 0, timer: ReturnType<typeof setTimeout> | undefined;
const bar = (): StatusBarPlugin | null => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { StatusBar?: StatusBarPlugin } } }).Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.StatusBar ?? null : null;
};
export function hideStatusBar(): () => void {
  if (typeof window === "undefined") return () => {};
  holders++; clearTimeout(timer); void bar()?.hide?.().catch(() => {});
  let done = false;
  return () => { if (done) return; done = true; holders--; clearTimeout(timer); timer = setTimeout(() => { if (holders <= 0) void bar()?.show?.().catch(() => {}); }, 300); };
}
