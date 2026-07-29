# Indikator "Sudah Diantar" + Auto-Deliver Saat Tutup Shift

> **Goal:** Tambah kolom `is_delivered` di `pos.orders`, indikator toggle di card riwayat, dan auto-mark delivered saat shift ditutup.
> **Architecture:** Migration additive, optimistic toggle di frontend, batch update di `useHybridEndShift`.
> **Tech Stack:** Supabase PostgreSQL, React + TanStack Query, TypeScript

---

## 📊 Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── Task 1: Migration SQL — ALTER TABLE pos.orders ADD is_delivered
  └── Task 2: Indikator + toggle di HistoryTab card

Level 2 (dependen → sequential)
  └── Task 3: Auto-deliver batch update di useHybridEndShift

Level 3 (verifikasi)
  └── Task 4: Build + typecheck
```

---

## Task 1: Migration — Tambah Kolom `is_delivered`

**Objective:** Add `is_delivered BOOLEAN DEFAULT false` ke `pos.orders`

**Files:**
- Create: `supabase/migrations/20260727000001_add_is_delivered.sql`

**Step 1: Tulis migration**

```sql
BEGIN;
  ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT false;
  COMMENT ON COLUMN pos.orders.is_delivered IS 'Flag pesanan sudah diantar ke pelanggan. Auto-set true saat shift ditutup.';
COMMIT;
```

**Step 2: Jalankan migration di production**

```bash
cd /opt/supabase-selfhost
docker compose exec -T db psql -U postgres -d postgres \
  -f /opt/djiwatentramapp/supabase/migrations/20260727000001_add_is_delivered.sql
```

**Step 3: Verifikasi**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'pos' AND table_name = 'orders' AND column_name = 'is_delivered';
-- Expected: is_delivered | boolean | false
```

**Step 4: Commit**

```bash
cd /opt/djiwatentramapp
git add supabase/migrations/20260727000001_add_is_delivered.sql
git commit -m "feat: add is_delivered column to pos.orders"
```

---

## Task 2: Indikator + Toggle di Card Riwayat

**Objective:** Tambah indikator visual "Sudah Diantar"/"Belum Diantar" dan toggle inline di kanan card riwayat, di atas tombol print.

**Files:**
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx` — `HistoryTab` component (line 1661-1753)

**Step 1: Tambah import icon**

Di bagian atas file, tambah import:
```typescript
import { CheckCircle, Circle } from "lucide-react";
```
(Pastikan belum ada — cek dulu)

**Step 2: Tambah toggle button di card**

Di dalam card (setelah line 1729, sebelum tombol print), tambah:

```tsx
{/* Delivered toggle */}
<button
  onClick={async (e) => {
    e.stopPropagation();
    try {
      const supabase = createClient();
      await supabase.schema("pos").from("orders")
        .update({ is_delivered: !order.is_delivered })
        .eq("_id", order._id);
    } catch (err) {
      console.warn("[delivered-toggle] failed", err);
    }
  }}
  className="flex items-center gap-1 px-1.5 py-0.5 text-[9px]"
  type="button"
  title={order.is_delivered ? "Tandai belum diantar" : "Tandai sudah diantar"}
>
  {order.is_delivered ? (
    <>
      <CheckCircle className="h-3 w-3 text-emerald-500" />
      <span className="font-medium text-emerald-600">Sudah Diantar</span>
    </>
  ) : (
    <>
      <Circle className="h-3 w-3 text-muted-foreground/40" />
      <span className="text-muted-foreground">Belum Diantar</span>
    </>
  )}
</button>
```

**Step 3: Letakkan di layout card**

Struktur card setelah perubahan:
```
<div className="flex items-stretch">
  <!-- Clickable main area (sudah ada) -->
  <button onClick={() => onSelectOrder(order)} ...>
    Line 1: #orderNumber • status • shift • type
    Line 2: date/time • cashier • customer
    Line 3: qty • amount • payment • promo
  </button>

  <!-- Right side actions -->
  <div className="flex flex-col items-center justify-center gap-0.5 pr-1.5">
    <!-- NEW: delivered toggle -->
    <button onClick={toggleDelivered} ...>
      <CheckCircle /> / <Circle />
    </button>

    <!-- EXISTING: print dropdown -->
    <DropdownMenu>
      <Printer />
    </DropdownMenu>
  </div>
