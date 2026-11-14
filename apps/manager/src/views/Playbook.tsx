import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Chapter } from "../lib/api";

export function PlaybookView({ onSkip }: { onSkip: () => void }) {
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
        <button className="btn" onClick={onSkip}>Lewati ke Tugas</button>
      </div>
      {chapters?.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Isi Playbook belum dibuat oleh Owner.</div>}
      {chapters?.map((c) => (
        <section key={c.slug} className="panel">
          <button className="flex w-full items-center justify-between p-3 text-left text-sm font-semibold" onClick={() => setOpen(open === c.slug ? null : c.slug)}>
            {c.title}<span className="label">{open === c.slug ? "tutup" : "buka"}</span>
          </button>
          {open === c.slug && (
            <div className="space-y-3 border-t border-line p-3 text-[13px]">
              {c.body.map((b, i) => (
                <div key={i}>
                  {b.h && <div className="mb-1 font-semibold">{b.h}</div>}
                  {b.text && <p className="text-mute">{b.text}</p>}
                  {b.steps && <ol className="list-decimal space-y-1 pl-5">{b.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
