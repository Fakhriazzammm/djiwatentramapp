# Tech Stack & Architecture

## Core
- Monorepo: Turborepo
- Runtime/Package Manager: Bun
- Language: TypeScript

## Frontend (`apps/web`)
- Framework: React 19
- Build Tool: Vite
- Routing: TanStack Router
- Styling: Tailwind CSS v4
- UI: shadcn/ui, Base UI, Lucide React
- Data layer: Supabase-first hooks and RPC-backed reads/writes
- Form stack: TanStack Form + React Hook Form
- Motion: Framer Motion
- Targets: Web, PWA, Desktop (Tauri)

## Backend (`packages/backend`)
- Supabase Postgres migrations
- SQL/RPC transform and support scripts
- Better Auth integration
- Zod-based environment validation

## Integrations
- POS hardware (ESC/POS Bluetooth printing)
- AI workflows (OpenAI)

## Quality
- Prettier + ESLint
- Type-safe env package in `packages/env`

## Key Characteristics
1. End-to-end TypeScript contracts
2. Supabase as active backend runtime
3. Single codebase for web, PWA, and desktop
4. POS-ready hardware integration
5. AI-assisted operational dashboards
