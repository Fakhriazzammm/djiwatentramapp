// Panggilan API Reward KOL (auth-server, rute /api/admin-manager/kol-rewards) dan bentuk datanya.
import { useCallback, useEffect, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";

const API = String(import.meta.env.VITE_MANAGER_API_URL?.trim() || "https://api.djiwatentram.web.id").replace(/\/$/, "");

export type RewardRules = { ratePer1000: number; minViews: number; maxPerContent: number | null; maxPerKol: number | null; settleDays: number; platforms: string[] };
export type RewardCampaign = {
  id: number; slug: string; title: string; status: string; rewardsEnabled: boolean; businessId: number | null; businessName: string | null;
  ratePer1000: number | null; minViews: number; maxPerContent: number | null; maxPerKol: number | null; settleDays: number; platforms: string[];
  pendingApplications: number; funded: number; available: number; reserved: number; paid: number; refunded: number; slotsLeft: number | null; slotsTotal: number | null;
};
export type ReviewState = "paid" | "needs_date" | "waiting" | "due" | "ready";
export type RewardReview = {
  id: number; campaignId: number; campaignTitle: string; campaignSlug: string; kolId: string; kolName: string; kolUsername: string; platform: string;
  contentUrl: string; contentStatus: string; screenshotUrl: string | null; videoId: string | null; postedAt: string | null; dueAt: string | null; daysLeft: number | null;
  createdAt: string; state: ReviewState; views: number | null; viewsSource: string | null; viewsEvidence: string | null; viewsAt: string | null;
  estimate: number | null; computed: number | null; capped: boolean; rules: RewardRules; reserved: number;
  payout: { id: number; amount: number; views: number; computed: number; released: number; rate: number; paidAt: string } | null;
};
export type Business = { id: number; name: string; status: string; owner_customer_id: string | null; owner_name: string | null; owner_email: string | null; owner_balance: string | number };
export type RewardOverview = {
  campaigns: RewardCampaign[]; reviews: RewardReview[]; totals: { funded: number; available: number; reserved: number; paid: number; refunded: number };
  dueCount: number; waitingCount: number; attentionCount: number; estimatedNeed: number; alerts: Array<{ kind: string; title: string; body: string }>;
  businesses?: Business[]; feePercent?: number;
};
export type Deposit = { id: string; method: "mayar" | "djiwapay" | "manual"; nominal: string | number; fee: string | number; total: string | number; status: string; invoice_url: string | null; note: string | null; created_by: string; created_at: string; paid_at: string | null };
export type LedgerRow = { id: number; kind: string; available_delta: string | number; reserved_delta: string | number; paid_delta: string | number; refunded_delta: string | number; ref_type: string | null; ref_id: string | null; note: string | null; actor: string; created_at: string };
export type Integrity = { funded: number; available: number; reserved: number; paid: number; refunded: number; budgetBalanced: boolean; payoutTotal: number; walletCredited: number; walletMatches: boolean };
export type CampaignDetail = { campaign: RewardCampaign; deposits: Deposit[]; ledger: LedgerRow[]; integrity: Integrity; reviews: RewardReview[]; feePercent: number };

export const rupiah = (n: number | string) => `Rp${Math.round(Number(n)).toLocaleString("id-ID")}`;
export const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "–");
export const dateOnly = (v?: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "–");

export const REWARD_ERRORS: Record<string, string> = {
  INVALID_REWARD_RULES: "Aturan reward belum valid. Tarif dan maksimal per KOL wajib diisi.",
  CAMPAIGN_FULL: "Slot kampanye penuh. Isi anggaran lebih dulu.",
  REWARD_BUDGET_INSUFFICIENT: "Anggaran tidak cukup untuk mencadangkan KOL ini. Isi anggaran lebih dulu.",
  BUSINESS_WALLET_MISSING: "Hubungkan akun Djiwa Pay pemilik Bisnis lebih dulu.",
  INSUFFICIENT_BALANCE: "Saldo Djiwa Pay Bisnis tidak cukup.",
  PAYER_EMAIL_REQUIRED: "Pemilik Bisnis belum punya email untuk invoice QRIS.",
  PIN_INVALID: "PIN Djiwa Pay salah.", PIN_REQUIRED: "Masukkan PIN Djiwa Pay pemilik Bisnis.", PIN_LOCKED: "PIN terkunci sementara. Coba lagi nanti.", PIN_NOT_SET: "Pemilik Bisnis belum membuat PIN Djiwa Pay.",
  INVOICE_FAILED: "Invoice QRIS belum bisa dibuat. Coba lagi.", MAYAR_NOT_CONFIGURED: "Mayar belum dikonfigurasi di server.",
  NOTE_REQUIRED: "Catatan wajib diisi.", SETTLE_NOT_DUE: "Belum jatuh tempo. Reward dibayar setelah H+N dari tanggal tayang.",
  POSTED_AT_MISSING: "Tanggal tayang belum ada. Isi tanggal tayang dulu.", CONTENT_REJECTED: "Konten sudah ditolak.", KOL_NOT_LINKED: "Akun KOL belum terhubung ke Djiwa Pay.",
  RESERVE_INSUFFICIENT: "Cadangan anggaran tidak cukup untuk nominal ini.", CAMPAIGN_NOT_CLOSED: "Tutup kampanye lebih dulu sebelum mengembalikan sisa anggaran.",
  RESERVE_STILL_HELD: "Masih ada cadangan KOL yang belum dibayar.", CUSTOMER_NOT_FOUND: "Akun Djiwa Pay dengan email itu tidak ditemukan.", DATE_FROM_VIDEO_ID: "Tanggal tayang sudah terbaca dari ID video.",
};

export function useRewardApi() {
  const { token, isAdmin, role } = useYumiAuth();
  const canManage = Boolean(isAdmin || isAdminLevelRole(role?.name));
  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!token) throw new Error("Sesi admin tidak tersedia atau telah berakhir. Masuk ulang.");
    const response = await fetch(`${API}/api/admin-manager/kol-rewards${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(REWARD_ERRORS[String(data.error)] || String(data.error || `Permintaan gagal (${response.status})`));
    return (data.data !== undefined ? data.data : data) as T;
  }, [token]);
  return { call, canManage, ready: Boolean(token) };
}

export function useRewardOverview() {
  const { call, canManage, ready } = useRewardApi();
  const [data, setData] = useState<RewardOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!ready || !canManage) { setLoading(false); return; }
    setError("");
    try { setData(await call<RewardOverview>("")); } catch (e) { setError(e instanceof Error ? e.message : "Data reward belum bisa dimuat."); } finally { setLoading(false); }
  }, [call, canManage, ready]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, call, canManage };
}
