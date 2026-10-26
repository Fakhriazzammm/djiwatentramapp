# Djiwa Tentram App — Project Blueprint

> Dibaca setiap sesi oleh Zantara Agent sebelum eksekusi. Berisi semua konvensi project sehingga tidak perlu baca file.
>
> **Full audit files tersimpan di:**
> - `/tmp/schema-audit.md` (1575 lines) — tabel, view, RPC, index, RLS lengkap
> - `/tmp/edge-functions-audit.md` (532 lines) — semua Edge Functions detail
> - `/tmp/hooks-audit.md` (502 lines) — hooks, data flow, table mapping

---

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript
- **Routing:** TanStack Router (file-based, auto-generate routeTree.gen.ts)
- **Styling:** Tailwind CSS v4 + shadcn/ui + tw-animate-css
- **State/Data:** Supabase (PostgreSQL + Realtime + Edge Functions)
- **Animation:** framer-motion (AnimatePresence, motion.div)
- **Icons:** lucide-react
- **Notifications:** sonner (toast)
- **Font:** Plus Jakarta Sans (Google Fonts)
- **AI:** OpenAI (GPT-4o-mini chat, GPT-4o vision via Edge Function yumi-ai)
- **Bot:** Telegram Bot API (yumi-ai-bot service on localhost:8001)

---

## Project Root

```
/opt/djiwatentramapp/
├── apps/web/src/          # Main web app
│   ├── routes/            # TanStack Router file-based routes
│   ├── components/        # React components
│   │   ├── ui/            # shadcn base components
│   │   ├── pos/           # POS-specific (checkout, cart, menu, payment)
│   │   ├── admin/         # Admin-specific (recipe, bulk-ops)
│   │   ├── home/          # Home page sub-components
│   │   ├── auth/          # FaceRecognition
│   │   ├── attendance/    # Attendance components
│   │   └── customer/      # Customer ordering page
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utility functions
│   ├── types/             # TypeScript types
│   └── index.css          # Theme + custom utilities
├── supabase/
│   ├── functions/         # Edge Functions (Deno, 8 functions)
│   └── migrations/        # SQL migrations (80 files)
├── yumi-finance-agent/    # Finance AI agent (Python)
├── yumi-purchasing-agent/ # Purchasing AI agent (Python)
├── yumi-ai-bot/           # Telegram bot service (Python, internal HTTP)
└── packages/backend/      # Shared Supabase config
```

---

## Route Map (Complete)

### Public routes
| Route | File | Description |
|---|---|---|
| `/` | root redirect → `/home` | Root |
| `/login` | auto-generated | Login page |
| `/register` | `register.tsx` | Registration |
| `/register/selesai/:id` | auto | Registration complete |
| `/$brandSlug` | `$brandSlug.tsx` | Customer ordering page (brand-specific) |
| `/$brandSlug.minigames` | `$brandSlug.minigames.tsx` | Customer minigames |

### Authenticated routes
| Route | File | Description |
|---|---|---|
| `/home` | `home.lazy.tsx` | **Mobile-first home page** (superapp feed) |
| `/home/$section` | `home.$section.lazy.tsx` | Placeholder section |
| `/menu` | `menu.lazy.tsx` | **POS Cashier** (main transaction page) |
| `/attendance` | `attendance.index.lazy.tsx` | Attendance list |
| `/attendance/stock-opname` | `attendance/stock-opname.lazy.tsx` | Stock opname on clock-out |
| `/booking` | `booking.lazy.tsx` | Customer booking |
| `/karyawan/$username` | auto | Employee profile page |
| `/stock-overview` | auto | Stock overview |
| `/settings` | auto | User settings |

### Admin routes (under `/admin/*` layout)
| Route | File | Description |
|---|---|---|
| `/admin` | `route.tsx` + `index.lazy.tsx` | **Admin dashboard** + sidebar + bottom nav |
| `/admin/ai-chat` | `ai-chat.lazy.tsx` | AI Chat (Yumi AI) |
| `/admin/orders` | `orders.lazy.tsx` | Order management |
| `/admin/bar` | `bar.lazy.tsx` | Bar operations |
| `/admin/kitchen` | `kitchen.tsx` + lazy | Kitchen operations |
| `/admin/products` | `products.lazy.tsx` | Product management |
| `/admin/recipe` | `recipe.tsx` | Recipe management (index) |
| `/admin/recipe/view` | `recipe/view.lazy.tsx` | Recipe view |
| `/admin/recipe/hpp` | `recipe/hpp.lazy.tsx` | Recipe HPP calculator |
| `/admin/inventory` | `inventory.lazy.tsx` | Inventory management |
| `/admin/finance` | `finance/route.tsx` | Finance (index, transactions, accounting, reports, shift-reports) |
| `/admin/discounts` | `discounts.lazy.tsx` | Promotions |
| `/admin/booking` | `booking.lazy.tsx` | Booking admin |
| `/admin/customer-service` | `customer-service.lazy.tsx` | Customer service |
| `/admin/forecasting` | `forecasting.lazy.tsx` | Forecasting |
| `/admin/settings` | `settings.lazy.tsx` | Site settings |
| `/admin/stock-overview` | `stock-overview.lazy.tsx` | Stock overview |
| `/admin/onboarding` | `onboarding.lazy.tsx` | Employee onboarding |
| `/admin/minigames` | `minigames.tsx` | Minigames admin |
| `/admin/operational-team` | `operational-team/` | **Team management** (attendance, jadwal, payroll, karyawan, register, contract) |

---

## Database Entity Relationship Map

