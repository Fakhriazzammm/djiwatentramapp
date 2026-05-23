# Plan: Perombakan /admin/recipe/view — Step-by-Step Resep yang Rapih

## Goal
Merombak halaman `/admin/recipe/view` agar setiap resep memiliki langkah-langkah (step-by-step) yang detail, rapi, dan informatif — mirip tutorial barista profesional. Setiap langkah mencakup: alat yang digunakan, bahan, teknik, takaran, suhu, waktu, dan garnish.

---

## Current Context

### Existing Implementation
- **Component**: `apps/web/src/components/admin/recipe-view.tsx` (554 lines, `// @ts-nocheck`)
- **Routes**: `/admin/recipe/view` (loads `RecipeViewPage`)
- **Data model**:
  - `pos.recipes` → public view `pos_recipes`: `{ _id, productId, variantName, ingredients (JSONB), raw (JSONB) }`
  - `pos.base_recipes` → public view `pos_base_recipes`: `{ _id, name, description, category, targetUnit, targetQuantity, ingredients (JSONB), raw (JSONB) }`
- **Current view behavior**:
  - List view: Base Recipes (`BaseRecipeDetail`) + Product Recipes (`ProductRecipeDetail`)
  - Detail view: Hardcoded 4-step pipeline using `buildProcessBuckets()` — no actual step data stored
  - Steps are computed dynamically from ingredient keyword matching (keyword-based → imprecise)
  - Recipe editor (`recipe-book.tsx`) — only edits ingredients, no step management

### Gap
- **Tidak ada kolom `steps` di database** — langkah-langkah saat ini di-generate dari heuristic (keyword matching di `buildProcessBuckets`)
- **Tidak ada editor steps** — user tidak bisa mengelola langkah-langkah per resep
- **Tidak ada konten** — langkah detail (suhu, waktu, teknik, alat) tidak tersimpan

---

## Proposed Approach

Tambahkan kolom `steps` (JSONB) di `pos.recipes` dan `pos.base_recipes`, lalu bangun:
1. **Editor Steps** — di `recipe-book.tsx` (atau komponen terpisah) untuk menambah/edit/reorder steps
2. **Viewer Steps** — overhaul total `recipe-view.tsx` untuk menampilkan steps sebagai kartu bernomor yang indah
3. **Migration** — tambah kolom, update public views, update tipe TypeScript
4. **Content seeding** — riset & isi step-by-step untuk menu yang sudah ada

### Data Structure untuk Steps

```ts
type RecipeStep = {
  order: number;           // urutan (1-based)
  title: string;           // judul singkat: "Grinder Biji Kopi"
  description: string;     // deskripsi detail: "Giling 18gr biji kopi arabika..."
  icon?: string;           // optional: "coffee", "scale", "thermometer", "grinder"
  timerSeconds?: number;   // optional: timer countdown 30 = 30 detik
  temperature?: string;    // optional: "90°C"
  ingredientIds?: string[]; // optional: link ke inventory IDs yang digunakan di langkah ini
};
```

Disimpan di `steps` column sebagai `JSONB`:
```json
[
  { "order": 1, "title": "Siapkan Alat & Bahan", "description": "Siapkan grinder, timbangan digital, portafilter, dan tamper. Pastikan semua alat bersih dan kering.", "icon": "tool" },
  { "order": 2, "title": "Grinder Biji Kopi", "description": "Timbang 18gr biji kopi arabika. Giling dengan grind size medium-fine (setting 15-18 pada grinder).", "icon": "grinder", "timerSeconds": null, "temperature": null, "ingredientIds": ["inv_xxx"] }
]
```

---

## Database Schema

### Migration File: `supabase/migrations/20260520_add_recipe_steps.sql`

```sql
-- Tambah kolom steps ke pos.recipes
alter table pos.recipes
  add column if not exists steps jsonb not null default '[]'::jsonb;

-- Tambah kolom steps ke pos.base_recipes  
alter table pos.base_recipes
  add column if not exists steps jsonb not null default '[]'::jsonb;

-- Update public view untuk recipes
create or replace view public.pos_recipes
with (security_invoker = true) as
select
  source_id as _id,
  product_source_id as "productId",
  variant_name as "variantName",
  ingredients,
  steps,           -- ← NEW
  raw
from pos.recipes;

-- Update public view untuk base_recipes
create or replace view public.pos_base_recipes
with (security_invoker = true) as
select
  source_id as _id,
  name,
  description,
  category,
  target_unit as "targetUnit",
  target_quantity as "targetQuantity",
  ingredients,
  steps,           -- ← NEW
  raw
from pos.base_recipes;
```

---

## UI/UX Specification

### 1. Recipe Viewer — `/admin/recipe/view` (Overhaul Total)

