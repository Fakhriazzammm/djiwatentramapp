# yumipos

A modern TypeScript monorepo for POS operations, admin analytics, booking, inventory, and AI-assisted workflows.

Refer to [TECHSTACK.md](TECHSTACK.md) for architecture details.

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
- [SUPABASE_MIGRATION_STATUS.md](SUPABASE_MIGRATION_STATUS.md)
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
