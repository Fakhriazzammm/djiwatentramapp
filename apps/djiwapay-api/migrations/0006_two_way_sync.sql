-- Two-way sync state for the Google Sheets workbook and the Drive receipt folder.
alter table finance.google_sheet_exports
  add column if not exists template_version integer not null default 1,
  add column if not exists dirty boolean not null default true,
  add column if not exists next_sync_at timestamptz not null default now(),
  add column if not exists sheet_modified text,
  add column if not exists grid_rows integer not null default 3001,
  add column if not exists hold text,                         -- a bulk change we refuse to apply without a human
  add column if not exists confirm_deletes boolean not null default false,
  add column if not exists last_stats jsonb not null default '{}'::jsonb;
alter table finance.google_sheet_exports drop constraint if exists google_sheet_exports_status_check;
alter table finance.google_sheet_exports add constraint google_sheet_exports_status_check check (status in ('pending','synced','failed','missing','held'));

-- The hash both sides last agreed on, per entry: it tells "changed in the sheet" from "changed in the app".
create table if not exists finance.sheet_rows (
  user_id text not null, entry_id text not null, hash text not null,
  primary key (user_id, entry_id)
);

alter table finance.google_drive_files
  add column if not exists name text,
  add column if not exists updated_remote text;
alter table finance.google_drive_files drop constraint if exists google_drive_files_status_check;
alter table finance.google_drive_files add constraint google_drive_files_status_check check (status in ('pending','uploaded','failed','pending_trash'));

create table if not exists finance.google_drive_state (
  user_id text primary key,
  next_check_at timestamptz not null default now(),
  hold text,
  confirm_removals boolean not null default false,
  last_checked_at timestamptz,
  last_error text
);
