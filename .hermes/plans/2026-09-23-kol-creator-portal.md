# KOL Creator Portal & Visit Booking Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Mengembangkan `apps/kol` dari form pendaftaran menjadi Creator Portal lengkap: profile, edit profile, portfolio, campaign, submission bukti konten, notifikasi, public profile, badge, dan booking kedatangan creator dengan kapasitas maksimum satu creator per hari.

**Architecture:** `apps/kol` tetap menjadi frontend canonical untuk creator (`kolmarketing.djiwatentram.web.id`). `apps/admin` tetap menjadi satu-satunya tempat admin mengelola KOL, campaign, approval, badge, dan booking override. Data private tidak dibaca langsung oleh browser; semua mutation sensitif melalui Better Auth KOL API atau Edge Function yang melakukan validasi server-side. Booking creator dibuat sebagai domain terpisah dari booking customer, dengan unique constraint per tanggal dan timezone bisnis Asia/Jakarta.

**Tech Stack:** React 19 + Vite + TypeScript, Better Auth, Hono auth server, Supabase PostgreSQL/schema `pos`, Supabase Edge Functions, Tailwind CSS v4, Framer Motion, lucide-react.

**Scope:**
1. Profile KOL lengkap.
2. Edit profile.
3. Portfolio konten.
4. Campaign kolaborasi.
5. Pengiriman bukti konten.
6. Notifikasi.
7. Public profile creator.
8. Badge creator.
9. Booking calendar kedatangan creator, maksimum satu creator per hari, nama creator tampil pada kalender untuk mencegah benturan.

**Non-goals:**
- Tidak membuat admin baru di `apps/kol`.
- Tidak mengganti sistem booking customer yang sudah ada.
- Tidak menampilkan email, WhatsApp, manager contact, atau data private creator pada public profile/calendar.
- Tidak memberikan badge atau status berdasarkan data yang belum disetujui admin.

---

## Current State Audit

| Area | Kondisi saat ini | Gap |
|---|---|---|
| Auth | Better Auth Google + `user_type=kol` + claim endpoint | Sudah ada, perlu dipakai sebagai guard seluruh portal |
| Creator profile | `pos.kol_creators`, platform, private contacts, `application_data` | Belum ada edit profile terkontrol dan public profile final |
| Frontend | `apps/kol/src/App.tsx` monolithic; profile route dasar | Perlu pecah menjadi komponen/route portal agar aman dirawat |
| Admin | `apps/admin` memiliki KOL data/collaboration pages | Perlu fitur campaign, submission review, badge, booking management |
| Portfolio | Belum ada tabel | Perlu table + approval status + public visibility |
| Campaign | Ada `pos.kol_collaborations` legacy/basic | Perlu model campaign, assignment, deliverables, status lifecycle |
| Notification | Belum ada KOL notification center | Perlu durable notification + dedupe/read state |
| Booking | Ada booking customer dan capacity tables | Perlu domain creator visit dengan unique date capacity 1 |
| Public profile | Ada route profile authenticated dasar | Perlu public-safe view dan route creator slug |

**Catatan:** Screenshot/visual current app dapat berasal dari build lama. Implementasi harus memverifikasi source `apps/kol/src/App.tsx` dan bundle production sebelum mengubah UI.

---

## Dependency Graph

```text
Level 0 — prerequisite
  ├── A. Domain/schema contract + RLS/grants
  ├── B. KOL API authorization helper
  └── C. Portal route/component shell

Level 1 — dapat dikerjakan paralel setelah Level 0
  ├── D. Profile lengkap + edit profile
  ├── E. Portfolio
  ├── F. Notification center
  └── G. Badge read model

Level 2 — dependensi profile/portfolio/notification
  ├── H. Campaign + campaign assignment
  ├── I. Content submission + review
  ├── J. Public creator profile
  └── K. Creator visit booking calendar

Level 3 — integrasi dan release
  ├── L. Admin workflow integration
  ├── M. notification event/dedupe worker integration
  ├── N. production data/backfill verification
  └── O. mobile/desktop QA + deploy rollback check
```

---

## Data Model Proposal

### Existing tables to preserve

- `pos.kol_creators`
- `pos.kol_platforms`
- `pos.kol_private_contacts`
- `pos.kol_collaborations`
- `public.user` with `user_type` and Better Auth session relationship

### Additive tables

1. `pos.kol_profiles`
   - `kol_id` primary key → `pos.kol_creators.source_id`
   - `auth_user_id` unique nullable during migration, then required for active portal records
   - `bio`, `display_name`, `slug`, `is_public`, `profile_completed_at`
   - `created_at`, `updated_at`

