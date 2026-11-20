import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { KxSheet } from "./kol-sheet";
import { AvatarImg } from "./kol-avatar";
import { kolApi, timeAgo } from "./kol-lib";

type Item = {
  id: number | string; type: "text" | "portfolio" | "campaign" | "achievement"; title: string; body?: string | null; mediaUrl?: string | null; thumbnailUrl?: string | null; publishedAt?: string | null;
  creator?: { username?: string; displayName?: string; avatarUrl?: string | null };
};
type Page = { items: Item[]; nextCursor: string | null; hasMore: boolean };
type Creator = { username: string; displayName?: string; avatarUrl?: string | null; category?: string | null; location?: string | null; availability?: { status?: string } | string | null };

const FILTERS: Array<[string, string]> = [["all", "Semua"], ["text", "Creator"], ["portfolio", "Karya"], ["campaign", "Kampanye"], ["achievement", "Pencapaian"]];
const TYPE_LABEL: Record<string, string> = { text: "Update", portfolio: "Karya", campaign: "Kampanye", achievement: "Pencapaian" };
const REPORTS: Array<[string, string]> = [["spam", "Spam"], ["privacy", "Melanggar privasi"], ["misleading", "Menyesatkan"], ["harassment", "Pelecehan"], ["other", "Lainnya"]];
const AVAILABILITY: Record<string, string> = { open: "Terbuka untuk kolaborasi", selective: "Campaign tertentu" };
const empty: Page = { items: [], nextCursor: null, hasMore: false };
const toPage = (d: any): Page => ({ items: Array.isArray(d?.items) ? d.items : [], nextCursor: d?.nextCursor ?? null, hasMore: Boolean(d?.hasMore) });

