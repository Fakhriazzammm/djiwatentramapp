# Yumme Group Corporate Landing Page Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after user approval.

**Status:** Implementation approved — strategy decisions confirmed on 2026-09-17.

**Goal:** Membangun landing page utama `djiwatentram.web.id` sebagai corporate website Yumme Group yang memosisikan Yumme sebagai F&B operating group: membangun dan mengelola brand F&B, menyediakan teknologi operasional, mengelola people/HR, serta membantu pertumbuhan melalui KOL dan digital marketing.

**Architecture:** Buat app corporate terpisah untuk `djiwatentram.web.id`, bukan menumpang pada `apps/customer`, `apps/admin`, atau `apps/kol`. Landing page bersifat public, cepat, SEO-friendly, responsive, dan tidak mengubah business logic aplikasi operasional yang sudah ada. App akan memiliki jalur CTA ke ekosistem existing seperti Djiwa Tentram, KOL Partnership, booking, POS, HR, dan contact/business inquiry.

**Tech Stack:** React + Vite + TypeScript, Tailwind CSS v4, shared UI/tokens dari `packages/yumipos-web-shared`, Lucide icons, Framer Motion hanya untuk motion yang bermakna, `DESIGN.md` sebagai design contract, Apple HIG + AI Product Design DNA v2.0.

**Design references wajib:**
- `/opt/djiwatentramapp/DESIGN.md`
- `frontend-design/ai-product-design-dna/SKILL.md`
- `creative/design-md/SKILL.md`
- Apple Human Interface Guidelines

---

## 1. Product Direction

### Core positioning

> **Yumme Group builds, operates, and grows modern F&B businesses.**

Bahasa Indonesia pendukung:

> Yumme Group menggabungkan pengalaman operasional F&B, teknologi, pengelolaan SDM, dan growth marketing untuk membantu bisnis kuliner berjalan lebih rapi, efisien, dan bertumbuh.

### Perception yang harus dibangun

Landing page harus terasa:

- premium;
- tenang dan percaya diri;
- modern tetapi tidak terasa seperti SaaS template;
- operator-led, bukan sekadar software vendor;
- credible untuk owner/investor/client F&B;
- mudah dipahami dalam 3 detik.

### Business model yang ditampilkan

```text
Yumme Group
├── F&B Brands
│   └── Brand yang dibangun/dikelola sendiri, termasuk Djiwa Tentram
├── F&B Operations
│   └── Outlet setup, SOP, inventory, finance, quality control
├── Yumme Technology
│   └── POS, customer app, HR, attendance, dashboards, automation
└── Yumme Growth
    └── KOL, digital marketing, campaigns, retention, sales growth
```

### Important boundary

Jangan memosisikan Yumme sebagai:

- hanya vendor POS;
- marketplace F&B;
- agency marketing generik;
- dashboard dengan banyak fitur tanpa outcome;
- perusahaan yang mengklaim hasil marketing tanpa data/evidence.

---

## 2. Information Architecture / Sitemap

### Primary route

- `/` — corporate landing page utama

### Supporting routes, bila dibutuhkan setelah landing MVP disetujui

- `/ecosystem` — seluruh pilar solusi Yumme
- `/operations` — jasa pengelolaan operasional F&B
- `/technology` — teknologi dan sistem yang digunakan
- `/people` — HR, SOP, absensi, scheduling, payroll, training
- `/growth` — KOL dan digital marketing
- `/brands` — brand F&B yang dimiliki/dikelola
- `/contact` — business inquiry

**MVP rule:** Jangan membuat semua route sekaligus. Fase pertama cukup `/` dengan section anchor yang jelas. Route tambahan hanya dibuat bila kontennya memang sudah matang.

### Header navigation

Desktop:

- Ecosystem
- Operations
- Technology
- Growth
- Brands
- Tentang Yumme
- CTA: `Diskusikan Bisnis Anda`

Mobile:

- compact top bar;
- menu button 44×44px;
- full-screen/sheet navigation dengan iOS easing;
- satu CTA primer yang tetap terlihat.

---

## 3. Landing Page Section Plan

### Section 01 — Navigation

**Purpose:** Menjelaskan identitas Yumme dan menyediakan satu tindakan utama.

- Logo/wordmark Yumme Group.
- Navigation tidak lebih dari 5–6 item visual.
- CTA primer: `Diskusikan Bisnis Anda`.
- Mobile navigation memakai sheet, bukan dropdown kecil yang sulit disentuh.
- Sticky header boleh translucent hanya jika kontras dan fallback opaque aman.

