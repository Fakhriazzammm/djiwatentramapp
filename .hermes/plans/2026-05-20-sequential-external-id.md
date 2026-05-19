# External ID / Sequential Numbering Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace UUID-based `registrationNumber` and `source_id` with human-friendly sequential IDs (REG-2026-05-001, EMP-042) across registration → approval → user lifecycle.

**Architecture:** Add sequential counter table, prefix-per-role/category, store external ID in dedicated columns (not JSONB), and make `yumi_users.source_id` use the sequential NIP format.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React, Edge Functions

---

## Database Schema Changes

### Task 1: Create `registration_counters` table

**Objective:** Atomic sequential numbering per category (registration, employee, and per-role-prefix)

**Files:**
- Create: `supabase/migrations/20260521000001_create_registration_counters.sql`

**Content:**

```sql
-- Atomic sequential counter per category/prefix
create table if not exists public.registration_counters (
  category text primary key,       -- 'registration', 'employee', or role_code like 'BRT'
  prefix text not null,            -- 'REG', 'EMP', 'BRT', 'KSR', etc.
  year_prefix text not null default to_char(now(), 'YYYY'),
  counter integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Function to atomically increment and return next number
create or replace function public.next_registration_number(p_category text, p_prefix text)
returns text
language plpgsql
security definer
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_counter integer;
  v_formatted text;
begin
  insert into public.registration_counters (category, prefix, year_prefix, counter)
  values (p_category, p_prefix, v_year, 1)
  on conflict (category) do update
    set counter = registration_counters.counter + 1,
        updated_at = now()
    where registration_counters.year_prefix = v_year
    returning counter into v_counter;

  -- If year changed, reset counter
  if v_counter is null then
    update public.registration_counters
    set counter = 1, year_prefix = v_year, updated_at = now()
    where category = p_category
    returning counter into v_counter;
  end if;

  v_formatted := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  return v_formatted;
end;
$$;
```

**Verify:** Run `SELECT next_registration_number('registration', 'REG')` — returns `REG-2026-0001`

---

### Task 2: Add `registration_number` to `employee_onboarding_applications`

**Objective:** Move from `raw->>registrationNumber` (JSONB) to dedicated column with index

**Files:**
- Create: `supabase/migrations/20260521000002_add_registration_number_column.sql`

**Content:**

```sql
alter table public.employee_onboarding_applications
  add column if not exists registration_number text,
  add column if not exists employee_nip text;

create unique index if not exists idx_employee_onboarding_registration_number
  on public.employee_onboarding_applications (registration_number)
  where registration_number is not null;
```

---

### Task 3: Add `employee_nip` to `yumi_users`

**Objective:** Store the human-friendly NIP on the user record for querying

**Files:**
- Create: `supabase/migrations/20260521000003_add_yumi_users_nip.sql`

**Content:**

```sql
alter table public.yumi_users
  add column if not exists employee_nip text;

create unique index if not exists idx_yumi_users_employee_nip
  on public.yumi_users (employee_nip)
  where employee_nip is not null;
```

---

## Backend Changes

### Task 4: Add `generateRegistrationNumber` helper

**Objective:** Utility that calls `next_registration_number` via supabase-js or edge function

**Files:**
- Modify: `apps/web/src/lib/employee-onboarding-schema.ts` (add helper)

**Details:**
```typescript
// Helper that generates REG-YYYY-NNNN
export async function generateRegistrationNumber(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('next_registration_number', {
    p_category: 'registration',
    p_prefix: 'REG'
  });
  if (error) throw error;
  return data as string;
}
```

---

### Task 5: Generate sequential REG number during registration

