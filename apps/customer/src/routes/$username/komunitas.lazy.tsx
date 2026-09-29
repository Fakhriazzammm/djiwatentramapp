import { createLazyFileRoute, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BadgeCheck, Heart, ImagePlus, Loader2, MessageCircle, MoreHorizontal, Plus, RefreshCw, Send, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { CustomerBottomNav, CustomerHeader } from "@/components/customer/customer-shell";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { CommunityClientError, communityClient } from "@/features/community/community-client";
import type { CommunityPost, CommunityPurchaseActivity } from "@/features/community/community-types";

export const Route = createLazyFileRoute("/$username/komunitas")({ component: CommunityPage });

const MAX_BODY_LENGTH = 1000;
const MAX_VIDEO_SECONDS = 60;

function relativeTime(value: string) {
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms) || ms < 60_000) return "baru saja";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration); };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Video tidak dapat dibaca.")); };
    video.src = url;
  });
}

function PostCard({ post, currentSourceId, onDelete, onReport, onOpen }: { post: CommunityPost; currentSourceId?: string; onDelete: (post: CommunityPost) => void; onReport: (post: CommunityPost) => void; onOpen: (post: CommunityPost) => void }) {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  useEffect(() => {
    setLiked(post.likedByMe);
    setLikeCount(post.likeCount);
  }, [post.id, post.likedByMe, post.likeCount]);
  const isOwner = currentSourceId === post.author.sourceId;
  const displayName = post.author.username ? `@${post.author.username}` : post.author.name;

  const toggleLike = async () => {
    if (likePending) return;
    const nextLiked = !liked;
    setLikePending(true);
    setLikeError(null);
    setLiked(nextLiked);
    setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
    try {
      const result = nextLiked ? await communityClient.like(post.id) : await communityClient.unlike(post.id);
      setLiked(result.liked);
      setLikeCount(Math.max(0, result.likeCount));
    } catch (reason) {
      setLiked(!nextLiked);
      setLikeCount((count) => Math.max(0, count + (nextLiked ? -1 : 1)));
      setLikeError(reason instanceof Error ? reason.message : "Like belum berhasil disimpan.");
    } finally {
      setLikePending(false);
    }
  };

  return (
    <article className="relative border-b border-[#e5e5e5] bg-white px-3 py-3 sm:px-5" aria-label={`Postingan ${displayName}`}>
      <div className="flex items-start gap-2.5">
        <div className="relative h-9 w-9 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8eefb] text-sm font-bold text-[#3156a3]" aria-hidden="true">{post.author.name.slice(0, 1).toUpperCase()}</div>
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-black text-sm font-medium leading-none text-white" aria-hidden="true">+</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5"><p className="truncate font-bold text-[#111111]">{displayName}</p><span className="shrink-0 text-xs text-[#969696]">{relativeTime(post.createdAt)}</span></div>
            <div className="relative -mr-2 -mt-2"><button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-[#777777] hover:bg-[#f5f5f5]" aria-label="Aksi postingan" onClick={() => setOpen((value) => !value)}><MoreHorizontal className="h-5 w-5" /></button>{open ? <div className="absolute right-0 top-10 z-10 w-44 rounded-xl border border-[#e2e2e2] bg-white p-1 shadow-lg">{isOwner ? <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50" onClick={() => { setOpen(false); onDelete(post); }}>Hapus postingan</button> : <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-[#f5f5f5]" onClick={() => { setOpen(false); onReport(post); }}>Laporkan postingan</button>}</div> : null}</div>
          </div>
          {post.body ? <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-[1.4] text-[#161616]">{post.body}</p> : null}
          {post.mediaUrl && post.mediaType === "image" ? <img src={post.mediaUrl} alt={`Kiriman dari ${post.author.name}`} className="mt-2 max-h-[300px] w-full rounded-lg bg-[#f7f7f7] object-contain sm:max-h-[380px]" loading="lazy" /> : null}
          {post.mediaUrl && post.mediaType === "video" ? <video src={post.mediaUrl} className="mt-2 max-h-[300px] w-full rounded-lg bg-black object-contain sm:max-h-[380px]" controls playsInline preload="metadata" /> : null}
          <div className="mt-2 flex items-center gap-4 text-[#333333] sm:gap-6">
            <button type="button" className={`flex min-h-10 items-center gap-1.5 rounded-lg text-sm transition-all active:scale-125 ${liked ? "text-rose-500" : "hover:text-rose-500"}`} aria-label={liked ? "Batal suka" : "Suka"} aria-pressed={liked} aria-busy={likePending} disabled={likePending} onPointerUp={() => void toggleLike()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void toggleLike(); } }}><Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} strokeWidth={1.8} /><span>{likeCount}</span></button>
            <button type="button" className="flex min-h-10 items-center gap-1.5 rounded-lg text-sm transition-all active:scale-110 hover:text-[#3156a3]" aria-label="Buka komentar postingan" onClick={() => onOpen(post)}><MessageCircle className="h-5 w-5" strokeWidth={1.8} /><span>{post.commentCount}</span></button>
          </div>
          {likeError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{likeError}</p> : null}
        </div>
      </div>
    </article>
  );
}