#### Layout
```
┌─────────────────────────────────────────┐
│ ← Kembali ke daftar                      │
│                                          │
│ ☕ Nama Menu                              │
│ Kategori • X langkah • ~Y menit          │
│                                          │
│ ┌─── Timeline Vertikal ──────────────┐   │
│ │                                     │   │
│ │ ⓵ Siapkan Alat & Bahan             │   │
│ │ ┌─ Card ──────────────────────┐     │   │
│ │ │ 📋 Deskripsi detail...      │     │   │
│ │ │ 🛠 Alat: Grinder, Timbangan  │     │   │
│ │ │ ⏱ 30 detik                  │     │   │
│ │ └─────────────────────────────┘     │   │
│ │                                     │   │
│ │ ⓶ Grinder Biji Kopi                │   │
│ │ ┌─ Card ──────────────────────┐     │   │
│ │ │ ⚖️ Timbang 18gr...           │     │   │
│ │ │ 🔥 Suhu: 90°C               │     │   │
│ │ │ 🥜 Bahan: Beans Arabika      │     │   │
│ │ └─────────────────────────────┘     │   │
│ │                                     │   │
│ │ ⓷ ...dan seterusnya                │   │
│ │                                     │   │
│ └─────────────────────────────────────┘   │
│                                          │
│ [📄 X bahan total] (collapsible)          │
└─────────────────────────────────────────┘
```

#### Design Principles
- **Timeline vertikal**: Setiap step adalah node dalam timeline dengan connector line
- **Card per step**: Ikon, judul, deskripsi, metadata (suhu, waktu, alat, bahan terkait)
- **Numbered circles**: Step number dalam lingkaran dengan warna berbeda
- **Linked ingredients**: Setiap step bisa menampilkan bahan yang digunakan di step tersebut
- **Timer badge**: Step dengan timer menampilkan ⏱ X detik
- **Temperature badge**: Step dengan suhu menampilkan 🌡️ XX°C
- **Mobile responsive**: Timeline mengecil di mobile tapi tetap terbaca

#### States

| State | Behavior |
|---|---|
| **Loading** | Skeleton: header + 3 card skeleton |
| **Empty** (no steps) | "Belum ada langkah-langkah untuk resep ini. Kelola langkah di halaman Resep." + tombol ke /admin/recipe |
| **Populated** | Timeline dengan semua steps |
| **Error** | Toast error + fallback ke ingredient list |

#### Per-Component States

**RecipeStepCard:**
- **Normal**: Icon + title + description + metadata badges
- **With timer**: Timer badge + optional countdown button (future)
- **With linked ingredients**: Ingredient chip badges di bagian bawah card
- **Expanded**: (future) bisa expand/collapse untuk detail lebih lanjut

### 2. Recipe Editor — Steps Management

**Lokasi**: Bagian baru di `recipe-book.tsx` — tab/section "Langkah-Langkah" di samping "Bahan-Bahan"

**Fitur Editor:**
- **Add step**: Form: title (input), description (textarea), icon (picker), timer (number), temperature (text), linked ingredients (multi-select dari inventory)
- **Reorder**: Drag-and-drop atau ↑↓ buttons
- **Edit**: Inline edit atau modal
- **Delete**: Konfirmasi + hapus
- **Preview**: Side-by-side preview step card

---

## Files Likely to Change

| File | Change Type | Description |
|---|---|---|
| `supabase/migrations/20260520_add_recipe_steps.sql` | **NEW** | Migration: add steps column + update views |
| `apps/web/src/components/admin/recipe-view.tsx` | **MAJOR** | Overhaul: timeline viewer with step cards |
| `apps/web/src/components/admin/recipe-book.tsx` | **MODERATE** | Add steps editor tab/section |
| `apps/web/src/hooks/use-hybrid-inventory-admin-data.ts` | **MINOR** | Update types `RecipeRecord`, `BaseRecipeRecord` → add `steps` |
| `apps/web/src/hooks/use-hybrid-write-actions.ts` | **MODERATE** | `useHybridSaveRecipe()` — pass steps to payload. `useHybridUpdateBaseRecipe()` — add steps support |
| `apps/web/src/components/admin/recipe-matrix.tsx` | **NONE** | No change needed |
| `apps/web/src/components/admin/recipe-hpp.tsx` | **NONE** | No change needed |
| `apps/web/src/routes/admin/route.tsx` | **NONE** | No change needed |

---

## Implementation Steps

### Wave 1 (Paralel 🔥)

**Task 1: DB Migration**
- Buat file `supabase/migrations/20260520_add_recipe_steps.sql`
- Tambah kolom `steps` ke `pos.recipes` dan `pos.base_recipes`
- Recreate public views `pos_recipes` dan `pos_base_recipes` dengan kolom `steps`
- Run migration via Supabase

