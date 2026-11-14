import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, fileUrl, uploadFile, type Attachment, type Comment, type FeedItem, type PurchaseOrder, type Role, type Task } from "../lib/api";
import { Empty, Ic, Kpis, Panel, hm, rp, wib } from "../ui";

type Snapshot = {
  sales: { today: { orders: number; revenue: number }; yesterday: { orders: number; revenue: number } };
  attendance: { total: number; present: number; staff: { userId: string; name: string; role?: string; status: string }[] };
  stockCritical: { name: string; unit: string; quantity: number; threshold: number }[];
  pendingOverFifteen: number;
};
type Dash = { snapshot: Snapshot; tasks: { open: number; doneToday: number } };
const SRC: Record<string, string> = { ai: "✦ AI", owner: "dari Owner", manager: "dari Manager", supervisor: "dari Supervisor", self: "dari saya" };
const PR: Record<string, [string, string]> = { high: ["Tinggi", "hi"], normal: ["Sedang", "md"], low: ["Rendah", ""] };
const FOR: Record<Role, string> = { manager: "@Manager", supervisor: "@Supervisor" };
const DUE: Record<string, number> = { "Hari ini": 0, Besok: 1, "Minggu ini": 5 };
type Filter = "Semua" | "AI" | "Owner" | "Manager" | "Saya";
const ATT_ICON: Record<string, string> = { file: "clip", link: "link", foto: "img", video: "vid" };

