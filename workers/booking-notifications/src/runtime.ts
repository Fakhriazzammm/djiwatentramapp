export type NotificationChannel = "internal" | "whatsapp" | "telegram";
export type CompletionStatus = "sent" | "retrying" | "failed";

export interface Delivery {
  id: string;
  channel: NotificationChannel;
  payload: Record<string, unknown>;
  status?: string;
  attempt_count: number;
  dedupe_key?: string;
}

export interface BookingNotificationDb {
  claim(workerId: string, limit: number, now: number): Promise<Delivery[]>;
  complete(input: {
    id: string;
    status: CompletionStatus;
    error?: string;
    retryDelayMs: number;
    now: number;
  }): Promise<unknown>;
}

export interface NotificationAdapter {
  readonly channel: NotificationChannel;
  deliver(delivery: Delivery): Promise<void>;
}

export class ProviderUnavailableError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.retryable = retryable;
  }
}

export class DryRunAdapter implements NotificationAdapter {
  constructor(public readonly channel: NotificationChannel) {}
  async deliver(_delivery: Delivery): Promise<void> {
    // Deliberately does not call an external provider. It is opt-in for validation only.
  }
}

export class UnconfiguredAdapter implements NotificationAdapter {
  constructor(public readonly channel: NotificationChannel) {}
  async deliver(_delivery: Delivery): Promise<void> {
    throw new ProviderUnavailableError(`No provider configured for ${this.channel}`);
  }
}

export interface WorkerConfig {
  workerId: string;
  batchSize: number;
  maxAttempts: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
}

export interface WorkerMetrics {
  claimed: number;
  sent: number;
  retried: number;
  permanentlyFailed: number;
  skippedSent: number;
  providerErrors: number;
  lastQueueDepth?: number;
  lastOldestCreatedAt?: number;
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export const silentLogger: Logger = { info() {}, error() {} };

export function validateWorkerId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new Error("BOOKING_NOTIFICATION_WORKER_ID must be a safe non-empty identifier");
  }
  return id;
}

export function retryDelayMs(attempt: number, config: Pick<WorkerConfig, "baseRetryDelayMs" | "maxRetryDelayMs">): number {
  const exponent = Math.max(0, Math.min(30, attempt - 1));
  return Math.min(config.maxRetryDelayMs, config.baseRetryDelayMs * 2 ** exponent);
}

export function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(bearer|token|secret|password|key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 500);
}

export class BookingNotificationWorker {
  readonly metrics: WorkerMetrics = { claimed: 0, sent: 0, retried: 0, permanentlyFailed: 0, skippedSent: 0, providerErrors: 0 };
  private running = false;

  constructor(
    private readonly db: BookingNotificationDb,
    private readonly adapters: ReadonlyMap<NotificationChannel, NotificationAdapter>,
    private readonly config: WorkerConfig,
    private readonly logger: Logger = silentLogger,
    private readonly now: () => number = () => Date.now(),
  ) {
    validateWorkerId(config.workerId);
    if (config.batchSize < 1 || config.batchSize > 100) throw new Error("batchSize must be between 1 and 100");
    if (config.maxAttempts < 1 || config.maxAttempts > 20) throw new Error("maxAttempts must be between 1 and 20");
  }

  async runOnce(): Promise<WorkerMetrics> {
    if (this.running) return this.metrics;
    this.running = true;
    try {
      const now = this.now();
      const deliveries = await this.db.claim(this.config.workerId, this.config.batchSize, now);
      this.metrics.claimed += deliveries.length;
      this.logger.info("booking_notification_poll", {
        claimed: deliveries.length,
        sent: this.metrics.sent,
        retried: this.metrics.retried,
        permanentlyFailed: this.metrics.permanentlyFailed,
      });
      for (const delivery of deliveries) await this.process(delivery);
      return this.metrics;
    } finally {
      this.running = false;
    }
  }