**Task 2: Update Types & Hooks**
- Update `RecipeRecord` type → tambah `steps?: RecipeStep[]`
- Update `BaseRecipeRecord` type → tambah `steps?: RecipeStep[]`
- Update `useHybridSaveRecipe()` → include `steps` di payload (simpan di kolom steps + raw)
- Update `useHybridUpdateBaseRecipe()` → support `args.steps`
- Export tipe `RecipeStep` untuk digunakan di komponen viewer & editor

### Wave 2 (Paralel 🔥)

**Task 3: Steps Editor di recipe-book.tsx**
- Tambah tab/accordion "Langkah-Langkah" di form edit resep
- UI: list of steps dengan ↑↓ reorder, edit, delete
- Form add/edit: title, description, timer, temperature, icon
- Simpan steps via existing save hooks

**Task 4: Overhaul Recipe Viewer**
- Hapus `buildProcessBuckets()` dan hardcoded step pipeline
- Baca `steps` langsung dari data resep
- Render timeline vertikal dengan:
  - StepCard: icon dinamis, title, description, metadata badges
  - Connector line antar step
  - Collapsible ingredient list di bottom
  - Empty state: "Belum ada langkah" + link ke editor
- Hapus `ALA_CARTE_PROCESS_CONFIGS` (sudah tidak dipakai)
- Hapus `formatIngredientAmount()` logic khusus ala carte (pindah ke data step)

### Wave 3: AI-Powered Content Generation 🔥🔥 (Paralel per Menu)

**Task 5: Fetch Data Menu dari Database**
- Baca daftar semua produk yang punya resep dari `public.pos_recipes` dan `pos_products`
- Baca daftar base recipes dari `public.pos_base_recipes`  
- Untuk setiap product, kumpulkan: nama produk, nama bahan-bahan (dari inventory), kategori

**Task 6: AI Web Research + Content Generation (Batch Paralel per Menu)**
Untuk setiap menu item, lakukan **3-phase pipeline** secara paralel (batch 5 menu per wave):

**Phase A — Web Research (subagent per menu)**
```
Subagent untuk Menu A: cari "nama menu recipe step by step coffee shop"
- web_search(query="nama menu coffee recipe ingredients instructions")
- web_extract(url) — ambil konten dari artikel terbaik
- Kumpulkan: bahan, takaran, suhu, waktu, teknik, alat
```
**Phase B — AI Generate Steps (subagent per menu)**
```
Subagent untuk Menu A: generate RecipeStep[] dari hasil research
Input: { productName, ingredients[], webResearchText }
Output: RecipeStep[] yang sudah diformat
- Gunakan pengetahuan barista (suhu steam susu 60-65°C, espresso 25-30dtk, dll)
- Setiap step: title, description detail (+ teknik, alat, tips), timerSeconds, temperature, ingredientIds
```
**Phase C — Inject ke Database (batch SQL update)**
```
Setelah semua menu selesai, kumpulkan semua hasil dan inject via:
UPDATE pos.recipes SET steps = '[...]'::jsonb WHERE product_source_id = 'xxx';
UPDATE pos.base_recipes SET steps = '[...]'::jsonb WHERE source_id = 'yyy';
```

**Total estimasi:** ~30 menu → 6 waves of 5 menu → selesai dalam 1-2 sesi

---

## Integration Points

### AI-Powered Generation (In-App)
- **"Generate Steps dengan AI" button** di recipe-view (empty state) dan recipe-editor
- Panggil action Yumi AI: `"generateRecipeSteps"`
  - Input: `{ productName, ingredients: [{ name, amount, unit }], category }`
  - Output: `RecipeStep[]` (3-8 langkah)
- User bisa **accept**, **edit**, atau **regenerate**
- Flow: AI generate → preview → save → tampil di viewer

### Yumi AI Endpoint
Endpoint baru di `yumi-ai` edge function:
```ts
// action: "generateRecipeSteps"
// Prompt ke LLM:
`Buatkan step-by-step pembuatan minuman "${productName}" 
dengan bahan-bahan: ${ingredients.map(i => `${i.amount} ${i.unit} ${i.name}`).join(', ')}
Format: JSON array dengan field: order, title, description, icon, timerSeconds?, temperature?, ingredientIds?
Gunakan pengetahuan barista profesional: suhu steam susu 60-65°C, 
espresso extraction 25-30 detik,水温 untuk V60 90-96°C, dll.`
```

### Web Research (Sidecar untuk Data Seeding)
- Sebagai LLM, saya bisa melakukan `web_search()` dan `web_extract()` langsung
- Pipeline: ambil data menu dari DB → untuk setiap menu cari referensi online → generate steps → inject
- Tidak perlu Yumi AI untuk tahap seeding — saya lakukan langsung

### Recipe → HPP Linkage
- Steps tidak langsung mempengaruhi HPP, tapi bisa menampilkan biaya per step
- Future: tampilkan "Biaya step ini: Rp X.XXX" di setiap step card