2. `pos.kol_portfolio_items`
   - `id`, `kol_id`, `platform`, `title`, `content_url`, `thumbnail_url`
   - `description`, `published_at`, `review_status` (`pending|approved|rejected`), `review_note`
   - `is_public`, timestamps
   - unique normalized URL per creator

3. `pos.kol_campaigns`
   - `id`, `slug`, `title`, `description`, `location`
   - `benefit_description`, `deliverable_summary`, `application_deadline`, `start_date`, `end_date`
   - `status` (`draft|published|closed|archived`), `created_by`, timestamps

4. `pos.kol_campaign_assignments`
   - `id`, `campaign_id`, `kol_id`, `status` (`invited|accepted|declined|active|completed|cancelled`)
   - `assigned_by`, `accepted_at`, `completed_at`, `admin_note`, timestamps
   - unique `(campaign_id, kol_id)`

5. `pos.kol_content_submissions`
   - `id`, `campaign_assignment_id`, `deliverable_type`, `content_url`
   - `insight_screenshot_url`, `published_at`, `status` (`submitted|needs_revision|approved|rejected`)
   - `review_note`, `reviewed_by`, `reviewed_at`, timestamps

6. `pos.kol_badges`
   - `id`, `code`, `name`, `description`, `icon`, `criteria_version`, `is_active`

7. `pos.kol_creator_badges`
   - `kol_id`, `badge_id`, `awarded_at`, `awarded_by`, `source_event`, `is_visible`
   - unique `(kol_id, badge_id)`

8. `pos.kol_visit_bookings`
   - `id`, `kol_id`, `booking_date date`, `status` (`requested|confirmed|cancelled|completed|no_show`)
   - `visit_note`, `admin_note`, `confirmed_at`, `cancelled_at`, timestamps
   - unique active booking per `booking_date`
   - display name resolved server-side; public calendar exposes only approved display name/username

9. `pos.kol_notifications`
   - `id`, `kol_id`, `type`, `title`, `body`, `entity_type`, `entity_id`
   - `dedupe_key` unique, `read_at`, `created_at`

### Booking invariant

```sql
-- Conceptual invariant; exact partial unique index must be included in migration.
CREATE UNIQUE INDEX ...
ON pos.kol_visit_bookings (booking_date)
WHERE status IN ('requested', 'confirmed', 'completed');
```

Booking mutation must use one server-side transaction/RPC that:

1. Normalizes date using business timezone Asia/Jakarta.
2. Rejects past dates.
3. Locks/checks the date slot.
4. Rejects a second active creator for the same date.
5. Allows only admin to override/cancel/confirm.
6. Does not treat cancelled bookings as occupied.
7. Returns the existing creator display name when the date is occupied.

---

## Cross-App Integration Mapping

### `apps/kol`

| Data | Surface | Rule |
|---|---|---|
| Authenticated KOL profile | `/profile` or `/:username/profile` | Only current Better Auth user |
| Editable profile | `/profile/edit` | Server validates ownership |
| Portfolio | `/portfolio` | Own items editable; public only approved items |
| Campaigns | `/campaigns` | Published campaigns only; assigned campaigns private to recipient |
| Submissions | `/campaigns/:id/submissions` | Only assigned KOL can submit own deliverables |
| Notifications | `/notifications` | Only current KOL, read state per user |
| Booking calendar | `/visit-calendar` | One active creator/date; show safe display name |

### `apps/admin`

| Data | Existing/target surface | Rule |
|---|---|---|
| KOL profile/status | Existing KOL data pages | Preserve current admin access guard |
| Campaign | Add under KOL marketing section | Admin creates/publishes/closes campaign |
| Portfolio review | Add review panel | Approve/reject with note |
| Submission review | Add campaign detail panel | Approve/revision/reject deliverables |
| Badge assignment | Add to KOL detail | Manual + deterministic automatic criteria |
| Visit calendar | Add KOL visit calendar page | Confirm/cancel/mark completed/no-show; collision-safe |
| Notifications | Event-triggered, not arbitrary replay | One notification per canonical event/dedupe key |

### Existing backend boundaries

- Keep Better Auth session/role checks in `apps/auth-server/src/index.ts` or extracted KOL route module.
- Keep public/intake mutations behind the existing `kol-public` Edge Function pattern or a dedicated authenticated KOL function.
- Do not grant browser `anon`/`authenticated` direct write access to `pos` tables.
- Reuse `apps/admin` Yumi auth/admin guard for admin mutations.

