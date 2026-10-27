import { useCallback, useEffect, useRef, useState } from "react";
import {
  DJIWA_PAY_SESSION_SPLASH_LABEL,
  DJIWA_PAY_SPLASH_FALLBACK_LABEL,
} from "../lib/djiwa-pay-splash";

/** Brand trace is visible long enough to register, short enough to stay snappy. */
const BOOT_MIN_VISIBLE_MS = 620;
const TRANSITION_MIN_VISIBLE_MS = 420;
const REDUCED_MIN_VISIBLE_MS = 220;
const FADE_OUT_MS = 220;
/** Ask the customer to hang on once a page takes noticeably long to load. */
const SLOW_HINT_MS = 4_000;
/** Never trap the page behind the brand mark, even if a request never settles. */
const MAX_HOLD_MS = 12_000;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export type DjiwaPaySplashState = {
  visible: boolean;
  leaving: boolean;
  /** The destination is taking a while; show the "still loading" hint. */
  slow: boolean;
  label: string;
  /** Increments for every transition so pages can release their own splash. */
  sequence: number;
  /** Show the transition splash for the given destination label. */
  start: (label?: string) => void;
  /** The destination page has its data; fade out after the minimum beat. */
  release: () => void;
};

/**
 * Drives the single Djiwa Pay splash: it opens on boot and on every page
 * change, then waits for the destination page to report its data before fading
 * out. Minimum display keeps the brand moment readable, the slow hint appears
 * after four seconds, and the max hold prevents a stuck request from hiding the
 * page forever.
 */
export function useDjiwaPaySplash(): DjiwaPaySplashState {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [label, setLabel] = useState(DJIWA_PAY_SESSION_SPLASH_LABEL);
  const [sequence, setSequence] = useState(0);
  const runId = useRef(0);
  const startedAt = useRef(Date.now());
  const minimumMs = useRef(prefersReducedMotion() ? REDUCED_MIN_VISIBLE_MS : BOOT_MIN_VISIBLE_MS);
  const released = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const hide = useCallback(
    (id: number) => {
      if (runId.current !== id) return;
      clearTimers();
      setSlow(false);
      setLeaving(true);
      timers.current.push(
        window.setTimeout(() => {
          if (runId.current !== id) return;
          setVisible(false);
          setLeaving(false);
        }, FADE_OUT_MS),
      );
    },
    [clearTimers],
  );

  const release = useCallback(() => {
    if (released.current) return;
    released.current = true;
    const id = runId.current;
    const wait = Math.max(0, minimumMs.current - (Date.now() - startedAt.current));
    timers.current.push(
      window.setTimeout(() => {
        if (runId.current !== id) return;
        hide(id);
      }, wait),
    );
  }, [hide]);

  const start = useCallback(
    (nextLabel?: string) => {
      const id = runId.current + 1;
      runId.current = id;
      clearTimers();
      released.current = false;
      startedAt.current = Date.now();
      minimumMs.current = prefersReducedMotion() ? REDUCED_MIN_VISIBLE_MS : TRANSITION_MIN_VISIBLE_MS;
      setLabel(nextLabel ?? DJIWA_PAY_SPLASH_FALLBACK_LABEL);
      setSlow(false);
      setLeaving(false);
      setVisible(true);
      setSequence(id);
      timers.current.push(
        window.setTimeout(() => {
          if (runId.current === id) setSlow(true);
        }, SLOW_HINT_MS),
      );
      timers.current.push(
        window.setTimeout(() => {
          if (runId.current !== id) return;
          released.current = true;
          hide(id);
        }, MAX_HOLD_MS),
      );
    },
    [clearTimers, hide],
  );

  return { visible, leaving, slow, label, sequence, start, release };
}