### Section 02 — Hero

**Headline direction:**

> Build, operate, and grow better F&B businesses.

**Supporting copy:**

> Yumme Group menggabungkan operasional F&B, teknologi, people management, dan growth marketing dalam satu ekosistem yang terhubung.

**Actions:**

- Primary: `Diskusikan Bisnis Anda`
- Secondary: `Lihat Ekosistem Yumme`

**Hero visual direction:**

- bukan dashboard screenshot yang padat;
- bukan stock photo generic;
- gunakan visual yang memperlihatkan hubungan outlet, team, customer, data, dan growth;
- bila membutuhkan illustration/hero art, gunakan `image_generate`, review dengan `vision_analyze`, dan simpan sebagai asset terpisah;
- jangan menaruh copy penting di dalam generated image;
- jangan memakai logo palsu atau tulisan yang rusak di generated asset.

### Section 03 — Operator Advantage

**Message:**

> We do not only build tools for F&B businesses. We understand how to run them.

Tampilkan tiga bukti naratif:

- memahami operasional outlet;
- membangun sistem dari masalah nyata;
- menghubungkan execution dan data.

### Section 04 — Four Pillars

Empat kartu besar, masing-masing satu pesan utama:

1. **Operate** — membuat operasional outlet lebih rapi dan terukur.
2. **People** — membantu team bekerja dengan SOP, jadwal, dan sistem HR yang jelas.
3. **Technology** — menghubungkan POS, customer app, data, dan automation.
4. **Grow** — mengubah insight menjadi campaign, customer retention, dan sales growth.

Cards memakai Apple Wallet-style surface: radius 24px, whitespace cukup, soft shadow, satu accent utama, tidak penuh gradient.

### Section 05 — Technology & Digital Implementation Services

Tampilkan teknologi sebagai layanan implementasi resmi Yumme, bukan sekadar daftar fitur internal:

- Website bisnis dan landing page
- Mobile/web customer app
- POS & cashier operations
- Digital menu & booking
- Inventory & purchasing
- Finance & reconciliation
- HR, attendance & scheduling
- Business dashboards
- Notifications & workflow automation
- Integrasi sistem digital sesuai kebutuhan bisnis

Pesan utama:

> Kami membangun sistem digital yang benar-benar digunakan dalam operasional F&B, seperti ekosistem yang telah diimplementasikan di Djiwa Tentram.

Setiap item harus punya outcome singkat, misalnya:

> POS — membantu transaksi dan operasional kasir tetap terhubung dengan data outlet.
> Website & aplikasi — membangun customer touchpoint dan alur digital yang sesuai dengan kebutuhan brand.

### Section 06 — People & Operations

Tampilkan bahwa pengelolaan F&B bukan hanya software:

- recruitment dan onboarding;
- SOP kerja;
- attendance dan shift;
- payroll dan employee self-service;
- training dan quality control.

CTA sekunder: `Pelajari F&B Operations`.

### Section 07 — Growth Marketing

Tampilkan:

- KOL / creator partnership;
- digital marketing;
- campaign planning;
- content dan social distribution;
- customer retention;
- sales measurement.

Copy harus berhati-hati: gunakan "membantu meningkatkan" atau "menghubungkan campaign dengan data sales", bukan guaranteed revenue claim.

### Section 08 — Brands / Proof of Work

Tampilkan brand atau bisnis yang sudah dikelola secara faktual.

- Djiwa Tentram dapat menjadi initial case/brand.
- Jangan mengarang angka revenue, outlet count, client list, atau testimonial.
- Jika data belum public, gunakan narrative proof tanpa angka.
- Setiap brand card harus punya CTA atau status yang jelas.

### Section 09 — Operating Flywheel

Visual alur sederhana:

```text
Understand the business
        ↓
Design the operating system
        ↓
Run the outlet
        ↓
Measure the data
        ↓
Improve the experience
        ↓
Grow the business
```

Gunakan SVG/HTML real, bukan screenshot flowchart.

### Section 10 — Who We Help

Segmentasi singkat:

- pemilik cafe/resto/coffeeshop;
- brand F&B yang ingin membuka outlet;
- operator yang membutuhkan SOP dan sistem;
- bisnis yang ingin menghubungkan POS, people, dan marketing.

### Section 11 — CTA / Business Inquiry

Headline:

> Ready to build a better F&B operation?

