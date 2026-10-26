# Perbaikan UI/UX Halaman `/menu` POS Kasir

> **For Hermes:** Gunakan plan ini task-by-task. UI polish → `patch` langsung (bukan TDD). Verifikasi via `npm run build` + `browser_vision` di viewport 375px.

**Goal:** Perbaiki akurasi stok, kelancaran render, dan kepadatan layout di halaman kasir `/menu` (mobile/tablet touchscreen) tanpa ubah business logic.

**Architecture:** Semua perubahan di 1 file `apps/pos/src/routes/menu.lazy.tsx` (2361 baris) + ekstraksi 2 komponen kecil untuk fix re-render. Tidak ada perubahan schema/API.

**Tech Stack:** React 18 + TanStack Router + Tailwind + Framer Motion (`motion.div`).

**Catatan konteks (penting):** Screenshot user berasal dari **build LAMA** (sebelum commit `aceb271e` "perkecil semua komponen"). Build sekarang SUDAH tidak punya: wide button "MULAI PESANAN", dan footer overlay (thumbnail struk + `+` + chevron). Keduanya sudah diganti floating cart pill + `CartDrawer`. Review ini hanya cover elemen yang MASIH ada di kode sekarang.

---

## Dependency Graph

```
Level 1 (file sama → SEQUENTIAL, 1 file diubah berurutan):
  ├── Task 1: Stock gauge /30            → menu.lazy.tsx L1822-1850
  ├── Task 2: Interval 3s re-render       → menu.lazy.tsx L354-383 (+ ekstrak 2 komponen)
  ├── Task 3: Floating cart pill overlap  → menu.lazy.tsx L1944-1973
  ├── Task 4: Target Bonus collapse       → menu.lazy.tsx L1432
  ├── Task 5: Bottom nav 7→5 + font       → menu.lazy.tsx L1890-1929 (+ SIDEBAR_MENU_ITEMS)
  ├── Task 6: Gambar produk tinggi        → menu.lazy.tsx L1770
  ├── Task 7: Printer badge ke Settings   → menu.lazy.tsx L1372-1375
  ├── Task 8: Stock badge ≤2 → ≤5         → menu.lazy.tsx L1799
  └── Task 9: Hapus "(/)" placeholder      → menu.lazy.tsx L1635

Level 2 (verifikasi):
  └── Build + browser_vision screenshot 375px
```

⚠️ Semua task modifikasi **file yang sama** (`menu.lazy.tsx`) → harus **sequential** (jangan parallel patch file sama). Eksekusi berurutan Task 1→9 lalu build.

---

### Task 1: Stock gauge — hilangkan hardcoded `/30`

