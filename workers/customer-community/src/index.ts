export interface Env {
  COMMUNITY_BUCKET: R2Bucket;
  AUTH_ORIGIN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGINS: string;
  UPLOAD_SIGNING_SECRET: string;
}

type SessionUser = { id?: string; name?: string | null };
type PostRow = {
  id: string;
  author_source_id: string;
  body: string | null;
  media_type: "image" | "video" | null;
  media_object_key: string | null;
  media_content_type: string | null;
  media_size_bytes: number | null;
  moderation_status: "published" | "hidden" | "removed";
  report_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type ReportRow = {
  id: string;
  post_id: string;
  reporter_source_id: string;
  reason: string;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  moderator_source_id: string | null;
  moderator_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const MAX_BODY_LENGTH = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const MAX_PAGE_SIZE = 30;
const UPLOAD_TOKEN_SECONDS = 10 * 60;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);

function json(data: unknown, status = 200, origin?: string, extra?: HeadersInit) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}

function originFor(request: Request, env: Env): string | undefined {
  const origin = request.headers.get("Origin") ?? "";
  return env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean).includes(origin) ? origin : undefined;
}

function preflight(request: Request, env: Env) {
  const origin = originFor(request, env);
  if (!origin) return json({ error: "Origin tidak diizinkan." }, 403);
  return json({ ok: true }, 200, origin, {
    "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
  });
}

