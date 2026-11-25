# Tanda "Baru" untuk fitur baru (customer / Djiwa Tentram)

Setiap fitur, halaman, kartu, menu, atau baris baru di aplikasi customer (djiwatentram.web.id) diberi tanda **Baru**. Tanda itu **hilang sendiri 2 hari setelah orang itu pertama kali melihat fiturnya**, bukan 2 hari sejak rilis. Setiap orang punya jamnya sendiri.

Standar yang sama dengan [Djiwa Pay](djiwapay-new-badge.md), tetapi disimpan di tabel `pos.customer_feature_seen` (kunci identitas: `customers.source_id`), bukan `finance.discovery_decisions`.

## Aturan
1. Fitur yang belum pernah dilihat: tanda tampil, jam **belum jalan**.
2. Jam mulai saat elemen fitur berada di layar (minimal 50% terlihat selama 0,7 detik). Waktunya disimpan **per orang** di server (`pos.customer_feature_seen`) dan di ponsel, jadi semua perangkat sepakat. Yang tercatat pertama menang dan tidak pernah digeser.
3. Setelah `pertama dilihat + 2 hari` tanda hilang tepat waktu (dengan animasi keluar).
4. Tanda beranimasi: muncul memantul dan berkilau. Mode "kurangi gerakan" mematikan geraknya.

## Cara memakai
Beri **id tetap** (huruf kecil, angka, `-`, `_`) pada fitur. Jangan pernah mengganti id yang sudah dirilis (itu memulai ulang tanda untuk semua orang).

Di samping label atau judul (paling sering):

```tsx
import { NewTag } from "@/components/customer/new-badge";
<b>Djiwa Pay<NewTag id="wallet-saldo" /></b>
```

Di tepi kartu, dengan sorotan:

```tsx
import { NewBadge } from "@/components/customer/new-badge";
import { useNewFeature } from "@/lib/new-feature";
const nf = useNewFeature<HTMLElement>("wallet-saldo");
<section ref={nf.ref} className={`kartu ${nf.fresh ? "is-new" : ""}`}>
  <NewBadge show={nf.fresh} variant="float" />   {/* kartu perlu position: relative */}
</section>
```

## Checklist fitur baru
- [ ] Tentukan id, pasang `NewTag` atau `NewBadge` di pintu masuk utama (menu, kartu, atau baris).
- [ ] Satu fitur boleh punya beberapa pintu; pakai id yang sama agar jamnya satu.
- [ ] Sorotan visual hanya saat `nf.fresh`.
- [ ] Jangan memakai teks "Baru" buatan sendiri.

Kode: `apps/customer/src/lib/new-feature.ts`, `apps/customer/src/components/customer/new-badge.tsx`, edge function `supabase/functions/customer-features` (`action: get` / `action: seen`), tabel `pos.customer_feature_seen` (migrasi `supabase/migrations/20261126000000_customer_feature_seen.sql`).

Profil "dilihat" dipasang otomatis di `apps/customer/src/hooks/use-customer-auth.tsx` begitu pelanggan diketahui (`setBadgeProfile` + `syncSeen`).
