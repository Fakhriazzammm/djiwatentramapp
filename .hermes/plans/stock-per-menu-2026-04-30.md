# Stock Per Menu — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Sistem "Stock Per Menu" yang memungkinkan admin mengatur jumlah porsi tersedia per menu, dengan auto-deduction bahan baku berdasarkan resep saat stock diset. Satu dashboard terpusat untuk batch-prep dan auto-sync inventory.

**Architecture:** Perluasan dari `useHybridAdjustMenuStockWithRecipe` yang sudah ada. Menambahkan dashboard admin baru untuk manajemen stock per menu secara batch, pre-deduction mode, auto-disable produk saat stock habis, dan integrasi dengan order flow agar tidak double-deduct. Semua write hybrid (Supabase langsung + Convex fallback).

**Tech Stack:** React + TypeScript + TanStack Router + Supabase (pos schema) + Convex (legacy mirror)

**Files to create:**
- `apps/web/src/components/admin/menu-stock-dashboard.tsx` — dashboard utama
- `apps/web/src/hooks/use-menu-stock-batch.ts` — hook untuk batch prep

**Files to modify:**
- `apps/web/src/hooks/use-hybrid-write-actions.ts` — tambah `setMenuStock` batch, `notifyInventoryStockRecipe`
- `apps/web/src/hooks/use-hybrid-pos-data.ts` — tambah hook data stock per menu
- `apps/web/src/routes/admin/` — tambah route `/admin/menu-stock`
- `apps/web/src/components/pos/menu-sidebar.tsx` — integrasi stock indicator
- `apps/web/src/hooks/use-hybrid-write-actions.ts` — `useHybridUpdateOrderStatus` → skip auto-deduct jika mode pre-deduction aktif

---

## Desain Konsep

### Mode Operasi

Sistem mendukung **dua mode** yang bisa dipilih per sesi:

| Mode | Kapan bahan baku dipotong | Kapan menu stock berkurang |
|------|--------------------------|---------------------------|
| **Pre-Deduction** (default baru) | Saat admin set stock menu | Saat order completed |
| **Post-Deduction** (existing) | Saat order completed | Tidak ada stock menu |

User bisa switch mode di dashboard. Default: Pre-Deduction.

### Alur Pre-Deduction

```
1. Admin buka Dashboard Stock Per Menu
2. Admin set "Espresso = 5 porsi"
3. System baca recipe Espresso:
   - 18g kopi × 5 = 90g
   - 100ml susu × 5 = 500ml
4. System deduct inventory (pos.inventory):
   - kopi: -90g
   - susu: -500ml
5. System set products.quantity = 5
6. System catat transaksi:
   - pos.inventory_transactions: "usage - batch prep 5× Espresso"
7. Pelanggan order 1 Espresso → order completed:
   - products.quantity = 4 (berkurang 1)
   - inventory TIDAK di-deduct lagi (sudah pre-deducted)
8. Saat stock = 0 → isAvailable = false (auto-disable)
```

### Alur Post-Deduction (existing, tetap didukung)

```
1. Pelanggan order 1 Espresso → order completed
2. Inventory di-deduct sesuai resep (auto-deduct existing)
3. products.quantity tidak dipakai
```

---

### Task 1: Tambah tipe dan interface `MenuStockItem`

**Objective:** Definisikan tipe data untuk stock per menu

**Files:**
- Create: `apps/web/src/types/menu-stock.ts`

**Step 1: Buat file tipe**

```typescript
// apps/web/src/types/menu-stock.ts

export type MenuStockDeductionMode = "pre" | "post";

export interface MenuStockItem {
  productId: string;
  productName: string;
  categoryName: string;
  currentStock: number;
  unit: string; // "porsi", "cup", "gelas", dll
  recipeId: string | null;
  ingredientCount: number;
  ingredients: MenuStockIngredient[];
  isAvailable: boolean;
  price: number;
  image?: string | null;
}

export interface MenuStockIngredient {
  inventoryId: string;
  ingredientName: string;
  amount: number; // per porsi
  currentStock: number; // stok bahan saat ini
  unit: string;
  maxPortions: number; // berapa porsi maksimal dari stok ini
  isLow: boolean; // stok bahan di bawah threshold
}

export interface MenuStockBatch {
  productId: string;
  targetStock: number;
  previousStock: number;
  delta: number;
  mode: MenuStockDeductionMode;
  note?: string;
}

export interface MenuStockBatchResult {
  ok: boolean;
  productId: string;
  productName: string;
  previousStock: number;
  targetStock: number;
  ingredientsDeducted: number;
  error?: string;
}
```

**Verification:** `bun run check-types` zero new errors.

---

### Task 2: Buat hook `useMenuStockData`

