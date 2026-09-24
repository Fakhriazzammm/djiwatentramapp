-- KOL Visit invite flow database layer.
-- Additive/idempotent. Raw invite tokens are never stored.
create schema if not exists pos;

create table if not exists pos.kol_visit_invitations (
  id uuid primary key default gen_random_uuid(),
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'created'
    check (status in ('created', 'opened', 'authenticated', 'linked',
                      'schedule_selected', 'confirmed', 'expired', 'revoked', 'needs_review')),
  expires_at timestamptz not null,
  opened_at timestamptz,
  authenticated_at timestamptz,
  linked_at timestamptz,
  schedule_selected_at timestamptz,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  linked_auth_user_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_kol_visit_invitations_kol
  on pos.kol_visit_invitations(kol_id, created_at desc);
create index if not exists idx_kol_visit_invitations_status_expiry
  on pos.kol_visit_invitations(status, expires_at);
create unique index if not exists idx_kol_visit_invitations_active_kol
  on pos.kol_visit_invitations(kol_id)
  where status in ('created', 'opened', 'authenticated', 'linked', 'schedule_selected');

create table if not exists pos.kol_visit_booking_events (
  id bigserial primary key,
  booking_id bigint references pos.kol_visit_bookings(id) on delete set null,
  invitation_id uuid references pos.kol_visit_invitations(id) on delete set null,
  kol_id text not null references pos.kol_creators(source_id),
  event_type text not null check (event_type in (
    'invite_created', 'invite_opened', 'google_authenticated', 'identity_linked',
    'booking_requested', 'booking_confirmed', 'booking_cancelled',
    'booking_rescheduled', 'invite_revoked'
  )),
  actor_type text not null check (actor_type in ('admin', 'creator', 'system')),
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kol_visit_booking_events_booking
  on pos.kol_visit_booking_events(booking_id, created_at desc);
create index if not exists idx_kol_visit_booking_events_invitation
  on pos.kol_visit_booking_events(invitation_id, created_at desc);
create index if not exists idx_kol_visit_booking_events_kol
  on pos.kol_visit_booking_events(kol_id, created_at desc);

-- Better Auth is the identity authority in this app, so the server passes the
-- verified user id explicitly. The client never supplies kol_id to this RPC.
create or replace function pos.kol_request_invited_visit_booking(
  p_invitation_id uuid,
  p_booking_date date,
  p_visit_note text default null,
  p_auth_user_id text default null
)
returns table(id bigint, booking_date date, status text, invitation_id uuid)
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_invitation pos.kol_visit_invitations%rowtype;
  v_booking pos.kol_visit_bookings%rowtype;
begin
  if nullif(btrim(p_auth_user_id), '') is null then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_VALID';
  end if;

  select * into v_invitation
  from pos.kol_visit_invitations
  where id = p_invitation_id
  for update;

  if not found
     or v_invitation.status in ('expired', 'revoked', 'confirmed', 'needs_review')
     or v_invitation.expires_at <= now()
     or v_invitation.linked_auth_user_id is null
     or v_invitation.linked_auth_user_id <> p_auth_user_id then
    raise exception using errcode = 'P0001', message = 'INVITATION_NOT_VALID';
  end if;

  if p_booking_date < ((now() at time zone 'Asia/Jakarta')::date + 1) then
    raise exception using errcode = 'P0001', message = 'INVALID_BOOKING_DATE';
  end if;

  if exists (
    select 1 from pos.kol_visit_bookings
    where kol_id = v_invitation.kol_id and status in ('requested', 'confirmed')
  ) then
    raise exception using errcode = 'P0001', message = 'CREATOR_ALREADY_HAS_ACTIVE_BOOKING';
  end if;

  insert into pos.kol_visit_bookings(kol_id, booking_date, status, visit_note)
  values (v_invitation.kol_id, p_booking_date, 'requested', nullif(btrim(p_visit_note), ''))
  returning * into v_booking;

  update pos.kol_visit_invitations
  set status = 'schedule_selected', schedule_selected_at = now(), updated_at = now()
  where id = v_invitation.id;

  insert into pos.kol_visit_booking_events(
    booking_id, invitation_id, kol_id, event_type, actor_type, actor_id, payload
  ) values (
    v_booking.id, v_invitation.id, v_invitation.kol_id, 'booking_requested',
    'creator', p_auth_user_id, '{}'::jsonb
  );

  return query select v_booking.id, v_booking.booking_date, v_booking.status, v_invitation.id;
exception
  when unique_violation then
    if exists (
      select 1 from pos.kol_visit_bookings
      where kol_id = v_invitation.kol_id and status in ('requested', 'confirmed')
    ) then
      raise exception using errcode = 'P0001', message = 'CREATOR_ALREADY_HAS_ACTIVE_BOOKING';
    end if;
    raise exception using errcode = 'P0001', message = 'DATE_ALREADY_BOOKED';
end;
$$;

-- Private tables and functions are service-role-only; no raw token or private
-- contact/email fields are granted to browser roles.
revoke all on pos.kol_visit_invitations, pos.kol_visit_booking_events
  from public, anon, authenticated;
grant usage on schema pos to service_role;
grant all on pos.kol_visit_invitations, pos.kol_visit_booking_events to service_role;
grant usage, select on sequence pos.kol_visit_booking_events_id_seq to service_role;
revoke all on function pos.kol_request_invited_visit_booking(uuid, date, text, text)
  from public, anon, authenticated;
grant execute on function pos.kol_request_invited_visit_booking(uuid, date, text, text) to service_role;

-- Recreate the existing trigger safely; this also applies updated_at to invites.
drop trigger if exists trg_kol_visit_invitations_updated on pos.kol_visit_invitations;
create trigger trg_kol_visit_invitations_updated
before update on pos.kol_visit_invitations
for each row execute function pos.kol_portal_set_updated_at();

notify pgrst, 'reload schema';
