# Canonical Domain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement inline task-by-task when no subagent is available). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all active app/runtime/deployment references from unavailable legacy domains to the canonical `djiwatentram.web.id` domain family.

**Architecture:** Keep auth centralized at `api.djiwatentram.web.id` and Supabase at `supabase.djiwatentram.web.id`. Preserve legacy values only in explicit compatibility code, then rebuild static apps so production bundles inherit the source fix.

**Tech Stack:** TypeScript, React/Vite, Bun tests/builds, Node/Python/shell deployment jobs, Better Auth, self-hosted Supabase.

**Spec:** `docs/superpowers/specs/2026-10-27-canonical-domain-migration-design.md`

## Global Constraints

- Active auth/customer API: `https://api.djiwatentram.web.id`.
- Active Supabase/Storage/Edge Function API: `https://supabase.djiwatentram.web.id`.
- Legacy domains remain only in explicit compatibility/migration allowlists.
- Do not change database schema or user data.
- Preserve unrelated dirty-worktree changes.

## Review Focus

- Auth buttons must never emit requests to `api.yumme.id`.
- Supabase reads, writes, storage, and Edge Functions must never emit requests to `supabase.yumme.id`.
- Deploy scripts must copy new builds to canonical web.id roots.
- Generated bundles must reflect source changes instead of retaining stale URLs.
- Legacy compatibility code must remain scoped and not be used as an active endpoint.

### Task 1: Add the canonical-domain contract test

**Files:**
- Create: `scripts/canonical-domain-contract.test.ts`
- Test: the listed active source/config/deploy files contain canonical domains and no legacy active endpoint URLs.

- [ ] Write assertions for active files and allowed compatibility files.
- [ ] Run `bun test scripts/canonical-domain-contract.test.ts` and confirm it fails on the current legacy references.

### Task 2: Migrate active source and deployment references

**Files:**
- Modify: customer cross-app links and preconnects.
- Modify: booking promo links and metadata.
- Modify: deployment scripts and operational Supabase jobs.
- Modify: legacy deployment templates that still target active app hosts.

- [ ] Replace active `.yumme.id` app/API/Supabase URLs with their web.id equivalents.
- [ ] Keep storage normalizers and auth trusted-origin lists as explicit compatibility exceptions.
- [ ] Run the contract test and confirm it passes.

### Task 3: Build affected frontend applications

**Files:**
- Generated: `apps/*/dist/**` for affected apps only.

- [ ] Build customer, booking, admin, pos, b2b, merchandise, ordermieyamin, karyawan, kolmarketing, investor, 500kopitasik, linkbio, and djiwapay as supported by their package scripts.
- [ ] Scan emitted JavaScript for legacy active endpoint hosts.

### Task 4: Verify runtime and production contracts

- [ ] Run relevant source tests and type checks.
- [ ] Verify canonical auth and Supabase hosts with bounded network checks.
- [ ] Verify production HTML references the rebuilt asset hashes where deployment is in scope.
- [ ] Review `git diff` and report any remaining legacy references with their compatibility rationale.
