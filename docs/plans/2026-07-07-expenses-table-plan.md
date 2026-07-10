# 📋 Plan: Halaman Tabel Pengeluaran ala MyBagasi

## Overview
Halaman baru `/admin/finance/expenses` — tabel pengeluaran dengan filter, sort, search, pagination, export CSV, dan preview foto struk.

## File yang Dibuat / Diedit

```
🆕 apps/pos/src/routes/admin/finance/expenses/route.tsx
🆕 apps/pos/src/routes/admin/finance/expenses/-components/expenses-table.tsx
🆕 apps/pos/src/routes/admin/finance/expenses/-components/expense-detail-modal.tsx
🆕 apps/pos/src/hooks/use-expenses-data.ts
✏️ apps/pos/src/routes/admin/route.tsx                          (sidebar + title + paths)
✏️ apps/pos/src/lib/export-utils.ts                              (CSV export function)
```

## 1. Route — `expenses/route.tsx`

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ExpensesTable } from "./-components/expenses-table";

export const Route = createFileRoute("/admin/finance/expenses")({
  component: ExpensesTable,
});
```

## 2. Data Hook — `use-expenses-data.ts`

Custom hook yang fetch dari `pos_financial_transactions`:

```ts
interface ExpenseRow {
  _id: string;
  date: number;
  category: string;
  description: string;
  merchant: string;
  amount: number;
  paymentMethod: string;
  status: string;
  receiptImageUrl: string | null;
  metadata: Record<string, any>;
}

