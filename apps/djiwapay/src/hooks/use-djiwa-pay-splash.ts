import { useCallback, useEffect, useRef, useState } from "react";
import { DJIWA_PAY_SPLASH_FALLBACK_LABEL } from "../lib/djiwa-pay-splash";

/** Brand trace is visible long enough to register, short enough to stay snappy. */
const MIN_VISIBLE_MS = 420;
const REDUCED_MIN_VISIBLE_MS = 220;
const FADE_OUT_MS = 220;
/** Ignore navigation that happens while the app is still mounting (draft restore). */
const MOUNT_GRACE_MS = 500;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export type DjiwaPaySplashState = {
  visible: boolean;
  leaving: boolean;
  label: string;
  /** Show the transition splash for the given destination label. */
  start: (label?: string) => void;
};

export type DjiwaPaySessionSplashState = {
  visible: boolean;
  leaving: boolean;
};

/**
 * Brand moment for the first session load. It fades out once identity and
 * wallet are ready, and never returns on later refreshes.
 */
export function useDjiwaPaySessionSplash(ready: boolean): DjiwaPaySessionSplashState {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!ready || done) return;
    const minVisibleMs = prefersReducedMotion() ? 180 : 620;
    const wait = Math.max(0, minVisibleMs - (Date.now() - startedAt.current));
    const holdTimer = window.setTimeout(() => setLeaving(true), wait);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
      setDone(true);
    }, wait + FADE_OUT_MS);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(hideTimer);
    };
  }, [ready, done]);

  return { visible, leaving };
}

/**
 * Drives the short splash used on every Djiwa Pay page change: reveal at once,
 * hold the brand mark for a beat, then fade the overlay out.
 */
export function useDjiwaPaySplash(): DjiwaPaySplashState {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [label, setLabel] = useState(DJIWA_PAY_SPLASH_FALLBACK_LABEL);
  const mountedAt = useRef(Date.now());
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const start = useCallback(
    (nextLabel?: string) => {
      if (Date.now() - mountedAt.current < MOUNT_GRACE_MS) return;
      clearTimers();
      if (nextLabel) setLabel(nextLabel);
      const minVisibleMs = prefersReducedMotion() ? REDUCED_MIN_VISIBLE_MS : MIN_VISIBLE_MS;
      setLeaving(false);
      setVisible(true);
      timers.current.push(window.setTimeout(() => setLeaving(true), minVisibleMs));
      timers.current.push(
        window.setTimeout(() => {
          setVisible(false);
          setLeaving(false);
        }, minVisibleMs + FADE_OUT_MS),
      );
    },
    [clearTimers],
  );

  return { visible, leaving, label, start };
}
