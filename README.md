# Djiwa Tentram App (yumipos monorepo)

A modern TypeScript monorepo for POS operations, admin analytics, booking, inventory, and AI-assisted workflows.

Refer to [docs/TECHSTACK.md](docs/TECHSTACK.md) for architecture details.

## Features

- TypeScript
- React + TanStack Router
- TailwindCSS + shadcn/ui
- Supabase (database, auth/session integration, storage-ready)
- Better Auth
- AI integration for business insights and automation
- Turborepo monorepo workflow
- PWA + Tauri desktop support

## Getting Started

```bash
bun install
bun run dev:setup
bun run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Migration Status

Supabase cutover is active and legacy backend dependencies have been removed from runtime paths.

Detailed status:
- [docs/SUPABASE_MIGRATION_STATUS.md](docs/SUPABASE_MIGRATION_STATUS.md)
- [packages/backend/supabase/README.md](packages/backend/supabase/README.md)

## Project Structure

```text
yumipos/
|-- apps/
|   |-- web/         # Frontend app (React + TanStack Router)
|-- packages/
|   |-- backend/     # Supabase migrations/scripts
```

## Useful Scripts

- `bun run dev`
- `bun run build`
- `bun run dev:web`
- `bun run dev:setup`
- `bun run check-types`
- `bun run check`

## Deploy

Production berjalan di VPS `vps-djiwa-tentram`. Lihat [AGENTS.md](AGENTS.md) dan [docs/DEPLOYMENT_VPS_WORKFLOW.md](docs/DEPLOYMENT_VPS_WORKFLOW.md); jangan deploy dari runbook lain.
