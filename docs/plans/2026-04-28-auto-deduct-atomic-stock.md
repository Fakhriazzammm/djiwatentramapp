# Auto-Deduct Order Stock + Atomic Menu Stock Adjustment — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement task-by-task.

**Goal:** (1) Saat order completed, otomatis potong stok bahan baku sesuai recipe. (2) Menu stock adjustment jadi atomic dengan pre-validation dan rollback.

**Architecture:** Modify `useHybridUpdateOrderStatus` hook untuk trigger auto-deduct setelah status "completed". Buat hook baru `useHybridDeductOrderInventory` yang baca order_items → recipe → deduct inventory. Untuk atomicity menu stock: buat `useHybridAtomicAdjustMenuStock` dengan pre-flight check semua ingredient + rollback on failure.

**Tech Stack:** TypeScript, React hooks, Supabase JS client, pos schema (orders, order_items, recipes, inventory, inventory_transactions)

---

## Task 1: Buat hook `useHybridDeductOrderInventory`

**Objective:** Hook baru yang membaca order_items, mencocokkan recipe, dan mendeduct inventory. Dipanggil setelah order completed.

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts` (append di akhir file)

**Step 1: Tambahkan fungsi di akhir file (sebelum closing)**

```typescript
export function useHybridDeductOrderInventory() {
  const applyStockAction = useHybridApplyInventoryStockAction();
  
  return useCallback(
    async (args: { orderId: string; orderNumber?: string }) => {
      if (!hasSupabaseConfig) return { deductedCount: 0, skippedCount: 0 };
      
      const orderId = String(args?.orderId ?? "");
      if (!orderId) throw new Error("orderId wajib diisi");
      
      const supabase = createClient();
      const pos = supabase.schema("pos");
      
      // 1. Ambil order items
      const { data: items, error: itemsError } = await pos
        .from("order_items")
        .select("source_id, product_source_id, product_name, quantity")
        .eq("order_source_id", orderId);
      if (itemsError) throw itemsError;
      if (!items?.length) return { deductedCount: 0, skippedCount: 0 };
      
      // 2. Ambil semua recipe untuk produk di order ini
      const productIds = [...new Set(items.map((i: any) => i.product_source_id))];
      const { data: recipes, error: recipesError } = await pos
        .from("recipes")
        .select("source_id, product_source_id, variant_name, ingredients")
        .in("product_source_id", productIds)
        .is("variant_name", null);
      if (recipesError) throw recipesError;
      
      const recipeMap = new Map<string, any>();
      for (const r of recipes ?? []) {
        recipeMap.set(r.product_source_id, r);
      }
      
      let deductedCount = 0;
      let skippedCount = 0;
      const orderNumber = args?.orderNumber ?? orderId.slice(-6);
      
      // 3. Untuk setiap item, deduct ingredients sesuai recipe
      for (const item of items as any[]) {
        const recipe = recipeMap.get(item.product_source_id);
        if (!recipe) {
          skippedCount++;
          continue;
        }
        
        const ingredients = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.filter(
              (ing: any) => typeof ing?.inventoryId === "string" && Number(ing?.amount ?? 0) > 0
            )
          : [];
        
        if (ingredients.length === 0) {
          skippedCount++;
          continue;
        }
        
        const multiplier = Number(item.quantity ?? 1);
        for (const ing of ingredients) {
          await applyStockAction({
            inventoryId: ing.inventoryId,
            action: "usage",
            quantity: Number(ing.amount) * multiplier,
            notes: `Auto-deduct order #${orderNumber}: ${item.product_name} x${multiplier}`,
          });
          deductedCount++;
        }
      }
      
      return { deductedCount, skippedCount };
    },
    [applyStockAction]
  );
}
```

**Step 2: Verifikasi TypeScript**

Run: `cd /opt/djiwatentramapp/apps/web && ~/.bun/bin/bun run check-types`

Expected: PASS (no new errors)

**Step 3: Commit**

```bash
cd /opt/djiwatentramapp
git add apps/web/src/hooks/use-hybrid-write-actions.ts
git commit -m "feat: add useHybridDeductOrderInventory hook for auto-deduction on order complete"
```

---

## Task 2: Integrasi auto-deduct ke `useHybridUpdateOrderStatus`

**Objective:** Panggil `useHybridDeductOrderInventory` saat status berubah ke "completed".

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts:2570-2646`

**Step 1: Tambahkan deduksi setelah status update**

Ubah `useHybridUpdateOrderStatus` (line 2570). Replace seluruh function:

