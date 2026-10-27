# POS Compact Variation Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the POS product variation sheet fit mobile screens with a compact iOS-style layout.

**Architecture:** Keep `ProductDetailSheet` and its pricing/selection behavior intact. Adjust only responsive layout, spacing, and option presentation in `apps/pos/src/routes/menu.lazy.tsx`.

**Tech Stack:** React, Tailwind utility classes, existing Sheet components.

**Spec:** Compact mobile sheet with an approximately 84dvh height cap, smaller header/cards, single-line variation choices, scrollable content, and persistent add-to-cart footer.

## Global Constraints

- Preserve variation defaults, selection, quantity, price calculation, and add-to-cart behavior.
- Keep touch targets usable and respect the device safe area.
- Keep the change limited to the POS product detail sheet.

## Review Focus

- Long option labels and prices remain readable without wrapping into tall buttons.
- Large variation sets remain reachable through horizontal option scrolling and vertical sheet scrolling.
- Footer stays visible while the option list scrolls.

---

### Task 1: Compact the mobile variation sheet

**Files:**
- Modify: `apps/pos/src/routes/menu.lazy.tsx` (`ProductDetailSheet`)

- [ ] Reduce sheet maximum height to approximately `84dvh`; tighten header, card, and footer spacing and type sizes.
- [ ] Keep each variation choice on one line and allow the choices row to scroll horizontally on narrow screens.
- [ ] Preserve the vertical scroll area and sticky footer with safe-area padding.
- [ ] Review the diff and run `git diff --check`.
