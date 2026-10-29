# Supabase-first project guidance

This project uses Supabase as its backend.

When working on backend data/auth/storage, use the Supabase migration and SQL scripts under:
- packages/backend/supabase/migrations
- packages/backend/supabase/scripts

Prefer Supabase MCP/CLI workflows for schema and data changes.

## Repository orientation

- This is a Bun + Turbo monorepo. Read `README.md` for the quick start and `PROJECT.md` for the domain/architecture map; verify current source before relying on older route or schema inventories in that blueprint.
- App code lives under `apps/<app>`; reusable UI and business code lives under `packages/`. Shared product UI is primarily in `packages/yumipos-web-shared`.
- Before editing, inspect the target app/package `package.json`, nearby implementations, and `git status`. Preserve unrelated working-tree changes.
- Use the package manager pinned in `package.json` (`bun@1.3.4`) and existing scripts. Keep changes scoped; do not silently change payment, order, auth, inventory, attendance, or payroll behavior during UI work.
- For UI work, follow `DESIGN.md`, inspect existing shared tokens/components/assets first, and prefer shared components over app-local duplicates.
- For backend work, inspect the relevant migration, function, and data callers. Keep schema changes in `packages/backend/supabase/migrations` and scripts in `packages/backend/supabase/scripts`; do not edit generated files by hand.
- Report exactly what you inspected and verified. A build, HTTP 200, or screenshot alone does not prove production data/auth or deployment correctness.

## Common commands

- `bun install` — install workspace dependencies when needed.
- `bun run dev:<app>` — start a supported app (see root `package.json`).
- `bun run check-types` — workspace type checks.
- `bun run build:<app>` — build a supported app; note some build scripts update version/manifests.
- `bun run <script>` — inspect root/package scripts before choosing a task-specific check.

Do not run broad build scripts casually: several update generated version or PWA manifest files. Check `git status` afterward and preserve intentional changes.

## Cross-project, cross-app, and cross-VPS work

- The user's work may span multiple repositories, products, apps, environments, and VPS hosts. Do not assume that the current repository, app, deployment target, credentials, or runtime conventions apply to another task.
- At the start of work, identify the active repository from the actual workspace, then identify the target app/package, environment, and requested outcome. Read that repository's `AGENTS.md` (and relevant local guidance) before changing files or operating infrastructure.
- Treat `apps/<app>` as distinct products with potentially different routes, branding, auth, build scripts, data boundaries, and deploy paths. Shared packages are reusable contracts, but inspect app-specific usage before changing them.
- For work spanning apps, trace callers and consumers across all affected apps and shared packages. Keep app-specific behavior explicit; avoid assuming that matching filenames imply matching behavior.
- For work spanning projects or VPS hosts, verify the named host, repository checkout, domain, and target service from the active project instructions and live environment evidence. Never carry a host, path, domain, secret, or deployment procedure from one project to another by analogy.
- The canonical deployment section below applies only to this `djiwatentramapp` repository. It does not authorize using this VPS for another project, and another project's instructions do not override it. Deploy to a different VPS only when that project explicitly names or configures it.
- Before any deploy or infrastructure change, confirm the repository-specific runbook and verify the target identity. Report each boundary separately: local change, source revision, deployed artifact, service health, and public reachability.

## Canonical deployment target

For this `djiwatentramapp` repository, all app deployments use the T3-connected SSH host `djiwa-vps` only. Do not use the unrelated Dalang/Zantara VPS for this project.

- Production checkout: `/opt/djiwatentramapp`
- Canonical domain family: `*.djiwatentram.web.id`
- Customer webroot: `/opt/djiwatentramapp/apps/customer/dist`
- Other app webroots follow `/opt/djiwatentramapp/apps/<app>/dist`
- Verify the VPS host, checkout path, domain, and deployed `version.json` before declaring a deployment complete.
