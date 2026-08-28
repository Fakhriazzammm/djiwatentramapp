interface ResponsiveVoiceOptions {
  onend?: () => void;
  onerror?: () => void;
}

interface ResponsiveVoiceApi {
  speak: (text: string, voice?: string, options?: ResponsiveVoiceOptions) => void;
  cancel?: () => void;
}

declare global {
  interface Window {
    responsiveVoice?: ResponsiveVoiceApi;
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
  pause: () => void;
};

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

function speakWithFallbackTts(text: string) {
  if (!isBrowser()) return Promise.resolve();

  const responsiveVoice = window.responsiveVoice;
  if (responsiveVoice?.speak) {
    return withTimeout(new Promise<void>((resolve) => {
      const finish = () => resolve();
      try {
        responsiveVoice.speak(text, "Indonesian Female", {
          onend: finish,
          onerror: finish,
        });
      } catch {
        finish();
      }
    }), TTS_TIMEOUT_MS);
  }

  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return Promise.resolve();
  }

  return withTimeout(new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  }), TTS_TIMEOUT_MS);
}

async function processQueue() {
  if (processing || !isBrowser()) return;
  processing = true;

  try {
    while (pendingEvents.length > 0) {
      const event = pendingEvents.shift();
      if (!event) continue;
      await playMp3Once();
      await speakWithFallbackTts(event.text);
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
  window.responsiveVoice?.cancel?.();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
