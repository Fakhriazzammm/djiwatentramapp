# Remove POS Keyboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the dedicated POS keyboard-navigation feature and its UI hints while preserving search and barcode input.

**Architecture:** Delete the menu screen's integration with `useMenuKeyboardNav` and remove only state/classes/rendered copy that depend on it. Leave the standalone search input and barcode scanner unchanged.

**Tech Stack:** React, TypeScript, Vite, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-26-remove-pos-keyboard-navigation-design.md`

## Global Constraints

- Deploy this repository only to the T3-connected SSH host `djiwa-vps`.
- Verify the production checkout, domain, webroot, and deployed `version.json` before declaring deployment complete.

## Review Focus

- No dedicated keyboard-navigation hook or shortcut hint remains in the POS source.
- Product search remains a normal text input.
- Barcode scanning remains available.
- POS type-check and production build remain valid.

### Task 1: Remove keyboard-navigation integration

**Files:**
- Modify: `apps/pos/src/routes/menu.lazy.tsx`
- Delete: `apps/pos/src/hooks/use-menu-keyboard-nav.ts`

**Interfaces:**
- Consumes: existing product, search, cart, and barcode flows.
- Produces: a menu screen with no dedicated global keyboard-navigation layer or shortcut hint UI.

- [ ] Remove the hook import, keyboard-only state, callback, hook invocation, focus-ring classes, and shortcut hint block.
- [ ] Delete the now-unused hook file.
- [ ] Run source searches confirming no dedicated keyboard-navigation references remain.
- [ ] Run `pnpm --filter @yumipos/pos check-types`.
- [ ] Run `pnpm --filter @yumipos/pos build`.
- [ ] Commit the change.

### Task 2: Push and deploy

**Files:**
- No additional source files.

**Interfaces:**
- Consumes: the verified commit from Task 1.
- Produces: the same commit pushed to GitHub and deployed to `djiwa-vps`.

- [ ] Push the current branch to its configured GitHub remote.
- [ ] Verify the VPS checkout and deploy using the repository's existing deployment workflow.
- [ ] Verify `version.json` and the canonical POS webroot on the VPS.