export function DashView({ role, onNavigate }: { role: Role; onNavigate: (p: string) => void }) {
  const [data, setData] = useState<Dash | null>(null);
  const [open, setOpen] = useState<Task[]>([]);
  const [done, setDone] = useState<Task[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [filter, setFilter] = useState<Filter>("Semua");
  const [showDone, setShowDone] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, o, dn, f, p] = await Promise.allSettled([
      api<Dash>("/api/manager/dashboard"), api<{ tasks: Task[] }>("/api/manager/tasks?status=open"), api<{ tasks: Task[] }>("/api/manager/tasks?status=done"),
      api<{ feed: FeedItem[] }>("/api/manager/feed"), api<{ orders: PurchaseOrder[] }>("/api/manager/purchase-orders"),
    ]);
    if (d.status === "fulfilled") setData(d.value);
    if (o.status === "fulfilled") setOpen(o.value.tasks);
    if (dn.status === "fulfilled") setDone(dn.value.tasks);
    if (f.status === "fulfilled") setFeed(f.value.feed);
    if (p.status === "fulfilled") setPos(p.value.orders ?? []);
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (t: Task) => {
    try { await api(`/api/manager/tasks/${t.id}`, { method: "PATCH", body: { status: t.status === "done" ? "open" : "done" } }); void load(); }
    catch { toast.error("Status belum tersimpan"); }
  };

  const s = data?.snapshot;
  const all = [...open, ...done];
  const late = (t: Task) => t.status === "open" && !!t.due_at && new Date(t.due_at).getTime() < Date.now();
  const activePO = pos.filter((p) => p.status === "draft" || p.status === "sent").length;
  const delta = s && s.sales.yesterday.revenue > 0 ? Math.round(((s.sales.today.revenue - s.sales.yesterday.revenue) / s.sales.yesterday.revenue) * 100) : null;

  const kpis = role === "manager" && s
    ? [
        { v: rp(s.sales.today.revenue), l: "Pendapatan hari ini", s: delta === null ? undefined : `${delta < 0 ? "▼" : "▲"} ${delta > 0 ? "+" : ""}${delta}% vs kemarin` },
        { v: s.sales.today.orders, l: "Order settled" },
        { v: s.pendingOverFifteen, l: "Pesanan > 15 mnt" },
        { v: `${s.attendance.present}/${s.attendance.total}`, l: "Karyawan hadir" },
        { v: `${done.length}/${all.length}`, l: "Tugas selesai" },
      ]
    : [
        { v: s?.stockCritical.length ?? 0, l: "Stok menipis" },
        { v: activePO, l: "PO berjalan" },
        { v: open.length, l: "Tugas aktif" },
        { v: `${done.length}/${all.length}`, l: "Tugas selesai" },
      ];

  const list = (showDone ? done : open).filter((t) => filter === "Semua" || (filter === "AI" && t.source === "ai") || (filter === "Owner" && t.source === "owner") || (filter === "Manager" && t.source === "manager") || (filter === "Saya" && t.source === role))
    .sort((a, b) => (Number(b.source === "owner") - Number(a.source === "owner")) || ((a.priority === "high" ? 0 : a.priority === "normal" ? 1 : 2) - (b.priority === "high" ? 0 : b.priority === "normal" ? 1 : 2)) || (a.due_at ?? "z").localeCompare(b.due_at ?? "z"));
  const filters: Filter[] = role === "manager" ? ["Semua", "AI", "Owner", "Saya"] : ["Semua", "AI", "Owner", "Manager", "Saya"];

  return (
    <>
      <Kpis items={kpis} />
      <div className="work">
        <div className="col">
          <Panel fill title="Tugas hari ini" meta={`${open.length} aktif · ${done.length} selesai`}>
            <Composer role={role} onCreated={load} />
            <div className="tabs">
              {filters.map((x) => <button key={x} className={x === filter ? "on" : ""} onClick={() => setFilter(x)}>{x === "AI" ? "✦ AI" : x === "Saya" ? "Buatan saya" : x === "Owner" ? "Dari Owner" : x === "Manager" ? "Dari Manager" : x}</button>)}
              <button className={showDone ? "on" : ""} style={{ marginLeft: "auto" }} onClick={() => setShowDone((v) => !v)}>Selesai {done.length}</button>
            </div>
            <div className="sc">
              {list.length === 0 && <Empty>{showDone ? "BELUM ADA TUGAS SELESAI" : "TIDAK ADA TUGAS AKTIF"}</Empty>}
              {list.map((t) => <TaskRow key={t.id} t={t} role={role} isOpen={expanded === t.id} late={late(t)} onOpen={() => setExpanded(expanded === t.id ? null : t.id)} onToggle={() => toggle(t)} />)}
            </div>
          </Panel>
        </div>
        <div className="col">
          <Panel fill green title="Aktivitas langsung · semua aplikasi" style={{ flex: 1.2 }}>
            <div className="ph" style={{ padding: "6px 14px" }}><span className="meta">diperbarui baru saja · {feed.length} kejadian</span></div>
            <div className="sc feed">
              {feed.length === 0 && <Empty>BELUM ADA AKTIVITAS</Empty>}
              {feed.map((f, i) => (
                <div key={i} className="fr">
                  <span className="s">{f.app}</span>
                  <span>{f.name}{f.status ? ` · ${f.status}` : ""}{f.amount ? ` · ${rp(f.amount)}` : ""}</span>
                  <span className="a">{hm(f.at)}</span>
                </div>
              ))}
            </div>
          </Panel>
          {role === "manager" ? (
            <Panel title="Pantau cepat" meta="SDM · ANTREAN · STOK">
              {s?.attendance.staff.slice(0, 8).map((a) => (
                <div key={a.userId} className="mr">
                  <span><span className={`dotc ${a.status === "working" || a.status === "done" ? "ok" : a.status === "leave" ? "wn" : "bad"}`} />{a.name} {a.role && <span className="meta">{a.role}</span>}</span>
                  <span className="meta">{a.status === "working" ? "Hadir" : a.status === "done" ? "Selesai" : a.status === "leave" ? "Izin" : "Belum hadir"}</span>
                </div>
              ))}
              <div className="mr"><span className="meta">PESANAN &gt; 15 MENIT</span><b>{s?.pendingOverFifteen ?? 0}</b></div>
              {s?.stockCritical.slice(0, 2).map((x) => <div key={x.name} className="mr"><span><span className="dotc bad" />{x.name}</span><span className="meta">{x.quantity} {x.unit} · min {x.threshold}</span></div>)}
            </Panel>
          ) : (
            <Panel title="Stok & PO" meta="pos.inventory">
              {s?.stockCritical.length === 0 && <Empty>SEMUA STOK AMAN</Empty>}
              {s?.stockCritical.map((x) => <div key={x.name} className="mr"><span><span className="dotc bad" />{x.name} <span className="meta">{x.quantity} {x.unit} · min {x.threshold}</span></span><button className="btn s p" onClick={() => onNavigate("belanja")}>Buat PO</button></div>)}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function TaskRow({ t, isOpen, late: isLate, onOpen, onToggle }: { t: Task; role: Role; isOpen: boolean; late: boolean; onOpen: () => void; onToggle: () => void }) {
  const pr = PR[t.priority] ?? PR.normal;
  return (
    <div className={`tr ${isOpen ? "open" : ""}`} onClick={onOpen}>
      <button className={`cb ${t.status === "done" ? "on" : ""}`} title="Tandai selesai" onClick={(e) => { e.stopPropagation(); onToggle(); }}>{t.status === "done" ? "✓" : ""}</button>
      <div style={{ minWidth: 0 }}>
        <div className={`tt ${t.status === "done" ? "dn2" : ""}`}>{t.title}</div>
        <div className="ts">
          <span className={`tg ${t.source === "ai" ? "ai" : t.source === "owner" ? "o" : ""}`}>{SRC[t.source] ?? t.source}</span>
          {t.kind === "purchasing" && <span className="tg md">Belanja</span>}
          <span>→ {FOR[t.assignee_role]}</span>
          {t.source_ref && <span className="src" title={t.source_ref}>{t.source_ref}</span>}
          {t.comment_count > 0 && <span>💬 {t.comment_count}</span>}
          {t.attachments?.length > 0 && <span><Ic n="clip" /> {t.attachments.length}</span>}
        </div>
      </div>
      <div className="tm">
        {t.source === "ai" && t.status === "done" ? <span className="tg ok">OTOMATIS</span> : isLate ? <span className="tg hi">TERLAMBAT</span> : <span className={`tg ${pr[1]}`}>{pr[0]}</span>}
        <span>{t.due_at ? wib(t.due_at) : "Tanpa tenggat"}</span>
      </div>
      {isOpen && <Detail t={t} onToggle={onToggle} />}
    </div>
  );
}


function Detail({ t, onToggle }: { t: Task; onToggle: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  useEffect(() => { api<{ comments: Comment[] }>(`/api/manager/tasks/${t.id}/comments`).then((r) => setComments(r.comments)).catch(() => undefined); }, [t.id]);
  const send = async () => {
    if (!text.trim()) return;
    try {
      const r = await api<{ comment: Comment }>(`/api/manager/tasks/${t.id}/comments`, { method: "POST", body: { body: text } });
      setComments((c) => [...c, r.comment]); setText("");
    } catch { toast.error("Pembaruan belum terkirim"); }
  };
  return (
    <div className="det" onClick={(e) => e.stopPropagation()}>
      {t.detail && <p>{t.detail}</p>}
      <AttachView list={t.attachments ?? []} />
      <div className="thr">
        {comments.length ? comments.map((m) => <div className="m" key={m.id}><b>{m.author_name ?? "—"}</b><span className="t">{wib(m.created_at)}</span><div>{m.body}</div></div>) : <div className="meta">Belum ada pembaruan.</div>}
      </div>
      <div className="cin"><input type="text" placeholder="Tulis pembaruan…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} /><button className="btn p" onClick={send}><Ic n="send" />Kirim</button></div>
      <div className="crow" style={{ marginTop: 10 }}><button className="btn" onClick={onToggle}>{t.status === "done" ? "Buka kembali" : "Tandai selesai"}</button></div>
    </div>
  );
}

function AttachView({ list }: { list: Attachment[] }) {
  if (!list.length) return null;
  const media = list.filter((a) => a.type === "photo" || a.type === "video");
  const other = list.filter((a) => a.type !== "photo" && a.type !== "video");
  return (
    <>
      {media.length > 0 && (
        <div className="gal">
          {media.map((a) => (
            <div className="it" key={a.url}>
              {a.type === "photo" ? <a href={fileUrl(a.url)} target="_blank" rel="noopener noreferrer"><img src={fileUrl(a.url)} alt={a.name} /></a> : <video src={fileUrl(a.url)} controls />}
              <div className="cap">{a.name}</div>
            </div>
          ))}
        </div>
      )}
      {other.length > 0 && <div className="gal">{other.map((a) => <a key={a.url} className="lk" href={fileUrl(a.url)} target="_blank" rel="noopener noreferrer"><Ic n={a.type === "link" ? "link" : "file"} />{a.name}</a>)}</div>}
    </>
  );
}

function Composer({ role, onCreated }: { role: Role; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"umum" | "belanja">("umum");
  const [target, setTarget] = useState<Role>(role);
  const [priority, setPriority] = useState("Sedang");
  const [due, setDue] = useState("Hari ini");
  const [att, setAtt] = useState<Attachment[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = useRef<"file" | "foto" | "video">("file");

  const choose = (k: "file" | "foto" | "video") => {
    pick.current = k;
    if (fileRef.current) { fileRef.current.accept = k === "foto" ? "image/*" : k === "video" ? "video/*" : ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"; fileRef.current.click(); }
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    try { const up = await uploadFile(f); setAtt((a) => [...a, up]); } catch { toast.error("Unggah gagal (maks. 15 MB, tipe file diizinkan)"); }
  };
  const addLink = () => {
    if (!/^https?:\/\//i.test(link.trim())) { toast.error("Tautan harus diawali https://"); return; }
    setAtt((a) => [...a, { type: "link", name: link.trim(), url: link.trim() }]); setLink(""); setLinkOpen(false);
  };

  const submit = async () => {
    const belanja = mode === "belanja";
    if (belanja && (!item.trim() || !(parseFloat(qty.replace(",", ".")) > 0))) { toast.error("Isi barang dan jumlah"); return; }
    if (!belanja && !title.trim()) return;
    setBusy(true);
    const d = new Date(Date.now() + 7 * 3600_000 + (DUE[due] ?? 0) * 86_400_000);
    const dueAt = new Date(`${d.toISOString().slice(0, 10)}T17:00:00+07:00`).toISOString();
    try {
      await api("/api/manager/tasks", {
        method: "POST",
        body: {
          title: belanja ? `Belanja ${item.trim()} — ${qty} ${unit}` : title,
          detail: belanja ? title : "",
          kind: belanja ? "purchasing" : "general",
          priority: priority === "Tinggi" ? "high" : priority === "Rendah" ? "low" : "normal",
          assigneeRole: belanja ? "supervisor" : target,
          dueAt, attachments: att,
        },
      });
      toast.success(belanja || target !== role ? "Tugas dikirim ke Supervisor" : "Tugas dibuat");
      setTitle(""); setItem(""); setQty(""); setAtt([]); onCreated();
    } catch { toast.error("Tugas belum tersimpan"); } finally { setBusy(false); }
  };

  return (
    <div className="comp">
      <div className="cin">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={mode === "belanja" ? "Catatan untuk Supervisor (opsional): kualitas, merek, kapan dibutuhkan…" : role === "supervisor" ? "Tulis tugas untuk diri sendiri…" : "Tulis tugas… pilih @Supervisor untuk menugaskan"} />
        <button className="btn r" disabled={busy} onClick={submit}><Ic n="send" />Buat</button>
      </div>
      {role === "manager" && (
        <div className="crow"><span className="meta">Jenis</span>
          <button className={`chipb ${mode === "umum" ? "on" : ""}`} onClick={() => setMode("umum")}>Tugas umum</button>
          <button className={`chipb ${mode === "belanja" ? "on" : ""}`} onClick={() => setMode("belanja")}>Permintaan belanja → Supervisor</button>
        </div>
      )}
      {mode === "umum" && role === "manager" && (
        <div className="crow"><span className="meta">Untuk</span>
          {(["manager", "supervisor"] as Role[]).map((r) => <button key={r} className={`chipb ${target === r ? "on" : ""}`} onClick={() => setTarget(r)}>{FOR[r]}</button>)}
        </div>
      )}
      {mode === "belanja" && (
        <div className="crow">
          <input type="text" className="f" style={{ flex: 2, minWidth: 160, padding: "7px 10px" }} placeholder="Barang yang dibeli (mis. Susu UHT)" value={item} onChange={(e) => setItem(e.target.value)} />
          <input type="text" className="f" style={{ width: 80, padding: "7px 10px" }} placeholder="Jumlah" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          <select className="sel" value={unit} onChange={(e) => setUnit(e.target.value)}>{["pcs", "L", "kg", "pack", "karton", "butir"].map((u) => <option key={u}>{u}</option>)}</select>
        </div>
      )}
      <div className="crow">
        <select className="sel" value={priority} onChange={(e) => setPriority(e.target.value)}><option>Sedang</option><option>Tinggi</option><option>Rendah</option></select>
        <select className="sel" value={due} onChange={(e) => setDue(e.target.value)}><option>Hari ini</option><option>Besok</option><option>Minggu ini</option></select>
        <span className="meta" style={{ marginLeft: 6 }}>Lampiran</span>
        <button className="btn s" onClick={() => choose("file")}><Ic n="clip" />file</button>
        <button className="btn s" onClick={() => setLinkOpen((v) => !v)}><Ic n="link" />link</button>
        <button className="btn s" onClick={() => choose("foto")}><Ic n="img" />foto</button>
        <button className="btn s" onClick={() => choose("video")}><Ic n="vid" />video</button>
        {linkOpen && <span><input type="text" className="f" style={{ width: 230, padding: "4px 8px" }} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} /> <button className="btn s" onClick={addLink}>Tambah</button></span>}
        <input ref={fileRef} type="file" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="pend">
        {att.map((a, i) => <Fragment key={a.url + i}><span className="att"><Ic n={ATT_ICON[a.type === "photo" ? "foto" : a.type] ?? "clip"} /><span>{a.name}</span><button onClick={() => setAtt((x) => x.filter((_, j) => j !== i))}>×</button></span></Fragment>)}
      </div>
    </div>
  );
}
