import { AlertCircle, ChevronLeft, ChevronRight, Flag, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { storiesClient } from "./stories-client";
import { isStoryExpired } from "./story-validation";
import type { CustomerStory, StoryViewer as StoryViewerType } from "./story-types";
import { StoryProgress } from "./story-progress";

const STORY_SECONDS = 15;
const STORY_MS = STORY_SECONDS * 1000;
const BUBBLES_SECONDS = 4;

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
  const [elapsed, setElapsed] = useState(0);
  const [viewers, setViewers] = useState<StoryViewerType[]>([]);
  const [showBubbles, setShowBubbles] = useState(false);
  const [showViewerList, setShowViewerList] = useState(false);

  const currentIndex = story ? Math.max(0, stories.findIndex((item) => item.storyId === story.storyId)) : 0;
  const previous = stories[currentIndex - 1];
  const next = stories[currentIndex + 1];
  const isOwnStory = Boolean(story && ownSourceId && story.ownerSourceId === ownSourceId);

  const advance = useCallback((target: CustomerStory | undefined) => {
    if (target) onNavigate?.(target);
    else onClose();
  }, [onNavigate, onClose]);

  // Reset per-story state whenever the story changes.
  useEffect(() => { setFailed(false); setActionError(null); setElapsed(0); setViewers([]); setShowBubbles(false); setShowViewerList(false); }, [story?.storyId]);

  // Record a view when the current viewer opens someone else's story.
  useEffect(() => {
    if (!story || isOwnStory) return;
    const controller = new AbortController();
    void storiesClient.recordView(story.storyId).catch(() => { /* ignore */ });
    return () => controller.abort();
  }, [story?.storyId, isOwnStory]);

  // Fetch viewers when the owner opens their own story and show the bubbles.
  useEffect(() => {
    if (!story || !isOwnStory) return;
    const controller = new AbortController();
    void storiesClient.viewers(story.storyId, controller.signal)
      .then((data) => { setViewers(data); setShowBubbles(true); window.setTimeout(() => setShowBubbles(false), BUBBLES_SECONDS * 1000); })
      .catch(() => { /* ignore */ });
    return () => controller.abort();
  }, [story?.storyId, isOwnStory]);

  // Image: auto-advance after STORY_SECONDS. Video: advance on end (onEnded).
  useEffect(() => {
    if (!story || story.mediaType !== "image" || failed) return;
    const timer = window.setTimeout(() => advance(next), STORY_MS);
    return () => window.clearTimeout(timer);
  }, [story, next, failed, advance]);

  // Progress ticker for the active fill (uses STORY_MS as the span).
  useEffect(() => {
    if (!story || failed) return;
    const start = Date.now();
    const interval = window.setInterval(() => setElapsed(Date.now() - start), 100);
    return () => window.clearInterval(interval);
  }, [story?.storyId, failed]);

  useEffect(() => { if (!story) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [story, onClose]);
  useEffect(() => { if (!story || !isStoryExpired(story.expiresAt)) return; onClose(); }, [story, onClose]);

  const topViewers = useMemo(() => viewers.slice(0, 5), [viewers]);

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

  return <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/95 p-3" role="dialog" aria-modal="true" aria-label={`Story ${story.ownerLabel}`}>
    <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[24px] bg-slate-900">
      <div className="px-4 pb-2 pt-[max(1rem,var(--safe-area-top))]">
        <StoryProgress total={Math.max(stories.length, 1)} active={currentIndex} elapsed={elapsed} durationMs={STORY_MS} />
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-white">{story.ownerLabel}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-lg" className="text-white hover:bg-white/10 hover:text-white" onClick={() => void moderate(isOwnStory ? "delete" : "report")} disabled={busy} aria-label={isOwnStory ? "Hapus Story" : "Laporkan Story"}>
              {isOwnStory ? <Trash2 aria-hidden="true" /> : <Flag aria-hidden="true" />}
            </Button>
            <Button variant="ghost" size="icon-lg" className="text-white hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Tutup Story"><X aria-hidden="true" /></Button>
          </div>
        </div>
        {!isOwnStory ? <button type="button" onClick={() => void moderate("block")} disabled={busy} className="min-h-11 text-left text-[11px] font-semibold text-white/70 underline">Blokir Story dari customer ini</button> : null}
        {actionError ? <p role="alert" className="mt-1 text-xs text-red-200">{actionError}</p> : null}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <button type="button" aria-label="Story sebelumnya" className="absolute inset-y-0 left-0 z-10 w-1/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" onClick={() => advance(previous)}><ChevronLeft className="sr-only" /></button>
        {failed ? <div className="flex flex-col items-center gap-3 p-6 text-center text-white"><AlertCircle className="h-8 w-8" aria-hidden="true" /><p className="text-sm">Media Story tidak dapat dimuat.</p><Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => setFailed(false)}>Coba lagi</Button></div>
          : story.mediaType === "video"
            ? <video src={story.mediaUrl} autoPlay controls onEnded={() => advance(next)} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
            : <img src={story.mediaUrl} alt={`Story dari ${story.ownerLabel}`} onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />}
        <button type="button" aria-label="Story berikutnya" className="absolute inset-y-0 right-0 z-10 w-1/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white" onClick={() => advance(next)}><ChevronRight className="sr-only" /></button>

        {/* Viewers overlay (own story only): floating name bubbles + "X penonton" pill */}
        {isOwnStory ? (
          <AnimatePresence>
            {showBubbles && viewers.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-end justify-center gap-1.5 px-3 pb-3" aria-hidden="true">
                {topViewers.map((viewer, index) => (
                  <motion.span
                    key={`${viewer.sourceId}-${index}`}
                    initial={{ opacity: 0, y: 18, scale: 0.7 }}
                    animate={{ opacity: [0, 1, 1], y: [18, 0, -8, 0, -6], scale: [0.7, 1, 1.02, 1, 1] }}
                    exit={{ opacity: 0, y: -14, scale: 0.85, transition: { duration: 0.25 } }}
                    transition={{
                      delay: index * 0.14,
                      duration: 4,
                      times: [0, 0.2, 0.45, 0.7, 1],
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
                  >
                    {viewer.label}
                  </motion.span>
                ))}
              </div>
            ) : null}
          </AnimatePresence>
        ) : null}

        {/* Viewers accumulator pill (own story, clickable) */}
        {isOwnStory && viewers.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowViewerList(true)}
            className="absolute inset-x-4 bottom-3 z-20 flex items-center justify-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`${viewers.length} orang melihat Story ini. Ketuk untuk melihat daftar.`}
          >
            <EyeIcon /> {viewers.length} orang melihat
          </button>
        ) : null}
      </div>
    </div>

    {/* Viewers list sheet */}
    <AnimatePresence>
      {showViewerList ? (
        <motion.div className="fixed inset-0 z-[2100] flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowViewerList(false)}>
          <motion.div className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-t-[24px] bg-slate-900 p-4 text-white" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", damping: 28, stiffness: 240 }} onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black">Dilihat oleh</h2>
              <button type="button" onClick={() => setShowViewerList(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Tutup daftar penonton"><X className="h-4 w-4" /></button>
            </div>
            {viewers.length === 0 ? <p className="py-8 text-center text-sm text-white/60">Belum ada yang melihat Story ini.</p> : (
              <ul className="max-h-[48vh] overflow-y-auto">
                {viewers.map((viewer) => (
                  <li key={viewer.sourceId} className="flex items-center gap-3 border-b border-white/10 py-2.5 last:border-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1a5dc6] to-[#3aa6e0] text-xs font-black">{viewer.label.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{viewer.label}</span>
                    <span className="shrink-0 text-[11px] text-white/50">{timeAgo(viewer.viewedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  </div>;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function timeAgo(value: string): string {
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff) || diff < 0) return "baru saja";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
