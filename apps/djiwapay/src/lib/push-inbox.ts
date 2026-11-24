/** Marketing pushes sent to this person, shown on the notifications page next to the other notifications. */
export type InboxItem = { id: string; title: string; message: string; route: string; image: string | null; at: string; opened: boolean };
export async function loadPushInbox(): Promise<InboxItem[]> {
  const r = await fetch("/api/finance/push/inbox", { credentials: "include" }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  return j?.success && Array.isArray(j.items) ? j.items : [];
}
export const markPushOpened = (notificationId: string) => { const did = notificationId.replace(/^pm-/, ""); void fetch("/api/finance/push/opened", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ did }) }).catch(() => undefined); };
