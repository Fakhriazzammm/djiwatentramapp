import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Chapter } from "../lib/api";

type Block = { h?: string; text?: string; steps?: string[] };
type ChapterBody = Block[] | {
  t?: string; who?: string; when?: string; goal?: string;
  steps?: string[]; auto?: string[]; issue?: [string, string][];
  th?: string[]; table?: string[][]; docs?: string[]; open?: string[];
};

export function PlaybookView({ onSkip, onOpenDocument }: { onSkip: () => void; onOpenDocument?: (slug: string) => void }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<{ chapters: Chapter[] }>("/api/manager/playbook")
      .then((d) => { setChapters(d.chapters); setOpen(d.chapters[0]?.slug ?? null); })
      .catch(() => { toast.error("Playbook belum bisa dimuat"); setChapters([]); });
  }, []);

  return (
    <div className="space-y-3">
      <div className="panel flex items-center justify-between gap-3 p-3">
        <p className="text-sm">Panduan kerja Djiwa Tentram. Boleh dilewati kapan saja.</p>
        <button className="btn" onClick={onSkip}>Lewati</button>
      </div>
      {chapters?.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Isi Playbook belum dibuat oleh Owner.</div>}
      {chapters?.map((c, idx) => {
        const body = c.body as unknown as ChapterBody;
        const isOpen = open === c.slug;
        return (
          <section key={c.slug} className="panel">
            <button className="flex w-full items-center justify-between p-3 text-left text-sm font-semibold" onClick={() => setOpen(isOpen ? null : c.slug)}>
              <span><span className="label mr-2">{String(idx + 1).padStart(2, "0")}</span>{c.title}</span>
              <span className="label">{isOpen ? "tutup" : "buka"}</span>
            </button>
            {isOpen && Array.isArray(body) && (
              <div className="space-y-3 border-t border-line p-3 text-[13px]">
                {(body as Block[]).map((b, i) => (
                  <div key={i}>
                    {b.h && <div className="mb-1 font-semibold">{b.h}</div>}
                    {b.text && <p className="text-mute">{b.text}</p>}
                    {b.steps && <ol className="list-decimal space-y-1 pl-5">{b.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}
                  </div>
                ))}
              </div>
            )}
            {isOpen && !Array.isArray(body) && <ChapterObject body={body as Exclude<ChapterBody, Block[]>} onOpenDocument={onOpenDocument} />}
          </section>
        );
      })}
    </div>
  );
}

function ChapterObject({ body, onOpenDocument }: { body: Exclude<ChapterBody, Block[]>; onOpenDocument?: (slug: string) => void }) {
  const [todo, setTodo] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-3 border-t border-line p-3 text-[13px]">
      {(body.who || body.when) && <div className="label">{[body.who && `untuk ${body.who}`, body.when].filter(Boolean).join(" · ")}</div>}
      {body.goal && <p className="font-medium">{body.goal}</p>}
      {body.steps && (
        <ol className="space-y-1.5">
          {body.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <input type="checkbox" className="mt-1" checked={Boolean(todo[i])} onChange={(e) => setTodo({ ...todo, [i]: e.target.checked })} />
              <span className={todo[i] ? "text-mute line-through" : ""}>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {body.issue && body.issue.length > 0 && (
        <div>
          <div className="label mb-1">Bila ada masalah</div>
          <div className="space-y-1.5">
            {body.issue.map(([q, a], i) => <details key={i} className="rounded border border-line p-2"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-1 text-mute">{a}</p></details>)}
          </div>
        </div>
      )}
      {body.table && body.table.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            {body.th && <thead><tr className="label">{body.th.map((h, i) => <th key={i} className="py-1 pr-2">{h}</th>)}</tr></thead>}
            <tbody>{body.table.map((row, i) => <tr key={i} className="border-t align-top">{row.map((cell, j) => <td key={j} className="py-1 pr-2">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {body.auto && body.auto.length > 0 && (
        <div><div className="label mb-1">Otomatis oleh sistem</div><ul className="list-disc space-y-1 pl-5 text-mute">{body.auto.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      )}
      {body.docs && body.docs.length > 0 && (
        <div><div className="label mb-1">Dokumen terkait</div><div className="flex flex-wrap gap-2">
          {body.docs.map((slug) => <button key={slug} className="btn !min-h-8" onClick={() => onOpenDocument?.(slug)}>{slug.replace(/-/g, " ")}</button>)}
        </div></div>
      )}
      {body.open && body.open.length > 0 && <div className="label">Buka di: {body.open.join(" · ")}</div>}
    </div>
  );
}
