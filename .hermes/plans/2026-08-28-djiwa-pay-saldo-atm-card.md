# Plan: Redesign Halaman Saldo Djiwa Pay

## Status

Draft plan — belum ada implementasi kode, asset, database, atau deployment.

## Tujuan

Merombak halaman Saldo Customer Djiwa Tentram menjadi wallet experience bergaya kartu ATM/digital wallet dengan standar Apple/iOS Product Design, berdasarkan referensi UI yang diberikan user.

## Scope

Target utama:

- `apps/customer/src/routes/$username/saldo.lazy.tsx`
- komponen customer/shared yang benar-benar diperlukan setelah audit
- asset visual kartu Djiwa Pay hasil generate OpenAI Image Codex, jika disetujui
- style menggunakan design token dan komponen existing

Di luar scope:

- tidak mengubah schema wallet atau financial ledger
- tidak mengubah logic top-up, hold, debit, settlement, atau webhook
- tidak menambahkan fitur transfer antar-user sebelum ada backend contract
- tidak mengubah halaman Customer lain kecuali shared component yang memang digunakan halaman Saldo
- tidak menyalin logo/brand Visa, FinSight, Uber, Spotify, atau Amazon

## Prinsip UX/UI

### Mandatory design references

- Wajib mengikuti `frontend-design/ai-product-design-dna` sebagai standar product design utama.
- Wajib mengikuti `frontend-design/ui-ux-design-standard` untuk prinsip UI/UX lintas aplikasi.
- Wajib mengikuti `frontend-design/mobile-first-customer-ui` untuk behavior mobile customer.
- Wajib mengikuti `frontend-design/screenshot-grounded-ui-refinement` saat menerjemahkan referensi screenshot.
- Visual target: aplikasi mobile iOS yang terasa native, bersih, tenang, premium, dan customer-friendly.
- Gunakan Apple HIG-inspired spacing, hierarchy, soft surfaces, rounded cards, subtle shadow, iOS easing, dan touch target yang aman.
- Jangan membuat dashboard web desktop yang dipaksa masuk ke mobile; gunakan centered mobile shell dan vertical scan path.
- Jika membutuhkan asset visual baru, generate menggunakan OpenAI Image Codex terlebih dahulu. Jangan memakai asset brand pihak ketiga atau mengarang asset final.
- Image generation harus dipisahkan dari data dinamis: nominal saldo, status, wallet ID, tanggal, dan transaksi tetap dirender sebagai HTML/data live.
- Sebelum implementasi final, hasil image/arah visual harus dapat direview terlebih dahulu.
- Browser screenshot wajib digunakan untuk verifikasi visual jika environment tersedia; jika tidak tersedia, laporkan keterbatasannya dan jangan mengklaim pixel-perfect.

- Mobile-first dengan shell sekitar 430–480px di desktop
- Light background, satu accent brand utama
- Card utama radius sekitar 24px dengan soft shadow
- Control minimum 44px dan radius sekitar 14px
- Tipografi display dan body konsisten dengan shared design system
- Lucide line icons, bukan icon dekoratif berwarna-warni
- iOS easing dan press feedback ringan
- Respect `prefers-reduced-motion`
- Satu CTA utama yang jelas: `Top Up`
- Data saldo dan transaksi tetap live dari database; tidak dirender sebagai teks permanen di gambar

## Proposed Layout

```text
Sticky header
└── Saldo Djiwa Pay

Hero wallet card
├── DJIWA PAY / Wallet
├── Saldo tersedia
├── Nominal saldo live
├── Wallet/member identifier tersamarkan
└── Last updated/status

Quick actions
├── Top Up
├── Riwayat
└── Bantuan

Summary
├── Total masuk
└── Total digunakan

Recent transactions
├── Payment order
├── Top up
├── Saldo ditahan
├── Saldo dikembalikan
└── Empty/loading/error states

Customer bottom navigation
└── Saldo aktif
```

