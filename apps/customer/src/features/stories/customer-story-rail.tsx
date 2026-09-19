import { AlertCircle, Plus, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerStories } from "./use-customer-stories";
import { StoryAvatar } from "./story-avatar";
import type { CustomerStory } from "./story-types";
import { StoryUploadSheet } from "./story-upload-sheet";
import { StoryViewer } from "./story-viewer";

type StoryGroup = { ownerSourceId: string; ownerLabel: string; stories: CustomerStory[] };

const sortNewest = (a: CustomerStory, b: CustomerStory) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

export function CustomerStoryRail() {
  const { customer } = useCustomerAuth();
  const { stories, state, error, refresh } = useCustomerStories(Boolean(customer));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerStory, setViewerStory] = useState<CustomerStory | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set());

  // One avatar per owner: group stories by ownerSourceId, own group first.
  const groups = useMemo(() => {
    const map = new Map<string, CustomerStory[]>();
    for (const story of stories) {
      const list = map.get(story.ownerSourceId) ?? [];
      list.push(story);
      map.set(story.ownerSourceId, list);
    }
    const ownSourceId = customer?.sourceId;
    const list: StoryGroup[] = [];
    for (const [ownerSourceId, ownerStories] of map) {
      const sorted = [...ownerStories].sort(sortNewest);
      list.push({ ownerSourceId, ownerLabel: sorted[0]?.ownerLabel || "Member", stories: sorted });
    }
    // Own group first, then others by their most recent story.
    list.sort((a, b) => {
      if (a.ownerSourceId === ownSourceId) return -1;
      if (b.ownerSourceId === ownSourceId) return 1;
      return Date.parse(b.stories[0].createdAt) - Date.parse(a.stories[0].createdAt);
    });
    return list;
  }, [stories, customer?.sourceId]);

  const ownGroup = groups.find((group) => group.ownerSourceId === customer?.sourceId);
  const otherGroups = groups.filter((group) => group.ownerSourceId !== customer?.sourceId);

  // Playback order for the viewer: flatten groups so one owner's stories run
  // consecutively, then the next owner (Instagram behaviour).
  const orderedStories = useMemo(() => groups.flatMap((group) => group.stories), [groups]);

  const markSeen = useCallback((story: CustomerStory) => {
    setViewedIds((prev) => (prev.has(story.storyId) ? prev : new Set(prev).add(story.storyId)));
  }, []);

  const openGroup = useCallback((group: StoryGroup | undefined, own: boolean) => {
    if (!group || group.stories.length === 0) return;
    if (own && ownGroup === undefined) return;
    const first = group.stories[0];
    markSeen(first);
    setViewerStory(first);
  }, [markSeen, ownGroup]);

  const handleNavigate = useCallback((next: CustomerStory) => {
    markSeen(next);
    setViewerStory(next);
  }, [markSeen]);

  if (!customer) return null;

  const allGroupSeen = (group: StoryGroup) => group.stories.every((story) => viewedIds.has(story.storyId));

  return (
    <section className="min-w-0" aria-labelledby="customer-stories-title">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <h2 id="customer-stories-title" className="font-display text-[13px] font-extrabold">Story hari ini</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Cerita terbaru dari komunitas Djiwa</p>
        </div>
        {state === "error" ? (
          <button type="button" onClick={() => void refresh()} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-[11px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Coba lagi
          </button>
        ) : null}
      </div>

      {state === "disabled" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground" role="status">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />Story sedang disiapkan untuk akun ini.
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Memuat Story">
          <Skeleton className="h-14 w-[60px] shrink-0 rounded-full" />
          <Skeleton className="h-14 w-[60px] shrink-0 rounded-full" />
          <Skeleton className="h-14 w-[60px] shrink-0 rounded-full" />
        </div>
      ) : null}

      {state === "error" ? (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{error}</p>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-0.5 snap-x" tabIndex={0} aria-label="Daftar Story">
          <StoryAvatar own story={ownGroup?.stories[0]} onClick={() => (ownGroup ? openGroup(ownGroup, true) : setUploadOpen(true))} />
          {otherGroups.map((group) => {
            const seen = allGroupSeen(group);
            return (
              <StoryAvatar
                key={group.ownerSourceId}
                story={{ ...group.stories[0], viewed: seen }}
                onClick={() => openGroup(group, false)}
              />
            );
          })}
          {!ownGroup && otherGroups.length === 0 ? (
            <button type="button" onClick={() => setUploadOpen(true)} className="flex min-h-[56px] items-center gap-1.5 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="h-4 w-4" aria-hidden="true" /> Bagikan cerita pertamamu
            </button>
          ) : null}
        </div>
      ) : null}

      <StoryUploadSheet open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={() => void refresh()} />
      <StoryViewer story={viewerStory} stories={orderedStories} ownSourceId={customer.sourceId} onNavigate={handleNavigate} onClose={() => setViewerStory(null)} onChanged={() => void refresh()} />
    </section>
  );
}
