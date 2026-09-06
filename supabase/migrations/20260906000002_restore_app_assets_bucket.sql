-- Restore the canonical public bucket used by product/site assets on self-hosted Supabase.
-- Binary product objects are intentionally not fabricated here; this migration only
-- makes the target bucket available for verified uploads/restores.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'app-assets',
  'app-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
