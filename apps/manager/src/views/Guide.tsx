import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Chapter, type Document, type Role } from "../lib/api";
import { Empty } from "../ui";

type Ch = { id?: string; t?: string; who?: string; when?: string; goal?: string; steps?: string[]; auto?: string[]; th?: string[]; table?: string[][]; issue?: [string, string][]; docs?: string[]; draft?: string };
const WHO = (w?: string) => (w === "MS" ? "Manager & Supervisor" : w === "M" ? "Khusus Manager" : w === "S" ? "Khusus Supervisor" : "Manager & Supervisor");
const PDF = (slug: string) => `/docs/${slug}.pdf`;
const KEY = "mgr_sop_checks";

function loadChecks(): Record<string, boolean[]> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}

export function GuideView({ role, onSkip }: { role: Role; onSkip: () => void }) {
  const [tab, setTab] = useState<"pb" | "doc">("pb");
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [chap, setChap] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [mob, setMob] = useState<"list" | "main">("list");
  const [checks, setChecks] = useState<Record<string, boolean[]>>(loadChecks);

  useEffect(() => {
    api<{ chapters: Chapter[] }>("/api/manager/playbook").then((d) => { setChapters(d.chapters); setChap(d.chapters[0]?.slug ?? null); }).catch(() => { toast.error("Playbook belum bisa dimuat"); setChapters([]); });
    api<{ documents: Document[] }>("/api/manager/documents").then((d) => { setDocs(d.documents); setDoc(d.documents[0]?.slug ?? null); }).catch(() => { toast.error("Dokumen belum bisa dimuat"); setDocs([]); });
  }, []);

  const tick = (slug: string, i: number) => {
    setChecks((c) => {
      const row = [...(c[slug] ?? [])]; row[i] = !row[i];
      const next = { ...c, [slug]: row };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const body = (c: Chapter) => c.body as unknown as Ch;
  const done = (c: Chapter) => (checks[c.slug] ?? []).filter(Boolean).length;
  const full = (c: Chapter) => { const n = body(c).steps?.length ?? 0; return n > 0 && done(c) >= n; };

  const list = (chapters ?? []).filter((c) => !q || `${c.title} ${body(c).goal ?? ""} ${(body(c).steps ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const dlist = (docs ?? []).filter((d) => !q || `${d.title} ${d.body.purpose ?? ""} ${(d.body.steps ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const cats = useMemo(() => [...new Set(dlist.map((d) => d.category))], [dlist]);
  const progD = (chapters ?? []).filter(full).length;
  const progN = chapters?.length ?? 0;
  const cur = (chapters ?? []).find((c) => c.slug === chap) ?? chapters?.[0];
  const curDoc = (docs ?? []).find((d) => d.slug === doc) ?? docs?.[0];
  const nxt = (chapters ?? []).find((c) => !full(c));
  const nav = (d: number) => { if (!chapters || !cur) return; const i = chapters.indexOf(cur) + d; if (chapters[i]) setChap(chapters[i].slug); };

  return (
    <div className="pb" data-m={mob}>
      <div className="panel gl">
        <div className="gh">
          <div className="tabs" style={{ margin: 0 }}>
            <button className={tab === "pb" ? "on" : ""} onClick={() => setTab("pb")}>Playbook</button>
            <button className={tab === "doc" ? "on" : ""} onClick={() => setTab("doc")}>Dokumen</button>
          </div>
          <input type="text" className="f" placeholder={tab === "pb" ? "Cari bab atau langkah…" : "Cari dokumen…"} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="sc">
          {tab === "pb" ? (<>
            <div style={{ padding: "12px 16px 4px" }}><div className="meta">Onboarding · {progD} dari {progN} bab</div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${progN ? Math.round((progD / progN) * 100) : 0}%` }} /></div></div>
            {chapters === null && <Empty>Memuat…</Empty>}
            {chapters && list.length === 0 && <Empty>Tidak ada bab yang cocok</Empty>}
            {list.map((c) => (
              <button key={c.slug} className={`chap ${cur?.slug === c.slug ? "on" : ""}`} onClick={() => { setChap(c.slug); setMob("main"); }}>
                <div><b style={{ fontWeight: 500 }}>{(chapters ?? []).indexOf(c) + 1}. {c.title}</b><small>{body(c).when}</small></div>
                <span className="ck">{full(c) ? "✓" : `${done(c)}/${body(c).steps?.length ?? 0}`}</span>
              </button>
            ))}
          </>) : (<>
            {docs === null && <Empty>Memuat…</Empty>}
            {docs && dlist.length === 0 && <Empty>Tidak ada dokumen yang cocok</Empty>}
            {cats.map((cat) => (
              <div key={cat}>
                <div className="meta" style={{ padding: "12px 16px 4px" }}>{cat}</div>
                {dlist.filter((d) => d.category === cat).map((d) => (
                  <button key={d.slug} className={`chap ${curDoc?.slug === d.slug ? "on" : ""}`} onClick={() => { setDoc(d.slug); setMob("main"); }}>
                    <div><b style={{ fontWeight: 500 }}>{d.title}</b><small>{d.body.to ? `Untuk ${d.body.to}` : "Referensi"}</small></div>
                  </button>
                ))}
              </div>
            ))}
          </>)}
        </div>
        <div>
          {tab === "pb" && nxt && !q && <div className="pad" style={{ borderTop: "1px solid var(--line)" }}><button className="btn p" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setChap(nxt.slug); setMob("main"); }}>Lanjutkan bab {(chapters ?? []).indexOf(nxt) + 1}</button></div>}
          {tab === "doc" && <div className="pad" style={{ borderTop: "1px solid var(--line)" }}><a className="btn" style={{ width: "100%", justifyContent: "center" }} href="/docs/paket-dokumen-djiwa-tentram.zip" download>Unduh semua formulir (ZIP · {docs?.length ?? 0} PDF)</a></div>}
        </div>
      </div>

      <div className="panel sc pad">
        <button className="btn s only-m" style={{ marginBottom: 10 }} onClick={() => setMob("list")}>← Daftar</button>
        {tab === "pb" ? (cur ? (
          <>
            {progD === 0 && !q && (
              <div className="box a" style={{ margin: "0 0 12px" }}><b>Selamat datang di Djiwa Tentram</b>Mulai dari bab pertama, atau lewati dan buka tugas Anda. Konten dikelola Owner dan selalu terbaru.
                <div className="crow"><button className="btn s p" onClick={() => setChap(chapters![0].slug)}>Mulai bab 1</button><button className="btn s" onClick={onSkip}>Lewati dulu</button></div></div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}><span className="tg">{WHO(body(cur).who)}</span><span className="tg">{body(cur).when}</span></div>
            <h2 style={{ margin: "0 0 4px", font: "650 20px var(--sans)", letterSpacing: "-.02em" }}>{cur.title}</h2>
            <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>{body(cur).goal}</p>
            {body(cur).draft && <div className="box w"><b>Perlu validasi Owner</b>{body(cur).draft}</div>}
            <label>Langkah-langkah</label>
            {(body(cur).steps ?? []).map((s, i) => {
              const on = !!checks[cur.slug]?.[i];
              return <div key={i} className={`step ${on ? "d" : ""}`}><button className={`cb ${on ? "on" : ""}`} onClick={() => tick(cur.slug, i)}>{on ? "✓" : ""}</button><div className="tx">{s}</div></div>;
            })}
            {(body(cur).auto?.length ?? 0) > 0 && <div className="box a"><b>Yang dilakukan sistem otomatis</b><ul>{body(cur).auto!.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
            {body(cur).table && (<><label>{body(cur).th ? "Ringkasan" : "Panduan cepat"}</label>
              <table><thead><tr>{(body(cur).th ?? ["Situasi", "Langkah pertama"]).map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{body(cur).table!.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody></table></>)}
            {(body(cur).issue?.length ?? 0) > 0 && (<><label>Kalau bermasalah</label>
              <table><thead><tr><th>Masalah</th><th>Tindakan</th></tr></thead><tbody>{body(cur).issue!.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>)}</tbody></table></>)}
            {(body(cur).docs?.length ?? 0) > 0 && (<><label>Dokumen & laporan terkait</label><div>{body(cur).docs!.map((id) => { const d = docs?.find((x) => x.slug === id); return d ? <span key={id}><button className="chipb" onClick={() => { setTab("doc"); setDoc(id); setMob("main"); }}>{d.title}</button> </span> : null; })}</div></>)}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}><button className="btn" onClick={() => nav(-1)}>← Sebelumnya</button><button className="btn p" onClick={() => nav(1)}>Berikutnya →</button></div>
          </>
        ) : <Empty>Belum ada bab terbit.</Empty>) : curDoc ? <DocMain d={curDoc} role={role} /> : <Empty>Belum ada dokumen.</Empty>}
      </div>
    </div>
  );
}

function DocMain({ d }: { d: Document; role: Role }) {
  const b = d.body;
  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}><span className="tg">{d.category}</span><span className="tg">Dibuat: {WHO(b.who)}</span>{b.to && <span className="tg">Untuk: {b.to}</span>}</div>
      <h2 style={{ margin: "0 0 4px", font: "650 20px var(--sans)", letterSpacing: "-.02em" }}>{d.title}</h2>
      <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>{b.purpose}</p>
      <div className="crow" style={{ margin: "0 0 6px" }}>
        <a className="btn" href={PDF(d.slug)} download>Unduh formulir PDF</a>
        <a className="btn" href={PDF(d.slug)} target="_blank" rel="noopener noreferrer">Pratinjau</a>
      </div>
      <div className="row2" style={{ marginTop: 6 }}><div><label>Kapan dibuat</label><div>{b.when}</div></div><div><label>Format</label><div>{b.fmt}</div></div></div>
      <label>Cara membuat, langkah demi langkah</label>
      {(b.steps ?? []).map((x, i) => <div className="step" key={i}><span className="tg ai" style={{ height: "fit-content" }}>{i + 1}</span><div className="tx">{x}</div></div>)}
      {(b.sources?.length ?? 0) > 0 && <><label>Ambil data dari mana</label><div>{b.sources!.map((x, i) => <span key={i} className="tg" style={{ margin: "2px 4px 2px 0", display: "inline-block" }}>{x}</span>)}</div></>}
      <div className="row2">
        <div className="box a"><b>Tips</b><ul>{(b.tips ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div className="box" style={{ background: "var(--reds)" }}><b>Kesalahan umum</b><ul>{(b.mistakes ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      {b.ex && (<>
        <label>Contoh terisi <span className="tg" style={{ background: "var(--ws)", color: "var(--warn)" }}>Data fiktif</span></label>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "4px 16px 14px", background: "#fff" }}>
          <div style={{ font: "650 15px var(--sans)", margin: "12px 0 0" }}>{b.ex.title}</div>
          {(b.ex.blocks ?? []).map((x, i) => (
            <div key={i}>
              {x.h && <label>{x.h}</label>}
              {x.kv && <table><tbody>{x.kv.map(([k, v], j) => <tr key={j}><td style={{ width: "34%", color: "var(--muted)" }}>{k}</td><td>{v}</td></tr>)}</tbody></table>}
              {x.cols && <table><thead><tr>{x.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{(x.rows ?? []).map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}{x.total && <tr>{x.total.map((c, k) => <td key={k}><b>{c}</b></td>)}</tr>}</tbody></table>}
              {x.p && <p style={{ margin: "4px 0" }}>{x.p}</p>}
              {x.list && <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{x.list.map((l, j) => <li key={j}>{l}</li>)}</ul>}
              {x.check && x.check.map(([k, v], j) => <div className="step" key={j}><span className={`cb ${v ? "on" : ""}`}>{v ? "✓" : ""}</span><div className="tx">{k}</div></div>)}
              {x.sign && <div className="meta" style={{ marginTop: 8 }}>Tanda tangan: {x.sign.map(([k, v]) => `${k} (${v})`).join(" · ")}</div>}
            </div>
          ))}
        </div>
      </>)}
    </>
  );
}
