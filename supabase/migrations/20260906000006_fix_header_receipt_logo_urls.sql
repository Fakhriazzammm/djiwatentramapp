-- 2026-09-06: Fix header/receipt logos pointing at retired Supabase Cloud storage.
-- site_settings.logoUrl & receiptLogo referenced
--   xaemykhjpkgypqqpfdcb.supabase.co/storage/.../site-settings/1780133505508-logo-header.png
-- which returns HTTP 402 (project quota) and whose binary is not present on self-host.
-- Point them at the canonical per-domain static asset /logo-djiwa.png (served 200 by every webroot).
-- booking_settings.logo_url was empty -> /logo-djiwa.png so booking header shows the logo too.

begin;

update pos.site_settings
set raw = jsonb_set(
        jsonb_set(raw, '{logoUrl}', '"/logo-djiwa.png"'::jsonb),
        '{receiptLogo}', '"/logo-djiwa.png"'::jsonb
      )
where source_id = 'kn7fzmzkq6eycnw1r73nfhc37581x4hj'
  and coalesce(raw->>'logoUrl', '') like 'https://xaemykhjpkgypqqpfdcb.supabase.co/%';

update pos.booking_settings
set logo_url = '/logo-djiwa.png'
where slug = 'booking'
  and coalesce(logo_url, '') = '';

commit;
