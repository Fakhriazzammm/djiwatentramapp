# Plan: Peningkatan Zantara Project Knowledge

## Goal

Membuat Zantara Agent memahami secara persisten dan komprehensif seluruh project Djiwa Tentram App — struktur, fitur, integrasi, relasi antar sistem, sinkronisasi data, dan business rules — sehingga setiap task berikutnya lebih cepat, lebih akurat, tanpa perlu baca ulang file yang sama.

---

## Current Context

### Yang Sudah Ada

| Aset | Status | Detail |
|------|--------|--------|
| **PROJECT.md** | ✅ Ada (322 lines) | Route map, 5-layer inventory sync pattern, hooks reference, Edge Functions, styling conventions, common pitfalls |
| **AGENTS.md** | ✅ Ada | Task classification, quality gates, recovery playbooks, subagent handoff protocol |
| **Domain Skills (6)** | ✅ Ada | `djiwatentramapp-shift-system`, `djiwatentramapp-contract-system`, `djiwatentramapp-per-menu-stock-migration`, `djiwatentramapp-attendance-scheduling`, `djiwatentramapp-admin-ui-feature-integration`, `djiwatentramapp-admin-sidebar-reorganization` |
| **Memory** | ✅ Ada | User preferences, tool quirks, project conventions |
| **Edge Functions** | ✅ 8 functions | yumi-auth, yumi-ai, auto-close-shifts, send-telegram-report, record-financial-transaction, onboarding-admin, generate-payroll, delete-employee-cascade |

### Yang Belum Ada / Perlu Ditingkatkan

| Kebutuhan | Gap |
|-----------|-----|
| **Entity Relationship Map** | PROJECT.md belum punya mapping tabel mana join/relasi ke tabel mana |
| **Cross-Feature Sync Map** | Belum ada dokumentasi tentang efek berantai (contoh: tutup shift → insert finance → update inventory → kirim Telegram) |
| **Integration Registry** | Belum ada catatan lengkap cron jobs, webhooks, integrasi eksternal (Telegram bot commands, payment gateway, dll) |
| **Database Schema Lengkap** | Belum ada daftar semua tabel, view, RPC functions, RLS policies |
| **Business Rules Repository** | Aturan unik project (auto-deduct, contentToBaseFactor, per-menu stock, dll) masih tersebar di memory/task history |
| **Continuous Update Workflow** | Belum ada mekanisme otomatis update pengetahuan setiap selesai task |
| **Architecture Diagram** | Belum ada visual data flow antar sistem |

---

## Proposed Approach

### Strategi

**3 Phase, incremental:** dimulai dari yang paling memberikan value langsung, lalu diperdalam bertahap.

1. **Phase 1 — Foundation** (PROJECT.md enhancement + schema audit)
2. **Phase 2 — Domain Skills** (5-7 domain skills baru)
3. **Phase 3 — Automation & Visual** (continuous update workflow + architecture diagram)

Setiap phase selesai dalam 1 sesi kerja masing-masing. Tidak perlu nunggu semua selesai untuk mulai merasakan manfaatnya.

---

## Step-by-Step Plan

### Phase 1: Foundation (~2-3 jam)

**Goal:** PROJECT.md diperkaya jadi single source of truth untuk semua knowledge project.

#### Task 1.1: Database Schema Audit
- **Aktivitas:** Baca semua migration files → mapping tabel, view, RPC functions
- **Output ke PROJECT.md:** Tabel lengkap per schema (`pos.*`, `public.*`, dll) dengan kolom, tipe, relasi foreign key
- **Files touched:** hanya PROJECT.md
- **Verifikasi:** Build success (PROJECT.md gak ngaruh ke build)

#### Task 1.2: Entity Relationship Map
- **Aktivitas:** Trace foreign key constraints dan data flow antar tabel
- **Output ke PROJECT.md:** ER diagram dalam format markdown:
  ```
  pos.menu_items ←── pos.order_items ──→ pos.orders ──→ pos.financial_transactions
  pos.inventory ←── pos.recipe_ingredients ──→ pos.recipes
  ```
