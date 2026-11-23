import { call } from "./finance/integrations";

/** Android only: the Djiwa Pay app can read the notifications of bank, e-wallet and biller apps (after the person turns that on in Android settings)
 *  and hand them to the person's own account, where they pass the same checks as e-mail. Only the apps in the list are ever read. */
type Native = {
  configure: (o: { packages: string[] }) => Promise<void>; status: () => Promise<{ enabled: boolean; pending: number }>; openSettings: () => Promise<void>;
  peek: (o: { max: number }) => Promise<{ items: { pkg: string; title: string; text: string; at: number }[] }>; ack: (o: { count: number }) => Promise<void>;
};
export type NotifApp = { issuerId: string; name: string; kind: "bank" | "ewallet" | "service"; packages: string[] };
export type NotifConfig = { apps: NotifApp[]; state: { lastAt: string; received: number } | null };
export type IngestResult = { received: number; recorded: number; review: number; ignored: number; duplicate: number; unknownApp: number };

const cap = () => (window as unknown as { Capacitor?: { getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor;
const native = (): Native | null => (cap()?.getPlatform?.() === "android" ? ((cap()?.Plugins?.DjiwaNotif as Native | undefined) ?? null) : null);
/** True inside the Android app, once it has the notification reader (an older app version does not). */
export const notifSupported = () => native() !== null;

export const getNotifConfig = () => call<NotifConfig & { success: true }>("/notif/config");
export async function notifStatus() { const n = native(); return n ? n.status().catch(() => null) : null; }
export async function openNotifSettings() { await native()?.openSettings(); }

let running = false;
/** Tells the phone which apps to read, then sends what it has collected, in small batches. What was not accepted stays on the phone and is sent next time. */
export async function syncNotifications(): Promise<IngestResult | null> {
  const n = native(); if (!n || running) return null;
  running = true;
  try {
    const cfg = await getNotifConfig();
    await n.configure({ packages: cfg.apps.flatMap((a) => a.packages) });
    const st = await n.status();
    if (!st.enabled || !st.pending) return null;
    const total: IngestResult = { received: 0, recorded: 0, review: 0, ignored: 0, duplicate: 0, unknownApp: 0 };
    for (let round = 0; round < 8; round++) {
      const { items } = await n.peek({ max: 40 }); if (!items.length) break;
      const r = await call<IngestResult & { success: true }>("/notif", { method: "POST", body: JSON.stringify({ items }) });
      await n.ack({ count: items.length });
      for (const k of Object.keys(total) as (keyof IngestResult)[]) total[k] += Number(r[k] ?? 0);
    }
    return total;
  } catch { return null; } finally { running = false; }
}
