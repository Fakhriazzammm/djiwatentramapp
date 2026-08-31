import { RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION } from "../lib/version";
import { APP_UPDATE_EVENT, getLatestUpdateInfo, type AppUpdateInfo } from "../lib/app-update";

export function AppUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(() => getLatestUpdateInfo());
  useEffect(() => {
    const onUpdate = (event: Event) => { setUpdateInfo((event as CustomEvent<AppUpdateInfo>).detail); setOpen(true); };
    window.addEventListener(APP_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(APP_UPDATE_EVENT, onUpdate);
  }, []);
  return <>
    <button type="button" className="fixed bottom-4 right-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/90 bg-white/90 px-3.5 text-[11px] font-bold text-[#476184] shadow-[0_10px_28px_rgba(39,91,157,0.14)] backdrop-blur transition-transform duration-200 active:scale-[.97]" onClick={() => setOpen(true)} aria-label="Lihat informasi versi aplikasi">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Versi {APP_VERSION.semantic}
    </button>
    {open && <div className="fixed inset-0 z-30 grid place-items-center bg-[#17233f]/25 p-5 backdrop-blur-sm" role="presentation" onClick={() => setOpen(false)}>
      <section className="w-full max-w-[390px] rounded-[26px] border border-white/90 bg-white p-6 text-[#17233f] shadow-[0_28px_80px_rgba(39,91,157,0.2)]" role="dialog" aria-modal="true" aria-labelledby="linkbio-update-title" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf2ff] text-[#1a5dc6]"><Sparkles className="h-5 w-5" /></div><button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-[#7185a3] hover:bg-[#f2f6fc]" onClick={() => setOpen(false)} aria-label="Tutup"><X className="h-5 w-5" /></button></div>
        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#1a5dc6]">Djiwa Tentram · App Update</p>
        <h2 id="linkbio-update-title" className="mt-1 font-display text-[23px] font-extrabold tracking-[-.045em]">{updateInfo ? "Update aplikasi tersedia" : "Informasi versi aplikasi"}</h2>
        <p className="mt-2 text-sm leading-6 text-[#617594]">{updateInfo ? "Versi baru terdeteksi. Muat ulang untuk memakai bundle terbaru." : "Linkbio tidak memakai service worker. Detail build ini membantu tim memastikan versi yang sedang dipakai."}</p>
        <dl className="mt-5 space-y-1 rounded-2xl border border-[#e5edf8] bg-[#fafcff] p-3 text-xs"><div className="flex justify-between gap-4 py-1"><dt className="text-[#7185a3]">Versi app :</dt><dd className="font-bold">{updateInfo?.latestVersion ?? APP_VERSION.semantic}</dd></div><div className="flex justify-between gap-4 py-1"><dt className="text-[#7185a3]">Commit :</dt><dd className="font-bold">{updateInfo?.latestCommit ?? APP_VERSION.commitHash}</dd></div><div className="flex flex-col gap-1 py-1"><dt className="text-[#7185a3]">Message:</dt><dd className="break-words font-bold leading-5">{updateInfo?.latestMessage ?? APP_VERSION.message}</dd></div></dl>
        <button type="button" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a5dc6] px-4 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(26,93,198,0.2)] transition-transform duration-200 active:scale-[.97]" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> Update sekarang</button>
      </section>
    </div>}
  </>;
}
