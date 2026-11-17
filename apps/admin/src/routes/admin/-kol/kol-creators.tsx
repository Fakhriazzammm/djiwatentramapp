// Halaman Creator: data KOL yang sama dengan portal creator (apps/kol) — profil publik,
// kontak, platform, status pipeline, kelayakan visit, badge, dan undangan visit.
import { BadgeCheck, CalendarDays, CalendarPlus, ExternalLink, Mail, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { requestAdminConfirm } from "@/lib/admin-dialogs";
import {
  Avatar, Btn, Chips, CopyField, EmptyBlock, ErrorBox, Field, KV, Label, Loading, Page, PageHeader, Panel, SearchBox, SectionLabel, StatusTag, Switch, Tag, inputCls,
} from "./kol-ui";
import {
  AVAILABILITY, BADGES, CREATOR_STATUSES, atUsername, compact, creatorLabel, creatorStatus, fmtDate, fmtDay, fmtTime, kolCall,
  profileUrl, totalFollowers, useKolData, waUrl, type Creator, type Overview,
} from "./kol-core";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Perubahan belum tersimpan.");

export function KolCreatorsPage() {
  const { token, canManage, loading, error, overview, creators, reload, ready } = useKolData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [visit, setVisit] = useState<"all" | "eligible" | "blocked">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return creators.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (visit === "eligible" && !c.visit_booking_eligible) return false;
      if (visit === "blocked" && c.visit_booking_eligible) return false;
      if (!q) return true;
      const haystack = [c.name, c.username, creatorLabel(c), c.category, c.location, ...(c.kol_platforms ?? []).map((p) => p.username)].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [creators, query, status, visit]);

  const open = creators.find((c) => c.source_id === openId) ?? null;
  if (!canManage) return <Page><EmptyBlock title="Akses ditolak" hint="Halaman KOL Marketing hanya untuk peran admin, owner, atau superadmin." /></Page>;

  return (
    <Page>
      <PageHeader
        title="Creator"
        description="Data creator yang dipakai portal KOL: profil publik, kontak, platform, status pipeline, dan izin booking visit."
        count={ready ? <Tag color="#666672">{creators.length}</Tag> : null}
        actions={<Btn onClick={() => void reload()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Muat ulang</Btn>}
      />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari nama, username, kategori, atau lokasi" />
        <Chips value={visit} onChange={setVisit} options={[
          { key: "all", label: "Semua visit" },
          { key: "eligible", label: "Boleh booking", count: creators.filter((c) => c.visit_booking_eligible).length },
          { key: "blocked", label: "Belum diizinkan", count: creators.filter((c) => !c.visit_booking_eligible).length },
        ]} />
      </div>
      <Chips value={status} onChange={setStatus} options={[
        { key: "all", label: "Semua status", count: creators.length },
        ...CREATOR_STATUSES.map((s) => ({ key: s.key, label: s.label, count: creators.filter((c) => c.status === s.key).length })),
      ]} />

      {loading && !ready ? <Loading rows={6} /> : filtered.length === 0 ? (
        <EmptyBlock title="Tidak ada creator" hint="Ubah filter atau kata kunci pencarian. Creator baru masuk lewat pendaftaran publik di portal KOL." />
      ) : (
        <div className="border border-[#e4e4e8] bg-white">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,.9fr)_92px_128px_112px_28px] gap-3 border-b border-[#ececf0] px-4 py-2 md:grid">
            {["Creator", "Kategori / lokasi", "Jangkauan", "Status", "Booking visit", ""].map((h) => <Label key={h}>{h}</Label>)}
          </div>
          <ul className="divide-y divide-[#ececf0]">
            {filtered.map((c) => {
              const s = creatorStatus(c.status);
              return (
                <li key={c.source_id}>
                  <button type="button" onClick={() => setOpenId(c.source_id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-[#fafafb] md:grid-cols-[minmax(0,1.6fr)_minmax(0,.9fr)_92px_128px_112px_28px]">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar url={c.avatar_url} name={creatorLabel(c)} size={32} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-[#111114]">
                          {creatorLabel(c)}
                          {c.linked && <BadgeCheck aria-label="Sudah masuk dengan Google" className="h-3.5 w-3.5 shrink-0 text-[#16a34a]" />}
                        </span>
                        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">
                          {atUsername(c.username)}{c.profile?.is_public ? " · publik" : ""}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 md:block">
                      <span className="block truncate text-[11.5px] text-[#444450]">{c.category || "Tanpa kategori"}</span>
                      <span className="block truncate text-[11px] text-[#666672]">{c.location || "—"}</span>
                    </span>
                    <span className="hidden font-mono text-[11px] tabular-nums text-[#111114] md:block">{compact(totalFollowers(c))}</span>
                    <span className="hidden md:block"><StatusTag color={s.color}>{s.label}</StatusTag></span>
                    <span className="hidden md:block">
                      <Tag color={c.visit_booking_eligible ? "#16a34a" : "#9a9aa5"}>{c.visit_booking_eligible ? "Diizinkan" : "Belum"}</Tag>
                    </span>
                    <span className="flex items-center justify-end gap-2 md:justify-start">
                      <span className="md:hidden"><StatusTag color={s.color}>{s.label}</StatusTag></span>
                      <ExternalLink aria-hidden className="h-3.5 w-3.5 text-[#9a9aa5]" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {open && (
        <CreatorPanel
          creator={open}
          overview={overview}
          token={token}
          onClose={() => setOpenId(null)}
          onSaved={() => void reload()}
          onDeleted={() => { setOpenId(null); void reload(); }}
        />
      )}
    </Page>
  );
}

function CreatorPanel({ creator, overview, token, onClose, onSaved, onDeleted }: {
  creator: Creator;
  overview: Overview;
  token: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState(creator.status);
  const contact = creator.contact ?? {};
  const statusMeta = creatorStatus(creator.status);
  const awarded = new Set(overview.badges.filter((b) => b.kol_id === creator.source_id).map((b) => b.kol_badges?.code).filter(Boolean));
  const visits = overview.visits.filter((v) => v.kol_id === creator.source_id).slice(0, 5);
  const wa = waUrl(contact.whatsapp, `Halo ${creatorLabel(creator)}, kami dari Djiwa Tentram.`);

  const updateStatus = async (next: string) => {
    setBusy("status");
    try {
      await kolCall("kol-public", "admin_update", token, { id: creator.source_id, status: next });
      setStatus(next);
      toast.success("Status creator diperbarui.");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  const setEligible = async (next: boolean) => {
    setBusy("eligibility");
    try {
      await kolCall("kol-portal-admin", "creator_eligibility", token, { kolId: creator.source_id, eligible: next, note });
      toast.success(next ? "Creator boleh booking visit." : "Booking visit dicabut.");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  const award = async (code: string) => {
    setBusy(`badge-${code}`);
    try {
      await kolCall("kol-portal-admin", "badge_award", token, { kolId: creator.source_id, code });
      toast.success("Badge diberikan.");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  const createInvite = async () => {
    setBusy("invite");
    try {
      const res = await kolCall<{ inviteUrl: string; expiresAt: string }>("kol-portal-admin", "invite_create", token, { kolId: creator.source_id });
      setInvite({ url: res.inviteUrl, expiresAt: res.expiresAt });
      toast.success("Undangan visit dibuat.");
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  const remove = async () => {
    const ok = await requestAdminConfirm({
      title: "Hapus creator?",
      message: `${creatorLabel(creator)} akan dihapus dari database KOL beserta profil, kontak, badge, dan riwayat visitnya. Tindakan ini tidak bisa dibatalkan.`,
      confirmText: "Hapus creator",
      variant: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await kolCall("kol-public", "admin_delete", token, { id: creator.source_id });
      toast.success("Creator dihapus.");
      onDeleted();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(""); }
  };

  return (
    <Panel
      title={creatorLabel(creator)}
      description={`${atUsername(creator.username)} · ${creator.category || "tanpa kategori"}${creator.location ? ` · ${creator.location}` : ""}`}
      onClose={onClose}
      width="sm:max-w-2xl"
      footer={
        <>
          <a href={profileUrl(creator)} target="_blank" rel="noreferrer" className="mr-auto inline-flex min-h-8 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">
            <ExternalLink className="h-3.5 w-3.5" />Profil publik
          </a>
          <Btn variant="danger" size="sm" disabled={busy === "delete"} onClick={() => void remove()}><Trash2 className="h-3.5 w-3.5" />Hapus</Btn>
          <Btn size="sm" disabled={busy === "invite"} onClick={() => void createInvite()}><CalendarPlus className="h-3.5 w-3.5" />Undang visit</Btn>
        </>
      }
    >
      <div className="flex items-center gap-3 pb-4">
        <Avatar url={creator.avatar_url} name={creatorLabel(creator)} size={48} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#111114]">{creatorLabel(creator)}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(creator.username)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusTag color={statusMeta.color}>{statusMeta.label}</StatusTag>
            {creator.visit_booking_eligible ? <Tag color="#16a34a">Booking aktif</Tag> : <Tag color="#9a9aa5">Belum boleh booking</Tag>}
            {creator.profile?.is_public ? <Tag color="#2f6fdf">Profil publik</Tag> : null}
          </div>
        </div>
      </div>

      {invite && (
        <div className="mb-4 space-y-1.5">
          <Label tone="ink">Link undangan visit</Label>
          <CopyField value={invite.url} label="Salin link" />
          <p className="text-[11px] leading-4 text-[#666672]">Berlaku sampai {fmtDate(invite.expiresAt)}. Link hanya terlihat sekali — simpan atau kirim sekarang.</p>
        </div>
      )}

      <SectionLabel>Profil publik</SectionLabel>
      <div className="border border-[#e4e4e8] bg-white px-3">
        <KV label="Tampilan">{creator.profile?.display_name?.trim() || "—"}</KV>
        <KV label="Slug">{creator.profile?.slug?.trim() ? <a href={profileUrl(creator)} target="_blank" rel="noreferrer" className="text-[#2f6fdf] underline">/{creator.profile.slug.trim()}</a> : "Belum diatur"}</KV>
        <KV label="Bio">{creator.profile?.bio?.trim() || "Belum diisi"}</KV>
        <KV label="Ketersediaan">{AVAILABILITY[creator.profile?.public_availability ?? "not_set"] ?? "Belum diatur"}</KV>
        <KV label="Status">{creator.profile?.is_public ? "Tampil di profil publik" : "Belum tampil di profil publik"}</KV>
      </div>

      <SectionLabel>Kontak</SectionLabel>
      <div className="border border-[#e4e4e8] bg-white px-3">
        <KV label="WhatsApp">{contact.whatsapp ? <a className="text-[#2f6fdf] underline" href={wa ?? "#"} target="_blank" rel="noreferrer">{contact.whatsapp}</a> : "—"}</KV>
        <KV label="Email">{contact.email ? <a className="text-[#2f6fdf] underline" href={`mailto:${contact.email}`}>{contact.email}</a> : "—"}</KV>
        <KV label="Manager">{contact.manager_name?.trim() || "—"}</KV>
        <KV label="Kontak manager">{contact.manager_contact?.trim() || "—"}</KV>
        <KV label="Terdaftar">{fmtDate(creator.created_at)}</KV>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 border border-[#cfcfd6] bg-white px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#166534]"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}
        {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex min-h-8 items-center gap-1.5 border border-[#cfcfd6] bg-white px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f5d9e]"><Mail className="h-3.5 w-3.5" />Email</a>}
      </div>

      <SectionLabel right={<Label>{compact(totalFollowers(creator))} pengikut</Label>}>Platform</SectionLabel>
      {creator.kol_platforms?.length ? (
        <div className="border border-[#e4e4e8] bg-white px-3">
          {creator.kol_platforms.map((p) => (
            <KV key={`${p.platform}-${p.username}`} label={p.platform}>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{atUsername(p.username)}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{compact(p.followers)} pengikut</span>
                {p.profile_url && <a href={p.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#2f6fdf] underline">Buka<ExternalLink className="h-3 w-3" /></a>}
              </span>
            </KV>
          ))}
        </div>
      ) : <p className="text-[11.5px] text-[#666672]">Belum ada akun platform.</p>}

      <SectionLabel>Aplikasi pendaftaran</SectionLabel>
      <div className="border border-[#e4e4e8] bg-white px-3">
        <KV label="Rata-rata view">{compact(Number(creator.application_data?.averageViews ?? 0))}</KV>
        <KV label="Tipe konten">{creator.application_data?.contentTypes?.length ? creator.application_data.contentTypes.join(", ") : "—"}</KV>
        <KV label="Sumber">{creator.application_data?.source || (creator.linked ? "Portal KOL (Google)" : "Formulir publik")}</KV>
        <KV label="Alasan publik">{creator.public_reason?.trim() || "—"}</KV>
      </div>

      <SectionLabel>Pengaturan admin</SectionLabel>
      <Field label="Status pipeline" hint="Status ini tampil di portal creator dan menentukan kelayakan booking.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy === "status"}>
            {CREATOR_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <Btn variant="primary" disabled={busy === "status" || status === creator.status} onClick={() => void updateStatus(status)}>{busy === "status" ? "Menyimpan…" : "Simpan status"}</Btn>
        </div>
      </Field>
      <div className="mt-3">
        <Switch checked={creator.visit_booking_eligible} disabled={busy === "eligibility"} onChange={(next) => void setEligible(next)}
          label="Izinkan booking visit" hint="Creator bisa memilih jadwal visit di portal. Creator berstatus Ditolak tidak bisa diizinkan." />
        <Field label="Catatan kelayakan" className="mt-2" hint="Disimpan bersama perubahan izin booking.">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: sudah verifikasi WhatsApp" maxLength={1000} />
        </Field>
      </div>

      <SectionLabel>Badge</SectionLabel>
      <div className="space-y-1.5">
        {BADGES.map((b) => {
          const owned = awarded.has(b.code);
          return (
            <div key={b.code} className="flex items-center justify-between gap-3 border border-[#e4e4e8] bg-white px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <BadgeCheck className={`h-4 w-4 shrink-0 ${owned ? "text-[#16a34a]" : "text-[#cfcfd6]"}`} />
                <span className="truncate text-[12px] font-semibold text-[#111114]">{b.label}</span>
              </span>
              {owned ? <Tag color="#16a34a">Diberikan</Tag> : <Btn size="sm" disabled={busy === `badge-${b.code}`} onClick={() => void award(b.code)}>Beri badge</Btn>}
            </div>
          );
        })}
      </div>

      <SectionLabel right={<a href={profileUrl(creator)} target="_blank" rel="noreferrer" className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">Profil publik</a>}>Visit creator</SectionLabel>
      {visits.length ? (
        <div className="border border-[#e4e4e8] bg-white px-3">
          {visits.map((v) => (
            <KV key={v.id} label={fmtDay(v.booking_date)}>
              <span className="flex flex-wrap items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 text-[#666672]" />
                {v.booking_time ? `${fmtTime(v.booking_time)} WIB` : "Jam belum dipilih"}
                <StatusTag color={{ requested: "#b7791f", confirmed: "#16a34a", completed: "#2f6fdf", cancelled: "#666672", no_show: "#d92d20" }[v.status] ?? "#666672"}>{v.status}</StatusTag>
              </span>
            </KV>
          ))}
        </div>
      ) : <p className="text-[11.5px] text-[#666672]">Belum ada booking visit.</p>}
    </Panel>
  );
}
