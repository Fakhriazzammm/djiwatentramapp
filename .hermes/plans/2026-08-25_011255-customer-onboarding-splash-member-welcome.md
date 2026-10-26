# Plan: Splash, Onboarding Welcome, dan Member Conversion Customer

## Status

Plan only — belum ada implementasi source code, migration, deployment, commit, atau perubahan production.

## Goal

Menambahkan pengalaman pembuka customer yang lebih terarah dengan:

```text
Opening Logo / Splash
  → Onboarding Welcome
  → Login / Register atau Lanjut sebagai Tamu
  → Home Customer existing
```

Home customer existing harus tetap dipertahankan secara visual dan fungsional. Plan ini tidak merombak Home member yang sudah ada; hanya menambahkan onboarding sebelum Home dan section informatif/CTA yang disepakati pada area Home tanpa mengganggu hierarchy utama.

## User-approved scope

### A. Onboarding Welcome — fitur baru

Member conversion dipindahkan ke onboarding welcome:

- Djiwa Pay
- Happy Hour
- Promo Eksklusif
- Masuk / Daftar Member

Onboarding menjadi tempat edukasi benefit member, bukan Home kedua.

### B. Home existing — dipertahankan

Home existing pada authenticated customer route tetap dipertahankan:

- Header brand dan greeting
- Status layanan
- Card Djiwa Pay / special offer
- Pesanan terakhir
- Empty state pesanan
- CTA `Pesanan Saya`
- CTA `Mulai Pesan`
- Bottom navigation
- Struktur shell mobile-first

Tidak boleh dihapus, dipindahkan, atau didesain ulang tanpa persetujuan tambahan.

### C. Tambahan Home yang tetap diminta

Tambahkan secara additive dan compact:

1. **Booking Acara & Kolaborasi**
   - menggantikan terminology lama `Booking meja & menu` jika ditemukan pada guest CTA;
   - target canonical: `https://booking.djiwatentram.web.id/`;
   - jika pada Home existing tidak ada CTA `Booking meja & menu`, jangan menghapus `Pesanan Saya` atau `Mulai Pesan`; tambahkan sebagai secondary card/action.

2. **Product discovery**
   - `Menu Best Seller`;
   - horizontal carousel dengan auto-slide seperti iklan ringan;
   - tetap swipe-friendly, pause saat interaksi, hormati reduced motion.

3. **Restaurant information**
   - Jam operasional
   - Telepon
   - Alamat
   - data berasal dari existing site settings hook, bukan hardcode.

Member conversion tidak diduplikasi sebagai card besar di Home. Home boleh mempertahankan existing Djiwa Pay offer yang sudah menjadi bagian dari Home, tetapi jangan menambah card benefit kedua yang membuat halaman penuh.

## Current context and source mapping

Project:

```text
/opt/djiwatentramapp
```

Customer app:

```text
apps/customer
```

Existing public guest entry:

```text
apps/customer/src/routes/index.lazy.tsx
```

Existing guest source saat ini sudah memiliki:

- CTA `Mulai pesan`
- CTA booking lama yang perlu terminology audit
- benefit Djiwa Pay / Happy Hour / Promo Eksklusif
- `Masuk / Daftar Member`
- Menu Best Seller
- Info Restoran
- AuthModal

Existing authenticated member Home:

```text
apps/customer/src/routes/$username/route.lazy.tsx
```

Komponen yang sudah dipakai di route member dan harus dipertahankan/reuse:

```text
apps/customer/src/components/customer/auth-modal.tsx
apps/customer/src/components/customer/customer-shell.tsx
apps/customer/src/components/customer/customer-home-sections.tsx
apps/customer/src/components/customer/customer-states.tsx
apps/customer/src/components/customer/member-onboarding.tsx
apps/customer/src/hooks/use-customer-auth.ts
apps/customer/src/hooks/use-hybrid-pos-data.ts
apps/customer/src/routes/__root.tsx
```

Shared design system:

