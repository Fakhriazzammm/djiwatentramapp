import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Document, type Report, type Role } from "../lib/api";
import { Empty, wib } from "../ui";

const STATUS: Record<string, [string, string]> = { sent: ["Terkirim", ""], read: ["Dibaca", "ai"], needs_revision: ["Perlu revisi", "md"], acknowledged: ["Diterima", "ok"] };
const ROLE_L: Record<string, string> = { manager: "Manager", supervisor: "Supervisor", owner: "Owner" };

type Block = NonNullable<NonNullable<Document["body"]["ex"]>["blocks"]>[number];
const fields = (d: Document): string[] => (d.body.ex?.blocks ?? []).map((b: Block) => b.h).filter((h): h is string => !!h && !/^tanda tangan$/i.test(h));

export function ReportsView({ role, bugKey }: { role: Role; bugKey: number }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [tab, setTab] = useState<"in" | "out">("in");
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "new" | "edit" | "view">("list");
  const [doc, setDoc] = useState<Document | null>(null);

  const load = useCallback(async () => {
    try { setReports((await api<{ reports: Report[] }>("/api/manager/reports")).reports); }
    catch { toast.error("Laporan belum bisa dimuat"); setReports([]); }
  }, []);
  useEffect(() => { void load(); api<{ documents: Document[] }>("/api/manager/documents").then((d) => setDocs(d.documents)).catch(() => undefined); }, [load]);
  useEffect(() => {
    if (!bugKey) return;
    const d = docs.find((x) => x.slug === "laporan-bug-fitur");
    if (d) { setDoc(d); setMode("edit"); }
  }, [bugKey, docs]);

  const mineOut = (r: Report) => r.from_role === role;
  const list = (reports ?? []).filter((r) => (tab === "in" ? !mineOut(r) : mineOut(r)));
  const cnt = (t: "in" | "out") => (reports ?? []).filter((r) => (t === "in" ? !mineOut(r) : mineOut(r))).length;
  const curRep = (reports ?? []).find((r) => r.id === sel) ?? null;
  const templates = docs.filter((d) => (d.body.who ?? "MS").includes(role === "manager" ? "M" : "S"));

  const review = async (r: Report, status: string) => {
    try { await api(`/api/manager/reports/${r.id}`, { method: "PATCH", body: { status } }); void load(); }
    catch { toast.error("Belum tersimpan"); }
  };

  return (
    <div className="work rp" data-m={mode === "list" ? "list" : "main"} style={{ gridTemplateColumns: "340px minmax(0,1fr)" }}>
      <div className="panel fill">
        <div className="ph"><span className="lab">Laporan</span><button className="btn r s" onClick={() => { setMode("new"); setSel(null); }}>+ Baru</button></div>
        <div className="tabs">
          <button className={tab === "in" ? "on" : ""} onClick={() => setTab("in")}>Masuk {cnt("in")}</button>
          <button className={tab === "out" ? "on" : ""} onClick={() => setTab("out")}>Terkirim {cnt("out")}</button>
        </div>
        <div className="sc">
          {list.length === 0 && <Empty>{tab === "in" ? "Belum ada laporan masuk" : "Belum ada laporan terkirim"}</Empty>}
          {list.map((r) => (
            <div key={r.id} className={`tr ${sel === r.id ? "open" : ""} ${tab === "in" && r.status === "sent" ? "nw" : ""}`} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} onClick={() => { setSel(r.id); setMode("view"); }}>
              <div style={{ minWidth: 0 }}><div className="tt">{r.title}</div><div className="ts"><span>{ROLE_L[r.from_role]} → {ROLE_L[r.to_role]}</span><span>{wib(r.created_at)}</span></div></div>
              <div className="tm"><span className={`tg ${STATUS[r.status]?.[1] ?? ""}`}>{STATUS[r.status]?.[0] ?? r.status}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel fill" id="rmain" style={{ minWidth: 0 }}>
        {mode === "new" && (<>
          <div className="ph"><span><button className="btn s only-m" style={{ marginRight: 8 }} onClick={() => setMode("list")}>←</button><span className="lab" style={{ display: "inline-flex" }}>Laporan baru</span></span><span className="meta">Pilih templat · {templates.length} tersedia untuk {ROLE_L[role]}</span></div>
          <div className="sc pad"><div className="pgrid">
            {templates.map((d) => (
              <div className="pcard" key={d.slug}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}><span className="tg">{d.category}</span></div>
                <b>{d.title}</b><div className="meta" style={{ margin: "4px 0 8px" }}>{d.body.when}</div><div className="meta">Kepada: {d.body.to}</div>
                <div className="crow"><button className="btn r s" onClick={() => { setDoc(d); setMode("edit"); }}>Buat</button></div>
              </div>
            ))}
          </div></div>
        </>)}
        {mode === "edit" && doc && <Editor key={doc.slug} doc={doc} role={role} onBack={() => setMode("list")} onSent={() => { setMode("list"); setTab("out"); void load(); }} />}
        {mode === "view" && curRep && <Viewer r={curRep} role={role} onBack={() => setMode("list")} onReview={review} />}
        {(mode === "list" || (mode === "view" && !curRep)) && <div className="empty" style={{ margin: "auto" }}>Pilih laporan di kiri, atau klik “+ Baru” untuk membuat laporan.</div>}
      </div>
    </div>
  );
}

function Editor({ doc, role, onBack, onSent }: { doc: Document; role: Role; onBack: () => void; onSent: () => void }) {
  const names = useMemo(() => fields(doc), [doc]);
  const [subject, setSubject] = useState(`${doc.title} — ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}`);
  const [values, setValues] = useState<Record<string, string>>({});
  const [to, setTo] = useState<"manager" | "owner">(role === "manager" ? "owner" : "manager");
  const [view, setView] = useState<"form" | "prev">("form");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!subject.trim()) { toast.error("Isi subjek laporan"); return; }
    setBusy(true);
    try {
      await api("/api/manager/reports", { method: "POST", body: { kind: doc.slug, title: subject, toRole: to, body: Object.fromEntries(names.map((n) => [n, values[n] ?? ""])) } });
      toast.success("Laporan terkirim");
      onSent();
    } catch { toast.error("Laporan belum terkirim"); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="ph">
        <div style={{ minWidth: 0 }}><button className="btn s only-m" style={{ marginBottom: 6 }} onClick={onBack}>← Daftar</button><span className="lab">{doc.title}</span><div className="meta">Draf · belum dikirim. Kirim bila sudah siap</div></div>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="btn r" disabled={busy} onClick={send}>Kirim laporan</button></span>
      </div>
      <div className="mtabs"><button className={view === "form" ? "on" : ""} onClick={() => setView("form")}>Isi</button><button className={view === "prev" ? "on" : ""} onClick={() => setView("prev")}>Pratinjau</button></div>
      <div className="ed2" data-v={view}>
        <div className="sc pad">
          <label style={{ marginTop: 0 }}>Subjek</label><input type="text" className="f" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label>Kirim kepada</label>
          <div>{(role === "manager" ? ["owner"] : ["manager", "owner"]).map((x) => <span key={x}><button className={`chipb ${to === x ? "on" : ""}`} onClick={() => setTo(x as "manager" | "owner")}>{ROLE_L[x]}</button> </span>)}</div>
          {names.map((n) => <div key={n}><label>{n}</label><textarea rows={3} value={values[n] ?? ""} onChange={(e) => setValues({ ...values, [n]: e.target.value })} /></div>)}
        </div>
        <div className="sc prevw">
          <div className="meta" style={{ padding: "10px 16px 0" }}>Pratinjau dokumen</div>
          <div style={{ margin: "8px 12px 16px", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "#fff", padding: 16 }}>
            <div style={{ font: "650 16px var(--sans)" }}>{subject}</div><div className="meta" style={{ marginBottom: 8 }}>{ROLE_L[role]} → {ROLE_L[to]}</div>
            {names.map((n) => <div key={n}><label>{n}</label><div style={{ whiteSpace: "pre-wrap" }}>{values[n] || "—"}</div></div>)}
          </div>
        </div>
      </div>
    </>
  );
}

