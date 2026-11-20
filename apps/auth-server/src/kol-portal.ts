import { CAMPAIGN_PROOF_PLATFORMS, campaignProofMatchesPlatform } from "../../../supabase/functions/_shared/kol-campaign.ts";
import type { Hono } from "hono";

import { createHash } from "node:crypto";
import { isInquiryHoneypotFilled, validatePublicInquiry } from "./kol-inquiry-contract.js";
import { VISIT_CONSENT_TEXT, VISIT_CONSENT_VERSION, isVisitTimeAllowed } from "./kol-portal-contract.js";

type DbPool = { connect: () => Promise<any>; query: (text: string, values?: unknown[]) => Promise<any> };
type AuthApi = { api: { getSession: (input: { headers: Headers }) => Promise<any> } };

type AppLike = Hono<any>;

function json(c: any, body: unknown, status = 200) {
  return c.json(body, status, { "Cache-Control": "no-store" });
}

const INVITE_TOKEN_MAX_LENGTH = 512;
function inviteToken(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= INVITE_TOKEN_MAX_LENGTH ? value : null;
}
function inviteTokenHash(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
function inviteSafeContext(row: any) {
  return {
    id: row.source_id,
    name: row.name,
    username: publicUsername(row.username),
    avatarUrl: row.avatar_url ?? null,
    location: row.location,
    category: row.category,
    status: row.status,
  };
}

/** Hanya URL https yang dipakai sebagai avatar. */
export function googlePhotoUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  return /^https:\/\/[^\s]{8,2000}$/.test(url) ? url : null;
}

export const AVATAR_PUBLIC_BASE = "https://api.djiwatentram.web.id/v1/kol/avatar";
const GOOGLE_IMAGE_HOST = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//i;
export const isGoogleImageUrl = (value: unknown) => typeof value === "string" && GOOGLE_IMAGE_HOST.test(value);
/** Minta ukuran 256px (kotak) dari host gambar Google. */
export const googleImageAt256 = (url: string) => url.replace(/=s\d+(-[a-z]+)*$/i, "=s256-c");
const avatarRetryAfter = new Map<string, number>();

/** Salin foto Google ke pos.kol_avatars dan arahkan avatar_url ke salinan itu. Mengembalikan URL baru atau null. */
export async function mirrorGoogleAvatar(db: Pick<DbPool, "query">, kolId: string, url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!isGoogleImageUrl(url)) return null;
  if ((avatarRetryAfter.get(kolId) ?? 0) > Date.now()) return null;
  try {
    const response = await fetchImpl(googleImageAt256(url), { signal: AbortSignal.timeout(8000) });
    const type = (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("AVATAR_FETCH_FAILED");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 200 || bytes.length > 1_000_000) throw new Error("AVATAR_SIZE");
    const version = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
    await db.query(
      `insert into pos.kol_avatars(kol_id, content_type, data, source_url) values ($1,$2,$3,$4)
       on conflict (kol_id) do update set content_type = excluded.content_type, data = excluded.data, source_url = excluded.source_url, updated_at = now()`,
      [kolId, type, bytes, url],
    );
    const stored = `${AVATAR_PUBLIC_BASE}/${encodeURIComponent(kolId)}?v=${version}`;
    await db.query(
      `update pos.kol_creators set avatar_url = $1 where source_id = $2
         and (avatar_url is null or btrim(avatar_url) = '' or avatar_url ~ '^https://[a-z0-9-]+[.]googleusercontent[.]com/' or avatar_url like $3)`,
      [stored, kolId, `${AVATAR_PUBLIC_BASE}/%`],
    );
    avatarRetryAfter.delete(kolId);
    return stored;
  } catch {
    avatarRetryAfter.set(kolId, Date.now() + 10 * 60 * 1000);
    return null;
  }
}

async function context(c: any, auth: AuthApi, pool: DbPool) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId || !email) return { error: json(c, { success: false, error: "UNAUTHORIZED" }, 401) };
  const result = await pool.query(
    `select c.source_id, c.name, c.username, c.avatar_url, c.location, c.category, c.status, c.public_reason, c.application_data, c.visit_booking_eligible,
            p.display_name, p.slug, p.bio, p.is_public, p.public_availability, p.availability_label
       from pos.kol_creators c
       left join pos.kol_profiles p on p.kol_id = c.source_id
      where c.auth_user_id = $1
      limit 1`,
    [userId],
  );
  const kol = result.rows[0];
  if (!kol) return { error: json(c, { success: false, error: "KOL_PROFILE_NOT_LINKED" }, 409) };
  // Foto profil Google dipakai sebagai avatar creator bila belum ada, lalu disalin ke database sendiri.
  const googleImage = googlePhotoUrl(session?.user?.image);
  if (!kol.avatar_url && googleImage) {
    const stored = await mirrorGoogleAvatar(pool, kol.source_id, googleImage);
    if (stored) {
      kol.avatar_url = stored;
    } else {
      await pool.query(`update pos.kol_creators set avatar_url = $1 where source_id = $2 and (avatar_url is null or btrim(avatar_url) = '')`, [googleImage, kol.source_id]).catch(() => undefined);
      kol.avatar_url = googleImage;
    }
  } else if (isGoogleImageUrl(kol.avatar_url)) {
    void mirrorGoogleAvatar(pool, kol.source_id, kol.avatar_url);
  }
  return { userId, email, kol };
}

function isBookingDateFromTomorrow(value: string) {
  const todayWib = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  todayWib.setHours(0, 0, 0, 0);
  todayWib.setDate(todayWib.getDate() + 1);
  const minimum = `${todayWib.getFullYear()}-${String(todayWib.getMonth() + 1).padStart(2, "0")}-${String(todayWib.getDate()).padStart(2, "0")}`;
  return value >= minimum;
}

function validUrl(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 8 || value.trim().length > 2048) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}



type TimelineType = "text" | "portfolio" | "campaign" | "achievement";
const TIMELINE_TYPES: TimelineType[] = ["text", "portfolio", "campaign", "achievement"];
const REPORT_REASONS = ["spam", "privacy", "misleading", "harassment", "other"] as const;

type TimelineCursor = { publishedAt: string; id: number };
function encodeTimelineCursor(cursor: TimelineCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
function decodeTimelineCursor(value: string | undefined): TimelineCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed?.publishedAt !== "string" || !Number.isSafeInteger(parsed?.id) || parsed.id < 1) return null;
    const date = new Date(parsed.publishedAt);
    if (Number.isNaN(date.getTime())) return null;
    return { publishedAt: date.toISOString(), id: parsed.id };
  } catch { return null; }
}
function boundedLimit(value: string | undefined) {
  const parsed = value === undefined ? 20 : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : null;
}
function timelineType(value: string | undefined) {
  return !value || value === "all" ? null : TIMELINE_TYPES.includes(value as TimelineType) ? value : undefined;
}
type CreatorCursor = { ts: string; id: string };
const encodeCreatorCursor = (cursor: CreatorCursor) => Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
function decodeCreatorCursor(value: string | undefined): CreatorCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed?.ts !== "string" || typeof parsed?.id !== "string" || !/^\d{4}-\d{2}-\d{2}[ T][\d:.]+([+-]\d{2}(:?\d{2})?|Z)?$/.test(parsed.ts) || parsed.id.length > 200) return null;
    return { ts: parsed.ts, id: parsed.id };
  } catch { return null; }
}
const publicUsername = (value: unknown) => String(value ?? "").trim().replace(/^@+/, "");
const inquiryRateBuckets = new Map<string, number[]>();
function isInquiryRateLimited(key: string, now = Date.now()) {
  const windowMs = 15 * 60 * 1000;
  const recent = (inquiryRateBuckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= 5) { inquiryRateBuckets.set(key, recent); return true; }
  recent.push(now);
  inquiryRateBuckets.set(key, recent);
  if (inquiryRateBuckets.size > 10_000) {
    for (const [bucket, timestamps] of inquiryRateBuckets) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) inquiryRateBuckets.delete(bucket);
    }
  }
  return false;
}
function safeTimelineItem(row: any) {
  return {
    id: Number(row.id), type: row.post_type, title: row.title, body: row.body || "",
    mediaUrl: row.media_url ?? null, thumbnailUrl: row.thumbnail_url ?? null,
    publishedAt: row.published_at, pinnedAt: row.pinned_at ?? null,
    creator: { username: publicUsername(row.username), displayName: row.display_name, avatarUrl: row.avatar_url ?? null, category: row.category ?? null, location: row.location ?? null },
    source: row.source_entity_type && row.source_entity_id ? { type: row.source_entity_type, id: String(row.source_entity_id) } : null,
  };
}
function safeCreator(row: any) {
  return { id: row.source_id, username: publicUsername(row.username ?? row.slug), displayName: row.display_name ?? row.name, avatarUrl: row.avatar_url ?? null, category: row.category ?? null, location: row.location ?? null, bio: row.bio ?? null, availability: row.public_availability && row.public_availability !== "not_set" ? { status: row.public_availability, label: row.availability_label ?? null } : null, portfolioCount: Number(row.portfolio_count ?? 0) };
}

