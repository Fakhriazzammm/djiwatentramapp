# Djiwa Tentram Product Design Standard

> Source of truth UI/UX untuk Admin, POS, Karyawan, dan Customer.
> Berdasarkan AI Product Design DNA v2.0, Apple HIG, Airbnb, Gojek/Uber, Stripe, Linear, dan reference implementation Plastix.

## 1. Prinsip Produk

Setiap layar harus menjawab dalam tiga detik:

1. Di mana saya?
2. Apa yang bisa saya lakukan?
3. Apa tindakan berikutnya?

UI harus terasa **premium, ramah, minimal, modern, cepat, profesional, tenang, dan percaya diri**. Kejelasan operasional selalu lebih penting daripada dekorasi.

## 2. Source of Truth

- Tokens: `packages/yumipos-web-shared/src/theme.css`
- Components: `packages/yumipos-web-shared/src/components/ui/`
- App imports: `apps/*/src/index.css`
- Icons: `lucide-react`, line-only, rounded, stroke 2px

Jangan membuat token per aplikasi, menyalin raw global CSS, atau membuat primitive baru bila shared component sudah tersedia.

## 3. Visual Tokens

| Token | Standard |
|---|---|
| Theme | Light, white/near-white surfaces |
| Primary accent | Deep Azure `#1a5dc6` |
| Semantic colors | Green success, amber warning, red destructive—hanya untuk makna |
| Display font | Plus Jakarta Sans |
| Body font | Geist / Inter fallback |
| Major card radius | 24px |
| Control radius | 14px |
| Compact data surface | 10–16px sesuai density, bukan major card |
| Shadow | Soft `rgba(9,9,11,0.04–0.12)` |
| Content padding | 16–24px |
| Touch target | Minimum 44×44px pada aksi utama dan mobile |

Display dan body wajib terlihat berbeda. Heading menggunakan `font-display`; body menggunakan `font-sans`.

## 4. Hierarchy

Urutan default:

```text
Navigation
└── Page identity / greeting
    ├── Primary insight or task
    ├── Primary actions
    ├── Supporting statistics
    ├── Recent activity / operational content
    ├── Recommendations
    └── Secondary information
```

Larangan:

- dashboard berisi banyak stat card identik;
- metrik sama diulang tanpa tujuan;
- CTA utama tenggelam;
- semua informasi memiliki bobot visual sama;
- card digunakan sebagai pembungkus dekoratif tanpa satu pesan utama.

## 5. Domain Rules

### Admin

- Desktop-first tetapi tetap usable pada tablet/mobile.
- Data table boleh compact; major sections tetap memakai hierarchy dan whitespace.
- Insight/exception/action lebih penting daripada kumpulan statistik.

### POS

- Kecepatan dan akurasi lebih penting daripada whitespace berlebihan.
- Product selection, cart, total, dan checkout harus selalu jelas.
- Jangan mengubah order, payment, printing, shift, atau inventory behavior saat styling.

### Karyawan

- Mobile-first dan one-hand operation.
- Attendance, schedule, payroll, permission, dan notification harus mudah dipahami dalam kondisi lapangan.
- Safe area dan touch target wajib.

### Customer

- Friendly, simple, visual, dan conversion-oriented.
- Gunakan Lucide; emoji tidak boleh menjadi UI icon.
- Primary CTA dan member benefit harus jelas tanpa membuat halaman terasa seperti admin dashboard.

## 6. Motion

| Interaction | Duration | Easing |
|---|---:|---|
| Micro interaction | 180ms | `cubic-bezier(.32,.72,0,1)` |
| Navigation/sheet | 320ms | `cubic-bezier(.32,.72,0,1)` |
| Spring-like entry | 420ms | `cubic-bezier(.32,.72,0,1)` |
| Press feedback | `scale(.97)` | 180ms |

Motion harus menjelaskan navigation, success, loading, focus, atau progress. Hormati `prefers-reduced-motion` dan hindari animasi dekoratif.

## 7. Required UX States

Setiap data-driven feature harus menangani:

1. Loading—skeleton shimmer, bukan teks spinner.
2. Empty—icon/illustration, headline, description, CTA bila relevan.
3. Error—pesan aman, inline feedback, retry.
4. Success—toast atau state singkat yang jelas.
5. Confirmation—sebelum destructive action.
6. Disabled/pending—cegah double submission.
7. Offline/stale—jelaskan bila data tidak terbaru.

Gunakan shared `Skeleton`, `AsyncBoundary`, `EmptyState`, `ErrorState`, `SuccessState`, `Button`, dan Dialog primitives.

## 8. Accessibility

- Semantic landmarks: `nav`, `main`, `section`, `article`, heading berurutan.
- Full keyboard support dan visible focus.
- WCAG AA contrast.
- Label programatik untuk control/icon button.
- Mobile action minimum 44×44px.
- Jangan mengandalkan warna saja untuk status.
- Jangan memotong judul penting dengan `truncate`.
- Semua motion menghormati reduced-motion.

## 9. Responsive Matrix

Setiap halaman diverifikasi pada:

| Width | Target |
|---:|---|
| 375px | mobile phone |
| 768px | tablet/large phone |
| 1024px | small desktop/tablet landscape |
| 1440px | desktop operational |

Quality gate:

- tidak ada horizontal overflow yang tidak disengaja;
- sticky/fixed element tidak menutupi konten;
- table memiliki mobile representation atau intentional scroll;
- title, price, status, dan CTA tidak terpotong;
- safe-area respected;
- hanya content region yang semestinya scroll.

## 10. Icons and Content

- Gunakan Lucide line icons, stroke 2px, ukuran konsisten.
- Emoji tidak digunakan sebagai icon UI.
- Filled icon hanya untuk active/selected state bila meningkatkan clarity.
- Gunakan data realistis dan Bahasa Indonesia yang jelas.
- Hindari jargon teknis, stack trace, atau error internal pada user-facing UI.

## 11. Engineering Guardrails

- Shared-first, additive, incremental.
- Tidak boleh mengubah business logic dalam UI migration.
- Tidak boleh menyalin global selectors dari standalone HTML.
- Scoped CSS harus berada di bawah wrapper unik.
- Jangan menambah dependency hanya untuk styling bila Tailwind/Radix/Lucide mencukupi.
- Admin dan POS yang memiliki file paralel harus tetap sinkron kecuali behavior memang berbeda.

## 12. Definition of Done

Sebuah halaman hanya boleh dinyatakan selesai bila:

- [ ] Purpose dan CTA jelas dalam tiga detik.
- [ ] Shared tokens/components digunakan.
- [ ] Display/body typography benar.
- [ ] Spacing, radius, shadow, dan icons konsisten.
- [ ] Loading, empty, error, success, dan confirmation tersedia sesuai kebutuhan.
- [ ] Keyboard, focus, contrast, dan touch target lolos.
- [ ] Tidak ada truncation/overflow pada responsive matrix.
- [ ] Business behavior dan data flow tidak berubah.
- [ ] Build/typecheck relevan lulus.
- [ ] Screenshot live benar-benar diperiksa.
- [ ] Browser console/network tidak memiliki error baru.

Checklist adalah batas minimum; screenshot dan functional regression tetap menjadi bukti utama.