```text
packages/yumipos-web-shared/src/theme.css
packages/yumipos-web-shared/src/components/layout/OwnerFooter.tsx
```

Design tokens existing yang wajib dipakai:

- Plus Jakarta Sans untuk display;
- Geist/Inter untuk body;
- card radius sekitar 24px;
- control radius sekitar 14px;
- surface terang;
- satu accent primary Djiwa Tentram;
- soft shadow;
- touch target minimal 44px;
- iOS easing `cubic-bezier(.32,.72,0,1)`;
- press feedback sekitar 180ms;
- Lucide line icons, bukan emoji.

## Product flow

### First-time visitor

```text
/ guest entry
  → Splash screen 600–1000ms maximum
  → Onboarding Welcome
  → Masuk / Daftar Member atau Lanjut sebagai Tamu
```

### Returning guest

```text
onboarding sudah selesai
  → langsung ke guest/customer entry existing
```

### Authenticated customer

```text
session valid
  → bypass onboarding
  → langsung ke /{username} Home existing
```

### Important auth rule

Flag onboarding hanya mengatur tampilan lokal. Flag tidak boleh dipakai sebagai authorization atau bukti login. Auth tetap berasal dari `useCustomerAuth()` dan session/database yang sudah ada.

Recommended persistence:

```text
localStorage key: djiwa_customer_onboarding_seen_v1
```

Jika auth requirement final ternyata wajib login, CTA `Lanjut sebagai Tamu` dapat dihilangkan dalam implementation wave terpisah. Default plan mempertahankan guest ordering agar tidak memblokir customer baru.

## UI/UX specification — Apple/iOS style

### Design principles

| Principle | Implementation |
|---|---|
| Calm first impression | Splash sederhana, logo centered, tidak ada dekorasi berlebihan |
| One clear action | Onboarding memiliki primary `Masuk / Daftar Member`, secondary `Lanjut sebagai Tamu` |
| Mobile shell | Max width sekitar 430px, tetap centered dan memanjang pada desktop, tidak menjadi two-column grid |
| Premium spacing | Padding 20–24px, section gap 16px, card radius 24px |
| iOS controls | Min-height 44px, radius 14px, active scale `.97`, focus-visible ring |
| One accent | Gunakan shared primary; jangan membuat warna brand baru di route |
| Readable type | Heading display font, body 14–15px, caption minimum 11px |
| Motion with meaning | Fade/scale splash dan slide onboarding; respect `prefers-reduced-motion` |
| Accessibility | Semantic `main`, `section`, `button`, labels, keyboard focus, aria-label |

### Splash screen

```text
Full mobile shell
  ├─ brand background / light surface sesuai aset brand
  ├─ centered logo
  ├─ brand name: Djiwa Tentram
  └─ short fade/scale entry
```

Rules:

- no auto redirect loop;
- no long blocking wait after bootstrap complete;
- no fake loading progress;
- if app data/auth fails, continue to a clear error/retry state rather than staying on splash forever;
- logo asset must use configured brand logo where available, with safe fallback.

### Onboarding Welcome

```text
Sticky/compact top area
  ├─ optional skip/back affordance

Hero
  ├─ illustration or existing approved customer asset
  ├─ headline: Selamat datang di Djiwa Tentram
  └─ copy: Pesan favoritmu dengan lebih mudah dan dapatkan benefit khusus member.

Benefit row
  ├─ Djiwa Pay
  ├─ Happy Hour
  └─ Promo Eksklusif

Actions
  ├─ primary: Masuk / Daftar Member
  └─ secondary: Lanjut sebagai Tamu
```

Benefit row must be compact and readable; it must not become three large unrelated cards. Existing Djiwa3DIcon registry is preferred if the assets are canonical and do not contain legacy text.

### Auth

Reuse existing `AuthModal` contract unless source audit proves a dedicated route is required. Preserve:

- login;
- register;
- Google sign-in if enabled;
- password reset;
- email confirmation state;
- auth error state;
- skip behavior where guest path is enabled.

