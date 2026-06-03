# Warna Shift & Selected State Kalender PRIBADI — UI/UX Fix

> **File target:** `packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx`

**Goal:** Samakan tampilan kalender PRIBADI + card detail dengan referensi screenshot — tanggal shift tampil filled circle hijau/biru, tanggal terpilih tampil outline warna shift (bukan filled), card detail tanpa dot.

**Referensi visual (dari screenshot user):**
- Tanggal **tidak terpilih + ada shift** → filled circle warna shift (contoh: hijau untuk PAGI)
- Tanggal **terpilih + ada shift** → outline/border warna shift (contoh: biru untuk SORE, angka putih di dalam)
- Tanggal **terpilih + tidak ada shift** → outline biru netral
- Tanggal **tidak ada shift** → teks tipis transparan (tetap)
- Card detail: angka besar kiri, "Shift {nama}" warna shift bold + jam HH:mm di kanan (tanpa dot)

---

## Task 1: Update Calendar Day Cell — Selected vs Unselected State

**Objective:** Bedakan tampilan tanggal terpilih vs tidak terpilih sesuai referensi.

**File:** `packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx:755-782`

### Step 1: Ganti logika rendering button day cell

**Current logic (lines 755-782):**
- `hasSchedule && colors` → selalu `rounded-full bg-[shift] text-white` (filled circle)
- Selected ditandai via `boxShadow: "0 0 0 2px #3b82f6"` (blue ring)
- `!hasSchedule` → faint/transparent

**New logic:**

```tsx
{days.map((d: any) => {
  const colors = d.shiftLabel ? SHIFT_THEME[d.shiftLabel] : null;
  const isSelected = selectedDay === d.day;
  const isTodayFlag = d.isToday;
  
  return (
    <button
      key={d.day}
      type="button"
      onClick={() => setSelectedDay(d.day)}
      style={{ ...CELL_STYLE }}
      className={cn(
        // Base: always show pointer, no opacity on no-schedule unless !selected
        isSelected
          ? ""
          : d.hasSchedule && colors
            ? "hover:opacity-80"
            : "opacity-40 hover:bg-muted/50"
      )}
    >
      {isSelected ? (
        /* ── Selected State ── */
        d.hasSchedule && colors ? (
          /* Selected + has shift → outline in shift color */
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-bold leading-none",
              colors.text,
              "border-2",
              colors.dot.replace("bg-", "border-")
            )}
          >
            {d.day}
          </span>
        ) : (
          /* Selected + no shift → blue outline */
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-bold leading-none text-blue-500 border-2 border-blue-400">
            {d.day}
          </span>
        )
      ) : (
        /* ── Unselected State ── */
        d.hasSchedule && colors ? (
          /* Has shift → filled circle */
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold leading-none text-white",
              colors.badge.split(" ")[0]
            )}
          >
            {d.day}
          </span>
        ) : (
          /* No shift → faint */
          <span
            className="text-[11px] font-bold leading-none"
            style={{ color: isTodayFlag ? "#3b82f6" : undefined }}
          >
            {d.day}
          </span>
        )
      )}
    </button>
  );
})}
```

**Key changes:**
- `isSelected` → selalu render dengan `rounded-[7px]` (sedikit rounded, seperti referensi)
  - Jika ada shift → teks warna shift + border-2 warna shift
  - Jika tidak ada shift → teks biru + border-2 biru
- `!isSelected + hasSchedule` → filled circle bg warna shift (tetap)
- `!isSelected + !hasSchedule` → faded (tetap)
- Hapus `boxShadow` ring — selected state sekarang pakai border, bukan shadow
- Gunakan `colors.dot.replace("bg-", "border-")` untuk mendapatkan warna border dari token dot

**Note on `colors.dot`:** Dot tokens adalah `bg-emerald-500`, `bg-sky-600`, dll. Replace `bg-` dengan `border-` memberi `border-emerald-500` — warna border yang match dengan dot.

Jika `colors.dot` = `bg-sky-600`, maka `border-sky-600`. Tapi referensi pakai `border-sky-500` (lebih terang untuk outline). Alternatif: pakai `colors.accent.split(" ")[0].replace("text-", "border-")`.

**Lebih baik:** Token baru `ring` di SHIFT_THEME:
```tsx
ring: "border-emerald-500",
```
tapi itu perlu nambahin 4 baris. Alternatif paling aman: mapping manual.

**Approved approach:** Make `colors.text` (misal `text-sky-700`) jadi `text-sky-700 border-sky-300/70` atau hardcode sementara:
```tsx
// Selected + has schedule
const borderColor = colors.dot.replace("bg-", "border-"); // "bg-sky-600" → "border-sky-600"
// Tapi untuk outline lebih enak versi 300-an
// Mapping: emerald-500 → emerald-300, sky-600 → sky-400, amber-500 → amber-300, slate-400 → slate-300
// Pakai colors.dot langsung dan opacity
```
**Praktis:** `border-${colors.dot.replace("bg-", "")}/60` — contoh `bg-sky-600` → `border-sky-600/60`. Ini memberi transparansi 60% sehingga outline tidak terlalu tebal.

