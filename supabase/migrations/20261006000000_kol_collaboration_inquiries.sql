-- Private inbox for client/brand collaboration requests from public creator profiles.
-- Additive and idempotent: browser roles never receive direct table access.
create schema if not exists pos;

create table if not exists pos.kol_collaboration_inquiries (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete restrict,
  business_name text not null check (char_length(btrim(business_name)) between 2 and 160),
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_email text,
  contact_phone text,
  brief text not null check (char_length(btrim(brief)) between 20 and 3000),
  preferred_contact text not null default 'either'
    check (preferred_contact in ('email', 'phone', 'either')),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'contacted', 'declined', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_email is not null or contact_phone is not null),
  check (contact_email is null or char_length(btrim(contact_email)) between 5 and 254),
  check (contact_phone is null or char_length(btrim(contact_phone)) between 7 and 40),
  check (preferred_contact <> 'email' or contact_email is not null),
  check (preferred_contact <> 'phone' or contact_phone is not null)
);

create index if not exists idx_kol_collaboration_inquiries_inbox
  on pos.kol_collaboration_inquiries(status, created_at desc);
create index if not exists idx_kol_collaboration_inquiries_creator
  on pos.kol_collaboration_inquiries(kol_id, created_at desc);

alter table pos.kol_collaboration_inquiries enable row level security;
revoke all on pos.kol_collaboration_inquiries from anon, authenticated;
grant all on pos.kol_collaboration_inquiries to service_role;
grant usage, select on sequence pos.kol_collaboration_inquiries_id_seq to service_role;

notify pgrst, 'reload schema';
