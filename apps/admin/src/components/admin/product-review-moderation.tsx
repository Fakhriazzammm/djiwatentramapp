import { Check, EyeOff, Flag, Loader2, MessageSquare, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

type ReviewStatus = "pending" | "published" | "reported" | "hidden";
type Review = {
  id: string;
  product_source_id: string;
  product_name?: string | null;
  rating: number;
  comment?: string | null;
  status: ReviewStatus;
  verified_purchase: boolean;
  created_at: string;
  updated_at?: string | null;
};
type ListResponse = { reviews?: Review[]; data?: Review[] };
type Action = "publish" | "hide" | "report";

const FILTERS: Array<{ value: ReviewStatus | "all"; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "reported", label: "Reported" },
  { value: "hidden", label: "Hidden" },
];

const statusLabel: Record<ReviewStatus, string> = {
  pending: "Pending",
  published: "Published",
  reported: "Reported",
  hidden: "Hidden",
};

const statusTone: Record<ReviewStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reported: "border-rose-200 bg-rose-50 text-rose-800",
  hidden: "border-slate-200 bg-slate-100 text-slate-700",
};

export function ProductReviewModeration() {
  const { token, isAdmin, role } = useYumiAuth();
  const canModerate = Boolean(token && (isAdmin || isAdminLevelRole(role?.name)));
  const [status, setStatus] = useState<ReviewStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ review: Review; action: Action } | null>(null);

  const load = useCallback(async () => {
    if (!canModerate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await invokeEdgeFunction<ListResponse>("product-reviews", {
        action: "list",
        status: status === "all" ? undefined : status,
        search: query.trim() || undefined,
      });
      setReviews(result.reviews ?? result.data ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gagal memuat moderation queue.");
    } finally {
      setLoading(false);
    }
  }, [canModerate, query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const visibleReviews = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return reviews;
    return reviews.filter((review) =>
      `${review.product_name ?? ""} ${review.product_source_id} ${review.comment ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [query, reviews]);

  const moderate = async () => {
    if (!confirm) return;
    const { review, action } = confirm;
    setConfirm(null);
    setActing(`${review.id}:${action}`);
    try {
      await invokeEdgeFunction("product-reviews", {
        action: "moderate",
        review_id: review.id,
        status: action === "publish" ? "published" : action === "hide" ? "hidden" : "reported",
      });
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, status: action === "publish" ? "published" : action === "hide" ? "hidden" : "reported" } : item));
      setSelected((current) => current?.id === review.id ? { ...current, status: action === "publish" ? "published" : action === "hide" ? "hidden" : "reported" } : current);
      toast.success(action === "publish" ? "Ulasan dipublikasikan." : action === "hide" ? "Ulasan disembunyikan." : "Ulasan ditandai untuk ditinjau.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Aksi moderasi gagal.");
    } finally {
      setActing(null);
    }
  };

  if (!canModerate) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Halaman ini hanya untuk admin yang berwenang.</div>;
  }

  return (
    <section className="space-y-4" aria-labelledby="review-moderation-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldAlert className="h-5 w-5" /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Moderation</p><h2 id="review-moderation-title" className="font-display text-xl font-extrabold tracking-tight">Ulasan produk</h2><p className="mt-1 text-sm text-muted-foreground">Tinjau ulasan terverifikasi tanpa menampilkan identitas customer atau detail pesanan.</p></div>
        </div>
        <Button type="button" variant="outline" className="min-h-11 gap-2 self-start rounded-xl" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Muat ulang</Button>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-xl pl-10" aria-label="Cari produk atau isi ulasan" placeholder="Cari produk atau isi ulasan…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Filter status ulasan">{FILTERS.map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={status === filter.value} onClick={() => setStatus(filter.value)} className={`min-h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold transition-colors ${status === filter.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>{filter.label}</button>)}</div>
      </div>

      {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><span>{error}</span><Button type="button" variant="outline" className="min-h-11 rounded-xl border-rose-300" onClick={() => void load()}>Coba lagi</Button></div>}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? <div className="space-y-3 p-4" aria-label="Memuat ulasan">{[1, 2, 3].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl border border-border p-4"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div></div>)}</div> : visibleReviews.length === 0 ? <div className="px-5 py-14 text-center"><MessageSquare className="mx-auto h-9 w-9 text-muted-foreground/50" /><h3 className="mt-3 font-display font-bold">Tidak ada ulasan di filter ini</h3><p className="mt-1 text-sm text-muted-foreground">Queue akan muncul setelah customer mengirim ulasan.</p></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Produk</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Isi</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Masuk</th><th className="px-4 py-3 text-right">Detail</th></tr></thead><tbody className="divide-y divide-border">{visibleReviews.map((review) => <ReviewRow key={review.id} review={review} onOpen={() => setSelected(review)} />)}</tbody></table></div><div className="divide-y divide-border md:hidden">{visibleReviews.map((review) => <ReviewCard key={review.id} review={review} onOpen={() => setSelected(review)} />)}</div></>}
      </div>

      {selected && <ReviewDetail review={selected} acting={acting} onClose={() => setSelected(null)} onAction={(action) => setConfirm({ review: selected, action })} />}
      <ConfirmationModal isOpen={Boolean(confirm)} title={confirm?.action === "publish" ? "Publikasikan ulasan?" : confirm?.action === "hide" ? "Sembunyikan ulasan?" : "Tandai sebagai reported?"} message="Perubahan ini memengaruhi visibilitas ulasan customer. Pastikan keputusan sesuai kebijakan moderasi." confirmText="Lanjutkan" variant={confirm?.action === "publish" ? "info" : "warning"} onClose={() => setConfirm(null)} onConfirm={() => void moderate()} />
    </section>
  );
}

function ReviewRow({ review, onOpen }: { review: Review; onOpen: () => void }) {
  return <tr className="transition-colors hover:bg-muted/30"><td className="max-w-48 px-4 py-3"><button type="button" className="min-h-11 text-left font-semibold hover:text-primary" onClick={onOpen}>{review.product_name || "Produk"}<span className="mt-1 block text-[11px] font-normal text-muted-foreground">Menu terverifikasi</span></button></td><td className="whitespace-nowrap px-4 py-3 font-semibold">{review.rating}/5</td><td className="max-w-xs px-4 py-3"><p className="truncate text-muted-foreground">{review.comment || "Rating tanpa komentar"}</p></td><td className="px-4 py-3"><StatusBadge status={review.status} /></td><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(review.created_at)}</td><td className="px-4 py-3 text-right"><Button type="button" variant="ghost" className="min-h-11 rounded-xl" onClick={onOpen}>Lihat</Button></td></tr>;
}

function ReviewCard({ review, onOpen }: { review: Review; onOpen: () => void }) {
  return <button type="button" className="flex min-h-[92px] w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30" onClick={onOpen}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="h-4 w-4" /></div><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{review.product_name || "Produk"}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">{review.comment || "Rating tanpa komentar"}</span><span className="mt-2 flex items-center gap-2"><StatusBadge status={review.status} /><span className="text-[11px] text-muted-foreground">{review.rating}/5 · {formatDate(review.created_at)}</span></span></span></button>;
}

function ReviewDetail({ review, acting, onClose, onAction }: { review: Review; acting: string | null; onClose: () => void; onAction: (action: Action) => void }) {
  const busy = acting?.startsWith(`${review.id}:`) ?? false;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="review-detail-title"><button type="button" aria-label="Tutup detail" className="absolute inset-0 cursor-default" onClick={onClose} /><div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] border border-border bg-card p-5 shadow-2xl sm:rounded-[24px]"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Detail moderasi</p><h3 id="review-detail-title" className="mt-1 font-display text-lg font-extrabold">{review.product_name || "Produk"}</h3></div><button type="button" className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="Tutup"><X className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Rating</p><p className="mt-1 font-display text-xl font-extrabold">{review.rating}/5</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Status</p><div className="mt-2"><StatusBadge status={review.status} /></div></div></div><div className="mt-4 rounded-xl border border-border p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Komentar customer</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{review.comment || "Customer memberikan rating tanpa komentar."}</p></div><p className="mt-3 text-xs text-muted-foreground">Pembelian terverifikasi · {formatDate(review.created_at)} · Identitas customer disembunyikan untuk menjaga privasi.</p><div className="mt-5 flex flex-wrap gap-2"><Button type="button" className="min-h-11 rounded-xl" disabled={busy || review.status === "published"} onClick={() => onAction("publish")}><Check className="mr-2 h-4 w-4" /> Publikasikan</Button><Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy || review.status === "hidden"} onClick={() => onAction("hide")}><EyeOff className="mr-2 h-4 w-4" /> Sembunyikan</Button><Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy || review.status === "reported"} onClick={() => onAction("report")}><Flag className="mr-2 h-4 w-4" /> Tandai reported</Button></div>{busy && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyimpan perubahan…</p>}</div></div>;
}

function StatusBadge({ status }: { status: ReviewStatus }) { return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[status]}`}>{statusLabel[status]}</span>; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