Do not duplicate auth business logic in onboarding.

### Home additions

#### Booking Acara & Kolaborasi

Use a compact Apple-style secondary card:

```text
Booking Acara & Kolaborasi
Rencanakan acara atau kolaborasi bersama Djiwa Tentram.
[Buka Booking]
```

Rules:

- CTA opens canonical booking URL;
- external link behavior should be explicit;
- do not replace `Pesanan Saya` or `Mulai Pesan` when those are the only existing Home quick actions;
- keep booking subordinate to order CTA.

#### Menu Best Seller

Use existing product data/hook and existing auto-carousel behavior if available.

Rules:

- horizontal carousel, never desktop two-column grid;
- card width sufficient for natural product name wrapping;
- image, product name, price, optional menu number and sold badge;
- autoplay interval around 4–5 seconds;
- one-card step;
- reset to first card at end;
- pause on pointer/touch/focus interaction;
- skip autoplay under `prefers-reduced-motion`;
- hide scrollbar without hiding keyboard focus;
- clicking a card navigates to the existing menu route, without auto-adding cart items.

#### Info Restoran

Use existing `useHybridSiteSettings()` values:

- opening/closing time or opening hours;
- phone with `tel:` link;
- address;
- explicit empty behavior when settings are absent;
- no placeholder business data.

## Motion and animation specification — Framer Motion / iOS

Semua animasi wajib memiliki fungsi UX yang jelas: menjelaskan perpindahan layar, memberi feedback interaksi, menunjukkan loading/success, atau membantu user memahami hierarchy. Tidak ada decorative motion yang terus berjalan tanpa tujuan.

### Motion foundation

Dependency yang sudah tersedia:

```text
framer-motion
```

Implementation wajib menggunakan:

```tsx
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
```

Gunakan shared constants di level component/module:

```tsx
const iosEase = [0.32, 0.72, 0, 1] as const;
const iosSpring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };
```

Catatan penting:

- gunakan `type: "spring" as const` agar lolos TypeScript Framer Motion;
- jangan gabungkan `transition-all` dan transform animation Framer Motion pada element yang sama;
- gunakan `transition-shadow`, `transition-colors`, atau `transition-opacity` jika CSS transition tetap diperlukan;
- semua list/card harus memiliki stable `key`;
- gunakan `useReducedMotion()` untuk mematikan scale, spring, dan slide yang tidak esensial.

### Splash transition

Sequence:

```text
initial: opacity 0, scale 0.96
animate: opacity 1, scale 1
exit: opacity 0, scale 1.02
```

Rules:

- logo masuk dengan fade + subtle scale;
- durasi sekitar 320–500ms;
- splash exit memakai `AnimatePresence` ketika onboarding siap;
- tidak boleh menunda aplikasi lebih lama dari bootstrap/auth yang sebenarnya;
- jika reduced motion aktif, gunakan opacity-only atau render state akhir tanpa transform.

Contoh contract:

```tsx
<AnimatePresence mode="wait">
  {phase === "splash" ? (
    <motion.div
      key="splash"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: iosEase }}
    />
  ) : (
    <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
  )}
</AnimatePresence>
```

### Onboarding enter transition

Onboarding memakai layered entrance yang singkat:

1. illustration/logo: opacity + y `12 → 0`;
2. headline/copy: fade + y dengan delay kecil;
3. benefit cards: parent `staggerChildren: 0.06`;
4. CTA: fade + y terakhir.

Target:

```text
headline/copy delay: 60–100ms
benefit stagger: 60ms per item
CTA delay: 180–240ms
```

Motion tidak boleh membuat user menunggu CTA. CTA tetap clickable saat animation berjalan atau tampil segera setelah hero muncul.

### Benefit card reaction

Benefit cards memakai feedback interaksi ringan:

