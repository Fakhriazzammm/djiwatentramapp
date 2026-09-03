import { Plus, Play } from "lucide-react";
import type { CustomerStory } from "./story-types";

type Props = { story?: CustomerStory; own?: boolean; onClick: () => void };

export function StoryAvatar({ story, own = false, onClick }: Props) {
  const label = own ? (story ? "Buka Story Anda" : "Tambah Story") : `Buka Story ${story?.ownerLabel ?? "customer"}`;
  return <button type="button" onClick={onClick} aria-label={label} className="group flex w-[68px] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className={`relative flex h-14 w-14 items-center justify-center rounded-full p-[2px] ${story ? "bg-primary" : "border-2 border-dashed border-primary/45 bg-primary/5"}`}>
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-primary">
        {story?.ownerPhotoUrl || (own && story?.mediaUrl) ? <img src={story.ownerPhotoUrl || story.mediaUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-lg font-black">{own ? <Plus aria-hidden="true" /> : story?.ownerLabel.slice(0, 1).toUpperCase()}</span>}
      </span>
      {story && !own ? <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" /></span> : null}
      {own && story ? <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"><Plus className="h-3 w-3" aria-hidden="true" /></span> : null}
    </span>
    <span className="max-w-full truncate text-[11px] font-bold text-foreground">{own ? "Story Anda" : story?.ownerLabel}</span>
  </button>;
}
