import type { CustomerStory, StoryListResponse, StoryUploadGrant, StoryUploadInput, StoryViewer, StoryViewersResponse } from "./story-types";

const API_BASE = (import.meta.env.VITE_CUSTOMER_STORIES_API_URL?.trim() || "/api/customer-stories").replace(/\/$/, "");

function proxyPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${API_BASE}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export class StoriesClientError extends Error {
  constructor(message: string, public readonly disabled = false) { super(message); }
}

function requireApi(): string {
  if (!API_BASE) throw new StoriesClientError("Story belum tersedia di aplikasi ini.", true);
  return API_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${requireApi()}${path}`, { credentials: "include", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new StoriesClientError(payload?.error || "Story belum dapat dimuat.");
  return payload as T;
}

export const storiesClient = {
  isConfigured: Boolean(API_BASE),
  async list(signal?: AbortSignal): Promise<CustomerStory[]> {
    const payload = await request<StoryListResponse>("/stories", { signal });
    return (payload.data ?? []).filter((story) => Date.parse(story.expiresAt) > Date.now()).map((story) => ({ ...story, mediaUrl: proxyPath(story.mediaUrl) }));
  },
  async createUploadGrant(input: StoryUploadInput): Promise<StoryUploadGrant> {
    const payload = await request<{ data?: StoryUploadGrant }>("/stories/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaType: input.mediaType, contentType: input.file.type, size: input.file.size, durationSeconds: input.durationSeconds }),
    });
    if (!payload.data?.uploadUrl || !payload.data.storyId) throw new StoriesClientError("Respons upload belum lengkap.");
    return { ...payload.data, uploadUrl: proxyPath(payload.data.uploadUrl) };
  },
  async upload(grant: StoryUploadGrant, file: File): Promise<void> {
    const response = await fetch(grant.uploadUrl, { method: "PUT", headers: grant.headers, body: file });
    if (!response.ok) throw new StoriesClientError("Upload Story gagal. Coba lagi.");
  },
  async moderate(storyId: string, action: "report" | "block"): Promise<void> {
    await request(`/stories/${encodeURIComponent(storyId)}/${action}`, { method: "POST" });
  },
  async delete(storyId: string): Promise<void> {
    await request(`/stories/${encodeURIComponent(storyId)}`, { method: "DELETE" });
  },
  async recordView(storyId: string): Promise<boolean> {
    const payload = await request<{ data?: { recorded?: boolean } }>(`/stories/${encodeURIComponent(storyId)}/view`, { method: "POST" });
    return Boolean(payload.data?.recorded);
  },
  async viewers(storyId: string, signal?: AbortSignal): Promise<StoryViewer[]> {
    const payload = await request<StoryViewersResponse>(`/stories/${encodeURIComponent(storyId)}/views`, { signal });
    return payload.data ?? [];
  },
};