---

## Wave Plan

### Wave 1 — Contracts and foundation

#### Task 1: Freeze data/status contracts

**Files:**
- Create: `.hermes/plans/kol-creator-portal-contract.md` or document within implementation PR
- Reference: `supabase/migrations/20260828000002_kol_database_foundation.sql`
- Reference: `apps/auth-server/src/index.ts`

**Actions:**
- Define exact enum/status values.
- Define public/private field matrix.
- Define booking timezone and active statuses.
- Define API response envelope `{ success, data, error, requestId }`.

**Acceptance:** No feature task invents a second status vocabulary.

#### Task 2: Add additive schema migration

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_kol_creator_portal_foundation.sql`

**Actions:**
- Create tables and indexes listed above.
- Add idempotent constraints and timestamps.
- Add `updated_at` triggers.
- Add partial unique index for one active creator/date.
- Add safe public views for public profile/calendar/campaign.
- Revoke direct writes from `anon` and `authenticated`.
- Grant only required service-role/RPC access.

**Verification:** Apply to staging/live according to migration runbook; query table/index/view existence.

#### Task 3: Add server authorization helpers

**Files:**
- Modify: `apps/auth-server/src/index.ts` or create `apps/auth-server/src/kol-api.ts`
- Test: authenticated/unauthenticated/foreign-user cases

**Actions:**
- `requireKolSession()` checks Better Auth session, verified email, and `user_type=kol`.
- Resolve current `kol_id` only through `auth_user_id`, never a frontend-supplied role.
- Add CORS for all `/api/kol/*` endpoints.
- Return `401` for no session and `403` for wrong role.

---

### Wave 2 — Profile and portfolio

#### Task 4: Build KOL portal shell and route map

**Files:**
- Modify/refactor: `apps/kol/src/App.tsx`
- Create: `apps/kol/src/components/KolPortalShell.tsx`
- Create: `apps/kol/src/components/KolBottomNav.tsx`
- Create: `apps/kol/src/lib/kol-api.ts`

**Routes:**
- `/:username/profile`
- `/:username/profile/edit`
- `/:username/portfolio`
- `/:username/campaigns`
- `/:username/notifications`
- `/:username/visit-calendar`

**Mobile layout:**
- Sticky top header with avatar and status.
- Fixed bottom nav above safe-area inset.
- Content container must reserve bottom padding for nav.
- Calendar uses compact month grid on mobile and list/day detail below it.

#### Task 5: Implement complete profile read model

**Files:**
- Modify: `apps/kol/src/lib/kol-api.ts`
- Modify: profile page/component
- Modify: `supabase` view/RPC if needed

**Actions:**
- Read profile, approved platform rows, status, badges, portfolio summary, and booking summary.
- Never return private contacts to public profile.
- Show profile completeness checklist.

**Acceptance:** Linked legacy creator and newly-created creator both render without losing historical form data.

#### Task 6: Implement profile edit flow

**Files:**
- Create: `apps/kol/src/components/KolProfileEdit.tsx`
- Modify: authenticated KOL API/server handler
- Test: ownership and validation cases

**Editable fields:** bio, display name, avatar URL if provider-safe, location, category, platform username/link/followers.

**Rules:**
- Do not allow editing `auth_user_id`, status, admin notes, review status, or private admin fields.
- Fields requiring review are marked pending or create an audit event.
- Validate URL, follower count, enum values, length, and normalized usernames.

---

### Wave 3 — Portfolio and campaign

#### Task 7: Implement portfolio CRUD and approval

**Files:**
- Create: `apps/kol/src/components/KolPortfolioPage.tsx`
- Modify: KOL API/Edge Function
- Modify: `apps/admin/src/routes/admin/kol*` review component

**KOL actions:** add/edit/remove own pending portfolio items.

**Admin actions:** approve/reject/request revision.

**Public rule:** only `review_status=approved AND is_public=true` is visible.

**Acceptance:** Creator cannot read or mutate another creator's draft/rejected portfolio.

#### Task 8: Implement campaign model and admin management

**Files:**
- Create/modify: `apps/admin/src/routes/admin/kol-campaigns*`
- Modify: existing KOL marketing navigation
- Backend authenticated admin endpoint/Edge Function

**Actions:**
- Draft/publish/close campaign.
- Define benefit, deliverables, date/deadline, capacity, and eligibility.
- Invite one or many KOLs with unique assignments.
- Preserve audit trail for publish/close/assignment.

#### Task 9: Implement KOL campaign inbox/detail

**Files:**
- Create: `apps/kol/src/components/KolCampaignList.tsx`
- Create: `apps/kol/src/components/KolCampaignDetail.tsx`

**Actions:**
- Show published campaigns and private invitations.
- Accept/decline assignment with transaction-safe status update.
- Prevent accepting closed/expired campaign.
- Show required deliverables and deadline.

---

### Wave 4 — Content submission and badges

#### Task 10: Implement content evidence submission

**Files:**
- Create: `apps/kol/src/components/KolSubmissionForm.tsx`
- Create/modify: admin campaign detail/review component
- Backend submission endpoint/RPC

**Actions:**
- Submit content URL, deliverable type, publish date, optional insight screenshot URL.
- Validate assignment ownership and deliverable type.
- Allow one active submission per assignment/deliverable, with revision history if needed.
- Admin can approve, reject, or request revision with note.

#### Task 11: Implement badge catalog and deterministic awarding

**Files:**
- Create: `supabase/migrations/..._kol_badges.sql`
- Modify: admin KOL detail
- Modify: profile/public profile components

**Initial badges:**
- `verified_creator`: profile approved by admin.
- `active_partner`: at least one accepted campaign.
- `completed_collaboration`: at least one approved campaign submission.
- `featured_creator`: manual admin award.

**Rules:**
- Badge criteria evaluated server-side.
- Badge award is idempotent.
- Manual removal requires audit note.
- Public profile shows only `is_visible=true` badges.

---

### Wave 5 — Notifications

#### Task 12: Implement durable KOL notifications

**Files:**
- Create: `apps/kol/src/components/KolNotificationCenter.tsx`
- Modify: authenticated KOL API
- Modify: `apps/admin` only if admin-triggered notification action is needed
- Create/modify: event notification helper/worker

**Events:**
- profile approved/revision requested
- portfolio approved/rejected
- campaign invitation
- campaign accepted/declined
- submission revision requested/approved/rejected
- booking requested/confirmed/cancelled
- badge awarded

**Anti-duplication:**
- Every event has deterministic `dedupe_key`.
- Insert with unique conflict handling.
- Read state is per KOL.
- Never replay old backlog on first login.
- Notification payload contains entity type/id for deep-linking.

---

### Wave 6 — Creator visit booking calendar

#### Task 13: Implement one-creator-per-day booking API

**Files:**
- Create: `supabase/migrations/..._kol_visit_booking.sql`
- Create/modify: `apps/auth-server/src/kol-api.ts` or dedicated Edge Function
- Test: concurrent booking race, cancellation, admin override

**Rules:**
- Business timezone: `Asia/Jakarta`.
- KOL can request only future dates.
- One active creator per day.
- `requested`, `confirmed`, `completed` occupy the date.
- `cancelled` and `no_show` do not occupy a future date after transition.
- Database unique partial index is the final guard; frontend availability is informational only.
- On conflict, response includes safe existing creator display name/username and no contact data.

**Response examples:**

```json
{"success":false,"error":"DATE_ALREADY_BOOKED","bookingDate":"2026-10-01","bookedBy":"@creator-lain"}
```

```json
{"success":true,"data":{"bookingId":"...","bookingDate":"2026-10-02","status":"requested"}}
```

#### Task 14: Implement KOL booking calendar UI

**Files:**
- Create: `apps/kol/src/components/KolVisitCalendar.tsx`
- Modify: `apps/kol/src/components/KolBottomNav.tsx`

**UI:**
- Monthly calendar.
- Available dates visually distinct.
- Occupied dates show `Booked — @username` or approved display name.
- Do not expose email/WhatsApp.
- Selected date opens confirmation sheet.
- Existing own booking is clearly marked.
- Mobile list fallback for narrow screens.

#### Task 15: Implement admin booking calendar

**Files:**
- Create/modify: `apps/admin/src/routes/admin/kol-visit-calendar*`
- Modify: admin KOL marketing navigation

**Actions:**
- View month/day schedule.
- Confirm/cancel/reschedule.
- Mark completed/no-show.
- See creator name, username, profile, campaign context, and admin-only contacts.
- Collision response must be handled visibly; no silent overwrite.

#### Task 16: Booking notification integration

**Files:**
- Modify: notification event helper/worker
- Modify: KOL notification UI

**Events:** booking requested, confirmed, cancelled, rescheduled, completed, no-show.

**Acceptance:** exactly one in-app notification per event/KOL; retries do not duplicate.

---

### Wave 7 — Public creator profile

#### Task 17: Implement public-safe creator profile

**Files:**
- Create: `apps/kol/src/components/PublicCreatorProfile.tsx`
- Modify: route matcher in `apps/kol/src/App.tsx` or extracted router
- Create/modify: `public.pos_kol_public_profile` view/RPC

**Public fields:** approved display name, slug, avatar, bio, location/city if approved, category, approved platforms, approved portfolio, visible badges.

**Private fields excluded:** email, WhatsApp, manager contact, auth ID, admin notes, booking history unless explicitly safe.

**Acceptance:** anonymous request cannot enumerate private KOL data or draft portfolio items.

---

## Testing Strategy

### Unit/domain tests

- Username/slug normalization.
- Profile completeness calculation.
- Portfolio URL and platform validation.
- Campaign state transitions.
- Badge criteria and idempotency.
- Booking date normalization to Asia/Jakarta.

### API/security tests

- Anonymous → `401`.
- Customer user → `403`.
- KOL A cannot read/update KOL B.
- KOL cannot set own status/badge/review status.
- Admin can review/override.
- Public endpoint excludes private columns.
- Duplicate booking concurrent requests: exactly one succeeds.
- Cancelled booking frees the date according to policy.

### Frontend verification

```bash
cd /opt/djiwatentramapp/apps/kol
bun run check-types
node ../../node_modules/vite/bin/vite.js build

cd /opt/djiwatentramapp/apps/admin
bun run check-types
bun run build
```

### Production verification

- Check migration/query result for every new table/index/view.
- Verify anonymous public profile response.
- Verify authenticated KOL profile response.
- Verify booking calendar occupied-date response.
- Verify second booking receives `DATE_ALREADY_BOOKED`.
- Verify admin can confirm/cancel without changing another date.
- Verify bundle contains route and UI markers.
- Verify root and nested SPA routes return HTTP 200.
- Capture mobile screenshot at approximately 375px width.

---

## Rollout and Safety

1. Deploy additive schema first.
2. Deploy backend endpoints with frontend feature flags or hidden routes.
3. Backfill `kol_profiles` only from existing linked `pos.kol_creators`; do not overwrite historical form data.
4. Backfill no portfolio/campaign/badge/booking records unless explicitly sourced from existing records.
5. Deploy admin review surfaces before enabling public submissions.
6. Enable KOL profile/edit first, then portfolio, campaign, submission, notification, booking, and public profile sequentially.
7. Monitor auth-server logs, API 4xx/5xx, booking collision errors, and notification dedupe conflicts.
8. Rollback by disabling feature flags/routes; do not drop tables or historical rows.

---

## Commit/Deployment Boundaries

Suggested commits:

```text
feat(kol): add creator portal schema and authorization
feat(kol): add complete profile and edit flow
feat(kol): add portfolio review workflow
feat(kol): add campaign assignments
feat(kol): add content submission review
feat(kol): add KOL notification center
feat(kol): add creator badges
feat(kol): add one-per-day creator visit booking
feat(kol): add public creator profiles
qa(kol): verify portal and booking release
```

Selective staging only:

```bash
git diff --name-only HEAD
git add <only-files-for-this-task>
git diff --cached --check
git commit -m "..."
git push origin main
```

---

## Acceptance Criteria

- [ ] KOL can see complete profile after Google login.
- [ ] KOL can edit allowed profile fields without changing admin-controlled fields.
- [ ] KOL can submit portfolio links and see review status.
- [ ] Admin can approve/reject portfolio items.
- [ ] Admin can create/publish campaign and invite KOL.
- [ ] KOL can accept/decline campaign.
- [ ] KOL can submit content evidence and receive revision/approval status.
- [ ] KOL receives durable deduplicated notifications.
- [ ] Public profile exposes only approved public fields.
- [ ] Badge criteria are server-side and idempotent.
- [ ] KOL can request a future visit date.
- [ ] Only one active creator can occupy a date.
- [ ] Occupied date visibly shows safe creator name/username to prevent collision.
- [ ] Concurrent booking race is rejected safely by database constraint.
- [ ] Admin can confirm/cancel/complete/no-show bookings.
- [ ] Historical KOL form data remains intact.
- [ ] No direct browser write access to protected `pos` tables.
- [ ] Build, typecheck, security tests, live API checks, and mobile visual verification pass.
