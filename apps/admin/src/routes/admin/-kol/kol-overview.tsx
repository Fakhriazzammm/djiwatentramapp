// Ringkasan admin KOL: satu pandangan atas creator, kampanye, visit, inquiry, dan moderasi.
// Semua angka berasal dari aksi `overview` + `creator_list` (bukan metrik karangan).
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Building2, CalendarCheck, ClipboardCheck, Inbox, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Btn, Card, EmptyBlock, ErrorBox, Label, Loading, Page, PageHeader, Stat, Tag } from "./kol-ui";
import { CREATOR_STATUSES, compact, creatorLabel, creatorStatus, fmtDay, fmtDateTime, totalFollowers, useKolData } from "./kol-core";

type QueueItem = { key: string; title: string; detail: string; to: string; cta: string; tone: "blue" | "amber" | "green" | "red" };

export function KolOverviewPage() {
  const { canManage, loading, error, overview, creators, reload, ready } = useKolData();
  if (!canManage) return <Page><EmptyBlock title="Akses ditolak" hint="Halaman KOL Marketing hanya untuk peran admin, owner, atau superadmin." /></Page>;

  const followers = creators.reduce((sum, c) => sum + totalFollowers(c), 0);
  const openCampaigns = overview.campaigns.filter((c) => c.status === "published").length;
  const pendingVisits = overview.visits.filter((v) => v.status === "requested").length;
  const newInquiries = overview.inquiries.filter((i) => i.status === "new").length;
  const openReports = overview.reports.length;
  const submissionsToReview = overview.submissions.filter((s) => s.status === "submitted").length;
  const topCreators = [...creators].sort((a, b) => totalFollowers(b) - totalFollowers(a)).slice(0, 5);

  const queue: QueueItem[] = [
    ...overview.visits
      .filter((v) => v.status === "requested")
      .slice(0, 4)
      .map((v) => ({ key: `visit-${v.id}`, title: `Konfirmasi visit ${v.kol_creators?.name || v.kol_id}`, detail: `${fmtDay(v.booking_date)} · menunggu konfirmasi`, to: "/admin/kol-visits", cta: "Buka visit", tone: "amber" as const })),
    ...overview.submissions
      .filter((s) => s.status === "submitted")
      .slice(0, 4)
      .map((s) => ({ key: `sub-${s.id}`, title: `Review bukti ${s.kol_campaign_assignments?.kol_creators?.name || "creator"}`, detail: `${s.kol_campaign_assignments?.kol_campaigns?.title || "Kampanye"} · ${s.deliverable_type}`, to: "/admin/kol-campaigns", cta: "Review", tone: "blue" as const })),
    ...overview.inquiries
      .filter((i) => i.status === "new")
      .slice(0, 4)
      .map((i) => ({ key: `inq-${i.id}`, title: `Inquiry dari ${i.business_name}`, detail: `Untuk ${i.kol_creators?.name || "creator"} · ${fmtDateTime(i.created_at)}`, to: "/admin/kol-inquiries", cta: "Tindak lanjuti", tone: "green" as const })),
    ...overview.reports
      .slice(0, 4)
      .map((r) => ({ key: `rep-${r.id}`, title: `Laporan komunitas: ${r.kol_public_posts?.kol_creators?.name || "creator"}`, detail: `${r.reason} · ${fmtDateTime(r.created_at)}`, to: "/admin/kol-community", cta: "Moderasi", tone: "red" as const })),
  ].slice(0, 8);

  return (
    <Page>
      <PageHeader
        title="Ringkasan KOL"
        description="Semua data creator, kampanye, visit, inquiry, dan moderasi komunitas dari portal creator KOL."
        actions={<>
          <Link to="/admin/kol-brand" className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold hover:bg-zinc-100"><Building2 className="h-3.5 w-3.5" />Brand</Link>
          <Btn onClick={() => void reload()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Muat ulang</Btn>
        </>}
      />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading && !ready ? <Loading rows={6} /> : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <Stat label="Creator" value={creators.length} hint={`${creators.filter((c) => c.linked).length} sudah masuk dengan Google`} to="/admin/kol-creators" />
            <Stat label="Jangkauan" value={compact(followers)} hint="Total follower semua platform" tone="blue" />
            <Stat label="Kampanye dibuka" value={openCampaigns} hint={`${overview.campaigns.length} total kampanye`} to="/admin/kol-campaigns" tone="green" />
            <Stat label="Visit menunggu" value={pendingVisits} hint={`${overview.visits.length} booking tercatat`} to="/admin/kol-visits" tone="amber" />
            <Stat label="Inquiry baru" value={newInquiries} hint={`${overview.inquiries.length} inquiry masuk`} to="/admin/kol-inquiries" tone="blue" />
            <Stat label="Laporan terbuka" value={openReports} hint={`${submissionsToReview} bukti konten menunggu`} to="/admin/kol-community" tone={openReports ? "red" : "ink"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
            <Card label={<Label tone="ink">Perlu tindakan</Label>} action={<Label>{queue.length} item</Label>}>
              {queue.length === 0 ? (
                <EmptyBlock title="Tidak ada antrean" hint="Visit, bukti konten, inquiry, dan laporan semuanya sudah ditangani." />
              ) : (
                <div className="divide-y divide-[#ececf0]">
                  {queue.map((item) => (
                    <Link key={item.key} to={item.to as never} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-[#fafafb]">
                      <span className="flex min-w-0 items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0" style={{ background: { blue: "#2f6fdf", amber: "#b7791f", green: "#16a34a", red: "#d92d20" }[item.tone] }} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold text-[#111114]">{item.title}</span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{item.detail}</span>
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">{item.cta}<ArrowUpRight className="h-3 w-3" /></span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card label={<Label tone="ink">Pipeline creator</Label>} action={<Link to="/admin/kol-creators" className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">Lihat semua</Link>}>
              <div className="space-y-2">
                {CREATOR_STATUSES.map((s) => {
                  const count = creators.filter((c) => c.status === s.key).length;
                  const pct = creators.length ? (count / creators.length) * 100 : 0;
                  return (
                    <div key={s.key}>
                      <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="text-[#444450]">{s.label}</span><span className="font-mono tabular-nums text-[#111114]">{count}</span></div>
                      <div className="mt-1 h-1.5 bg-[#f0f0f3]"><div className="h-1.5" style={{ width: `${pct}%`, background: s.color }} /></div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card label={<Label tone="ink">Creator dengan jangkauan terbesar</Label>} action={<Label>{creators.length ? `dari ${creators.length} creator` : "—"}</Label>}>
              {topCreators.length === 0 ? <p className="py-4 text-center text-[11px] text-[#666672]">Belum ada creator terdaftar.</p> : (
                <div className="divide-y divide-[#ececf0]">
                  {topCreators.map((c) => {
                    const status = creatorStatus(c.status);
                    return (
                      <Link key={c.source_id} to="/admin/kol-creators" className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-[#fafafb]">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#ececf0] text-[11px] font-semibold text-white" style={{ background: c.avatar_url ? "#e9ecf1" : "#6d4fd8" }}>
                            {c.avatar_url ? <img src={c.avatar_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : creatorLabel(c).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold text-[#111114]">{creatorLabel(c)}</span><span className="block truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{c.category || "Tanpa kategori"}{c.location ? ` · ${c.location}` : ""}</span></span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2"><Tag color={status.color}>{status.label}</Tag><b className="font-mono text-[11px] tabular-nums text-[#111114]">{compact(totalFollowers(c))}</b></span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card label={<Label tone="ink">Visit terdekat</Label>} action={<Link to="/admin/kol-visits" className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">Kalender visit</Link>}>
              {overview.visits.length === 0 ? <p className="py-4 text-center text-[11px] text-[#666672]">Belum ada booking visit.</p> : (
                <div className="divide-y divide-[#ececf0]">
                  {overview.visits.slice(0, 5).map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center bg-[#f4f7fc] text-[#2f5d9e]"><CalendarCheck className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold text-[#111114]">{v.kol_creators?.name || v.kol_id}</span><span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{fmtDay(v.booking_date)}{v.booking_time ? ` · ${String(v.booking_time).slice(0, 5)}` : ""}</span></span>
                      </span>
                      <Tag color={{ requested: "#b7791f", confirmed: "#16a34a", completed: "#2f6fdf", cancelled: "#666672", no_show: "#d92d20" }[v.status] || "#666672"}>{v.status}</Tag>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#e4e4e8] pt-3 text-[10.5px] text-[#666672]">
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{creators.length} creator</span>
            <span className="inline-flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />{submissionsToReview} bukti konten menunggu review</span>
            <span className="inline-flex items-center gap-1.5"><Inbox className="h-3.5 w-3.5" />{newInquiries} inquiry baru</span>
            <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />{openReports} laporan terbuka</span>
          </div>
        </>
      )}
    </Page>
  );
}