function Viewer({ r, role, onBack, onReview }: { r: Report; role: Role; onBack: () => void; onReview: (r: Report, s: string) => void }) {
  const canReview = role === "manager" && r.to_role === "manager";
  const lb = STATUS[r.status] ?? [r.status, ""];
  return (
    <>
      <div className="ph">
        <div style={{ minWidth: 0 }}><button className="btn s only-m" style={{ marginBottom: 6 }} onClick={onBack}>← Daftar</button><span className="lab">{r.title}</span><div className="meta">{ROLE_L[r.from_role]} → {ROLE_L[r.to_role]} · {wib(r.created_at)}</div></div>
        <span className={`tg ${lb[1]}`}>{lb[0]}</span>
      </div>
      <div className="sc pad">
        {Object.entries(r.body).map(([k, v]) => <div key={k}><label style={{ marginTop: 0 }}>{k}</label><div style={{ whiteSpace: "pre-wrap" }}>{String(v) || "—"}</div></div>)}
        {r.review_note && <div className={`box ${r.status === "acknowledged" ? "a" : "w"}`}><b>{lb[0]}</b>{r.review_note}</div>}
        {canReview && r.status === "sent" && <div className="crow" style={{ marginTop: 12 }}><button className="btn p" onClick={() => onReview(r, "acknowledged")}>Terima</button><button className="btn" onClick={() => onReview(r, "needs_revision")}>Minta revisi</button></div>}
      </div>
    </>
  );
}
