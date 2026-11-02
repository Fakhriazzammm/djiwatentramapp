/**
 * Signed payment hint from Djiwa Tentram to Djiwa Travel.
 *
 * One Mayar account serves both products but only allows one webhook URL, so every payment event
 * lands on the Tentram receiver. Travel needs to hear about its own payments too, but the event is
 * not proof of anything: this module sends identifiers only, and Travel re-reads the transaction
 * from Mayar and settles only when Mayar reports it paid for the exact order amount. Losing the
 * hint is safe (Travel's scheduled sweep retries), and forging one cannot move money.
 */

export type TravelForwardConfig = {
  url: string;
  secret: string;
  timeoutMs?: number;
};

export type TravelForwardResult = {
  ok: boolean;
  status?: number;
  reason?: string;
  [key: string]: unknown;
};

const DEFAULT_TIMEOUT_MS = 5_000;

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signTravelForward(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
}

export async function forwardPaymentToTravel(
  config: TravelForwardConfig,
  identifiers: { transactionId: string; invoiceId: string },
): Promise<TravelForwardResult> {
  if (!config.url || !config.secret) return { ok: false, reason: "not_configured" };
  const body = JSON.stringify({
    app: "djiwa-travel-signal",
    transactionId: identifiers.transactionId,
    invoiceId: identifiers.invoiceId,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signTravelForward(config.secret, timestamp, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-djiwa-source": "djiwa-tentram",
        "x-djiwa-timestamp": timestamp,
        "x-djiwa-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      console.error("mayar-webhook travel forward rejected", response.status, JSON.stringify(result).slice(0, 200));
      return { ...result, ok: false, status: response.status };
    }
    console.log("mayar-webhook travel forward accepted", identifiers.transactionId, JSON.stringify(result).slice(0, 200));
    return { ...result, ok: true, status: response.status };
  } catch (error) {
    console.error(
      "mayar-webhook travel forward failed",
      String((error as Error)?.message || error).slice(0, 200),
    );
    return { ok: false, reason: "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}
