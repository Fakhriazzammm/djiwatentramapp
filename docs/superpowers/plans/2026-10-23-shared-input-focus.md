# Shared Input Focus Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove dark/double input outlines across Djiwa Tentram apps while retaining one subtle, accessible focus indicator.

**Architecture:** Fix the shared focus selector at its source in `yumipos-web-shared/theme.css`, then add explicit input focus normalization for surfaces that do not consume the shared theme. Keep component-level error and success rings intact.

**Tech Stack:** Tailwind CSS, shared CSS tokens, React/Vite, Bun tests.

**Spec:** User request to remove black input outlines and avoid thick iOS/Apple-style focus treatment across the whole monorepo.

## Global Constraints

- Form controls must never receive the dark global outline.
- A focused control may show one border/ring treatment only.
- Keyboard focus remains visible through a low-contrast primary ring.
- Do not remove focus indication from buttons, links, dialogs, or composite widgets.

## Review Focus

- Nested input inside a `focus-within` search container must not render a second outline.
- Error/success inputs must preserve their semantic ring colors.
- Apps with custom CSS must not reintroduce a dark `outline` on inputs.
- Non-form controls must retain keyboard focus visibility.

### Task 1: Shared focus token correction

**Files:**
- Modify: `packages/yumipos-web-shared/src/theme.css`
- Test: `packages/yumipos-web-shared/src/theme-focus.test.ts`

- [ ] Add a source-level regression test for the focus selector contract.
- [ ] Run it red against the current global `*:focus-visible` rule.
- [ ] Exclude form controls from the generic dark outline and give them one subtle primary ring.
- [ ] Run the focused test and shared consumer build.

### Task 2: App-specific input normalization

**Files:**
- Modify: `apps/pos/src/components/auth/identity-picker.tsx`
- Modify: custom app CSS files containing thick form-control focus outlines.

- [ ] Add explicit `focus-visible:outline-none` and ring reset to the nested kasir search input.
- [ ] Normalize custom form focus selectors in non-shared apps without touching button/link focus styles.
- [ ] Run POS tests and production builds for affected apps.

### Task 3: Final verification

- [ ] Run `git diff --check`.
- [ ] Run focused regression tests and the relevant app builds.
- [ ] Inspect the final diff for accidental broad focus removal.
