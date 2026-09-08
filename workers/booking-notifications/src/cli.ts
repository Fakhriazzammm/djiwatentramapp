import { adaptersFromConfig, BookingNotificationWorker, configFromEnv, SupabaseBookingNotificationDb, type Logger } from "./runtime.ts";

const url = process.env.SUPABASE_URL ?? process.env.BOOKING_NOTIFICATION_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const config = configFromEnv(process.env);
const dryRun = process.env.BOOKING_NOTIFICATION_DRY_RUN === "true";
const pollMs = Number(process.env.BOOKING_NOTIFICATION_POLL_MS ?? 5_000);
if (!Number.isFinite(pollMs) || pollMs < 250) throw new Error("BOOKING_NOTIFICATION_POLL_MS must be at least 250");

const logger: Logger = {
  info: (event, fields) => console.log(JSON.stringify({ level: "info", event, ...fields })),
  error: (event, fields) => console.error(JSON.stringify({ level: "error", event, ...fields })),
};
const worker = new BookingNotificationWorker(new SupabaseBookingNotificationDb(url, key), adaptersFromConfig(dryRun), config, logger);
const controller = new AbortController();
process.once("SIGTERM", () => controller.abort());
process.once("SIGINT", () => controller.abort());
await worker.runForever(controller.signal, pollMs);
