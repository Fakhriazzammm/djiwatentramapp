// Visit KOL: jadwal booking dari portal creator, transisi status, dan undangan portal.
// Transisi status mengikuti aturan server: requested → confirmed/cancelled, confirmed → cancelled/completed/no_show.
import { CalendarDays, Clock3, Mail, MessageCircle, RefreshCw, Send, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { requestAdminConfirm } from "@/lib/admin-dialogs";
import {
  Avatar, Btn, Card, Chips, CopyField, EmptyBlock, ErrorBox, Field, KV, Label, Loading, NoAccess, Page, PageHeader, Panel, SearchBox, SectionLabel, StatusTag, Tag, inputCls, textareaCls,
} from "./kol-ui";
import {
  VISIT_ACTION_LABEL, VISIT_STATUS, VISIT_TRANSITIONS, atUsername, creatorLabel, fmtDate, fmtDateTime, fmtDay, fmtTime, kolCall, one, useKolData, waUrl,
  type Contact, type Visit,
} from "./kol-core";

type Invite = {
  id: string; kol_id: string; status: string; expires_at: string; created_at?: string; updated_at?: string; linked_auth_user_id?: string | null;
  kol_creators?: { name?: string; username?: string } | null;
};
type InviteResult = { invitationId: string; inviteUrl: string; expiresAt?: string; status?: string };

const INVITE_STATUS: Record<string, { label: string; color: string }> = {
  created: { label: "Dibuat", color: "#b7791f" },
  opened: { label: "Dibuka", color: "#0e7490" },
  authenticated: { label: "Masuk Google", color: "#2f6fdf" },
  linked: { label: "Terhubung", color: "#6d4fd8" },
  schedule_selected: { label: "Jadwal dipilih", color: "#16a34a" },
  revoked: { label: "Dicabut", color: "#666672" },
  expired: { label: "Kedaluwarsa", color: "#9a9aa5" },
};

export function KolVisitsPage() {
  const { token, canManage, loading, error, overview, creators, reload, ready } = useKolData();
  const [tab, setTab] = useState<"schedule" | "invites">("schedule");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [inviteKol, setInviteKol] = useState("");
  const [inviteDays, setInviteDays] = useState("7");
  const [busy, setBusy] = useState("");

  const loadInvites = useCallback(async () => {
    if (!token) return;
    setLoadingInvites(true);
    setInviteError("");
    try {
      const rows = await kolCall<Invite[]>("kol-portal-admin", "invite_list", token);
      setInvites(rows);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Daftar undangan belum dapat dimuat.");
    } finally {
      setLoadingInvites(false);
    }
  }, [token]);

  useEffect(() => { if (tab === "invites" && canManage && invites === null) void loadInvites(); }, [tab, canManage, invites, loadInvites]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = overview.visits.filter((v) => {
      if (filter !== "all" && v.status !== filter) return false;
      if (!q) return true;
      return [v.kol_creators?.name, v.kol_creators?.username, v.kol_id, v.booking_date].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
    const map = new Map<string, Visit[]>();
    for (const visit of rows) map.set(visit.booking_date, [...(map.get(visit.booking_date) ?? []), visit]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [overview.visits, filter, query]);

  const active = openId !== null ? overview.visits.find((v) => v.id === openId) ?? null : null;
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of overview.visits) map.set(v.status, (map.get(v.status) ?? 0) + 1);
    return map;
  }, [overview.visits]);

  const inviteCandidates = useMemo(
    () => creators.filter((c) => !c.linked && c.status !== "Rejected"),
    [creators],
  );

  const sendInvite = async () => {
    if (!inviteKol) return;
    setBusy("create");
    try {
      const expiresAt = new Date(Date.now() + Math.max(1, Number(inviteDays) || 7) * 86400000).toISOString();
      const result = await kolCall<InviteResult>("kol-portal-admin", "invite_create", token, { kolId: inviteKol, expiresAt });
      setCreated((prev) => ({ ...prev, [result.invitationId]: result.inviteUrl }));
      toast.success("Undangan dibuat. Salin link sekarang.");
      setInviteKol("");
      await loadInvites();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undangan belum dibuat.");
    } finally {
      setBusy("");
    }
  };

  const resend = async (invitationId: string) => {
    setBusy(`resend-${invitationId}`);
    try {
      const result = await kolCall<InviteResult>("kol-portal-admin", "invite_resend", token, { invitationId });
      setCreated((prev) => ({ ...prev, [result.invitationId]: result.inviteUrl }));
      toast.success("Undangan baru dibuat, undangan lama dicabut.");
      await loadInvites();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undangan belum dibuat ulang.");
    } finally {
      setBusy("");
    }
  };

  const revoke = async (invitationId: string) => {
    const ok = await requestAdminConfirm({ title: "Cabut undangan?", message: "Link undangan tidak bisa dipakai lagi setelah dicabut.", confirmText: "Cabut undangan", variant: "danger" });
    if (!ok) return;
    setBusy(`revoke-${invitationId}`);
    try {
      await kolCall("kol-portal-admin", "invite_revoke", token, { invitationId });
      toast.success("Undangan dicabut.");
      await loadInvites();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undangan belum dicabut.");
    } finally {
      setBusy("");
    }
  };

  if (!canManage) return <NoAccess />;

  return (
    <Page>
      <PageHeader
        title="Visit"
        description="Jadwal kunjungan creator ke Djiwa Tentram dan undangan portal untuk creator yang belum masuk dengan Google."
        count={<Tag color="#666672">{overview.visits.length} booking</Tag>}
        actions={<Btn onClick={() => { void reload(); if (tab === "invites") void loadInvites(); }} disabled={loading || loadingInvites}><RefreshCw className={`h-3.5 w-3.5 ${loading || loadingInvites ? "animate-spin" : ""}`} />Muat ulang</Btn>}
      />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <Chips value={tab} onChange={setTab} options={[
        { key: "schedule", label: "Jadwal visit", count: overview.visits.length },
        { key: "invites", label: "Undangan portal", count: invites?.length },
      ]} />

      {tab === "schedule" ? (
        <>
          <div className="space-y-2">
            <SearchBox value={query} onChange={setQuery} placeholder="Cari creator atau tanggal" />
            <Chips value={filter} onChange={setFilter} options={[
              { key: "all", label: "Semua", count: overview.visits.length },
              ...Object.entries(VISIT_STATUS).map(([key, meta]) => ({ key, label: meta.label, count: counts.get(key) ?? 0 })),
            ]} />
          </div>

          {loading && !ready ? <Loading rows={4} /> : groups.length === 0 ? (
            <EmptyBlock title="Tidak ada booking" hint="Creator memesan jadwal dari tab Visit di portal KOL. Booking baru muncul di sini." />
          ) : (
            <div className="space-y-3">
              {groups.map(([date, rows]) => (
                <section key={date} className="border border-[#e4e4e8] bg-white">
                  <header className="flex items-center justify-between gap-3 border-b border-[#ececf0] px-4 py-2.5">
                    <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#111114]"><CalendarDays className="h-4 w-4 text-[#666672]" />{fmtDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                    <Label>{rows.length} creator</Label>
                  </header>
                  <ul className="divide-y divide-[#ececf0]">
                    {rows.map((v) => {
                      const meta = VISIT_STATUS[v.status] ?? { label: v.status, color: "#666672" };
                      const contact = one(v.kol_creators?.kol_private_contacts as Contact | Contact[] | null | undefined);
                      const wa = waUrl(contact?.whatsapp, `Halo ${v.kol_creators?.name ?? "creator"}, soal jadwal visit di Djiwa Tentram.`);
                      return (
                        <li key={v.id}>
                          <button type="button" onClick={() => setOpenId(v.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#fafafb]">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className="grid h-8 w-12 shrink-0 place-items-center border border-[#e4e4e8] bg-[#fafafb] font-mono text-[10.5px] font-semibold text-[#111114]">{v.booking_time ? fmtTime(v.booking_time) : "—"}</span>
                              <Avatar url={v.kol_creators?.avatar_url} name={v.kol_creators?.name ?? "KOL"} size={30} />
                              <span className="min-w-0">
                                <span className="block truncate text-[12.5px] font-semibold text-[#111114]">{v.kol_creators?.name ?? v.kol_id}</span>
                                <span className="block truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(v.kol_creators?.username)}{v.visit_note ? " · ada catatan" : ""}</span>
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp creator" className="text-[#16a34a]" onClick={(e) => e.stopPropagation()}><MessageCircle className="h-4 w-4" /></a>}
                              <StatusTag color={meta.color}>{meta.label}</StatusTag>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {inviteError && <ErrorBox message={inviteError} onRetry={() => void loadInvites()} />}
          <Card label={<Label tone="ink">Buat undangan</Label>} action={<Label>{inviteCandidates.length} creator belum terhubung</Label>}>
            <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <Field label="Creator">
                <select className={inputCls} value={inviteKol} onChange={(e) => setInviteKol(e.target.value)}>
                  <option value="">Pilih creator…</option>
                  {inviteCandidates.map((c) => <option key={c.source_id} value={c.source_id}>{creatorLabel(c)} ({atUsername(c.username)})</option>)}
                </select>
              </Field>
              <Field label="Berlaku (hari)">
                <select className={inputCls} value={inviteDays} onChange={(e) => setInviteDays(e.target.value)}>
                  {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} hari</option>)}
                </select>
              </Field>
              <Btn variant="primary" disabled={!inviteKol || busy === "create"} onClick={() => void sendInvite()}><UserPlus className="h-3.5 w-3.5" />{busy === "create" ? "Membuat…" : "Buat undangan"}</Btn>
            </div>
            <p className="mt-2 text-[10.5px] leading-4 text-[#666672]">Link hanya ditampilkan sekali. Creator membuka link, masuk dengan Google, lalu memilih jadwal visit.</p>
          </Card>

          {loadingInvites && invites === null ? <Loading rows={3} /> : invites && invites.length > 0 ? (
            <div className="border border-[#e4e4e8] bg-white">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_130px_160px] gap-3 border-b border-[#ececf0] px-4 py-2 sm:grid">
                {["Creator", "Status", "Berlaku sampai", "Aksi"].map((h) => <Label key={h}>{h}</Label>)}
              </div>
              <ul className="divide-y divide-[#ececf0]">
                {invites.map((invite) => {
                  const meta = INVITE_STATUS[invite.status] ?? { label: invite.status, color: "#666672" };
                  const url = created[invite.id];
                  return (
                    <li key={invite.id} className="px-4 py-3">
                      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.4fr)_120px_130px_160px] sm:gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-[#111114]">{invite.kol_creators?.name ?? invite.kol_id}</p>
                          <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(invite.kol_creators?.username)} · dibuat {fmtDate(invite.created_at)}</p>
                        </div>
                        <span><StatusTag color={meta.color}>{meta.label}</StatusTag></span>
                        <span className="text-[11.5px] text-[#444450]">{fmtDate(invite.expires_at)}</span>
                        <span className="flex flex-wrap gap-1.5">
                          <Btn size="sm" disabled={Boolean(busy) || invite.status === "revoked"} onClick={() => void resend(invite.id)}><Send className="h-3 w-3" />Ulang</Btn>
                          <Btn size="sm" variant="danger" disabled={Boolean(busy) || invite.status === "revoked"} onClick={() => void revoke(invite.id)}><Trash2 className="h-3 w-3" />Cabut</Btn>
                        </span>
                      </div>
                      {url && <div className="mt-2"><CopyField value={url} label="Salin link" /></div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : invites ? (
            <EmptyBlock title="Belum ada undangan" hint="Buat undangan untuk creator yang belum menghubungkan akun Google-nya." />
          ) : null}
        </>
      )}

      {active && <VisitPanel visit={active} token={token} onClose={() => setOpenId(null)} onSaved={() => void reload()} />}
    </Page>
  );
}

function VisitPanel({ visit, token, onClose, onSaved }: { visit: Visit; token: string | null; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(visit.admin_note ?? "");
  const [busy, setBusy] = useState("");
  const meta = VISIT_STATUS[visit.status] ?? { label: visit.status, color: "#666672" };
  const contact = one(visit.kol_creators?.kol_private_contacts as Contact | Contact[] | null | undefined);
  const wa = waUrl(contact?.whatsapp, `Halo ${visit.kol_creators?.name ?? "creator"}, soal jadwal visit di Djiwa Tentram.`);
  const next = VISIT_TRANSITIONS[visit.status] ?? [];

  const move = async (status: string) => {
    setBusy(status);
    try {
      await kolCall("kol-portal-admin", "visit_update", token, { id: visit.id, status, note });
      toast.success(`Booking ditandai ${VISIT_STATUS[status]?.label.toLowerCase() ?? status}.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status booking belum berubah.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel
      title={visit.kol_creators?.name ?? visit.kol_id}
      description={`${atUsername(visit.kol_creators?.username)} · ${fmtDay(visit.booking_date, { weekday: "long", day: "numeric", month: "long" })}`}
      onClose={onClose}
      footer={<Btn size="sm" onClick={onClose}>Tutup</Btn>}
    >
      <div className="flex items-center gap-3 pb-3">
        <Avatar url={visit.kol_creators?.avatar_url} name={visit.kol_creators?.name ?? "KOL"} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[#111114]">{visit.kol_creators?.name ?? visit.kol_id}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(visit.kol_creators?.username)}</p>
        </div>
        <StatusTag color={meta.color}>{meta.label}</StatusTag>
      </div>

      <div className="border border-[#e4e4e8] bg-white px-3">
        <KV label="Tanggal">{fmtDay(visit.booking_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</KV>
        <KV label="Jam">{visit.booking_time ? `${fmtTime(visit.booking_time)} WIB` : "Belum dipilih"}</KV>
        <KV label="Dipesan">{fmtDateTime(visit.created_at)}</KV>
        <KV label="Persetujuan">{visit.consented_at ? `Disetujui ${fmtDateTime(visit.consented_at)}${visit.consent_version ? ` · versi ${visit.consent_version}` : ""}` : "Belum tercatat"}</KV>
        <KV label="Catatan creator">{visit.visit_note?.trim() || "—"}</KV>
        <KV label="Kontak">
          <span className="flex flex-wrap items-center gap-2">
            {contact?.whatsapp ? <a href={wa ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#16a34a] underline"><MessageCircle className="h-3.5 w-3.5" />{contact.whatsapp}</a> : <span className="text-[#9a9aa5]">WhatsApp belum ada</span>}
            {contact?.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-[#2f6fdf] underline"><Mail className="h-3.5 w-3.5" />{contact.email}</a>}
          </span>
        </KV>
      </div>

      <SectionLabel>Catatan admin</SectionLabel>
      <textarea className={textareaCls} value={note} maxLength={1000} placeholder="Catatan internal, alasan perubahan status, atau info untuk tim." onChange={(e) => setNote(e.target.value)} />

      <SectionLabel right={<Label>{next.length ? "Pilih tindakan" : "Tidak ada transisi"}</Label>}>Ubah status</SectionLabel>
      {next.length === 0 ? (
        <p className="text-[11.5px] text-[#666672]">Booking berstatus {meta.label.toLowerCase()} tidak bisa diubah lagi.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {next.map((status) => {
            const target = VISIT_STATUS[status] ?? { label: status, color: "#666672" };
            const variant = status === "confirmed" || status === "completed" ? "primary" : status === "no_show" ? "danger" : status === "cancelled" ? "outline" : "outline";
            return (
              <Btn key={status} size="sm" variant={variant} disabled={Boolean(busy)} onClick={() => void move(status)}>
                <Clock3 className="h-3.5 w-3.5" />{busy === status ? "Menyimpan…" : `${VISIT_ACTION_LABEL[status] ?? status} → ${target.label}`}
              </Btn>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