Form MVP minimal:

- nama;
- nama bisnis;
- email/WhatsApp;
- kota;
- kebutuhan utama;
- pesan singkat.

**Data-flow decision gate:** Sebelum implementasi, tentukan apakah inquiry akan masuk ke tabel existing, email, CRM, atau endpoint baru. Jangan membuat form visual yang tidak memiliki persistence/read-back yang jelas.

### Section 12 — Footer

Wajib memuat:

- Yumme Group;
- ringkasan positioning;
- link ecosystem;
- link brand;
- contact;
- legal/privacy bila tersedia;
- credit/ownership yang sudah disetujui.

---

## 4. Design Contract

### Source of truth

- Existing global standard: `/opt/djiwatentramapp/DESIGN.md`.
- New corporate-specific contract: `apps/yumme/DESIGN.md` atau folder app corporate yang disetujui setelah audit struktur deployment.
- Shared tokens: `packages/yumipos-web-shared/src/theme.css` bila token corporate dapat dipakai tanpa mengubah brand existing.
- Jangan membuat token per-section atau CSS global lepas.

### Visual principles

- Light-first, white/near-white surfaces.
- Satu brand accent utama yang restrained.
- Deep ink text, soft neutral surfaces.
- Radius major card 24px.
- Radius controls 14px.
- Minimum touch target 44×44px.
- Soft shadows, bukan black shadow berat.
- Display font berbeda dari body font.
- Lucide line icons, stroke konsisten.
- Emoji tidak dipakai sebagai UI icon.
- Tidak memakai coral/beach/ivory atau warna dekoratif yang tidak berasal dari brand contract.

### Typography

- Display: Plus Jakarta Sans atau display font yang sudah disepakati.
- Body: Geist/Inter fallback.
- H1 target: 40–64px desktop, 34–42px mobile.
- Body utama: 15–17px dengan line-height lega.
- Hindari all-caps berlebihan dan paragraf panjang di hero.

### Motion

- Micro interaction: 180ms.
- Section/sheet transition: 320ms.
- Spring-like entry: 420ms jika memang menjelaskan hierarchy.
- Easing: `cubic-bezier(.32,.72,0,1)`.
- Press feedback: `scale(.97)`.
- Hormati `prefers-reduced-motion`.
- Tidak ada decorative animation yang mengganggu copy atau CTA.

### Responsive targets

Verifikasi wajib pada:

- 375px;
- 390px;
- 430px;
- 768px;
- 1024px;
- 1440px.

Mobile bukan desktop yang diperkecil. Mobile harus memiliki hierarchy sendiri, CTA yang mudah disentuh, dan tidak mengalami horizontal overflow.

### Required UX states

Untuk inquiry/form/data-driven elements:

- loading/skeleton;
- empty;
- inline error;
- success confirmation;
- disabled/pending untuk mencegah double-submit;
- retry bila request gagal;
- accessible focus state;
- reduced-motion state.

---

## 5. DESIGN.md Deliverable

Buat corporate-specific `DESIGN.md` hanya setelah brand decisions disetujui. Struktur wajib:

1. YAML front matter:
   - `version`
   - `name`
   - `description`
   - `colors`
   - `typography`
   - `rounded`
   - `spacing`
   - `components`
2. Markdown sections sesuai urutan:
   - Overview
   - Colors
   - Typography
   - Layout
   - Elevation & Depth
   - Shapes
   - Components
   - Do's and Don'ts
3. Token references menggunakan `{colors.primary}` dan sejenisnya.
4. Lint dengan:

```bash
npx -y @google/design.md lint apps/yumme/DESIGN.md
```

5. Fix broken references dan WCAG contrast warning/error sebelum implementation dianggap siap.
6. Bila dibutuhkan, export:

```bash
npx -y @google/design.md export --format css-tailwind apps/yumme/DESIGN.md > apps/yumme/src/theme.generated.css
npx -y @google/design.md export --format dtcg apps/yumme/DESIGN.md > apps/yumme/tokens.json
```

Export tidak boleh menimpa shared theme tanpa review diff.

---

## 6. Implementation Waves

### Wave 0 — Brand and content decisions (blocking)

**Owner:** Product/CTO + user approval

- Finalisasi nama payung: `Yumme Group` atau alternatif.
- Finalisasi tagline utama.
- Tentukan apakah Djiwa Tentram ditampilkan sebagai owned brand, operated brand, atau case study.
- Setujui target utama landing: client F&B, corporate credibility, atau brand ecosystem.
- Setujui CTA dan channel inquiry.
- Kumpulkan facts yang boleh dipublikasikan; tandai data yang tidak boleh diklaim.