```typescript
export function useHybridUpdateOrderStatus() {
  const fallback = useMutation(api.orders.updateOrderStatus);
  const deductInventory = useHybridDeductOrderInventory();
  
  return useCallback(
    async (args: any) => {
      if (!hasSupabaseConfig) {
        return fallback(args);
      }
      try {
        const id = args?.id as string | undefined;
        const status = args?.status as
          | "pending" | "paid" | "completed" | "cancelled" | undefined;
        if (!id || !status) {
          throw new Error("Order id and status are required");
        }

        const supabase = createClient();
        const pos = supabase.schema("pos");

        const { data: order, error: getError } = await pos
          .from("orders")
          .select("source_id, status, order_number, total_amount, payment_method, created_at")
          .eq("source_id", id)
          .maybeSingle();
        if (getError) throw getError;
        if (!order) throw new Error("Order not found");

        const isNowPaid = status === "paid" || status === "completed";
        const wasPaid = order.status === "paid" || order.status === "completed";
        if (isNowPaid && !wasPaid) {
          const transactionDate = Number(args?.transactionDate ?? order.created_at ?? Date.now());
          const { error: txError } = await pos
            .from("financial_transactions")
            .insert({
              source_id: makeSourceId("fin"),
              tx_type: "income",
              amount: Number(order.total_amount ?? 0),
              category: "Penjualan",
              description: `Penjualan Pesanan #${order.order_number ?? "-"}`,
              tx_date: transactionDate,
              payment_method: order.payment_method ?? null,
              status: "completed",
              order_source_id: id,
              creation_time: Date.now(),
              raw: { kind: "order_settlement_status_update", orderId: id },
            });
          if (txError) throw txError;
        }

        const { error: updateError } = await pos
          .from("orders")
          .update({ status })
          .eq("source_id", id);
        if (updateError) throw updateError;

        // AUTO-DEDUCT: Jika status completed, potong inventory
        if (status === "completed") {
          try {
            const result = await deductInventory({
              orderId: id,
              orderNumber: String(order.order_number ?? ""),
            });
            console.log(
              `[auto-deduct] Order #${order.order_number}: ${result.deductedCount} deducted, ${result.skippedCount} skipped`
            );
          } catch (deductError) {
            // Jangan throw — inventory deduction failure tidak boleh batalkan order completion
            console.error("[auto-deduct] Failed:", deductError);
          }
        }

        return;
      } catch (error) {
        console.warn("[supabase-hybrid:write-update-order-status]", error);
        throw error;
      }
    },
    [fallback, deductInventory]
  );
}
```

**Step 2: Verifikasi**

Run: `cd /opt/djiwatentramapp/apps/web && ~/.bun/bin/bun run check-types && ~/.bun/bin/bun run build`

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/hooks/use-hybrid-write-actions.ts
git commit -m "feat: auto-deduct inventory when order status becomes completed"
```

---

## Task 3: Atomic `useHybridAtomicAdjustMenuStock` dengan pre-flight + rollback

