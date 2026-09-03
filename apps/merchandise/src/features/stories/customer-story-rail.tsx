import { AlertCircle, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerStories } from "./use-customer-stories";
import { StoryAvatar } from "./story-avatar";
import type { CustomerStory } from "./story-types";
import { StoryUploadSheet } from "./story-upload-sheet";
import { StoryViewer } from "./story-viewer";

export function CustomerStoryRail() {
  const { customer } = useCustomerAuth();
  const { stories, state, error, refresh } = useCustomerStories(Boolean(customer));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerStory, setViewerStory] = useState<CustomerStory | null>(null);
  const ownStory = useMemo(() => stories.find((story) => story.ownerSourceId === customer?.sourceId), [stories, customer?.sourceId]);
  const otherStories = stories.filter((story) => story.ownerSourceId !== customer?.sourceId);
  if (!customer) return null;
  return <section className="min-w-0" aria-labelledby="customer-stories-title">
    <div className="mb-2 flex items-center justify-between gap-3"><div><h2 id="customer-stories-title" className="font-display text-sm font-extrabold">Story hari ini</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Cerita terbaru dari komunitas Djiwa</p></div>{state === "error" ? <button type="button" onClick={() => void refresh()} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-[11px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Coba lagi</button> : null}</div>
    {state === "disabled" ? <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground" role="status"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />Story sedang disiapkan untuk akun ini.</div> : null}
    {state === "loading" ? <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Memuat Story"><Skeleton className="h-[74px] w-[68px] shrink-0 rounded-2xl" /><Skeleton className="h-[74px] w-[68px] shrink-0 rounded-2xl" /><Skeleton className="h-[74px] w-[68px] shrink-0 rounded-2xl" /></div> : null}
    {state === "error" ? <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{error}</p></div> : null}
    {state === "ready" ? <div className="no-scrollbar flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-1 snap-x" tabIndex={0} aria-label="Daftar Story">
      <StoryAvatar own story={ownStory} onClick={() => ownStory ? setViewerStory(ownStory) : setUploadOpen(true)} />
      {otherStories.map((story) => <StoryAvatar key={story.storyId} story={story} onClick={() => setViewerStory(story)} />)}
      {!ownStory && otherStories.length === 0 ? <button type="button" onClick={() => setUploadOpen(true)} className="flex min-h-[74px] items-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-3 text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="h-4 w-4" aria-hidden="true" /> Bagikan cerita pertamamu</button> : null}
    </div> : null}
    <StoryUploadSheet open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={() => void refresh()} />
    <StoryViewer story={viewerStory} stories={stories} ownSourceId={customer.sourceId} onNavigate={setViewerStory} onClose={() => setViewerStory(null)} onChanged={() => void refresh()} />
  </section>;
}
