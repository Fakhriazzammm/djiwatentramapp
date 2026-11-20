-- Add the self-service application path while keeping legacy invited campaigns working.
alter table pos.kol_campaigns
  add column if not exists application_mode text not null default 'invite' check (application_mode in ('invite','open','visit')),
  add column if not exists cover_url text,
  add column if not exists terms text[] not null default '{}',
  add column if not exists sow jsonb,
  add column if not exists proof_platforms text[] not null default '{}';

alter table pos.kol_visit_booking_events
  drop constraint if exists kol_visit_booking_events_event_type_check,
  add constraint kol_visit_booking_events_event_type_check check (event_type in (
    'invite_created','invite_opened','google_authenticated','identity_linked',
    'booking_requested','booking_confirmed','booking_cancelled','booking_rescheduled','invite_revoked',
    'booking_created','invited_booking_created','booking_eligibility_changed','booking_status_changed','campaign_applied'
  ));

create table if not exists pos.kol_campaign_applications (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references pos.kol_campaigns(id) on delete cascade,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  booking_id bigint unique references pos.kol_visit_bookings(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  campaign_revision timestamptz not null,
  terms_snapshot text[] not null,
  sow_snapshot jsonb,
  proof_platforms text[] not null,
  requires_visit boolean not null,
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  unique (campaign_id, kol_id)
);

alter table pos.kol_content_submissions add column if not exists required_platform text;
create unique index if not exists idx_kol_submissions_one_current_platform
  on pos.kol_content_submissions(campaign_assignment_id, required_platform)
  where required_platform is not null and status <> 'rejected';

alter table pos.kol_campaign_applications enable row level security;
revoke all on pos.kol_campaign_applications from public, anon, authenticated;
grant select on pos.kol_campaign_applications to service_role;

-- Validate the date when it is booked or rescheduled, so yesterday's visit can still be completed.
alter table pos.kol_visit_bookings drop constraint if exists kol_visit_bookings_booking_date_check;
create or replace function pos.kol_visit_booking_validate_date()
returns trigger language plpgsql set search_path = pos, pg_catalog as $$
begin
  if new.booking_date <= (now() at time zone 'Asia/Jakarta')::date then
    raise exception using errcode = 'P0001', message = 'INVALID_BOOKING_DATE';
  end if;
  return new;
end $$;
drop trigger if exists trg_kol_visit_booking_validate_date on pos.kol_visit_bookings;
create trigger trg_kol_visit_booking_validate_date before insert or update of booking_date on pos.kol_visit_bookings
for each row execute function pos.kol_visit_booking_validate_date();

create or replace function pos.kol_accept_campaign_application(p_app pos.kol_campaign_applications)
returns void language sql security definer set search_path = pos, pg_catalog as $$
  insert into pos.kol_campaign_assignments(campaign_id, kol_id, status, accepted_at, assigned_by)
  values (p_app.campaign_id, p_app.kol_id, 'accepted', now(), 'application')
  on conflict (campaign_id, kol_id) do update
     set status = 'accepted', accepted_at = now(), updated_at = now()
   where pos.kol_campaign_assignments.status in ('invited','declined','cancelled');
$$;

create or replace function pos.kol_apply_campaign(
  p_slug text, p_kol_id text, p_actor text, p_revision timestamptz, p_terms boolean,
  p_date date, p_time time, p_attendance boolean, p_no_show boolean, p_consent_text text,
  p_use_existing boolean
) returns pos.kol_campaign_applications
language plpgsql security definer set search_path = pos, pg_catalog as $$
declare
  cp pos.kol_campaigns%rowtype;
  a pos.kol_campaign_applications%rowtype;
  b pos.kol_visit_bookings%rowtype;
  b_id bigint;
  sow_changed boolean;
  deadline date;
  current_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into cp from pos.kol_campaigns where slug = p_slug for share;
  if not found or cp.status <> 'published'
     or cp.application_deadline < current_day or cp.end_date < current_day then
    raise exception using message = 'CAMPAIGN_NOT_OPEN', errcode = 'P0001';
  end if;
  perform 1 from pos.kol_creators
   where source_id = p_kol_id and auth_user_id = p_actor and status <> 'Rejected' for no key update;
  if not found then raise exception using message = 'KOL_PROFILE_NOT_FOUND', errcode = 'P0001'; end if;

  select * into a from pos.kol_campaign_applications
   where campaign_id = cp.id and kol_id = p_kol_id;
  if a.id is not null and a.status <> 'cancelled' then return a; end if;
  if cp.application_mode = 'invite' and not exists (
    select 1 from pos.kol_campaign_assignments where campaign_id = cp.id and kol_id = p_kol_id and status = 'invited'
  ) then
    raise exception using message = 'CAMPAIGN_NOT_OPEN', errcode = 'P0001';
  end if;
  if p_terms is distinct from true or p_revision is distinct from cp.updated_at then
    raise exception using message = 'CAMPAIGN_TERMS_CHANGED', errcode = 'P0001';
  end if;

  if cp.application_mode = 'visit' then
    if p_attendance is distinct from true or p_no_show is distinct from true then
      raise exception using message = 'CONSENT_REQUIRED', errcode = 'P0001';
    end if;

    if p_use_existing then
      select * into b from pos.kol_visit_bookings
       where kol_id = p_kol_id and status in ('requested','confirmed') and booking_date >= current_day for update;
      if not found then raise exception using message = 'ACTIVE_VISIT_NOT_FOUND', errcode = 'P0001'; end if;
    else
      if p_date is null then raise exception using message = 'INVALID_BOOKING_DATE', errcode = 'P0001'; end if;
      if p_time is null then raise exception using message = 'INVALID_BOOKING_TIME', errcode = 'P0001'; end if;
      if p_date < cp.start_date or p_date > cp.end_date then
        raise exception using message = 'CAMPAIGN_VISIT_OUTSIDE_PERIOD', errcode = 'P0001';
      end if;
      select id into b_id from pos.kol_insert_shared_visit_booking(p_kol_id, p_date, p_time, true, true, p_actor, false);
      update pos.kol_visit_bookings
         set consent_version = 'kol-visit-v2', consent_text = p_consent_text
       where id = b_id returning * into b;
    end if;

    if b.booking_date < cp.start_date or b.booking_date > cp.end_date then
      raise exception using message = 'CAMPAIGN_VISIT_OUTSIDE_PERIOD', errcode = 'P0001';
    end if;
    if exists (select 1 from pos.kol_campaign_applications where booking_id = b.id and campaign_id <> cp.id) then
      raise exception using message = 'VISIT_LINKED_TO_CAMPAIGN', errcode = 'P0001';
    end if;
    if b.status = 'confirmed' then
      deadline := b.booking_date + coalesce((cp.sow ->> 'days')::integer, 7);
    end if;
    sow_changed := b.sow_snapshot is distinct from cp.sow or b.post_deadline is distinct from deadline;
    update pos.kol_visit_bookings
       set sow_snapshot = cp.sow, sow_version = null, sow_customized = true, post_deadline = deadline
     where id = b.id returning * into b;
    if b.status = 'confirmed' and sow_changed then
      perform pos.kol_after_sow_change(b, true, 'sow_updated:' || b.id || ':campaign:' || cp.id || ':' || cp.updated_at);
    end if;
  end if;

  insert into pos.kol_campaign_applications(campaign_id, kol_id, booking_id, campaign_revision, terms_snapshot,
                                            sow_snapshot, proof_platforms, requires_visit, status, reviewed_at)
  values (cp.id, p_kol_id, b.id, cp.updated_at, cp.terms, cp.sow, cp.proof_platforms, cp.application_mode = 'visit',
          case when b.status = 'confirmed' or cp.application_mode = 'invite' then 'approved' else 'pending' end,
          case when b.status = 'confirmed' or cp.application_mode = 'invite' then now() end)
  on conflict (campaign_id, kol_id) do update
    set booking_id = excluded.booking_id, campaign_revision = excluded.campaign_revision,
        terms_snapshot = excluded.terms_snapshot, sow_snapshot = excluded.sow_snapshot,
        proof_platforms = excluded.proof_platforms, requires_visit = excluded.requires_visit, status = excluded.status,
        applied_at = now(), reviewed_at = excluded.reviewed_at, review_note = null
  returning * into a;
  if b.id is not null then
    insert into pos.kol_visit_booking_events(booking_id, kol_id, event_type, actor_type, actor_id, payload)
    values (b.id, p_kol_id, 'campaign_applied', 'creator', p_actor,
      jsonb_build_object('campaignId', cp.id, 'revision', cp.updated_at, 'terms', cp.terms, 'sow', cp.sow));
  end if;
  if a.status = 'approved' then perform pos.kol_accept_campaign_application(a); end if;
  return a;
end $$;

create or replace function pos.kol_campaign_on_visit_status()
returns trigger language plpgsql security definer set search_path = pos, pg_catalog as $$
declare a pos.kol_campaign_applications%rowtype;
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    update pos.kol_campaign_applications set status = 'approved', reviewed_at = now(), review_note = new.admin_note
     where booking_id = new.id and status = 'pending' returning * into a;
    if found then perform pos.kol_accept_campaign_application(a); end if;
  elsif new.status in ('cancelled','no_show') and old.status is distinct from new.status then
    update pos.kol_campaign_applications set status = 'cancelled', reviewed_at = now(), review_note = new.admin_note
     where booking_id = new.id and status in ('pending','approved') returning * into a;
    if found then
      update pos.kol_campaign_assignments set status = 'cancelled', updated_at = now()
       where campaign_id = a.campaign_id and kol_id = a.kol_id and status <> 'completed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_kol_campaign_on_visit_status on pos.kol_visit_bookings;
create trigger trg_kol_campaign_on_visit_status after update of status on pos.kol_visit_bookings
for each row execute function pos.kol_campaign_on_visit_status();

-- Booking and campaign confirmation use the same SOW and posting window.
create or replace function pos.kol_campaign_visit_deadline()
returns trigger language plpgsql security definer set search_path = pos, pg_catalog as $$
declare days integer;
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    if exists (select 1 from pos.kol_campaign_applications where booking_id = new.id) then
      days := (new.sow_snapshot ->> 'days')::integer;
    end if;
    if days between 1 and 60 then
      new.post_deadline := new.booking_date + days;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_kol_visit_campaign_deadline on pos.kol_visit_bookings;
create trigger trg_kol_visit_campaign_deadline before update of status on pos.kol_visit_bookings
for each row execute function pos.kol_campaign_visit_deadline();

create or replace function pos.kol_review_campaign_application(p_id bigint, p_approve boolean, p_actor text, p_note text)
returns pos.kol_campaign_applications language plpgsql security definer set search_path = pos, pg_catalog as $$
declare a pos.kol_campaign_applications%rowtype; b_id bigint; next_status text;
begin
  select booking_id into b_id from pos.kol_campaign_applications where id = p_id;
  if b_id is not null then perform 1 from pos.kol_visit_bookings where id = b_id for update; end if;
  select * into a from pos.kol_campaign_applications where id = p_id for update;
  if not found or a.status <> 'pending' or a.booking_id is distinct from b_id then raise exception using message = 'APPLICATION_NOT_PENDING', errcode = 'P0001'; end if;

  if a.booking_id is not null then
    next_status := case when p_approve then 'confirmed' else 'cancelled' end;
    update pos.kol_visit_bookings
       set status = next_status, admin_note = nullif(p_note, ''), updated_at = now(),
           confirmed_at = case when p_approve then now() else confirmed_at end,
           cancelled_at = case when p_approve then cancelled_at else now() end
     where id = a.booking_id and status = 'requested';
    if not found then raise exception using message = 'APPLICATION_NOT_PENDING', errcode = 'P0001'; end if;
    insert into pos.kol_visit_booking_events(booking_id, kol_id, event_type, actor_type, actor_id, payload)
    values (a.booking_id, a.kol_id, 'booking_status_changed', 'admin', p_actor,
            jsonb_build_object('from','requested','to',next_status,'note',p_note,'campaignApplicationId',a.id));
  end if;

  update pos.kol_campaign_applications
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), review_note = nullif(p_note,'')
   where id = p_id returning * into a;
  if p_approve and a.booking_id is null then perform pos.kol_accept_campaign_application(a); end if;
  return a;
