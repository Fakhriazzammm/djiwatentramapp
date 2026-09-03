export interface Env {
  STORIES_BUCKET: R2Bucket;
  CUSTOMER_STORIES_KV: KVNamespace;
  AUTH_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  UPLOAD_SIGNING_SECRET: string;
}

type SessionUser = { id?: string; name?: string | null };
type R2StoryObject = { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } };

type StoryMetadata = {
  storyId: string;
  ownerSourceId: string;
  ownerLabel: string;
  mediaType: "image" | "video";
  contentType: string;
  createdAt: string;
  expiresAt: string;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 15;
const UPLOAD_TOKEN_SECONDS = 10 * 60;
const ALLOWED_TYPES = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/webm",
]);

function json(data: unknown, status = 200, origin?: string, headers?: HeadersInit) {
  const responseHeaders = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (origin) {
    responseHeaders.set("Access-Control-Allow-Origin", origin);
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.set("Vary", "Origin");
  }
  if (headers) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function allowedOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : undefined;
}

function corsPreflight(request: Request, env: Env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

async function authenticate(request: Request, env: Env): Promise<SessionUser | null> {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const response = await fetch(`${env.AUTH_ORIGIN.replace(/\/$/, "")}/api/auth/get-session`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { user?: SessionUser } | null;
  return payload?.user?.id ? payload.user : null;
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function signedToken(payload: Record<string, string>, secret: string): Promise<string> {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body, secret)}`;
}

async function verifyToken(token: string, secret: string): Promise<Record<string, string> | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body, secret);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  if (mismatch !== 0) return null;
  try { return JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Record<string, string>; } catch { return null; }
}

function normalizeExt(contentType: string): string {
  return contentType === "image/webp" ? "webp" : contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : contentType === "video/webm" ? "webm" : "mp4";
}

function metadataFromObject(object: R2StoryObject): StoryMetadata | null {
  const metadata = object.customMetadata ?? {};
  if (!metadata.storyId || !metadata.ownerSourceId || !metadata.expiresAt || !metadata.createdAt) return null;
  if (Date.parse(metadata.expiresAt) <= Date.now()) return null;
  return {
    storyId: metadata.storyId,
    ownerSourceId: metadata.ownerSourceId,
    ownerLabel: metadata.ownerLabel || "Member",
    mediaType: metadata.mediaType === "video" ? "video" : "image",
    contentType: metadata.contentType || object.httpMetadata?.contentType || "application/octet-stream",
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
  };
}

async function listStories(env: Env, viewerSourceId?: string): Promise<StoryMetadata[]> {
  const listed = await env.STORIES_BUCKET.list({ prefix: "stories/", limit: 1000 });
  const stories: StoryMetadata[] = [];
  for (const object of listed.objects) {
    const story = metadataFromObject(object as R2StoryObject);
    if (story) stories.push(story);
  }
  if (!viewerSourceId) return stories.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const blockedOwners = new Set((await Promise.all(stories.map((story) => env.CUSTOMER_STORIES_KV.get(`block:${viewerSourceId}:${story.ownerSourceId}`))))
    .map((value, index) => value ? stories[index].ownerSourceId : null).filter((value): value is string => Boolean(value)));
  return stories.filter((story) => !blockedOwners.has(story.ownerSourceId)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function routeParts(url: URL): string[] {
  return url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") return corsPreflight(request, env);
    if (request.headers.get("Origin") && !origin) return json({ error: "Origin tidak diizinkan." }, 403);

    try {
      const parts = routeParts(new URL(request.url));
      if (parts[0] !== "stories") return json({ error: "Endpoint tidak ditemukan." }, 404, origin);

      if (request.method === "PUT" && parts[1] === "upload" && parts[2]) {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const claims = await verifyToken(token, env.UPLOAD_SIGNING_SECRET);
        if (!claims || claims.storyId !== parts[2] || !claims.ownerSourceId || Number(claims.tokenExpiresAt) <= Date.now()) return json({ error: "Upload URL tidak valid atau sudah kedaluwarsa." }, 401, origin);
        const contentType = request.headers.get("Content-Type") || "";
        if (contentType !== claims.contentType || !ALLOWED_TYPES.has(contentType)) return json({ error: "Tipe media tidak sesuai." }, 415, origin);
        const size = Number(request.headers.get("Content-Length") || 0);
        const maxBytes = contentType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (!Number.isInteger(size) || size <= 0 || size > maxBytes) return json({ error: "Ukuran media melebihi batas." }, 413, origin);
        const body = request.body;
        if (!body) return json({ error: "Media kosong." }, 400, origin);
        const metadata: Record<string, string> = {
          storyId: claims.storyId,
          ownerSourceId: claims.ownerSourceId,
          ownerLabel: claims.ownerLabel || "Member",
          mediaType: claims.mediaType,
          contentType,
          createdAt: claims.createdAt,
          expiresAt: claims.expiresAt,
        };
        await env.STORIES_BUCKET.put(`stories/${claims.storyId}.${normalizeExt(contentType)}`, body, { httpMetadata: { contentType, cacheControl: "private, max-age=60" }, customMetadata: metadata });
        return json({ data: { storyId: claims.storyId, expiresAt: claims.expiresAt } }, 201, origin);
      }

      const user = await authenticate(request, env);
      if (!user) return json({ error: "Sesi customer tidak valid." }, 401, origin);

      if (request.method === "GET" && parts.length === 1) {
        const stories = await listStories(env, user.id);
        return json({ data: stories.map((story) => ({ ...story, mediaUrl: `${new URL(request.url).origin}/stories/${story.storyId}/media` })) }, 200, origin);
      }

      if (request.method === "POST" && parts[1] === "upload-url") {
        const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const mediaType = input?.mediaType === "video" ? "video" : input?.mediaType === "image" ? "image" : null;
        const contentType = typeof input?.contentType === "string" ? input.contentType : "";
        const sizeBytes = Number(input?.sizeBytes ?? input?.size);
        const durationSeconds = input?.durationSeconds == null ? undefined : Number(input.durationSeconds);
        const maxBytes = mediaType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (!mediaType || !ALLOWED_TYPES.has(contentType) || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes || (mediaType === "video" && (!Number.isFinite(durationSeconds) || (durationSeconds as number) > MAX_VIDEO_SECONDS))) return json({ error: "Media tidak memenuhi batas foto/video Story." }, 400, origin);
        if ((mediaType === "image" && !contentType.startsWith("image/")) || (mediaType === "video" && !contentType.startsWith("video/"))) return json({ error: "Tipe media tidak sesuai." }, 400, origin);
        const now = new Date();
        const createdAt = now.toISOString();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const storyId = crypto.randomUUID();
        const claims = { storyId, ownerSourceId: user.id as string, ownerLabel: (user.name || "Member").trim().split(/\s+/)[0]?.slice(0, 40) || "Member", mediaType, contentType, createdAt, expiresAt, tokenExpiresAt: String(Date.now() + UPLOAD_TOKEN_SECONDS * 1000) };
        const token = await signedToken(claims, env.UPLOAD_SIGNING_SECRET);
        return json({ data: { storyId, uploadUrl: `${new URL(request.url).origin}/stories/upload/${storyId}?token=${encodeURIComponent(token)}`, expiresAt, headers: { "Content-Type": contentType } } }, 200, origin);
      }

      if (parts[1] && request.method === "POST" && (parts[2] === "report" || parts[2] === "block")) {
        const story = (await listStories(env, user.id)).find((item) => item.storyId === parts[1]);
        if (!story) return json({ error: "Story tidak ditemukan atau sudah kedaluwarsa." }, 404, origin);
        if (story.ownerSourceId === user.id) return json({ error: "Aksi ini tidak dapat dilakukan pada Story sendiri." }, 400, origin);
        const key = parts[2] === "block" ? `block:${user.id}:${story.ownerSourceId}` : `report:${user.id}:${story.ownerSourceId}:${story.storyId}`;
        await env.CUSTOMER_STORIES_KV.put(key, parts[2] === "report" ? "reported" : "blocked", { expirationTtl: parts[2] === "report" ? 30 * 24 * 60 * 60 : 365 * 24 * 60 * 60 });
        return json({ data: { accepted: true } }, 202, origin);
      }

      if (parts[1] && parts[2] === "media" && request.method === "GET") {
        const story = (await listStories(env, user.id)).find((item) => item.storyId === parts[1]);
        if (!story) return json({ error: "Story tidak ditemukan atau sudah kedaluwarsa." }, 404, origin);
        const object = await env.STORIES_BUCKET.get(`stories/${story.storyId}.${normalizeExt(story.contentType)}`);
        if (!object) return json({ error: "Media Story tidak ditemukan." }, 404, origin);
        const headers = new Headers({ "Content-Type": story.contentType, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" });
        return new Response(object.body, { headers });
      }

      if (parts[1] && request.method === "DELETE") {
        const story = (await listStories(env, user.id)).find((item) => item.storyId === parts[1]);
        if (!story || story.ownerSourceId !== user.id) return json({ error: "Story tidak ditemukan." }, 404, origin);
        await env.STORIES_BUCKET.delete(`stories/${story.storyId}.${normalizeExt(story.contentType)}`);
        return json({ data: { storyId: story.storyId, deleted: true } }, 200, origin);
      }

      return json({ error: "Endpoint tidak ditemukan." }, 404, origin);
    } catch (error) {
      console.error("customer-stories worker error", error instanceof Error ? error.message : "unknown");
      return json({ error: "Layanan Story sedang mengalami gangguan." }, 500, origin);
    }
  },
};