**Objective:** Gauge stok tidak lagi tampil 100% palsu untuk item dengan stok >30.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1822-1850`

**Current code (broken):**
```tsx
{(product.quantity ?? 0) >= 0 && (
  <div className="mt-1.5 flex items-center gap-1.5">
    <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden min-w-[20px]">
      <motion.div
        className={cn(
          "h-full rounded-full",
          (product.quantity ?? 0) <= 0 ? "bg-red-500"
          : (product.quantity ?? 0) <= 5 ? "bg-amber-500"
          : "bg-emerald-500"
        )}
        initial={{ width: 0 }}
        animate={{ width: Math.min(100, ((product.quantity ?? 0) / 30) * 100) + "%" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
    <span className={cn("text-[9px] font-bold shrink-0 whitespace-nowrap", ...)}>
      {product.quantity}
    </span>
  </div>
)}
```

**Fix:** Gauge HANYA untuk stok kritis/rendah (≤30). Stok sehat → tampilkan angka emerald tanpa bar (bar penuh untuk stok 100+ itu misleading).
```tsx
{(() => {
  const qty = product.quantity ?? 0;
  const isLow = qty <= 30;
  const barColor = qty <= 0 ? "bg-red-500" : qty <= 5 ? "bg-amber-500" : "bg-emerald-500";
  const numColor = qty <= 0 ? "text-red-500" : qty <= 5 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      {isLow && (
        <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden min-w-[20px]">
          <motion.div
            className={cn("h-full rounded-full", barColor)}
            initial={{ width: 0 }}
            animate={{ width: Math.min(100, (qty / 30) * 100) + "%" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      )}
      <span className={cn("text-[9px] font-bold shrink-0 whitespace-nowrap", isLow ? numColor : "text-emerald-600")}>
        {qty > 30 ? `Stok ${qty}` : qty}
      </span>
    </div>
  );
})()}
```

**Verifikasi:** Stok 21 → "21" emerald tanpa bar penuh. Stok 1 → bar amber + "1". Stok 0 → bar merah + "Habis" (badge sudah handle).

---

### Task 2: Re-render penuh tiap 3 detik → ekstrak komponen lokal

**Objective:** Jam & status printer tidak memicu re-render seluruh grid produk.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:354-383` (hapus setState dari MenuPage) + tambah 2 komponen sebelum `MenuPage`.

**Step 1:** Hapus block interval di `MenuPage` (L353-383), ganti dengan import komponen:
```tsx
// HAPUS seluruh useEffect L353-383 (printer tick + setCurrentTime + setInterval)
// MenuPage tidak lagi pegang state currentTime/isPrinterConnected
```

**Step 2:** Tambah komponen baru (letakkan di bawah import, sebelum `function MenuPage`):
```tsx
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000); // 30s cukup untuk jam
    return () => clearInterval(id);
  }, []);
  return (
    <span className="whitespace-nowrap leading-none">
      {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function PrinterStatusBadge() {
  const [connected, setConnected] = useState(() => bluetoothPrinter.isConnected());
  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const tick = async () => {
      if (checking) return;
      checking = true;
      try {
        if (!bluetoothPrinter.isConnected()) await bluetoothPrinter.autoReconnectIfNeeded();
        if (!cancelled) setConnected(bluetoothPrinter.isConnected());
      } finally { checking = false; }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return (
    <div className={cn("flex flex-nowrap items-center gap-1 px-1.5 py-0.5 rounded-md whitespace-nowrap",
      connected ? "bg-blue-50 text-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.1)]" : "bg-muted text-muted-foreground")}>
      <Printer className="h-3 w-3 shrink-0" />
      <span className="leading-none text-[10px] sm:text-xs font-semibold">{connected ? "Printer Siap" : "Offline"}</span>
    </div>
  );
}
```

**Step 3:** Ganti pemakaian di header (L1367-1375):
```tsx
{/* SEBELUM */}
<div className="flex flex-nowrap items-center gap-1 opacity-75">
  <Clock className="h-3 w-3 shrink-0" />
  <span ...>{currentTime.toLocaleTimeString(...)}</span>
</div>
<div className={cn("flex ...", isPrinterConnected ? ... : ...)}>
  <Printer .../>
  <span ...>{isPrinterConnected ? "Printer Siap" : "Offline"}</span>
</div>

{/* SESUDAH */}
<div className="flex flex-nowrap items-center gap-1 opacity-75">
  <Clock className="h-3 w-3 shrink-0" />
  <HeaderClock />
</div>
<PrinterStatusBadge />
```

**Verifikasi:** Ubah jam sistem → hanya teks jam berubah (grid produk TIDAK re-render). Console: tidak ada lag saat scroll.

---

### Task 3: Floating cart pill tidak bertumpuk bottom-nav

**Objective:** Naikkan posisi pill agar tidak tertutup jari saat tap bottom nav di HP kecil.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1946`

**Current:**
```tsx
<div className="fixed bottom-[5.5rem] left-4 right-4 z-20 px-3 md:hidden">
```

**Fix:**
```tsx
<div className="fixed bottom-[6.75rem] left-4 right-4 z-20 px-3 md:hidden">
```
(Sesuaikan jika tinggi bottom-nav terukur berbeda; target: jarak antar pill & nav ≥ 24px.)

**Verifikasi:** Di viewport 375px, pill "Lihat Keranjang"/"Mulai Pesanan" tidak menutupi ikon bottom-nav DASHBOARD/STOK.

---

### Task 4: Target Bonus default collapse di mobile

**Objective:** Panel bonus tidak makan ~30% viewport sebelum produk terlihat.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1432`

**Current:** `{progress && progress.hasTarget && (... panel penuh ...)}`

**Fix:** Tambah state `isTargetExpanded` default `false` (sudah ada state `isTargetExpanded`? cek — jika belum, tambah `const [isTargetExpanded, setIsTargetExpanded] = useState(false)`). Panel tetap render tapi hanya progress bar + angka; detail tier hanya saat `isTargetExpanded`. Karena detail sudah di-bungkus `AnimatePresence isTargetExpanded`, cukup pastikan default collapsed. Jika saat ini default terbuka, ubah inisialisasi state ke `false`.

**Verifikasi:** Buka `/menu` → panel bonus hanya 2 bar tipis + "Bonus Shift: Rp0". Tap "Detail" → expand.

---

### Task 5: Bottom nav 7 item → 5 + overflow, font naik

**Objective:** Kasir tidak salah tap; label terbaca.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1890-1929` + definisi `SIDEBAR_MENU_ITEMS` (cari di file).

**Current:** 7 item (DASHBOARD/SIMPAN/RIWAYAT/KAS/STOK/CHAT/PENGATURAN), label `text-[9px]`, ikon `h-4 w-4`.

**Fix (pendekatan aman, tanpa ubah array):**
- Naikkan label: `text-[9px]` → `text-[11px]` (L1919), `text-[10px]` → `text-[11px]` (L1922).
- Naikkan ikon: `h-4 w-4` → `h-5 w-5` (L1917).
- Jika ingin 5+overflow: filter `SIDEBAR_MENU_ITEMS` → 5 pertama + item ke-6 "Lainnya" yang buka sheet daftar sisanya. (Lebih besar scope — lakukan hanya jika user setuju.)

**Verifikasi:** Label "DASHBOARD" terbaca jelas di 375px. Tidak ada overflow clip.

---

### Task 6: Gambar produk lebih tinggi

**Objective:** Gambar bubur tidak terpotong di grid 2 kolom.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1770`

**Current:**
```tsx
<div className="relative h-24 sm:h-28 w-full bg-muted shrink-0">
```

**Fix:**
```tsx
<div className="relative h-28 sm:h-32 w-full bg-muted shrink-0">
```

**Verifikasi:** Kartu produk di mobile menampilkan foto makanan utuh, tidak terpotong atas/bawah.

---

### Task 7: Printer badge keluar dari header (ke Settings)

**Objective:** Info teknis tidak makan space header kasir.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1372-1375`

**Current:** badge "Printer Siap/Offline" selalu tampil di header.

**Fix (minimal, rendah risiko):** Sembunyikan saat terhubung, tampilkan hanya saat `Offline` (error state):
```tsx
{!isPrinterConnected && (
  <div className="flex flex-nowrap items-center gap-1 px-1.5 py-0.5 rounded-md whitespace-nowrap bg-muted text-muted-foreground">
    <Printer className="h-3 w-3 shrink-0" />
    <span className="leading-none text-[10px] sm:text-xs font-semibold">Offline</span>
  </div>
)}
```
(NB: setelah Task 2, `isPrinterConnected` tidak ada — ganti pakai `<PrinterStatusBadge />` yang hanya render saat offline, atau biarkan selalu tapi kecil. Pilih: setelah Task 2, modifikasi `PrinterStatusBadge` agar return `null` saat connected.)

**Verifikasi:** Printer connected → tidak ada badge di header. Offline → badge "Offline" muncul.

---

### Task 8: Stock badge threshold ≤2 → ≤5

**Objective:** Konsistensi badge dengan gauge (gauge kuning di ≤5).

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1799`

**Current:**
```tsx
{(product.quantity ?? 0) <= 2 && (
```

**Fix:**
```tsx
{(product.quantity ?? 0) <= 5 && (
```

**Verifikasi:** Stok 3/4/5 → badge "Stok: N" merah/amber muncul (sebelumnya tidak).

---

### Task 9: Hapus "(/)" di placeholder search (mobile)

**Objective:** Hint keyboard tidak relevan untuk touchscreen.

**Files:** Modify `apps/pos/src/routes/menu.lazy.tsx:1635`

**Current:**
```tsx
placeholder="Cari produk... (/)"
```

**Fix:**
```tsx
placeholder="Cari produk..."
```

**Verifikasi:** Input search hanya menampilkan "Cari produk...".

---

## Execution Order & Verification

1. Jalankan Task 1→9 **sequential** (semua di `menu.lazy.tsx`).
2. Build:
   ```bash
   cd /opt/djiwatentramapp/apps/pos && npm run build 2>&1 | tail -20
   ```
   Expected: build success, 0 TS error.
3. Screenshot bukti (jika browser available):
   ```bash
   browser_navigate → pos.djiwatentram.web.id/menu → browser_vision("Cek: gauge stok, jam tidak lag, bottom nav, target bonus")
   ```
   Atau deploy ke VPS lalu cek via browser.
4. Mobile viewport 375px: pastikan tidak ada overflow/clip.

## Risiko

- Task 2 mengubah lifecycle state → pastikan `bluetoothPrinter` masih di-import (cek top file).
- Task 4: pastikan `isTargetExpanded` state ada; jika tidak, tambah.
- Jangan ubah `handleProductClick`, `addToCart`, logic order — hanya visual.

## Tidak Diubah (explicit)

- Business logic order/payment/inventory.
- Struktur `MenuSidebar` (task terpisah, lihat audit lama).
- Warna brand/`themeColor`.
