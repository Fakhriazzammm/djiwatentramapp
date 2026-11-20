import { useCallback, useEffect, useMemo, useState } from "react";
import { kolApi } from "./kol-lib";

/** Notifikasi KOL: gabungan pemberitahuan sistem (visit, reward) dan pengumuman dari admin/manager. */
export type NotifKind = "admin" | "kampanye" | "reward" | "visit";
export type NotifItem = {
  key: string; source: "sys" | "ann"; id: number; kind: NotifKind; title: string; body: string; createdAt: string;
  read: boolean; urgent: boolean; pinned: boolean; requireAck: boolean; acked: boolean;
};
type Sys = { id: number; type: string; title: string; body: string; read_at: string | null; created_at: string };
type Ann = { id: number; title: string; body: string; kind: "info" | "penting" | "kampanye"; pinned: boolean; requireAck: boolean; createdAt: string; readAt: string | null; ackedAt: string | null };

export const KIND_LABEL: Record<NotifKind, string> = { admin: "Admin", kampanye: "Kampanye", reward: "Reward", visit: "Visit" };
export const sysKind = (type: string): NotifKind => (type.startsWith("reward") ? "reward" : type.startsWith("visit") || type.startsWith("sow") ? "visit" : "kampanye");

const tz = "Asia/Jakarta";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
export function dayGroup(iso: string, now = new Date()) {
  const d = new Date(iso);
  const today = dayKey(now), yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const key = dayKey(d);
  return key === today ? "Hari ini" : key === yesterday ? "Kemarin" : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: tz });
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: tz }).replace(":", ".");
export const fullDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
export const metaOf = (n: NotifItem) => `${n.source === "ann" ? "Dari admin" : KIND_LABEL[n.kind]} · ${clock(n.createdAt)}`;

export function useNotifs() {
  const [sys, setSys] = useState<Sys[]>([]);
  const [ann, setAnn] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      kolApi<Sys[]>("/portal/notifications").catch(() => [] as Sys[]),
      kolApi<Ann[]>("/portal/announcements").catch(() => [] as Ann[]),
    ]);
    setSys(Array.isArray(a) ? a : []); setAnn(Array.isArray(b) ? b : []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = useMemo<NotifItem[]>(() => [
    ...sys.map((n): NotifItem => ({ key: `s${n.id}`, source: "sys", id: n.id, kind: sysKind(n.type), title: n.title, body: n.body, createdAt: n.created_at, read: Boolean(n.read_at), urgent: false, pinned: false, requireAck: false, acked: false })),
    ...ann.map((n): NotifItem => ({ key: `a${n.id}`, source: "ann", id: n.id, kind: n.kind === "kampanye" ? "kampanye" : "admin", title: n.title, body: n.body, createdAt: n.createdAt, read: Boolean(n.readAt), urgent: n.kind === "penting", pinned: n.pinned, requireAck: n.requireAck, acked: Boolean(n.ackedAt) })),
  ].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt)), [sys, ann]);

  const setRead = (item: NotifItem, read: boolean) => {
    const at = read ? new Date().toISOString() : null;
    if (item.source === "sys") setSys((p) => p.map((n) => (n.id === item.id ? { ...n, read_at: at } : n)));
    else setAnn((p) => p.map((n) => (n.id === item.id ? { ...n, readAt: at } : n)));
  };
  /** Tandai dibaca (server hanya menyimpan "dibaca"; membuka kembali sebagai belum dibaca hanya berlaku di layar ini). */
  const markRead = useCallback((item: NotifItem) => {
    if (item.read) return;
    setRead(item, true);
    const call = item.source === "sys" ? kolApi("/portal/notifications/read", { method: "POST", body: JSON.stringify({ id: item.id }) }) : kolApi("/portal/announcements/read", { method: "POST", body: JSON.stringify({ id: item.id }) });
    void call.catch(() => setRead(item, false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const markAll = useCallback(() => {
    setSys((p) => p.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    setAnn((p) => p.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    void Promise.all([
      kolApi("/portal/notifications/read", { method: "POST", body: JSON.stringify({ all: true }) }),
      kolApi("/portal/announcements/read", { method: "POST", body: JSON.stringify({ all: true }) }),
    ]).catch(() => void load());
  }, [load]);
  const ack = useCallback(async (item: NotifItem) => {
    setAnn((p) => p.map((n) => (n.id === item.id ? { ...n, readAt: n.readAt ?? new Date().toISOString(), ackedAt: new Date().toISOString() } : n)));
    await kolApi(`/portal/announcements/${item.id}/ack`, { method: "POST" }).catch(() => void load());
  }, [load]);

  const unread = items.filter((n) => !n.read).length;
  const banner = items.find((n) => n.source === "ann" && n.pinned && !n.read) ?? null;
  return { items, unread, loading, banner, markRead, markAll, ack, reload: load };
}
export type Notifs = ReturnType<typeof useNotifs>;
