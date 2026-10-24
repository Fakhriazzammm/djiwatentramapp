-- The public view previously exposed only source_id and raw. The frontend
-- cannot reliably identify the active settings row by source_id because it
-- is not chronological. Expose the source creation time for deterministic
-- newest-record selection.
create or replace view public.pos_site_settings
with (security_invoker = true) as
select
  source_id as _id,
  raw,
  creation_time
from pos.site_settings;
