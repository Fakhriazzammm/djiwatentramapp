-- 20260522_supabase_auth_preparatory.sql
-- Supabase Auth Migration - Preparatory Functions & Triggers
-- Fase 2: Create functions and triggers only (no RLS/permission changes)
-- Safe to deploy at any time — zero operational impact

-- ============================================================
-- 1. Sync Function: yumi_users → auth.users.raw_user_meta_data
-- When yumi_users data changes, update auth users metadata
-- ============================================================
create or replace function public.sync_yumi_user_to_auth()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.auth_user_id is not null then
    update auth.users
    set raw_user_meta_data = jsonb_build_object(
      'source_id', new.source_id,
      'name', new.name,
      'slug', new.slug,
      'role_source_id', new.role_source_id,
      'is_active', new.is_active,
      'receive_report_emails', new.receive_report_emails
    )
    where id = new.auth_user_id::uuid;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_yumi_user_to_auth on public.yumi_users;
create trigger trg_sync_yumi_user_to_auth
  after update of name, slug, role_source_id, is_active on public.yumi_users
  for each row
  execute function public.sync_yumi_user_to_auth();

-- ============================================================
-- 2. Deactivation Cascade: yumi_users → yumi_sessions + auth.users
-- ============================================================
create or replace function public.deactivate_yumi_user()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.is_active = false and (old.is_active = true or old.is_active is null) then
    -- Revoke custom sessions
    delete from public.yumi_sessions where user_source_id = new.source_id;

    -- Revoke Supabase Auth session
    update auth.users
    set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_active', false),
        banned_until = now() + interval '100 years'
    where id = new.auth_user_id::uuid;
  end if;

  if new.is_active = true and old.is_active = false then
    -- Reactivate
    update auth.users
    set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_active', true),
        banned_until = null
    where id = new.auth_user_id::uuid;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deactivate_yumi_user on public.yumi_users;
create trigger trg_deactivate_yumi_user
  before update of is_active on public.yumi_users
  for each row
  execute function public.deactivate_yumi_user();

-- ============================================================
-- 3. Custom Claims Function: Get role/permissions for current user
-- Used by RLS policies to check user role
-- ============================================================
create or replace function public.get_yumi_user_claims()
returns jsonb
language plpgsql
security definer
stable
as $$
/**
 * Returns JSON with role info for the currently authenticated user.
 * Used by RLS policies to check admin/staff permissions.
 * Example: public.get_yumi_user_claims()->>'role_name'
 */
declare
  claims jsonb;
begin
  select jsonb_build_object(
    'role_name', r.name,
    'permissions', coalesce(r.permissions, '[]'::jsonb),
    'source_id', u.source_id,
    'name', u.name
  ) into claims
  from auth.users au
  join public.yumi_users u on u.auth_user_id = au.id::text
  left join public.yumi_roles r on r.source_id = u.role_source_id
  where au.id = auth.uid();

  return coalesce(claims, '{}'::jsonb);
end;
$$;

grant execute on function public.get_yumi_user_claims to authenticated;