**Objective:** Fetch data stock per menu dengan kalkulasi max portions per ingredient

**Files:**
- Create: `apps/web/src/hooks/use-menu-stock-data.ts`

**Step 1: Buat hook**

```typescript
// apps/web/src/hooks/use-menu-stock-data.ts
import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import type { MenuStockItem, MenuStockIngredient } from "@/types/menu-stock";

export function useMenuStockData() {
  const load = useCallback(async () => {
    const supabase = createClient();

    // 1. Fetch semua produk yang punya recipe
    const { data: recipes, error: recipeError } = await supabase
      .from("pos_recipes")
      .select("_id, productId, variantName, ingredients")
      .is("variantName", null);
    if (recipeError) throw recipeError;

    const recipeMap = new Map<string, any>();
    for (const r of recipes ?? []) {
      recipeMap.set(r.productId, r);
    }
    const productIds = Array.from(recipeMap.keys());

    // 2. Fetch produk
    const { data: products, error: productError } = await supabase
      .from("pos_products_all")
      .select("*");
    if (productError) throw productError;

    // 3. Fetch semua inventory
    const { data: inventory, error: invError } = await supabase
      .from("pos_inventory")
      .select("*");
    if (invError) throw invError;

    const invMap = new Map<string, any>();
    for (const i of inventory ?? []) {
      invMap.set(i._id, i);
    }

    // 4. Fetch categories
    const { data: categories } = await supabase
      .from("pos_categories")
      .select("_id, name");
    const catMap = new Map<string, string>();
    for (const c of categories ?? []) {
      catMap.set(c._id, c.name ?? "");
    }

    // 5. Build menu stock items
    const items: MenuStockItem[] = [];
    for (const p of products ?? []) {
      const recipe = recipeMap.get(p._id);
      if (!recipe) continue; // skip produk tanpa recipe

      const ingredients: MenuStockIngredient[] = [];
      let ingredientCount = 0;

      for (const ing of recipe.ingredients ?? []) {
        const inv = invMap.get(ing.inventoryId);
        if (!inv) continue;
        const currentStock = Number(inv.quantity ?? 0);
        const amount = Number(ing.amount ?? 0);
        const maxPortions = amount > 0 ? Math.floor(currentStock / amount) : 999;
        const isLow = currentStock <= Number(inv.lowStockThreshold ?? 0);

        ingredients.push({
          inventoryId: ing.inventoryId,
          ingredientName: inv.ingredientName ?? "?",
          amount,
          currentStock,
          unit: inv.unit ?? "",
          maxPortions,
          isLow,
        });
        ingredientCount++;
      }

      items.push({
        productId: p._id,
        productName: p.name ?? "",
        categoryName: catMap.get(p.categoryId ?? "") ?? "Lainnya",
        currentStock: Number(p.quantity ?? 0),
        unit: "porsi",
        recipeId: recipe._id ?? null,
        ingredientCount,
        ingredients,
        isAvailable: Boolean(p.isAvailable),
        price: Number(p.price ?? 0),
        image: p.image ?? null,
      });
    }

    // Sort: low stock first
    items.sort((a, b) => a.currentStock - b.currentStock);

    return { items, refreshedAt: Date.now() };
  }, []);

  return useSupabaseLiveValue("menu-stock-data", load, []);
}
```

**Verification:** `bun run check-types` zero errors.

---

### Task 3: Tambah fungsi `setMenuStockBatch` di write-actions