### Core Business Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  pos.categories ──1:N── pos.products ──1:N── pos.recipe_ingredients  │
│                                │                                  │   │
│                                │ 1:1 (optional)                   │   │
│                                ▼                                  ▼   │
│                     pos.recipes (ingredients JSONB)   pos.inventory   │
│                     pos.base_recipes (reusable)            ↑         │
│                                                            │ JSONB    │
│                           pos.recipes ──→ ingredients[]: {inventoryId, qty}
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  pos.orders ──1:N── pos.order_items ──→ pos.products (via product_id)   │
│      │                                                                   │
│      └──→ pos.financial_transactions (income: order creation)           │
│      └──→ pos.financial_transactions (expense: inventory deduction)     │
│      └──→ pos.daily_receipt_counter (auto-increment receipt #)          │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  pos.shifts ──→ pos.financial_transactions (modal awal, setoran akhir)  │
│     │                                                                     │
│     └──→ pos.stock_opname_logs (saat clock out per role)                 │
│     └──→ public.accounting_reconciliation_logs (saat shift close)        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  Employee Lifecycle:                                                      │
│  employee_onboarding_applications ──→ contract_approvals                  │
│       │                                                                   │
│       └──→ yumi_users (setelah approve) ──→ yumi_sessions                │
│       └──→ registration_counters (auto-increment NIP)                    │
│       └──→ pos.attendance_schedules (setelah approve)                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  Payroll System:                                                          │
│  pos.payroll_periods ──1:N── pos.payroll_runs ──1:N── pos.payroll_run_items
│       │                                                                   │
│       └──→ pos.payroll_role_rules (rate config per role)                 │
│       └──→ pos.payroll_user_overrides (per-user override)                │
│       └──→ pos.payslips (1:1 with payroll_run_items)                     │
│       └──→ pos.payroll_audit_logs (audit trail)                          │
│       └──→ pos.get_attendance_summary_for_period() (RPC, attendance)     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Relationships (Foreign Key)

| FK | Source Col | Target Table | Target Col |
|----|-----------|-------------|-----------|
| products → categories | category_source_id | pos.categories | source_id |
| recipes → products | product_source_id | pos.products | source_id |
| inventory → base_recipes | base_recipe_source_id | pos.base_recipes | source_id |
| order_items → orders | order_source_id | pos.orders | source_id |
| financial_transactions → orders | order_source_id | pos.orders | source_id |
| booking_order_items → booking_orders | booking_order_source_id | pos.booking_orders | source_id |
| stock_opname_logs → shifts | shift_source_id | pos.shifts | source_id |
| yumi_users → roles | role_source_id | public.yumi_roles | source_id |
| yumi_sessions → yumi_users | user_source_id | public.yumi_users | source_id (CASCADE) |
| attendance_schedules → yumi_users | user_id | public.yumi_users | source_id |
| contract_approvals → applications | application_id | public.employee_onboarding_applications | id (CASCADE) |
| payroll_runs → periods | payroll_period_id | pos.payroll_periods | id |
| payroll_run_items → runs | payroll_run_id | pos.payroll_runs | id (CASCADE) |
| payslips → run_items | payroll_run_item_id | pos.payroll_run_items | id (CASCADE) |
| accounting_entries → coa | coa_id | public.accounting_chart_of_accounts | id |

---

## Cross-Feature Sync Map (Data Flow Chains)

Setiap action di bawah memicu efek berantai ke beberapa tabel/sistem.

### Order → POS → Inventory → Finance

```
CREATE ORDER (menu.tsx)
  ├──→ INSERT pos.orders (status: 'paid' or 'pending')
  ├──→ INSERT pos.order_items (line items)
  ├──→ INSERT pos.financial_transactions (income, amount = total)
  ├──→ UPDATE pos.daily_receipt_counter (auto-increment, via RPC next_daily_receipt_no)
  └──→ INSERT pos.order_status (barista/kitchen, status: 'new')

UPDATE ORDER STATUS → 'completed'
  ├──→ UPDATE pos.orders (status='completed')
  ├──→ INSERT pos.financial_transactions (income, if not already)
  ├──→ UPDATE pos.inventory (auto-deduct ingredients via recipe)
  └──→ UPDATE pos.order_status (status='selesai')
```

### Shift → Finance → Accounting → Report

```
START SHIFT (POS buka shift)
  ├──→ INSERT pos.shifts (shift_name, cashier_name, start_time, starting_cash)
  └──→ INSERT pos.financial_transactions (expense "Modal Awal")

END SHIFT (POS tutup shift)
  ├──→ UPDATE pos.shifts (end_time, ending_cash, summary, cash_breakdown)
  ├──→ INSERT pos.financial_transactions (income "Setoran Akhir")
  ├──→ INSERT pos.financial_transactions (expense "Pengeluaran detail")
  ├──→ INSERT public.accounting_reconciliation_logs (selisih, status)
  ├──→ TRIGGER: fn_trg_auto_accounting_entries (double-entry accounting)
  └──→ Edge Function send-telegram-report → yumi-ai-bot (Telegram notification)

AUTO-CLOSE SHIFTS (cron / Edge Function auto-close-shifts)
  ├──→ SELECT pos_site_settings (shift schedules)
  ├──→ SELECT active shifts
  ├──→ UPDATE pos.shifts (auto-close data)
  └──→ INSERT pos.financial_transactions (recurring expenses)
```

### Employee Onboarding → Auth → Payroll

```
REGISTER KARYAWAN
  ├──→ INSERT employee_onboarding_applications (status: 'pending')

APPROVE KARYAWAN (onboarding-admin Edge Function)
  ├──→ INSERT yumi_users (generated PIN, slug)
  ├──→ INSERT yumi_roles? (if new role)
  ├──→ RPC next_registration_number (generate NIP)
  ├──→ Send Telegram notifications (welcome + approval)
  └──→ UPDATE employee_onboarding_applications (status: 'approved')

CLOCK IN / CLOCK OUT (attendance)
  ├──→ INSERT legacy_mirror.documents (table_name='attendance')
  ├──→ PIN verification + optional Face Recognition
  ├──→ Geofence validation
  └──→ [Clock Out] → wajib stock opname → INSERT stock_opname_logs

GENERATE PAYROLL (generate-payroll Edge Function)
  ├──→ AUTO DETECT period → INSERT pos.payroll_periods
  ├──→ INSERT pos.payroll_runs
  ├──→ RPC get_attendance_summary_for_period (attendance data)
  ├──→ INSERT pos.payroll_run_items (per-employee calculation)
  ├──→ INSERT pos.payslips
  └──→ Audit log ke pos.payroll_audit_logs
```

### Inventory → Recipe → HPP → Menu Stock

```
UPDATE INVENTORY PRICE (inline edit)
  ├──→ UPDATE pos.inventory (last_purchase_price, last_purchase_at)
  └──→ INSERT pos.inventory_transactions (reference price)

SYNC HPP WITH INVENTORY
  ├──→ SELECT pos.recipes (ingredients JSONB)
  ├──→ SELECT public.pos_inventory_latest_costs (latest prices)
  ├──→ Compute HPP per product
  └──→ UPSERT pos_hpp_calculations

ADJUST MENU STOCK
  ├──→ SELECT pos.recipes (ingredients)
  ├──→ SELECT pos.inventory (current stock)
  ├──→ UPDATE pos.products (quantity = computed available)
  └──→ UPDATE pos.inventory (deduct used ingredients)
```

### Customer Booking → Finance

```
CUSTOMER BOOKING (/$brandSlug)
  ├──→ INSERT pos.booking_orders
  ├──→ INSERT pos.booking_order_items
  └──→ INSERT pos.financial_transactions (if DP/payment)

BOOKING CONFIRMED / CANCELLED (admin)
  ├──→ UPDATE pos.booking_orders (booking_status)
  └──→ INSERT/UPDATE pos.financial_transactions
```

---

## Database Schema Compact

### 3 Database Schemas

| Schema | Tables | Purpose |
|--------|--------|---------|
| `pos` | 26 tables | Core business data (orders, inventory, shifts, recipes, payroll, booking) |
| `public` | 9 tables | Auth & shared (yumi_users, yumi_roles, onboarding, accounting) |
| `legacy_mirror` | 2 tables | Legacy bridge documents (attendance, minigames, HPP, CSI, conversation) |

### pos Schema Tables (26)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `categories` | source_id(PK), name, display_order, parent_source_id, track | Product categories with hierarchy |
| `products` | source_id(PK), category_source_id, name, price, promo_price, is_available, quantity, menu_number, variations, is_ala_carte | Menu items |
| `inventory` | source_id(PK), ingredient_name, unit, quantity, conversion_factor, last_purchase_price, content_to_base_factor, net_weight, category, pack_net_quantity/unit, image_path | Bahan baku stok |
| `inventory_transactions` | source_id(PK), inventory_source_id, quantity, tx_type, cost_per_unit, source_fingerprint, line_total | Stok masuk/keluar/penyesuaian |
| `inventory_stores` | source_id(PK), name, store_type, is_active | Supplier stores |
| `orders` | source_id(PK), order_number, total_amount, status, payment_method, source, brand_slug, daily_receipt_no, receipt_kind | Transaksi penjualan |
| `order_items` | id(PK), order_source_id(FK), line_no, product_source_id, product_name, quantity, price, hpp_snapshot | Line items per order |
| `financial_transactions` | source_id(PK), tx_type, amount, category, merchant, description, source_fingerprint(UNIQUE), order_source_id, booking_order_source_id | Semua transaksi keuangan |
| `shifts` | source_id(PK), shift_name, cashier_name, team_members, start_time, end_time, starting_cash, ending_cash_expected/physical, summary JSONB, cash_breakdown JSONB | Shift buka/tutup kasir |
| `financial_targets` | source_id(PK), month(UNIQUE), target_revenue, target_profit | Target bulanan |
| `discounts` | source_id(PK), name, code, discount_type, value, is_active, start/end_date, is_happy_hour | Promo/diskon |
| `recipes` | source_id(PK), product_source_id(FK), variant_name, ingredients JSONB, steps JSONB | Resep per produk |
| `base_recipes` | source_id(PK), name, target_unit, target_quantity, ingredients JSONB, steps JSONB | Resep reusable (bahan baku) |
| `stock_opname_logs` | source_id(PK), shift_source_id(FK), staff_name, role(bar/kitchen), items JSONB, is_final | Stock opname pas clock out |
| `booking_settings` | source_id(PK), slug, title, description, theme_color, is_active | Setting booking per brand |
| `booking_orders` | source_id(PK), slug, booking_code, customer_name/phone/email, booking_date, total_amount, payment_status, booking_status | Pesanan booking |
| `booking_order_items` | id(PK), booking_order_source_id(FK), product_source_id, product_name, price, quantity | Item booking |
| `booking_date_capacity` | source_id(PK), slug, booking_date, max_people, max_tables | Kapasitas per tanggal |
| `attendance_schedules` | source_id(PK), user_id(FK yumi_users), date, shift_name, start/end_time, status | Jadwal shift karyawan |
| `attendance_import_aliases` | source_id(PK), raw_name, user_id(FK), role_hint, is_placeholder | Mapping nama absen ke user |
| `daily_receipt_counter` | date(PK), order_kind(PK), last_no | Counter nomor receipt |
| `order_status` | id(PK), order_no, group_type(barista/kitchen), status(new/dibuat/selesai), items JSONB | Status order realtime (bar/kitchen display) |
| `payroll_periods` | id(PK), period_name, start_date, end_date, status(draft/open/processing/closed) | Periode penggajian |
| `payroll_role_rules` | id(PK), source_role_id, role_name, base_hourly/shift_rate, monthly_salary, daily_allowance, overtime_rate | Rate gaji per role |
| `payroll_user_overrides` | id(PK), user_id, payroll_period_id(FK), base_hourly_rate, notes | Override rate per user |
| `payroll_runs` | id(PK), payroll_period_id(FK), status(pending/processing/completed), total_gross/net_pay | Run penggajian |
| `payroll_run_items` | id(PK), payroll_run_id(FK CASCADE), user_id, total_hours, shift_pay, hourly_pay, gross/net_pay | Hitungan per karyawan |
| `payslips` | id(PK), payroll_run_item_id(FK CASCADE, UNIQUE), user_id, gross/net_pay, breakdown JSONB, status | Slip gaji |
| `payroll_audit_logs` | id(PK), action, entity_type/entity_id, old/new_values JSONB | Audit trail payroll |
| `merchant_profiles` | id(PK), merchant_name, typical_categories JSONB, typical_items JSONB | AI merchant profiling |
| `price_history` | id(PK), item_name, merchant_name, price, quantity, unit | AI price history |
| `item_category_memory` | id(PK), item_name, category_key, confidence | AI category learning |
| `category_feedback_log` | id(PK), item_name, original/corrected_category | AI feedback |
| `suppliers` | id(PK), name, category, grade | Supplier database |
| `site_settings` | source_id(PK), store_name, tax_rate, service_charge_rate, raw JSONB | Konfigurasi toko |
| `migration_runs` | id(PK), source, upserted_count, failed_count | Log migrasi data |
| `transaction_analytics` | (created outside migration) | Analytics (RLS added later) |

### public Schema Tables (9)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `yumi_roles` | source_id(PK), name, permissions JSONB | Role dan permission |
| `yumi_users` | source_id(PK), username, name, home_pin_hash, home_pin_fingerprint(UNIQUE), role_source_id(FK), is_active, auth_user_id(UNIQUE), slug(UNIQUE), employee_nip(UNIQUE), email, photo_url | Karyawan + auth |
| `yumi_sessions` | id(PK), token(UNIQUE), user_source_id(FK CASCADE), expires_at | Session login |
| `employee_onboarding_applications` | id(PK), full_name, phone, email, status(pending/approved/rejected), employment JSONB, contract JSONB, signature_url, contract_pdf_url, registration_number, employee_nip, photo_url, cv_url | Pendaftaran karyawan |
| `contract_approvals` | id(PK), application_id(FK CASCADE), stage(admin/manager/employee), status(pending/approved/rejected) | Approval kontrak |
| `registration_counters` | category(PK), prefix, counter | Auto-increment NIP |
| `accounting_chart_of_accounts` | id(PK), code(UNIQUE), name, type(asset/liability/equity/revenue/expense), normal_balance(debit/kredit), parent_id(FK) | COA untuk akuntansi |
| `accounting_entries` | id(PK), transaction_source_id, coa_id(FK), entry_type(debit/kredit), amount | Jurnal akuntansi (double-entry) |
| `accounting_item_embeddings` | id(PK), item_name, coa_id(FK), embedding_json | AI COA mapping |
| `accounting_reconciliation_logs` | id(PK), shift_source_id, total_debit/kredit, selisih, cash_system/physical/selisih, status(balanced/unbalanced) | Rekonsiliasi shift |
| `pos_purchase_logs` | id(PK), inventory_id, ingredient_name, quantity_added, unit_price, total_cost, merchant, ocr_raw_text | Log pembelian (OCR) |

### legacy_mirror Schema (2 tables)

| Table | Purpose | Used For |
|-------|---------|----------|
| `documents` (PK: table_name+document_id) | Generic document store | attendance, minigames, HPP, variationPresets, conversationMemory, followUpTasks, customerService |
| `import_runs` | Log import runs | Data import history |

---

## Public Views (30+ views, all in `public` schema)

Views map snake_case columns to camelCase for frontend consumption.

| View | Source Table(s) | Key camelCase Columns |
|------|----------------|----------------------|
| `pos_site_settings` | pos.site_settings | _id, raw |
| `pos_categories` | pos.categories | _id, name, displayOrder, parentId, track |
| `pos_products` | pos.products (is_available=true) | _id, categoryId, name, price, promoPrice, isAvailable, quantity, menuNumber, variations |
| `pos_products_all` | pos.products (all rows) | Same + isAlaCarte |
| `pos_inventory` | pos.inventory | _id, ingredientName, unit, quantity, lowStockThreshold, displayUnit, conversionFactor, lastPurchasePrice, contentToBaseFactor, netWeight, category, packNetQuantity/Unit, imagePath |
| `pos_orders` | pos.orders + order_items | _id, orderNumber, totalAmount, status, paymentMethod, items(JSONB agg) |
| `pos_financial_transactions` | pos.financial_transactions | _id, type, amount, category, merchant, description, date, paymentMethod, orderId, bookingOrderId, sourceFingerprint |
| `pos_shift_reports` | shifts + orders + financial_transactions | Shift reports with order counts, income, target |
| `pos_shifts` | pos.shifts | _id, shiftName, cashierName, teamMembers, startTime, endTime, startingCash, summary, cashBreakdown |
| `pos_current_month_progress` | financial_transactions + targets | Month income/expense/net vs targets |
| `pos_inventory_latest_costs` | pos.inventory (computed) | inventoryId, ingredientName, latestCostPerUnit, avgCostPerUnit |
| `pos_staff_users` | yumi_users + yumi_roles | _id, name, roleId, roleName, slug, isActive |
| `pos_users_public` | yumi_users + yumi_roles | _id, name, slug, isActive, hasFace, roleName, photoUrl |
| `pos_attendance_logs` | legacy_mirror.documents (table='attendance') | _id, userId, type, timestamp, photoUrl, location |
| `pos_booking_settings` | pos.booking_settings | _id, slug, title, description, logoUrl, themeColor, isActive |
| `pos_hpp_calculations` | legacy_mirror.documents (table='hppCalculations') | _id, productId, name, sellingPrice, ingredients, overheadCosts |
| `pos_payroll_*` (9 views) | pos.payroll_* tables | Periods, runs, items, payslips, audit logs, role rules, overrides |

---

## Integration Registry

### Edge Functions (8 total, Deno runtime)

| Function | Lines | Auth | Tables Accessed | External Calls | Key Actions |
|----------|-------|------|----------------|----------------|-------------|
| **yumi-auth** | 405 | Open (action-based) | yumi_users, yumi_sessions, yumi_roles | Supabase Auth Admin API | loginWithPin, validateSession, logoutSession, backfillAuthUsers, createAuthUser, updateEmail |
| **yumi-ai** | 927 | Open (action-based) | financial_transactions, inventory, accounting, onboarding_apps | OpenAI API, Telegram Bot API | yumiChat, bulkScanImageData, generateBusinessBriefing, recordTransaction, classifyTransactionItems, executeSql, parseAttendanceSchedule |
| **auto-close-shifts** | 331 | x-cron-secret (optional) | site_settings, shifts, orders, financial_transactions | None | Auto-close overdue shifts, process recurring expenses |
| **send-telegram-report** | 84 | Open | None (proxy) | Internal yumi-ai-bot (localhost:8001) | Forward report to Telegram bot |
| **record-financial-transaction** | 166 | Open | financial_transactions | None | Insert with dedup (fingerprint + 2min window) |
| **onboarding-admin** | 662 | x-admin-secret | employee_onboarding_applications, yumi_users | Telegram Bot API, Supabase REST API | list, approve, reject, sign_contract, delete; PIN collision retry (3x) |
| **generate-payroll** | 441 | Open | payroll_*, attendance_*, staff_users | Supabase Management API | auto_detect period, generate payroll, generate payslips, approve run |
| **delete-employee-cascade** | 181 | x-admin-secret | employee_onboarding_applications, yumi_users, users_public | None | Cascade delete employee + user + application |

### Shared Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | 7/8 functions | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 7/8 functions | Service role key (bypass RLS) |
| `TELEGRAM_BOT_TOKEN` | yumi-ai, onboarding-admin | Telegram bot token (typo fallback: TELELEGRAM_BOT_TOKEN) |
| `TELEGRAM_REPORT_CHAT_ID` | yumi-ai, onboarding-admin | Default chat ID (typo fallbacks: TELEGRAM_CHAT_ID, TELELEGRAM_CHAT_ID) |
| `ONBOARDING_ADMIN_SECRET` | onboarding-admin, delete-employee-cascade | Admin secret header |
| `OPENAI_API_KEY` | yumi-ai | OpenAI API key |
| `VITE_APP_BASE_URL` | onboarding-admin | App URL (default: https://pos.djiwatentram.web.id) |
| `CRON_SECRET` | auto-close-shifts | Optional cron auth |
| `MGMT_ACCESS_TOKEN` | generate-payroll | Supabase Management API token |

### External Integrations

| Integration | Type | Functions | Purpose |
|-------------|------|-----------|---------|
| **OpenAI API** | REST | yumi-ai | Chat, receipt scanning, business briefing |
| **Telegram Bot API** | REST | yumi-ai, onboarding-admin | Send messages, notifications (2 calls per approval) |
| **Supabase Auth Admin API** | SDK | yumi-auth | Create user, update email, create session |
| **Supabase Management API** | REST | generate-payroll | Raw SQL execution (`/database/query`) |
| **Supabase REST API** | REST | onboarding-admin | yumi_users CRUD, RPC calls |
| **Internal yumi-ai-bot** | HTTP (localhost:8001) | send-telegram-report | Forward report messages |

### Other Background Processes

| Process | Mechanism | Purpose |
|---------|-----------|---------|
| **yumi-ai-bot** | Python service (localhost:8001) | Telegram bot listening + HTTP endpoint |
| **yumi-finance-agent** | Python cron | Finance AI analysis |
| **yumi-purchasing-agent** | Python cron | Purchasing AI agent |
| **git-smart-push.sh** | cron (every 10 min) | Auto-git push |
| **auto-close-shifts** | Supabase cron → Edge Function | Auto-close shifts at end of day |

---

## Business Rules Repository

### Inventory
- **Auto-deduct:** Stok berkurang saat order status = 'completed' (via recipe ingredients → inventory deduction)
- **Conversion:** Harga/Unit dihitung dari `lastPurchasePrice / contentToBaseFactor` (bukan `conversionFactor`)
- **Unit:** `contentToBaseFactor` untuk konversi purchase unit → base unit. `conversionFactor` untuk display unit
- **Stock opname:** Wajib saat clock out untuk role 'bar' dan 'kitchen'
- **Low stock alert:** Jika quantity <= lowStockThreshold (script low-stock-alert.py)
- **Inline edit - 5-layer sync:** Setiap field baru di `pos.inventory` perlu sync di: View → Read Hook → Write Hook → State Type → State Init (lihat checklist di bawah)

### POS / Orders
- **Receipt numbering:** Auto-increment per hari + per order_kind (dine_in/takeaway/online) via RPC `next_daily_receipt_no`
- **Financial transaction dedup:** Via source_fingerprint (SHA256) UNIQUE constraint + 2-min window dedup di Edge Function `record-financial-transaction`
- **Order status flow:** POS baru → `pos.order_status` with group_type (barista/kitchen), status sequence: new → dibuat → selesai
- **HPP snapshot:** Setiap order item menyimpan `hpp_snapshot` (JSONB) saat order dibuat — untuk laporan COGS akurat

### Finance & Accounting
- **Trigger-based accounting:** Setiap INSERT ke `pos.financial_transactions` auto-create double-entry accounting entries via trigger `fn_trg_auto_accounting_entries`
- **COA mapping:** `fn_map_expense_coa` via regex, `fn_map_cash_coa` via payment method (QRIS→1-1100, else→1-1000)
- **Double-entry:** Setiap transaksi menghasilkan 2 entries di `accounting_entries` (debit + kredit)
- **Shift reconciliation:** Saat tutup shift, dibuat `accounting_reconciliation_logs` dengan selisih kas sistem vs fisik

### Attendance & Payroll
- **Clock in/out:** Writes to `legacy_mirror.documents` (table_name='attendance') — NOT to `pos.attendance_logs` view (read-only!)
- **Identity:** PIN verification via SHA-256 fingerprint (`yumi_users.home_pin_fingerprint`), optional Face Recognition (euclidean distance ≤ 0.6)
- **Attendance schedules:** Unique per (user_id, date, shift_name), status: scheduled/confirmed/completed/absent/cancelled/off
- **Payroll auto-detect:** Edge Function `generate-payroll` auto-detects period (2 mingguan) jika belum ada, create jika missing
- **Payroll rates:** `payroll_role_rules` per role, `payroll_user_overrides` per user per period

### Auth & Users
- **Dual auth system:** Custom session (`yumi_sessions`) + Supabase Auth session (`admin.createSession`)
- **PIN collision retry:** Saat approve onboarding, jika PIN fingerprint collision → retry up to 3x dengan PIN random baru
- **Login fallback chain:** Custom token → Supabase Auth session → Edge Function validateSession
- **NIP generation:** Auto-increment via `registration_counters` table + RPC `next_registration_number`
- **Cascade deactivation:** Trigger `deactivate_yumi_user` — saat is_active = false → delete sessions + deactivate Supabase Auth user

### Caching & Refresh
- **Realtime:** Semua data hook subscribe ke ALL changes di schema `public` + `pos` (not table-specific)
- **Polling:** Fallback 30s polling via `useSupabaseLiveValue()`, shift reports: 10s polling
- **Global refresh:** `triggerHybridRefresh()` — increment counter yang di-watch semua live value hooks
- **Refresh trigger:** Setiap write action punya `refreshTrigger` parameter untuk force re-fetch komponen tertentu

---

## Inventory Inline Editing (Critical Pattern)

### 5-layer sync untuk setiap field baru di `pos.inventory`

| Layer | File | Fungsi/Posisi |
|-------|------|---------------|
| 1. **Database View** | `supabase/migrations/*.sql` | View `public.pos_inventory` → pilih kolom dari `pos.inventory` |
| 2. **Read Hook** | `use-hybrid-pos-data.ts` | `fetchInventory()` → mapping snake_case → camelCase |
| 3. **Write Hook** | `use-hybrid-write-actions.ts` | `useHybridUpdateInventoryItem()` → `if (args?.field) updates.field_db = value` |
| 4. **Inline State Type** | `inventory.lazy.tsx` | `useState<Record<string, { field: string }>>({})` → tipe inlineValues |
| 5. **Inline State Init** | `inventory.lazy.tsx` | `getInlineValue()` + `setInlineField()` initialization |

### Checklist field baru:
- [ ] View: `ALTER VIEW public.pos_inventory ... select col_name as "camelCase"`
- [ ] fetchInventory: `field: row.camelCase ?? row.snake_case ?? default`
- [ ] useHybridUpdateInventoryItem: `if (args?.field !== undefined) updates.field_db = value`
- [ ] inlineValues type: tambah `field: string` ke Record type
- [ ] getInlineValue default: tambah default value dari row
- [ ] setInlineField init: tambah di initialization object (sama dengan getInlineValue)
- [ ] saveMeta no-change check: tambah perbandingan di if-condition
- [ ] saveMeta updateItemMutation: tambah field ke parameter call
- [ ] Table cell: tambah `<input>` atau kontrol di rendering

### Field yang sudah sync ✅ (20 field):
ingredientName, unit, quantity, lowStockThreshold, displayUnit, conversionFactor, unitConversions, baseRecipeId, defaultBrandName, preferredStoreId, preferredPurchaseQuantity, preferredPurchaseUnit, lastPurchasePrice, lastPurchaseAt, lastPurchaseStoreId, netWeight, category, imagePath, packNetQuantity, packNetUnit, contentToBaseFactor

### Field TABLE yang MISSING dari VIEW ❌:
`aliases` (jsonb), `creation_time` (double precision) — ada di `pos.inventory` table tapi tidak di `public.pos_inventory` view

### Save flow:
- **saveMeta()** → `useHybridUpdateInventoryItem` → UPDATE `pos.inventory` (semua field meta)
- **saveQuantity()** → `useHybridApplyInventoryStockAction` → UPDATE + INSERT transaction (stok)
- **saveReferencePrice()** → `useHybridSetInventoryReferencePrice` → INSERT transaction + UPDATE harga

---

## Cross-Page Data Flow

| Page / Route | Data Source (Views) | Write Target (pos schema) | Integrates With |
|-------------|-------------------|--------------------------|-----------------|
| `/menu` (POS Cashier) | pos_products, pos_categories, pos_inventory, pos_active_discounts | orders, order_items, financial_transactions, order_status | Kitchen/Bar display |
| `/admin/inventory` | pos_inventory, pos_inventory_latest_costs | pos.inventory, pos.inventory_transactions | HPP, Recipe, Products |
| `/admin/products` | pos_products_all, pos_categories, pos_hpp_calculations | pos.products, pos.categories | Recipe, Inventory |
| `/admin/recipe` | pos_recipes, pos_products_all, pos_inventory | pos.recipes, pos.base_recipes | HPP, Inventory, Products |
| `/admin/recipe/hpp` | pos_hpp_calculations, pos_inventory_latest_costs, pos_recipes, pos_products_all | pos_hpp_calculations | Inventory costs |
| `/admin/finance/*` | pos_financial_transactions, pos_orders, pos_shift_reports, accounting_* | pos.financial_transactions, accounting_entries | Accounting, Shift reports |
| `/admin/orders` | pos_orders, pos_shift_reports | pos.orders, pos.financial_transactions | Kitchen/Bar, Finance |
| `/admin/kitchen` | pos_order_status, pos_categories | pos.order_status (via write-actions) | POS Cashier |
| `/admin/bar` | pos_order_status, pos_categories | pos.order_status (via write-actions) | POS Cashier |
| `/admin/operational-team/*` | pos_staff_users, pos_users_public, pos_attendance_schedules, payroll views | pos.shifts, legacy_mirror.documents, pos.payroll_* | Attendance, Payroll, Onboarding |
| `/admin/onboarding` | employee_onboarding_applications, contract_approvals | Edge Function: onboarding-admin | Telegram, Auth, Payroll |
| `/home` | pos_orders, pos_shifts, pos_financial_transactions, pos_current_month_progress, pos_products_all | N/A (read-only) | All modules aggregate |
| `/$brandSlug` (Customer) | pos_products, pos_categories, pos_booking_settings | pos.booking_orders, pos.financial_transactions | Booking, Payment |

---

## Data Refresh Mechanism

| Layer | Mechanism | Interval |
|-------|-----------|----------|
| **Realtime Subscription** | `useSupabaseLiveValue()` subscribes to ALL changes on `public` + `pos` schemas | Push-based |
| **Polling Fallback** | Same hook polls as backup | 30s (shift reports: 10s) |
| **Global Refresh** | `triggerHybridRefresh()` increments counter → all live hooks re-fetch | Manual |
| **Per-Hook Refresh** | Each hook accepts `refreshTrigger` prop | Component-controlled |

Dead code note: `backend-bridge.ts` is a stub that rejects with "Legacy fallback is disabled."

---

## Hooks Reference

### Data hooks (return data | null | undefined)
| Hook | Source | Returns |
|---|---|---|
| `useHybridShiftReportRows()` | `use-hybrid-pos-data.ts` | Shift rows array |
| `useHybridShiftDetails()` | `use-hybrid-pos-data.ts` | Shift detail object |
| `useHybridSiteSettings()` | `use-hybrid-pos-data.ts` | Site settings |
| `useHybridCurrentMonthProgress()` | `use-hybrid-pos-data.ts` | Month progress (target) |
| `useHybridOrders()` | `use-hybrid-pos-data.ts` | Orders list |
| `useHybridShiftStatus()` | `use-hybrid-pos-data.ts` | Shift status |
| `useHybridStaffStatsToday(userId)` | `use-hybrid-attendance-data.ts` | Today stats |
| `useHybridTrackOrders(area)` | `use-hybrid-ops-data.ts` | Live order tracking |
| `useHybridOrderStatus(area)` | `use-hybrid-ops-data.ts` | Order status list |
| `useHybridBookingOrders()` | `use-hybrid-booking-data.ts` | Booking orders |
| `useHybridFinanceAnalytics(period)` | `use-hybrid-finance-analytics-data.ts` | Finance analytics |
| `useHybridInventory()` | `use-hybrid-pos-data.ts` | Inventory items |
| `useHybridAllProducts()` | `use-hybrid-pos-data.ts` | All products |
| `useHybridDashboardStats()` | `use-hybrid-pos-data.ts` | Composite 7-table stats |
| `useHybridAllTransactions()` | `use-hybrid-finance-analytics-data.ts` | Financial transactions |
| `useHybridProfitLossReport()` | `use-hybrid-finance-analytics-data.ts` | P&L report with net margin |
| `useHybridCashFlowReport()` | `use-hybrid-finance-analytics-data.ts` | Cash flow by payment method |
| `useHybridPredictStockOut(days)` | `use-hybrid-finance-analytics-data.ts` | Predicted stock-out risks |

### Write hooks (return mutate function)
| Hook | Source | Action |
|---|---|---|
| `useHybridClockIn()` | `use-hybrid-write-actions.ts` | Clock in |
| `useHybridClockOut()` | `use-hybrid-write-actions.ts` | Clock out |
| `useHybridCreateOrder()` | `use-hybrid-write-actions.ts` | Create order |
| `useHybridUpdateOrderStatus()` | `use-hybrid-write-actions.ts` | Update status |
| `useHybridUpdateInventoryItem()` | `use-hybrid-write-actions.ts` | Update inventory field |
| `useHybridApplyInventoryStockAction()` | `use-hybrid-write-actions.ts` | Adjust stock quantity |
| `useHybridSetInventoryReferencePrice()` | `use-hybrid-write-actions.ts` | Set reference price |
| `useHybridSyncHppWithInventoryPrices()` | `use-hybrid-write-actions.ts` | Sync HPP from inventory |
| `useHybridCreateTransaction()` | `use-hybrid-write-actions.ts` | Create financial tx (via EF) |
| `useHybridStartShift()` | `use-hybrid-write-actions.ts` | Start shift |
| `useHybridEndShift()` | `use-hybrid-write-actions.ts` | End shift |

### Auth hooks
| Hook | Source | Returns |
|---|---|---|
| `useYumiAuth()` | `useYumiAuth.ts` | `{ user, role: userRole, logout, isAdmin, isAuthenticated, isLoading, isStaff }` |

### Utility hooks
| Hook | Source | Description |
|---|---|---|
| `useSupabaseLiveValue(query)` | `use-supabase-live-value.ts` | Live query with auto-refresh |
| `triggerHybridRefresh()` | `use-hybrid-pos-data.ts` | Force refresh all hybrid data |
| `useGlobalKeyboardNavigation()` | `useGlobalKeyboardNavigation.ts` | Global keyboard shortcuts |

**Guard pattern:** Always use `data == null` (catches both null and undefined). Never assume data shape without guard.

---

## Lib Functions

| File | Key exports |
|---|---|
| `export-utils.ts` | `formatCurrencyIDR(value)` |
| `client.ts` | `supabase` client instance (createBrowserClient) |
| `auth-client.ts` | `authClient` for auth operations |
| `telegram-report.ts` | `sendTelegramReport(text)` |
| `backend-bridge.ts` | **Dead code** — all stubs reject |
| `inventory-units.ts` | Unit conversion utilities |
| `attendance-utils.ts` | Attendance helpers |
| `id-utils.ts` | ID generation |
| `pricing.ts` | Price calculation utilities |

---

## Styling Conventions

### CSS custom classes (from `index.css`)
```
.app-page           — Page background (subtle blue radial gradient)
.app-card           — Card container (rounded-panel, soft shadow)
.app-card-strong    — Elevated card (stronger shadow)
.app-bottom-bar     — Fixed bottom bar (glass, blur)
.app-shell          — Shell container
.app-pill           — Pill border-radius
.app-overline       — Section title (11px, 800 weight, uppercase)
.app-section-title  — Large section heading
.glass              — Glass effect (blur 8px)
.glass-strong       — Strong glass (blur 16px)
.safe-area-bottom   — Safe area padding for notched phones
.pb-safe-with-nav   — Padding bottom + 80px for nav offset
.min-h-app          — min-height: var(--app-min-height)
```

### Tailwind tokens
- `--primary: #1a5dc6` / `oklch(0.5 0.18 240)`
- `--radius-panel: 1.5rem`
- `--border: oklch(0.92 0.01 250)`
- `--background: #fefefe`
- `--card: #fafafa`
- `--muted: #f0f1f4`
- `--muted-foreground: #7c8290`

### Text size convention (compact UI)
- `text-[8px]` — micro labels
- `text-[9px]` — badge/pill, uppercase tracking
- `text-[10px]` — subtitles, secondary info
- `text-[11px]` — body small
- `text-[12px]` — body
- `text-[13px]` — labels
- `text-sm` (14px) — normal body
- `text-base` (16px) — headings
- `font-black` (900) / `font-bold` (700) most common weights

### Badge/Pill pattern
```tsx
<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-primary">
  {label}
</span>
```

### Status dot pattern
```tsx
<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
```

### Grid patterns
- Quick actions: `grid grid-cols-2 gap-3`
- Service grid: `grid grid-cols-2 gap-3`
- Stats row: `grid grid-cols-3 divide-x divide-border/40`
- Bottom nav: `flex items-stretch px-2`

---

## Supabase Edge Functions

| Function | Lines | verify_jwt | Auth | Tables Written | External |
|----------|-------|-----------|------|---------------|----------|
| `yumi-auth` | 405 | false | Open | yumi_sessions, yumi_users | Supabase Auth Admin |
| `yumi-ai` | 927 | false | Open | financial_transactions, inventory, accounting | OpenAI, Telegram |
| `auto-close-shifts` | 331 | false | x-cron-secret | pos.shifts, financial_transactions | None |
| `send-telegram-report` | 84 | false | Open | None (proxy) | Internal bot |
| `record-financial-transaction` | 166 | false | Open | financial_transactions (dedup) | None |
| `onboarding-admin` | 662 | false | x-admin-secret | onboarding_apps, yumi_users | Telegram, Supabase REST |
| `generate-payroll` | 441 | false | Open | payroll_*, payslips | Supabase Management API |
| `delete-employee-cascade` | 181 | false | x-admin-secret | yumi_users, onboarding_apps | None |

**Deploy command (self-hosted di VPS ini):**
```bash
cp supabase/functions/<name>/index.ts /opt/supabase-selfhost/volumes/functions/<name>/index.ts
cd /opt/supabase-selfhost && docker compose up -d functions
```

---

## Authentication Flow

1. `/login` → PIN entry → calls Edge Function `yumi-auth` (action: `loginWithPin`)
2. Edge Function creates:
   - Custom session in `yumi_sessions` table
   - Supabase Auth session via `admin.createSession()` (if user has `auth_user_id`)
3. Returns `{ token, user, supabaseSession? }` → frontend sets supabase auth via `auth.setSession()`
4. Root layout (`__root.tsx`) checks `isAuthenticated` via `useYumiAuth()`:
   - Has token? → validate locally (base64 JSON, 24h expiry) OR via Supabase Auth `getSession()` + RPC `get_yumi_user_claims` OR via Edge Function `validateSession`
   - No token? → try `recoverFromSupabaseSession()` → RPC `get_yumi_user_claims`
5. Unauthenticated → redirect to `/login`
6. Admin guard → check `isAdmin` or specific permissions (keys: `products:manage`, `orders:manage`, `inventory:manage`, `finance:view`, etc.)

---

## Admin Layout Notes

- `/admin/route.tsx` contains: sidebar, mobile bottom nav (BOTTOM_NAV_ITEMS), operational bottom nav, quick menu sheet, logout
- Bottom nav has 5 items: Dashboard, Menu, AI (FAB center), Orders, Lainnya (quick menu)
- Admin pages wrapped in `<AdminGuard>` requiring specific permissions

---

## Component Conventions

### Import aliases
- `@/` → `apps/web/src/`
- `@/components/ui/button` → shadcn Button
- `@/hooks/use-*` → hooks
- `@/lib/*` → utilities

### Export pattern
- Use **named exports** (`export function ComponentName`)
- Also provide default export for lazy-loaded components

### Tab indentation
- All `.tsx`/`.ts` files use **tab indentation**
- **NEVER use `patch` tool** for multi-line replacements in tab-indented files
- Use `execute_code` with Python for tab-indented file edits

---

## Common Pitfalls (⚠️ Wajib Dibaca)

1. **patch tool tab corruption:** `patch` tool corrupts tab characters in multi-line replacements. Use `execute_code` with Python instead.
2. **in() URL overflow:** Supabase `.in()` filter exceeds PostgREST URL limit (~4000 chars) with 900+ IDs. Batch in groups of 50.
3. **Mixed case DB columns:** PostgREST returns snake_case. Guard with: `row.camelCase ?? row.snake_case`
4. **Selective git add:** Jangan `git add -A` — bisa membawa perubahan dari sesi lain. Use `git diff --name-only HEAD` first.
5. **useSupabaseLiveValue returns null on error:** Always guard with `data == null`.
6. **Background procs don't inherit env:** Set env explicitly in command.
7. **Stale LSP warnings after patch:** Re-read the file to confirm actual state.
8. **ROLE_SECTIONS removal:** If removing admin role sections, check `fromHomeEntry` state routing.
9. **Dual schema write:** Write ke `pos.*` tables (snake_case), read dari `public.pos_*` views (camelCase). Jangan tertukar.
10. **Attendance writes go to legacy_mirror.documents** — NOT to `pos.attendance_logs` view (read-only!)
11. **Financial dedup:** Via `record-financial-transaction` Edge Function — jangan INSERT langsung ke `pos.financial_transactions` dari frontend.
12. **Refresh cascade:** `triggerHybridRefresh()` forces ALL hooks to re-fetch — jangan panggil terlalu sering.
13. **Cross-session data:** Saat ambil data dari `pos.shifts` via view, guard camelCase fallback: `row.camelCase ?? row.snake_case`