end $$;

create or replace function pos.kol_review_campaign_proof(p_id bigint, p_status text, p_actor text, p_note text)
returns pos.kol_content_submissions language plpgsql security definer set search_path = pos, pg_catalog as $$
declare
  proof pos.kol_content_submissions%rowtype;
  assignment pos.kol_campaign_assignments%rowtype;
  required text[];
begin
  select * into proof from pos.kol_content_submissions where id = p_id;
  if not found then return null; end if;
  select * into assignment from pos.kol_campaign_assignments where id = proof.campaign_assignment_id for update;

  update pos.kol_content_submissions
     set status = p_status, review_note = nullif(p_note,''), reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
   where id = p_id returning * into proof;
  select proof_platforms into required from pos.kol_campaign_applications
   where campaign_id = assignment.campaign_id and kol_id = assignment.kol_id;

  if cardinality(required) > 0 then
    if not exists (
      select 1 from unnest(required) as platform(name)
       where not exists (select 1 from pos.kol_content_submissions s
                         where s.campaign_assignment_id = assignment.id and s.status = 'approved'
                               and s.required_platform = platform.name)
    ) then
      update pos.kol_campaign_assignments set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
       where id = assignment.id and status in ('accepted','active','completed');
    elsif assignment.status = 'completed' then
      update pos.kol_campaign_assignments set status = 'active', completed_at = null, updated_at = now() where id = assignment.id;
    end if;
  elsif p_status = 'approved' then
    update pos.kol_campaign_assignments set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
     where id = assignment.id and status <> 'cancelled';
  end if;
  return proof;
