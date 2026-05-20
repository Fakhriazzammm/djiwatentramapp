# Djiwa Tentram App — Project Blueprint

> Dibaca setiap sesi oleh Zantara Agent sebelum eksekusi. Berisi semua konvensi project sehingga tidak perlu baca file.

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript
- **Routing:** TanStack Router (file-based, auto-generate routeTree.gen.ts)
- **Styling:** Tailwind CSS v4 + shadcn/ui + tw-animate-css
- **State/Data:** Supabase (PostgreSQL + Realtime + Edge Functions)
- **Animation:** framer-motion (AnimatePresence, motion.div)
- **Icons:** lucide-react
- **Notifications:** sonner (toast)
- **Font:** Plus Jakarta Sans (Google Fonts)

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
│   ├── functions/         # Edge Functions (Deno)
│   └── migrations/        # SQL migrations
├── yumi-finance-agent/    # Finance AI agent
├── yumi-purchasing-agent/ # Purchasing AI agent
└── packages/backend/      # Shared Supabase config
```

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

## Inventory Inline Editing (Critical Pattern)

### 5-layer sync untuk setiap field baru di `pos.inventory`

Saat menambah kolom baru ke tabel inventory, WAJIB sync di **5 tempat** ini:

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
| `useHybridStaffStatsToday(userId)` | `use-hybrid-attendance-data.ts` | Today stats (isWorking, totalHours, totalMinutes) |
| `useHybridTrackOrders(area)` | `use-hybrid-ops-data.ts` | Live order tracking |
| `useHybridOrderStatus(area)` | `use-hybrid-ops-data.ts` | Order status list |
| `useHybridBookingOrders()` | `use-hybrid-booking-data.ts` | Booking orders |
| `useHybridFinanceAnalytics(period)` | `use-hybrid-finance-analytics-data.ts` | Finance analytics |

### Write hooks (return mutate function)
| Hook | Source | Action |
|---|---|---|
| `useHybridClockIn()` | `use-hybrid-write-actions.ts` | Clock in |
| `useHybridClockOut()` | `use-hybrid-write-actions.ts` | Clock out |
| `useHybridCreateOrder()` | `use-hybrid-write-actions.ts` | Create order |
| `useHybridUpdateOrderStatus()` | `use-hybrid-write-actions.ts` | Update status |

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

## Lib Functions

| File | Key exports |
|---|---|
| `export-utils.ts` | `formatCurrencyIDR(value)` |
| `client.ts` | `supabase` client instance |
| `auth-client.ts` | `authClient` for auth operations |
| `telegram-report.ts` | `sendTelegramReport(text)` |
| `backend-bridge.ts` | Backend compatibility bridge |
| `inventory-units.ts` | Unit conversion utilities |
| `attendance-utils.ts` | Attendance helpers |
| `id-utils.ts` | ID generation |
| `pricing.ts` | Price calculation utilities |

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

### Gradient icon container
```tsx
<div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-{color}-500 to-{color}-400 text-white shadow-sm">
  <Icon className="h-4 w-4" />
</div>
```

### Card button/link
```tsx
<div className="rounded-xl border border-border/70 bg-background p-3 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]">
```

### Section title
```tsx
<h2 className="app-overline">Section Name</h2>
```

### Grid patterns
- Quick actions: `grid grid-cols-2 gap-3`
- Service grid: `grid grid-cols-2 gap-3`
- Stats row: `grid grid-cols-3 divide-x divide-border/40`
- Bottom nav: `flex items-stretch px-2`

## Supabase Edge Functions (8 total)

| Function | No Verify JWT? | Purpose |
|---|---|---|
| `yumi-auth` | Yes (public) | Registration, login, PIN management |
| `yumi-ai` | Yes (public) | AI assistant queries |
| `auto-close-shifts` | Yes | Auto-close shifts at end of day |
| `send-telegram-report` | Yes | Send shift report to Telegram |
| `record-financial-transaction` | No (internal) | Record financial transactions |
| `onboarding-admin` | Yes | Employee registration workflow |
| `generate-payroll` | No (internal) | Generate payroll slips |
| `delete-employee-cascade` | No (internal) | Cascade delete employee data |

**Deploy command (for each function):**
```bash
SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase functions deploy --no-verify-jwt <name> --project-ref xaemykhjpkgypqqpfdcb
```

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

## Common Pitfalls (⚠️ Wajib Dibaca)

1. **patch tool tab corruption:** `patch` tool corrupts tab characters in multi-line replacements. Use `execute_code` with Python instead.
2. **in() URL overflow:** Supabase `.in()` filter exceeds PostgREST URL limit (~4000 chars) with 900+ IDs. Batch in groups of 50.
3. **Mixed case DB columns:** PostgREST returns snake_case. Guard with: `row.camelCase ?? row.snake_case`
4. **Selective git add:** Jangan `git add -A` — bisa membawa perubahan dari sesi lain. Use `git diff --name-only HEAD` first.
5. **useSupabaseLiveValue returns null on error:** Always guard with `data == null`.
6. **Background procs don't inherit env:** Set env explicitly in command.
7. **Stale LSP warnings after patch:** Re-read the file to confirm actual state.
8. **ROLE_SECTIONS removal:** If removing admin role sections, check `fromHomeEntry` state routing.

## Admin Layout Notes

- `/admin/route.tsx` contains: sidebar, mobile bottom nav (BOTTOM_NAV_ITEMS), operational bottom nav, quick menu sheet, logout
- Bottom nav has 5 items: Dashboard, Menu, AI (FAB center), Orders, Lainnya (quick menu)
- Admin pages wrapped in `<AdminGuard>` requiring specific permissions
- Permission keys: `products:manage`, `orders:manage`, `inventory:manage`, `finance:view`, etc.

## Authentication Flow

1. `/login` → PIN or password entry
2. Success → redirect to `/home`
3. Root layout (`__root.tsx`) checks `isAuthenticated` + redirects unauthenticated to `/login`
4. Admin guard checks `isAdmin` or specific permissions

## Database Schema (Public Views)

| View | Schema | Description |
|---|---|---|
| `pos_orders` | public (view of pos.orders) | Orders with mixed-case columns |
| `pos_inventory` | public (view of pos.inventory) | Inventory items |
| `pos_users_public` | public (view of yumi_users) | User profiles |

All writes through service_role key via Edge Functions. Reads use anon key + RLS.
