import type { Hono } from "hono";

import { createHash } from "node:crypto";
import { isInquiryHoneypotFilled, validatePublicInquiry } from "./kol-inquiry-contract.js";

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

async function context(c: any, auth: AuthApi, pool: DbPool) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId || !email) return { error: json(c, { success: false, error: "UNAUTHORIZED" }, 401) };
  const result = await pool.query(
    `select c.source_id, c.name, c.username, c.avatar_url, c.location, c.category, c.status, c.public_reason, c.application_data,
            p.display_name, p.slug, p.bio, p.is_public, p.public_availability, p.availability_label
       from pos.kol_creators c
       left join pos.kol_profiles p on p.kol_id = c.source_id
      where c.auth_user_id = $1
      limit 1`,
    [userId],
  );
  const kol = result.rows[0];
  if (!kol) return { error: json(c, { success: false, error: "KOL_PROFILE_NOT_LINKED" }, 409) };
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
    if (!token) return json(c, { success: false, error: "INVALID_INVITE" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isBookingDateFromTomorrow(date)) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
    const invite = await inviteLookup(token);
    if (!invite) return json(c, { success: false, error: "INVITE_NOT_FOUND" }, 404);
    if (invite.source_id !== current.kol.source_id) return json(c, { success: false, error: "INVITE_NOT_LINKED" }, 403);
    const result = await pool.query(`select * from pos.kol_request_invited_visit_booking($1,$2,$3,$4)`, [invite.invite_id, date, typeof body.visitNote === "string" ? body.visitNote.trim().slice(0, 500) : null, current.userId]).catch((error: any) => ({ error }));
    if ((result as any).error) {
      const error = (result as any).error;
      if (error?.code === "23505") return json(c, { success: false, error: error?.message === "creator already has an active visit booking" ? "CREATOR_ALREADY_HAS_ACTIVE_BOOKING" : "DATE_ALREADY_BOOKED" }, 409);
      if (error?.code === "P0001" && ["INVALID_BOOKING_DATE","DATE_ALREADY_BOOKED","CREATOR_ALREADY_HAS_ACTIVE_BOOKING","INVITATION_NOT_VALID"].includes(error?.message)) return json(c, { success: false, error: error.message }, error.message === "DATE_ALREADY_BOOKED" ? 409 : 400);
      throw error;
    }
    return json(c, { success: true, data: (result as any).rows?.[0] ?? null }, 201);
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
         values ($1, $2, $3, false)
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
    const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : undefined;
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

  app.get("/api/kol/portal/campaigns", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const result = await pool.query(
      `select c.*, a.id as assignment_id, a.status as assignment_status, a.accepted_at, a.completed_at
         from pos.kol_campaigns c
         left join pos.kol_campaign_assignments a on a.campaign_id = c.id and a.kol_id = $1
        where c.status = 'published' or a.id is not null
        order by coalesce(c.start_date, c.created_at::date) asc, c.created_at desc`,
      [current.kol.source_id],
    );
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/campaigns/:id/respond", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const status = body.status === "accepted" ? "accepted" : body.status === "declined" ? "declined" : null;
    if (!status) return json(c, { success: false, error: "INVALID_CAMPAIGN_RESPONSE" }, 400);
    const result = await pool.query(
      `update pos.kol_campaign_assignments a set status = $1, accepted_at = case when $1='accepted' then now() else accepted_at end, updated_at = now() from pos.kol_campaigns c where a.id = $2 and a.campaign_id=c.id and a.kol_id=$3 and a.status='invited' and c.status='published' returning a.*`,
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
    const result = await pool.query(`insert into pos.kol_content_submissions (campaign_assignment_id,deliverable_type,content_url,published_at,insight_screenshot_url,status) select a.id,$1,$2,$3,$4,'submitted' from pos.kol_campaign_assignments a where a.id=$5 and a.kol_id=$6 and a.status in ('accepted','active') returning *`, [typeof body.deliverableType === "string" ? body.deliverableType.trim().slice(0, 120) || "content" : "content", contentUrl, typeof body.publishedAt === "string" ? body.publishedAt : null, typeof body.screenshotUrl === "string" && validUrl(body.screenshotUrl) ? body.screenshotUrl.trim() : null, assignmentId, current.kol.source_id]);
    if (!result.rows[0]) return json(c, { success: false, error: "CAMPAIGN_ASSIGNMENT_NOT_FOUND" }, 404);
    await pool.query(`update pos.kol_campaign_assignments set status='active', updated_at=now() where id=$1 and kol_id=$2`, [assignmentId, current.kol.source_id]);
    return json(c, { success: true, data: result.rows[0] }, 201);
  });

  app.patch("/api/kol/portal/proofs/:id", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const contentUrl = typeof body.contentUrl === "string" ? body.contentUrl.trim() : "";
    if (!validUrl(contentUrl)) return json(c, { success: false, error: "INVALID_CONTENT_PROOF" }, 400);
    const result = await pool.query(`update pos.kol_content_submissions p set content_url=$1, insight_screenshot_url=coalesce($2,insight_screenshot_url), status='submitted', reviewed_at=null, review_note=null, updated_at=now() from pos.kol_campaign_assignments a where p.id=$3 and p.campaign_assignment_id=a.id and a.kol_id=$4 and p.status='needs_revision' returning p.*`, [contentUrl, typeof body.screenshotUrl === "string" && validUrl(body.screenshotUrl) ? body.screenshotUrl.trim() : null, Number(c.req.param("id")), current.kol.source_id]);
    if (!result.rows[0]) return json(c, { success: false, error: "CONTENT_PROOF_NOT_FOUND" }, 404);
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

  app.get("/api/kol/portal/visit-calendar", async (c) => {
    const result = await pool.query(`select booking_date, status, creator_name, username from public.pos_kol_visit_calendar where booking_date >= ((now() at time zone 'Asia/Jakarta')::date) order by booking_date asc limit 120`);
    return json(c, { success: true, data: result.rows });
  });

  app.post("/api/kol/portal/visit-calendar", async (c) => {
    const current = await context(c, auth, pool);
    if (current.error) return current.error;
    const body = await c.req.json().catch(() => ({}));
    const date = typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isBookingDateFromTomorrow(date)) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
    const result = await pool.query(`select * from pos.kol_request_visit_booking($1,$2,$3)`, [current.kol.source_id, date, typeof body.visitNote === "string" ? body.visitNote.trim().slice(0, 500) : null]).catch((error: any) => ({ error }));
    if ((result as any).error) {
      const error = (result as any).error;
      if (error?.code === "23505") return json(c, { success: false, error: error?.message === "creator already has an active visit booking" ? "CREATOR_ALREADY_HAS_ACTIVE_BOOKING" : "DATE_ALREADY_BOOKED" }, 409);
      if (error?.code === "22023") return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
      throw error;
    }
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
    if (origin && origin !== "https://kolmarketing.yumme.id" && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
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
    if (!validated.ok) return json(c, { success: false, error: validated.error }, 400);
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
    const cursor = decodeTimelineCursor(c.req.query("before")); if (c.req.query("before") && !cursor) return json(c, { success: false, error: "INVALID_CURSOR" }, 400);
    const values: unknown[] = []; const filters = authenticated ? ["c.status <> 'Rejected'"] : ["c.status <> 'Rejected'", "coalesce(p.is_public,false)=true"];
    const category = c.req.query("category"), location = c.req.query("location"), availability = c.req.query("availability"), q = c.req.query("q");
    if (category) { values.push(category.slice(0, 80)); filters.push(`c.category=$${values.length}`); }
    if (location) { values.push(`%${location.slice(0, 80)}%`); filters.push(`c.location ilike $${values.length}`); }
    if (availability && ["open", "selective", "unavailable", "not_set"].includes(availability)) { values.push(availability); filters.push(`coalesce(p.public_availability,'not_set')=$${values.length}`); }
    if (q && q.trim().length >= 2) { values.push(`%${q.trim().slice(0, 80)}%`); filters.push(`(coalesce(p.display_name,c.name) ilike $${values.length} or coalesce(p.slug,c.username) ilike $${values.length} or coalesce(p.bio,'') ilike $${values.length} or c.category ilike $${values.length})`); }
    if (c.req.query("hasPortfolio") === "true") filters.push("exists(select 1 from pos.kol_portfolio_items pi where pi.kol_id=c.source_id and pi.review_status='approved' and pi.is_public=true)");
    if (cursor) { values.push(cursor.publishedAt); filters.push(`c.created_at < $${values.length}`); }
    values.push(limit + 1);
    const result = await db.query(`select c.source_id,c.name,c.username,c.avatar_url,c.category,c.location,p.slug,p.display_name,p.bio,p.public_availability,p.availability_label,c.created_at,
      (select count(*) from pos.kol_portfolio_items pi where pi.kol_id=c.source_id and pi.review_status='approved' and pi.is_public=true) portfolio_count
      from pos.kol_creators c left join pos.kol_profiles p on p.kol_id=c.source_id where ${filters.join(" and ")} order by c.created_at desc,c.source_id desc limit $${values.length}`, values);
    const rows = result.rows.slice(0, limit), next = result.rows.length > limit ? rows[rows.length - 1] : null;
    return json(c, { success: true, data: { items: rows.map(safeCreator), nextCursor: next ? encodeTimelineCursor({ publishedAt: new Date(next.created_at).toISOString(), id: Number(next.id ?? 1) }) : null, hasMore: Boolean(next) } });
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
