# Plan: Rework Detail Tab Tim — Format Jam & Layout Nama

## Masalah
1. Format jam dari DB menampilkan detik (`07:30:00–14:30:00`) — terlalu panjang
2. Layout staff 2 kolom membuat nama terpotong (truncate) — tidak terbaca komplit
3. Grid 2 kolom terlalu sempit untuk mobile, avatar + nama + role + jam semua sesak

## Solusi

### 1. Format jam — hilangkan detik
Buat helper:
```ts
function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5); // "07:30:00" → "07:30"
}
```
Terapkan di:
- `s.startTime` → `formatTime(s.startTime)`
- `s.endTime` → `formatTime(s.endTime)`

### 2. Layout staff — 1 kolom (buang grid 2 kolom)
Ganti `grid 2-col` jadi `flex-col` vertical.

Alasan:
- Accordion sudah collapse default untuk shift lain → tidak memanjang ke bawah
- Ruang horizontal penuh → nama komplit tanpa truncate
- Lebih konsisten dengan card detail Pribadi yang juga list 1 kolom

### 3. Typography — lebih besar
- Nama: `text-[10px]` → `text-[11px]`, hapus `truncate`
- Role: `text-[8px]` → `text-[9px]`, hapus `truncate`
- Jam: `text-[9px]` → `text-[10px]`
- Avatar circle: `h-5 w-5` → `h-6 w-6`, font `text-[9px]` → `text-[10px]`

### 4. Layout inner card (1 staff)
```
[ Avatar h-6 ]  [ Nama Lengkap (11px bold)    ]  [ 07:30 ]
                [ Role (9px)                   ]  [ –14:30 ]
```
Flex row: avatar + info (flex-1) + jam (shrink-0, text-right)

## File yang diedit
`packages/yumipos-web-shared/src/components/attendance/PersonalSchedule.tsx`

## Acceptance Criteria
- [ ] Jam tampil `07:30` bukan `07:30:00`
- [ ] Nama staff tampil komplit (tanpa `truncate`)
- [ ] Role tidak terpotong
- [ ] Layout 1 kolom rapi
- [ ] Build `apps/karyawan` sukses
- [ ] Build `apps/pos` sukses (import shared)
- [ ] Tidak ada regression di tab Pribadi

## Step Eksekusi
1. Edit `PersonalSchedule.tsx` — tambah `formatTime` + 1 kolom + typography
2. Build `apps/karyawan`
3. Build `apps/pos`
4. Commit + push
5. Trigger Vercel redeploy karyawan
