import type { Hono } from "hono";

type DbPool = { connect: () => Promise<any>; query: (text: string, values?: unknown[]) => Promise<any> };
type AuthApi = { api: { getSession: (input: { headers: Headers }) => Promise<any> } };

type AppLike = Hono<any>;

function json(c: any, body: unknown, status = 200) {
  return c.json(body, status, { "Cache-Control": "no-store" });
}

async function context(c: any, auth: AuthApi, pool: DbPool) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const userId = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId || !email) return { error: json(c, { success: false, error: "UNAUTHORIZED" }, 401) };
  const result = await pool.query(
    `select c.source_id, c.name, c.username, c.avatar_url, c.location, c.category, c.status,
            p.display_name, p.slug, p.bio, p.is_public
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

function validUrl(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 8 || value.trim().length > 2048) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function registerKolPortalRoutes(app: AppLike, auth: AuthApi, pool: DbPool) {
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
    const result = await pool.query(`select * from pos.kol_request_visit_booking($1,$2,$3)`, [current.kol.source_id, date, typeof body.visitNote === "string" ? body.visitNote.trim().slice(0, 500) : null]).catch((error: any) => ({ error }));
    if ((result as any).error) {
      const error = (result as any).error;
      if (error?.code === "23505") return json(c, { success: false, error: "DATE_ALREADY_BOOKED" }, 409);
      if (error?.code === "22023") return json(c, { success: false, error: "INVALID_BOOKING_DATE" }, 400);
      throw error;
    }
    return json(c, { success: true, data: (result as any).rows?.[0] ?? null }, 201);
  });

  app.get("/api/kol/public/:username", async (c) => {
    const username = c.req.param("username").trim().toLowerCase();
    const result = await pool.query(`select * from public.pos_kol_public_profiles where lower(username)=lower($1) limit 1`, [username]);
    if (!result.rows[0]) return json(c, { success: false, error: "PROFILE_NOT_FOUND" }, 404);
    return json(c, { success: true, data: result.rows[0] });
  });
}
