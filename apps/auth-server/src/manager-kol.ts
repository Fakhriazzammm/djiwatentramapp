import type { Hono } from "hono";
import type { Pool } from "pg";
import { createHash, randomBytes } from "node:crypto";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text } from "./manager-guards.js";

/**
 * Modul KOL Marketing untuk Manager. Satu pintu: semua baca/tulis lewat
 * `/api/manager/kol`, guard Better Auth + mgr_memberships role `manager`.
 * Aturan status, transisi visit, dan bentuk data disamakan dengan
 * apps/admin (-kol) dan edge function kol-portal-admin/kol-public.
 */
type Auth = typeof defaultAuth;

const CAMPAIGN_STATUSES = ["draft", "published", "closed", "archived"];
const CREATOR_STATUSES = new Set([
  "Potential", "Belum Dihubungi", "Sudah Dihubungi", "Negotiation",
  "Scheduled Visit", "Collaboration", "Completed", "Rejected",
]);
const SUBMISSION_STATUSES = new Set(["submitted", "needs_revision", "approved", "rejected"]);
const VISIT_STATUSES = new Set(["requested", "confirmed", "cancelled", "completed", "no_show"]);
const VISIT_TRANSITIONS: Record<string, string[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
};
const INQUIRY_STATUSES = new Set(["new", "reviewing", "contacted", "declined", "closed"]);
const INVITE_ACTIVE = ["created", "opened", "authenticated", "linked", "schedule_selected"];
const KOL_PORTAL_URL = "https://kol.djiwatentram.web.id";