/** Inserts one explicitly approved source event; callers must perform source gates first. */
export async function ensurePublicTimelineEvent(poolOrClient: DbPool, input: { kolId: string; type: Exclude<TimelineType, "text">; title: string; body?: string; mediaUrl?: string | null; thumbnailUrl?: string | null; sourceEntityType: string; sourceEntityId: string; publishedAt?: string | null }) {
  if (!input.kolId || !["portfolio", "campaign", "achievement"].includes(input.type) || !input.sourceEntityType || !input.sourceEntityId) throw new Error("INVALID_PUBLIC_TIMELINE_SOURCE");
  const result = await poolOrClient.query(
    `insert into pos.kol_public_posts(kol_id,post_type,title,body,media_url,thumbnail_url,source_entity_type,source_entity_id,visibility,moderation_status,published_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,'published','approved',coalesce($9,now()))
     on conflict (kol_id,post_type,source_entity_type,source_entity_id) do nothing returning id`,
    [input.kolId, input.type, input.title.trim().slice(0, 160), (input.body ?? "").slice(0, 5000), input.mediaUrl ?? null, input.thumbnailUrl ?? null, input.sourceEntityType, input.sourceEntityId, input.publishedAt ?? null],
  );
  return result.rows[0]?.id ?? null;
}

function timelineQuery(where: string, orderCursor: string, typeClause: string) {
  return `select pp.id, pp.post_type, pp.title, pp.body, pp.media_url, pp.thumbnail_url, pp.source_entity_type, pp.source_entity_id, pp.published_at, pp.pinned_at,
      c.username, c.avatar_url, c.location, c.category, p.display_name
    from pos.kol_public_posts pp join pos.kol_creators c on c.source_id=pp.kol_id
    join pos.kol_profiles p on p.kol_id=c.source_id and p.is_public=true
    where c.status <> 'Rejected' and pp.visibility='published' and pp.moderation_status='approved' ${where} ${typeClause} ${orderCursor}
    order by pp.published_at desc, pp.id desc limit $LIMIT`;
}