**Objective:** Fungsi batch untuk set stock menu + auto-deduct/restore ingredients

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts`

**Step 1: Tambah export function baru** di dekat `useHybridAdjustMenuStockWithRecipe` (sekitar line 692)

```typescript
export function useHybridSetMenuStockBatch() {
  const adjustStock = useHybridAdjustMenuStockWithRecipe();

  return useCallback(
    async (batches: Array<{
      productId: string;
      targetStock: number;
      mode?: "pre" | "post";
      note?: string;
    }>) => {
      const results: Array<{
        ok: boolean;
        productId: string;
        productName: string;
        previousStock: number;
        targetStock: number;
        ingredientsDeducted: number;
        error?: string;
      }> = [];

      for (const batch of batches) {
        try {
          // Baca current stock
          const supabase = createClient();
          const { data: product } = await supabase
            .from("pos_products_all")
            .select("quantity, name")
            .eq("_id", batch.productId)
            .maybeSingle();

          const currentStock = Number(product?.quantity ?? 0);
          const delta = batch.targetStock - currentStock;

          if (delta === 0) {
            results.push({
              ok: true,
              productId: batch.productId,
              productName: product?.name ?? "",
              previousStock: currentStock,
              targetStock: batch.targetStock,
              ingredientsDeducted: 0,
            });
            continue;
          }

          const result = await adjustStock({
            productId: batch.productId,
            deltaMenu: delta,
            currentQuantity: currentStock,
            source: "batch-prep",
            notes: batch.note ?? `Batch prep: set stock to ${batch.targetStock}`,
          });

          results.push({
            ok: true,
            productId: batch.productId,
            productName: product?.name ?? "",
            previousStock: currentStock,
            targetStock: batch.targetStock,
            ingredientsDeducted: result.ingredientUpdatedCount,
          });
        } catch (error) {
          results.push({
            ok: false,
            productId: batch.productId,
            productName: "",
            previousStock: 0,
            targetStock: batch.targetStock,
            ingredientsDeducted: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return results;
    },
    [adjustStock]
  );
}
```

**Verification:** `bun run check-types` zero errors.

---

### Task 4: Tambah `notifyInventoryStockRecipe` — untuk menampilkan info "bahan baku tertakar"

**Objective:** Fungsi utility untuk kalkulasi "jika stock = X, maka bahan baku = recipe × X"

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts`

**Step 1: Tambah helper** (di atas `useHybridApplyInventoryStockAction` sekitar line 5140)

```typescript
export function calculateStockRecipeDeduction(
  recipeIngredients: Array<{ inventoryId: string; amount: number }>,
  inventoryMap: Map<string, { name: string; currentStock: number; unit: string }>,
  targetPortions: number
) {
  return recipeIngredients.map((ing) => {
    const inv = inventoryMap.get(ing.inventoryId);
    const needed = ing.amount * targetPortions;
    const currentStock = inv?.currentStock ?? 0;
    return {
      inventoryId: ing.inventoryId,
      ingredientName: inv?.name ?? "?",
      amountPerPortion: ing.amount,
      totalNeeded: needed,
      currentStock,
      unit: inv?.unit ?? "",
      isSufficient: currentStock >= needed,
      shortage: Math.max(0, needed - currentStock),
    };
  });
}
```

**Verification:** Cek tipe compile.

---

### Task 5: Buat component `MenuStockDashboard` — UI utama

**Objective:** Dashboard untuk melihat dan mengatur stock per menu

**Files:**
- Create: `apps/web/src/components/admin/menu-stock-dashboard.tsx`

**Step 1: Buat component skeleton**

```tsx
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, AlertTriangle, CheckCircle2, RefreshCw,
  Search, Filter, ChevronDown, ChevronUp, X,
  Coffee, UtensilsCrossed, Box, Settings2,
  ArrowUpDown, Layers, Gauge
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useMenuStockData } from "@/hooks/use-menu-stock-data";
import { useHybridSetMenuStockBatch } from "@/hooks/use-hybrid-write-actions";
import type { MenuStockItem, MenuStockBatchResult } from "@/types/menu-stock";
import { calculateStockRecipeDeduction } from "@/hooks/use-hybrid-write-actions";

// ... implementation continues below
```

**(Konten penuh akan diimplementasikan dalam task terpisah)**

**Verification:** Dashboard bisa dibuka, menampilkan daftar menu dengan stock.

---

### Task 6: Integrasi stock indicator di `menu-sidebar.tsx`

**Objective:** Tampilkan badge stock tersedia di setiap menu card di POS

**Files:**
- Modify: `apps/web/src/components/pos/menu-sidebar.tsx`

**Step 1: Tambah stock indicator di ProductCard**

Di dalam ProductCard (sekitar line 240), tambah:
```tsx
{/* Stock indicator */}
{product.quantity != null && product.quantity <= 5 && (
  <span className={cn(
    "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold",
    product.quantity === 0 
      ? "bg-red-500 text-white" 
      : product.quantity <= 3 
        ? "bg-amber-500 text-white" 
        : "bg-blue-500 text-white"
  )}>
    {product.quantity === 0 ? "Habis" : `Sisa ${product.quantity}`}
  </span>
)}
```

**Verification:** Di halaman POS, menu dengan stock rendah menampilkan badge.

---

### Task 7: Auto-disable product saat stock habis

**Objective:** Saat stock = 0, otomatis set `isAvailable = false`

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts` (di `useHybridSetMenuStockBatch`)

**Step 1: Tambah auto-disable logic**

Di dalam `useHybridSetMenuStockBatch`, setelah update quantity:
```typescript
// Auto-disable if stock === 0
if (batch.targetStock === 0) {
  await updateProduct({
    id: batch.productId as any,
    isAvailable: false,
  });
} else {
  // Re-enable if stock > 0
  await updateProduct({
    id: batch.productId as any,
    isAvailable: true,
  });
}
```

**Verification:** Set stock menu ke 0 → produk tidak muncul di POS. Set ke >0 → muncul kembali.

---

### Task 8: Integrasi order flow — skip auto-deduct jika pre-deduction

**Objective:** Cegah double-deduction: kalau sudah pre-deduct, jangan auto-deduct lagi

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts` (di `useHybridUpdateOrderStatus`)

**Step 1: Cek mode sebelum auto-deduct**

Di `useHybridUpdateOrderStatus` line ~2712, ganti:
```typescript
// Auto-deduct inventory saat order completed
if (status === "completed") {
  try {
    const result = await deductInventory({...});
```

Menjadi:
```typescript
// Auto-deduct inventory saat order completed
// HANYA jika menu tidak punya pre-deducted stock (quantity === null/undefined)
if (status === "completed") {
  try {
    // Cek apakah produk-produk di order ini punya quantity tracking
    const { data: products } = await pos
      .from("products")
      .select("quantity, source_id")
      .in("source_id", productIds);
    
    const hasPreDeduction = (products ?? []).some(
      p => p.quantity != null && p.quantity > 0
    );
    
    if (!hasPreDeduction) {
      // Mode post-deduction: deduct dari inventory
      const result = await deductInventory({...});
    } else {
      // Mode pre-deduction: hanya kurangi stock menu
      for (const item of items) {
        const { data: prod } = await pos
          .from("products")
          .select("quantity")
          .eq("source_id", item.product_source_id)
          .maybeSingle();
        if (prod && prod.quantity != null) {
          const newQty = Math.max(0, prod.quantity - (item.quantity ?? 1));
          await pos
            .from("products")
            .update({ quantity: newQty, isAvailable: newQty > 0 })
            .eq("source_id", item.product_source_id);
        }
      }
    }
  } catch (deductError) {
    console.error("[auto-deduct] Failed:", deductError);
  }
}
```

**Verification:** 
1. Set Espresso stock = 5 (pre-deduction) → inventory terpotong
2. Buat order 1 Espresso → complete → inventory TIDAK terpotong lagi, tapi products.quantity jadi 4

---

### Task 9: Tambah route `/admin/menu-stock`

**Objective:** Bikin halaman bisa diakses dari sidebar admin

**Files:**
- Create: `apps/web/src/routes/admin/menu-stock.tsx`
- Create: `apps/web/src/routes/admin/menu-stock.lazy.tsx`

**Step 1: Route definition**

```tsx
// apps/web/src/routes/admin/menu-stock.tsx
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/menu-stock")({});
```

```tsx
// apps/web/src/routes/admin/menu-stock.lazy.tsx
import { createLazyFileRoute } from "@tanstack/react-router";
import { MenuStockDashboard } from "@/components/admin/menu-stock-dashboard";

export const Route = createLazyFileRoute("/admin/menu-stock")({
  component: MenuStockDashboard,
});
```

**Verification:** `/admin/menu-stock` menampilkan dashboard.

---

### Task 10: Build dan integration test

**Objective:** Pastikan semua berjalan tanpa error

**Step 1: Build**
```bash
cd /opt/djiwatentramapp/apps/web
~/.bun/bin/bun run check-types
~/.bun/bin/bun run build
```

**Step 2: Manual test**
1. Buka `/admin/menu-stock`
2. Pilih menu → set stock = 5
3. Cek `pos.inventory` — bahan berkurang sesuai resep × 5
4. Cek `pos.inventory_transactions` — ada record "usage - batch prep"
5. Cek `pos.products` — quantity = 5
6. Buka POS → badge "Sisa 5" muncul
7. Buat order → complete → quantity jadi 4, inventory TIDAK berubah
8. Set stock = 0 → produk auto-unavailable

**Verification:** `bun run build` sukses, zero type errors.

---

## Ringkasan Dampak

| Before | After |
|--------|-------|
| Stock hanya di inventory (bahan baku) | Stock per menu + inventory (dual tracking) |
| Auto-deduct saat order completed | Pre-deduction saat prep + decrement menu stock |
| Tidak ada indikator stock di POS | Badge "Sisa X" di setiap menu card |
| Manual disable produk habis | Auto-disable saat stock = 0 |
| Tidak ada dashboard stock terpusat | Dashboard `/admin/menu-stock` dengan batch set |

---

## Potensi Perluasan (Future)

- **HPP real-time per porsi**: ingredient cost × amount = HPP menu
- **Prediksi stockout**: berdasarkan avg daily orders per menu
- **Auto-suggest prep quantity**: "Besok Senin, biasa laku 12 Espresso, siapkan 15"
- **WhatsApp/Telegram notifikasi**: "Espresso tinggal 2 porsi!"
