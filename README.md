# tkmpos

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Convex, and more.

Refer to [TECHSTACK.md](file:///a:/My-Startup/tkmpos/TECHSTACK.md) for a detailed breakdown of the technologies used in this project.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Convex** - Reactive backend-as-a-service platform
- **Authentication** - Better-Auth
- **AI Integration** - Business insights, stock prediction, and automated content
- **Hardware Support** - Bluetooth receipt printing (ESC/POS)
- **Turborepo** - Optimized monorepo build system
- **PWA** - Progressive Web App support
- **Tauri** - Build native desktop applications
- **Biome** - Linting and formatting
- **Husky** - Git hooks for code quality

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Convex Setup

This project uses Convex as a backend. You'll need to set up Convex before running the app:

```bash
bun run dev:setup
```

Follow the prompts to create a new Convex project and connect it to your application.

Copy environment variables from `packages/backend/.env.local` to `apps/*/.env`.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Your app will connect to the Convex cloud backend automatically.

## Git Hooks and Formatting

- Initialize hooks: `bun run prepare`
- Format and lint fix: `bun run check`

## Project Structure

```
tkmpos/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
├── packages/
│   ├── backend/     # Convex backend functions and schema
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:setup`: Setup and configure your Convex project
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check`: Run Biome formatting and linting
- `bun run convex:push`: Deploy backend to Convex production
- `bun run convex:pull`: Sync and develop with Convex locally
- `cd apps/web && bun run generate-pwa-assets`: Generate PWA assets
- `cd apps/web && bun run desktop:dev`: Start Tauri desktop app in development
- `cd apps/web && bun run desktop:build`: Build Tauri desktop app
