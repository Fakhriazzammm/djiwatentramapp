import { AlertCircle, ChevronLeft, ChevronRight, Flag, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { storiesClient } from "./stories-client";
import { isStoryExpired } from "./story-validation";
import type { CustomerStory } from "./story-types";
import { StoryProgress } from "./story-progress";

type Props = {
  story: CustomerStory | null;
  stories?: CustomerStory[];
  ownSourceId?: string;
  onNavigate?: (story: CustomerStory) => void;
  onClose: () => void;
  onChanged?: () => void;
};

export function StoryViewer({ story, stories = [], ownSourceId, onNavigate, onClose, onChanged }: Props) {
  const [failed, setFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentIndex = story ? Math.max(0, stories.findIndex((item) => item.storyId === story.storyId)) : 0;
  const previous = stories[currentIndex - 1];
  const next = stories[currentIndex + 1];
  const isOwnStory = Boolean(story && ownSourceId && story.ownerSourceId === ownSourceId);

  useEffect(() => { setFailed(false); setActionError(null); }, [story?.storyId]);
  useEffect(() => { if (!story || story.mediaType !== "image") return; const timer = window.setTimeout(onClose, 5000); return () => window.clearTimeout(timer); }, [story, onClose]);
  useEffect(() => { if (!story) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [story, onClose]);
  useEffect(() => { if (!story || !isStoryExpired(story.expiresAt)) return; onClose(); }, [story, onClose]);

  if (!story || isStoryExpired(story.expiresAt)) return null;

  const moderate = async (action: "report" | "block" | "delete") => {
    const message = action === "delete" ? "Hapus Story ini?" : action === "block" ? `Blokir Story dari ${story.ownerLabel}?` : "Laporkan Story ini?";
    if (!window.confirm(message)) return;
    setBusy(true); setActionError(null);
    try {
      if (action === "delete") await storiesClient.delete(story.storyId);
      else await storiesClient.moderate(story.storyId, action);
      onChanged?.(); onClose();
    } catch { setActionError("Aksi belum berhasil. Coba lagi."); } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/95 p-3" role="dialog" aria-modal="true" aria-label={`Story ${story.ownerLabel}`}>
    <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[24px] bg-slate-900">
      <div className="px-4 pb-2 pt-[max(1rem,var(--safe-area-top))]"><StoryProgress total={Math.max(stories.length, 1)} active={currentIndex} /><div className="mt-3 flex items-center justify-between gap-2"><p className="min-w-0 truncate text-sm font-bold text-white">{story.ownerLabel}</p><div className="flex items-center gap-1"><Button variant="ghost" size="icon-lg" className="text-white hover:bg-white/10 hover:text-white" onClick={() => void moderate(isOwnStory ? "delete" : "report")} disabled={busy} aria-label={isOwnStory ? "Hapus Story" : "Laporkan Story"}>{isOwnStory ? <Trash2 aria-hidden="true" /> : <Flag aria-hidden="true" />}</Button><Button variant="ghost" size="icon-lg" className="text-white hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Tutup Story"><X aria-hidden="true" /></Button></div></div>{!isOwnStory ? <button type="button" onClick={() => void moderate("block")} disabled={busy} className="min-h-11 text-left text-[11px] font-semibold text-white/70 underline">Blokir Story dari customer ini</button> : null}{actionError ? <p role="alert" className="mt-1 text-xs text-red-200">{actionError}</p> : null}</div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center"><button type="button" aria-label="Story sebelumnya" className="absolute inset-y-0 left-0 z-10 w-1/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" onClick={() => previous ? onNavigate?.(previous) : onClose}><ChevronLeft className="sr-only" /></button>{failed ? <div className="flex flex-col items-center gap-3 p-6 text-center text-white"><AlertCircle className="h-8 w-8" aria-hidden="true" /><p className="text-sm">Media Story tidak dapat dimuat.</p><Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setFailed(false)}>Coba lagi</Button></div> : story.mediaType === "video" ? <video src={story.mediaUrl} autoPlay controls onEnded={onClose} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" /> : <img src={story.mediaUrl} alt={`Story dari ${story.ownerLabel}`} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />}<button type="button" aria-label="Story berikutnya" className="absolute inset-y-0 right-0 z-10 w-1/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" onClick={() => next ? onNavigate?.(next) : onClose}><ChevronRight className="sr-only" /></button></div>
    </div>
  </div>;
}