## Data and behavior preservation

1. Audit existing saldo route, hooks, and wallet ledger mapper.
2. Preserve authoritative fields for current balance, total credited, total used, transaction type, status, direction, reference, and timestamps.
3. Keep wallet state semantics:
   - active/pending `wallet_hold` → `Saldo ditahan`
   - completed `order_debit` → `Pembayaran pesanan`
   - completed `wallet_release` → `Saldo dikembalikan`
   - pending top-up → `Menunggu konfirmasi pembayaran`
4. Payment success must remain server-confirmed; no browser-side balance mutation.
5. Existing top-up validation for customer email/WhatsApp remains unchanged.
6. If wallet query fails, render retryable error state, not zero balance.

## Asset plan

1. Generate a digital ATM/card visual with OpenAI Image Codex after user confirms the direction.
2. Avoid baked-in dynamic text, amount, card number, expiry, QR, or payment claims in the image.
3. Use the generated asset only as visual texture/background or decorative card artwork.
4. Render live balance, wallet label, and status as accessible HTML on top of the card.
5. Verify asset crop, contrast, mobile aspect ratio, and fallback behavior.

## Implementation sequence

### Wave 1 — Discovery and baseline

- Read saldo route and all wallet hooks/mappers.
- Read shared customer shell and bottom navigation.
- Identify loading, error, empty, pending, completed, hold, debit, and release states.
- Capture baseline screenshot if browser environment is available.
- Record exact files before editing in the dirty monorepo.

### Wave 2 — Visual asset

- Generate candidate Djiwa Pay ATM card artwork via OpenAI Image Codex.
- Review composition and contrast against live HTML labels.
- Keep asset generation separate from business logic.

### Wave 3 — UI implementation

- Replace only the saldo page presentation structure.
- Add wallet card, quick actions, summary cards, and transaction list.
- Reuse existing hooks and design tokens.
- Add explicit loading, empty, error, pending, and completed states.
- Preserve top-up action and existing route behavior.

### Wave 4 — Verification

- Run `git diff --check`.
- Build Customer directly with:
  `TMPDIR=/opt/djiwatentramapp/.tmp node ../../node_modules/vite/bin/vite.js build`
- Verify route bundle and asset chain.
- Browser QA at mobile viewport and desktop-centered viewport.
- Verify wallet values against live database read-only data.
- Test top-up CTA without creating a live invoice unless explicitly approved.

### Wave 5 — Release gate

- Review only intended files in `git diff --name-only HEAD`.
- Confirm no wallet/payment/database behavior changed unintentionally.
- Deploy only `djiwatentram.web.id` after explicit release approval.
- Verify `version.json`, `index.html`, hashed saldo chunk, and asset Content-Type from canonical domain.
- Provide screenshot evidence; if browser remains unavailable, report the limitation honestly.

## Acceptance criteria

- [ ] Saldo page visually follows approved ATM/digital-wallet direction.
- [ ] Live balance is not baked into the image asset.
- [ ] Top Up action remains functional and uses existing payment guard.
- [ ] Transaction labels use structured wallet fields.
- [ ] Loading is distinct from zero balance.
- [ ] Query error has retry action.
- [ ] Empty transaction state is actionable and clear.
- [ ] Pending top-up does not claim payment success.
- [ ] Card and controls meet mobile touch-size requirements.
- [ ] No external brand assets are copied.
- [ ] Customer build passes.
- [ ] Runtime screenshot and production asset verification are captured before release.

## Risks

- Generated card artwork may reduce contrast behind live text; solve with an HTML overlay/gradient, not baked text.
- Existing dirty working tree contains unrelated changes; stage only saldo redesign files.
- PWA/service-worker cache may hide the new page after deployment; verify hashed bundles and version metadata.
- Wallet ledger mapping must not be simplified based on free-text notes.
- A real top-up or payment test creates financial side effects and requires explicit approval.
