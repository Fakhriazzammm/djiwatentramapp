-- Fix: Grant pos schema access to service_role (for Edge Functions)
-- Migration 0017 only granted to anon, authenticated — Edge Functions use service_role
grant usage on schema pos to service_role;
grant usage on schema legacy_mirror to service_role;
grant all privileges on all tables in schema pos to service_role;
grant all privileges on all tables in schema legacy_mirror to service_role;
alter default privileges in schema pos grant all on tables to service_role;
alter default privileges in schema legacy_mirror grant all on tables to service_role;
