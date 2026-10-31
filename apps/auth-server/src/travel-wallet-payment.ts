import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const MIN_SECRET_BYTES = 32;

type ChargeInput = { customerId: string; orderId: string; amount: number };
type ChargeResult = {
  ok?: unknown;
  result?: unknown;
  ledgerId?: unknown;
  balance?: unknown;
};

type EndpointDependencies = {
  secret: () => string;
  now?: () => number;
  resolveCustomerId: (headers: Headers) => Promise<string | null>;
  isActiveCustomer: (customerId: string) => Promise<boolean>;
  charge: (input: ChargeInput) => Promise<ChargeResult>;
};

async function readBoundedBody(request: Request): Promise<
  { kind: "ok"; text: string } | { kind: "too_large" } | { kind: "read_error" }
> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "ok", text: "" };

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "read_error" };
  }

  return {
    kind: "ok",
    text: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), byteLength).toString("utf8"),
  };
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function parseChargeInput(rawBody: string): Omit<ChargeInput, "customerId"> | null {
  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fields = Object.keys(input);
  if (fields.length !== 2 || !fields.includes("orderId") || !fields.includes("amount")) return null;

  const value = input as Record<string, unknown>;
  if (typeof value.orderId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.orderId)) return null;
  if (typeof value.amount !== "number" || !Number.isSafeInteger(value.amount) || value.amount <= 0) return null;
  return { orderId: value.orderId, amount: value.amount };
}

function hasValidSignature(rawBody: string, timestamp: string | null, signature: string | null, secret: string, now: number) {
  if (!timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createTravelWalletPaymentEndpoint(dependencies: EndpointDependencies) {
  const now = dependencies.now ?? Date.now;

  return async function handleTravelWalletPayment(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

    const secret = dependencies.secret();
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
      return jsonResponse({ success: false, error: "PAYMENT_BRIDGE_UNAVAILABLE" }, 503);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return jsonResponse({ success: false, error: "INVALID_INPUT" }, 415);
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const declaredBytes = Number(contentLength);
      if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
        return jsonResponse({ success: false, error: "INVALID_INPUT" }, 400);
      }
      if (declaredBytes > MAX_BODY_BYTES) {
        return jsonResponse({ success: false, error: "INVALID_INPUT" }, 413);
      }
    }

    const body = await readBoundedBody(request);
    if (body.kind === "too_large") {
      return jsonResponse({ success: false, error: "INVALID_INPUT" }, 413);
    }
    if (body.kind === "read_error") return jsonResponse({ success: false, error: "INVALID_INPUT" }, 400);
    const rawBody = body.text;
    if (!hasValidSignature(
      rawBody,
      request.headers.get("x-travel-timestamp"),
      request.headers.get("x-travel-signature"),
      secret,
      now(),
    )) {
      return jsonResponse({ success: false, error: "INVALID_SIGNATURE" }, 401);
    }

    const input = parseChargeInput(rawBody);
    if (!input) return jsonResponse({ success: false, error: "INVALID_INPUT" }, 400);

    try {
      const customerId = (await dependencies.resolveCustomerId(request.headers))?.trim();
      if (!customerId) return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
      if (!(await dependencies.isActiveCustomer(customerId))) {
        return jsonResponse({ success: false, error: "CUSTOMER_UNAVAILABLE" }, 403);
      }

      const result = await dependencies.charge({ customerId, ...input });
      if (result?.ok === true && (result.result === "charged" || result.result === "already_charged")) {
        const transactionId = typeof result.ledgerId === "string" || typeof result.ledgerId === "number"
          ? String(result.ledgerId)
          : "";
        if (!transactionId) return jsonResponse({ success: false, error: "PAYMENT_RESULT_UNKNOWN" }, 503);
        return jsonResponse({
          success: true,
          status: result.result,
          transactionId,
          ...(typeof result.balance === "number" && Number.isSafeInteger(result.balance) ? { balance: result.balance } : {}),
        }, 200);
      }
      if (result?.ok === false && result.result === "insufficient_balance") {
        return jsonResponse({
          success: false,
          error: "INSUFFICIENT_BALANCE",
          ...(typeof result.balance === "number" && Number.isSafeInteger(result.balance) ? { balance: result.balance } : {}),
        }, 409);
      }
      if (result?.ok === false && result.result === "wallet_blocked") {
        return jsonResponse({ success: false, error: "WALLET_BLOCKED" }, 423);
      }
      return jsonResponse({ success: false, error: "PAYMENT_RESULT_UNKNOWN" }, 503);
    } catch {
      return jsonResponse({ success: false, error: "PAYMENT_RESULT_UNKNOWN" }, 503);
    }
  };
}
