# Buka Shift Kasir iOS-style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyederhanakan flow buka kasir menjadi satu langkah aktif per layar dengan UI iOS-style, validasi, draft recovery, review, checklist, dan success state.

**Architecture:** Pertahankan `MenuSidebar` dan hook write action yang sudah ada. Tambahkan helper murni untuk state draft/format/validasi agar mudah dites, lalu ubah render buka shift menjadi state machine ringan berbasis `startStep` tanpa menyentuh flow tutup shift.

**Tech Stack:** React, TypeScript, Tailwind utility classes, Vitest, existing shadcn-style components.

**Spec:** `docs/superpowers/specs/2026-10-27-open-shift-ios-design.md`

## Global Constraints

- Backend tetap menggunakan `useHybridStartShift` yang sudah ada.
- Deploy target tetap `djiwa-vps`, checkout `/opt/djiwatentramapp`, webroot `/opt/djiwatentramapp/apps/pos/dist`.
- Keyboard fast-typing/navigation hints tetap tidak boleh muncul.
- Flow tutup shift tidak diubah secara fungsional.

## Review Focus

- Refresh/close panel saat form terisi: draft harus pulih.
- Modal kosong, negatif, desimal, dan `Rp 0`: validasi dan konfirmasi harus konsisten.
- Shift aktif: flow buka tidak boleh tampil.
- Checklist pending: submit harus tertahan dan alasan terlihat.
- Error backend: input dan langkah aktif tidak boleh hilang.

### Task 1: Pure opening-flow helpers

**Files:**
- Create: `apps/pos/src/lib/shift-opening-flow.ts`
- Test: `apps/pos/src/lib/shift-opening-flow.test.ts`

- [ ] Write failing tests for validation, currency formatting, draft serialization/restoration, and step labels.
- [ ] Run the focused Vitest test and confirm it fails before implementation.
- [ ] Implement pure helpers with no React or browser dependency.
- [ ] Run the focused test and confirm it passes.

### Task 2: Replace the opening form presentation

**Files:**
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx`
- Test: `apps/pos/src/components/pos/menu-sidebar-opening-flow.test.ts`

- [ ] Add source-level regression tests for one active CTA, all four step labels, draft key, select-all/search copy, checklist statuses, and success CTA.
- [ ] Run the regression test and confirm it fails against the current UI.
- [ ] Add `startStep` and success state; render only the active opening step.
- [ ] Add iOS-style header/step pill, compact form cards, currency shortcuts, team search/select-all, review edit actions, checklist status cards, and success state.
- [ ] Wire existing submit/checklist handlers and draft persistence without changing backend calls.
- [ ] Run focused tests and confirm they pass.

### Task 3: Build and verify

- [ ] Run `git diff --check`.
- [ ] Run focused tests and POS type/build checks.
- [ ] Inspect generated POS bundle for removed keyboard markers and expected opening-flow copy.
- [ ] Create PR, link it, merge to `main`, and deploy from the merge commit to `djiwa-vps`.
- [ ] Verify `/menu`, `version.json`, HTTP 200, nginx syntax, and live bundle markers.
