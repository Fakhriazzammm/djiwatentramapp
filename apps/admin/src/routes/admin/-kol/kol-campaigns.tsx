import { CampaignApplications, CampaignEditorExtras, campaignEditorFields, visitCampaignTemplate, type CampaignApplication } from "../../../../../../packages/djiwaapps-web-shared/src/components/kol-campaign-editor";
import type { CampaignDraft, CampaignSow } from "../../../../../../supabase/functions/_shared/kol-campaign";
// Halaman Kampanye: data yang sama dengan tab Kampanye portal creator, ditambah
// pengelolaan kampanye, undangan creator, dan review bukti konten.
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Link2, Plus, RefreshCw, Send, ShieldCheck, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Btn, Card, Chips, EmptyBlock, ErrorBox, Field, KV, Label, Loading, NoAccess, Page, PageHeader, SearchBox, SectionLabel, StatusTag, Tag, inputCls, textareaCls,
} from "./kol-ui";
import {
  ASSIGNMENT_STATUS, CAMPAIGN_STATUS, SUBMISSION_STATUS, atUsername, compact, creatorLabel, fmtDate, fmtDateTime, kolCall, totalFollowers, useKolData,
  type Assignment, type Campaign, type Creator, type Submission,
} from "./kol-core";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Perubahan belum tersimpan.");
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

