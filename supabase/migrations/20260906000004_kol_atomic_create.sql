-- Atomic KOL creator creation for the authenticated kol-public boundary.
-- All inserts run in one PostgreSQL transaction; any child failure rolls back.
create or replace function pos.kol_create_creator(
  p_source_id text,
  p_name text,
  p_username text,
  p_username_normalized text,
  p_location text,
  p_category text,
  p_public_reason text,
  p_application_data jsonb,
  p_platforms jsonb,
  p_contact jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pos, pg_catalog
as $$
declare
  platform_row jsonb;
begin
  insert into pos.kol_creators (
    source_id, name, username, username_normalized, location, category,
    status, public_reason, application_data
  ) values (
    p_source_id, p_name, p_username, p_username_normalized, p_location,
    p_category, 'Potential', p_public_reason, coalesce(p_application_data, '{}'::jsonb)
  );

  for platform_row in select value from jsonb_array_elements(p_platforms)
  loop
    insert into pos.kol_platforms (
      kol_id, platform, username, username_normalized, profile_url, followers
    ) values (
      p_source_id,
      platform_row->>'platform',
      platform_row->>'username',
      platform_row->>'username_normalized',
      nullif(platform_row->>'profile_url', ''),
      greatest(0, coalesce((platform_row->>'followers')::bigint, 0))
    );
  end loop;

  if p_contact is not null then
    insert into pos.kol_private_contacts (
      kol_id, whatsapp, email, manager_name, manager_contact
    ) values (
      p_source_id,
      nullif(p_contact->>'whatsapp', ''),
      nullif(p_contact->>'email', ''),
      nullif(p_contact->>'manager_name', ''),
      nullif(p_contact->>'manager_contact', '')
    );
  end if;

  return jsonb_build_object('source_id', p_source_id);
end;
$$;

revoke all on function pos.kol_create_creator(text, text, text, text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function pos.kol_create_creator(text, text, text, text, text, text, text, jsonb, jsonb, jsonb) to service_role;
