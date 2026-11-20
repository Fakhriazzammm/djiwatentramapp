import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

/** Kirim pengumuman ke KOL (dipakai Admin dan Manager): form, pratinjau langsung di portal KOL, dan riwayat dengan statistik baca. */
export type Announcement = {
  id: number; title: string; body: string; kind: "info" | "penting" | "kampanye"; audience: "all" | "campaign" | "selected";
  campaignId: number | null; campaignTitle: string | null; pinned: boolean; requireAck: boolean; createdBy: string; createdAt: string;
  audienceCount: number; readCount: number; ackCount: number;
};
export type AnnouncementInput = { title: string; body: string; kind: Announcement["kind"]; audience: Announcement["audience"]; campaignId: number | null; kolIds: string[]; pinned: boolean; requireAck: boolean };
export type AnnouncementApi = {
  load: () => Promise<{ announcements: Announcement[]; campaigns: Array<{ id: number; title: string }>; creators: Array<{ source_id: string; name: string; username: string }> }>;
  send: (input: AnnouncementInput) => Promise<Announcement>;
  archive: (id: number) => Promise<void>;
};

const KINDS: Array<[Announcement["kind"], string]> = [["info", "Info"], ["penting", "Penting"], ["kampanye", "Kampanye"]];
const AUDIENCES: Array<[Announcement["audience"], string, string]> = [
  ["all", "Semua KOL aktif", "Semua KOL yang sudah terdaftar dan aktif."],
  ["campaign", "Peserta kampanye", "Hanya KOL yang pengajuannya masuk di kampanye yang dipilih."],
  ["selected", "Pilih KOL", "Pilih KOL satu per satu."],
];
const spring = { type: "spring", stiffness: 420, damping: 32 } as const;
const ink = "#14161c", mute = "#6b7080", line = "#dfe4ee", blue = "#1a5dc6";
const card: CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 10px 30px rgba(15,35,71,.07)", padding: 20 };
const input: CSSProperties = { boxSizing: "border-box", width: "100%", minHeight: 46, borderRadius: 14, border: `1.5px solid ${line}`, background: "#fff", padding: "0 14px", font: "inherit", fontSize: 15, outline: "none" };
const label: CSSProperties = { fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 };
const Mega = ({ size = 24 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a05d00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1zM16 9a4 4 0 010 6M19 6.5a8 8 0 010 11" /></svg>);
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function Chip({ on, onClick, children, layout }: { on: boolean; onClick: () => void; children: ReactNode; layout: string }) {
  return (
    <motion.button type="button" aria-pressed={on} onClick={onClick} whileTap={{ scale: 0.95 }}
      style={{ position: "relative", minHeight: 40, padding: "0 16px", borderRadius: 99, border: `1.5px solid ${on ? ink : line}`, background: "#fff", color: on ? "#fff" : mute, font: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
      {on && <motion.i layoutId={layout} transition={spring} style={{ position: "absolute", inset: -1.5, borderRadius: 99, background: ink }} />}
      <span style={{ position: "relative" }}>{children}</span>
    </motion.button>
  );
}

function Switch({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div><b style={{ fontSize: 14.5 }}>{title}</b><div style={{ color: mute, fontSize: 12.5 }}>{hint}</div></div>
      <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={() => onChange(!on)} style={{ flex: "none", width: 46, height: 28, borderRadius: 99, border: 0, padding: 3, background: on ? "#13804a" : "#d3d9e6", cursor: "pointer", display: "flex", justifyContent: on ? "flex-end" : "flex-start", transition: "background .25s" }}>
        <motion.span layout transition={spring} style={{ width: 22, height: 22, borderRadius: 99, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

export function KolAnnouncementComposer({ api }: { api: AnnouncementApi }) {
  const [data, setData] = useState<Awaited<ReturnType<AnnouncementApi["load"]>> | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<Announcement["kind"]>("penting");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Announcement["audience"]>("all");
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [pinned, setPinned] = useState(true);
  const [ack, setAck] = useState(true);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sentNote, setSentNote] = useState("");

  const load = useCallback(async () => { try { setData(await api.load()); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Data pengumuman belum bisa dimuat."); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (data && campaignId === null && data.campaigns[0]) setCampaignId(data.campaigns[0].id); }, [data, campaignId]);

  const ready = title.trim().length >= 3 && body.trim().length >= 5 && (audience !== "selected" || picked.length > 0) && (audience !== "campaign" || campaignId !== null);
  const audienceLabel = audience === "all" ? "semua KOL aktif" : audience === "campaign" ? `peserta ${data?.campaigns.find((c) => c.id === campaignId)?.title ?? "kampanye"}` : `${picked.length} KOL pilihan`;
  const creators = useMemo(() => (data?.creators ?? []).filter((c) => !q.trim() || `${c.name} ${c.username}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60), [data, q]);
  const urgent = kind === "penting";

  const send = async () => {
    if (!ready || status !== "idle") return;
    setStatus("sending"); setError("");
    try {
      const created = await api.send({ title: title.trim(), body: body.trim(), kind, audience, campaignId: audience === "campaign" ? campaignId : null, kolIds: audience === "selected" ? picked : [], pinned, requireAck: ack });
      setData((d) => (d ? { ...d, announcements: [created, ...d.announcements] } : d));
      setSentNote(`Terkirim ke ${created.audienceCount} KOL (${audienceLabel}).`);
      setStatus("sent");
      window.setTimeout(() => { setStatus("idle"); setTitle(""); setBody(""); setPicked([]); }, 2600);
    } catch (e) { setError(e instanceof Error ? e.message : "Pengumuman belum terkirim."); setStatus("idle"); }
  };
  const archive = async (id: number) => { try { await api.archive(id); setData((d) => (d ? { ...d, announcements: d.announcements.filter((a) => a.id !== id) } : d)); } catch (e) { setError(e instanceof Error ? e.message : "Gagal mengarsipkan."); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, color: ink, fontFamily: '-apple-system,"SF Pro Text",Inter,system-ui,sans-serif' }}>
      {error && <div role="alert" style={{ background: "#fdecea", color: "#9b1c12", borderRadius: 16, padding: "10px 14px", fontSize: 13.5 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20, alignItems: "start" }}>
        <section style={{ ...card, display: "flex", flexDirection: "column", gap: 16 }} aria-label="Form pengumuman">
          <LayoutGroup id="kind"><div><span style={label}>Jenis</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{KINDS.map(([k, l]) => <Chip key={k} on={kind === k} onClick={() => setKind(k)} layout="kind-bg">{l}</Chip>)}</div></div></LayoutGroup>
          <div><label style={label} htmlFor="kann-title">Judul</label><input id="kann-title" style={input} maxLength={80} placeholder="Contoh: Jadwal visit 30 Nov dimajukan" value={title} onChange={(e) => setTitle(e.target.value)} /><div style={{ color: mute, fontSize: 12, textAlign: "right", marginTop: 4 }}>{title.length}/80</div></div>
          <div><label style={label} htmlFor="kann-body">Isi pengumuman</label><textarea id="kann-body" style={{ ...input, minHeight: 130, padding: "12px 14px", resize: "vertical" }} maxLength={1000} placeholder="Tulis informasi yang jelas dan singkat." value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <LayoutGroup id="aud">
            <div><span style={label}>Kirim ke</span><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{AUDIENCES.map(([k, l]) => <Chip key={k} on={audience === k} onClick={() => setAudience(k)} layout="aud-bg">{l}</Chip>)}</div>
              <div style={{ color: mute, fontSize: 12.5, marginTop: 6 }}>{AUDIENCES.find((a) => a[0] === audience)?.[2]}</div></div>
          </LayoutGroup>
          <AnimatePresence initial={false}>
            {audience === "campaign" && (
              <motion.div key="camp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
                <label style={label} htmlFor="kann-camp">Kampanye</label>
                <select id="kann-camp" style={input} value={campaignId ?? ""} onChange={(e) => setCampaignId(Number(e.target.value))}>{(data?.campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
              </motion.div>
            )}
            {audience === "selected" && (
              <motion.div key="sel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
                <label style={label} htmlFor="kann-q">Cari KOL ({picked.length} dipilih)</label>
                <input id="kann-q" style={input} type="search" placeholder="Nama atau username" value={q} onChange={(e) => setQ(e.target.value)} />
                <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {creators.map((c) => { const on = picked.includes(c.source_id); return (
                    <motion.button key={c.source_id} type="button" whileTap={{ scale: 0.98 }} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.source_id) : [...p, c.source_id]))} aria-pressed={on}
                      style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 12px", borderRadius: 12, border: `1.5px solid ${on ? blue : line}`, background: on ? "#e6efff" : "#fff", textAlign: "left", font: "inherit", cursor: "pointer" }}>
                      <span aria-hidden style={{ width: 20, height: 20, borderRadius: 99, background: on ? blue : "#fff", border: `2px solid ${on ? blue : "#cfd5e2"}`, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900 }}>{on ? "✓" : ""}</span>
                      <span style={{ flex: 1, fontSize: 14 }}><b>{c.name}</b> <span style={{ color: mute }}>{c.username}</span></span>
                    </motion.button>); })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Switch on={pinned} onChange={setPinned} title="Sematkan di banner Beranda" hint="Tampil di atas Beranda sampai KOL menutupnya" />
          <Switch on={ack} onChange={setAck} title={'Minta konfirmasi "Saya sudah baca"'} hint="Admin bisa melihat siapa yang sudah membaca" />
          <AnimatePresence>{status === "sent" && <motion.div key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ background: "#e5f5ec", color: "#0d4f2c", borderRadius: 16, padding: "12px 14px", fontSize: 13.5, fontWeight: 600 }}>{sentNote} Lihat statistik baca di riwayat.</motion.div>}</AnimatePresence>
          <motion.button type="button" onClick={() => void send()} whileTap={ready ? { scale: 0.98 } : undefined} animate={{ backgroundColor: status === "sent" ? "#13804a" : ready ? blue : "#e4e8f1", color: ready || status === "sent" ? "#fff" : "#8b93a7" }} disabled={status === "sending"}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 50, borderRadius: 99, border: 0, font: "inherit", fontWeight: 800, fontSize: 15.5, cursor: ready ? "pointer" : "not-allowed" }}>
            {status === "sending" && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }} style={{ width: 18, height: 18, borderRadius: 99, border: "3px solid #ffffff55", borderTopColor: "#fff" }} />}
            {status === "sending" ? "Mengirim…" : status === "sent" ? "Terkirim ✓" : `Kirim ke ${audienceLabel}`}
          </motion.button>
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 16 }} aria-label="Pratinjau di portal KOL">
          <div style={{ color: mute, fontSize: 12, fontWeight: 800, letterSpacing: ".06em" }}>PRATINJAU DI PORTAL KOL</div>
          <div style={{ ...card, background: "#eef1f8", boxShadow: "none", display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
            <div style={{ color: mute, fontSize: 11.5, fontWeight: 700 }}>Banner di Beranda</div>
            <AnimatePresence mode="wait" initial={false}>
              {pinned ? (
                <motion.div key="b" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring} style={{ display: "flex", alignItems: "center", gap: 11, background: "linear-gradient(120deg,#fff3dc,#fff)", borderRadius: 20, padding: "10px 12px", border: "1px solid #f5e3bd", boxShadow: "0 6px 18px rgba(160,93,0,.12)" }}>
                  <span aria-hidden style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 14, background: "#ffe9bf", flex: "none" }}><Mega /></span>
                  <span style={{ minWidth: 0 }}><small style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", color: "#a05d00" }}>DARI ADMIN · {kind.toUpperCase()}</small><b style={{ display: "block", fontSize: 13.5, lineHeight: 1.3 }}>{title.trim() || "Judul pengumuman"}</b></span>
                </motion.div>
              ) : <motion.div key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: mute, fontSize: 12.5, padding: "8px 2px" }}>Tidak disematkan: hanya muncul di daftar notifikasi.</motion.div>}
            </AnimatePresence>
            <div style={{ color: mute, fontSize: 11.5, fontWeight: 700, marginTop: 4 }}>Di daftar Notifikasi</div>
            <motion.div layout transition={spring} style={{ display: "flex", gap: 11, alignItems: "flex-start", background: urgent ? "linear-gradient(120deg,#fff8ea,#fff)" : "#fff", border: `1.5px solid ${urgent ? "#f5d9a3" : "transparent"}`, borderRadius: 20, padding: "12px 14px", boxShadow: "0 6px 20px rgba(15,35,71,.08)" }}>
              <span aria-hidden style={{ width: 44, height: 44, borderRadius: 14, background: "#f1f3f8", display: "grid", placeItems: "center", flex: "none" }}><Mega size={26} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><b style={{ fontSize: 14.5, lineHeight: 1.3 }}>{title.trim() || "Judul pengumuman"}</b>{urgent && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "#fff0cf", color: "#a05d00" }}>Penting</span>}</span>
                <span style={{ display: "block", color: mute, fontSize: 13, lineHeight: 1.4, marginTop: 2 }}>{body.trim() || "Isi pengumuman akan tampil di sini."}</span>
                <span style={{ display: "block", color: mute, fontSize: 11.5, marginTop: 5, fontWeight: 600 }}>Dari admin · sekarang{ack ? " · minta konfirmasi baca" : ""}</span>
              </span>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: "#2f7de6", marginTop: 5 }} />
            </motion.div>
          </div>
        </aside>
      </div>

      <section style={card} aria-label="Riwayat pengumuman">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><h2 style={{ margin: 0, fontSize: 20 }}>Riwayat pengumuman</h2><span style={{ color: mute, fontSize: 12.5 }}>{data ? `${data.announcements.length} pengumuman` : "Memuat…"}</span></div>
        <AnimatePresence initial={false}>
          {(data?.announcements ?? []).map((a) => {
            const pct = a.audienceCount ? Math.round((a.readCount / a.audienceCount) * 100) : 0;
            return (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(120px,1fr) auto", gap: 16, alignItems: "center", padding: "12px 0", borderTop: "1px solid #eef0f6" }}>
                <div style={{ minWidth: 0 }}><b style={{ fontSize: 14.5 }}>{a.title}</b><div style={{ color: mute, fontSize: 12.5, marginTop: 2 }}>{when(a.createdAt)} · {a.kind} · {a.audience === "all" ? "Semua KOL" : a.audience === "campaign" ? a.campaignTitle ?? "Kampanye" : "KOL pilihan"}</div></div>
                <div><div style={{ height: 8, borderRadius: 99, background: "#e9edf5", overflow: "hidden" }}><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }} style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#2f7de6,#13a06f)" }} /></div>
                  <div style={{ color: mute, fontSize: 12, marginTop: 4 }}>Dibaca {a.readCount} dari {a.audienceCount}{a.requireAck ? ` · konfirmasi ${a.ackCount}` : ""}</div></div>
                <button type="button" onClick={() => void archive(a.id)} style={{ minHeight: 36, padding: "0 12px", borderRadius: 99, border: `1.5px solid ${line}`, background: "#fff", color: mute, font: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Arsipkan</button>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {data && data.announcements.length === 0 && <p style={{ color: mute, fontSize: 13.5, textAlign: "center", padding: 20 }}>Belum ada pengumuman terkirim.</p>}
      </section>
    </div>
  );
}
