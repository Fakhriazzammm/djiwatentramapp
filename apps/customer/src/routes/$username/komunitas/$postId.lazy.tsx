import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Heart, Loader2, MessageCircle, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { CustomerBottomNav, CustomerHeader } from "@/components/customer/customer-shell";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { communityClient } from "@/features/community/community-client";
import type { CommunityComment, CommunityPost } from "@/features/community/community-types";

export const Route = createLazyFileRoute("/$username/komunitas/$postId")({ component: CommunityPostDetailPage });

function relativeTime(value: string) {
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms) || ms < 60_000) return "baru saja";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function CommunityPostDetailPage() {
  const { username, postId } = Route.useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async (withSkeleton = false) => {
    if (withSkeleton) setLoading(true);
    setError(null);
    try {
      const [nextPost, commentsPage] = await Promise.all([
        communityClient.get(postId),
        communityClient.listComments(postId),
      ]);
      setPost(nextPost);
      setComments(commentsPage.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Postingan belum dapat dimuat.");
    } finally {
      if (withSkeleton) setLoading(false);
      setCommentsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setCommentsLoading(false);
      return;
    }
    void load(true);
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    const timer = window.setInterval(refresh, 12_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isAuthenticated, load]);

  const toggleLike = async () => {
    if (!post || likePending) return;
    const nextLiked = !post.likedByMe;
    setLikePending(true);
    setPost((current) => current ? { ...current, likedByMe: nextLiked, likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)) } : current);
    try {
      const result = nextLiked ? await communityClient.like(post.id) : await communityClient.unlike(post.id);
      setPost((current) => current ? { ...current, likedByMe: result.liked, likeCount: Math.max(0, result.likeCount) } : current);
    } catch (reason) {
      setPost((current) => current ? { ...current, likedByMe: !nextLiked, likeCount: Math.max(0, current.likeCount + (nextLiked ? -1 : 1)) } : current);
      setError(reason instanceof Error ? reason.message : "Like belum berhasil disimpan.");
    } finally {
      setLikePending(false);
    }
  };

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!post || !body || commentSaving) return;
    setCommentSaving(true);
    setCommentError(null);
    try {
      const comment = await communityClient.addComment(post.id, body);
      setComments((current) => [...current, comment]);
      setCommentBody("");
      const confirmedPost = await communityClient.get(post.id);
      setPost(confirmedPost);
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : "Komentar belum berhasil dikirim.");
    } finally {
      setCommentSaving(false);
    }
  };

  const startEditComment = (comment: CommunityComment) => {
    setMenuCommentId(null);
    setEditingCommentId(comment.id);
    setEditingBody(comment.body);
    setCommentError(null);
  };

  const saveEditedComment = async (comment: CommunityComment) => {
    const body = editingBody.trim();
    if (!body || editSaving) return;
    setEditSaving(true);
    setCommentError(null);
    try {
      const updated = await communityClient.updateComment(postId, comment.id, body);
      setComments((current) => current.map((item) => item.id === comment.id ? updated : item));
      setEditingCommentId(null);
      setEditingBody("");
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : "Komentar belum berhasil diedit.");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteComment = async (comment: CommunityComment) => {
    if (deletingCommentId) return;
    if (!window.confirm("Hapus komentar ini?")) return;
    setDeletingCommentId(comment.id);
    setCommentError(null);
    try {
      await communityClient.removeComment(postId, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setPost((current) => current ? { ...current, commentCount: Math.max(0, current.commentCount - 1) } : current);
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : "Komentar belum berhasil dihapus.");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const backToCommunity = () => navigate({ to: "/$username/komunitas", params: { username } });
  const navItems = [
    { label: "Home", active: false, onSelect: () => navigate({ to: "/$username", params: { username } }), icon: <Djiwa3DIcon name="navigation-home" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Pesan", active: false, onSelect: () => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } }), icon: <Djiwa3DIcon name="navigation-order" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Komunitas", active: true, onSelect: backToCommunity, icon: <Djiwa3DIcon name="navigation-community" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Saldo", active: false, onSelect: () => navigate({ to: "/$username/saldo", params: { username } }), icon: <Djiwa3DIcon name="navigation-wallet" size="micro" alt="" className="h-5 w-5 object-contain" /> },
    { label: "Profil", active: false, onSelect: () => navigate({ to: "/$username/profile", params: { username } }), icon: <Djiwa3DIcon name="navigation-profile" size="micro" alt="" className="h-5 w-5 object-contain" /> },
  ];

  if (authLoading) return <CustomerSectionSkeleton label="Menyiapkan detail Komunitas Djiwa" />;
  if (!isAuthenticated || !customer) return <main className="mx-auto flex min-h-app max-w-md flex-col bg-background"><CustomerHeader title="Komunitas Djiwa" subtitle="Khusus Teman Djiwa" onBack={backToCommunity} leading={<ArrowLeft className="h-4 w-4" />} /><section className="m-4 rounded-3xl border border-border bg-card p-5 text-center shadow-sm"><p className="text-sm font-black">Masuk untuk melihat postingan</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Detail Komunitas hanya dapat dibuka oleh customer yang sudah login.</p><button type="button" className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground" onClick={() => navigate({ to: "/masuk" })}>Masuk / Daftar</button></section><CustomerBottomNav items={navItems} /></main>;

  return <main className="mx-auto flex min-h-app max-w-[654px] flex-col overflow-hidden rounded-[28px] bg-white pb-24">
    <CustomerHeader title="Detail Postingan" subtitle="Komunitas" onBack={backToCommunity} leading={<ArrowLeft className="h-4 w-4" />} />
    {loading ? <CustomerSectionSkeleton label="Memuat postingan" /> : error && !post ? <section className="p-5"><CustomerErrorState message={error} onRetry={() => void load(true)} /></section> : post ? <>
      <article className="border-b border-[#e5e5e5] px-5 py-6 sm:px-8" aria-label="Detail postingan">
        <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-base font-bold text-[#3156a3]">{post.author.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm"><p className="font-bold text-[#111111]">{post.author.username ? `@${post.author.username}` : post.author.name}</p><span className="text-[#969696]">{relativeTime(post.createdAt)}</span></div>{post.body ? <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.55] text-[#161616]">{post.body}</p> : null}{post.mediaUrl && post.mediaType === "image" ? <img src={post.mediaUrl} alt={`Kiriman dari ${post.author.name}`} className="mt-4 max-h-[620px] w-full rounded-xl object-cover" /> : null}{post.mediaUrl && post.mediaType === "video" ? <video src={post.mediaUrl} className="mt-4 max-h-[620px] w-full rounded-xl bg-black object-contain" controls playsInline preload="metadata" /> : null}<div className="mt-5 flex items-center gap-6"><button type="button" className={`flex min-h-11 items-center gap-2 rounded-xl text-sm transition-all active:scale-125 ${post.likedByMe ? "text-rose-500" : "hover:text-rose-500"}`} aria-label={post.likedByMe ? "Batal suka" : "Suka"} aria-pressed={post.likedByMe} aria-busy={likePending} disabled={likePending} onClick={() => void toggleLike}>{likePending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className="h-5 w-5" fill={post.likedByMe ? "currentColor" : "none"} />}<span>{likePending ? "Memproses…" : post.likeCount}</span></button><span className="flex min-h-11 items-center gap-2 text-sm text-[#3156a3]"><MessageCircle className="h-5 w-5" />{post.commentCount}</span></div></div></div>
      </article>
      <section className="flex-1 px-5 py-5 sm:px-8" aria-label="Daftar komentar"><h2 className="text-sm font-black text-[#111111]">Komentar ({post.commentCount})</h2>{commentsLoading ? <CustomerSectionSkeleton label="Memuat komentar" /> : comments.length ? <div className="mt-4 space-y-4">{comments.map((comment) => <div key={comment.id} className="flex gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-xs font-bold text-[#3156a3]">{comment.author.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-xs font-bold text-[#111111]">{comment.author.username ? `@${comment.author.username}` : comment.author.name}<span className="ml-2 font-normal text-[#969696]">{relativeTime(comment.createdAt)}</span></p>{comment.author.sourceId === customer.sourceId ? <div className="relative"><button type="button" className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[#8b929d] hover:bg-[#f1f3f5]" aria-label="Menu komentar" aria-expanded={menuCommentId === comment.id} onClick={() => setMenuCommentId((current) => current === comment.id ? null : comment.id)}><MoreHorizontal className="h-4 w-4" /></button>{menuCommentId === comment.id ? <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-lg"><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#333333] hover:bg-[#f7f8fa]" onClick={() => startEditComment(comment)}><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50" disabled={deletingCommentId === comment.id} onClick={() => void deleteComment(comment)}>{deletingCommentId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Hapus</button></div> : null}</div> : null}</div>{editingCommentId === comment.id ? <div className="mt-2 flex gap-2"><input value={editingBody} maxLength={500} onChange={(event) => setEditingBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveEditedComment(comment); if (event.key === "Escape") setEditingCommentId(null); }} className="min-h-10 min-w-0 flex-1 rounded-xl border border-[#3156a3] px-3 text-sm outline-none" autoFocus /><button type="button" className="rounded-xl bg-[#111111] px-3 text-xs font-bold text-white disabled:opacity-50" disabled={!editingBody.trim() || editSaving} onClick={() => void saveEditedComment(comment)}>{editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}</button></div> : <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#333333]">{comment.body}</p>}</div></div>)}</div> : <p className="mt-4 rounded-xl bg-[#f7f8fa] p-4 text-xs text-[#777777]">Belum ada komentar. Jadilah yang pertama.</p>}{error && post ? <p role="status" className="mt-4 text-xs font-semibold text-amber-600">Data terbaru belum tersinkron. Coba refresh beberapa saat lagi.</p> : null}</section>
      <section className="sticky bottom-0 border-t border-[#e5e5e5] bg-white/95 px-5 py-3 backdrop-blur sm:px-8"><label htmlFor="community-comment" className="sr-only">Tulis komentar</label><div className="flex gap-2"><input id="community-comment" value={commentBody} onChange={(event) => setCommentBody(event.target.value.slice(0, 500))} onKeyDown={(event) => { if (event.key === "Enter") void submitComment(); }} placeholder="Tulis komentar…" className="min-h-11 min-w-0 flex-1 rounded-full border border-[#dfe3e8] bg-white px-4 text-sm outline-none focus:border-[#3156a3]" /><button type="button" disabled={!commentBody.trim() || commentSaving} onClick={() => void submitComment()} className="flex min-h-11 items-center gap-1.5 rounded-full bg-[#111111] px-4 text-xs font-bold text-white disabled:bg-[#e8ebef] disabled:text-[#8f969e]">{commentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{commentSaving ? "Mengirim…" : "Kirim"}</button></div>{commentError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{commentError}</p> : null}</section>
    </> : null}
    <CustomerBottomNav items={navItems} />
  </main>;
}
