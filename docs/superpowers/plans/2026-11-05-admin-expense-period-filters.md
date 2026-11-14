# Admin Expense Period Filters Implementation Plan

> **For agentic workers:** Use this plan task by task. Do not change finance data contracts or shared report behavior.

**Goal:** Add compact additional date presets, YTD, and an inclusive custom date range to the Admin Pengeluaran page.

**Architecture:** Keep the implementation local to the expense table component. Reuse the existing `getRangeFromPeriod` helper for supported presets and `DateRange` contract; calculate YTD locally so other report pages do not gain new behavior. Keep the existing finance hook and client filters.

**Tech Stack:** React, TypeScript, date-fns, existing Admin UI styles.

**Spec:** `docs/superpowers/specs/2026-11-05-admin-expense-period-filters.md`

## Global Constraints

- Preserve category/search/sort/pagination behavior.
- Use local calendar-day boundaries and an inclusive end date.
- Do not change shared report period controls, Supabase schema, or finance authorization.
- Preserve unrelated working-tree changes.

## Review Focus

- YTD must stop at the end of today, not December 31.
- Custom range must reject incomplete or reversed dates without replacing the active range.
- CSV export with zero filtered rows must not fall back to unfiltered rows.
- Ensure existing page-size/data-fetch constraints remain visible; do not silently claim complete long-range exports if the underlying read is capped.
- Check narrow layouts so the added controls wrap without clipping.

---

### Task 1: Add period selection to the expenses page

**Files:**
- Modify: `apps/admin/src/routes/admin/finance/expenses/-components/expenses-table.tsx`
- Modify: `apps/admin/src/hooks/use-hybrid-finance-analytics-data.ts`

**Interfaces:**
- Consumes: `getRangeFromPeriod(period: PeriodOption, customStart?: Date, customEnd?: Date): DateRange` and the current `useHybridTransactionDetailReport` date range arguments.
- Produces: expense-page-local selection for `today`, `this_week`, `this_month`, `year_to_date`, `yesterday`, `last_month`, `this_year`, and `custom`.
- Extends: `fetchFinancialTransactions(args, limit?)` with an optional read limit, used only by the transaction detail report at 2,000 rows to match its existing client page-size cap.

- [x] Add the YTD range as January 1 through `endOfDay(now)` and relabel the main year preset as `Tahun Berjalan`.
- [x] Add a `Periode lainnya` control for Kemarin, Bulan Lalu, Tahun Kalender, and Rentang Tanggal; keep the four main presets visible.
- [x] Add local date inputs and an explicit Terapkan action. Keep the active range until the custom range is complete and valid.
- [x] Keep the date range as the sole period input to the existing query; request at most 2,000 rows only for the detail report and retain current category/search/sort/pagination composition.
- [x] Make CSV export receive exactly `filtered`, including the empty array; remove the fallback to `allTransactions`.
- [x] Run the Admin package type check and inspect the final diff/status for unrelated changes.

**Verification result:** `git diff --check` passed. `npx --yes bun@1.3.4 --filter @djiwaapps/admin check-types` reports existing type errors across Admin; the only diagnostic in the modified expense page is its unchanged reconciliation `.then(...).catch(...)` at line 131. No diagnostics point to the new filter logic or the modified finance hook.
