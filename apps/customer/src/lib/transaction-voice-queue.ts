interface ResponsiveVoiceOptions {
  onend?: () => void;
  onerror?: () => void;
}

declare global {
  interface Window {
    responsiveVoice?: {
      speak: (text: string, voice?: string, options?: ResponsiveVoiceOptions) => void;
      cancel?: () => void;
    };
  }
}

export type TransactionVoiceEvent = { eventKey: string; text: string };
const MP3_URL = "/sounds/transaction-success.mp3";
const pending: TransactionVoiceEvent[] = [];
const seen = new Set<string>();
let processing = false;

function inBrowser() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function wait<T>(promise: Promise<T>, timeout: number) {
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined as T), timeout);
    promise.then(finish).catch(() => finish(undefined as T));
  });
}

function playMp3Once() {
  if (!inBrowser()) return Promise.resolve();
  return wait(new Promise<void>((resolve) => {
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
  }), 15_000);
}

function speak(text: string) {
  if (!inBrowser()) return Promise.resolve();
  if (window.responsiveVoice?.speak) {
    return wait(new Promise<void>((resolve) => {
      const finish = () => resolve();
      try {
        window.responsiveVoice?.speak(text, "Indonesian Female", { onend: finish, onerror: finish });
      } catch {
        finish();
      }
    }), 20_000);
  }
  return Promise.resolve();
}

async function drain() {
  if (processing || !inBrowser()) return;
  processing = true;
  try {
    while (pending.length) {
      const event = pending.shift();
      if (!event) continue;
      await playMp3Once();
      await speak(event.text);
    }
  } finally {
    processing = false;
    if (pending.length) void drain();
  }
}

export function enqueueCustomerTransactionVoice(event: TransactionVoiceEvent) {
  if (!event.eventKey || !event.text || seen.has(event.eventKey)) return;
  seen.add(event.eventKey);
  pending.push(event);
  void drain();
}
