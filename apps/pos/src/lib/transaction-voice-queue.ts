interface ResponsiveVoiceApi {
  speak: (text: string, voice?: string | Record<string, unknown>, options?: Record<string, unknown>) => void;
  cancel?: () => void;
  init?: (config?: Record<string, unknown>) => void;
  initialized?: boolean;
  isReady?: () => boolean;
  disablePermissionPopup?: boolean;
}

declare global {
  interface Window {
    responsiveVoice?: ResponsiveVoiceApi;
    rvApiKey?: string;
    getResponsiveVoice?: () => ResponsiveVoiceApi | undefined;
  }
}

export type TransactionVoiceEvent = {
  eventKey: string;
  text: string;
};

type AudioLike = {
  volume: number;
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  play: () => Promise<void>;
};

let audioUnlocked = false;

/**
 * Browsers block Audio / speechSynthesis until the user interacts with the
 * page. Call this once from any real user gesture (click / keydown / touch) so
 * later transaction announcements can play even when the event arrives from a
 * background poll without a fresh gesture.
 */
export function unlockAudio() {
  if (audioUnlocked || !isBrowser()) return;
  audioUnlocked = true;
  try {
    const probe = new Audio(MP3_URL);
    probe.volume = 0;
    void probe.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
  if ("speechSynthesis" in window) {
    try {
      const utterance = new SpeechSynthesisUtterance("");
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* ignore */
    }
  }
}
const AUDIO_TIMEOUT_MS = 15_000;
const TTS_TIMEOUT_MS = 20_000;
const queuedOrPlayedKeys = new Set<string>();
const pendingEvents: TransactionVoiceEvent[] = [];
let processing = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined as T), timeoutMs);
    promise.then(finish).catch(() => finish(undefined as T));
  });
}

function playMp3Once() {
  if (!isBrowser()) return Promise.resolve();

  return withTimeout(new Promise<void>((resolve) => {
    const audio = new Audio(MP3_URL) as unknown as AudioLike;
    audio.volume = 0.6;

    const finish = () => {
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      resolve();
    };

    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    void audio.play().catch(finish);
  }), AUDIO_TIMEOUT_MS);
}

function getResponsiveVoice() {
  if (typeof window === "undefined") return undefined;
  if (typeof window.getResponsiveVoice === "function") {
    try {
      const rv = window.getResponsiveVoice();
      if (rv) return rv;
    } catch {
      /* ignore */
    }
  }
  return window.responsiveVoice;
}

function whenResponsiveVoiceReady() {
  return new Promise<void>((resolve) => {
    const rv = getResponsiveVoice();
    if (!rv) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("ResponsiveVoice_OnReady", finish);
      resolve();
    };
    try {
      if (rv.initialized || (typeof rv.isReady === "function" && rv.isReady())) {
        finish();
        return;
      }
    } catch {
      /* ignore */
    }
    window.addEventListener("ResponsiveVoice_OnReady", finish, { once: true });
    // Safety: don't block the queue forever if the event never fires.
    window.setTimeout(finish, 4000);
  });
}

function speakNative(text: string) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return Promise.resolve();
  }
  return withTimeout(new Promise<void>((resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "id-ID";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  }), TTS_TIMEOUT_MS);
}

function speakResponsiveVoice(text: string) {
	const rv = getResponsiveVoice();
	if (!rv || typeof rv.speak !== "function") return Promise.resolve();
	return withTimeout(new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		try {
			// Per ResponsiveVoice docs (Quick Start): call speak() on the global
			// instance, optionally with a voice name and an onend/onerror callback.
			rv.speak(text, "Indonesian Female", {
				pitch: 1,
				rate: 0.95,
				volume: 1,
				onstart: () => undefined,
				onend: finish,
				onerror: () => finish(),
			});
		} catch {
			finish();
		}
		// Safety net: resolve even if onend never fires.
		window.setTimeout(finish, TTS_TIMEOUT_MS);
	}), TTS_TIMEOUT_MS);
}

async function speak(text: string) {
	if (!isBrowser()) return;
	// Primary: ResponsiveVoice browser SDK (per official docs).
	const rv = getResponsiveVoice();
	if (rv && typeof rv.speak === "function") {
		await whenResponsiveVoiceReady();
		await speakResponsiveVoice(text);
		return;
	}
	// Fallback: native Web Speech API if the SDK is unavailable.
	if ("speechSynthesis" in window) {
		await speakNative(text);
	}
}

async function processQueue() {
  if (processing || !isBrowser()) return;
  processing = true;

  try {
    while (pendingEvents.length > 0) {
      const event = pendingEvents.shift();
      if (!event) continue;
      await playMp3Once();
      await speak(event.text);
    }
  } finally {
    processing = false;
    if (pendingEvents.length > 0) void processQueue();
  }
}

/**
 * Queues one transaction announcement. A shared FIFO queue prevents MP3/TTS
 * overlap when polling sees several transactions at the same time.
 */
export function enqueueTransactionVoice(event: TransactionVoiceEvent) {
  if (!event.eventKey || !event.text || queuedOrPlayedKeys.has(event.eventKey)) return;
  queuedOrPlayedKeys.add(event.eventKey);
  pendingEvents.push(event);
  void processQueue();
}

export function clearTransactionVoiceQueue() {
  pendingEvents.length = 0;
  if (!isBrowser()) return;
  try {
    getResponsiveVoice()?.cancel?.();
  } catch {
    /* ignore */
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