</div>
```

**Pola existing untuk supabase client:** Frontend pakai `createClient()` dari `@supabase/supabase-js`. Cek import yang sudah ada di file.

**Step 4: Mobile-friendly**
- Toggle kecil: `px-1.5 py-0.5 text-[9px]`
- `e.stopPropagation()` agar tidak trigger `onSelectOrder`

**Step 5: Build verify**

```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit
```

---

## Task 3: Auto-Deliver Saat Tutup Shift

**Objective:** Saat `useHybridEndShift` sukses update `shifts.end_time`, batch update semua order dalam rentang shift tersebut menjadi `is_delivered = true`.

**Files:**
- Modify: `apps/pos/src/hooks/use-hybrid-write-actions.ts` — `useHybridEndShift` (setelah line 4679)

**Step 1: Tambah batch update**

Setelah line 4679 (`if (updateError) throw updateError;`), tambah:

```typescript
// Auto-mark all shift orders as delivered
try {
  const { error: deliveredError } = await supabase
    .schema("pos")
    .from("orders")
    .update({ is_delivered: true })
    .gte("creation_time", Number(shift.startTime))
    .lt("creation_time", endTime)
    .in("status", ["completed", "paid"])
    .eq("is_delivered", false);
  if (deliveredError) {
    console.warn("[supabase-hybrid:write-end-shift] auto-deliver failed", deliveredError);
  }
} catch (e) {
  console.warn("[supabase-hybrid:write-end-shift] auto-deliver error", e);
}
```

**Step 2: Verifikasi**

- Tidak mengubah return value `endShift`
- Wrapped dalam try/catch — gagal auto-deliver tidak boleh mengagalkan tutup shift
- Hanya update `completed`/`paid` + `is_delivered=false` (tidak sentuh pending/cancelled)

---

## Task 4: Build & Typecheck

**Step 1: Typecheck POS app**

```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit
```

**Step 2: Build POS app**

```bash
cd /opt/djiwatentramapp/apps/pos && npm run build
```

---

## 🔗 Integrasi Detail

### Dengan apps/pos
| Data | Hook | Digunakan di |
|------|------|-------------|
| Orders | `useHybridOrders()` | HistoryTab — filter + display |
| End shift | `useHybridEndShift()` | Auto-deliver batch update |

### Dengan apps/web & apps/customer
Tidak ada perubahan — `is_delivered` diabaikan di app lain. Hanya POS kasir yang peduli status antar.

---

## ⚠️ Risiko & Catatan

1. **Optimistic toggle tanpa cache invalidation** — setelah toggle, `useHybridOrders` tidak auto-refresh. Indikator berubah secara visual (optimistic), tapi data asli tetap tersimpan di Supabase. Untuk refresh penuh bisa switch tab.

2. **Batch update bisa besar** — 100+ order dalam 1 shift, tapi `UPDATE WHERE` single pass di PostgreSQL cukup efisien.

3. **process-closing edge function** — edge function ini tidak perlu diubah. Dia hanya handle attendance check-out, bukan tutup shift kasir.

4. **Kolom `is_delivered` tidak ada di TypeScript types** — perlu ditambahkan ke `Doc<"orders">` atau diabaikan (TypeScript akan komplain "does not exist on type"). Solusi: cast `(order as any).is_delivered` atau tambah field ke type definition.

---

## ✅ Verifikasi End-to-End

1. **Migration:** `SELECT is_delivered FROM pos.orders LIMIT 1` — semua existing orders harus `false`
2. **Toggle manual:** Klik "Belum Diantar" → jadi hijau "Sudah Diantar" → refresh → tetap hijau
3. **Auto-deliver:** Tutup shift → cek `SELECT count(*) FROM pos.orders WHERE is_delivered = false` di shift tersebut → harus 0
4. **Shift baru:** Order baru di shift sore → tampil "Belum Diantar" (default false)