```tsx
<motion.button
  whileHover={reduceMotion ? undefined : { y: -2 }}
  whileTap={reduceMotion ? undefined : { scale: 0.97 }}
  transition={iosSpring}
>
```

Rules:

- reaction hanya pada interaction, bukan loop otomatis;
- tidak menggunakan bounce berlebihan;
- tidak mengubah payload benefit atau auth logic;
- focus-visible tetap terlihat dan tidak tertutup transform.

### CTA reaction

`Masuk / Daftar Member`, `Lanjut sebagai Tamu`, `Mulai Pesan`, dan `Booking Acara & Kolaborasi` memakai:

- `whileTap={{ scale: 0.97 }}`;
- optional `whileHover={{ y: -1 }}` hanya desktop;
- transition iOS spring;
- loading state saat auth/navigation async;
- tombol disabled saat request in-flight agar tidak double submit.

Untuk reduced motion:

```tsx
whileTap={reduceMotion ? undefined : { scale: 0.97 }}
whileHover={reduceMotion ? undefined : { y: -1 }}
```

### Auth transition

Saat onboarding membuka AuthModal/sheet:

```text
backdrop: opacity 0 → 1
panel: opacity 0, y 24 → opacity 1, y 0
```

Saat close:

```text
panel: y 0 → 24, opacity 1 → 0
backdrop: opacity 1 → 0
```

Gunakan `AnimatePresence` hanya jika lifecycle overlay dapat dikontrol tanpa merusak accessibility/focus trap dari component auth existing. Jika `AuthModal` sudah memiliki animation/accessibility sendiri, reuse component tersebut dan jangan menambahkan nested animation yang berkonflik.

### Home section entrance

Section tambahan Home boleh masuk dengan stagger ringan saat pertama kali terlihat:

```text
Booking card → Menu Best Seller → Info Restoran
```

Rules:

- gunakan `whileInView` hanya jika tidak menimbulkan motion berulang saat scroll;
- `viewport={{ once: true, amount: 0.2 }}`;
- opacity/y kecil, bukan scale besar;
- existing Home sections tidak boleh berpindah atau ikut dianimasikan ulang tanpa alasan.

### Best Seller carousel motion

Carousel memakai dua jenis motion yang berbeda:

1. **Autoplay scroll** — `scrollTo({ behavior: "smooth" })`, interval 4–5 detik;
2. **Card interaction** — Framer Motion `whileTap`/`whileHover`.

Rules:

- autoplay berhenti saat pointer/touch/focus;
- autoplay berhenti ketika `document.hidden`;
- autoplay disabled saat reduced motion;
- jangan gunakan `layout` pada seluruh carousel jika menyebabkan scroll jump;
- jangan mencampur CSS `transition-all` dengan transform Framer Motion pada kartu.

### Loading and success motion

State transition yang wajib direncanakan:

- loading onboarding/auth: skeleton atau opacity transition singkat, bukan spinner dekoratif;
- auth success: transition kembali ke Home existing, tidak menampilkan Home ganda;
- auth error: inline error/toast dengan shake minimal hanya jika accessible; teks error tetap sumber informasi utama;
- booking external navigation: tidak perlu animation panjang sebelum browser berpindah.

### Motion acceptance criteria

- [ ] Splash fade/scale masuk dan exit dengan `AnimatePresence` atau equivalent existing lifecycle.
- [ ] Onboarding hero, benefit cards, dan CTA memiliki stagger yang singkat.
- [ ] CTA dan benefit cards memiliki tap/hover reaction iOS-style.
- [ ] Auth overlay transition tidak merusak focus trap, keyboard, atau close behavior.
- [ ] Carousel autoplay pause saat user berinteraksi.
- [ ] Semua motion menghormati `useReducedMotion()`.
- [ ] Tidak ada `transition-all` pada motion element yang mengontrol transform.
- [ ] Tidak ada decorative infinite animation selain autoplay carousel yang disetujui.
- [ ] Build/typecheck tidak menghasilkan error Framer Motion (`type: "spring"` harus literal `as const`).

