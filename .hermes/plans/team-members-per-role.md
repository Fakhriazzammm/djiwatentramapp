# Plan: Team Members per Role

## Tujuan
Pisahkan checkbox Tim Bertugas di form Buka Shift menjadi terkelompok per role, dan tampilkan laporan Telegram per role.

---

## Perubahan yang Sudah Dilakukan

### 1. UI Form Buka Shift — Group Checkbox by Role
**File:** `apps/web/src/components/pos/menu-sidebar.tsx`

| Baris | Perubahan |
|-------|-----------|
| 2537 | Tambah `roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Manajer"]` |
| 2537-2577 | Ganti flat list staff → grouped sections dengan header role |

**Sebelumnya:**
```
☐ Andi
☐ Siti
☐ Amir
☐ Dewi
☐ Fakhri
```

**Sesudah:**
```
BARISTA
  ☐ Andi
KITCHEN
  ☐ Siti
KASIR
  ☐ Amir
WAITRESS
  ☐ Dewi
MANAJER
  ☐ Fakhri
```

**Logika grouping:**
- `staffUsers.forEach` → cek `roleName` case-insensitive terhadap `roleOrder`
- Yang cocok → masuk grup sesuai role
- Yang tidak cocok → grup "Lainnya"
- Urutan grup sesuai `roleOrder`

**Data tersimpan:** Tetap `teamMembers.join(", ")` → comma-separated names (backward compatible)

---

### 2. Telegram Report — Per Role
**File:** `apps/web/src/components/pos/menu-sidebar.tsx`

| Baris | Perubahan |
|-------|-----------|
| 1041 | Tambah `const allStaffUsers = useHybridStaffUsers()` di `DashboardTab` |
| 1237-1259 | Ganti `teamLabel` flat → per-role formatting |
| 1316 | Tambah `allStaffUsers` ke dependency array `useMemo` |

**Sebelumnya:**
```
Kasir: Ayunda
Tim: Andi, Siti, Amir, Fakhri
```

**Sesudah:**
```
Kasir: Ayunda
Barista: Andi
Kitchen: Siti
Kasir: Amir
Manajer: Fakhri
```

**Logika formatting:**
1. Parse `shiftObj.teamMembers` (comma-separated names)
2. Lookup setiap nama di `allStaffUsers` untuk dapat `roleName`
3. Group by role
4. Sort roles sesuai `roleOrder`
5. Format: `"Role: Nama1, Nama2"`
6. Fallback: jika `allStaffUsers` belum siap, tampil `Tim: ...` (lama)

---

## Data Flow

```
User centang staff (grouped by role)
    ↓
teamMembers.join(", ") → "Andi, Siti, Amir, Fakhri"
    ↓
DB (shifts.team_members) → comma-separated names
    ↓
Laporan Telegram → lookup role dari allStaffUsers → per-role output
```

## Backward Compatibility

| Bagian | Status | Keterangan |
|--------|--------|------------|
| DB schema | ✅ Aman | `team_members` tetap TEXT, format nama saja |
| Display lain (`shift-report.tsx`, `export-utils.ts`, `home.lazy.tsx`) | ✅ Aman | Tampilkan raw text (nama saja) |
| `menu.lazy.tsx` (on-duty member lookup) | ✅ Aman | Split by comma + lookup by name |
| Telegram report | ✅ Diubah | Jadi per role |
| AI agents (`yumi-ai-bot`, `yumi-supervisor-agent`, `yumi-finance-agent`) | ✅ Aman | Baca `team_members` sebagai context |

## File yang Diubah

Hanya 1 file: **`apps/web/src/components/pos/menu-sidebar.tsx`**

## Catatan

- Tidak ada migration database
- Data shift lama tetap kompatibel (nama aja, tanpa role)
- Kalau user staff berganti role, laporan otomatis mengikuti karena lookup by name ke `allStaffUsers`
