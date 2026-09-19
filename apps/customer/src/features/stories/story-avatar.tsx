import { Check, Plus, Play } from "lucide-react";
import type { CustomerStory } from "./story-types";

type Props = { story?: CustomerStory; own?: boolean; onClick: () => void };

// Instagram-style story ring. Online/unseen uses a vibrant conic gradient in the
// Djiwa brand palette (deep azure -> violet -> cyan). Viewed stories degrade to a
// muted gray ring, exactly like Instagram. No gold/amber/yellow/orange.
const GRADIENT = "conic-gradient(from 210deg, #1a5dc6, #7c5ce0, #3aa6e0, #1a5dc6)";
const VIEWED_RING = "border-b-[3px] border-white/60";

export function StoryAvatar({ story, own = false, onClick }: Props) {
  const label = own ? (story ? "Cerita Anda" : "Cerita Anda") : story?.ownerLabel ?? "Story";
  const ringClass = story && story.viewed ? VIEWED_RING : "";
  const ringStyle = story && !story.viewed ? { background: GRADIENT } : undefined;
  const innerBorder = story && story.viewed ? "border-[3px] border-muted/70" : "border-[3px] border-background";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={own ? "Cerita Anda" : `Buka Story ${story?.ownerLabel ?? "customer"}`}
      className="group flex w-[60px] shrink-0 snap-start flex-col items-center gap-1 rounded-2xl p-0.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`relative h-14 w-14 rounded-full p-[2.5px] ${ringClass}`} style={ringStyle}>
        <span className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${innerBorder} bg-muted text-primary`}>
          {story?.ownerPhotoUrl ? (
            <img src={story.ownerPhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : own && story?.mediaUrl ? (
            <img src={story.mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-base font-black">
              {own ? <Plus aria-hidden="true" /> : story?.ownerLabel.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>

        {/* Seen checkmark badge (Instagram) */}
        {story && !own && story.viewed ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted-foreground text-background">
            <Check aria-hidden="true" />
          </span>
        ) : null}

        {/* Play badge for an unseen/own story */}
        {story && !own && !story.viewed ? (
          <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
          </span>
        ) : null}

        {/* Plus badge for the current user's story */}
        {own && story ? (
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
            <Plus className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate text-[10px] font-bold text-foreground">{label}</span>
      {own && story && (story.viewerCount ?? 0) > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black text-foreground">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {story.viewerCount}
        </span>
      ) : null}
    </button>
  );
}