---

## AI-Powered Content Seeding Pipeline

### Alur Kerja

```
Step 1: Baca Semua Menu dari Database
  ├── supabase.from("pos_products").select("*")
  ├── supabase.from("pos_recipes").select("*, productId")
  └── supabase.from("pos_inventory").select("*")
        ↓
Step 2: Group by Kategori Minuman
  ├── Kopi (Espresso-based, Manual Brew) 
  ├── Non-Kopi (Teh, Coklat, dll)
  └── Makanan (jika ada)
        ↓
Step 3: Batch 5 Menu → Paralel 🔥
  ┌──────────────────────────────────────────────┐
  │ Subagent Menu A: web_research + generate     │
  │ Subagent Menu B: web_research + generate     │
  │ Subagent Menu C: web_research + generate     │
  │ Subagent Menu D: web_research + generate     │
  │ Subagent Menu E: web_research + generate     │
  └──────────────────────────────────────────────┘
        ↓
Step 4: Inject ke Database (batch UPDATE)
  └── pos.recipes.steps = '[...]'::jsonb untuk setiap menu
```

### Strategi Web Research per Menu

| Jenis Menu | Sumber Riset | Keywords |
|---|---|---|
| **Espresso-based** (Latte, Cappuccino, dll) | Starbucks at Home, Barista Hustle | "espresso recipe step by step" |
| **Manual brew** (V60, Cold Brew, dll) | Serious Eats, Perfect Daily Grind | "V60 pour over recipe instructions" |
| **Signature drink** (Spanish Latte, dll) | YouTube barista, Julius Meinl | "Spanish latte barista recipe" |
| **Minuman Nusantara** (Kopi Susu, Es Kopi Gula Aren) | Cookpad, Kompas Food | "resep kopi susu gula aren" |
| **Non-coffee** (Matcha, Chocolate) | Starbucks recipe | "matcha latte recipe steps" |

### Estimasi Waktu

- **30 menu** ÷ **5 paralel** = **6 waves**
- Per wave: ~2-3 menit (research + generate + review)
- **Total: ~15-20 menit** untuk seeding semua konten
- Bandingkan dengan manual: bisa 3-5 jam

---

## Implementation Checklist

- [ ] DB Migration: tambah `steps` JSONB column
- [ ] DB Migration: recreate public views
- [ ] Run migration
- [ ] Update TypeScript types (`RecipeRecord`, `BaseRecipeRecord`)
- [ ] Update write hooks (`useHybridSaveRecipe`, `useHybridUpdateBaseRecipe`)
- [ ] Build Steps Editor UI (file baru: `recipe-steps-editor.tsx`)
- [ ] Overhaul Recipe Viewer (recipe-view.tsx)
- [ ] Handle empty state: "Belum ada langkah" + "Generate dengan AI" button
- [ ] Handle loading state: skeleton
- [ ] Handle error state: fallback ke daftar bahan
- [ ] Mobile responsive
- [ ] Build verification (`npx tsc --noEmit`)
- [ ] **AI Content Seeding**: web_search → generate steps → inject DB (batch paralel 5 menu)
- [ ] Verifikasi: setiap menu yang punya resep sekarang punya steps

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing recipes tanpa steps akan menampilkan empty state | User bingung | Tambah "Generate dengan AI" button + fallback ke ingredient list lama |
| Tab corruption di `patch` untuk file TSX besar (recipe-view.tsx = 554 lines, tab-indented) | Syntax error | Gunakan `execute_code` dengan Python `open()` — jangan `patch` |
| recipe-book.tsx sudah 635 lines — tambah steps editor bisa overload | Component terlalu besar | Ekstrak StepsEditor ke file terpisah `recipe-steps-editor.tsx` |
| AI generate steps mungkin kurang akurat untuk menu unik | Kualitas konten rendah | Manual review + edit setelah generate. "Generate Ulang" button di UI |
| Web search tidak menemukan referensi untuk menu tertentu | Tidak ada data untuk AI | Gunakan pengetahuan default barista: suhu, waktu, teknik standar |
| Steps migration perlu update ribuan baris data existing | Migration lambat | Gunakan default `'[]'::jsonb` — tidak perlu backfill, kosong aman |

---

## Open Questions

1. **Icon system** — Gunakan icon dari Lucide (existing library) atau custom emoji? Lucide lebih consistent dengan UI existing
2. **Timer integration** — Step timer sebagai informasi saja (badge) atau interaktif (countdown button)? Saran: badge dulu, interaktif di fase kedua
3. **Generate ulang** — Apakah perlu tombol "Generate Ulang" di viewer? Ini berguna kalau hasil AI kurang pas
4. **Batch size** — 5 menu per wave, atau 10? 5 lebih aman untuk kualitas, 10 lebih cepat
