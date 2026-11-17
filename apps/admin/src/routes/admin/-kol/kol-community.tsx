// Moderasi komunitas KOL: laporan postingan publik dari portal creator.
// Server hanya mengekspos laporan terbuka/tertinjau lewat aksi `overview`, jadi halaman ini fokus pada keputusan moderasi.
import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Avatar, Btn, Chips, EmptyBlock, ErrorBox, Label, Loading, NoAccess, Page, PageHeader, SearchBox, Tag, textareaCls,
} from "./kol-ui";
import { POST_TYPE, REPORT_REASON, atUsername, fmtDateTime, kolCall, useKolData, type Report } from "./kol-core";

type Group = { postId: number; post: NonNullable<Report["kol_public_posts"]> | null; reports: Report[] };

export function KolCommunityPage() {
  const { token, canManage, loading, error, overview, reload } = useKolData();
  const [reason, setReason] = useState("all");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const map = new Map<number, Group>();
    for (const report of overview.reports) {
      const current = map.get(report.post_id) ?? { postId: report.post_id, post: report.kol_public_posts ?? null, reports: [] };
      current.reports.push(report);
      map.set(report.post_id, current);
    }
    const q = query.trim().toLowerCase();
    return [...map.values()].filter((group) => {
      if (reason !== "all" && !group.reports.some((r) => r.reason === reason)) return false;
      if (!q) return true;
      const creator = group.post?.kol_creators;
      return [group.post?.title, group.post?.body, creator?.name, creator?.username, ...group.reports.map((r) => r.note)].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [overview.reports, reason, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of overview.reports) map.set(r.reason, (map.get(r.reason) ?? 0) + 1);
    return map;
  }, [overview.reports]);

  if (!canManage) return <NoAccess />;

  return (
    <Page>
      <PageHeader
        title="Komunitas"
        description="Laporan creator atas postingan komunitas. Sembunyikan postingan yang melanggar atau abaikan laporan yang tidak terbukti."
        count={overview.reports.length ? <Tag color="#d92d20">{overview.reports.length} laporan</Tag> : null}
        actions={<Btn onClick={() => void reload()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Muat ulang</Btn>}
      />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <div className="space-y-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari judul postingan, creator, atau isi laporan" />
        <Chips value={reason} onChange={setReason} options={[
          { key: "all", label: "Semua alasan", count: overview.reports.length },
          ...Object.entries(REPORT_REASON).map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 })),
        ]} />
      </div>

      {loading && groups.length === 0 ? <Loading rows={3} /> : groups.length === 0 ? (
        <EmptyBlock title="Tidak ada laporan terbuka" hint="Laporan baru muncul saat creator melaporkan postingan komunitas lain." />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => <ReportCard key={group.postId} group={group} token={token} reload={reload} />)}
        </div>
      )}
    </Page>
  );
}

function ReportCard({ group, token, reload }: { group: Group; token: string | null; reload: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const post = group.post;
  const creator = post?.kol_creators;
  const primary = group.reports[0];

  const resolve = async (decision: "hide" | "dismiss") => {
    setBusy(decision);
    try {
      await kolCall("kol-portal-admin", "report_resolve", token, { id: primary.id, decision, note });
      toast.success(decision === "hide" ? "Postingan disembunyikan dari komunitas" : "Laporan diabaikan");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Keputusan moderasi belum tersimpan.");
    } finally {
      setBusy("");
    }
  };

  return (
    <article className="border border-[#e4e4e8] bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ececf0] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar url={null} name={creator?.name ?? "KOL"} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-[#111114]">{creator?.name ?? post?.kol_id ?? "Creator"}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(creator?.username)} · {post ? POST_TYPE[post.post_type] ?? post.post_type : "Postingan"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {post && <Tag color={post.visibility === "published" ? "#16a34a" : "#666672"}>{post.visibility}</Tag>}
          {post && <Tag color={post.moderation_status === "approved" ? "#2f6fdf" : "#b7791f"}>moderasi {post.moderation_status}</Tag>}
          <Tag color="#d92d20">{group.reports.length} laporan</Tag>
        </div>
      </header>

      <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-[13px] font-semibold text-[#111114]">{post?.title ?? `Postingan #${group.postId}`}</p>
            {post?.body && <p className="mt-1 whitespace-pre-line text-[12px] leading-5 text-[#444450]">{post.body.length > 320 ? `${post.body.slice(0, 320)}…` : post.body}</p>}
          </div>
          {post?.media_url && (
            <a href={post.media_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2f6fdf] underline">
              <ExternalLink className="h-3.5 w-3.5" />Lihat media
            </a>
          )}
          <div className="border-t border-[#ececf0] pt-2">
            <Label>Laporan</Label>
            <ul className="mt-1.5 space-y-1.5">
              {group.reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px] leading-5">
                  <span className="font-semibold text-[#111114]">{REPORT_REASON[r.reason] ?? r.reason}</span>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#9a9aa5]">{fmtDateTime(r.created_at)}</span>
                  {r.note && <span className="w-full text-[#666672]">“{r.note}”</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="space-y-2 border-t border-[#ececf0] pt-3 md:border-t-0 md:border-l md:pl-3 md:pt-0">
          {creator?.username && (
            <a href={`https://kol.djiwatentram.web.id/${encodeURIComponent(String(creator.username).replace(/^@/, ""))}/profile`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">
              <ExternalLink className="h-3 w-3" />Profil creator
            </a>
          )}
          <textarea aria-label="Catatan moderasi" className={`${textareaCls} min-h-[64px]`} value={note} maxLength={1000} placeholder="Catatan moderasi (opsional)" onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <Btn size="sm" variant="danger" onClick={() => void resolve("hide")} disabled={Boolean(busy)}><Trash2 className="h-3.5 w-3.5" />{busy === "hide" ? "Menyembunyikan…" : "Sembunyikan postingan"}</Btn>
            <Btn size="sm" onClick={() => void resolve("dismiss")} disabled={Boolean(busy)}><ShieldCheck className="h-3.5 w-3.5" />{busy === "dismiss" ? "Menyimpan…" : "Abaikan laporan"}</Btn>
          </div>
          <p className="flex items-start gap-1.5 text-[10.5px] leading-4 text-[#666672]"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />Menyembunyikan postingan juga menutup semua laporan lain untuk postingan ini.</p>
        </aside>
      </div>
    </article>
  );
}
