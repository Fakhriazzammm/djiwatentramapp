# Plan: Sistem Harga Online Order (GrabFood, GoFood, Maxim, ShopeeFood)

## Goal
Tambahkan sistem di `/menu` sidebar checkout untuk menangani order online dari platform aggregator (GrabFood, GoFood, Maxim, ShopeeFood) dengan harga yang berbeda dari menu — karena platform menerapkan diskon/potongan/komisi.

**Target:** Kasir bisa:
1. Pilih platform asal order (GrabFood / GoFood / Maxim / ShopeeFood)
2. Override harga per-item sesuai harga di aplikasi platform
3. Lihat otomatis: total platform, komisi, pendapatan bersih
4. Order tersimpan dengan metadata platform untuk laporan

---

## Current Context

### Yang sudah ada
- **TIPE ORDER** di checkout sidebar: Dine In, Takeaway, Online (baru difix)
- **CartItem** interface: `{productId, name, price, originalPrice, quantity, variant, ...}`
- **customerInfo**: `{name, orderType, tableNumber, notes, isFreeRefill}`
- **pos.orders insert**: sudah ada `order_type`, `source`; items punya `price`, `original_price`
- **Default orderTypes** di `fetchSiteSettings()`: dine_in, takeaway, online

### Yang belum ada
- Tidak ada field `platform` di orders atau items
- Tidak ada mekanisme price override per-item di cart
- Tidak ada pengaturan komisi per platform
- Tidak ada tampilan ringkasan platform di checkout

---

## Proposed Approach

### Strategi: Minimal Change, Max Impact
Tidak bikin sistem terpisah. Semua tetap di flow checkout yang sama, hanya ditambah:

1. **Step CUSTOMER**: Ketika `orderType === "online"`, muncul dropdown platform
2. **Step MENU**: Per-item ada tombol ✏️ untuk override harga
3. **Step PAYMENT**: Ringkasan menampilkan rincian platform + komisi

### Kenapa tidak bikin flow terpisah?
- Flow sama (Customer → Menu → Payment), hanya beda di detail
- Menghindari duplikasi kode checkout
- Lebih mudah di-maintain

---

## Step-by-Step Plan

### Step 1: Extend CartContext & customerInfo

**File:** `apps/web/src/context/cart-context.tsx`

Tambahkan ke `customerInfo`:
```ts
platform?: string;        // "grab" | "gofood" | "maxim" | "shopeefood"
platformCommission?: number; // persentase komisi (dari settings)
```

Tambahkan ke `CartItem`:
```ts
platformPrice?: number;   // harga override dari platform (null = pakai price biasa)
```

Tambahkan `updateItemPrice` function ke context untuk override harga per-item.

### Step 2: Extend Default Order Types

**File:** `apps/web/src/hooks/use-hybrid-pos-data.ts`

Tambahkan `platforms` ke `DEFAULT_ORDER_TYPES` atau buat `DEFAULT_PLATFORMS`:
```ts
const DEFAULT_PLATFORMS = [
  { id: "grab", name: "GrabFood", icon: "Bike", commissionRate: 0.20, isActive: true },
  { id: "gofood", name: "GoFood", icon: "Bike", commissionRate: 0.20, isActive: true },
  { id: "maxim", name: "Maxim", icon: "Bike", commissionRate: 0.15, isActive: true },
  { id: "shopeefood", name: "ShopeeFood", icon: "ShoppingBag", commissionRate: 0.20, isActive: true },
];
```

Spread ke `siteSettings` return value agar bisa diakses di checkout.

### Step 3: UI — Platform Selector (Step CUSTOMER)

**File:** `apps/web/src/components/pos/checkout-sidebar.tsx`

Di bawah TIPE ORDER, tambah conditional render:
```tsx
{selectedOrderType?.id === "online" && (
  <div className="space-y-1.5">
    <Label>Platform</Label>
    <div className="grid grid-cols-2 gap-1 ...">
      {platforms.map((p) => (
        <button 
          key={p.id}
          onClick={() => updateCustomerInfo({ platform: p.id, platformCommission: p.commissionRate })}
          className={customerInfo.platform === p.id ? "active" : ""}
        >
          <Icon /> {p.name}
        </button>
      ))}
    </div>
  </div>
)}
```

### Step 4: UI — Price Input Saat Add-to-Cart (bukan edit after add)

**File:** `apps/web/src/routes/menu.lazy.tsx` (add-to-cart handler)  
**File:** `apps/web/src/components/pos/checkout-sidebar.tsx` (cart item display)

