# Tanda "Baru" untuk fitur baru (standar Djiwa Pay)

Setiap fitur, halaman, kartu, menu, atau baris baru di Djiwa Pay diberi tanda **Baru**. Tanda itu **hilang sendiri 2 hari setelah orang itu pertama kali melihat fiturnya**, bukan 2 hari sejak rilis. Setiap orang punya jamnya sendiri.

## Aturan
1. Fitur yang belum pernah dilihat: tanda tampil, jam **belum jalan**.
2. Jam mulai saat elemen fitur berada di layar (minimal 50% terlihat selama 0,7 detik). Waktunya disimpan **per orang** di server (`finance.discovery_decisions`, kunci `seen:<id>`) dan di ponsel, jadi semua perangkat sepakat. Yang tercatat pertama menang dan tidak pernah digeser.
3. Setelah `pertama dilihat + 2 hari` tanda hilang tepat waktu (dengan animasi keluar), dan sorotan kartu (garis oranye) ikut hilang.
4. Tanda beranimasi: muncul memantul, berkilau, berdenyut. Mode "kurangi gerakan" mematikan geraknya.

## Cara memakai
Beri **id tetap** (huruf kecil, angka, `-`, `_`) pada fitur. Jangan pernah mengganti id yang sudah dirilis (itu memulai ulang tanda untuk semua orang).

Di samping label atau judul baris (paling sering):

```tsx
import { NewTag } from "../shell/new-badge";
<b>Penerima<NewTag id="payees-page" /></b>
```

Di tepi kartu, dengan sorotan:

```tsx
import { NewBadge } from "../shell/new-badge";
import { useNewFeature } from "../../lib/finance/new-feature";
const nf = useNewFeature<HTMLElement>("payee-card");
<section ref={nf.ref} className={`kartu ${nf.fresh ? "is-new" : ""}`}>
  <NewBadge show={nf.fresh} variant="float" />   {/* kartu perlu position: relative */}
</section>
```

Item menu di Beranda: tambahkan `fresh: "id-fitur"` pada entri `ALL_MENU`.

## Checklist fitur baru
- [ ] Tentukan id, pasang `NewTag` atau `NewBadge` di pintu masuk utama (menu, kartu, atau baris).
- [ ] Satu fitur boleh punya beberapa pintu; pakai id yang sama agar jamnya satu.
- [ ] Sorotan visual hanya saat `nf.fresh`.
- [ ] Jangan memakai teks "Baru" buatan sendiri.

Kode: `apps/djiwapay/src/lib/finance/new-feature.ts`, `apps/djiwapay/src/features/shell/new-badge.tsx`, server `apps/djiwapay-api/src/discoveries.ts` (`/api/finance/discoveries/seen`).
