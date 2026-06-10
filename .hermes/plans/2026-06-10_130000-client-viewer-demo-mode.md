# Plan: Client Viewer Demo Mode — Mask Angka untuk Presentasi Client

## Goal

Buat role khusus **`CLIENT_VIEWER`** yang bisa login ke `apps/pos`, `apps/karyawan`, `apps/customer` untuk melihat flow & layout aplikasi — tapi **semua angka sensitif di-hide** (diganti •••) sehingga aman ditunjukkan ke calon client.

---

## Current Context

### Role System (Existing)
Ada 7 roles di `yumi_roles`:
```
ADMIN, MANAGER, OWNER, KASIR, BARISTA, CHEF, WAITERS
```
Permissions berupa JSONB array (e.g. `["orders:view", "finance:view"]`).
`isAdmin` = `role.name.toLowerCase() === "admin"` — bypasses all permission checks.

### Session Flow
- PIN login → `yumi-auth` Edge Function → `yumi_sessions` token
- `useYumiAuth` hook → `{ user, role, isAdmin, isStaff }`
- Role name & permissions available di session untuk guarding

### Number Display Pattern
- **TIDAK ada centralized formatter** — setiap file punya `fmt()` function sendiri:
  ```ts
  const fmt = (n: number) => n.toLocaleString("id-ID");
  ```
- Juga banyak inline `toLocaleString("id-ID")`, template literal `Rp ${x}`
- Data ditampilkan dari: `pos_orders` view, `pos_products`, `pos_inventory`, `pos_payroll`, dll.

### Apps yang Perlu Support
| App | Route | Auth |
|-----|-------|------|
| `apps/pos` | PIN login (kasir/admin) | `useYumiAuth` |
| `apps/karyawan` | PIN login | `useYumiAuth` |
| `apps/customer` | Email/password (Supabase Auth) | `useCustomerAuth` |

---

## Proposed Approach: 3-Layer Masking Strategy

```
Layer 1 (Foundation):        Shared fmt() → "•••" di demo mode
Layer 2 (Safety Net):        CSS filter: blur() via [data-mask] attributes  
Layer 3 (Targeted):          <MaskedValue /> component untuk edge cases
```

Kenapa 3 layer? Karena:
- **Layer 1** mengganti nilai asli (paling aman — data tidak bocor ke DOM)
- **Layer 2** nangkep yg terlewat (visual blur, gak perlu edit semua component)
- **Layer 3** untuk kasus complex (grafik, charts, progress bar)

---

## Step-by-Step Plan

### Phase 1: Database & Role

#### Step 1.1 — Migration: Insert CLIENT_VIEWER role
```sql
INSERT INTO yumi_roles (source_id, name, permissions, raw)
VALUES (
  gen_random_uuid()::text,
  'CLIENT_VIEWER',
  '["orders:view", "menu:view", "products:view", "kitchen:view", "pos:access"]',
  '{}'
);
```
**File:** `supabase/migrations/20260610000001_add_client_viewer_role.sql`

Permissions minimal — view-only. Tidak ada `finance:view`, `users:manage`, `settings:manage`, `inventory:manage`.

#### Step 1.2 — Create demo user (manual / via Edge Function)
Buat user `yumi_users` dengan `role_source_id`指向 `CLIENT_VIEWER`.
Bisa via admin panel registrasi yang sudah ada — pilih role `CLIENT_VIEWER`.

---

### Phase 2: Shared Package — Demo Mode Infrastructure

#### Step 2.1 — `useDemoMode` hook
**File Baru:** `packages/yumipos-web-shared/src/hooks/useDemoMode.ts`

```ts
// Detect dari role user — apakah CLIENT_VIEWER
export function useDemoMode() {
  const { role } = useYumiAuth();
  const isDemoViewer = role?.name === "CLIENT_VIEWER";
  return { isDemoViewer };
}
```

Untuk `apps/customer` (pakai `useCustomerAuth`), perlu flag serupa — bisa via `raw` JSONB atau kolom spesifik di `pos.customers`.

#### Step 2.2 — Centralized `fmt()` function
**File Baru:** `packages/yumipos-web-shared/src/lib/utils/demo-mask.ts`

