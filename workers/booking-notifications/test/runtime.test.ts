import { describe, expect, it } from "bun:test";
import {
  adaptersFromConfig,
  BookingNotificationWorker,
  configFromEnv,
  retryDelayMs,
  safeError,
  validateWorkerId,
  type BookingNotificationDb,
  type Delivery,
} from "../src/runtime.ts";

function dbFor(deliveries: Delivery[], completed: unknown[] = []): BookingNotificationDb {
  return {
    async claim() { return deliveries; },
    async complete(input) { completed.push(input); return { ok: true }; },
  };
}

const config = { workerId: "booking-worker-test", batchSize: 10, maxAttempts: 3, baseRetryDelayMs: 100, maxRetryDelayMs: 250 };
const delivery = (attempt_count: number, channel: Delivery["channel"] = "internal"): Delivery => ({ id: `d-${attempt_count}`, channel, payload: {}, attempt_count });

 describe("booking notification worker", () => {
  it("claims through the DB contract and completes a successful dry-run delivery as sent", async () => {
    const completed: any[] = [];
    let claimArgs: unknown[] = [];
    const db: BookingNotificationDb = {
      async claim(...args) { claimArgs = args; return [delivery(1)]; },
      async complete(input) { completed.push(input); return { ok: true }; },
    };
    const worker = new BookingNotificationWorker(db, adaptersFromConfig(true), config);
    await worker.runOnce();
    expect(claimArgs[0]).toBe("booking-worker-test");
    expect(claimArgs[1]).toBe(10);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ id: "d-1", status: "sent" });
    expect(worker.metrics.sent).toBe(1);
  });

  it("fails closed for an unconfigured provider and retries with bounded exponential delay", async () => {
    const completed: any[] = [];
    const worker = new BookingNotificationWorker(dbFor([delivery(1, "whatsapp")], completed), adaptersFromConfig(false), config);
    await worker.runOnce();
    expect(completed[0]).toMatchObject({ status: "retrying", retryDelayMs: 100 });
    expect(completed[0].error).toContain("No provider configured");
    expect(worker.metrics.retried).toBe(1);
  });

  it("marks the max attempt terminal and never calls a sent row", async () => {
    const completed: any[] = [];
    const worker = new BookingNotificationWorker(dbFor([delivery(3, "telegram"), { ...delivery(3), id: "already-sent", status: "sent" }], completed), adaptersFromConfig(false), config);
    await worker.runOnce();
    expect(completed[0]).toMatchObject({ id: "d-3", status: "failed", retryDelayMs: 0 });
    expect(completed).toHaveLength(1);
    expect(worker.metrics.permanentlyFailed).toBe(1);
    expect(worker.metrics.skippedSent).toBe(1);
  });

  it("stops polling after abort without claiming again", async () => {
    let claims = 0;
    const controller = new AbortController();
    const db: BookingNotificationDb = {
      async claim() { claims++; controller.abort(); return []; },
      async complete() { return { ok: true }; },
    };
    const worker = new BookingNotificationWorker(db, adaptersFromConfig(true), config);
    await worker.runForever(controller.signal, 250);
    expect(claims).toBe(1);
  });

  it("uses the exact claim and complete RPC names", async () => {
    const calls: { url: string; body: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), body: String(init?.body) });
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    try {
      const { SupabaseBookingNotificationDb } = await import("../src/runtime.ts");
      const db = new SupabaseBookingNotificationDb("https://supabase.test", "service-secret");
      await db.claim("worker-1", 2, 123);
      await db.complete({ id: "d-1", status: "sent", retryDelayMs: 0, now: 123 });
      expect(calls[0].url).toContain("claim_booking_notification_deliveries");
      expect(calls[1].url).toContain("complete_booking_notification_delivery");
      expect(calls[0].body).toContain("p_worker_id");
      expect(calls[1].body).toContain("p_status");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses safe worker identity, error redaction, and bounded retry", () => {
    expect(() => validateWorkerId("worker with spaces")).toThrow();
    expect(retryDelayMs(10, config)).toBe(250);
    expect(safeError(new Error("token=abc https://secret.example/x"))).toBe("token=[redacted] [url]");
    expect(configFromEnv({ BOOKING_NOTIFICATION_WORKER_ID: "w-1" }).workerId).toBe("w-1");
  });
});