- **Output terpisah:** `.hermes/er-diagram.md` dengan relasi lengkap

#### Task 1.3: Cross-Feature Sync Map
- **Aktivitas:** Trace efek berantai dari setiap action utama
- **Output ke PROJECT.md:** 
  ```
  ## Sync Chains
  ### Clock Out (Attendance) → Stock Opname → Insert Transactions
  ### Order Complete → Update Inventory (auto-deduct) → Insert Finance
  ### Shift Close → Insert Financial Transactions → Send Telegram Report
  ```
- **Daftar action utama:** Open shift, close shift, create order, clock in, clock out, approve payroll, register employee, delete employee

#### Task 1.4: Integration Registry
- **Aktivitas:** Catat semua integrasi eksternal
- **Output ke PROJECT.md:**
  - Edge Functions: trigger, endpoint, purpose, tabel yang di-write
  - Telegram bot: commands, report schedules, groups
  - Cron jobs: schedule, script, purpose
  - Yumi Agents (finance, purchasing): purpose, tabel yang diakses
  - External integrations: payment gateway, dll

#### Task 1.5: Business Rules Repository
- **Aktivitas:** Kumpulkan semua aturan bisnis yang tersebar di history, memory, dan kode
- **Output ke PROJECT.md:**
  ```
  ## Business Rules
  ### Inventory
  - Auto-deduct: stok berkurang saat order status = 'completed'
  - Conversion: contentToBaseFactor (bukan conversionFactor) untuk harga/unit
  - Per-menu stock: stok dihitung per menu, bukan per bahan baku
  
  ### Attendance
  - Shift active: hanya 1 shift aktif per user per hari
  - Stock opname: wajib saat clock out
  ```
- **Referensi:** Ambil dari memory, task history, LESSONS.md, dan kode

---

### Phase 2: Domain Skills (~3-4 jam)

**Goal:** 7 domain skills yang bisa di-load otomatis saat task relevan.

#### Task 2.1: `djiwatentramapp-inventory` skill
- **Isi:** Tabel inventory & views, conversion pattern (contentToBaseFactor), auto-deduct logic, inline edit (5-layer sync), RLS policies, unit conversion, lastPurchasePrice flow, stock opname
- **Trigger conditions:** Task soal inventory, stok, harga/unit, conversion

#### Task 2.2: `djiwatentramapp-attendance` skill
- **Isi:** Tabel shifts, clock in/out flow, stock opname saat clock out, per-role team member display, shift reports, scheduling matrix, payroll integration
- **Trigger conditions:** Task soal attendance, shift, clock in/out, absensi

#### Task 2.3: `djiwatentramapp-pos` skill
- **Isi:** Order flow (create → kitchen/bar → complete), payment flow, customer ordering page (`/$brandSlug`), menu management, booking system
- **Trigger conditions:** Task soal POS, order, menu, payment, cashier

#### Task 2.4: `djiwatentramapp-finance` skill
- **Isi:** Tabel financial_transactions, accounting system, HPP calculation, payroll generation, finance reports, shift reports, double-entry accounting
- **Trigger conditions:** Task soal finance, akuntansi, payroll, HPP, laporan keuangan

#### Task 2.5: `djiwatentramapp-auth` skill
- **Isi:** Custom auth flow (yumi-auth edge function), PIN login, Face Recognition, dual auth (custom session + Supabase Auth JWT), permissions/roles, admin guard
- **Trigger conditions:** Task soal login, auth, PIN, permission, register

#### Task 2.6: `djiwatentramapp-telegram` skill
- **Isi:** Bot commands, report mechanisms, cron-driven reports, shift report format, error handling, Telegram markdown quirks
- **Trigger conditions:** Task soal Telegram bot, report, notifikasi

#### Task 2.7: `djiwatentramapp-onboarding-contract` skill
- **Isi:** Employee onboarding flow, contract system, approval workflow, registration counters, NIP generation
- **Trigger conditions:** Task soal onboarding, kontrak, karyawan baru, registrasi