  async runForever(signal: AbortSignal, pollMs: number): Promise<void> {
    if (pollMs < 250) throw new Error("pollMs must be at least 250ms");
    while (!signal.aborted) {
      await this.runOnce();
      if (!signal.aborted) await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }

  private async process(delivery: Delivery): Promise<void> {
    if (delivery.status === "sent") {
      this.metrics.skippedSent++;
      return;
    }
    const adapter = this.adapters.get(delivery.channel);
    if (!adapter) {
      await this.completeFailure(delivery, new ProviderUnavailableError(`No adapter configured for ${delivery.channel}`));
      return;
    }
    try {
      await adapter.deliver(delivery);
      await this.db.complete({ id: delivery.id, status: "sent", retryDelayMs: 0, now: this.now() });
      this.metrics.sent++;
      this.logger.info("booking_notification_sent", { deliveryId: delivery.id, channel: delivery.channel, attempt: delivery.attempt_count });
    } catch (error) {
      await this.completeFailure(delivery, error);
    }
  }

  private async completeFailure(delivery: Delivery, error: unknown): Promise<void> {
    this.metrics.providerErrors++;
    const message = safeError(error);
    const terminal = delivery.attempt_count >= this.config.maxAttempts;
    await this.db.complete({
      id: delivery.id,
      status: terminal ? "failed" : "retrying",
      error: message,
      retryDelayMs: terminal ? 0 : retryDelayMs(delivery.attempt_count, this.config),
      now: this.now(),
    });
    if (terminal) {
      this.metrics.permanentlyFailed++;
      this.logger.error("booking_notification_failed", { deliveryId: delivery.id, channel: delivery.channel, attempt: delivery.attempt_count, error: message });
    } else {
      this.metrics.retried++;
      this.logger.info("booking_notification_retrying", { deliveryId: delivery.id, channel: delivery.channel, attempt: delivery.attempt_count, retryDelayMs: retryDelayMs(delivery.attempt_count, this.config) });
    }
  }
}

export class SupabaseBookingNotificationDb implements BookingNotificationDb {
  constructor(private readonly url: string, private readonly serviceRoleKey: string) {
    if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  async claim(workerId: string, limit: number, now: number): Promise<Delivery[]> {
    return this.rpc<Delivery[]>("claim_booking_notification_deliveries", { p_worker_id: workerId, p_limit: limit, p_now: now });
  }
  async complete(input: { id: string; status: CompletionStatus; error?: string; retryDelayMs: number; now: number }): Promise<unknown> {
    return this.rpc("complete_booking_notification_delivery", { p_id: input.id, p_status: input.status, p_error: input.error ?? null, p_retry_delay_ms: input.retryDelayMs, p_now: input.now });
  }
  private async rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: (() => {
        const headers = new Headers();
        headers.set("apikey", this.serviceRoleKey);
        headers.set("Authorization", `Bearer ${this.serviceRoleKey}`);
        headers.set("Content-Type", "application/json");
        return headers;
      })(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Supabase RPC ${name} failed with HTTP ${response.status}`);
    return await response.json() as T;
  }
}

export function adaptersFromConfig(dryRun: boolean): ReadonlyMap<NotificationChannel, NotificationAdapter> {
  return new Map(((["internal", "whatsapp", "telegram"] as NotificationChannel[]).map((channel) => [channel, dryRun ? new DryRunAdapter(channel) : new UnconfiguredAdapter(channel)])));
}

export function configFromEnv(env: Record<string, string | undefined>): WorkerConfig {
  const workerId = validateWorkerId(env.BOOKING_NOTIFICATION_WORKER_ID ?? "");
  const number = (name: string, fallback: number) => {
    const value = env[name];
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`);
    return parsed;
  };
  return { workerId, batchSize: number("BOOKING_NOTIFICATION_BATCH_SIZE", 25), maxAttempts: number("BOOKING_NOTIFICATION_MAX_ATTEMPTS", 5), baseRetryDelayMs: number("BOOKING_NOTIFICATION_BASE_RETRY_DELAY_MS", 30_000), maxRetryDelayMs: number("BOOKING_NOTIFICATION_MAX_RETRY_DELAY_MS", 3_600_000) };
}
