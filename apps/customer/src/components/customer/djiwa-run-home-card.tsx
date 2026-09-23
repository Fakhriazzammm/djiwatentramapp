import { ChevronRight, Footprints } from "lucide-react";

export function DjiwaRunHomeCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-3xl border border-primary/20 bg-primary/5 p-4 shadow-sm" aria-labelledby="djiwa-run-home-title">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Footprints className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Djiwa Run</p><h2 id="djiwa-run-home-title" className="mt-0.5 text-sm font-black">Catat lari, buka reward</h2><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Lihat progres challenge dan upload bukti dari area Djiwa Tentram.</p></div>
        <button type="button" onClick={onOpen} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-[.97]" aria-label="Lihat progres Djiwa Run"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </section>
  );
}
