// Visit KOL: jadwal booking dari portal creator, transisi status, dan undangan portal.
// Transisi status mengikuti aturan server: requested → confirmed/cancelled, confirmed → cancelled/completed/no_show.
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, List as ListIcon, Mail, MessageCircle, RefreshCw, Send, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { requestAdminConfirm } from "@/lib/admin-dialogs";
import {
  Avatar, Btn, Card, Chips, CopyField, EmptyBlock, ErrorBox, Field, KV, Label, Loading, NoAccess, Page, PageHeader, Panel, SearchBox, SectionLabel, StatusTag, Tag, inputCls, textareaCls,
} from "./kol-ui";
import {
  VISIT_ACTION_LABEL, VISIT_STATUS, VISIT_TRANSITIONS, atUsername, creatorLabel, fmtDate, fmtDateTime, fmtDay, fmtTime, kolCall, one, useKolData, waUrl,
  EMAIL_STATUS, type Contact, type EmailRow, type Visit,
} from "./kol-core";
import { BookingEmails, BookingSow, SowSheet } from "./kol-sow";

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
  const [sowOpen, setSowOpen] = useState(false);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const today = ymd(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [showPast, setShowPast] = useState(false);

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

  const byDate = useMemo(() => new Map(groups), [groups]);
  const upcomingGroups = useMemo(() => groups.filter(([d]) => d >= today), [groups, today]);
  const pastGroups = useMemo(() => groups.filter(([d]) => d < today), [groups, today]);

  // Email konfirmasi terbaru per booking, untuk lencana di daftar.
  const confirmEmail = useMemo(() => {
    const map = new Map<number, EmailRow>();
    for (const e of overview.emails) if (e.kind === "visit_confirmed" && e.booking_id !== null && !map.has(e.booking_id)) map.set(e.booking_id, e);
    return map;
  }, [overview.emails]);
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
        actions={<><Btn onClick={() => setSowOpen(true)}><FileText className="h-3.5 w-3.5" />SOW &amp; Email</Btn><Btn onClick={() => { void reload(); if (tab === "invites") void loadInvites(); }} disabled={loading || loadingInvites}><RefreshCw className={`h-3.5 w-3.5 ${loading || loadingInvites ? "animate-spin" : ""}`} />Muat ulang</Btn></>}
      />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <Chips value={tab} onChange={setTab} options={[
        { key: "schedule", label: "Jadwal visit", count: overview.visits.length },
        { key: "invites", label: "Undangan portal", count: invites?.length },
      ]} />

      {tab === "schedule" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Tampilan" className="inline-flex border border-[#e4e4e8] bg-white">
              {([["calendar", "Kalender", CalendarDays], ["list", "Daftar", ListIcon]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] transition ${view === key ? "bg-[#111114] text-white" : "text-[#666672] hover:bg-[#fafafb]"}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
            <div className="min-w-[200px] flex-1"><SearchBox value={query} onChange={setQuery} placeholder="Cari creator atau tanggal" /></div>
          </div>
          <Chips value={filter} onChange={setFilter} options={[
            { key: "all", label: "Semua", count: overview.visits.length },
            ...Object.entries(VISIT_STATUS).map(([key, meta]) => ({ key, label: meta.label, count: counts.get(key) ?? 0 })),
          ]} />

          {loading && !ready ? <Loading rows={4} /> : view === "calendar" ? (
            <VisitCalendar
              byDate={byDate}
              month={month}
              onMonth={setMonth}
              selected={selectedDate}
              onSelect={setSelectedDate}
              confirmEmail={confirmEmail}
              onOpen={setOpenId}
            />
          ) : groups.length === 0 ? (
            <EmptyBlock title="Tidak ada booking" hint="Creator memesan jadwal dari tab Visit di portal KOL. Booking baru muncul di sini." />
          ) : (
            <div className="border border-[#e4e4e8] bg-white">
              {upcomingGroups.map(([date, rows]) => <DayGroup key={date} date={date} rows={rows} confirmEmail={confirmEmail} onOpen={setOpenId} today={today} />)}
              {pastGroups.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowPast((v) => !v)} className="flex w-full items-center justify-between border-t border-[#ececf0] bg-[#fafafb] px-4 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#666672] hover:text-[#111114]">
                    <span>Sudah lewat · {pastGroups.reduce((n, [, r]) => n + r.length, 0)} booking</span>
                    <span>{showPast ? "Sembunyikan" : "Tampilkan"}</span>
                  </button>
                  {showPast && [...pastGroups].reverse().map(([date, rows]) => <DayGroup key={date} date={date} rows={rows} confirmEmail={confirmEmail} onOpen={setOpenId} today={today} />)}
                </>
              )}
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

      {active && <VisitPanel visit={active} emails={overview.emails} token={token} onClose={() => setOpenId(null)} onSaved={() => void reload()} />}
      {sowOpen && <SowSheet token={token} overview={overview} onClose={() => setSowOpen(false)} onSaved={() => void reload()} />}
    </Page>
  );
}

function VisitPanel({ visit, emails, token, onClose, onSaved }: { visit: Visit; emails: EmailRow[]; token: string | null; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(visit.admin_note ?? "");
  const [busy, setBusy] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const meta = VISIT_STATUS[visit.status] ?? { label: visit.status, color: "#666672" };
  const contact = one(visit.kol_creators?.kol_private_contacts as Contact | Contact[] | null | undefined);
  const wa = waUrl(contact?.whatsapp, `Halo ${visit.kol_creators?.name ?? "creator"}, soal jadwal visit di Djiwa Tentram.`);
  const next = VISIT_TRANSITIONS[visit.status] ?? [];

  const move = async (status: string) => {
    setBusy(status);
    try {
      await kolCall("kol-portal-admin", "visit_update", token, { id: visit.id, status, note, skipEmail: status === "confirmed" && !sendEmail });
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

      {next.includes("confirmed") && (
        <label className={`mt-3 flex items-start gap-2 border p-3 text-[12px] leading-5 ${contact?.email ? "border-[#e4e4e8] bg-[#fafafb]" : "border-[#f5c2bd] bg-[#fff5f4]"}`}>
          <input type="checkbox" className="mt-1" checked={sendEmail && Boolean(contact?.email)} disabled={!contact?.email} onChange={(e) => setSendEmail(e.target.checked)} />
          <span>{contact?.email ? <>Kirim email konfirmasi + SOW ke <strong>{contact.email}</strong></> : <>Creator belum punya email, jadi email tidak dikirim. Hubungi lewat WhatsApp.</>}</span>
        </label>
      )}
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

      <SectionLabel>Scope of Work</SectionLabel>
      <BookingSow visit={visit} token={token} onSaved={onSaved} />

      <SectionLabel>Email ke creator</SectionLabel>
      <BookingEmails visit={visit} emails={emails} token={token} onSaved={onSaved} />
    </Panel>
  );
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ConfirmMap = Map<number, EmailRow>;

function VisitRow({ v, confirmEmail, onOpen }: { v: Visit; confirmEmail: ConfirmMap; onOpen: (id: number) => void }) {
  const meta = VISIT_STATUS[v.status] ?? { label: v.status, color: "#666672" };
  const contact = one(v.kol_creators?.kol_private_contacts as Contact | Contact[] | null | undefined);
  const wa = waUrl(contact?.whatsapp, `Halo ${v.kol_creators?.name ?? "creator"}, soal jadwal visit di Djiwa Tentram.`);
  const e = v.status === "confirmed" ? confirmEmail.get(v.id) : undefined;
  const em = e ? EMAIL_STATUS[e.status] ?? { label: "Email", color: "#666672" } : null;
  return (
    <li>
      <button type="button" onClick={() => onOpen(v.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#fafafb]">
        <span className="w-11 shrink-0 font-mono text-[11px] font-semibold text-[#111114]">{v.booking_time ? fmtTime(v.booking_time) : "—"}</span>
        <Avatar url={v.kol_creators?.avatar_url} name={v.kol_creators?.name ?? "KOL"} size={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-[#111114]">{v.kol_creators?.name ?? v.kol_id}</span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(v.kol_creators?.username)}{v.visit_note ? " · ada catatan" : ""}</span>
        </span>
        {v.status === "confirmed" && (
          <span title={e ? `Email konfirmasi: ${em?.label}` : "Belum ada email konfirmasi"} className="shrink-0"><Mail className="h-3.5 w-3.5" style={{ color: em?.color ?? "#c0c0c8" }} /></span>
        )}
        {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp creator" className="shrink-0 text-[#16a34a]" onClick={(ev) => ev.stopPropagation()}><MessageCircle className="h-3.5 w-3.5" /></a>}
        <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: meta.color }}>
          <i className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} /><span className="hidden sm:inline">{meta.label}</span>
        </span>
      </button>
    </li>
  );
}

function DayGroup({ date, rows, confirmEmail, onOpen, today }: { date: string; rows: Visit[]; confirmEmail: ConfirmMap; onOpen: (id: number) => void; today: string }) {
  return (
    <section className="border-t border-[#ececf0] first:border-t-0">
      <header className="flex items-center justify-between gap-3 bg-[#fafafb] px-4 py-1.5">
        <p className="text-[11.5px] font-semibold text-[#111114]">
          {fmtDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {date === today && <span className="ml-2 bg-[#111114] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white">Hari ini</span>}
        </p>
        <Label>{rows.length}</Label>
      </header>
      <ul className="divide-y divide-[#f1f1f4]">{rows.map((v) => <VisitRow key={v.id} v={v} confirmEmail={confirmEmail} onOpen={onOpen} />)}</ul>
    </section>
  );
}

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function VisitCalendar({ byDate, month, onMonth, selected, onSelect, confirmEmail, onOpen }: {
  byDate: Map<string, Visit[]>; month: string; onMonth: (m: string) => void; selected: string; onSelect: (d: string) => void; confirmEmail: ConfirmMap; onOpen: (id: number) => void;
}) {
  const today = ymd(new Date());
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const total = Math.ceil((offset + days) / 7) * 7;
  const shift = (n: number) => onMonth(ymd(new Date(y, m - 1 + n, 1)).slice(0, 7));
  const label = new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const monthCount = [...byDate.entries()].filter(([d]) => d.startsWith(month)).reduce((n, [, r]) => n + r.length, 0);
  const dayRows = byDate.get(selected) ?? [];

  return (
    <div className="space-y-3">
      <div className="border border-[#e4e4e8] bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ececf0] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Bulan sebelumnya" onClick={() => shift(-1)} className="grid h-7 w-7 place-items-center border border-[#e4e4e8] hover:bg-[#fafafb]"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Bulan berikutnya" onClick={() => shift(1)} className="grid h-7 w-7 place-items-center border border-[#e4e4e8] hover:bg-[#fafafb]"><ChevronRight className="h-4 w-4" /></button>
            <h3 className="ml-1 text-[13.5px] font-semibold capitalize text-[#111114]">{label}</h3>
            <Label>{monthCount} booking</Label>
          </div>
          <Btn size="sm" onClick={() => { onMonth(today.slice(0, 7)); onSelect(today); }}>Hari ini</Btn>
        </header>
        <div className="grid grid-cols-7 border-b border-[#ececf0] bg-[#fafafb]">
          {WEEKDAYS.map((d) => <div key={d} className="px-2 py-1.5 text-center font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#666672]">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: total }, (_, i) => {
            const day = i - offset + 1;
            if (day < 1 || day > days) return <div key={i} className="min-h-[52px] border-b border-r border-[#f1f1f4] bg-[#fcfcfd] sm:min-h-[88px]" />;
            const date = `${month}-${String(day).padStart(2, "0")}`;
            const rows = byDate.get(date) ?? [];
            const isSel = date === selected;
            return (
              <button key={i} type="button" onClick={() => onSelect(date)} aria-pressed={isSel} className={`min-h-[52px] border-b border-r border-[#f1f1f4] p-1 text-left align-top transition hover:bg-[#fafafb] sm:min-h-[88px] sm:p-1.5 ${isSel ? "bg-[#f3f6fd] ring-1 ring-inset ring-[#2f6fdf]" : ""}`}>
                <span className={`inline-grid h-5 min-w-5 place-items-center px-1 font-mono text-[10.5px] font-semibold ${date === today ? "bg-[#111114] text-white" : "text-[#444450]"}`}>{day}</span>
                <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                  {rows.slice(0, 3).map((v) => {
                    const c = (VISIT_STATUS[v.status] ?? { color: "#666672" }).color;
                    return (
                      <span key={v.id} className="flex items-center gap-1 truncate text-[10px] leading-4 text-[#111114]" style={{ opacity: v.status === "cancelled" ? 0.5 : 1 }}>
                        <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
                        <span className="font-mono text-[9.5px] text-[#666672]">{v.booking_time ? fmtTime(v.booking_time) : ""}</span>
                        <span className="truncate">{(v.kol_creators?.name ?? v.kol_id).split(" ")[0]}</span>
                      </span>
                    );
                  })}
                  {rows.length > 3 && <span className="font-mono text-[9.5px] text-[#666672]">+{rows.length - 3} lagi</span>}
                </span>
                <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {rows.slice(0, 4).map((v) => <i key={v.id} className="h-1.5 w-1.5 rounded-full" style={{ background: (VISIT_STATUS[v.status] ?? { color: "#666672" }).color }} />)}
                </span>
              </button>
            );
          })}
        </div>
        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#ececf0] px-4 py-2">
          {Object.entries(VISIT_STATUS).map(([k, meta]) => (
            <span key={k} className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#666672]"><i className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />{meta.label}</span>
          ))}
        </footer>
      </div>

      <section className="border border-[#e4e4e8] bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-[#ececf0] px-4 py-2.5">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#111114]"><CalendarDays className="h-4 w-4 text-[#666672]" />{fmtDay(selected, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <Label>{dayRows.length} creator</Label>
        </header>
        {dayRows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[#666672]">Tidak ada visit di tanggal ini.</p>
        ) : (
          <ul className="divide-y divide-[#f1f1f4]">{dayRows.map((v) => <VisitRow key={v.id} v={v} confirmEmail={confirmEmail} onOpen={onOpen} />)}</ul>
        )}
      </section>
    </div>
  );
}