end $$;

revoke all on function pos.kol_accept_campaign_application(pos.kol_campaign_applications),
  pos.kol_apply_campaign(text,text,text,timestamptz,boolean,date,time,boolean,boolean,text,boolean),
  pos.kol_campaign_on_visit_status(), pos.kol_campaign_visit_deadline(), pos.kol_visit_booking_validate_date(),
  pos.kol_review_campaign_application(bigint,boolean,text,text), pos.kol_review_campaign_proof(bigint,text,text,text)
  from public, anon, authenticated;
grant execute on function pos.kol_apply_campaign(text,text,text,timestamptz,boolean,date,time,boolean,boolean,text,boolean),
  pos.kol_review_campaign_application(bigint,boolean,text,text), pos.kol_review_campaign_proof(bigint,text,text,text) to service_role;

insert into pos.kol_campaigns(slug, title, description, location, benefit_description, deliverable_summary, status,
                             application_mode, cover_url, terms, sow, proof_platforms, created_by)
select 'visit-djiwa-tentram', 'Visit Djiwa Tentram',
       'Datang ke Djiwa Tentram di Tasikmalaya, cicipi menu kami, dan ceritakan pengalamanmu dengan gaya kontenmu sendiri. Tunjukkan bagaimana kamu menggunakan Djiwa App, dari login dan self-order sampai checkout. Pilih jadwal di kalender untuk mengajukan kunjungan.',
       'Djiwa Tentram Cafe & Resto, Tasikmalaya', '2 makanan dan 2 minuman saat visit.',
       '1 video TikTok yang sama ditayangkan ulang di Instagram Reels. Kirim kedua tautan setelah tayang.',
       'published', 'visit', '/campaign-images/visit-djiwa-tentram.jpg',
       array[
         'Saya setuju mengikuti SOW dan menayangkan konten paling lambat 7 hari setelah visit.',
         'Saya akan mencantumkan akun serta lokasi Djiwa Tentram dan mengirim tautan TikTok dan Instagram Reels di portal.',
         'Saya siap hadir sesuai jadwal yang dikonfirmasi dan akan menghubungi tim lebih awal jika berhalangan.'
       ],
       jsonb_build_object('title', v.title, 'sections', v.sections, 'closing', v.closing, 'days', 7),
       array['TikTok','Instagram'], 'system'
  from pos.kol_sow_versions v where v.version = 1
on conflict do nothing;

notify pgrst, 'reload schema';