type GroupedPurchaseActivity = CommunityPurchaseActivity & { products: CommunityPurchaseActivity[] };

function PurchaseActivityCard({ activity, onOpenProduct }: { activity: GroupedPurchaseActivity; onOpenProduct: (activity: CommunityPurchaseActivity) => void }) {
  return (
    <article className="border-b border-[#e5e5e5] bg-white px-3 py-2 sm:px-5" aria-label={`Aktivitas Teman Djiwa ${activity.productName}`}>
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[11px] font-black text-[#3156a3]">T</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[12px] leading-4"><p className="font-bold text-[#111111]">Teman Djiwa</p><BadgeCheck className="h-3 w-3 text-cyan-600" aria-label="Pembelian terverifikasi" /><span className="text-[11px] text-[#969696]">· {relativeTime(activity.orderSettledAt)}</span></div>
          <div className="mt-0.5 flex items-center gap-2"><p className="min-w-0 truncate text-[12px] leading-4 text-[#161616]">baru saja membeli <span className="font-bold">{activity.products.map((product) => product.productName).join(", ")}</span></p>{activity.productImageUrl ? <img src={activity.productImageUrl} alt="" className="h-8 w-8 shrink-0 rounded-md bg-slate-100 object-contain p-0.5" loading="lazy" /> : <div className="h-8 w-8 shrink-0 rounded-md bg-gradient-to-br from-violet-100 to-cyan-100" aria-hidden="true" />}<button type="button" className="min-h-7 shrink-0 rounded-md border border-[#3156a3]/20 px-2 text-[9px] font-bold text-[#3156a3] hover:bg-[#e8eefb]" onClick={() => onOpenProduct(activity)}>Lihat <ArrowRight className="ml-0.5 inline h-2.5 w-2.5" /></button>
          </div>
        </div>
      </div>
    </article>
  );
}

function CommunityPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const matches = useMatches();
  const isPostDetail = matches.some((match) => match.routeId === "/$username/komunitas/$postId");
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [activities, setActivities] = useState<CommunityPurchaseActivity[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"for-you" | "posts" | "activity">("for-you");
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (nextCursor?: string, signal?: AbortSignal) => {
    const page = await communityClient.list(nextCursor, signal);
    setPosts((current) => nextCursor ? [...current, ...page.data.filter((item) => !current.some((existing) => existing.id === item.id))] : page.data);
    setCursor(page.nextCursor);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null);
    void load(undefined, controller.signal).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Komunitas belum dapat dimuat."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isAuthenticated, load]);

  const loadActivities = useCallback(async (nextCursor?: string, signal?: AbortSignal) => {
    const page = await communityClient.listPurchaseActivity(nextCursor, signal);
    setActivities((current) => nextCursor ? [...current, ...page.activities.filter((item) => !current.some((existing) => existing.id === item.id))] : page.activities);
    setActivityCursor(page.hasMore ? page.nextCursor : null);
  }, []);

  const refreshFeed = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([load(), loadActivities()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) { setActivityLoading(false); return; }
    const controller = new AbortController();
    setActivityLoading(true); setActivityError(null);
    void loadActivities(undefined, controller.signal).catch((reason) => { if (!controller.signal.aborted) setActivityError(reason instanceof Error ? reason.message : "Aktivitas pembelian belum dapat dimuat."); }).finally(() => { if (!controller.signal.aborted) setActivityLoading(false); });
    return () => controller.abort();
  }, [isAuthenticated, loadActivities]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const navItems = useMemo(() => [
    { label: "Home", active: false, onSelect: () => navigate({ to: "/$username", params: { username } }), icon: <Djiwa3DIcon name="navigation-home" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Pesan", active: false, onSelect: () => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } }), icon: <Djiwa3DIcon name="navigation-order" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Komunitas", active: true, onSelect: () => {}, icon: <Djiwa3DIcon name="navigation-community" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Saldo", active: false, onSelect: () => navigate({ to: "/$username/saldo", params: { username } }), icon: <Djiwa3DIcon name="navigation-wallet" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Profil", active: false, onSelect: () => navigate({ to: "/$username/profile", params: { username } }), icon: <Djiwa3DIcon name="navigation-profile" size="micro" alt="" className="h-5 w-5 object-contain" /> },
  ], [navigate, username]);

  const selectFile = async (next: File | undefined) => {
    if (!next) return;
    setNotice(null);
    if (next.type.startsWith("image/") && next.size > 5 * 1024 * 1024) { setNotice("Foto maksimal 5 MB."); return; }
    if (next.type.startsWith("video/")) {
      if (next.size > 50 * 1024 * 1024) { setNotice("Video maksimal 50 MB."); return; }
      try {
        const duration = await readVideoDuration(next);
        if (duration > MAX_VIDEO_SECONDS) { setNotice("Video maksimal 60 detik."); return; }
        setDurationSeconds(duration);
      } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Video tidak valid."); return; }
    } else setDurationSeconds(undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next); setPreviewUrl(URL.createObjectURL(next));
  };

  const clearFile = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(null); setDurationSeconds(undefined); if (fileRef.current) fileRef.current.value = ""; };

  const submit = async () => {
    if ((!body.trim() && !file) || saving) return;
    setSaving(true); setNotice(null);
    try {
      let media: { postId: string; objectKey: string; mediaType: "image" | "video"; mediaContentType: string; mediaSizeBytes: number } | undefined;
      if (file) {
        const grant = await communityClient.createUploadGrant({ contentType: file.type, sizeBytes: file.size, durationSeconds });
        const uploadResult = await communityClient.upload(grant, file);
        media = { postId: grant.postId, objectKey: uploadResult.objectKey, mediaType: file.type.startsWith("video/") ? "video" : "image", mediaContentType: file.type, mediaSizeBytes: file.size };
      }
      const post = await communityClient.create({ postId: media?.postId, body: body.trim() || undefined, mediaType: media?.mediaType, mediaObjectKey: media?.objectKey, mediaContentType: media?.mediaContentType, mediaSizeBytes: media?.mediaSizeBytes });
      setPosts((current) => [post, ...current]); setBody(""); clearFile(); setNotice("Postingan berhasil dibagikan.");
    } catch (reason) { setNotice(reason instanceof CommunityClientError ? reason.message : "Postingan belum berhasil dibagikan."); }
    finally { setSaving(false); }
  };

  const deletePost = async (post: CommunityPost) => { if (!window.confirm("Hapus postingan ini?")) return; try { await communityClient.remove(post.id); setPosts((current) => current.filter((item) => item.id !== post.id)); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Post belum dapat dihapus."); } };
  const reportPost = async (post: CommunityPost) => { try { await communityClient.report(post.id); setNotice("Laporan sudah diterima Admin."); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Post belum dapat dilaporkan."); } };

  const groupedActivities = useMemo(() => {
    const groups = new Map<string, GroupedPurchaseActivity>();
    for (const activity of activities) {
      const key = `${activity.displayName}|${activity.orderSettledAt}`;
      const current = groups.get(key);
      if (current) current.products.push(activity);
      else groups.set(key, { ...activity, products: [activity] });
    }
    return Array.from(groups.values());
  }, [activities]);

  const timelineItems = useMemo(() => {
    const items = [
      ...(feedFilter !== "posts" ? groupedActivities.map((item) => ({ kind: "activity" as const, at: item.orderSettledAt, item })) : []),
      ...(feedFilter !== "activity" ? posts.map((item) => ({ kind: "post" as const, at: item.createdAt, item })) : []),
    ];
    return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [feedFilter, groupedActivities, posts]);

  if (isPostDetail) return <Outlet />;
  if (authLoading) return <CustomerSectionSkeleton label="Menyiapkan Komunitas Djiwa" />;
  if (!isAuthenticated || !customer) return <main className="mx-auto flex min-h-app max-w-md flex-col bg-background"><CustomerHeader title="Komunitas Djiwa" subtitle="Khusus Teman Djiwa" onBack={() => navigate({ to: "/$username", params: { username } })} leading={<ArrowLeft className="h-4 w-4" />} /><section className="m-4 rounded-3xl border border-border bg-card p-5 text-center shadow-sm"><p className="text-sm font-black">Masuk untuk membuka Komunitas</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Komunitas Djiwa hanya dapat dibaca dan digunakan oleh customer yang sudah login.</p><button type="button" className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground" onClick={() => navigate({ to: "/masuk" })}>Masuk / Daftar</button></section>{!composerOpen ? <button type="button" className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3156a3] text-white shadow-lg sm:right-6" onClick={() => setComposerOpen(true)} aria-label="Buat postingan Komunitas"><Plus className="h-5 w-5" /></button> : null}<CustomerBottomNav items={navItems} /></main>;

  return <main className="mx-auto flex min-h-app max-w-[654px] flex-col overflow-hidden rounded-[28px] bg-white pb-24"><CustomerHeader title="Komunitas" subtitle="Tempat berbagi cerita Teman Djiwa" onBack={() => navigate({ to: "/$username", params: { username } })} leading={<ArrowLeft className="h-4 w-4" />} /><div className="sticky top-0 z-20 flex items-center gap-1 overflow-x-auto border-b border-[#e5e5e5] bg-white/95 px-3 py-2 backdrop-blur" role="tablist" aria-label="Filter feed Komunitas">{([["for-you", "Untuk Kamu"], ["posts", "Postingan"], ["activity", "Teman Djiwa"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={feedFilter === value} onClick={() => setFeedFilter(value)} className={`min-h-9 shrink-0 rounded-full px-3 text-[11px] font-black transition ${feedFilter === value ? "bg-[#3156a3] text-white" : "text-[#667085] hover:bg-[#f3f6fb]"}`}>{label}</button>)}<button type="button" aria-label="Refresh feed Komunitas" onClick={() => void refreshFeed()} className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#3156a3] hover:bg-[#f3f6fb]" disabled={refreshing}>{<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />}</button></div>
    {composerOpen ? (
      <>    <section className="border-b border-[#e5e5e5] px-5 py-4 sm:px-8"><div className="flex items-start gap-3"><div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-base font-bold text-[#3156a3]">{(customer.name || "M").slice(0, 1).toUpperCase()}</div><textarea value={body} onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY_LENGTH))} placeholder="Apa yang ingin kamu bagikan?" rows={2} className="min-h-12 flex-1 resize-none bg-transparent py-2 text-[16px] outline-none placeholder:text-[#999999]" aria-label="Isi postingan Komunitas" /></div><div className="mt-2 flex items-center justify-between gap-2 pl-14"><div className="flex items-center gap-1"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" onChange={(event) => void selectFile(event.target.files?.[0])} /><button type="button" className="flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-primary hover:bg-primary/10" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> Foto / Video</button><span className="text-[10px] text-muted-foreground">{body.length}/{MAX_BODY_LENGTH}</span></div><button type="button" disabled={saving || (!body.trim() && !file)} className={`flex min-h-10 items-center gap-1.5 rounded-full px-5 text-sm font-bold transition-colors ${saving || (!body.trim() && !file) ? "bg-[#e8ebef] text-[#8f969e]" : "bg-[#111111] text-white hover:bg-[#333333]"}`} onClick={() => void submit()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post</button></div>{previewUrl ? <div className="relative mt-3 overflow-hidden rounded-xl bg-[#f1f1f1]">{file?.type.startsWith("video/") ? <video src={previewUrl} className="max-h-60 w-full object-contain" controls /> : <img src={previewUrl} alt="Preview media" className="max-h-60 w-full object-contain" />}<button type="button" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white" aria-label="Hapus media" onClick={clearFile}><X className="h-4 w-4" /></button></div> : null}{notice ? <p role="status" className="mt-2 text-xs font-semibold text-primary">{notice}</p> : null}<button type="button" className="mt-2 min-h-8 text-[10px] font-bold text-muted-foreground hover:text-foreground" onClick={() => setComposerOpen(false)}>Tutup composer</button></section></>
    ) : (
      <button type="button" className="mx-3 my-2 flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-white px-3 text-left shadow-sm sm:mx-5" onClick={() => setComposerOpen(true)} aria-label="Buat postingan Komunitas">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8eefb] text-xs font-black text-[#3156a3]">{(customer.name || "T").slice(0, 1).toUpperCase()}</div>
        <span className="flex-1 text-xs text-muted-foreground">Apa yang ingin kamu bagikan?</span><Plus className="h-4 w-4 text-[#3156a3]" />
      </button>
    )}
    <section className="mt-0" aria-label="Feed Komunitas">{timelineItems.slice(0, 20).map((entry) => entry.kind === "activity" ? <PurchaseActivityCard key={`activity-${entry.item.id}`} activity={entry.item} onOpenProduct={(item) => { window.location.assign(`/${encodeURIComponent(username)}/order?step=table&product_source_id=${encodeURIComponent(item.productSourceId)}`); }} /> : <PostCard key={`post-${entry.item.id}`} post={entry.item} currentSourceId={customer.sourceId} onDelete={deletePost} onReport={reportPost} onOpen={(post) => navigate({ to: "/$username/komunitas/$postId", params: { username, postId: post.id } })} />)}{loading ? <CustomerSectionSkeleton label="Memuat postingan Komunitas" /> : error ? <CustomerErrorState message={error} onRetry={() => { setLoading(true); void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Gagal memuat.")).finally(() => setLoading(false)); }} /> : timelineItems.length === 0 ? <div className="rounded-[22px] border border-dashed border-border p-6 text-center"><p className="text-sm font-black">Belum ada cerita di Komunitas Djiwa</p><p className="mt-1 text-xs text-muted-foreground">Jadilah yang pertama berbagi dengan Teman Djiwa.</p></div> : null}</section><div className="flex flex-wrap justify-center gap-2 px-3 py-3">{cursor && feedFilter !== "activity" && !loading ? <button type="button" disabled={loadingMore} className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-xs font-black" onClick={() => { setLoadingMore(true); void load(cursor).finally(() => setLoadingMore(false)); }}>{loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Muat postingan berikutnya</button> : null}{activityCursor && feedFilter !== "posts" ? <button type="button" disabled={activityLoading} className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-xs font-black" onClick={() => { setActivityLoading(true); void loadActivities(activityCursor).finally(() => setActivityLoading(false)); }}>{activityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Muat aktivitas berikutnya</button> : null}</div><CustomerBottomNav items={navItems} /></main>;
}