Wait, Tailwind arbitrary value `border-sky-600/60` butuh di JIT mode. Di Vite + Tailwind v4 harusnya jalan.

Oke, pendekatan final:

```tsx
/* Selected + has shift */
<span className={cn("flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-bold leading-none", colors.text, "border-2", colors.dot.replace("bg-", "border-"))}>
```

Untuk `colors.dot = "bg-sky-600"`, hasilnya `border-sky-600`. Warna border solid cocok dengan referensi.

--- 

## Task 2: Bersihkan Detail Card — Hapus Dot, Perbesar Shift Label

**Objective:** Card detail tanggal terpilih sesuai referensi — tanpa dot kecil, shift name dalam warna bold.

**File:** `packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx:789-833`

### Step 1: Ubah card detail

**Old code (lines 806-828):**
```tsx
<div className="h-6 w-px bg-border/60" />
{selectedDayData.schedule ? (
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5">
      <div
        className={SHIFT_THEME[selectedDayData.shiftLabel]?.dot ?? "bg-muted"}
        style={{ width: "8px", height: "8px", borderRadius: "50%" }}
      />
      <span
        className={cn(
          "text-xs font-bold",
          SHIFT_THEME[selectedDayData.shiftLabel]?.text ?? "text-foreground"
        )}
      >
        Shift {selectedDayData.shiftLabel}
      </span>
    </div>
    {selectedDayData.schedule.startTime && (
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {selectedDayData.schedule.startTime}
        {selectedDayData.schedule.endTime ? ` – ${selectedDayData.schedule.endTime}` : ""}
      </p>
    )}
  </div>
) : (
  <p className="text-[11px] text-muted-foreground font-medium">Tidak ada jadwal</p>
)}
```

**New code:**
```tsx
{selectedDayData.schedule ? (
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "text-sm font-black tracking-tight",
          SHIFT_THEME[selectedDayData.shiftLabel]?.accent ?? "text-foreground"
        )}
      >
        Shift {selectedDayData.shiftLabel}
      </span>
    </div>
    {selectedDayData.schedule.startTime && (
      <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
        {selectedDayData.schedule.startTime.slice(0, 5)}
        {selectedDayData.schedule.endTime ? ` – ${selectedDayData.schedule.endTime.slice(0, 5)}` : ""}
      </p>
    )}
  </div>
) : (
  <p className="text-[11px] text-muted-foreground font-medium">Tidak ada jadwal</p>
)}
```

**Changes:**
- Hapus `<div className="h-6 w-px bg-border/60" />` — ganti padding jadi `px-3.5`
- Hapus dot element (`h-2 w-2 rounded-full`)
- Perbesar shift label ke `text-sm font-black` pakai `accent` (warna teks shift: `text-emerald-600`, `text-sky-600`, dll)
- Format jam pake `slice(0, 5)` untuk buang detik → `HH:mm`
- Perbesar font jam ke `text-[11px] font-semibold`

---

## Task 3: Update Container Card Detail

**Objective:** Sesuaikan padding dan layout card.

**File:** `packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx:789-833`

### Step 1: Update container

Old container:
```tsx
<div className={cn("rounded-xl border px-3 py-2 flex items-center gap-3", ...)}>
```

New container (lebih premium, padding lebih lega):
```tsx
<div className={cn("rounded-xl border px-3.5 py-3 flex items-center gap-3.5", ...)}>
```

Dan hapus divider line:
Hapus baris: `<div className="h-6 w-px bg-border/60" />` (sudah di task 2)

---

## Task 4: Perbaiki Legend

**Objective:** Legend tetap sederhana, pakai circle kecil.

**File:** `packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx:836-843`

Legend saat ini sudah ok — biarkan saja. Tidak perlu diubah.

---

## Task 5: Verifikasi Team Tab — 4 Card Horizontal

**Objective:** Pastikan 4 kartu statistik di tab TIM selalu horizontal.

**File:** `packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx:502-525`

Kode saat ini sudah `grid grid-cols-4 gap-2`. Periksa apakah label bertulis:
- Total, Bertugas, Cadangan, Libur
- Warna: Bertugas=emerald, Cadangan=amber, Libur=slate

Jika sudah sesuai, tidak perlu perubahan.

---

## Task 6: Commit & Push

**Objective:** Push perubahan ke main.

```bash
git add packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx
git commit -m "feat(ui): calendar selected state outline, detail card tanpa dot, HH:mm"
git push origin main
```

---

## QA Checklist

- [ ] Tanggal tidak terpilih + PAGI → filled circle hijau (`bg-emerald-500`)
- [ ] Tanggal tidak terpilih + SORE → filled circle biru (`bg-sky-500`)
- [ ] Tanggal terpilih + PAGI → outline hijau (`border-emerald-500`), angka hijau
- [ ] Tanggal terpilih + SORE → outline biru (`border-sky-600`), angka biru
- [ ] Tanggal terpilih + libur → outline biru netral (`border-blue-400`), angka biru
- [ ] Tanggal tidak ada jadwal → teks tipis transparan
- [ ] Detail card tidak ada dot — langsung "Shift PAGI" warna hijau bold
- [ ] Jam format HH:mm (tanpa detik)
- [ ] 4 card TIM tetap horizontal di mobile
