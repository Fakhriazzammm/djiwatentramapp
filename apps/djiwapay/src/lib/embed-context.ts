// Djiwa Pay is opened in two shapes: as a standalone page that must draw its
// own bottom navigation, and embedded inside a host app that already draws one.
//
// Djiwa Travel embeds it in an iframe (djiwatravel.com/wallet/pay) and keeps
// its 4.5rem tab bar visible below the frame. Pay used to render its own
// five-tab bar at the bottom of that iframe, so visitors saw two stacked
// navigation bars, and the Pay one had no usable links because the frame URL
// carries no `/<username>/wallet` navigation context.

type PayFrameHost = "travel" | "unknown" | null;

export type PayFrameContext = {
  /** Pay is rendered inside an iframe. */
  framed: boolean;
  /** Origin of the framing page, when the browser reported one. */
  hostOrigin: string | null;
  /** Known embedding app, `"unknown"` for any other frame, `null` when standalone. */
  host: PayFrameHost;
  /** The surrounding page owns the bottom navigation, so Pay must not draw one. */
  hideBottomNav: boolean;
};

// Hosts that embed Djiwa Pay and render their own bottom tab bar.
const TRAVEL_HOSTS = new Set(["https://djiwatravel.com", "https://www.djiwatravel.com"]);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Pure resolver so the embedded decision can be tested without a DOM.
 *
 * `?embed=0` is an escape hatch for a frame that does not provide navigation;
 * every other frame drops Pay's own bar, because a host that frames a full
 * wallet page almost always owns the surrounding chrome.
 */
export function resolvePayFrameContext(input: { framed: boolean; referrer?: string; search?: string }): PayFrameContext {
  if (!input.framed) return { framed: false, hostOrigin: null, host: null, hideBottomNav: false };

  const hostOrigin = originOf(input.referrer);
  const optOut = new URLSearchParams(input.search ?? "").get("embed") === "0";
  return {
    framed: true,
    hostOrigin,
    host: hostOrigin && TRAVEL_HOSTS.has(hostOrigin) ? "travel" : "unknown",
    hideBottomNav: !optOut,
  };
}

/** Cross-origin parents can throw on `window.top` access; that is still a frame. */
export function isEmbeddedFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function readPayFrameContext(): PayFrameContext {
  return resolvePayFrameContext({
    framed: isEmbeddedFrame(),
    referrer: typeof document !== "undefined" ? document.referrer : "",
    search: typeof window !== "undefined" ? window.location.search : "",
  });
}