interface ExpensesQuery {
  startDate?: number;
  endDate?: number;
  search?: string;          // cari di description + merchant
  category?: string;        // filter kategori
  sortBy?: "date" | "amount" | "category";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

function useExpensesData(query: ExpensesQuery) {
  // Fetch pos_financial_transactions WHERE type='expense' AND category != 'HPP'
  // Filter by date range
  // Text search via .ilike() on description & merchant
  // Sort by selected column
  // Pagination with .range(start, end)
  // Return { data, count, isLoading, error }
}
```

**Fitur Query:**
- `type=eq.expense` + `category=neq.HPP` (default filter)
- Date range: `date=gte.{startMs}&date=lte.{endMs}`
- Search: `or=(description.ilike.*{keyword}*,merchant.ilike.*{keyword}*)`
- Sort: `.order(sortBy, { ascending: sortDir === 'asc' })`
- Pagination: `.range(offset, offset + pageSize - 1)` + count query

## 3. Tabel Komponen — `expenses-table.tsx`

### Header Bar
```
┌──────────────────────────────────────────────────────────┐
│ 📋 Pengeluaran                    [🔍 Search...] [📥 CSV] │
│ [Hari Ini] [Minggu Ini] [Bulan Ini] [Custom: 📅—📅]      │
└──────────────────────────────────────────────────────────┘
```

### Kolom Tabel

| # | Kolom | Width | Sortable | Keterangan |
|---|-------|-------|----------|------------|
| 1 | Tanggal | 100px | ✅ | `date` → format dd/mm/yy HH:mm |
| 2 | Kategori | 120px | ✅ | Badge warna-warni |
| 3 | Deskripsi | auto | — | `description`, truncate 40 char |
| 4 | Merchant | 120px | — | `merchant` |
| 5 | Amount | 110px | ✅ | `formatAmount(amount)` align right |
| 6 | Metode | 90px | — | `paymentMethod` |
| 7 | Status | 80px | — | Badge: completed/pending/cancelled |
| 8 | Foto | 60px | — | 🖼️ icon → klik buka modal |

### Fitur Interaktif

1. **Sort**: Klik header kolom (Tanggal, Kategori, Amount) → toggle asc/desc
2. **Filter Kategori**: Dropdown di atas tabel (Semua, Bahan Baku, Operasional, dll)
3. **Search**: Debounced input di header bar — cari description + merchant
4. **Pagination**: "Menampilkan 1-20 dari 156" + Prev/Next buttons
5. **CSV Export**: Download semua data (bukan hanya halaman saat ini)
6. **Foto Struk**: Klik ikon 🖼️ → modal preview gambar dari `metadata.receipt_image_url`
7. **Detail Row**: Klik row → expand/modal detail (item-item scanItems, notes, dll)

### States

| State | Tampilan |
|-------|----------|
| Loading | Skeleton rows (8 baris shimmer) |
| Empty (no filter) | "🔍 Belum ada pengeluaran. Kirim foto struk ke @YummeFinanceAIbot" |
| Empty (filtered) | "📭 Tidak ada hasil untuk filter ini." |
| Error | "❌ Gagal memuat data. [Coba Lagi]" |

### Kategori Badge Colors

```
Bahan Baku     → bg-amber-100 text-amber-800
Operasional    → bg-blue-100 text-blue-800
Packaging      → bg-purple-100 text-purple-800
bahan_makanan  → bg-green-100 text-green-800
bahan_segar    → bg-emerald-100 text-emerald-800
gas_energi     → bg-red-100 text-red-800
cleaning       → bg-cyan-100 text-cyan-800
lainnya        → bg-gray-100 text-gray-800
...default     → bg-slate-100 text-slate-800
```

## 4. Detail Modal — `expense-detail-modal.tsx`

Saat klik row atau ikon foto:

```
┌─────────────────────────────────────┐
│ Detail Pengeluaran              [✕] │
├─────────────────────────────────────┤
│ 🏪 WEN WEN                         │
│ 📅 07/07/2026 15:48                │
│ 💰 Rp48,500                        │
│ 📁 Packaging                       │
│ 💳 Cash                            │
│ 🖼️ [Foto Struk — klik untuk zoom]  │
├─────────────────────────────────────┤
│ 📋 Item:                           │
│  1. DOLLAR PP 15X30  1 × Rp14.000  │
│  2. KRESEK PARTY UK  1 × Rp13.000  │
│  3. SENDOK MAKAN     1 × Rp21.500  │
└─────────────────────────────────────┘
```

## 5. Sidebar Integration — Edit `admin/route.tsx`

### Tambah ke `PAGE_TITLES`:
```ts
"/admin/finance/expenses": "Pengeluaran",
```

### Tambah ke `FINANCE_PATHS`:
```ts
const FINANCE_PATHS = [
  "/admin/finance",
  "/admin/finance/reports",
  "/admin/finance/shift-reports",
  "/admin/finance/transactions",
  "/admin/finance/expenses",      // 🆕
  "/admin/finance/accounting",
];
```

### Tambah ke collapsed sidebar:
```tsx
<DesktopNavLink icon={<ArrowDownLeft />} isCollapsed={isCollapsed}
  label="Pengeluaran" to="/admin/finance/expenses" permission="finance:view" />
```

### Tambah ke expanded submenu:
```tsx
<DesktopSubNavLink icon={<ArrowDownLeft />} label="Pengeluaran"
  to="/admin/finance/expenses" permission="finance:view" />
```

### Tambah ke `QUICK_MENU_SECTIONS` → Keuangan:
```ts
{ to: "/admin/finance/expenses", icon: ArrowDownLeft, label: "Pengeluaran", permission: "finance:view" },
```

## 6. CSV Export — Edit `export-utils.ts`

Tambah fungsi:
```ts
export function exportExpensesCSV(expenses: ExpenseRow[]) { ... }
```

Kolom CSV: Tanggal, Kategori, Deskripsi, Merchant, Amount, Metode, Status, Foto URL

## Urutan Implementasi

1. **Hook** — `use-expenses-data.ts`
2. **Tabel** — `expenses-table.tsx` (main component)
3. **Modal** — `expense-detail-modal.tsx`
4. **Route** — `expenses/route.tsx`
5. **Sidebar** — edit `admin/route.tsx`
6. **CSV** — edit `export-utils.ts`

---

Setuju? Ketik **ya** untuk mulai implementasi.
