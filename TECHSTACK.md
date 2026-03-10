# Tech Stack & Architecture

This project is a modern, full-stack application built with a focus on type-safety, performance, and developer experience.

## 🏗️ Core Architecture
- **Monorepo Management**: [Turborepo](https://turbo.build/)
- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)

---

## 💻 Frontend (`apps/web`)
A high-performance web application that also doubles as a desktop app.

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components**:
  - [Shadcn UI](https://ui.shadcn.com/)
  - [Base UI](https://base-ui.com/react)
  - [Lucide React](https://lucide.dev/) (Icons)
- **State Management & Real-time**: [Convex](https://www.convex.dev/)
- **Form Management**: [TanStack Form](https://tanstack.com/form) & [React Hook Form](https://react-hook-form.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Capabilities**:
  - **Universal Deployment**: Same codebase for Web, PWA, and Desktop.
  - **Desktop**: [Tauri](https://tauri.app/) (Cross-platform desktop app)
  - **PWA**: [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Progressive Web App support)

---

## ⚙️ Backend (`packages/backend`)
A serverless backend powered by Convex for real-time data sync and reliability.

- **Backend-as-a-Service**: [Convex](https://www.convex.dev/)
- **Authentication**: [Better Auth](https://www.better-auth.com/) with `@convex-dev/better-auth`
- **Validation**: [Zod](https://zod.dev/)
- **AI-Driven Operations**: [OpenAI](https://openai.com/) integration for:
  - **AI Business Analyst**: Automated company performance insights and summaries.
  - **Stock-out Prediction**: Intelligent inventory forecasting based on usage patterns.
  - **AI Product Copy**: Automatic generation of product descriptions for faster cataloging.

---

## 🔌 Specialized Integrations
- **POS Hardware**: Bluetooth Printer support for receipt printing using standard ESC/POS commands.
- **Image Hosting**: Integrated Convex Storage for high-performance asset delivery.

---

## 🛠️ Tools & Standards

### Quality Control
- **Linting & Formatting**: Prettier / ESLint

### Environment Management
- **Type-safe Env**: Custom package in `packages/env` using Zod for validation.

---

## 🚀 Key Features of this Stack
1. **End-to-End Type Safety**: Shared types between frontend and backend via Convex and TypeScript.
2. **Real-time by Default**: Convex ensures all users stay in sync without complex web socket management.
3. **Multi-platform**: Deploy as a Web App, PWA, or Desktop App (via Tauri) from a single codebase.
4. **Hardware Ready**: Built-in support for POS peripherals like Bluetooth thermal printers.
5. **Intelligent Dashboard**: AI-powered insights and predictions built directly into the admin experience.
6. **Modern Frameworks**: React 19, Tailwind 4, and TanStack routing for ultimate performance and DX.