```ts
// Hooked version — reactive, butuh context
let _isDemoMode = false;
export function setDemoMode(v: boolean) { _isDemoMode = v; }
export function getDemoMode() { return _isDemoMode; }

// Angka → "•••" kalau demo
export function fmt(n: number | null | undefined, opts?: { prefix?: string; suffix?: string }): string {
  if (_isDemoMode) return opts?.prefix ? `${opts.prefix} •••` : "•••";
  if (n == null) return "-";
  const formatted = n.toLocaleString("id-ID");
  return `${opts?.prefix || ""}${formatted}${opts?.suffix || ""}`;
}

// Untuk string yang mengandung angka
export function maskNumbersInText(text: string): string {
  if (!_isDemoMode) return text;
  return text.replace(/\d+/g, "•••");
}
```

#### Step 2.3 — `DemoModeProvider` context
**File Baru:** `packages/yumipos-web-shared/src/context/demo-mode-context.tsx`

```tsx
<DemoModeProvider>
  // Listen to role changes → setDemoMode()
  // Add .demo-mode class to <html>
  {children}
</DemoModeProvider>
```

**Export dari barrel:** `packages/yumipos-web-shared/src/index.ts`
```ts
export * from "./hooks/useDemoMode";
export * from "./context/demo-mode-context";
export { fmt, maskNumbersInText, setDemoMode } from "./lib/utils/demo-mask";
```

---

### Phase 3: CSS Safety Net

#### Step 3.1 — Global CSS
**File:** `apps/pos/src/index.css`, `apps/karyawan/src/index.css`, `apps/customer/src/index.css`

```css
/* Safety net — blur semua element bertanda [data-mask] */
.demo-mode [data-mask] {
  filter: blur(6px);
  user-select: none;
  pointer-events: none;
}

/* Graceful degradation — kalau blur didisable */
.demo-mode .price-value,
.demo-mode .amount-value,
.demo-mode .stat-value {
  filter: blur(6px);
}
```

#### Step 3.2 — Data-mask attributes di komponen utama
Tambahkan `data-mask` ke elemen yang menampilkan angka sensitif di komponen-komponen utama:

| Komponen | Lokasi | Attribute |
|----------|--------|-----------|
| Menu card (harga) | `menu.lazy.tsx` | `<span data-mask>Rp {fmt(price)}</span>` |
| Cart item (subtotal) | `cart-drawer.tsx` | `<span data-mask>...` |
| Checkout total | `checkout-sidebar.tsx` | `<span data-mask>...` |
| Dashboard stats | `dashboard.lazy.tsx` | `<span data-mask>...` |
| Order card | `home.$section.lazy.tsx` | `<span data-mask>...` |
| Inventory stock | inventory pages | `<span data-mask>...` |
| Payroll amounts | payroll pages | `<span data-mask>...` |
| Attendance stats | attendance pages | `<span data-mask>...` |
| Finance reports | finance pages | `<span data-mask>...` |

**Prioritas implementasi:** Menu > POS flow (cart/checkout) > Dashboard > Payroll/Finance

---

### Phase 4: Per-App Integration

#### Step 4.1 — apps/pos `__root.tsx`
```tsx
function RootContent() {
  const { user, role } = useYumiAuth();
  const isDemoViewer = role?.name === "CLIENT_VIEWER";
  
  useEffect(() => {
    if (isDemoViewer) {
      document.documentElement.classList.add("demo-mode");
      setDemoMode(true);
    } else {
      document.documentElement.classList.remove("demo-mode");
      setDemoMode(false);
    }
  }, [isDemoViewer]);

  return <Outlet />;
}
```

#### Step 4.2 — apps/karyawan `__root.tsx`
Sama seperti apps/pos — deteksi `CLIENT_VIEWER` → `.demo-mode` class.

#### Step 4.3 — apps/customer `__root.tsx`
`apps/customer` pakai `useCustomerAuth`, bukan `useYumiAuth`. Opsi:
- Opsi A: Tambah field `role: "CLIENT_VIEWER"` di `pos.customers.raw` untuk customer tertentu
- Opsi B: Skip customer app — hanya pos + karyawan (client lihat flow pesanan via POS)

---

### Phase 5: Component-Level Masking (Layer 3)

#### Step 5.1 — `<MaskedValue />` component
**File Baru:** `packages/yumipos-web-shared/src/components/ui/masked-value.tsx`

```tsx
<MaskedValue value={15000} prefix="Rp" />
// Demo: "Rp •••"
// Normal: "Rp 15.000"

<MaskedValue value={120} suffix=" pcs" />
// Demo: "••• pcs"  
// Normal: "120 pcs"

<MaskedValue value={5000000} format="currency" />
// Demo: "Rp •••"
// Normal: "Rp 5.000.000"
```