**Output:** approved messaging matrix.

### Wave 1 — Repo/deployment discovery

**Profile:** `subagent-frontend` atau direct audit

- Audit pola app standalone existing (`apps/booking`, `apps/kol`, `apps/500kopitasik`).
- Audit deployment scripts/webroot/domain mapping.
- Tentukan app path canonical, misalnya `apps/yumme` hanya setelah mapping diverifikasi.
- Audit shared theme/components dan dependency existing.
- Jangan deploy atau mengubah DNS pada wave ini.

**Output:** app-to-domain mapping dan file impact list.

### Wave 2 — Design contract

**Profile:** `subagent-frontend`

- Tulis corporate `DESIGN.md`.
- Tentukan color tokens setelah brand direction disetujui.
- Tentukan typography, spacing, radius, elevation, button, nav, cards, form, footer.
- Lint `DESIGN.md`.
- Export tokens hanya bila tidak menimbulkan fork shared design system.

**Output:** linted `DESIGN.md` + token review.

### Wave 3 — Content and visual prototype

**Profile:** `subagent-frontend`

- Buat content map dan copy deck.
- Buat low-fidelity section outline.
- Bila membutuhkan hero/brand visual, generate asset terpisah dengan image generation dan review actual output.
- Buat responsive layout prototype tanpa backend inquiry terlebih dahulu.

**Output:** screenshot/contact sheet pada mobile dan desktop untuk approval visual.

### Wave 4 — Landing implementation

**Profile:** `subagent-frontend`

- Implement app shell, navigation, hero, pillars, ecosystem, proof, flywheel, CTA, footer.
- Reuse existing dependencies; jangan menambah dependency hanya untuk decorative UI.
- Use semantic HTML and accessible labels.
- Keep sections composable; jangan membuat satu file monolitik.
- Implement mobile sheet navigation and desktop navigation separately where semantics require.

**Output:** running local app with all public sections.

### Wave 5 — Inquiry integration

**Profile:** `subagent-backend` + `subagent-frontend`

- Decide persistence destination before coding.
- Add server-side validation and rate limiting/abuse consideration.
- Add success/error/pending/read-back evidence.
- Do not send real/dummy production inquiry without explicit approval and cleanup plan.

**Output:** traced UI → API → persistence → operator read-back flow.

### Wave 6 — QA and release verification

**Profile:** `subagent-qa-tester` + `subagent-deployment`

- Build/typecheck/lint.
- Verify 375/390/430/768/1024/1440 widths.
- Screenshot actual rendered page.
- Check no horizontal overflow or CTA clipping.
- Check console/network errors.
- Verify SEO metadata, OG tags, favicon, manifest if PWA is used.
- Deploy only the corporate app to the verified `djiwatentram.web.id` webroot.
- Smoke test `djiwatentram.web.id`, assets, cache, and canonical URL.

**Output:** visual QA evidence + deployment response.

---

## 7. Dependency Graph

```text
Level 1 — independent / discussion
├── Brand positioning and tagline decisions
├── Audience and CTA decisions
├── Fact/evidence inventory for public claims
└── Existing app/deployment mapping audit

Level 2 — sequential
├── Approved messaging matrix
│   └── Corporate DESIGN.md
│       └── Content deck and wireframe
│           └── Landing implementation
│               └── Inquiry integration
└── Deployment mapping ──→ release configuration

Level 3 — verification
└── Build + screenshots + responsive QA + runtime smoke test
```

### Same-file safety

Tasks modifying the same route, theme, or CSS file must run sequentially. Independent asset/content audits may run in parallel, but all implementation must wait for Wave 0 decisions.

---

## 8. Acceptance Criteria

### Product

- Visitor understands Yumme Group's role within 3 seconds.
- Visitor can distinguish owned F&B brands from services for external clients.
- Four pillars are understandable without technical jargon.
- One primary CTA is obvious on every viewport.
- No unsupported client, revenue, outlet, or performance claims.

### Design

- Conforms to AI Product Design DNA v2.0.
- Conforms to root `DESIGN.md` unless corporate exception is documented.
- Apple/iOS interaction language: calm hierarchy, clear controls, purposeful motion, safe touch targets.
- Uses a single coherent accent palette.
- Uses separate display/body typography.
- No generic SaaS template appearance.
- No emoji as UI icons.
- No decorative animation that competes with copy.

