-- =============================================================================
-- Add: closing_locks table for atomic closing operations
--
-- Why: Prevents race condition where 2 people closing for the same shift+role
-- both get detected as "last person" and double-update inventory.
-- The PK unique constraint acts as a distributed lock:
--   INSERT succeeds → lock acquired
--   INSERT fails (duplicate) → lock held by another request
-- =============================================================================

-- Create lock table in pos schema
create table if not exists pos.closing_locks (
  shift_name text not null,
  role text not null,
  locked_at bigint not null,
  staff_name text not null default '',
  primary key (shift_name, role)
);

-- Auto-release stale locks after 30 seconds (cleanup function)
create or replace function pos.cleanup_stale_closing_locks()
returns void
language plpgsql
as $$
begin
  delete from pos.closing_locks
  where locked_at < (extract(epoch from now()) * 1000 - 30000)::bigint;
end;
$$;

-- Grant permissions
grant usage on schema pos to anon, authenticated, service_role;
grant all on pos.closing_locks to service_role;
