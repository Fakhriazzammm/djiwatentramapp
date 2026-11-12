# Finance Table First Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

Goal: Implement approved seven-page finance design with real existing data and preserved operational actions. Expenses must expose receipt thumbnails and full-size evidence.

- [x] Inspect all finance routes, data contracts, receipt storage and HPP consumers.
- [x] Add scoped command-center finance layout and reusable dense table controls; retain accessible dialogs and working mutations.
- [x] Replace overview charts with source-backed account/cash movement table, distinguishing period flow from actual balances.
- [x] Make transactions, accounting, expenses, reports, shifts and HPP table-first with meaningful columns and working filters/export/detail.
- [x] Resolve expense receipt references from metadata and receipt documents; support accessible preview and explicit missing/error states.
- [ ] Run targeted tests, type checks, production build and browser verification. Fix introduced errors.
- [ ] Commit/push scoped changes, deploy Admin through canonical artifact workflow, verify live artifact and source/data boundaries.

Validation: 16 focused tests passing (13 helper/dashboard tests + 3 finance loader regressions); affected-file TypeScript diagnostics 0. Full Admin type check retains unrelated baseline errors. Browser verified expense-only rows and 14 loaded receipt thumbnails, HPP products and costs, cash-flow table, journal rows, shift columns and individual selection. No schema migration required. Source receipts: metadata, attachmentUrl, receipt documents.
