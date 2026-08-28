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

let audioUnlocked = false;

/**
 * Browsers block Audio / speechSynthesis until the user interacts with the
 * page. Call this once from any real user gesture (click / keydown / touch) so
 * later transaction announcements can play even when the event arrives from a
 * background poll without a fresh gesture.
 */
export function unlockAudio() {
	// Intentionally a no-op flag. We do NOT play any silent utterance here:
	// doing so triggered the browser's speech engine on every user gesture /
	// page navigation. Real announcements are spoken only via playMp3Once() +
	// speakNative() when an actual transaction arrives (which already happens
	// after a genuine user gesture, so autoplay policy is satisfied).
	audioUnlocked = true;
}
const MP3_URL = "/sounds/transaction-success.mp3";
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
    const audio = new Audio(MP3_URL);
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

export function enqueueCustomerTransactionVoice(event: TransactionVoiceEvent) {
  if (!event.eventKey || !event.text || queuedOrPlayedKeys.has(event.eventKey)) return;
  queuedOrPlayedKeys.add(event.eventKey);
  pendingEvents.push(event);
  void processQueue();
}