### Accessibility

- Semantic landmarks and heading hierarchy.
- Keyboard navigation and visible focus.
- WCAG AA contrast.
- Touch targets at least 44×44px.
- Reduced motion support.
- Form labels and errors programmatically associated.

### Responsive

- No unintended horizontal overflow.
- Hero copy and CTA do not clip at 375px.
- Navigation sheet does not cover content or trap focus incorrectly.
- Desktop uses a centered, restrained max-width layout rather than stretched cards.

### Engineering

- No business logic changes in existing apps.
- No destructive database changes.
- No hardcoded secrets.
- `djiwatentram.web.id` deployment mapping is verified before release.
- Build/typecheck passes for the new app.
- Live screenshot and console/network check are captured before claiming completion.

---

## 9. Risks and Rollback

| Risk | Mitigation |
|---|---|
| Positioning terlalu luas | Lock one-sentence positioning and four-pillar model before implementation |
| Corporate page terasa seperti SaaS template | Lead with operator proof and business outcomes, not feature grid |
| Claim tidak terbukti | Maintain public fact inventory and evidence labels |
| Brand conflict dengan Djiwa Tentram | Separate parent/company/store/app naming matrix |
| New app deployment salah webroot | Verify domain → webroot → build artifact before deploy |
| Generated visual asset inconsistent | Generate with explicit brief, review actual image, regenerate if needed |
| Mobile overflow | Screenshot matrix at 375/390/430px and inspect DOM/console |
| Inquiry data tidak terbaca operator | Define persistence + read-back before form implementation |
| Shared design regression | Add corporate tokens incrementally; do not rewrite global shared components |
| SEO/performance poor | Static-first sections, optimized assets, metadata, lazy-load noncritical visuals |

### Rollback

- Landing app can be disabled/repointed without touching existing F&B apps.
- Do not modify existing domain routes until the new `djiwatentram.web.id` artifact is verified.
- Keep previous `djiwatentram.web.id` deployment artifact available for immediate revert.
- Any database inquiry migration must be additive and separately reversible with explicit approval.

---

## 10. Verification Commands

Commands to run during implementation, not during this planning-only phase:

```bash
cd /opt/djiwatentramapp

# Inspect changed scope
git diff --name-only HEAD

# Design contract
npx -y @google/design.md lint apps/yumme/DESIGN.md

# New app checks (exact scripts depend on final app scaffold)
bun run --cwd apps/yumme build
bun run --cwd apps/yumme typecheck

# Formatting and whitespace
git diff --check

# Runtime checks after deployment
curl -skI https://djiwatentram.web.id
curl -skL https://djiwatentram.web.id/ | head -c 2000
```

Use selective git staging only:

```bash
git add apps/yumme/DESIGN.md apps/yumme/src/... docs/...
```

Never use `git add -A` or `git add .`.

---

## 11. Approval Gates

### Gate A — Strategy approval

User approves:

- positioning;
- audience;
- tagline direction;
- four pillars;
- relationship between Yumme Group, Djiwa Tentram, and future brands;
- primary CTA.

### Gate B — Visual approval

User reviews screenshot/contact sheet for:

- Apple/iOS quality;
- hierarchy;
- typography;
- spacing;
- color;
- mobile behavior;
- hero visual direction.

### Gate C — Technical approval

User approves:

- app/domain architecture;
- inquiry persistence approach;
- deployment path;
- public claims and case-study data.

Only after Gate A should implementation begin.

---

## Confirmed Decisions

1. Nama payung final: **Yumme Group**.
2. Copy/tagline utama: **Bahasa Indonesia**.
3. CTA utama: mendapatkan **client F&B**.
4. Djiwa Tentram: ditampilkan sebagai **operator proof/case study dan brand utama**.
5. F&B operations management: **layanan resmi**.
6. Layanan teknologi resmi juga mencakup **website, landing page, mobile/web customer app, POS, HR/attendance, dashboard, workflow automation, dan sistem digital lain** yang telah diimplementasikan di Djiwa Tentram.

## Remaining Technical Decisions

- Persistence channel untuk business inquiry masih harus dipilih sebelum form benar-benar diaktifkan: email, CRM, atau endpoint/database baru.
- Mapping webroot/deployment `djiwatentram.web.id` masih perlu diverifikasi di server/Vercel sebelum production deploy.