const Avatar = AvatarImg;
function Body({ text }: { text: string }) {
  return <>{text.split(/(#[\p{L}\d_]+)/u).map((part, i) => (part.startsWith("#") ? <span key={i} className="kx-tag">{part}</span> : part))}</>;
}

export function CommunityTab({ username }: { username: string }) {
  const [view, setView] = useState<"feed" | "creators">("feed");
  return (
    <div>
      <div className="kx-seg" role="group" aria-label="Tampilan komunitas">
        <button type="button" aria-pressed={view === "feed"} onClick={() => setView("feed")}>Linimasa</button>
        <button type="button" aria-pressed={view === "creators"} onClick={() => setView("creators")}>Creator</button>
      </div>
      {view === "feed" ? <Feed username={username} /> : <Creators username={username} />}
    </div>
  );
}

/* ---------- Linimasa ---------- */
export function Feed({ username }: { username: string }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState<Page>(empty);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [compose, setCompose] = useState<Item | true | null>(null);
  const [menu, setMenu] = useState<Item | null>(null);
  const [report, setReport] = useState<Item | null>(null);
  const [toast, setToast] = useState("");
  const seq = useRef(0);

  const load = async (append = false, cursor?: string | null) => {
    const id = ++seq.current;
    if (append) setMore(true); else { setLoading(true); setError(""); }
    try {
      const q = new URLSearchParams({ limit: "20", type: filter });
      if (append && cursor) q.set("before", cursor);
      const data = toPage(await kolApi<any>(`/portal/timeline?${q}`));
      if (id !== seq.current) return;
      setPage(prev => append ? { ...data, items: [...prev.items, ...data.items.filter(i => !prev.items.some(e => String(e.id) === String(i.id)))] } : data);
    } catch { if (id === seq.current) setError("Linimasa belum bisa dimuat."); }
    finally { if (id === seq.current) { setLoading(false); setMore(false); } }
  };
  useEffect(() => { setPage(empty); void load(); return () => { seq.current += 1; }; }, [filter]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(t); }, [toast]);

  const isOwn = (item: Item) => !item.creator?.username || item.creator.username === username;
  const remove = async (item: Item) => {
    setMenu(null);
    try { await kolApi(`/portal/timeline/${item.id}`, { method: "DELETE" }); setToast("Update dihapus."); void load(); } catch { setToast("Update belum bisa dihapus."); }
  };
  const sendReport = async (reason: string) => {
    if (!report) return;
    try { await kolApi(`/portal/timeline/${report.id}/report`, { method: "POST", body: JSON.stringify({ reason }) }); setReport(null); setToast("Laporan diterima. Terima kasih."); }
    catch { setReport(null); setToast("Laporan belum terkirim."); }
  };

  return (
    <div>
      {toast && <div className="kx-toast" role="status">{toast}</div>}
      <button type="button" className="kx-card" onClick={() => setCompose(true)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "center", minHeight: 56, color: "var(--kx-muted)" }}>
        <span className="kx-ico" aria-hidden>✎</span>Bagikan sesuatu dengan komunitas…
      </button>
      <div className="kx-hs" style={{ marginTop: 14 }} role="group" aria-label="Filter linimasa">
        {FILTERS.map(([key, label]) => <button type="button" key={key} className="kx-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>

      {loading ? [1, 2, 3].map(i => <div key={i} className="kx-skel" />)
        : error && !page.items.length ? <div role="alert" className="kx-note kx-note--err">{error}<button type="button" className="kx-link" style={{ display: "flex" }} onClick={() => void load()}>Coba lagi</button></div>
        : !page.items.length ? <div className="kx-card" style={{ textAlign: "center", padding: 28 }}><b style={{ display: "block" }}>{filter === "all" ? "Belum ada aktivitas" : "Belum ada yang cocok"}</b><span className="kx-sub">{filter === "all" ? "Jadilah yang pertama berbagi karya atau kabar." : "Coba filter Semua."}</span></div>
        : <>
          {page.items.map(item => (
            <article key={item.id} className="kx-post">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Avatar url={item.creator?.avatarUrl} name={item.creator?.displayName || "C"} />
                <div className="kx-main"><b style={{ fontSize: 14 }}>{item.creator?.displayName || "Creator"}</b><small>@{item.creator?.username || username} · {timeAgo(item.publishedAt)}</small></div>
                <span className="kx-pill kx-pill--info">{TYPE_LABEL[item.type] || "Update"}</span>
                <button type="button" className="kx-more" aria-label="Menu update" onClick={() => setMenu(item)}>⋯</button>
              </div>
              {item.type !== "text" && <p style={{ fontWeight: 700 }}>{item.title}</p>}
              {item.body && <p><Body text={item.body} /></p>}
              {item.mediaUrl && (
                <a className="kx-media" href={item.mediaUrl} target="_blank" rel="noreferrer">
                  {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" />}<span>{item.type === "campaign" ? "Lihat kampanye ↗" : "Buka konten ↗"}</span>
                </a>
              )}
            </article>
          ))}
          {page.hasMore && <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" disabled={more} onClick={() => void load(true, page.nextCursor)}>{more ? "Memuat…" : "Muat lebih banyak"}</button>}
        </>}

      {menu && (
        <KxSheet title="Update" onClose={() => setMenu(null)}>
          <div className="kx-group">
            {isOwn(menu) ? <>
              {menu.type === "text" && <button type="button" className="kx-grow" onClick={() => { setCompose(menu); setMenu(null); }}><span className="kx-main"><b>Edit</b></span></button>}
              <button type="button" className="kx-grow" onClick={() => void remove(menu)}><span className="kx-main"><b style={{ color: "var(--kx-bad)" }}>Hapus</b></span></button>
            </> : <button type="button" className="kx-grow" onClick={() => { setReport(menu); setMenu(null); }}><span className="kx-main"><b>Laporkan</b><small>Spam, privasi, atau konten menyesatkan</small></span></button>}
          </div>
        </KxSheet>
      )}
      {report && (
        <KxSheet title="Laporkan update" onClose={() => setReport(null)}>
          <div className="kx-group">{REPORTS.map(([key, label]) => <button type="button" key={key} className="kx-grow" onClick={() => void sendReport(key)}><span className="kx-main"><b>{label}</b></span><span className="kx-chev">›</span></button>)}</div>
        </KxSheet>
      )}
      {compose && <Composer initial={compose === true ? undefined : compose} onClose={() => setCompose(null)} onSaved={() => { setCompose(null); setToast("Update dibagikan."); void load(); }} />}
    </div>
  );
}

function Composer({ initial, onClose, onSaved }: { initial?: Item; onClose: () => void; onSaved: () => void }) {
  const [body, setBody] = useState(initial?.body || "");
  const [link, setLink] = useState(initial?.mediaUrl || "");
  const [linkOpen, setLinkOpen] = useState(Boolean(initial?.mediaUrl));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const text = body.trim();
    if (!text) { setError("Tulis sesuatu dulu."); return; }
    if (link.trim() && !/^https?:\/\/\S{4,}$/i.test(link.trim())) { setError("Link harus diawali http:// atau https://"); return; }
    setBusy(true); setError("");
    try {
      await kolApi(initial ? `/portal/timeline/${initial.id}` : "/portal/timeline", { method: initial ? "PATCH" : "POST", body: JSON.stringify({ type: "text", title: (text.split("\n")[0] ?? "").slice(0, 160) || "Update creator", body: text, mediaUrl: link.trim() || null }) });
      onSaved();
    } catch { setError("Update belum tersimpan. Coba lagi."); } finally { setBusy(false); }
  };
  return (
    <KxSheet title={initial ? "Edit update" : "Bagikan update"} onClose={onClose}>
      <label className="kx-label" htmlFor="kc-body" style={{ marginTop: 0 }}>Tulisanmu</label>
      <textarea id="kc-body" className="kx-input" style={{ minHeight: 120 }} autoFocus maxLength={5000} value={body} onChange={e => setBody(e.target.value)} placeholder="Ceritakan karya atau kabar terbaru. Pakai #hashtag bila perlu." />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="kx-link" onClick={() => setLinkOpen(o => !o)}>{linkOpen ? "Hapus link konten" : "+ Tambah link konten"}</button>
        <span className="kx-sub">{body.length}/5000</span>
      </div>
      {linkOpen && <input className="kx-input" aria-label="Link konten" inputMode="url" autoCapitalize="none" value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.tiktok.com/@kamu/video/…" />}
      {error && <p role="alert" className="kx-err">{error}</p>}
      <button type="button" className="kx-btn" style={{ marginTop: 14 }} disabled={busy || !body.trim()} onClick={save}>{busy ? "Menyimpan…" : initial ? "Simpan" : "Bagikan"}</button>
    </KxSheet>
  );
}

/* ---------- Creator ---------- */
export function Creators({ username }: { username: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Creator[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [total, setTotal] = useState(0);
  const query = (before?: string | null) => `/portal/discovery?limit=30${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ""}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      setLoading(true);
      kolApi<any>(query())
        .then(d => { if (!live) return; const items: Creator[] = Array.isArray(d?.items) ? d.items : []; setRows(items); setCursor(d?.hasMore ? d.nextCursor ?? null : null); setTotal(items.length); setError(""); })
        .catch(() => live && setError("Daftar creator belum bisa dimuat."))
        .finally(() => live && setLoading(false));
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);
  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const d = await kolApi<any>(query(cursor));
      const items: Creator[] = Array.isArray(d?.items) ? d.items : [];
      setRows(prev => [...prev, ...items.filter(i => !prev.some(p => p.username === i.username))]);
      setTotal(t => t + items.length);
      setCursor(d?.hasMore ? d.nextCursor ?? null : null);
    } catch { setError("Creator berikutnya belum bisa dimuat."); } finally { setMore(false); }
  };
  const list = rows.filter(r => r.username !== username);
  const share = async () => {
    const url = `${window.location.origin}/${username}/profile`;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch { window.prompt("Salin link profil publik", url); }
  };
  return (
    <div>
      <div className="kx-search"><Search size={17} /><input className="kx-input" type="search" aria-label="Cari creator" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari creator, niche, kota" /></div>
      <div className="kx-section">Temukan creator{!loading && !error ? ` · ${total}${cursor ? "+" : ""}` : ""}</div>
      {loading ? [1, 2, 3].map(i => <div key={i} className="kx-skel" style={{ height: 60 }} />)
        : error && !list.length ? <p role="alert" className="kx-note kx-note--err">{error}</p>
        : list.length ? (
          <>
            <div className="kx-group">
              {list.map(c => {
                const status = typeof c.availability === "string" ? c.availability : c.availability?.status;
                return (
                  <a key={c.username} className="kx-grow" href={`/${c.username}/profile`} style={{ textDecoration: "none", color: "inherit" }}>
                    <Avatar url={c.avatarUrl} name={c.displayName || c.username} />
                    <span className="kx-main"><b>{c.displayName || c.username}</b><small>@{c.username} · {[c.category, c.location].filter(Boolean).join(" · ") || "Creator"}</small>{status && AVAILABILITY[status] && <span className="kx-pill kx-pill--ok" style={{ marginTop: 4 }}>{AVAILABILITY[status]}</span>}</span>
                    <span className="kx-chev">›</span>
                  </a>
                );
              })}
            </div>
            {error && <p role="alert" className="kx-note kx-note--err" style={{ marginTop: 10 }}>{error}</p>}
            {cursor && <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" style={{ marginTop: 12 }} disabled={more} onClick={() => void loadMore()}>{more ? "Memuat…" : "Muat lebih banyak"}</button>}
          </>
        ) : <div className="kx-card kx-sub" style={{ textAlign: "center" }}>Belum ada creator yang cocok.</div>}
      <button type="button" className="kx-btn kx-btn--ghost" style={{ marginTop: 16 }} onClick={share}>{copied ? "✓ Link profil disalin" : "Bagikan link profilmu"}</button>
    </div>
  );
}