**UX flow:** Ketika `orderType === "online"` dan kasir tap menu item, jangan langsung `addToCart`. Tampilkan **inline mini-dialog** dengan input harga pre-filled dengan harga menu. Kasir bisa langsung sesuaikan harga sesuai aplikasi platform, lalu tap "Tambah".

```tsx
// Di handleProductClick (menu.lazy.tsx ~line 707)
if (customerInfo.orderType === "online") {
  // Tampilkan dialog kecil: "Harga di GrabFood/GoFood?"
  setPriceDialogProduct({
    product,
    defaultPrice: pricing.finalPrice,
  });
  return; // tunda addToCart
}

// Component PriceDialog yang muncul inline
<PriceDialog
  product={product}
  label={`Harga di ${platformName}`}
  defaultValue={product.price}
  onConfirm={(customPrice) => {
    addToCart({
      ...item,
      price: customPrice,           // harga platform = harga yang dipakai di cart
      originalPrice: product.price,  // harga menu asli
      platformPrice: customPrice,
    });
    setPriceDialogProduct(null);
  }}
  onCancel={() => setPriceDialogProduct(null)}
/>
```

**Di cart display (checkout sidebar)** — tidak berubah banyak, hanya label harga:
```tsx
// Item di step MENU
<p className="text-[11px] font-bold">
  {fmt(item.price * item.quantity)}
</p>
{item.originalPrice && item.originalPrice !== item.price && (
  <p className="text-[9px] text-muted-foreground line-through">
    Menu: {fmt(item.originalPrice)}
  </p>
)}
```

**Kenapa lebih baik dari edit-after-add:**
- 1 klik per item (bukan 2: add → edit)
- Harga langsung benar dari awal
- Tidak ada mode "edit" terpisah di checkout sidebar
- Natural: "menu ini harganya berapa di app?" → input → done

### Step 5: UI — Ringkasan Platform (Step PAYMENT)

**File:** `apps/web/src/components/pos/checkout-sidebar.tsx`

Di step PAYMENT, sebelum total, tambah section khusus online:
```tsx
{customerInfo.orderType === "online" && (
  <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3">
    <div className="flex justify-between text-xs">
      <span>Total Platform (harga aplikasi)</span>
      <span className="font-bold">{fmt(platformTotal)}</span>
    </div>
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>Komisi ({platformName} {commissionRate}%)</span>
      <span>-{fmt(commissionAmount)}</span>
    </div>
    <Separator />
    <div className="flex justify-between text-sm font-black text-green-700">
      <span>Pendapatan Bersih</span>
      <span>{fmt(netRevenue)}</span>
    </div>
  </div>
)}
```

### Step 6: Pass Platform Data ke Order Insert

**File:** `apps/web/src/hooks/use-hybrid-write-actions.ts`

Di function create order:
1. Tambah `platform` ke `orderRow.raw` dan ke `pos.orders` insert
2. Di `orderItems.map()`, tambah `platform_price` dari `item.platformPrice`
3. Simpan commission rate di order raw

```ts
// di orderRow
platform: customerInfo.platform ?? null,
platform_commission_rate: customerInfo.platformCommission ?? null,

// di orderItems map
platform_price: item?.platformPrice ?? null,
```

### Step 7: Update Total Kalkulasi

**File:** `apps/web/src/context/cart-context.tsx`

Pastikan `platformTotal`, `commissionAmount`, `netRevenue` dihitung:
```ts
// Derived values
const platformTotal = items.reduce((sum, i) => sum + (i.platformPrice ?? i.price) * i.quantity, 0);
const commissionAmount = Math.round(platformTotal * (customerInfo.platformCommission || 0));
const netTotal = finalTotal; // tetap pakai harga asli untuk keuangan internal
```

### Step 8: Settings Page — Platform Management (bonus / opsional)

**File:** `apps/web/src/routes/admin/settings.lazy.tsx`

Tambahkan section "Platform Online" di tab yang sesuai:
- List platform dengan toggle on/off
- Edit nama, commission rate, icon
- Sama seperti section Tipe Pesanan yang sudah ada

Disimpan di `pos_site_settings.raw.platforms`.

---

## Files Likely to Change