#### Step 5.2 — Replace di komponen kritis
Gunakan `MaskedValue` sebagai pengganti `fmt()` lokal di:
1. Menu product price card (paling visible)
2. Order total & subtotal (checkout flow)
3. Dashboard revenue & stats
4. Payroll salary amounts
5. Stock/inventory counts

---

## Files Likely to Change

### Database
| File | Change |
|------|--------|
| `supabase/migrations/20260610000001_add_client_viewer_role.sql` | **NEW** — Insert CLIENT_VIEWER role |

### Shared Package
| File | Change |
|------|--------|
| `packages/yumipos-web-shared/src/hooks/useDemoMode.ts` | **NEW** — demo mode hook |
| `packages/yumipos-web-shared/src/context/demo-mode-context.tsx` | **NEW** — DemoModeProvider |
| `packages/yumipos-web-shared/src/lib/utils/demo-mask.ts` | **NEW** — fmt(), maskNumbersInText(), setDemoMode() |
| `packages/yumipos-web-shared/src/components/ui/masked-value.tsx` | **NEW** — MaskedValue component |
| `packages/yumipos-web-shared/src/index.ts` | **EDIT** — export baru |

### apps/pos
| File | Change |
|------|--------|
| `apps/pos/src/routes/__root.tsx` | **EDIT** — detect CLIENT_VIEWER, add .demo-mode, setDemoMode |
| `apps/pos/src/index.css` | **EDIT** — .demo-mode CSS rules |
| `apps/pos/src/routes/menu.lazy.tsx` | **EDIT** — ganti fmt() ke shared, tambah data-mask |
| `apps/pos/src/routes/home.$section.lazy.tsx` | **EDIT** — masking untuk order list |
| `apps/pos/src/routes/dashboard.lazy.tsx` | **EDIT** — masking statistik |

### apps/karyawan
| File | Change |
|------|--------|
| `apps/karyawan/src/routes/__root.tsx` | **EDIT** — detect CLIENT_VIEWER |
| `apps/karyawan/src/index.css` | **EDIT** — .demo-mode CSS |
| `apps/karyawan/src/routes/$username/profil.lazy.tsx` | **EDIT** — masking gaji & stats |

### apps/customer (opsional)
| File | Change |
|------|--------|
| `apps/customer/src/routes/__root.tsx` | **EDIT** — jika support demo customer |
| `apps/customer/src/index.css` | **EDIT** — .demo-mode CSS |
| `apps/customer/src/routes/order.lazy.tsx` | **EDIT** — masking harga menu |

---

## Verification

### Build Check
```bash
cd /opt/djiwatentramapp && npx turbo build --filter=@yumipos/pos --filter=@yumipos/karyawan
```

### Manual Test Flow
1. Login sebagai user dengan role `CLIENT_VIEWER`
2. Cek menu POS — harga tidak terlihat (•••)
3. Buat order — total tidak terlihat
4. Cek dashboard — angka statistik ter-mask
5. Cek karyawan profil — gaji tidak terlihat
6. Cek customer app (jika disupport) — harga menu ter-mask

### Edge Function Deploy
```bash
npx supabase functions deploy yumi-auth  # jika ada perubahan session
```

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Ada angka yang terlewat (tidak termasking) | Layer 2 CSS blur safety net + iterasi berdasarkan feedback |
| Demo user bisa akses data via API langsung | CLIENT_VIEWER hanya punya permission view minimal — tidak ada `finance:view`, `users:manage` |
| CSS blur bisa di-inspect via DevTools | Layer 1 fmt() sudah ganti nilai di JavaScript — data asli tidak ada di DOM |
| User bingung karena semua angka hilang | Tambah tooltip/badge kecil "Mode Demo — Data Hanya Contoh" |
| Performance impact dari DOM scanning | Tidak ada DOM scanning — murni CSS + conditional rendering |
| Build error karena dependency cycle | DemoModeProvider import useYumiAuth — pastikan tidak circular |

---

## Open Questions

1. **Customer app** — Perlu demo mode di apps/customer juga? Atau cukup POS + Karyawan?
2. **Grafik & Charts** — Yang pakai Chart.js / Recharts perlu ditangani khusus — filter datanya atau ganti dummy?
3. **User creation** — Mau bikin user CLIENT_VIEWER via admin panel langsung, atau via script?
4. **Label "Mode Demo"** — Mau ditambah banner "Mode Demo" di atas aplikasi?
