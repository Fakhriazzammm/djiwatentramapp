-- Storage bucket and policies for app asset uploads (products, booking proofs, site settings)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-assets',
  'app-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read app-assets" on storage.objects;
create policy "Public read app-assets"
  on storage.objects
  for select
  to public
  using (bucket_id = 'app-assets');

drop policy if exists "Public insert app-assets" on storage.objects;
create policy "Public insert app-assets"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'app-assets');

drop policy if exists "Public update app-assets" on storage.objects;
create policy "Public update app-assets"
  on storage.objects
  for update
  to public
  using (bucket_id = 'app-assets')
  with check (bucket_id = 'app-assets');

drop policy if exists "Public delete app-assets" on storage.objects;
create policy "Public delete app-assets"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'app-assets');