async function authenticate(request: Request, env: Env): Promise<SessionUser | null> {
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    const authOrigin = env.AUTH_ORIGIN.replace(/\/$/, "");
    const headers = {
      Cookie: cookie,
      Accept: "application/json",
      Origin: request.headers.get("Origin") || authOrigin,
      Referer: request.headers.get("Referer") || `${authOrigin}/`,
      "User-Agent": request.headers.get("User-Agent") || "djiwa-customer-community",
    };
    for (const suffix of ["", "?disableCookieCache=true"]) {
      const response = await fetch(`${authOrigin}/api/auth/get-session${suffix}`, { headers });
      if (!response.ok) continue;
      const payload = (await response.json().catch(() => null)) as { user?: SessionUser } | null;
      if (payload?.user?.id) return payload.user;
    }
  }
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;
  const sessions = await db<Array<{ user_source_id: string }>>(env, "yumi_sessions", {}, `select=user_source_id&token=eq.${encodeURIComponent(bearer)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
  const sourceId = sessions[0]?.user_source_id;
  if (!sourceId) return null;
  const users = await db<Array<{ source_id: string; name: string }>>(env, "yumi_users", {}, `select=source_id,name&source_id=eq.${encodeURIComponent(sourceId)}&is_active=eq.true&limit=1`);
  return users[0] ? { id: users[0].source_id, name: users[0].name } : null;
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function signedToken(payload: Record<string, string>, secret: string) {
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

function dbUrl(env: Env, table: string, query = "") {
  return `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

async function db<T>(env: Env, table: string, init: RequestInit = {}, query = ""): Promise<T> {
  const response = await fetch(dbUrl(env, table, query), {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Database request failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`);
  return payload as T;
}

function normalizeExt(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "video/webm") return "webm";
  return contentType.startsWith("video/") ? "mp4" : "jpg";
}

function mediaMaxBytes(type: string) { return type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES; }
function routeParts(url: URL) { return url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean); }
function publicAuthor(user: { source_id: string; name?: string | null; username?: string | null; slug?: string | null }) {
  return { sourceId: user.source_id, name: user.name || "Member", username: user.username || user.slug || null };
}

async function authorMap(env: Env, ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof publicAuthor>>();
  const rows = await db<Array<{ source_id: string; name: string; username?: string | null }>>(env, "pos_customers_view", {}, `select=source_id,name,username&source_id=in.(${ids.map(encodeURIComponent).join(",")})`);
  return new Map(rows.map((row) => [row.source_id, publicAuthor(row)]));
}

async function isModerator(env: Env, userId: string) {
  const rows = await db<Array<{ role_source_id: string }>>(env, "yumi_users", {}, `select=role_source_id&source_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`);
  const roleId = rows[0]?.role_source_id;
  if (!roleId) return false;
  const roles = await db<Array<{ name: string; permissions: unknown }>>(env, "yumi_roles", {}, `select=name,permissions&source_id=eq.${encodeURIComponent(roleId)}&limit=1`);
  const role = roles[0];
  const name = String(role?.name || "").toLowerCase();
  const permissions = Array.isArray(role?.permissions) ? role.permissions.map(String) : [];
  return ["admin", "administrator", "owner", "superadmin", "super admin"].includes(name) || permissions.includes("community.moderate");
}

async function engagementMap(env: Env, postIds: string[], userId: string) {
  if (!postIds.length) return new Map<string, { likeCount: number; commentCount: number; likedByMe: boolean }>();
  const inFilter = postIds.map(encodeURIComponent).join(",");
  const [likes, comments] = await Promise.all([
    db<Array<{ post_id: string; customer_source_id: string }>>(env, "customer_community_post_likes", {}, `select=post_id,customer_source_id&post_id=in.(${inFilter})`),
    db<Array<{ post_id: string }>>(env, "customer_community_comments", {}, `select=post_id&post_id=in.(${inFilter})&moderation_status=eq.published&deleted_at=is.null`),
  ]);
  const map = new Map<string, { likeCount: number; commentCount: number; likedByMe: boolean }>();
  for (const postId of postIds) map.set(postId, { likeCount: 0, commentCount: 0, likedByMe: false });
  for (const like of likes) {
    const entry = map.get(like.post_id);
    if (!entry) continue;
    entry.likeCount += 1;
    if (like.customer_source_id === userId) entry.likedByMe = true;
  }
  for (const comment of comments) {
    const entry = map.get(comment.post_id);
    if (entry) entry.commentCount += 1;
  }
  return map;
}

async function serializePosts(env: Env, rows: PostRow[], request: Request, userId: string) {
  const authors = await authorMap(env, [...new Set(rows.map((row) => row.author_source_id))]);
  const engagement = await engagementMap(env, rows.map((row) => row.id), userId);
  const origin = new URL(request.url).origin;
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    mediaType: row.media_type,
    mediaContentType: row.media_content_type,
    mediaSizeBytes: row.media_size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reportCount: row.report_count,
    ...(engagement.get(row.id) || { likeCount: 0, commentCount: 0, likedByMe: false }),
    author: authors.get(row.author_source_id) || { sourceId: row.author_source_id, name: "Member", username: null },
    mediaUrl: row.media_object_key ? `${origin}/posts/${row.id}/media` : null,
  }));
}

async function serializeComments(env: Env, rows: Array<{ id: string; post_id: string; author_source_id: string; body: string; created_at: string }>) {
  const authors = await authorMap(env, [...new Set(rows.map((row) => row.author_source_id))]);
  return rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: row.created_at,
    author: authors.get(row.author_source_id) || { sourceId: row.author_source_id, name: "Member", username: null },
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = originFor(request, env);
    if (request.method === "OPTIONS") return preflight(request, env);
    if (request.headers.get("Origin") && !origin) return json({ error: "Origin tidak diizinkan." }, 403);

    try {
      const requestUrl = new URL(request.url);
      const delegatedPath = requestUrl.searchParams.get("route");
      const parts = routeParts(delegatedPath ? new URL(delegatedPath, requestUrl.origin) : requestUrl);
      if (parts[0] !== "posts" && parts[0] !== "admin") return json({ error: "Endpoint tidak ditemukan." }, 404, origin);

      if (request.method === "PUT" && parts[0] === "posts" && parts[1] === "upload" && parts[2]) {
        const token = new URL(request.url).searchParams.get("token") || "";
        const claims = await verifyToken(token, env.UPLOAD_SIGNING_SECRET);
        if (!claims || claims.postId !== parts[2] || Number(claims.tokenExpiresAt) <= Date.now()) return json({ error: "Upload URL tidak valid atau kedaluwarsa." }, 401, origin);
        const contentType = request.headers.get("Content-Type") || "";
        const size = Number(request.headers.get("Content-Length") || 0);
        if (contentType !== claims.contentType || !ALLOWED_TYPES.has(contentType)) return json({ error: "Tipe media tidak sesuai." }, 415, origin);
        if (!Number.isInteger(size) || size <= 0 || size > mediaMaxBytes(contentType)) return json({ error: "Ukuran media melebihi batas." }, 413, origin);
        if (!request.body) return json({ error: "Media kosong." }, 400, origin);
        const key = `community/${claims.postId}.${normalizeExt(contentType)}`;
        await env.COMMUNITY_BUCKET.put(key, request.body, { httpMetadata: { contentType, cacheControl: "private, max-age=60" }, customMetadata: { postId: claims.postId, contentType, ownerSourceId: claims.ownerSourceId, createdAt: claims.createdAt } });
        return json({ data: { postId: claims.postId, objectKey: key } }, 201, origin);
      }

      const user = await authenticate(request, env);
      if (!user?.id) return json({ error: "Sesi customer tidak valid." }, 401, origin);

      if (request.method === "GET" && parts[0] === "posts" && parts.length === 1) {
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), MAX_PAGE_SIZE);
        const cursor = url.searchParams.get("cursor");
        const filters = [`moderation_status=eq.published`, `deleted_at=is.null`, `order=created_at.desc,id.desc`, `limit=${limit + 1}`];
        if (cursor) filters.push(`created_at=lt.${encodeURIComponent(cursor)}`);
        const rows = await db<PostRow[]>(env, "customer_community_posts", {}, `select=id,author_source_id,body,media_type,media_object_key,media_content_type,media_size_bytes,moderation_status,report_count,created_at,updated_at,deleted_at&${filters.join("&")}`);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        return json({ data: await serializePosts(env, page, request, user.id), nextCursor: hasMore ? page.at(-1)?.created_at ?? null : null }, 200, origin);
      }

      if (request.method === "GET" && parts[0] === "posts" && parts.length === 2) {
        const rows = await db<PostRow[]>(env, "customer_community_posts", {}, `select=id,author_source_id,body,media_type,media_object_key,media_content_type,media_size_bytes,moderation_status,report_count,created_at,updated_at,deleted_at&id=eq.${encodeURIComponent(parts[1])}&moderation_status=eq.published&deleted_at=is.null&limit=1`);
        if (!rows[0]) return json({ error: "Postingan tidak tersedia." }, 404, origin);
        return json({ data: (await serializePosts(env, rows, request, user.id))[0] }, 200, origin);
      }

      if (request.method === "POST" && parts[0] === "posts" && parts[1] === "upload-url") {
        const input = await request.json().catch(() => null) as Record<string, unknown> | null;
        const contentType = typeof input?.contentType === "string" ? input.contentType : "";
        const mediaType = contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : null;
        const size = Number(input?.sizeBytes ?? input?.size);
        const duration = input?.durationSeconds == null ? null : Number(input.durationSeconds);
        if (!mediaType || !ALLOWED_TYPES.has(contentType) || !Number.isInteger(size) || size <= 0 || size > mediaMaxBytes(contentType)) return json({ error: "Media tidak memenuhi batas Komunitas." }, 400, origin);
        if (mediaType === "video" && (duration === null || !Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_SECONDS)) return json({ error: "Video Komunitas maksimal 60 detik." }, 400, origin);
        const postId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const claims = { postId, ownerSourceId: user.id, contentType, mediaType, createdAt, tokenExpiresAt: String(Date.now() + UPLOAD_TOKEN_SECONDS * 1000) };
        const token = await signedToken(claims, env.UPLOAD_SIGNING_SECRET);
        return json({ data: { postId, uploadUrl: `${new URL(request.url).origin}/posts/upload/${postId}?token=${encodeURIComponent(token)}`, headers: { "Content-Type": contentType } } }, 200, origin);
      }

      if (request.method === "POST" && parts[0] === "posts" && parts.length === 1) {
        const input = await request.json().catch(() => null) as Record<string, unknown> | null;
        const body = typeof input?.body === "string" ? input.body.trim() : "";
        const mediaType = input?.mediaType === "image" || input?.mediaType === "video" ? input.mediaType : null;
        const objectKey = typeof input?.mediaObjectKey === "string" ? input.mediaObjectKey : null;
        const mediaContentType = typeof input?.mediaContentType === "string" ? input.mediaContentType : null;
        const mediaSizeBytes = input?.mediaSizeBytes == null ? null : Number(input.mediaSizeBytes);
        if (!body && !objectKey) return json({ error: "Tulis status atau pilih media terlebih dahulu." }, 400, origin);
        if (body.length > MAX_BODY_LENGTH) return json({ error: `Status maksimal ${MAX_BODY_LENGTH} karakter.` }, 400, origin);
        if (objectKey && (!mediaType || !mediaContentType || !ALLOWED_TYPES.has(mediaContentType) || !objectKey.startsWith(`community/`))) return json({ error: "Data media tidak valid." }, 400, origin);
        if (objectKey) {
          const object = await env.COMMUNITY_BUCKET.get(objectKey);
          const metadata = object?.customMetadata || {};
          if (!object || metadata.ownerSourceId !== user.id || metadata.postId !== String(input?.postId || "")) return json({ error: "Media tidak cocok dengan sesi postingan." }, 403, origin);
        }
        const rows = await db<PostRow[]>(env, "customer_community_posts", { method: "POST", body: JSON.stringify({ id: input?.postId || crypto.randomUUID(), author_source_id: user.id, body: body || null, media_type: mediaType, media_object_key: objectKey, media_content_type: mediaContentType, media_size_bytes: Number.isInteger(mediaSizeBytes) ? mediaSizeBytes : null }) }, "select=id,author_source_id,body,media_type,media_object_key,media_content_type,media_size_bytes,moderation_status,report_count,created_at,updated_at,deleted_at");
        return json({ data: (await serializePosts(env, rows, request, user.id))[0] }, 201, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "media" && request.method === "GET") {
        const rows = await db<PostRow[]>(env, "customer_community_posts", {}, `select=media_object_key,media_content_type,moderation_status,deleted_at&id=eq.${encodeURIComponent(parts[1])}&limit=1`);
        const row = rows[0];
        if (!row || row.moderation_status !== "published" || row.deleted_at || !row.media_object_key) return json({ error: "Media tidak tersedia." }, 404, origin);
        const object = await env.COMMUNITY_BUCKET.get(row.media_object_key);
        if (!object) return json({ error: "Media tidak ditemukan." }, 404, origin);
        return new Response(object.body, { headers: { "Content-Type": row.media_content_type || "application/octet-stream", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "like" && request.method === "POST") {
        const post = await db<Array<{ id: string }>>(env, "customer_community_posts", {}, `select=id&id=eq.${encodeURIComponent(parts[1])}&moderation_status=eq.published&deleted_at=is.null&limit=1`);
        if (!post[0]) return json({ error: "Postingan tidak tersedia." }, 404, origin);
        await db(env, "customer_community_post_likes", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ post_id: parts[1], customer_source_id: user.id }) });
        const likes = await db<Array<{ post_id: string }>>(env, "customer_community_post_likes", {}, `select=post_id&post_id=eq.${encodeURIComponent(parts[1])}`);
        return json({ data: { liked: true, likeCount: likes.length } }, 200, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "like" && request.method === "DELETE") {
        await db(env, "customer_community_post_likes", { method: "DELETE" }, `post_id=eq.${encodeURIComponent(parts[1])}&customer_source_id=eq.${encodeURIComponent(user.id)}`);
        const likes = await db<Array<{ post_id: string }>>(env, "customer_community_post_likes", {}, `select=post_id&post_id=eq.${encodeURIComponent(parts[1])}`);
        return json({ data: { liked: false, likeCount: likes.length } }, 200, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "comments" && request.method === "GET") {
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 50);
        const rows = await db<Array<{ id: string; post_id: string; author_source_id: string; body: string; created_at: string }>>(env, "customer_community_comments", {}, `select=id,post_id,author_source_id,body,created_at&post_id=eq.${encodeURIComponent(parts[1])}&moderation_status=eq.published&deleted_at=is.null&order=created_at.asc,id.asc&limit=${limit}`);
        return json({ data: await serializeComments(env, rows), nextCursor: null }, 200, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "comments" && request.method === "POST") {
        const input = await request.json().catch(() => null) as { body?: unknown } | null;
        const body = typeof input?.body === "string" ? input.body.trim() : "";
        if (!body || body.length > 500) return json({ error: "Komentar harus 1–500 karakter." }, 400, origin);
        const post = await db<Array<{ id: string }>>(env, "customer_community_posts", {}, `select=id&id=eq.${encodeURIComponent(parts[1])}&moderation_status=eq.published&deleted_at=is.null&limit=1`);
        if (!post[0]) return json({ error: "Postingan tidak tersedia." }, 404, origin);
        const rows = await db<Array<{ id: string; post_id: string; author_source_id: string; body: string; created_at: string }>>(env, "customer_community_comments", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ post_id: parts[1], author_source_id: user.id, body }) }, "select=id,post_id,author_source_id,body,created_at");
        return json({ data: (await serializeComments(env, rows))[0] }, 201, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "comments" && parts[3] && request.method === "PATCH") {
        const input = await request.json().catch(() => null) as { body?: unknown } | null;
        const body = typeof input?.body === "string" ? input.body.trim() : "";
        if (!body || body.length > 500) return json({ error: "Komentar harus 1–500 karakter." }, 400, origin);
        const rows = await db<Array<{ id: string; post_id: string; author_source_id: string; body: string; created_at: string }>>(env, "customer_community_comments", {}, `select=id,post_id,author_source_id,body,created_at&id=eq.${encodeURIComponent(parts[3])}&post_id=eq.${encodeURIComponent(parts[1])}&moderation_status=eq.published&deleted_at=is.null&limit=1`);
        const row = rows[0];
        if (!row || row.author_source_id !== user.id) return json({ error: "Komentar tidak ditemukan atau bukan milik Anda." }, 404, origin);
        const updated = await db<typeof rows>(env, "customer_community_comments", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ body }) }, `id=eq.${encodeURIComponent(parts[3])}&post_id=eq.${encodeURIComponent(parts[1])}&author_source_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&select=id,post_id,author_source_id,body,created_at`);
        return json({ data: (await serializeComments(env, updated))[0] }, 200, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "comments" && parts[3] && request.method === "DELETE") {
        const rows = await db<Array<{ id: string; post_id: string; author_source_id: string }>>(env, "customer_community_comments", {}, `select=id,post_id,author_source_id&id=eq.${encodeURIComponent(parts[3])}&post_id=eq.${encodeURIComponent(parts[1])}&moderation_status=eq.published&deleted_at=is.null&limit=1`);
        const row = rows[0];
        if (!row || row.author_source_id !== user.id) return json({ error: "Komentar tidak ditemukan atau bukan milik Anda." }, 404, origin);
        await db(env, "customer_community_comments", { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString() }) }, `id=eq.${encodeURIComponent(parts[3])}&post_id=eq.${encodeURIComponent(parts[1])}&author_source_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`);
        return json({ data: { id: parts[3], postId: parts[1], deleted: true } }, 200, origin);
      }

      if (parts[0] === "posts" && parts[1] && request.method === "DELETE") {
        const rows = await db<PostRow[]>(env, "customer_community_posts", {}, `select=id,author_source_id,media_object_key&id=eq.${encodeURIComponent(parts[1])}&limit=1`);
        const row = rows[0];
        if (!row || row.author_source_id !== user.id) return json({ error: "Postingan tidak ditemukan atau bukan milik Anda." }, 404, origin);
        await db(env, "customer_community_posts", { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString(), moderation_status: "removed" }) }, `id=eq.${encodeURIComponent(parts[1])}&author_source_id=eq.${encodeURIComponent(user.id)}`);
        if (row.media_object_key) await env.COMMUNITY_BUCKET.delete(row.media_object_key);
        return json({ data: { id: parts[1], deleted: true } }, 200, origin);
      }

      if (parts[0] === "posts" && parts[1] && parts[2] === "report" && request.method === "POST") {
        const input = await request.json().catch(() => null) as { reason?: unknown } | null;
        const reason = typeof input?.reason === "string" ? input.reason.trim().slice(0, 200) : "Konten tidak sesuai";
        await db(env, "customer_community_reports", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ post_id: parts[1], reporter_source_id: user.id, reason }) }, "on_conflict=post_id,reporter_source_id");
        return json({ data: { accepted: true } }, 202, origin);
      }

      if (parts[0] === "admin" && parts[1] === "reports" && request.method === "GET") {
        if (!(await isModerator(env, user.id))) return json({ error: "Akses moderator diperlukan." }, 403, origin);
        const reports = await db<ReportRow[]>(env, "customer_community_reports", {}, "select=id,post_id,reporter_source_id,reason,status,moderator_source_id,moderator_note,created_at,reviewed_at&status=eq.open&order=created_at.desc&limit=100");
        return json({ data: reports }, 200, origin);
      }

      if (parts[0] === "admin" && parts[1] === "posts" && parts[2] && parts[3] === "moderate" && request.method === "POST") {
        if (!(await isModerator(env, user.id))) return json({ error: "Akses moderator diperlukan." }, 403, origin);
        const input = await request.json().catch(() => null) as { action?: unknown; note?: unknown } | null;
        const action = input?.action === "publish" ? "published" : input?.action === "hide" ? "hidden" : input?.action === "remove" ? "removed" : null;
        if (!action) return json({ error: "Aksi moderasi tidak valid." }, 400, origin);
        await db(env, "customer_community_posts", { method: "PATCH", body: JSON.stringify({ moderation_status: action, deleted_at: action === "removed" ? new Date().toISOString() : null }) }, `id=eq.${encodeURIComponent(parts[2])}`);
        await db(env, "customer_community_reports", { method: "PATCH", body: JSON.stringify({ status: action === "removed" || action === "hidden" ? "actioned" : "reviewed", moderator_source_id: user.id, moderator_note: typeof input?.note === "string" ? input.note.slice(0, 500) : null, reviewed_at: new Date().toISOString() }) }, `post_id=eq.${encodeURIComponent(parts[2])}&status=eq.open`);
        return json({ data: { id: parts[2], moderationStatus: action } }, 200, origin);
      }

      return json({ error: "Endpoint tidak ditemukan." }, 404, origin);
    } catch (error) {
      console.error("customer-community worker error", error instanceof Error ? error.message : "unknown");
      return json({ error: "Layanan Komunitas sedang mengalami gangguan." }, 500, origin);
    }
  },
};