## Data and backend contract

No new database table is expected for this scope.

### Existing data sources

```text
Auth/session
  → useCustomerAuth()

Brand/logo
  → VITE_BRAND_NAME / VITE_BRAND_LOGO_URL

Best sellers
  → useHybridBestSellers()
  → useHybridProducts() for current image/price/name

Restaurant information
  → useHybridSiteSettings()

Booking CTA
  → static canonical external URL only
```

### Storage contract

Local onboarding flag:

```text
localStorage.djiwa_customer_onboarding_seen_v1 = "true"
```

Constraints:

- local flag must never contain customer PII;
- clearing local storage should show onboarding again without changing auth/session;
- auth session must continue to control authenticated routing;
- no migration unless product later requires cross-device onboarding completion.

## Files likely to change

Likely additive/targeted files:

```text
apps/customer/src/routes/index.lazy.tsx
apps/customer/src/routes/__root.tsx              # only if splash gate belongs at shell level
apps/customer/src/components/customer/customer-onboarding.tsx  # new, preferred
apps/customer/src/components/customer/customer-splash.tsx      # new, preferred
apps/customer/src/components/customer/customer-home-sections.tsx # only for additive Home cards
apps/customer/src/components/customer/customer-shell.tsx       # only if shared CTA/nav adapter is needed
```

Likely test targets:

```text
apps/customer/src/components/customer/customer-onboarding.test.tsx
apps/customer/src/components/customer/customer-splash.test.tsx
apps/customer/src/routes/index.lazy.test.tsx       # if route testing convention exists
```

Do not modify unrelated apps, admin/POS routes, shared global theme, payment logic, or database schema unless inspection proves a shared primitive must be changed safely and the impact is documented.

## Implementation waves

### Wave 1 — Baseline and component boundaries

1. Capture scoped dirty tree for `apps/customer`.
2. Read current root shell, guest route, member route, AuthModal, customer shell, and theme tokens.
3. Confirm where authenticated redirect occurs.
4. Define typed props for Splash and Onboarding presentation components.
5. Confirm current Home snapshot/markers so the existing Home can be regression-checked.

### Wave 2 — Splash and onboarding

1. Add `CustomerSplash` presentational component.
2. Add `CustomerOnboarding` presentational component.
3. Add first-open state machine around the public customer entry/shell.
4. Wire existing AuthModal without duplicating auth logic.
5. Add guest continuation path if retained.
6. Ensure authenticated users bypass onboarding and continue to existing member Home.

### Wave 3 — Additive Home content

1. Preserve all current Home sections and CTA order.
2. Add `Booking Acara & Kolaborasi` only as a secondary card/action.
3. Keep best seller carousel as a separate discovery section.
4. Add restaurant information using existing site settings data.
5. Keep Member Conversion out of the Home except for existing Djiwa Pay offer content already present.

### Wave 4 — Design and accessibility hardening

1. Apply shared Apple/iOS tokens only.
2. Verify mobile shell on narrow viewport and desktop viewport.
3. Verify no two-column conversion on desktop.
4. Check 44px touch targets and focus-visible states.
5. Check reduced motion.
6. Check long product names and missing images.
7. Check auth loading/error/email-confirm states.
8. Check splash timeout/error fallback.

### Wave 5 — Verification and release

1. Run `git diff --check` scoped to customer files.
2. Run direct customer Vite build to avoid unrelated version hook mutations.
3. Run customer typecheck and classify baseline errors separately.
4. Run preview HTTP check.
5. Use browser screenshot at mobile and desktop viewport if browser is available.
6. Verify asset chain `index.html → hashed route chunk → sw.js → version.json`.
7. Search bundle markers:
   - `Djiwa Tentram`
   - `Masuk / Daftar Member`
   - `Djiwa Pay`
   - `Happy Hour`
   - `Promo Eksklusif`
   - `Booking Acara & Kolaborasi`
   - `Menu Best Seller`
   - `Jam operasional`