export function registerKolPortalRoutes(app: AppLike, auth: AuthApi, pool: DbPool) {
  // Catat versi dan teks persetujuan terbaru (termasuk konsekuensi bila tidak hadir) pada booking yang baru dibuat.
  const stampVisitConsent = (db: Pick<DbPool, "query">, bookingId: unknown) =>
    db.query(`update pos.kol_visit_bookings set consent_version = $1, consent_text = $2 where id = $3`, [VISIT_CONSENT_VERSION, VISIT_CONSENT_TEXT, bookingId]);

  // Invite routes deliberately select only public creator fields. Raw invite tokens never enter SQL.
  const inviteLookup = async (rawToken: string, db = pool) => {
    const result = await db.query(
      `select c.source_id, c.name, c.username, c.avatar_url, c.location, c.category, c.status,
              i.id as invite_id, i.status as invite_status
         from pos.kol_visit_invitations i
         join pos.kol_creators c on c.source_id = i.kol_id
        where i.token_hash = $1
          and i.expires_at > now()
          and i.revoked_at is null
          and i.status not in ('expired','revoked','confirmed','needs_review')
        limit 1`,
      [inviteTokenHash(rawToken)],
    );
    return result.rows[0] ?? null;
  };

  const inviteResponse = (c: any, row: any) => {
    if (!row) return json(c, { success: false, error: "INVITE_NOT_FOUND" }, 404);
    return json(c, { success: true, data: { inviteId: row.invite_id, creator: inviteSafeContext(row) } });
  };

  app.get("/api/kol/invites/:token", async (c) => {
    const token = inviteToken(c.req.query("token") || c.req.param("token"));
    if (!token) return json(c, { success: false, error: "INVALID_INVITE" }, 400);
    return inviteResponse(c, await inviteLookup(token));
  });

  app.post("/api/kol/invite/open", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = inviteToken(body.token);
    if (!token) return json(c, { success: false, error: "INVALID_INVITE" }, 400);
    const row = await inviteLookup(token);
    if (!row) return json(c, { success: false, error: "INVITE_NOT_FOUND" }, 404);
    await pool.query(`update pos.kol_visit_invitations set status = case when status = 'created' then 'opened' else status end, opened_at = coalesce(opened_at, now()) where id = $1`, [row.invite_id]);
    return inviteResponse(c, row);
  });

  app.post("/api/kol/invites/:token/claim", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session?.user?.id;
    const email = session?.user?.email?.trim().toLowerCase();
    if (!userId || !email) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const token = inviteToken(body.token || c.req.param("token"));
    if (!token) return json(c, { success: false, error: "INVALID_INVITE" }, 400);

    const client = await pool.connect();
    try {
      await client.query("begin");
      const invite = await inviteLookup(token, client);
      if (!invite) { await client.query("rollback"); return json(c, { success: false, error: "INVITE_NOT_FOUND" }, 404); }
      const owned = await client.query(`select source_id, name, username, avatar_url, location, category, status from pos.kol_creators where auth_user_id = $1 for update`, [userId]);
      if (owned.rows.length > 0) { await client.query("rollback"); return json(c, { success: false, error: "ALREADY_LINKED" }, 409); }
      const matches = await client.query(
        `select c.source_id, c.name, c.username, c.avatar_url, c.location, c.category, c.status, c.auth_user_id
           from pos.kol_creators c join pos.kol_private_contacts p on p.kol_id = c.source_id
          where lower(btrim(p.email)) = $1
          for update of c`,
        [email],
      );
      if (matches.rows.length !== 1) {
        await client.query("rollback");
        return json(c, { success: false, error: matches.rows.length > 1 ? "AMBIGUOUS_EMAIL_MATCH" : "EMAIL_MATCH_NOT_FOUND" }, matches.rows.length > 1 ? 409 : 404);
      }
      const match = matches.rows[0];
      if (match.source_id !== invite.source_id) { await client.query("rollback"); return json(c, { success: false, error: "EMAIL_MATCH_NOT_FOUND" }, 404); }
      if (match.auth_user_id && match.auth_user_id !== userId) { await client.query("rollback"); return json(c, { success: false, error: "ALREADY_LINKED" }, 409); }
      const linked = await client.query(`update pos.kol_creators set auth_user_id = $1, updated_at = now() where source_id = $2 and auth_user_id is null returning source_id, name, username, avatar_url, location, category, status`, [userId, invite.source_id]);
      if (!linked.rows[0]) { await client.query("rollback"); return json(c, { success: false, error: "ALREADY_LINKED" }, 409); }
      await client.query(`update pos.kol_visit_invitations set status = 'linked', linked_at = coalesce(linked_at, now()), linked_auth_user_id = $1 where id = $2`, [userId, invite.invite_id]);
      await client.query("commit");
      return json(c, { success: true, data: { creator: inviteSafeContext(linked.rows[0]) } });
    } catch (error: any) {
      await client.query("rollback");
      if (error?.code === "23505") return json(c, { success: false, error: "ALREADY_LINKED" }, 409);
      throw error;
    } finally { client.release(); }
  });

  app.post("/api/kol/invites/:token/booking", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const token = inviteToken(body.token || c.req.param("token"));
    const date = typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
    const time = typeof body.bookingTime === "string" ? body.bookingTime.trim() : "";
    if (!token) return json(c, { success: false, error: "INVALID_INVITE" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isBookingDateFromTomorrow(date)) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
    if (!isVisitTimeAllowed(time)) return json(c, { success: false, error: "INVALID_BOOKING_TIME" }, 400);
    if (body.consentTerms !== true || body.consentAttendance !== true || body.consentNoShow !== true) return json(c, { success: false, error: "CONSENT_REQUIRED" }, 400);
    const invite = await inviteLookup(token);
    if (!invite) return json(c, { success: false, error: "INVITE_NOT_FOUND" }, 404);
    if (invite.source_id !== current.kol.source_id) return json(c, { success: false, error: "INVITE_NOT_LINKED" }, 403);
    const result = await pool.query(`select * from pos.kol_request_invited_visit_booking_v2($1,$2,$3,$4::time,$5,$6,$7)`, [invite.invite_id, current.kol.source_id, date, time, true, true, current.userId]).catch((error: any) => ({ error }));
    if ((result as any).error) {
      const error = (result as any).error;
      if (error?.code === "23505" || error?.message === "DATE_ALREADY_BOOKED") return json(c, { success: false, error: "DATE_ALREADY_BOOKED" }, 409);
      if (error?.code === "P0001" && ["INVALID_BOOKING_DATE","INVALID_BOOKING_TIME","DATE_ALREADY_BOOKED","CREATOR_ALREADY_HAS_ACTIVE_BOOKING","INVITATION_NOT_VALID","CONSENT_REQUIRED"].includes(error?.message)) return json(c, { success: false, error: error.message }, error.message === "DATE_ALREADY_BOOKED" || error.message === "CREATOR_ALREADY_HAS_ACTIVE_BOOKING" ? 409 : 400);
      throw error;
    }
    await stampVisitConsent(pool, (result as any).rows?.[0]?.id).catch(() => undefined);
    return json(c, { success: true, data: (result as any).rows?.[0] ?? null }, 201);
  });

  // Avatar creator yang disimpan di database. Profil publik: terbuka; selain itu hanya untuk pengguna yang login.
  app.get("/api/kol/avatar/:id", async (c) => {
    const result = await pool.query(
      `select a.content_type, a.data, coalesce(p.is_public, false) as is_public
         from pos.kol_avatars a join pos.kol_creators k on k.source_id = a.kol_id
         left join pos.kol_profiles p on p.kol_id = a.kol_id
        where a.kol_id = $1 and k.status <> 'Rejected'`,
      [c.req.param("id")],
    );
    const row = result.rows[0];
    if (!row) return c.body(null, 404);
    if (!row.is_public) {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session?.user?.id) return c.body(null, 404);
    }
    return c.body(row.data, 200, { "Content-Type": row.content_type, "Cache-Control": row.is_public ? "public, max-age=86400" : "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
  });

  // Pendaftaran baru: data KOL + booking visit dalam satu transaksi. Jika tanggal bentrok, tidak ada data yang tersimpan.
  app.post("/api/kol/register", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session?.user?.id;
    const accountEmail = typeof session?.user?.email === "string" ? session.user.email.trim().toLowerCase() : "";
    if (!userId) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const location = typeof body.location === "string" ? body.location.trim().slice(0, 120) : "";
    const category = typeof body.category === "string" ? body.category : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._-]+/g, "") : "";
    const platform = typeof body.platform === "string" ? body.platform : "";
    const profileUrl = typeof body.profileUrl === "string" ? body.profileUrl.trim() : "";
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.replace(/[^\d+]/g, "").slice(0, 40) : "";
    const allowedCategories = ["Food & Beverage", "Coffee", "Lifestyle", "Travel", "Fashion", "Beauty", "Entertainment", "Other"];
    const allowedPlatforms = ["TikTok", "Instagram", "YouTube", "Threads", "Other"];
    if (name.length < 2 || location.length < 2 || !allowedCategories.includes(category) || !username || !allowedPlatforms.includes(platform) || (profileUrl && !validUrl(profileUrl)) || !/^(\+62|62|0)\d{8,13}$/.test(whatsapp)) {
      return json(c, { success: false, error: "INVALID_KOL_INTAKE" }, 400);
    }
    const date = typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
    const time = typeof body.bookingTime === "string" ? body.bookingTime.trim() : "";
    const campaignSlug = typeof body.campaignSlug === "string" && /^[a-z0-9-]{1,120}$/.test(body.campaignSlug) ? body.campaignSlug : null;
    if (!campaignSlug && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isBookingDateFromTomorrow(date))) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
    if (!campaignSlug && !isVisitTimeAllowed(time)) return json(c, { success: false, error: "INVALID_BOOKING_TIME" }, 400);
    if (!campaignSlug && (body.consentTerms !== true || body.consentAttendance !== true || body.consentNoShow !== true)) return json(c, { success: false, error: "CONSENT_REQUIRED" }, 400);

    const sourceId = `kol_${crypto.randomUUID().replace(/-/g, "")}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (campaignSlug) {
        const available = await client.query(`select 1 from pos.kol_campaigns
          where slug = $1 and status = 'published' and application_mode <> 'invite'
            and coalesce(application_deadline >= (now() at time zone 'Asia/Jakarta')::date, true)
            and coalesce(end_date >= (now() at time zone 'Asia/Jakarta')::date, true)`, [campaignSlug]);
        if (!available.rows[0]) {
          await client.query("ROLLBACK");
          return json(c, { success: false, error: "CAMPAIGN_NOT_OPEN" }, 409);
        }
      }
      const owned = await client.query(`select source_id from pos.kol_creators where auth_user_id = $1 limit 1`, [userId]);
      if (owned.rows[0]) { await client.query("ROLLBACK"); return json(c, { success: false, error: "ALREADY_REGISTERED" }, 409); }
      const duplicate = await client.query(
        `select 1 from pos.kol_platforms where platform = $1 and username_normalized = $2 limit 1`,
        [platform, username],
      );
      if (duplicate.rows[0]) { await client.query("ROLLBACK"); return json(c, { success: false, error: "PROFILE_DUPLICATE" }, 409); }
      const contentTypes = Array.isArray(body.contentTypes) ? body.contentTypes.filter((x: unknown) => typeof x === "string").slice(0, 20) : [];
      await client.query(
        `insert into pos.kol_creators(source_id,name,username,username_normalized,location,category,status,public_reason,application_data,auth_user_id,
                                      visit_booking_eligible,visit_booking_eligible_at,visit_booking_eligibility_note,avatar_url)
         values($1,$2,$3,$4,$5,$6,$11,$7,$8,$9,true,now(),'Pendaftaran mandiri',$10)`,
        [sourceId, name, `@${username}`, username, location, category, String(body.reason ?? "").trim().slice(0, 1000),
         JSON.stringify({ averageViews: Number(body.averageViews) || 0, contentTypes, profileUrl, source: "self-register" }), userId, googlePhotoUrl(session?.user?.image), campaignSlug ? 'Potential' : 'Scheduled Visit'],
      );
      await client.query(
        `insert into pos.kol_platforms(kol_id,platform,username,username_normalized,profile_url,followers) values($1,$2,$3,$4,$5,$6)`,
        [sourceId, platform, username, username, profileUrl || null, Math.max(0, Math.floor(Number(body.followers) || 0))],
      );
      await client.query(`insert into pos.kol_profiles(kol_id, display_name, slug, is_public) values ($1,$2,$3,true) on conflict (kol_id) do nothing`, [sourceId, name, username]);
      await client.query(`insert into pos.kol_private_contacts(kol_id,email,whatsapp) values($1,$2,$3)`, [sourceId, accountEmail || null, whatsapp]);
      const booking = campaignSlug ? null : await client.query(`select * from pos.kol_request_shared_visit_booking($1,$2,$3::time,$4,$5,$6)`, [sourceId, date, time, true, true, userId]);
      if (booking) await stampVisitConsent(client, booking.rows[0]?.id);
      await client.query("COMMIT");
      const photo = googlePhotoUrl(session?.user?.image);
      if (photo) void mirrorGoogleAvatar(pool, sourceId, photo);
      return json(c, { success: true, data: { creator: { id: sourceId, name, username: `@${username}`, status: campaignSlug ? "Potential" : "Scheduled Visit" }, booking: booking?.rows[0] ?? null } }, 201);
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => undefined);
      const message = error?.code === "P0001" ? error.message : "";
      if (message === "DATE_ALREADY_BOOKED" || (error?.code === "23505" && /per_day/.test(String(error?.constraint ?? error?.message)))) return json(c, { success: false, error: "DATE_ALREADY_BOOKED" }, 409);
      if (["INVALID_BOOKING_DATE", "INVALID_BOOKING_TIME", "CONSENT_REQUIRED"].includes(message)) return json(c, { success: false, error: message }, 400);
      if (error?.code === "23505") return json(c, { success: false, error: "PROFILE_DUPLICATE" }, 409);
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/kol/portal/intake", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session?.user?.id;
    if (!userId) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const location = typeof body.location === "string" ? body.location.trim().slice(0, 120) : "";
    const category = typeof body.category === "string" ? body.category : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._-]+/g, "") : "";
    const platform = typeof body.platforms?.[0]?.platform === "string" ? body.platforms[0].platform : "";
    const profileUrl = typeof body.platforms?.[0]?.profileUrl === "string" ? body.platforms[0].profileUrl.trim() : "";
    const allowedCategories = ["Food & Beverage", "Coffee", "Lifestyle", "Travel", "Fashion", "Beauty", "Entertainment", "Other"];
    const allowedPlatforms = ["TikTok", "Instagram", "YouTube", "Threads", "Other"];
    if (name.length < 2 || location.length < 2 || !allowedCategories.includes(category) || !username || !allowedPlatforms.includes(platform) || (profileUrl && !validUrl(profileUrl))) {
      return json(c, { success: false, error: "INVALID_KOL_INTAKE" }, 400);
    }
    const client = await pool.connect();
    const sourceId = `kol_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      await client.query("BEGIN");
      const duplicate = await client.query(
        `select c.source_id from pos.kol_creators c join pos.kol_platforms p on p.kol_id = c.source_id
          where p.platform = $1 and p.username_normalized = $2 limit 1`,
        [platform, username],
      );
      if (duplicate.rows[0]) {
        await client.query("ROLLBACK");
        return json(c, { success: true, duplicate: true, creatorId: duplicate.rows[0].source_id });
      }
      await client.query(
        `insert into pos.kol_creators(source_id,name,username,username_normalized,location,category,status,public_reason,application_data,auth_user_id)
         values($1,$2,$3,$4,$5,$6,'Potential',$7,$8,$9)`,
        [sourceId, name, `@${username}`, username, location, category, String(body.reason ?? "").slice(0, 1000), JSON.stringify({ nickname: String(body.nickname ?? "").slice(0, 120), averageViews: Number(body.averageViews) || 0, contentTypes: Array.isArray(body.contentTypes) ? body.contentTypes.slice(0, 20) : [], collaboration: String(body.collaboration ?? "").slice(0, 120), visitDate: String(body.visitDate ?? "").slice(0, 20), visitTime: String(body.visitTime ?? "").slice(0, 10), barter: String(body.barter ?? "").slice(0, 120), profileUrl }), userId],
      );
      await client.query(
        `insert into pos.kol_platforms(kol_id,platform,username,username_normalized,profile_url,followers) values($1,$2,$3,$4,$5,$6)`,
        [sourceId, platform, username, username, profileUrl, Math.max(0, Number(body.platforms?.[0]?.followers) || 0)],
      );
      await client.query(
        `insert into pos.kol_profiles(kol_id, display_name, slug, is_public)
         values ($1, $2, $3, true)
         on conflict (kol_id) do nothing`,
        [sourceId, name, username],
      );
      const contactEmail = typeof body.email === "string" ? body.email.trim().slice(0, 160) || null : null;
      const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim().slice(0, 40) || null : null;
      if (contactEmail || whatsapp) await client.query(`insert into pos.kol_private_contacts(kol_id,email,whatsapp) values($1,$2,$3)`, [sourceId, contactEmail, whatsapp]);
      await client.query("COMMIT");
      return json(c, { success: true, creator: { id: sourceId, name, username: `@${username}`, location, category, status: "Potential" } }, 201);
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return json(c, { success: true, duplicate: true }, 200);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/kol/portal/intake", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const [platforms, contacts] = await Promise.all([
      pool.query(`select platform, username, profile_url, followers from pos.kol_platforms where kol_id = $1 order by created_at asc limit 1`, [current.kol.source_id]),
      pool.query(`select email, whatsapp from pos.kol_private_contacts where kol_id = $1 limit 1`, [current.kol.source_id]),
    ]);
    return json(c, { success: true, data: { name: current.kol.name, location: current.kol.location, category: current.kol.category, reason: current.kol.public_reason || "", applicationData: current.kol.application_data || {}, platform: platforms.rows[0] || null, contact: contacts.rows[0] || null } });
  });

  app.get("/api/kol/portal/profile", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const [platforms, badges, portfolio] = await Promise.all([
      pool.query(`select platform, username, profile_url, followers, engagement_rate from pos.kol_platforms where kol_id = $1 order by followers desc`, [current.kol.source_id]),
      pool.query(`select b.code, b.name, b.description, b.icon, cb.awarded_at from pos.kol_creator_badges cb join pos.kol_badges b on b.id = cb.badge_id where cb.kol_id = $1 and cb.is_visible = true and b.is_active = true order by cb.awarded_at desc`, [current.kol.source_id]),
      pool.query(`select id, platform, title, content_url, thumbnail_url, description, published_at, review_status, review_note, is_public, created_at, updated_at from pos.kol_portfolio_items where kol_id = $1 order by created_at desc`, [current.kol.source_id]),
    ]);
    return json(c, { success: true, data: { ...current.kol, platforms: platforms.rows, badges: badges.rows, portfolio: portfolio.rows } });
  });

  app.patch("/api/kol/portal/profile", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 120) : null;
    const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 1000) : null;
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) : null;
    // Semua profil creator publik; tidak ada pengaturan privat.
    const isPublic = true;
    if (displayName !== null && displayName.length < 2) return json(c, { success: false, error: "INVALID_DISPLAY_NAME" }, 400);
    if (slug !== null && slug.length < 2) return json(c, { success: false, error: "INVALID_SLUG" }, 400);
    try {
      const result = await pool.query(
        `insert into pos.kol_profiles(kol_id, display_name, slug, bio, is_public, profile_completed_at)
         values ($1, coalesce($2, $3), coalesce($4, lower(regexp_replace($3, '[^a-zA-Z0-9]+', '-', 'g'))), $5, coalesce($6, false), now())
         on conflict (kol_id) do update set
           display_name = coalesce($2, pos.kol_profiles.display_name),
           slug = coalesce($4, pos.kol_profiles.slug),
           bio = coalesce($5, pos.kol_profiles.bio),
           is_public = coalesce($6, pos.kol_profiles.is_public),
           profile_completed_at = coalesce(pos.kol_profiles.profile_completed_at, now()),
           updated_at = now()
         returning kol_id, display_name, slug, bio, is_public, profile_completed_at, updated_at`,
        [current.kol.source_id, displayName, current.kol.name, slug, bio, isPublic],
      );
      return json(c, { success: true, data: result.rows[0] });
    } catch (error: any) {
      if (error?.code === "23505") return json(c, { success: false, error: "SLUG_ALREADY_USED" }, 409);
      throw error;
    }
  });

  app.get("/api/kol/portal/portfolio", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await pool.query(`select * from pos.kol_portfolio_items where kol_id = $1 order by created_at desc`, [current.kol.source_id]);
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/portfolio", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
    const platform = typeof body.platform === "string" ? body.platform : "";
    const contentUrl = typeof body.contentUrl === "string" ? body.contentUrl.trim() : "";
    if (title.length < 2 || !["TikTok", "Instagram", "YouTube", "Threads", "Other"].includes(platform) || !validUrl(contentUrl)) {
      return json(c, { success: false, error: "INVALID_PORTFOLIO" }, 400);
    }
    try {
      const result = await pool.query(
        `insert into pos.kol_portfolio_items(kol_id, platform, title, content_url, thumbnail_url, description, published_at)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [current.kol.source_id, platform, title, contentUrl, typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim() || null : null, typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null, typeof body.publishedAt === "string" ? body.publishedAt : null],
      );
      return json(c, { success: true, data: result.rows[0] }, 201);
    } catch (error: any) {
      if (error?.code === "23505") return json(c, { success: false, error: "PORTFOLIO_URL_ALREADY_EXISTS" }, 409);
      throw error;
    }
  });

  app.patch("/api/kol/portal/portfolio/:id", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return json(c, { success: false, error: "INVALID_ID" }, 400);
    const result = await pool.query(
      `update pos.kol_portfolio_items set title = coalesce($1, title), content_url = coalesce($2, content_url), description = coalesce($3, description), thumbnail_url = coalesce($4, thumbnail_url), published_at = coalesce($5, published_at), review_status = 'pending', is_public = false, updated_at = now() where id = $6 and kol_id = $7 returning *`,
      [typeof body.title === "string" ? body.title.trim().slice(0, 160) || null : null, typeof body.contentUrl === "string" && validUrl(body.contentUrl) ? body.contentUrl.trim() : null, typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null, typeof body.thumbnailUrl === "string" ? body.thumbnailUrl.trim() || null : null, typeof body.publishedAt === "string" ? body.publishedAt : null, id, current.kol.source_id],
    );
    if (!result.rows[0]) return json(c, { success: false, error: "PORTFOLIO_NOT_FOUND" }, 404);
    return json(c, { success: true, data: result.rows[0] });
  });

  app.delete("/api/kol/portal/portfolio/:id", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await pool.query(`delete from pos.kol_portfolio_items where id = $1 and kol_id = $2 returning id`, [Number(c.req.param("id")), current.kol.source_id]);
    if (!result.rows[0]) return json(c, { success: false, error: "PORTFOLIO_NOT_FOUND" }, 404);
    return json(c, { success: true, data: result.rows[0] });
  });

  const campaignFields = `c.id, c.slug, c.title, c.description, c.location, c.benefit_description, c.deliverable_summary,
    c.application_deadline::text, c.start_date::text, c.end_date::text, c.status, c.updated_at::text as revision,
    c.application_mode, c.cover_url, c.terms, c.sow, c.proof_platforms,
    c.status = 'published' and c.application_mode <> 'invite'
      and coalesce(c.application_deadline >= (now() at time zone 'Asia/Jakarta')::date, true)
      and coalesce(c.end_date >= (now() at time zone 'Asia/Jakarta')::date, true) as can_apply`;

  app.get("/api/kol/public-campaigns", async (c) => {
    const result = await pool.query(`select ${campaignFields} from pos.kol_campaigns c
      where c.status = 'published' and c.application_mode <> 'invite' order by c.created_at desc limit 100`);
    return json(c, { success: true, data: result.rows });
  });

  app.get("/api/kol/public-campaigns/:slug", async (c) => {
    const result = await pool.query(`select ${campaignFields} from pos.kol_campaigns c
      where c.status = 'published' and c.application_mode <> 'invite' and c.slug = $1`, [c.req.param("slug")]);
    return result.rows[0] ? json(c, { success: true, data: result.rows[0] })
      : json(c, { success: false, error: "CAMPAIGN_NOT_FOUND" }, 404);
  });

  app.get("/api/kol/portal/campaigns", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await pool.query(
      `select ${campaignFields}, a.id as assignment_id, a.status as assignment_status,
          ap.status as application_status, ap.terms_snapshot, ap.sow_snapshot, ap.proof_platforms as agreed_proof_platforms,
          ap.review_note, ap.requires_visit as application_requires_visit, b.status as visit_status, b.booking_date::text as visit_date,
          to_char(b.booking_time, 'HH24:MI') as visit_time,
          b.post_deadline::text as post_deadline,
          case when b.sow_snapshot is distinct from ap.sow_snapshot then b.sow_snapshot end as updated_visit_sow
         from pos.kol_campaigns c
         left join pos.kol_campaign_assignments a on a.campaign_id = c.id and a.kol_id = $1
         left join pos.kol_campaign_applications ap on ap.campaign_id = c.id and ap.kol_id = $1
         left join pos.kol_visit_bookings b on b.id = ap.booking_id
        where c.status = 'published' or a.id is not null or ap.id is not null
        order by c.created_at desc`,
      [current.kol.source_id],
    );
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/campaigns/:slug/apply", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const slug = c.req.param("slug");
    const date = typeof body.bookingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.bookingDate) ? body.bookingDate : null;
    const time = isVisitTimeAllowed(body.bookingTime) ? body.bookingTime : null;
    const revision = typeof body.revision === "string" && body.revision.length <= 40 && Number.isFinite(Date.parse(body.revision)) ? body.revision : null;
    if (!revision || body.consentTerms !== true) return json(c, { success: false, error: "CAMPAIGN_TERMS_CHANGED" }, 409);
    try {
      const result = await pool.query(
        `select status, booking_id from pos.kol_apply_campaign($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [slug, current.kol.source_id, current.userId, revision, true, date, time,
          body.consentAttendance === true, body.consentNoShow === true, VISIT_CONSENT_TEXT, body.useExisting === true],
      );
      return json(c, { success: true, data: result.rows[0] });
    } catch (error: any) {
      if (error?.code === "P0001") return json(c, { success: false, error: error.message }, 409);
      if (["22007", "22008"].includes(error?.code)) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
      throw error;
    }
  });

  app.post("/api/kol/portal/campaigns/:id/respond", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const status = body.status === "accepted" ? "accepted" : body.status === "declined" ? "declined" : null;
    if (!status) return json(c, { success: false, error: "INVALID_CAMPAIGN_RESPONSE" }, 400);
    const result = await pool.query(
      `update pos.kol_campaign_assignments a set status = $1, accepted_at = case when $1='accepted' then now() else accepted_at end, updated_at = now() from pos.kol_campaigns c where a.id = $2 and a.campaign_id=c.id and a.kol_id=$3 and a.status='invited' and c.status='published' and c.application_mode='invite' and ($1='declined' or cardinality(c.terms)=0) returning a.*`,
      [status, Number(c.req.param("id")), current.kol.source_id],
    );
    if (!result.rows[0]) return json(c, { success: false, error: "CAMPAIGN_ASSIGNMENT_NOT_FOUND" }, 404);
    return json(c, { success: true, data: result.rows[0] });
  });

  app.get("/api/kol/portal/proofs", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await pool.query(`select p.*, c.title as campaign_title from pos.kol_content_submissions p join pos.kol_campaign_assignments a on a.id=p.campaign_assignment_id join pos.kol_campaigns c on c.id=a.campaign_id where a.kol_id=$1 order by p.created_at desc`, [current.kol.source_id]);
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/proofs", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const assignmentId = Number(body.assignmentId);
    const contentUrl = typeof body.contentUrl === "string" ? body.contentUrl.trim() : "";
    if (!Number.isInteger(assignmentId) || !validUrl(contentUrl)) return json(c, { success: false, error: "INVALID_CONTENT_PROOF" }, 400);
    const deliverable = typeof body.deliverableType === "string" ? body.deliverableType.trim().slice(0, 120) || "content" : "content";
    const result = await pool.query(`insert into pos.kol_content_submissions
      (campaign_assignment_id,deliverable_type,content_url,published_at,insight_screenshot_url,status,required_platform)
      select a.id,$1,$2,$3,$4,'submitted',case when cardinality(ap.proof_platforms) > 0 then $1 end
        from pos.kol_campaign_assignments a
        left join pos.kol_campaign_applications ap on ap.campaign_id = a.campaign_id and ap.kol_id = a.kol_id
        left join pos.kol_visit_bookings b on b.id = ap.booking_id
       where a.id=$5 and a.kol_id=$6 and a.status in ('accepted','active')
         and (not coalesce(ap.requires_visit, false) or b.status = 'completed')
         and (coalesce(cardinality(ap.proof_platforms), 0) = 0 or ($7::boolean and $1 = any(ap.proof_platforms)))
      on conflict (campaign_assignment_id, required_platform)
        where required_platform is not null and status <> 'rejected' do nothing
      returning *`, [deliverable, contentUrl, typeof body.publishedAt === "string" ? body.publishedAt : null,
        typeof body.screenshotUrl === "string" && validUrl(body.screenshotUrl) ? body.screenshotUrl.trim() : null, assignmentId, current.kol.source_id, campaignProofMatchesPlatform(contentUrl, deliverable)]);
    if (!result.rows[0]) return json(c, { success: false, error: campaignProofMatchesPlatform(contentUrl, deliverable) ? "CAMPAIGN_PROOF_UNAVAILABLE" : "CAMPAIGN_PROOF_PLATFORM_INVALID" }, 409);
    await pool.query(`update pos.kol_campaign_assignments set status='active', updated_at=now() where id=$1 and kol_id=$2 and status='accepted'`, [assignmentId, current.kol.source_id]);
    return json(c, { success: true, data: result.rows[0] }, 201);
  });

  app.patch("/api/kol/portal/proofs/:id", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const contentUrl = typeof body.contentUrl === "string" ? body.contentUrl.trim() : "";
    if (!validUrl(contentUrl)) return json(c, { success: false, error: "INVALID_CONTENT_PROOF" }, 400);
    const result = await pool.query(`update pos.kol_content_submissions p set content_url=$1, insight_screenshot_url=coalesce($2,insight_screenshot_url), status='submitted', reviewed_at=null, review_note=null, updated_at=now() from pos.kol_campaign_assignments a where p.id=$3 and p.campaign_assignment_id=a.id and a.kol_id=$4 and p.status='needs_revision' and (p.required_platform is null or p.required_platform = any($5::text[])) returning p.*`, [contentUrl, typeof body.screenshotUrl === "string" && validUrl(body.screenshotUrl) ? body.screenshotUrl.trim() : null, Number(c.req.param("id")), current.kol.source_id, CAMPAIGN_PROOF_PLATFORMS.filter((platform) => campaignProofMatchesPlatform(contentUrl, platform))]);
    if (!result.rows[0]) return json(c, { success: false, error: "CAMPAIGN_PROOF_REVISION_UNAVAILABLE" }, 404);
    return json(c, { success: true, data: result.rows[0] });
  });
  app.get("/api/kol/portal/notifications", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await pool.query(`select id, type, title, body, entity_type, entity_id, read_at, created_at from pos.kol_notifications where kol_id=$1 order by created_at desc limit 100`, [current.kol.source_id]);
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/notifications/read", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    if (body.all === true) {
      await pool.query(`update pos.kol_notifications set read_at=coalesce(read_at,now()) where kol_id=$1`, [current.kol.source_id]);
    } else if (Number.isInteger(Number(body.id))) {
      await pool.query(`update pos.kol_notifications set read_at=coalesce(read_at,now()) where id=$1 and kol_id=$2`, [Number(body.id), current.kol.source_id]);
    }
    return json(c, { success: true });
  });

  // Jadwal visit: satu tanggal = satu KOL. Menampilkan siapa yang memegang tiap tanggal (nama tampilan, kategori, platform utama).
  const visitCalendarRows = (kolId: string | null) => pool.query(
    `select to_char(b.booking_date, 'YYYY-MM-DD') as booking_date, to_char(b.booking_time, 'HH24:MI') as booking_time, b.status, (c.source_id = $1::text) as own,
            case when c.source_id = $1::text then b.sow_snapshot end as sow,
            case when c.source_id = $1::text then to_char(b.post_deadline, 'YYYY-MM-DD') end as post_deadline,
            case when c.source_id = $1::text then b.admin_note end as note,
            coalesce(nullif(btrim(p.display_name), ''), c.name) as creator_name, c.category, pl.platform
       from pos.kol_visit_bookings b
       join pos.kol_creators c on c.source_id = b.kol_id
       left join pos.kol_profiles p on p.kol_id = c.source_id
       left join lateral (select platform from pos.kol_platforms where kol_id = c.source_id order by followers desc limit 1) pl on true
      where b.booking_date >= ((now() at time zone 'Asia/Jakarta')::date) and b.status in ('requested','confirmed','completed')
      order by b.booking_date asc limit 200`,
    [kolId],
  );

  app.get("/api/kol/portal/visit-calendar", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await visitCalendarRows(current.kol.source_id);
    return json(c, { success: true, data: result.rows });
  });

  // Lokasi dan kontak kunjungan (alamat, Maps, WhatsApp admin/manager) untuk kartu visit di portal.
  app.get("/api/kol/portal/visit-info", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const r = await pool.query(`select cafe_name, address, maps_url, wa_admin, wa_manager, post_deadline_days from pos.kol_visit_settings where id = 1`);
    return json(c, { success: true, data: r.rows[0] ?? null });
  });

  // Dipakai saat pendaftaran: creator sudah login Google tetapi profilnya belum ada.
  app.get("/api/kol/register/calendar", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    const result = await visitCalendarRows(null);
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/visit-calendar", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    if (current.kol.visit_booking_eligible !== true) return json(c, { success: false, error: "VISIT_NOT_ELIGIBLE" }, 403);
    const body = await c.req.json().catch(() => ({}));
    const date = typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
    const time = typeof body.bookingTime === "string" ? body.bookingTime.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isBookingDateFromTomorrow(date)) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
    if (!isVisitTimeAllowed(time)) return json(c, { success: false, error: "INVALID_BOOKING_TIME" }, 400);
    if (body.consentTerms !== true || body.consentAttendance !== true || body.consentNoShow !== true) return json(c, { success: false, error: "CONSENT_REQUIRED" }, 400);
    const result = await pool.query(`select * from pos.kol_request_shared_visit_booking($1,$2,$3::time,$4,$5,$6)`, [current.kol.source_id, date, time, true, true, current.userId]).catch((error: any) => ({ error }));
    if ((result as any).error) {
      const error = (result as any).error;
      if (error?.code === "23505" || error?.message === "DATE_ALREADY_BOOKED") return json(c, { success: false, error: "DATE_ALREADY_BOOKED" }, 409);
      if (error?.code === "P0001" && ["INVALID_BOOKING_DATE","INVALID_BOOKING_TIME","DATE_ALREADY_BOOKED","CREATOR_ALREADY_HAS_ACTIVE_BOOKING","VISIT_NOT_ELIGIBLE","KOL_PROFILE_NOT_FOUND","CONSENT_REQUIRED"].includes(error?.message)) return json(c, { success: false, error: error.message }, error.message === "DATE_ALREADY_BOOKED" || error.message === "CREATOR_ALREADY_HAS_ACTIVE_BOOKING" ? 409 : error.message === "VISIT_NOT_ELIGIBLE" ? 403 : 400);
      throw error;
    }
    await stampVisitConsent(pool, (result as any).rows?.[0]?.id).catch(() => undefined);
    return json(c, { success: true, data: (result as any).rows?.[0] ?? null }, 201);
  });


  app.get("/api/kol/public/creators", async (c) => creatorDiscovery(c, pool, false));

  app.get("/api/kol/public/:username", async (c) => {
    const username = publicUsername(c.req.param("username")).toLowerCase();
    const result = await pool.query(`select * from public.pos_kol_public_profiles where lower(username)=lower($1) limit 1`, [username]);
    const row = result.rows[0];
    if (!row) return json(c, { success: false, error: "PROFILE_NOT_FOUND" }, 404);
    const payload = row.data && typeof row.data === "object" ? row.data : {};
    const platforms = Array.isArray(payload.platforms) ? payload.platforms.map((platform: any) => ({
      platform: platform.platform,
      username: publicUsername(platform.username),
      profile_url: platform.profileUrl ?? null,
      followers: Number.isFinite(Number(platform.followers)) ? Number(platform.followers) : null,
    })) : [];
    const portfolio = Array.isArray(payload.portfolio) ? payload.portfolio.map((item: any) => ({
      id: item.id,
      platform: item.platform,
      title: item.title,
      content_url: item.contentUrl,
      thumbnail_url: item.thumbnailUrl ?? null,
      description: item.description ?? null,
      published_at: item.publishedAt ?? null,
      pinned_order: item.pinnedOrder ?? null,
    })) : [];
    const badges = Array.isArray(payload.badges) ? payload.badges.map((badge: any) => ({ code: badge.code, name: badge.name, description: badge.description, icon: badge.icon ?? null })) : [];
    return json(c, { success: true, data: {
      id: row.id,
      name: row.name,
      display_name: row.name,
      username: publicUsername(row.username),
      avatar_url: row.avatar_url ?? null,
      location: row.location ?? null,
      category: row.category ?? null,
      bio: row.bio ?? null,
      public_availability: row.public_availability ?? "not_set",
      availability_label: row.availability_label ?? null,
      platforms,
      portfolio,
      badges,
      badge_names: badges.map((badge: any) => badge.name),
    } });
  });

  app.post("/api/kol/public/:username/inquiries", async (c) => {
    const origin = c.req.header("origin");
    if (origin && origin !== "https://kol.djiwatentram.web.id" && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return json(c, { success: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
    }
    const declaredLength = Number(c.req.header("content-length") || 0);
    if (declaredLength > 8192) return json(c, { success: false, error: "PAYLOAD_TOO_LARGE" }, 413);
    let body: any;
    try {
      const raw = await c.req.text();
      if (new TextEncoder().encode(raw).byteLength > 8192) return json(c, { success: false, error: "PAYLOAD_TOO_LARGE" }, 413);
      body = JSON.parse(raw);
    } catch {
      return json(c, { success: false, error: "INVALID_INQUIRY" }, 400);
    }
    if (isInquiryHoneypotFilled(body)) return json(c, { success: true, data: { received: true } }, 201);
    const validated = validatePublicInquiry(body);
    if ("error" in validated) return json(c, { success: false, error: validated.error }, 400);
    const username = publicUsername(c.req.param("username")).toLowerCase();
    const profile = await pool.query(`select id from public.pos_kol_public_profiles where lower(username)=lower($1) limit 1`, [username]);
    if (!profile.rows[0]) return json(c, { success: false, error: "PROFILE_NOT_FOUND" }, 404);
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limiterKey = createHash("sha256").update(ip === "unknown" ? `${ip}:${validated.value.contactEmail || validated.value.contactPhone}` : ip).digest("hex");
    if (isInquiryRateLimited(limiterKey)) return json(c, { success: false, error: "TOO_MANY_REQUESTS" }, 429);
    await pool.query(
      `insert into pos.kol_collaboration_inquiries(kol_id,business_name,contact_name,contact_email,contact_phone,brief,preferred_contact)
       values($1,$2,$3,$4,$5,$6,$7)`,
      [profile.rows[0].id, validated.value.businessName, validated.value.contactName, validated.value.contactEmail, validated.value.contactPhone, validated.value.brief, validated.value.preferredContact],
    );
    return json(c, { success: true, data: { received: true } }, 201);
  });

  app.get("/api/kol/portal/timeline", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const limit = boundedLimit(c.req.query("limit"));
    const type = timelineType(c.req.query("type"));
    const cursor = decodeTimelineCursor(c.req.query("before"));
    if (!limit) return json(c, { success: false, error: "INVALID_LIMIT" }, 400);
    if (timelineType(c.req.query("type")) === undefined) return json(c, { success: false, error: "INVALID_TYPE" }, 400);
    if (c.req.query("before") && !cursor) return json(c, { success: false, error: "INVALID_CURSOR" }, 400);
    const values: unknown[] = [];
    const filters: string[] = [];
    if (cursor) { values.push(cursor.publishedAt, cursor.id); filters.push(`and (pp.published_at,pp.id) < ($${values.length - 1},$${values.length})`); }
    if (type) { values.push(type); filters.push(`and pp.post_type=$${values.length}`); }
    values.push(limit + 1); const result = await pool.query(timelineQuery(filters.join(" "), "", "") .replace("$LIMIT", `$${values.length}`), values);
    const rows = result.rows.slice(0, limit); const next = result.rows.length > limit ? rows[rows.length - 1] : null;
    return json(c, { success: true, data: { items: rows.map(safeTimelineItem), nextCursor: next ? encodeTimelineCursor({ publishedAt: new Date(next.published_at).toISOString(), id: Number(next.id) }) : null, hasMore: Boolean(next) } });
  });

  app.get("/api/kol/public/:username/timeline", async (c) => {
    const username = c.req.param("username").trim().toLowerCase().replace(/^@/, "");
    const limit = boundedLimit(c.req.query("limit")); const type = timelineType(c.req.query("type")); const cursor = decodeTimelineCursor(c.req.query("before"));
    if (!limit) return json(c, { success: false, error: "INVALID_LIMIT" }, 400);
    if (type === undefined) return json(c, { success: false, error: "INVALID_TYPE" }, 400);
    if (c.req.query("before") && !cursor) return json(c, { success: false, error: "INVALID_CURSOR" }, 400);
    const profile = await pool.query(`select c.source_id from pos.kol_creators c join pos.kol_profiles p on p.kol_id=c.source_id where lower(coalesce(p.slug,c.username))=lower($1) and p.is_public=true and c.status <> 'Rejected' limit 1`, [username]);
    if (!profile.rows[0]) return json(c, { success: false, error: "PROFILE_NOT_FOUND" }, 404);
    const values: unknown[] = [profile.rows[0].source_id]; const filters = ["and pp.kol_id=$1"];
    if (cursor) { values.push(cursor.publishedAt, cursor.id); filters.push(`and (pp.published_at,pp.id) < ($${values.length - 1},$${values.length})`); }
    if (type) { values.push(type); filters.push(`and pp.post_type=$${values.length}`); }
    values.push(limit + 1); const result = await pool.query(timelineQuery(filters.join(" "), "", "").replace("$LIMIT", `$${values.length}`), values);
    const rows = result.rows.slice(0, limit); const next = result.rows.length > limit ? rows[rows.length - 1] : null;
    return json(c, { success: true, data: { items: rows.map(safeTimelineItem), nextCursor: next ? encodeTimelineCursor({ publishedAt: new Date(next.published_at).toISOString(), id: Number(next.id) }) : null, hasMore: Boolean(next) } });
  });

  app.get("/api/kol/portal/discovery", async (c) => {
    const current = await context(c, auth, pool); if (current.error) return current.error;
    return creatorDiscovery(c, pool, true);
  });
  async function creatorDiscovery(c: any, db: DbPool, authenticated: boolean) {
    const limit = boundedLimit(c.req.query("limit")); if (!limit) return json(c, { success: false, error: "INVALID_LIMIT" }, 400);
    const cursor = decodeCreatorCursor(c.req.query("before")); if (c.req.query("before") && !cursor) return json(c, { success: false, error: "INVALID_CURSOR" }, 400);
    const values: unknown[] = []; const filters = authenticated ? ["c.status <> 'Rejected'"] : ["c.status <> 'Rejected'", "coalesce(p.is_public,false)=true"];
    const category = c.req.query("category"), location = c.req.query("location"), availability = c.req.query("availability"), q = c.req.query("q");
    if (category) { values.push(category.slice(0, 80)); filters.push(`c.category=$${values.length}`); }
    if (location) { values.push(`%${location.slice(0, 80)}%`); filters.push(`c.location ilike $${values.length}`); }
    if (availability && ["open", "selective", "unavailable", "not_set"].includes(availability)) { values.push(availability); filters.push(`coalesce(p.public_availability,'not_set')=$${values.length}`); }
    if (q && q.trim().length >= 2) { values.push(`%${q.trim().slice(0, 80)}%`); filters.push(`(coalesce(p.display_name,c.name) ilike $${values.length} or coalesce(p.slug,c.username) ilike $${values.length} or coalesce(p.bio,'') ilike $${values.length} or c.category ilike $${values.length})`); }
    if (c.req.query("hasPortfolio") === "true") filters.push("exists(select 1 from pos.kol_portfolio_items pi where pi.kol_id=c.source_id and pi.review_status='approved' and pi.is_public=true)");
    if (cursor) { values.push(cursor.ts, cursor.id); filters.push(`(c.created_at, c.source_id) < ($${values.length - 1}::timestamptz, $${values.length})`); }
    values.push(limit + 1);
    const result = await db.query(`select c.source_id,c.name,c.username,c.avatar_url,c.category,c.location,p.slug,p.display_name,p.bio,p.public_availability,p.availability_label,c.created_at,c.created_at::text as cursor_ts,
      (select count(*) from pos.kol_portfolio_items pi where pi.kol_id=c.source_id and pi.review_status='approved' and pi.is_public=true) portfolio_count
      from pos.kol_creators c left join pos.kol_profiles p on p.kol_id=c.source_id where ${filters.join(" and ")} order by c.created_at desc,c.source_id desc limit $${values.length}`, values);
    const rows = result.rows.slice(0, limit), next = result.rows.length > limit ? rows[rows.length - 1] : null;
    return json(c, { success: true, data: { items: rows.map(safeCreator), nextCursor: next ? encodeCreatorCursor({ ts: String(next.cursor_ts), id: String(next.source_id) }) : null, hasMore: Boolean(next) } });
  }

  app.get("/api/kol/portal/campaign-discovery", async (c) => {
    const current = await context(c, auth, pool); if (current.error) return current.error;
    const limit = boundedLimit(c.req.query("limit")); if (!limit) return json(c, { success: false, error: "INVALID_LIMIT" }, 400);
    const cursor = decodeTimelineCursor(c.req.query("before")); if (c.req.query("before") && !cursor) return json(c, { success: false, error: "INVALID_CURSOR" }, 400);
    const values: unknown[] = []; let where = "where c.status in ('published','closed') and c.public_highlight=true";
    if (cursor) { values.push(cursor.publishedAt, cursor.id); where += ` and (coalesce(c.start_date,c.created_at::date),c.id) < ($1::date,$2)`; }
    values.push(limit + 1);
    const result = await pool.query(`select c.id,c.title,c.description,c.status,c.start_date,c.end_date,c.created_at from pos.kol_campaigns c ${where} order by coalesce(c.start_date,c.created_at::date) desc,c.id desc limit $${values.length}`, values);
    const rows = result.rows.slice(0, limit); const next = result.rows.length > limit ? rows[rows.length - 1] : null;
    return json(c, { success: true, data: { items: rows.map((r: any) => ({ id: r.id, title: r.title, description: r.description ?? null, status: r.status, startDate: r.start_date, endDate: r.end_date })), nextCursor: next ? encodeTimelineCursor({ publishedAt: new Date(next.start_date ?? next.created_at).toISOString(), id: Number(next.id) }) : null, hasMore: Boolean(next) } });
  });

  app.post("/api/kol/portal/timeline", async (c) => {
    const current = await context(c, auth, pool); if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({})); const type = body.type;
    const title = typeof body.title === "string" ? body.title.trim() : ""; const text = typeof body.body === "string" ? body.body.trim() : "";
    if (type !== "text" || title.length < 2 || title.length > 160 || text.length < 1 || text.length > 5000 || (body.mediaUrl != null && !validUrl(body.mediaUrl)) || (body.thumbnailUrl != null && !validUrl(body.thumbnailUrl))) return json(c, { success: false, error: "INVALID_TIMELINE_POST" }, 400);
    const result = await pool.query(`insert into pos.kol_public_posts(kol_id,post_type,title,body,media_url,thumbnail_url,visibility,moderation_status) values($1,'text',$2,$3,$4,$5,'pending','pending') returning id,post_type,title,body,media_url,thumbnail_url,visibility,moderation_status,created_at`, [current.kol.source_id,title,text,body.mediaUrl ?? null,body.thumbnailUrl ?? null]);
    return json(c, { success: true, data: result.rows[0] }, 201);
  });
  app.patch("/api/kol/portal/timeline/:id", async (c) => {
    const current = await context(c, auth, pool); if (current.error) return current.error; const id = Number(c.req.param("id")); const body = await c.req.json().catch(() => ({}));
    if (!Number.isInteger(id) || (body.title !== undefined && (typeof body.title !== "string" || body.title.trim().length < 2 || body.title.trim().length > 160)) || (body.body !== undefined && (typeof body.body !== "string" || body.body.trim().length > 5000)) || (body.mediaUrl !== undefined && body.mediaUrl !== null && !validUrl(body.mediaUrl)) || (body.thumbnailUrl !== undefined && body.thumbnailUrl !== null && !validUrl(body.thumbnailUrl))) return json(c, { success: false, error: "INVALID_TIMELINE_POST" }, 400);
    const result = await pool.query(`update pos.kol_public_posts set title=coalesce($1,title),body=coalesce($2,body),media_url=coalesce($3,media_url),thumbnail_url=coalesce($4,thumbnail_url),visibility='pending',moderation_status='pending',published_at=null,updated_at=now() where id=$5 and kol_id=$6 and post_type='text' returning id,title,body,media_url,thumbnail_url,visibility,moderation_status,updated_at`, [typeof body.title === "string" ? body.title.trim() : null,typeof body.body === "string" ? body.body.trim() : null,body.mediaUrl ?? null,body.thumbnailUrl ?? null,id,current.kol.source_id]);
    if (!result.rows[0]) return json(c, { success: false, error: "TIMELINE_POST_NOT_FOUND" }, 404); return json(c, { success: true, data: result.rows[0] });
  });
  app.delete("/api/kol/portal/timeline/:id", async (c) => { const current = await context(c, auth, pool); if (current.error) return current.error; const result = await pool.query(`update pos.kol_public_posts set visibility='hidden',moderation_status='hidden',updated_at=now() where id=$1 and kol_id=$2 returning id`, [Number(c.req.param("id")),current.kol.source_id]); if (!result.rows[0]) return json(c,{success:false,error:"TIMELINE_POST_NOT_FOUND"},404); return json(c,{success:true,data:result.rows[0]}); });
  app.post("/api/kol/portal/timeline/:id/report", async (c) => { const current = await context(c, auth, pool); if (current.error) return current.error; const body=await c.req.json().catch(()=>({})); if (!REPORT_REASONS.includes(body.reason)) return json(c,{success:false,error:"INVALID_REPORT"},400); const id=Number(c.req.param("id")); const post=await pool.query(`select kol_id from pos.kol_public_posts where id=$1 and visibility='published' and moderation_status='approved'`,[id]); if (!post.rows[0]) return json(c,{success:false,error:"TIMELINE_POST_NOT_FOUND"},404); if(post.rows[0].kol_id===current.kol.source_id) return json(c,{success:false,error:"CANNOT_REPORT_OWN_POST"},400); const result=await pool.query(`insert into pos.kol_public_post_reports(post_id,reporter_kol_id,reason,note) values($1,$2,$3,$4) on conflict(post_id,reporter_kol_id) do update set reason=excluded.reason,note=excluded.note returning id,post_id,reason,status,created_at`,[id,current.kol.source_id,body.reason,typeof body.note==='string'?body.note.trim().slice(0,1000):null]); return json(c,{success:true,data:result.rows[0]},201); });

  app.patch("/api/kol/portal/profile/public-settings", async (c) => { const current=await context(c,auth,pool); if(current.error)return current.error; const body=await c.req.json().catch(()=>({})); if(!["not_set","open","selective","unavailable"].includes(body.publicAvailability)) return json(c,{success:false,error:"INVALID_PUBLIC_AVAILABILITY"},400); const result=await pool.query(`update pos.kol_profiles set public_availability=$1,availability_label=$2,updated_at=now() where kol_id=$3 returning public_availability,availability_label,is_public`,[body.publicAvailability,typeof body.availabilityLabel==='string'?body.availabilityLabel.trim().slice(0,120)||null:null,current.kol.source_id]); if(!result.rows[0])return json(c,{success:false,error:"KOL_PROFILE_NOT_LINKED"},409); return json(c,{success:true,data:result.rows[0]}); });
  app.patch("/api/kol/portal/portfolio/:id/pin", async (c) => { const current=await context(c,auth,pool); if(current.error)return current.error; const id=Number(c.req.param("id")); const body=await c.req.json().catch(()=>({})); const order=body.pinnedOrder===null?null:Number(body.pinnedOrder); if(!Number.isInteger(id)||!(order===null||(order>=1&&order<=3)))return json(c,{success:false,error:"INVALID_PIN_ORDER"},400); const client=await pool.connect(); try { await client.query("begin"); const item=await client.query(`select id from pos.kol_portfolio_items where id=$1 and kol_id=$2 and review_status='approved' and is_public=true for update`,[id,current.kol.source_id]); if(!item.rows[0]){await client.query("rollback");return json(c,{success:false,error:"PORTFOLIO_NOT_PUBLIC"},404);} if(order!==null){await client.query(`update pos.kol_portfolio_items set pinned_order=null where kol_id=$1 and pinned_order=$2`,[current.kol.source_id,order]); const count=await client.query(`select count(*)::int as n from pos.kol_portfolio_items where kol_id=$1 and pinned_order is not null and id<>$2`,[current.kol.source_id,id]); if(Number(count.rows[0].n)>=3){await client.query("rollback");return json(c,{success:false,error:"PIN_LIMIT_REACHED"},409);}} const result=await client.query(`update pos.kol_portfolio_items set pinned_order=$1,updated_at=now() where id=$2 and kol_id=$3 returning id,pinned_order`,[order,id,current.kol.source_id]); await client.query("commit"); return json(c,{success:true,data:result.rows[0]}); } catch(error){await client.query("rollback");throw error;} finally{client.release();} });

}