#### Format setiap skill:
```yaml
---
name: djiwatentramapp-<domain>
description: <deskripsi singkat>
---
# [Domain] — Knowledge Base

## Trigger Conditions

## Database Tables & Views

## Key Data Flows

## Business Rules

## Integration Points

## Common Pitfalls (from real errors)
```

---

### Phase 3: Automation & Visual (~1-2 jam)

**Goal:** Pengetahuan tetap update otomatis + visual architecture.

#### Task 3.1: Continuous Knowledge Harvesting Workflow
- Update AGENTS.md dengan prosedur: "setiap selesai task, cek apakah ada fakta baru → update PROJECT.md / skill terkait"
- Update SOUL.md bagian Self-Improvement dengan trigger spesifik project

#### Task 3.2: Architecture Diagram
- **Aktivitas:** Generate SVG architecture diagram dengan `architecture-diagram` skill
- **Isi:** Frontend (React/Vite/TanStack Router) → Backend (Supabase Edge Functions/PostgreSQL) → External (Telegram, Yumi Agents)
- **Output:** `docs/architecture-diagram.html` — bisa dibuka di browser kapan saja

#### Task 3.3: Memory Refresh
- Update memory dengan mapping penting:
  - Domain skill names untuk quick reference
  - Entity relationship singkat
  - Integration points

---

## Files Likely Changed

| File | Phase | Perubahan |
|------|-------|-----------|
| `PROJECT.md` | 1 | Tambah ER map, sync map, integrations, business rules |
| `.hermes/er-diagram.md` | 1 | File baru — entity relationship dalam markdown |
| `SOUL.md` | 3 | Update self-improvement trigger |
| `AGENTS.md` | 3 | Update prosedur continuous knowledge harvesting |
| Memory (user profile) | 3 | Tambah mapping domain skill names |
| `docs/architecture-diagram.html` | 3 | File baru — SVG architecture diagram |
| 7 new skill files | 2 | Domain skills untuk inventory, attendance, POS, finance, auth, telegram, onboarding |

---

## Testing & Verification

| Phase | Verification |
|-------|-------------|
| 1 | `turbo build` success, PROJECT.md terbaca dengan baik di sesi berikutnya |
| 2 | Masing-masing skill bisa di-load via `skill_view()`, isi akurat sesuai kode |
| 3 | Architecture diagram terbuka di browser, continuous update workflow bisa dijalankan |

---

## Risks & Tradeoffs

| Risk | Mitigasi |
|------|----------|
| **Skill jadi stale** — jika kode berubah tapi skill tidak diupdate | Continuous harvesting workflow di Phase 3 otomatis trigger update; kalau skill outdated saat dipake → patch langsung |
| **PROJECT.md terlalu panjang** — 322 lines sekarang, bisa 500+ setelah enhancement | Gunakan struktur dengan anchor links; pisahkan detail teknis ke file terpisah |
| **Duplicate knowledge** — info di PROJECT.md dan di skill tumpang tindih | PROJECT.md = overview, skill = deep dive per domain. Konsisten via referensi silang |
| **Waktu audit** — mapping semua tabel & relasi butuh waktu | Prioritaskan tabel yang paling sering diakses: inventory, orders, shifts, financial_transactions |

---

## Open Questions

1. Apakah perlu format ER diagram dalam visual (Mermaid.js) atau cukup markdown table?
2. Skill yang udah ada (shift-system, contract-system, dll) — digabung ke domain skill baru atau dibiarin terpisah?

---

## Ringkasan

```
Phase 1 (Foundation)     — 2-3 jam — Enhanced PROJECT.md
Phase 2 (Domain Skills)  — 3-4 jam — 7 domain skills
Phase 3 (Automation)     — 1-2 jam — Workflow + Diagram
─────────────────────────────────────────────────
Total estimasi           — 6-9 jam — 3 sesi kerja
```