| File | Perubahan | Kompleksitas |
|---|---|---|
| `cart-context.tsx` | +platform, +platformPrice di customerInfo & CartItem | Medium |
| `menu.lazy.tsx` | +PriceDialog component, intercept addToCart untuk online | High |
| `checkout-sidebar.tsx` | +platform selector, +tampilan harga dicoret, +ringkasan | Medium |
| `use-hybrid-pos-data.ts` | +DEFAULT_PLATFORMS | Low |
| `use-hybrid-write-actions.ts` | +platform fields di insert | Low |
| `settings.lazy.tsx` | +platform management section (opsional) | Medium |

Tidak ada perubahan database yang wajib — semua data platform disimpan di `raw` JSONB yang sudah ada di `pos_site_settings` dan `pos.orders`.

---

## UI/UX Flow (skenario real)

### Kasus: Customer order GoFood 2 item

1. Kasir buka `/menu`
2. Klik **Checkout** → sidebar muncul
3. **Step CUSTOMER**:
   - Nama: "Budi GoFood"
   - TIPE ORDER: klik **🚴 Online** 
   - Muncul **PLATFORM**: klik **GoFood** (20%)
   - No. Meja: (hilang, karena online tidak perlu)
   - Klik "Lanjut Pilih Menu" →
4. **Pilih menu langsung dengan harga custom**:
   - Tap "Es Kopi Susu" di katalog → muncul mini dialog:
     ```
     Harga di GoFood?
     ┌─────────────────────┐
     │ Rp [ 22.000 ]       │
     │ Menu: Rp 25.000     │
     └─────────────────────┘
         [Batal]  [Tambah ✓]
     ```
   - Ketik 22000 → tap Tambah → masuk keranjang
   - Tap "Nasi Goreng" → input 27000 → Tambah
5. **Step MENU** (auto setelah ada item):
   - Es Kopi Susu: Rp 22.000 (~~Rp 25.000~~)
   - Nasi Goreng: Rp 27.000 (~~Rp 30.000~~)
   - Total: Rp 49.000
6. **Step PAYMENT**:
   - Box ringkasan:
     ```
     🟠 Total Platform (GoFood):    Rp 49.000
        Komisi GoFood (20%):       -Rp  9.800
        ─────────────────────────────────
     🟢 Pendapatan Bersih:          Rp 39.200
     ```
7. Tap **Bayar** → order tersimpan dengan metadata platform

---

## Tests / Validation

- [ ] Pilih "Online" → platform selector muncul
- [ ] Pilih platform → commission rate terisi
- [ ] Tap menu item saat Online → muncul dialog input harga (pre-filled menu price)
- [ ] Ubah harga di dialog → item masuk cart dengan harga custom
- [ ] Cart display menunjukkan harga menu dicoret + harga platform
- [ ] Tap "Tambah" di dialog → item benar di cart
- [ ] Tap "Batal" → tidak jadi add
- [ ] Ringkasan platform muncul di step PAYMENT
- [ ] Komisi dihitung benar (platform total × rate)
- [ ] Data tersimpan di orders dengan field platform
- [ ] Dine In / Takeaway tidak terpengaruh (tetap add-to-cart langsung)
- [ ] No. Meja hilang saat orderType = online

---

## Risks, Tradeoffs, Open Questions

### Risks
- **Price override rawan human error**: kasir salah input harga → keuangan kacau. **Mitigasi**: tampilkan selisih harga dengan warna (merah jika di bawah menu price > 30%)
- **Komisi rate bisa berubah**: platform suka ubah rate. **Mitigasi**: simpan rate saat order dibuat (snapshot), bukan refer ke settings live

### Tradeoffs
- **Simpan di `raw` JSONB vs proper column**: `raw` lebih cepat implementasi, tapi reporting butuh query JSON. **Keputusan**: pakai `raw` dulu, later migration kalau reporting sudah perlu.
- **Flow terpisah vs campur di checkout existing**: Campur lebih sedikit kode, tapi checkout jadi lebih kompleks. **Keputusan**: campur dengan conditional render (sudah terbukti workable).

### Open Questions
1. **Apakah harga di POS harus tetap harga menu?** → IYA. Harga menu = harga dasar. Platform price = override yang hanya muncul di online order. Keuangan internal pakai harga menu.
2. **Apakah perlu tracking per-platform di laporan?** → Belum. Simpan data dulu di raw, laporan menyusul.
3. **Apakah online order perlu auto-deduct inventory?** → Tidak berbeda dari order biasa. Sistem auto-deduct yang sudah ada tetap jalan.

---

## Estimasi
- **Total effort**: ~4-6 jam development
- **File berubah**: 5 files
- **Zero DB migration** (semua di JSONB raw)
- **Zero breaking change** untuk flow Dine In / Takeaway