const newInviteToken = () => randomBytes(32).toString("hex");
const inviteHash = (token: string) => createHash("sha256").update(token).digest("hex");
const invitedUrl = (token: string) => `${KOL_PORTAL_URL}/invite/${token}`;
const isoDate = (v: unknown) => {
  const value = text(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};
const isManager = (value: unknown) => value === "manager";

export function registerManagerKol(app: Hono, auth: Auth, pool: Pool) {
  const { member } = createGuards(auth, pool);

  const guard = async (c: any) => {
    const m = await member(c);
    if ("res" in m) return m;
    // KOL hanya untuk Manager; Supervisor/Purchasing tidak melihat modul ini.
    if (!isManager(m.role)) return { res: json({ success: false, error: "FORBIDDEN" }, 403) } as const;
    return m;
  };

  const snapshot = async () => {
    const [campaigns, assignments, submissions, badges, visits, inquiries, reports, creators, invites] = await Promise.all([
      pool.query(`select * from pos.kol_campaigns order by created_at desc`),
      pool.query(`select a.id, a.campaign_id, a.kol_id, a.status, a.admin_note, a.accepted_at, a.completed_at, a.created_at,
                         json_build_object('name', c.name, 'username', c.username) as kol_creators
                    from pos.kol_campaign_assignments a
                    left join pos.kol_creators c on c.source_id = a.kol_id
                   order by a.created_at desc limit 1000`),
      pool.query(`select s.*,
                         json_build_object(
                           'id', a.id, 'kol_id', a.kol_id, 'campaign_id', a.campaign_id,
                           'kol_creators', json_build_object('name', c.name, 'username', c.username),
                           'kol_campaigns', json_build_object('title', cp.title)
                         ) as kol_campaign_assignments
                    from pos.kol_content_submissions s
                    join pos.kol_campaign_assignments a on a.id = s.campaign_assignment_id
                    left join pos.kol_creators c on c.source_id = a.kol_id
                    left join pos.kol_campaigns cp on cp.id = a.campaign_id
                   order by s.created_at desc limit 300`),
      pool.query(`select b.kol_id, json_build_object('code', d.code, 'name', d.name) as kol_badges
                    from pos.kol_creator_badges b
                    join pos.kol_badges d on d.id = b.badge_id
                   order by b.awarded_at desc limit 500`),
      pool.query(`select b.*,
                         json_build_object(
                           'name', c.name, 'username', c.username, 'avatar_url', c.avatar_url,
                           'kol_private_contacts', (
                             select json_build_object('whatsapp', pc.whatsapp, 'email', pc.email)
                               from pos.kol_private_contacts pc where pc.kol_id = c.source_id limit 1
                           )
                         ) as kol_creators
                    from pos.kol_visit_bookings b
                    left join pos.kol_creators c on c.source_id = b.kol_id
                   order by b.booking_date asc limit 500`),
      pool.query(`select i.*, json_build_object('name', c.name, 'username', c.username) as kol_creators
                    from pos.kol_collaboration_inquiries i
                    left join pos.kol_creators c on c.source_id = i.kol_id
                   order by i.created_at desc limit 300`),
      pool.query(`select r.id, r.post_id, r.reporter_kol_id, r.reason, r.note, r.status, r.created_at,
                         json_build_object(
                           'id', p.id, 'kol_id', p.kol_id, 'post_type', p.post_type, 'title', p.title, 'body', p.body,
                           'media_url', p.media_url, 'visibility', p.visibility, 'moderation_status', p.moderation_status,
                           'kol_creators', json_build_object('name', c.name, 'username', c.username)
                         ) as kol_public_posts
                    from pos.kol_public_post_reports r
                    left join pos.kol_public_posts p on p.id = r.post_id
                    left join pos.kol_creators c on c.source_id = p.kol_id
                   where r.status in ('open', 'reviewing')
                   order by r.created_at desc limit 200`),
      pool.query(`select c.source_id, c.name, c.username, c.avatar_url, c.location, c.category, c.status,
                         c.public_reason, c.application_data, c.visit_booking_eligible,
                         (c.auth_user_id is not null) as linked, c.created_at,
                         coalesce(pf.platforms, '[]'::json) as kol_platforms,
                         pc.contact, pr.profile
                    from pos.kol_creators c
                    left join lateral (
                      select json_agg(json_build_object(
                        'platform', p.platform, 'username', p.username,
                        'followers', p.followers, 'profile_url', p.profile_url
                      ) order by p.followers desc) as platforms
                        from pos.kol_platforms p where p.kol_id = c.source_id
                    ) pf on true
                    left join lateral (
                      select json_build_object(
                        'whatsapp', x.whatsapp, 'email', x.email,
                        'manager_name', x.manager_name, 'manager_contact', x.manager_contact
                      ) as contact
                        from pos.kol_private_contacts x where x.kol_id = c.source_id limit 1
                    ) pc on true
                    left join lateral (
                      select json_build_object(
                        'slug', k.slug, 'display_name', k.display_name, 'bio', k.bio,
                        'is_public', k.is_public, 'public_availability', k.public_availability
                      ) as profile
                        from pos.kol_profiles k where k.kol_id = c.source_id limit 1
                    ) pr on true
                   order by c.created_at desc limit 2000`),
      pool.query(`select i.id, i.kol_id, i.status, i.expires_at, i.created_at, i.updated_at, i.linked_auth_user_id,
                         json_build_object('name', c.name, 'username', c.username) as kol_creators
                    from pos.kol_visit_invitations i
                    left join pos.kol_creators c on c.source_id = i.kol_id
                   order by i.created_at desc limit 500`),
    ]);
    return {
      campaigns: campaigns.rows,
      assignments: assignments.rows,
      submissions: submissions.rows,
      badges: badges.rows,
      visits: visits.rows,
      inquiries: inquiries.rows,
      reports: reports.rows,
      creators: creators.rows,
      invites: invites.rows,
    };
  };

  const issueInvite = async (kolId: string, expiresAt: Date) => {
    const creator = await pool.query(
      `select source_id, name from pos.kol_creators where source_id = $1 and status <> 'Rejected'`,
      [kolId],
    );
    if (!creator.rows[0]) return { error: json({ success: false, error: "CREATOR_NOT_ELIGIBLE" }, 404) } as const;
    const token = newInviteToken();
    try {
      const inserted = await pool.query(
        `insert into pos.kol_visit_invitations (kol_id, token_hash, status, expires_at, created_by, metadata)
         values ($1, $2, 'created', $3, 'manager', '{}'::jsonb)
         returning id, status, expires_at`,
        [kolId, inviteHash(token), expiresAt.toISOString()],
      );
      const row = inserted.rows[0];
      return {
        data: { invitationId: row.id, inviteUrl: invitedUrl(token), expiresAt: row.expires_at, status: row.status },
      } as const;
    } catch (error: any) {
      if (error?.code === "23505") return { error: json({ success: false, error: "CREATOR_HAS_ACTIVE_INVITE" }, 409) } as const;
      throw error;
    }
  };

  const readExpiry = (value: unknown) => {
    const raw = text(value, 40);
    const parsed = raw ? new Date(raw) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now() ? null : parsed;
  };

  /* ---------------- GET: satu snapshot untuk semua tab ---------------- */
  app.get("/api/manager/kol", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    return json({ success: true, data: await snapshot() });
  });

  /* ---------------- POST: semua aksi modul KOL ---------------- */
  app.post("/api/manager/kol", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = text(b.action, 40);
    const actor = `manager:${m.userId}`;

    if (action === "overview" || action === "creator_list" || action === "invite_list") return json({ success: true, data: await snapshot() });

    if (action === "creator_status") {
      const id = text(b.id, 120);
      const status = text(b.status, 40);
      if (!id || !CREATOR_STATUSES.has(status)) return json({ success: false, error: "INVALID_CREATOR_STATUS" }, 400);
      const r = await pool.query(
        `update pos.kol_creators set status = $2, updated_at = now()
          where source_id = $1 returning source_id, status, name, username, location, category`,
        [id, status],
      );
      if (!r.rows[0]) return json({ success: false, error: "CREATOR_NOT_FOUND" }, 404);
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "creator_delete") {
      const ids = Array.isArray(b.ids)
        ? b.ids.map((x) => String(x)).filter(Boolean)
        : [text(b.id, 120)].filter(Boolean);
      if (!ids.length || ids.length > 100) return json({ success: false, error: "INVALID_KOL_ID" }, 400);
      await pool.query(`delete from pos.kol_creators where source_id = any($1::text[])`, [ids]);
      return json({ success: true, data: { deleted: ids.length } });
    }

    if (action === "creator_eligibility") {
      const kolId = text(b.kolId, 120);
      if (!kolId || typeof b.eligible !== "boolean") return json({ success: false, error: "INVALID_ELIGIBILITY" }, 400);
      const note = text(b.note, 1000);
      const client = await pool.connect();
      try {
        await client.query("begin");
        const prior = await client.query(
          `select source_id, visit_booking_eligible, status from pos.kol_creators where source_id = $1 for update`,
          [kolId],
        );
        if (!prior.rows[0]) {
          await client.query("rollback");
          return json({ success: false, error: "CREATOR_NOT_FOUND" }, 404);
        }
        if (b.eligible && prior.rows[0].status === "Rejected") {
          await client.query("rollback");
          return json({ success: false, error: "REJECTED_CREATOR_CANNOT_BOOK" }, 409);
        }
        const updated = await client.query(
          `update pos.kol_creators
              set visit_booking_eligible = $2, visit_booking_eligible_by = $3,
                  visit_booking_eligible_at = now(), visit_booking_eligibility_note = nullif($4, ''),
                  updated_at = now()
            where source_id = $1
            returning source_id, visit_booking_eligible, visit_booking_eligible_at, visit_booking_eligibility_note`,
          [kolId, b.eligible, actor, note],
        );
        await client.query(
          `insert into pos.kol_visit_booking_events (kol_id, event_type, actor_type, actor_id, payload)
           values ($1, 'booking_eligibility_changed', 'admin', $2, $3::jsonb)`,
          [kolId, actor, JSON.stringify({ from: prior.rows[0].visit_booking_eligible, to: b.eligible, note })],
        );
        await client.query("commit");
        return json({ success: true, data: updated.rows[0] });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }

    if (action === "badge_award") {
      const kolId = text(b.kolId, 120);
      const code = text(b.code, 80);
      const badge = await pool.query(`select id from pos.kol_badges where code = $1 and is_active = true`, [code]);
      if (!badge.rows[0]) return json({ success: false, error: "BADGE_NOT_FOUND" }, 404);
      const r = await pool.query(
        `insert into pos.kol_creator_badges (kol_id, badge_id, awarded_by, source_event, is_visible)
         values ($1, $2, $3, 'manual_manager', true)
         on conflict (kol_id, badge_id) do update
           set awarded_by = excluded.awarded_by, source_event = excluded.source_event, is_visible = true
         returning kol_id, badge_id, awarded_at`,
        [kolId, badge.rows[0].id, actor],
      );
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "invite_create" || action === "invite_resend") {
      let kolId = text(b.kolId, 120);
      if (action === "invite_resend") {
        const invitationId = text(b.invitationId, 120);
        const old = await pool.query(`select id, kol_id from pos.kol_visit_invitations where id = $1`, [invitationId]);
        if (!old.rows[0]) return json({ success: false, error: "INVITE_NOT_FOUND" }, 404);
        kolId = old.rows[0].kol_id;
        await pool.query(
          `update pos.kol_visit_invitations set status = 'revoked', revoked_at = now(), updated_at = now() where id = $1`,
          [invitationId],
        );
      }
      if (!kolId) return json({ success: false, error: "CREATOR_REQUIRED" }, 400);
      const expiresAt = readExpiry(b.expiresAt);
      if (!expiresAt) return json({ success: false, error: "INVALID_EXPIRY" }, 400);
      const issued = await issueInvite(kolId, expiresAt);
      if ("error" in issued) return issued.error;
      return json({ success: true, data: issued.data });
    }

    if (action === "invite_revoke") {
      const invitationId = text(b.invitationId, 120);
      if (!invitationId) return json({ success: false, error: "INVITE_REQUIRED" }, 400);
      const r = await pool.query(
        `update pos.kol_visit_invitations
            set status = 'revoked', revoked_at = now(), updated_at = now()
          where id = $1 and status = any($2::text[])
          returning id, status`,
        [invitationId, INVITE_ACTIVE],
      );
      if (!r.rows[0]) return json({ success: false, error: "INVITE_NOT_FOUND" }, 404);
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "campaign_save") {
      const id = Number(b.id);
      const slug = text(b.slug, 120).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      const title = text(b.title, 160);
      if (!slug || !title) return json({ success: false, error: "CAMPAIGN_SLUG_TITLE_REQUIRED" }, 400);
      const status = CAMPAIGN_STATUSES.includes(text(b.status, 20)) ? text(b.status, 20) : "draft";
      const values = [
        slug, title, text(b.description, 4000), text(b.location, 160) || null,
        text(b.benefitDescription, 1000), text(b.deliverableSummary, 2000),
        isoDate(b.applicationDeadline), isoDate(b.startDate), isoDate(b.endDate), status,
      ];
      const r = Number.isInteger(id) && id > 0
        ? await pool.query(
            `update pos.kol_campaigns
                set slug = $1, title = $2, description = $3, location = $4, benefit_description = $5,
                    deliverable_summary = $6, application_deadline = $7, start_date = $8, end_date = $9,
                    status = $10, updated_at = now()
              where id = $11 returning *`,
            [...values, id],
          )
        : await pool.query(
            `insert into pos.kol_campaigns
               (slug, title, description, location, benefit_description, deliverable_summary,
                application_deadline, start_date, end_date, status, created_by)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
            [...values, actor],
          );
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "campaign_assign") {
      const campaignId = Number(b.campaignId);
      const kolId = text(b.kolId, 120);
      if (!Number.isInteger(campaignId) || !kolId) return json({ success: false, error: "INVALID_ASSIGNMENT" }, 400);
      const r = await pool.query(
        `insert into pos.kol_campaign_assignments (campaign_id, kol_id, status, assigned_by, admin_note, updated_at)
         values ($1, $2, 'invited', $4, nullif($3, ''), now())
         on conflict (campaign_id, kol_id) do update
           set status = 'invited', assigned_by = excluded.assigned_by,
               admin_note = excluded.admin_note, updated_at = now()
         returning *`,
        [campaignId, kolId, text(b.note, 1000), actor],
      );
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "submission_review") {
      const id = Number(b.id);
      const status = text(b.status, 30);
      if (!Number.isInteger(id) || !SUBMISSION_STATUSES.has(status)) {
        return json({ success: false, error: "INVALID_SUBMISSION_REVIEW" }, 400);
      }
      const r = await pool.query(
        `update pos.kol_content_submissions
            set status = $2, review_note = nullif($3, ''), reviewed_by = $4, reviewed_at = now(), updated_at = now()
          where id = $1 returning *`,
        [id, status, text(b.note, 1000), actor],
      );
      if (!r.rows[0]) return json({ success: false, error: "SUBMISSION_NOT_FOUND" }, 404);
      if (status === "approved") {
        await pool.query(
          `update pos.kol_campaign_assignments
              set status = 'completed', completed_at = now(), updated_at = now()
            where id = $1`,
          [r.rows[0].campaign_assignment_id],
        );
      }
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "inquiry_update") {
      const id = Number(b.id);
      const status = text(b.status, 30);
      if (!Number.isInteger(id) || id < 1 || !INQUIRY_STATUSES.has(status)) {
        return json({ success: false, error: "INVALID_INQUIRY_STATUS" }, 400);
      }
      const r = await pool.query(
        `update pos.kol_collaboration_inquiries
            set status = $2, admin_note = nullif($3, ''), updated_at = now()
          where id = $1 returning id, status, admin_note, updated_at`,
        [id, status, text(b.adminNote, 2000)],
      );
      if (!r.rows[0]) return json({ success: false, error: "INQUIRY_NOT_FOUND" }, 404);
      return json({ success: true, data: r.rows[0] });
    }

    if (action === "visit_update") {
      const id = Number(b.id);
      const status = text(b.status, 30);
      if (!Number.isInteger(id) || id < 1 || !VISIT_STATUSES.has(status)) {
        return json({ success: false, error: "INVALID_BOOKING_UPDATE" }, 400);
      }
      const note = text(b.note, 1000);
      const client = await pool.connect();
      try {
        await client.query("begin");
        const current = await client.query(
          `select id, kol_id, status from pos.kol_visit_bookings where id = $1 for update`,
          [id],
        );
        if (!current.rows[0]) {
          await client.query("rollback");
          return json({ success: false, error: "BOOKING_NOT_FOUND" }, 404);
        }
        const from = current.rows[0].status as string;
        if (!VISIT_TRANSITIONS[from]?.includes(status)) {
          await client.query("rollback");
          return json({ success: false, error: "INVALID_STATUS_TRANSITION" }, 409);
        }
        const updated = await client.query(
          `update pos.kol_visit_bookings
              set status = $2, admin_note = nullif($3, ''),
                  confirmed_at = case when $2 = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
                  cancelled_at = case when $2 = 'cancelled' then now() else cancelled_at end,
                  updated_at = now()
            where id = $1 returning *`,
          [id, status, note],
        );
        await client.query(
          `insert into pos.kol_visit_booking_events (booking_id, kol_id, event_type, actor_type, actor_id, payload)
           values ($1, $2, 'booking_status_changed', 'admin', $3, $4::jsonb)`,
          [id, current.rows[0].kol_id, actor, JSON.stringify({ from, to: status, note })],
        );
        await client.query("commit");
        return json({ success: true, data: updated.rows[0] });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }

    if (action === "report_resolve") {
      const id = Number(b.id);
      const decision = text(b.decision, 20);
      if (!Number.isInteger(id) || id < 1 || !["hide", "dismiss"].includes(decision)) {
        return json({ success: false, error: "INVALID_MODERATION_DECISION" }, 400);
      }
      const rep = await pool.query(`select id, post_id from pos.kol_public_post_reports where id = $1`, [id]);
      if (!rep.rows[0]) return json({ success: false, error: "REPORT_NOT_FOUND" }, 404);
      const note = text(b.note, 1000);
      const client = await pool.connect();
      try {
        await client.query("begin");
        if (decision === "hide") {
          await client.query(
            `update pos.kol_public_posts
                set visibility = 'hidden', moderation_status = 'hidden',
                    moderation_note = nullif($2, ''), updated_at = now()
              where id = $1`,
            [rep.rows[0].post_id, note],
          );
          await client.query(
            `update pos.kol_public_post_reports
                set status = 'resolved', reviewed_by = $2, reviewed_at = now()
              where post_id = $1 and status in ('open', 'reviewing')`,
            [rep.rows[0].post_id, actor],
          );
        } else {
          await client.query(
            `update pos.kol_public_post_reports
                set status = 'dismissed', reviewed_by = $2, reviewed_at = now()
              where id = $1`,
            [id, actor],
          );
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      return json({ success: true, data: { id, decision } });
    }

    return json({ success: false, error: "UNKNOWN_ACTION" }, 400);
  });
}