**Objective:** Replace `crypto.randomUUID()` with sequential `REG-2026-0001`

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx`

**Change:**
- Line 255-258: Replace `crypto.randomUUID()` with `await generateRegistrationNumber(supabase)`
- Store in new `registration_number` column as well as `raw.registrationNumber` (backward compat)
- Update `buildEmployeeOnboardingPayload` to accept and store `registration_number`

---

### Task 6: Generate employee NIP during approval in edge function

**Objective:** When admin approves, generate sequential NIP with role prefix and store on both tables

**Files:**
- Modify: `supabase/functions/onboarding-admin/index.ts`

**Change in `handleApprove`:**
1. After creating the user, call `next_registration_number('employee', roleCode)` to get NIP
2. Store NIP in `yumi_users.employee_nip`
3. Update `employee_onboarding_applications.employee_nip`
4. Role code mapping (from role name → prefix):

```typescript
function getRolePrefix(roleName: string): string {
  const map: Record<string, string> = {
    'BARISTA': 'BRT',
    'KASIR': 'KSR',
    'WAITRESS': 'WTR',
    'CHEF': 'CHF',
    'KITCHEN': 'KTC',
    'MANAGER': 'MGR',
  };
  return map[String(roleName).toUpperCase()] || 'EMP';
}
```

5. The `source_id` can keep `user_<random>` format or optionally switch to the NIP format

---

## Frontend Changes

### Task 7: Display registration number everywhere

**Objective:** Show the sequential REG-YYYY-NNNN in admin list, detail page, notifications

**Files:**
- Modify: `apps/web/src/routes/admin/operational-team/register/onboarding.lazy.tsx` (list)
- Modify: `apps/web/src/routes/admin/operational-team/register.application.$registrationNumber.lazy.tsx` (detail)
- Modify: `apps/web/src/routes/register.selesai.$registrationNumber.lazy.tsx` (selesai)

**Changes:**
- Show `app.registration_number` (new column) instead of `raw.registrationNumber`
- Display format: badge `REG-2026-0001`

---

### Task 8: Display employee NIP in user profile and admin

**Objective:** Show EMP-042 in karyawan profile, payroll, absensi

**Files:**
- Modify: `apps/web/src/routes/admin/operational-team/karyawan.$slug.lazy.tsx` (profile)
- Modify: `apps/web/src/routes/admin/operational-team/register.application.$registrationNumber.lazy.tsx` (after approved)

**Changes:**
- Show `app.employee_nip` badge after approval
- Link to user profile via NIP

---

## Data Migration

### Task 9: Backfill existing records

**Objective:** Assign sequential IDs to existing applications and users

**Files:**
- Create: `supabase/migrations/20260521000004_backfill_existing_ids.sql`

**Content:**
```sql
-- Backfill registration_number for existing pending/submitted applications
do $$
declare
  rec record;
  new_reg text;
begin
  for rec in select * from employee_onboarding_applications
    where registration_number is null
    order by created_at asc
  loop
    new_reg := next_registration_number('registration', 'REG');
    update employee_onboarding_applications
    set registration_number = new_reg
    where id = rec.id;
  end loop;
end $$;

-- Backfill employee_nip for approved users
do $$
declare
  rec record;
  new_nip text;
  role_prefix text;
begin
  for rec in select e.*, u.employee_nip as user_nip
    from employee_onboarding_applications e
    left join yumi_users u on u.source_id = e.approved_user_source_id
    where e.status = 'approved' and e.employee_nip is null
    order by e.created_at asc
  loop
    role_prefix := coalesce(
      (select regexp_replace(upper(trim(e.employment->>'roleName')), '^([A-Z]).*', '\1') from employee_onboarding_applications e where e.id = rec.id),
      'EMP'
    );
    -- simplified: use a basic prefix logic for backfill
    new_nip := next_registration_number('employee_backfill', 'EMP');
    update employee_onboarding_applications
    set employee_nip = new_nip
    where id = rec.id;
    if rec.approved_user_source_id is not null then
      update yumi_users set employee_nip = new_nip
      where source_id = rec.approved_user_source_id;
    end if;
  end loop;
end $$;
```

---

## Phases & Priority

### Phase 1 (Foundation) — Tasks 1-3
Database schema + migration. Safe to run on production because it's purely additive (new columns, no existing data changed).

### Phase 2 (Registration) — Tasks 4-5
Generate REG number during registration. The URL changes from `/register/selesai/UUID` to `/register/selesai/REG-2026-0001`. **Breaking change for existing URLs** — existing pending apps still use UUID in URL.

### Phase 3 (Approval) — Task 6
Generate employee NIP during approval. Stored on both tables. The edge function needs redeploy.

### Phase 4 (Display) — Tasks 7-8
Show the new IDs in UI. Search/filter by sequential ID becomes possible.

### Phase 5 (Backfill) — Task 9
Assign IDs to existing records. Run after everything is deployed.

---

## Key Decisions

1. **URL format:** `/register/selesai/REG-2026-0001` instead of `/register/selesai/uuid`. The route param name stays `$registrationNumber` — just the value format changes.

2. **Route resolution:** Frontend queries by `registration_number` column (not `raw->>registrationNumber`). For backward compat during transition, fallback to `raw->>registrationNumber` if first query returns null.

3. **Role prefixes:** Stored in a mapping table or config. For Phase 1, hardcode a map in the edge function. Later, make it configurable via `site_settings`.

4. **`source_id` format:** Keep as `user_<random>` for now. Changing `yumi_users.source_id` would be a massive refactor (it's a PK used in foreign keys). The NIP goes into `employee_nip` column.

---

## Risks

| Risk | Mitigation |
|------|------------|
| URL change breaks existing links | Keep `raw.registrationNumber` as fallback query for 30 days |
| Counter reset at year boundary | `year_prefix` column handles this — counter resets per year |
| Race condition on counter | `INSERT ... ON CONFLICT DO UPDATE` is atomic in PostgreSQL |
| Role prefix for unknown roles | Default to `EMP` prefix |

---

## Verification

After each phase:
- [ ] `SELECT next_registration_number('registration', 'REG')` returns `REG-2026-NNNN`
- [ ] New registration gets sequential REG number in URL
- [ ] Approved user gets NIP in both tables
- [ ] Admin page shows REG number and NIP
- [ ] Existing apps still accessible via fallback query
