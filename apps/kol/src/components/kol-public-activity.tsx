import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AvatarImg } from "../kol-avatar";

type ActivityItem = {
  id: number | string;
  type?: string | null;
  title: string;
  body?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  creator?: { username?: string; displayName?: string; avatarUrl?: string | null } | null;
};

const typeLabel: Record<string, string> = { text: "Update", portfolio: "Karya", campaign: "Campaign", achievement: "Pencapaian" };
const safeHttpsUrl = (value?: string | null) => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
};
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Baru saja";
function timeAgo(value?: string | null) {
  if (!value) return "Baru saja";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Baru saja";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return dateLabel(value);
}
/** Teks dengan tagar disorot, tanpa HTML dari server. */
function BodyText({ body }: { body: string }) {
  return <>{body.split(/(#[\p{L}\d_]+)/gu).map((part, index) => part.startsWith("#") ? <span key={index} className="kpp-tag">{part}</span> : part)}</>;
}

/**
 * "Terbaru" di profil publik: kartu aktivitas yang digeser ke samping.
 * Memakai endpoint timeline publik yang sudah ada; bagian ini tidak dirender bila belum ada aktivitas.
 */
export function PublicActivityStrip({ apiBase, username, name, avatarUrl }: { apiBase: string; username: string; name: string; avatarUrl?: string | null }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    fetch(`${apiBase}/public/${encodeURIComponent(username)}/timeline?limit=8`, { credentials: "omit", headers: { Accept: "application/json" } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success === false) throw new Error("ACTIVITY_LOAD_FAILED");
        return Array.isArray(body?.data?.items) ? (body.data.items as ActivityItem[]) : [];
      })
      .then((next) => { if (id === requestId.current) setItems(next.filter((item) => item?.title || item?.body)); })
      .catch(() => { if (id === requestId.current) setFailed(true); })
      .finally(() => { if (id === requestId.current) { setLoading(false); setLoadedOnce(true); } });
    return () => { requestId.current += 1; };
  }, [apiBase, username, reloadKey]);

  if (loading && !loadedOnce) {
    return <>
      <h2 className="kpp-sec">Terbaru</h2>
      <div className="kpp-hs" aria-hidden="true">{[1, 2].map((key) => <div key={key} className="kpp-skel kpp-skel-post" />)}</div>
    </>;
  }
  if (failed && !items.length) {
    return <>
      <h2 className="kpp-sec">Terbaru</h2>
      <div className="kpp-hs-error" role="status">Aktivitas publik belum dapat dimuat.<button type="button" onClick={() => setReloadKey((value) => value + 1)}>Coba lagi</button></div>
    </>;
  }
  if (!items.length) return null;

  return <>
    <h2 className="kpp-sec">Terbaru</h2>
    <div className="kpp-hs" aria-label="Aktivitas terbaru">
      {items.map((item) => {
        const creatorName = item.creator?.displayName || name;
        const mediaUrl = safeHttpsUrl(item.mediaUrl);
        const thumbnailUrl = safeHttpsUrl(item.thumbnailUrl);
        const kind = typeLabel[item.type || ""] || "Aktivitas";
        return <article key={item.id} className="kpp-post">
          <div className="kpp-post-h">
            <AvatarImg url={safeHttpsUrl(item.creator?.avatarUrl) || safeHttpsUrl(avatarUrl)} name={creatorName} size={36} />
            <div style={{ minWidth: 0 }}>
              <b>{creatorName}</b>
              <small>{timeAgo(item.publishedAt)} · {kind}</small>
            </div>
          </div>
          {item.body ? <p><BodyText body={item.body} /></p> : item.title ? <p>{item.title}</p> : null}
          {mediaUrl && <a className="kpp-media" href={mediaUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buka ${item.title || "konten"}`}>
            {thumbnailUrl && <img src={thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span>Buka konten <ArrowUpRight size={13} /></span>
          </a>}
        </article>;
      })}
    </div>
  </>;
}
