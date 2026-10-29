import type { CommunityProductSummary, CommunityPurchaseActivity, CommunityPurchaseActivityPage } from "./community-types";

export type CommunityMediaType = "image" | "video";

export type CommunityAuthor = {
  sourceId: string;
  name: string;
  username: string | null;
};

export type CommunityPost = {
  id: string;
  body: string | null;
  mediaType: CommunityMediaType | null;
  mediaContentType: string | null;
  mediaSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
  reportCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  followingByMe: boolean;
  author: CommunityAuthor;
  products: CommunityProductSummary[];
  mediaUrl: string | null;
};

export type CommunityUploadGrant = {
  postId: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

export type CommunityPage = {
  data: CommunityPost[];
  nextCursor: string | null;
};

export type CommunityComment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: CommunityAuthor;
};

export type CommunityCommentPage = {
  data: CommunityComment[];
  nextCursor: string | null;
};

export class CommunityClientError extends Error {}

const API_BASE = (import.meta.env.VITE_CUSTOMER_COMMUNITY_API_URL?.trim() || "/api/customer-community").replace(/\/$/, "");

function proxyPath(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${API_BASE}${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  const externalSignal = init?.signal;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null) as { error?: string } | null
      : null;
    if (!payload) throw new CommunityClientError("Endpoint Komunitas tidak mengembalikan JSON. Periksa proxy API Komunitas.");
    if (!response.ok || payload.error) throw new CommunityClientError(payload.error || `Komunitas gagal dimuat (HTTP ${response.status}).`);
    return payload as T;
  } catch (reason) {
    if (controller.signal.aborted && !externalSignal?.aborted) throw new CommunityClientError("Koneksi Komunitas terlalu lama. Coba lagi.");
    if (reason instanceof DOMException && reason.name === "AbortError") throw new CommunityClientError("Koneksi Komunitas dibatalkan. Coba lagi.");
    throw reason;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function mapPost(post: CommunityPost): CommunityPost {
  return {
    ...post,
    author: {
      ...post.author,
      name: post.author?.name || "Teman Djiwa",
      username: post.author?.username ?? null,
      sourceId: post.author?.sourceId || "unknown",
    },
    products: Array.isArray(post.products) ? post.products : [],
    mediaUrl: proxyPath(post.mediaUrl),
  };
}

export const communityClient = {
  async listProducts(signal?: AbortSignal): Promise<CommunityProductSummary[]> {
    const payload = await request<{ data: CommunityProductSummary[] }>("/products", { signal });
    return payload.data ?? [];
  },
  async listSaved(signal?: AbortSignal): Promise<CommunityPage> {
    const payload = await request<CommunityPage>("/saved", { signal });
    return { ...payload, data: (payload.data ?? []).map(mapPost) };
  },
  async listPurchaseActivity(cursor?: string, signal?: AbortSignal): Promise<CommunityPurchaseActivityPage> {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const payload = await request<CommunityPurchaseActivityPage>(`/activity?${params.toString()}`, { signal });
    return {
      activities: (payload.activities ?? []).map((activity) => ({
        ...activity,
        activityGroupKey: activity.activityGroupKey || `${activity.displayName}|${activity.orderSettledAt}`,
        productImageUrl: activity.productImageUrl,
        verified: activity.verified !== false,
      })),
      nextCursor: payload.nextCursor ?? null,
      hasMore: payload.hasMore === true && Boolean(payload.nextCursor),
    };
  },
  async list(cursor?: string, signal?: AbortSignal): Promise<CommunityPage> {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const payload = await request<CommunityPage>(`/posts?${params.toString()}`, { signal });
    return { ...payload, data: (payload.data ?? []).map(mapPost) };
  },
  async get(id: string): Promise<CommunityPost> {
    const payload = await request<{ data: CommunityPost }>(`/posts/${encodeURIComponent(id)}`);
    return mapPost(payload.data);
  },
  async createUploadGrant(input: { contentType: string; sizeBytes: number; durationSeconds?: number }): Promise<CommunityUploadGrant> {
    const payload = await request<{ data?: CommunityUploadGrant }>("/posts/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!payload.data?.uploadUrl || !payload.data.postId) throw new CommunityClientError("Respons upload Komunitas belum lengkap.");
    return { ...payload.data, uploadUrl: proxyPath(payload.data.uploadUrl) || payload.data.uploadUrl };
  },
  async upload(grant: CommunityUploadGrant, file: File): Promise<{ objectKey: string }> {
    const response = await fetch(grant.uploadUrl, { method: "PUT", headers: grant.headers, body: file, credentials: "include" });
    const payload = await response.json().catch(() => null) as { data?: { objectKey?: string }; error?: string } | null;
    if (!response.ok || !payload?.data?.objectKey) throw new CommunityClientError(payload?.error || "Upload media Komunitas gagal.");
    return { objectKey: payload.data.objectKey };
  },
  async create(input: { postId?: string; body?: string; mediaType?: "image" | "video"; mediaObjectKey?: string; mediaContentType?: string; mediaSizeBytes?: number; productSourceIds?: string[] }): Promise<CommunityPost> {
    const payload = await request<{ data: CommunityPost }>("/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    return mapPost(payload.data);
  },
  async remove(id: string): Promise<void> {
    await request(`/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async report(id: string, reason = "Konten tidak sesuai"): Promise<void> {
    await request(`/posts/${encodeURIComponent(id)}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
  },
  async like(id: string): Promise<{ liked: boolean; likeCount: number }> {
    const payload = await request<{ data: { liked: boolean; likeCount: number } }>(`/posts/${encodeURIComponent(id)}/like`, { method: "POST" });
    return payload.data;
  },
  async unlike(id: string): Promise<{ liked: boolean; likeCount: number }> {
    const payload = await request<{ data: { liked: boolean; likeCount: number } }>(`/posts/${encodeURIComponent(id)}/like`, { method: "DELETE" });
    return payload.data;
  },
  async save(id: string): Promise<{ saved: boolean }> {
    const payload = await request<{ data: { saved: boolean } }>(`/posts/${encodeURIComponent(id)}/save`, { method: "POST" });
    return payload.data;
  },
  async unsave(id: string): Promise<{ saved: boolean }> {
    const payload = await request<{ data: { saved: boolean } }>(`/posts/${encodeURIComponent(id)}/save`, { method: "DELETE" });
    return payload.data;
  },
  async follow(sourceId: string): Promise<{ following: boolean }> {
    const payload = await request<{ data: { following: boolean } }>(`/profile/${encodeURIComponent(sourceId)}/follow`, { method: "POST" });
    return payload.data;
  },
  async unfollow(sourceId: string): Promise<{ following: boolean }> {
    const payload = await request<{ data: { following: boolean } }>(`/profile/${encodeURIComponent(sourceId)}/follow`, { method: "DELETE" });
    return payload.data;
  },
  async listComments(id: string): Promise<CommunityCommentPage> {
    return request<CommunityCommentPage>(`/posts/${encodeURIComponent(id)}/comments?limit=50`);
  },
  async addComment(id: string, body: string): Promise<CommunityComment> {
    const payload = await request<{ data: CommunityComment }>(`/posts/${encodeURIComponent(id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    return payload.data;
  },
  async removeComment(postId: string, commentId: string): Promise<void> {
    await request(`/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
  },
  async updateComment(postId: string, commentId: string, body: string): Promise<CommunityComment> {
    const payload = await request<{ data: CommunityComment }>(`/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    return payload.data;
  },
};
