# Supabase-first project guidance

This project uses Supabase as its backend.

When working on backend data/auth/storage, use the Supabase migration and SQL scripts under:
- packages/backend/supabase/migrations
- packages/backend/supabase/scripts

Prefer Supabase MCP/CLI workflows for schema and data changes.

## Canonical deployment target

For this `djiwatentramapp` repository, all app deployments use the T3-connected SSH host `djiwa-vps` only. Do not use the unrelated Dalang/Zantara VPS for this project.

- Production checkout: `/opt/djiwatentramapp`
- Canonical domain family: `*.djiwatentram.web.id`
- Customer webroot: `/opt/djiwatentramapp/apps/customer/dist`
- Other app webroots follow `/opt/djiwatentramapp/apps/<app>/dist`
- Verify the VPS host, checkout path, domain, and deployed `version.json` before declaring a deployment complete.
