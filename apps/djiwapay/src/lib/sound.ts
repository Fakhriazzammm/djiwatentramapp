/**
 * Djiwa Pay's own sounds, made with the Web Audio API so there is nothing to download or license.
 * Every sound starts with the same small gold-coin "ting" (the mascot is a coin), then a short motif that says what happened:
 * money in rises, money out settles, a move glides, a reminder pings twice.
 */
export type SoundKind = "in" | "out" | "move" | "mail" | "warn" | "info" | "mascot";
export type Note = { at: number; freq: number; gain: number; decay: number; voice: "coin" | "bell" };

const E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, C5 = 523.25;
const coin = (at = 0, freq = E6): Note => ({ at, freq, gain: 0.55, decay: 0.2, voice: "coin" });
const bell = (at: number, freq: number, gain = 0.5, decay = 0.7): Note => ({ at, freq, gain, decay, voice: "bell" });

/** The notes of each sound, as data: easy to test and easy to retune. */
export function soundPlan(kind: SoundKind): Note[] {
  switch (kind) {
    case "in": return [coin(), bell(0.09, E5), bell(0.2, G5), bell(0.31, C6, 0.6, 1.1)];
    case "out": return [coin(0, C6), bell(0.1, G5, 0.45), bell(0.24, E5, 0.4, 0.9)];
    case "move": return [coin(0, G5), bell(0.1, A5, 0.35, 0.5), bell(0.2, D6, 0.35, 0.8)];
    case "mail": return [coin(), bell(0.12, G5, 0.4, 0.6)];
    case "warn": return [coin(0, G5), bell(0.14, G5, 0.5, 0.35), bell(0.3, C6, 0.5, 0.6)];
    case "info": return [coin(0, C6), bell(0.1, E6, 0.3, 0.6)];
    case "mascot": return [bell(0, C6, 0.32, 0.25), bell(0.07, G6, 0.28, 0.3)];
  }
}
export const vibration = (kind: SoundKind): number[] => (kind === "warn" ? [70, 50, 70] : kind === "in" ? [40, 30, 40, 30, 90] : [60]);

const KEY = "djiwa-sound";
export const soundEnabled = (): boolean => { try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; } };
export const setSoundEnabled = (on: boolean) => { try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked */ } };

let ctx: AudioContext | null = null, unlocked = false, wired = false;
const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return null; try { ctx = new AC(); } catch { return null; } }
  return ctx;
};
/** Browsers only allow sound after a touch or key press; the first one unlocks it for the rest of the visit. */
export function initSound() {
  if (wired || typeof window === "undefined") return; wired = true;
  const unlock = () => { const c = getCtx(); if (!c) return; void c.resume().then(() => { unlocked = c.state === "running"; }).catch(() => undefined); if (unlocked || c.state === "running") { unlocked = true; ["pointerdown", "keydown", "touchend"].forEach((e) => window.removeEventListener(e, unlock)); } };
  ["pointerdown", "keydown", "touchend"].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
}

function voice(c: AudioContext, out: AudioNode, n: Note, t0: number) {
  const partials = n.voice === "coin" ? [[1, 1], [2.4, 0.6], [5.95, 0.25]] : [[1, 1], [2, 0.35], [2.76, 0.2], [5.4, 0.08]];
  for (const [ratio, amp] of partials) {
    const o = c.createOscillator(), g = c.createGain(), t = t0 + n.at;
    o.type = "sine"; o.frequency.setValueAtTime(n.freq * ratio, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.gain * amp * 0.5), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.decay / (ratio > 1 ? ratio * 0.6 : 1) + 0.04);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + n.decay + 0.12);
  }
}
/** Plays one of the app's sounds. Does nothing when sound is off, the browser has not unlocked audio yet, or Web Audio is missing. */
export function playSound(kind: SoundKind, opts: { force?: boolean } = {}): boolean {
  if (!opts.force && !soundEnabled()) return false;
  const c = getCtx(); if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  if (c.state !== "running" && !unlocked) return false;
  const master = c.createGain(); master.gain.value = kind === "mascot" ? 0.12 : 0.2; master.connect(c.destination);
  const t0 = c.currentTime + 0.02;
  for (const n of soundPlan(kind)) voice(c, master, n, t0);
  window.setTimeout(() => master.disconnect(), 2600);
  if (kind !== "mascot") { try { navigator.vibrate?.(vibration(kind)); } catch { /* optional */ } }
  return true;
}