**Objective:** Ganti `useHybridAdjustMenuStockWithRecipe` dengan versi atomic: pre-flight check semua ingredient, rollback jika gagal di tengah.

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts:522-620`

**Step 1: Replace `useHybridAdjustMenuStockWithRecipe`**

Replace line 522-620:

```typescript
export function useHybridAdjustMenuStockWithRecipe() {
  const updateProduct = useHybridUpdateProduct();
  const applyInventoryStockAction = useHybridApplyInventoryStockAction();

  return useCallback(
    async (args: {
      productId: string;
      deltaMenu: number;
      currentQuantity?: number;
      source?: string;
      notes?: string;
      recipe?: MenuRecipeSnapshot | null;
    }) => {
      const productId = String(args?.productId ?? "").trim();
      const deltaMenu = Number(args?.deltaMenu ?? 0);
      if (!productId) throw new Error("productId wajib diisi");
      if (!Number.isFinite(deltaMenu) || deltaMenu === 0) {
        throw new Error("deltaMenu tidak valid");
      }

      const source = String(args?.source ?? "manual").trim() || "manual";
      let recipe = args?.recipe ?? null;

      if (!recipe && hasSupabaseConfig) {
        const { data: recipeRow, error: recipeError } = await createClient()
          .from("pos_recipes")
          .select("_id, productId, variantName, ingredients")
          .eq("productId", productId)
          .is("variantName", null)
          .maybeSingle();
        if (recipeError) throw recipeError;
        recipe = (recipeRow as MenuRecipeSnapshot | null) ?? null;
      }

      if (!recipe) {
        throw new Error("Menu belum punya recipe. Buat recipe dulu.");
      }

      const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.filter(
            (ingredient) =>
              typeof ingredient?.inventoryId === "string" &&
              ingredient.inventoryId.trim() !== "" &&
              Number(ingredient?.amount ?? 0) > 0
          )
        : [];
      if (ingredients.length === 0) {
        throw new Error("Recipe menu belum punya komposisi bahan baku.");
      }

      let currentQuantity = Number(args?.currentQuantity);
      if (!Number.isFinite(currentQuantity)) {
        if (!hasSupabaseConfig) {
          throw new Error("currentQuantity wajib dikirim saat Supabase tidak aktif.");
        }
        const { data: productRow, error: productError } = await createClient()
          .from("pos_products_all")
          .select("quantity")
          .eq("_id", productId)
          .maybeSingle();
        if (productError) throw productError;
        currentQuantity = Number(productRow?.quantity ?? 0);
      }

      const nextQuantityRaw = currentQuantity + deltaMenu;
      if (deltaMenu < 0 && nextQuantityRaw < 0) {
        throw new Error("Stok menu tidak mencukupi.");
      }
      const nextQuantity = Math.max(0, nextQuantityRaw);

      // ============ ATOMIC SECTION ============
      // Pre-flight: verify all ingredients exist and have enough stock (for usage)
      const inventoryAction = deltaMenu > 0 ? "add" : "usage";
      const multiplier = Math.abs(deltaMenu);
      const pos = createClient().schema("pos");

      if (inventoryAction === "usage") {
        for (const ingredient of ingredients) {
          const { data: inv, error: invError } = await pos
            .from("inventory")
            .select("quantity, ingredient_name")
            .eq("source_id", ingredient.inventoryId)
            .maybeSingle();
          if (invError) throw invError;
          if (!inv) {
            throw new Error(
              `Bahan baku "${ingredient.inventoryId}" tidak ditemukan di inventory.`
            );
          }
          const needed = Number(ingredient.amount) * multiplier;
          if (Number(inv.quantity ?? 0) < needed) {
            throw new Error(
              `Stok "${inv.ingredient_name ?? ingredient.inventoryId}" tidak cukup (butuh ${needed}, tersedia ${inv.quantity}).`
            );
          }
        }
      }

      // Step 1: Update product quantity (ini harus sukses dulu)
      await updateProduct({
        id: productId as any,
        quantity: nextQuantity,
      });

      // Step 2: Update semua ingredient dengan rollback on failure
      const updatedIngredients: string[] = [];
      try {
        for (const ingredient of ingredients) {
          await applyInventoryStockAction({
            inventoryId: ingredient.inventoryId,
            action: inventoryAction,
            quantity: Number(ingredient.amount) * multiplier,
            notes:
              args?.notes ??
              `Sinkron stok menu (${deltaMenu > 0 ? "+" : ""}${deltaMenu}) dari ${source}`,
          });
          updatedIngredients.push(ingredient.inventoryId);
        }
      } catch (error) {
        // ROLLBACK: kembalikan product quantity ke nilai awal
        console.error(
          `[atomic-adjust-menu-stock] Gagal update ingredient, rollback product ${productId}`,
          error
        );
        try {
          await updateProduct({
            id: productId as any,
            quantity: currentQuantity,
          });
        } catch (rollbackError) {
          console.error(
            `[atomic-adjust-menu-stock] CRITICAL: rollback gagal! Product ${productId} quantity mismatch. Previous: ${currentQuantity}, attempted: ${nextQuantity}`,
            rollbackError
          );
        }

        // Rollback ingredient yang sudah terlanjur di-update
        const rollbackAction = inventoryAction === "add" ? "usage" : "add";
        for (const rolledBackId of updatedIngredients) {
          const ing = ingredients.find((i) => i.inventoryId === rolledBackId);
          if (!ing) continue;
          try {
            await applyInventoryStockAction({
              inventoryId: rolledBackId,
              action: rollbackAction,
              quantity: Number(ing.amount) * multiplier,
              notes: `ROLLBACK: ${error instanceof Error ? error.message : "unknown error"}`,
            });
          } catch (rbError) {
            console.error(
              `[atomic-adjust-menu-stock] CRITICAL: ingredient rollback gagal untuk ${rolledBackId}`,
              rbError
            );
          }
        }

        throw error;
      }

      return {
        productId,
        deltaMenu,
        previousQuantity: currentQuantity,
        nextQuantity,
        ingredientUpdatedCount: ingredients.length,
      };
    },
    [applyInventoryStockAction, updateProduct]
  );
}
```

**Step 2: Verifikasi**

Run: `cd /opt/djiwatentramapp/apps/web && ~/.bun/bin/bun run check-types`

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/hooks/use-hybrid-write-actions.ts
git commit -m "feat: atomic menu stock adjustment with pre-flight check and rollback"
```

---

## Verification

Setelah semua task selesai:

```bash
cd /opt/djiwatentramapp/apps/web
~/.bun/bin/bun run check-types   # harus PASS
~/.bun/bin/bun run build         # harus PASS
```

Manual test scenario:
1. Buat order → complete → cek inventory berkurang
2. Bar/kitchen +/− menu → cek semua ingredient berubah atomically
3. Test dengan menu tanpa recipe → harus throw error jelas
4. Test dengan ingredient tidak cukup → harus throw error sebelum product berubah