export function KolCampaignsPage() {
  const { token, canManage, loading, error, overview, creators, reload, ready } = useKolData();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const activeSow = overview.sowVersions.find((version) => version.is_active);
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const assignmentsBy = useMemo(() => {
    const map = new Map<number, Assignment[]>();
    for (const a of overview.assignments) map.set(a.campaign_id, [...(map.get(a.campaign_id) ?? []), a]);
    return map;
  }, [overview.assignments]);

  const submissionsBy = useMemo(() => {
    const map = new Map<number, Submission[]>();
    for (const s of overview.submissions) {
      const campaignId = s.kol_campaign_assignments?.campaign_id;
      if (!campaignId) continue;
      map.set(campaignId, [...(map.get(campaignId) ?? []), s]);
    }
    return map;
  }, [overview.submissions]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.campaigns.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return [c.title, c.slug, c.description, c.location].join(" ").toLowerCase().includes(q);
    });
  }, [overview.campaigns, filter, query]);

  const editingCampaign = typeof editing === "number" ? overview.campaigns.find((c) => c.id === editing) ?? null : null;
  if (!canManage) return <NoAccess />;

  if (editing !== null) return (
<CampaignPanel
          key={editingCampaign?.id ?? "new"}
          campaign={editingCampaign}
          activeSow={activeSow ? { ...activeSow, days: overview.settings?.post_deadline_days ?? 7 } : undefined}
          token={token}
          creators={creators}
          assignments={editingCampaign ? assignmentsBy.get(editingCampaign.id) ?? [] : []}
          submissions={editingCampaign ? submissionsBy.get(editingCampaign.id) ?? [] : []}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
  );

  return (
    <Page>
      <PageHeader
        title="Kampanye"
        description="Kampanye kolaborasi yang dilihat creator di portal KOL: undangan, status penugasan, dan review bukti konten."
        actions={<>
          <Btn onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" />Kampanye baru</Btn>
          <Btn onClick={() => void reload()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Muat ulang</Btn>
        </>}
      />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari judul, slug, atau lokasi kampanye" />
      </div>
      <Chips value={filter} onChange={setFilter} options={[
        { key: "all", label: "Semua", count: overview.campaigns.length },
        ...Object.entries(CAMPAIGN_STATUS).map(([key, meta]) => ({ key, label: meta.label, count: overview.campaigns.filter((c) => c.status === key).length })),
      ]} />

      {loading && !ready ? <Loading rows={4} /> : rows.length === 0 ? (
        <EmptyBlock title="Belum ada kampanye" hint="Buat kampanye pertama agar creator bisa melihatnya di portal KOL." action={<Btn variant="primary" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" />Kampanye baru</Btn>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((c) => {
            const assignments = (assignmentsBy.get(c.id) ?? []).filter((a) => a.status !== "cancelled");
            const submissions = submissionsBy.get(c.id) ?? [];
            const pending = submissions.filter((s) => s.status === "submitted").length;
            const meta = CAMPAIGN_STATUS[c.status] ?? { label: c.status, color: "#666672" };
            return (
              <article key={c.id} className="flex flex-col border border-[#e4e4e8] bg-white">
                <div className="flex items-start justify-between gap-3 border-b border-[#ececf0] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[13.5px] font-semibold text-[#111114]">{c.title}</h2>
                      <StatusTag color={meta.color}>{meta.label}</StatusTag>
                      {pending > 0 && <Tag color="#b7791f">{pending} bukti baru</Tag>}
                    </div>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{c.slug}{c.location ? ` · ${c.location}` : ""}</p>
                  </div>
                  <Btn size="sm" onClick={() => setEditing(c.id)}>Kelola</Btn>
                </div>
                <div className="flex-1 px-4 py-3">
                  <p className="line-clamp-2 text-[11.5px] leading-5 text-[#444450]">{c.benefit_description || c.description || "Belum ada deskripsi."}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#f1f1f4] pt-3">
                    <div><Label>Creator</Label><p className="mt-0.5 font-mono text-[13px] tabular-nums text-[#111114]">{assignments.length}</p></div>
                    <div><Label>Bukti</Label><p className="mt-0.5 font-mono text-[13px] tabular-nums text-[#111114]">{submissions.length}</p></div>
                    <div><Label>Tenggat</Label><p className="mt-0.5 text-[11.5px] text-[#111114]">{c.end_date ? fmtDate(c.end_date) : "—"}</p></div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

    </Page>
  );
}

function CampaignPanel({ campaign, activeSow, token, creators, assignments, submissions, onClose, onSaved }: {
  campaign: Campaign | null;
  activeSow?: CampaignSow;
  token: string | null;
  creators: Creator[];
  assignments: Assignment[];
  submissions: Submission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({
    ...campaignEditorFields(campaign),
    title: campaign?.title ?? "",
    slug: campaign?.slug ?? "",
    description: campaign?.description ?? "",
    benefitDescription: campaign?.benefit_description ?? "",
    deliverableSummary: campaign?.deliverable_summary ?? "",
    location: campaign?.location ?? "",
    applicationDeadline: campaign?.application_deadline?.slice(0, 10) ?? "",
    startDate: campaign?.start_date?.slice(0, 10) ?? "",
    endDate: campaign?.end_date?.slice(0, 10) ?? "",
    status: campaign?.status ?? "draft",
  });
  const [assignId, setAssignId] = useState("");
  const [assignNote, setAssignNote] = useState("");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const assignedIds = new Set(assignments.filter((a) => a.status !== "cancelled").map((a) => a.kol_id));
  const available = useMemo(
    () => [...creators].filter((c) => !assignedIds.has(c.source_id)).sort((a, b) => totalFollowers(b) - totalFollowers(a)),
    [creators, assignedIds],
  );

  const save = async () => {
    setBusy("save");
    try {
      await kolCall("kol-portal-admin", "campaign_save", token, {
        ...(campaign ? { id: campaign.id } : {}),
        ...form,
        slug: form.slug.trim() || slugify(form.title),
      });
      toast.success(campaign ? "Kampanye diperbarui." : "Kampanye dibuat.");
      onSaved();
      if (!campaign) onClose();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  const assign = async () => {
    if (!campaign || !assignId) return;
    setBusy("assign");
    try {
      await kolCall("kol-portal-admin", "campaign_assign", token, { campaignId: campaign.id, kolId: assignId, note: assignNote });
      toast.success("Creator diundang ke kampanye.");
      setAssignId("");
      setAssignNote("");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onClose} className="mb-1 inline-flex min-h-8 items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#666672] hover:text-[#111114]"><ArrowLeft className="h-3.5 w-3.5" />Semua kampanye</button>
          <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[#111114]">{campaign ? campaign.title : "Kampanye baru"}</h1>
          <p className="mt-1 text-xs text-[#666672]">{campaign ? `Slug ${campaign.slug}` : "Kampanye dibuat sebagai draf sampai status diubah menjadi Dibuka."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={onClose}>Tutup</Btn>
          <Btn variant="primary" disabled={busy === "save"} onClick={() => void save()}>{busy === "save" ? "Menyimpan…" : campaign ? "Simpan perubahan" : "Buat kampanye"}</Btn>
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="space-y-4">
      <Card className="space-y-3">
      <Label tone="ink">INFORMASI KAMPANYE</Label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Judul" className="sm:col-span-2 lg:col-span-3">
          <input className={inputCls} value={form.title} maxLength={160} onChange={(e) => set("title", e.target.value)} placeholder="Visit & review menu Djiwa Tentram" />
        </Field>
        <Field label="Slug" hint="Dipakai untuk tautan kampanye.">
          <input className={inputCls} value={form.slug} maxLength={120} onChange={(e) => set("slug", e.target.value)} placeholder={slugify(form.title) || "visit-review-menu"} />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(CAMPAIGN_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
        </Field>
        <Field label="Lokasi">
          <input className={inputCls} value={form.location} maxLength={160} onChange={(e) => set("location", e.target.value)} placeholder="Djiwa Tentram" />
        </Field>
        <Field label="Tenggat pendaftaran">
          <input className={inputCls} type="date" value={form.applicationDeadline} onChange={(e) => set("applicationDeadline", e.target.value)} />
        </Field>
        <Field label="Mulai">
          <input className={inputCls} type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Selesai">
          <input className={inputCls} type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
        <Field label="Benefit" className="sm:col-span-2 lg:col-span-3" hint="Tampil paling atas di kartu kampanye creator.">
          <textarea className={textareaCls} value={form.benefitDescription} maxLength={1000} onChange={(e) => set("benefitDescription", e.target.value)} placeholder="Makan gratis untuk 2 orang + konten kolaborasi" />
        </Field>
        <Field label="Ringkasan deliverable" className="sm:col-span-2 lg:col-span-3">
          <textarea className={textareaCls} value={form.deliverableSummary} maxLength={2000} onChange={(e) => set("deliverableSummary", e.target.value)} placeholder="1 video TikTok, 1 story Instagram, 3 foto" />
        </Field>
        <Field label="Deskripsi" className="sm:col-span-2 lg:col-span-3">
          <textarea className={textareaCls} value={form.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} placeholder="Detail kampanye, syarat konten, dan hal yang perlu diketahui creator." />
        </Field>
      </div>
      </Card>

      <Card>
      <CampaignEditorExtras fields={form} title={form.title} slug={form.slug || slugify(form.title)}
        inputClass={inputCls} buttonClass="inline-flex min-h-9 items-center rounded-md border px-3 text-sm"
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onTemplate={!campaign && activeSow ? () => setForm((prev) => ({ ...prev, ...visitCampaignTemplate(activeSow) })) : undefined}
        generate={(brief) => kolCall<CampaignDraft>("kol-portal-admin", "campaign_draft_ai", token, { title: form.title, brief })}
        onDraft={(draft) => setForm((prev) => ({ ...prev, ...draft }))} />
      </Card>
      </div>
      <div className="space-y-4">
      {campaign && (
        <Link to={"/admin/kol-rewards" as never} className="block">
          <Card className="flex items-center justify-between gap-3 transition hover:bg-[#fafafb]"><span className="flex items-center gap-3"><Wallet className="h-5 w-5 text-[#2f6fdf]" /><span><b className="block text-[13px] text-[#111114]">Reward & anggaran</b><span className="text-[11.5px] text-[#666672]">Tarif per view, deposit Bisnis, ledger</span></span></span><span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">Atur →</span></Card>
        </Link>
      )}
      {campaign && (
        <Card><CampaignApplications campaignId={campaign.id} inputClass={inputCls}
          buttonClass="inline-flex min-h-9 items-center rounded-md border px-3 text-sm"
          load={() => kolCall<CampaignApplication[]>("kol-portal-admin", "campaign_applications", token, { campaignId: campaign.id })}
          review={async (decision) => {
            await kolCall("kol-portal-admin", "campaign_application_review", token, decision);
            toast.success(decision.approve ? "Pengajuan diterima." : "Pengajuan ditolak.");
            onSaved();
          }} /></Card>
      )}

      {campaign && (
        <Card>
          <SectionLabel right={<Label>{assignments.length} creator</Label>}>Creator kampanye</SectionLabel>
          {assignments.length ? (
            <div className="border border-[#e4e4e8] bg-white px-3">
              {assignments.map((a) => {
                const meta = ASSIGNMENT_STATUS[a.status] ?? { label: a.status, color: "#666672" };
                return (
                  <KV key={a.id} label={a.kol_creators?.name || a.kol_id}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(a.kol_creators?.username)}</span>
                      <StatusTag color={meta.color}>{meta.label}</StatusTag>
                      {a.admin_note && <span className="text-[11px] text-[#666672]">{a.admin_note}</span>}
                    </span>
                  </KV>
                );
              })}
            </div>
          ) : <p className="text-[11.5px] text-[#666672]">Belum ada creator yang bergabung.</p>}

          {(campaign.application_mode ?? "invite") === "invite" && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Undang creator">
              <select className={inputCls} value={assignId} onChange={(e) => setAssignId(e.target.value)}>
                <option value="">Pilih creator…</option>
                {available.map((c) => <option key={c.source_id} value={c.source_id}>{creatorLabel(c)} · {compact(totalFollowers(c))}</option>)}
              </select>
            </Field>
            <Field label="Catatan undangan">
              <input className={inputCls} value={assignNote} maxLength={1000} onChange={(e) => setAssignNote(e.target.value)} placeholder="Opsional" />
            </Field>
            <Btn variant="primary" disabled={!assignId || busy === "assign"} onClick={() => void assign()}><Send className="h-3.5 w-3.5" />Undang</Btn>
          </div>}

          <SectionLabel right={<Label>{submissions.length} bukti</Label>}>Bukti konten</SectionLabel>
          {submissions.length ? (
            <div className="space-y-2">
              {submissions.map((s) => <SubmissionRow key={s.id} submission={s} token={token} onSaved={onSaved} />)}
            </div>
          ) : <p className="text-[11.5px] text-[#666672]">Belum ada bukti konten dikirim creator.</p>}
        </Card>
      )}
      </div>
      </div>
    </Page>
  );
}

function SubmissionRow({ submission, token, onSaved }: { submission: Submission; token: string | null; onSaved: () => void }) {
  const [note, setNote] = useState(submission.review_note ?? "");
  const [busy, setBusy] = useState("");
  const meta = SUBMISSION_STATUS[submission.status] ?? { label: submission.status, color: "#666672" };

  const review = async (status: string) => {
    setBusy(status);
    try {
      await kolCall("kol-portal-admin", "submission_review", token, { id: submission.id, status, note });
      toast.success(status === "approved" ? "Bukti disetujui." : "Review tersimpan.");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  return (
    <div className="border border-[#e4e4e8] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-[#111114]">{submission.kol_campaign_assignments?.kol_creators?.name || submission.kol_campaign_assignments?.kol_id}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{submission.deliverable_type} · {fmtDateTime(submission.created_at)}</p>
        </div>
        <StatusTag color={meta.color}>{meta.label}</StatusTag>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px]">
        <a className="inline-flex items-center gap-1 text-[#2f6fdf] underline" href={submission.content_url} target="_blank" rel="noreferrer"><Link2 className="h-3.5 w-3.5" />Konten</a>
        {submission.insight_screenshot_url && <a className="inline-flex items-center gap-1 text-[#2f6fdf] underline" href={submission.insight_screenshot_url} target="_blank" rel="noreferrer"><ShieldCheck className="h-3.5 w-3.5" />Insight</a>}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input className={`${inputCls} sm:flex-1`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Catatan review untuk creator" />
        <div className="flex flex-wrap gap-1.5">
          <Btn size="sm" variant="success" disabled={Boolean(busy)} onClick={() => void review("approved")}>Setujui</Btn>
          <Btn size="sm" disabled={Boolean(busy)} onClick={() => void review("needs_revision")}>Revisi</Btn>
          <Btn size="sm" variant="danger" disabled={Boolean(busy)} onClick={() => void review("rejected")}><X className="h-3.5 w-3.5" />Tolak</Btn>
        </div>
      </div>
    </div>
  );
}
