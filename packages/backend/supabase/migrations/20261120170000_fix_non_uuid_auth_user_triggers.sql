begin;

-- Sebagian akun lama (mis. hasil migrasi Convex/Google) menyimpan auth_user_id
-- yang bukan UUID atau kosong. Trigger lama melakukan `auth_user_id::uuid`
-- tanpa guard sehingga UPDATE is_active gagal dengan error 22P02 dan karyawan
-- tidak bisa dinonaktifkan. Hanya sinkronkan ke auth.users jika ID benar-benar UUID.
create or replace function public.deactivate_yumi_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active = false and (old.is_active = true or old.is_active is null) then
    -- Revoke custom sessions
    delete from public.yumi_sessions where user_source_id = new.source_id;

    -- Revoke Supabase Auth session (hanya untuk akun yang punya UUID valid)
    if new.auth_user_id is not null
       and new.auth_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      update auth.users
      set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_active', false),
          banned_until = now() + interval '100 years'
      where id = new.auth_user_id::uuid;
    end if;
  end if;

  if new.is_active = true and old.is_active = false then
    -- Reactivate (hanya untuk akun yang punya UUID valid)
    if new.auth_user_id is not null
       and new.auth_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      update auth.users
      set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_active', true),
          banned_until = null
      where id = new.auth_user_id::uuid;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_yumi_user_to_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is not null
     and new.auth_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
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

commit;
