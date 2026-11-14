import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { api, type Document } from "../lib/api";

export function DocumentsView() {
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [active, setActive] = useState<Document | null>(null);

  useEffect(() => {
    api<{ documents: Document[] }>("/api/manager/documents")
      .then((d) => setDocs(d.documents))
      .catch(() => { toast.error("Dokumen belum bisa dimuat"); setDocs([]); });
  }, []);

  if (active) return <DocumentDetail doc={active} onBack={() => setActive(null)} />;

  const grouped = (docs ?? []).reduce<Record<string, Document[]>>((acc, d) => {
    (acc[d.category] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-mute">Templat laporan dan formulir. Unduh PDF bila perlu diisi manual, atau salin isinya ke laporan.</p>
      {docs === null && <div className="label">Memuat…</div>}
      {docs?.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Belum ada templat. Owner dapat menambahkannya di Admin → Manager.</div>}
      {Object.entries(grouped).map(([category, list]) => (
        <section key={category}>
          <div className="label mb-2">{category}</div>
          <ul className="space-y-1.5">
            {list.map((d) => (
              <li key={d.slug}>
                <button className="panel flex w-full items-center justify-between p-3 text-left" onClick={() => setActive(d)}>
                  <span className="text-sm font-medium">{d.title}</span>
                  <span className="label">buka →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DocumentDetail({ doc, onBack }: { doc: Document; onBack: () => void }) {
  const b = doc.body;
  const pdf = `${import.meta.env.BASE_URL}docs/${doc.slug}.pdf`.replace(/\/{2,}/g, "/");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button className="btn !min-h-8" onClick={onBack}><ArrowLeft size={14} />Kembali</button>
        <a className="btn !min-h-8" href={pdf} target="_blank" rel="noopener noreferrer" download><Download size={14} />PDF</a>
      </div>
      <article className="panel space-y-3 p-4 text-[13px]">
        <header>
          <div className="label">{b.cat ?? doc.category}</div>
          <h2 className="text-lg font-bold">{b.t ?? doc.title}</h2>
          <div className="label mt-1">{[b.who && `oleh ${b.who}`, b.to && `untuk ${b.to}`, b.when].filter(Boolean).join(" · ")}</div>
        </header>
        {b.purpose && <p className="text-mute">{b.purpose}</p>}
        {b.steps && <Section title="Cara membuat"><ol className="list-decimal space-y-1 pl-5">{b.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></Section>}
        {b.sources && <Section title="Sumber angka"><ul className="list-disc space-y-1 pl-5">{b.sources.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>}
        {b.tips && <Section title="Tips"><ul className="list-disc space-y-1 pl-5">{b.tips.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>}
        {b.mistakes && <Section title="Sering salah"><ul className="list-disc space-y-1 pl-5">{b.mistakes.map((s, i) => <li key={i}>{s}</li>)}</ul></Section>}
        {b.ex && (
          <Section title="Contoh terisi">
            <div className="rounded-lg border border-line p-3">
              {b.ex.title && <div className="mb-2 font-semibold">{b.ex.title}</div>}
              {b.ex.blocks?.map((block, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  {block.h && <div className="label mb-1">{block.h}</div>}
                  {block.p && <p>{block.p}</p>}
                  {block.list && <ul className="list-disc space-y-1 pl-5">{block.list.map((x, j) => <li key={j}>{x}</li>)}</ul>}
                  {block.kv && <dl className="space-y-1">{block.kv.map(([k, v], j) => <div key={j} className="flex gap-2"><dt className="w-32 shrink-0 text-mute">{k}</dt><dd>{v}</dd></div>)}</dl>}
                  {block.check && <ul className="space-y-1">{block.check.map(([k, v], j) => <li key={j}>{v ? "✓" : "☐"} {k}</li>)}</ul>}
                  {block.sign && <div className="mt-2 grid grid-cols-2 gap-2">{block.sign.map(([k, v], j) => <div key={j}><div className="label">{k}</div><div>{v}</div></div>)}</div>}
                  {block.cols && block.rows && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <thead><tr className="label">{block.cols.map((c, j) => <th key={j} className="py-1 pr-2">{c}</th>)}</tr></thead>
                        <tbody>{block.rows.map((row, j) => <tr key={j} className="border-t">{row.map((cell, k) => <td key={k} className="py-1 pr-2">{cell}</td>)}</tr>)}</tbody>
                        {block.total && <tfoot><tr className="border-t font-semibold">{block.total.map((cell, j) => <td key={j} className="py-1 pr-2">{cell}</td>)}</tr></tfoot>}
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><div className="label mb-1">{title}</div>{children}</section>;
}