8. Deploy only customer webroot `djiwatentram.web.id`.
9. Verify production HTTP and deployed hashed bundle.
10. Commit only session-owned customer files.

## UX states and acceptance criteria

### Splash

- [ ] First open shows splash once and exits reliably.
- [ ] Existing authenticated user is not trapped or unnecessarily delayed.
- [ ] Splash has fallback when logo/config is unavailable.
- [ ] Reduced motion removes decorative animation.

### Onboarding

- [ ] Member conversion appears in onboarding welcome.
- [ ] Djiwa Pay, Happy Hour, Promo Eksklusif are visible and readable.
- [ ] `Masuk / Daftar Member` opens existing auth flow.
- [ ] Guest continuation behavior is explicit and does not mutate auth.
- [ ] Reload behavior respects onboarding flag.
- [ ] Clearing local storage resets onboarding only.

### Existing Home regression

- [ ] Existing header/greeting remains unchanged.
- [ ] Existing Djiwa Pay offer remains unchanged.
- [ ] Pesanan Terakhir remains unchanged.
- [ ] `Pesanan Saya` and `Mulai Pesan` remain available.
- [ ] Bottom navigation remains five items and safe-area compatible.
- [ ] Authenticated route continues to render the same Home shell.

### Added Home sections

- [ ] Booking label is `Booking Acara & Kolaborasi`.
- [ ] Booking target is exactly `https://booking.djiwatentram.web.id/`.
- [ ] Booking does not replace existing primary order/history actions accidentally.
- [ ] Best Seller carousel remains horizontal and touch-friendly.
- [ ] Restaurant information uses live site settings.
- [ ] Missing settings render neutral empty behavior, not fake data.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Onboarding appears repeatedly | Versioned localStorage key and explicit state transition |
| Authenticated user sees onboarding | Check auth/session before presenting onboarding and preserve existing redirect |
| Home becomes too long | Keep member conversion in onboarding; use compact additive cards on Home |
| Booking CTA removes existing action | Audit current Home before editing; add rather than replace when old CTA is absent |
| Browser desktop becomes two-column again | Enforce `max-w-md` mobile shell and prohibit `lg:grid-cols` for this flow |
| Product names overflow | Fixed minimum carousel card width plus natural wrapping |
| Motion causes accessibility issue | `prefers-reduced-motion`, pause on interaction, no decorative looping beyond carousel |
| Global style regression | Use existing shared tokens/Tailwind only; no unscoped CSS injection |
| PWA serves stale Home | Verify index, route chunk, sw.js, and version/asset markers from canonical domain |
| Build mutates unrelated apps | Use direct Vite build and stage only customer source files |
| Auth confirmation mismatch | Reuse existing AuthModal and preserve `registrationNeedsEmailConfirm` behavior |

## Explicit non-goals

- No redesign of authenticated Home.
- No replacement of bottom navigation.
- No new payment flow.
- No database migration.
- No new booking backend.
- No new member benefits logic.
- No changes to POS/admin/karyawan apps.
- No global theme rewrite.
- No forced login unless explicitly approved later.

## Open decision before implementation

Default recommendation:

```text
Onboarding CTA:
  primary   = Masuk / Daftar Member
  secondary = Lanjut sebagai Tamu
```

This preserves the current guest ordering experience. If the business requirement is that every visitor must authenticate before seeing Home/menu, remove `Lanjut sebagai Tamu` in the implementation plan before coding.

## Definition of done

The feature is done only when:

- Splash and onboarding render correctly on mobile and desktop mobile-shell view;
- member benefits are shown in onboarding;
- authenticated Home is visually unchanged except for explicitly approved additive sections;
- Booking target and label are verified;
- best seller and restaurant info use real existing data;
- build/test/diff checks pass;
- production asset chain is verified;
- screenshot evidence is captured when browser is available, otherwise the limitation is stated honestly;
- only customer-scoped files are committed and deployed.
