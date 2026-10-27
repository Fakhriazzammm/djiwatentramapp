# POS Product Variation Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Panas/Dingin and Regular/Seasonal independent single-choice groups in the POS product sheet and simplify its mobile layout.

**Architecture:** Keep the existing `ProductDetailSheet` and cart API. Resolve a stable group key from the stored label (`name`, falling back to legacy `type`) and use it consistently for default selection, rendering, labels, and price calculation.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-10-27-pos-product-variation-sheet-design.md`

## Global Constraints

- Do not change the stored product variation schema or backend.
- Keep the current first-option default, pricing behavior, quantity stepper, and cart callback.
- Each group allows one active option, independently from all other groups.
- The sheet remains mobile-first and safe-area-aware.
- Do not add or run tests for this task.

## Review Focus

- Two groups with distinct `name` values retain separate selections and surcharges.
- Legacy groups with only `type` continue to render and price correctly.
- Empty or missing group labels receive a readable fallback and do not collide.
- The displayed selected labels and total match the options that will enter the cart.
- Narrow screens retain reachable controls and a visible add action above the safe area.

---

### Task 1: Correct independent variation selection

**Files:**
- Modify: `apps/pos/src/routes/menu.lazy.tsx`

- [ ] Resolve group labels from `name`, then legacy `type`, then an indexed fallback; include the group index in selection keys.
- [ ] Use the same key for initial selection, option button state, selected label order, required-selection checks, and option price calculation.
- [ ] Use single-choice radio semantics and explicit selected styling for each option.

### Task 2: Simplify the mobile product sheet

**Files:**
- Modify: `apps/pos/src/routes/menu.lazy.tsx`

- [ ] Compact the header and reduce decorative labels and nested borders.
- [ ] Give each group a clear title and concise selection instruction, with 48px minimum option targets.
- [ ] Keep quantity and total concise; make the add button sticky and safe-area-aware.
- [ ] Run the POS production build and `git diff --check`; do not run tests.
