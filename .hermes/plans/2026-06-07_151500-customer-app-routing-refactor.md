# Customer App — Routing Refactor & Guest Flow

> **Untuk Hermes:** Implementasi plan ini task-by-task via `subagent-driven-development`.
> Mulai eksekusi setelah user approve plan.

**Goal:** Split single-page customer ordering app into proper routes with guest form flow (daftar) and step-based ordering, tanpa mengubah payment flow yang sudah stabil.

**Arsitektur:** Hybrid — `/daftar` route baru untuk guest, `/order` route baru untuk flow ordering, step di query param (`?step=party|menu|checkout|payment`), state di React Context (belum DB-backed).

**Phase:** 1 (dari 2 — quick win 3-4 jam; Phase 2 = DB sessions, full routing per step)

---

## Current Context

```
/ (index.lazy.tsx)
  └── customer-ordering-page.tsx (788 lines, 35KB — monolith)
      ├── Step welcome     → guest skip / member login
      ├── Step party       → party size selector
      ├── Step refill      → free refill opt-in
      ├── Step menu        → katalog + cart
      ├── Step checkout    → detail + payment choice
      ├── Step receipt     → confirmation
```

- **1 route** → semua state di 1 file
- **Guest flow** → user langsung klik "Mulai pesan" tanpa isi data
- **Step** → state-driven (`useState<Step>`), no URL representation
- **TanStack Router** → route tree: `/`, `/profile`, `/minigames`

---

## Perubahan Arsitektur

### Route Tree (Baru)

```
/                       → Landing (welcome guest/member — seperti sekarang)
/daftar                 → Form registrasi guest (nama, email, no WA)
/order                  → Flow ordering (step via query param)
/order?step=party       → Party size
/order?step=menu        → Menu / Katalog
/order?step=checkout    → Checkout
/order?step=payment     → Payment
/order?step=receipt     → Confirmation
```

### State Management (Baru)

Semua state yang sekarang di `customer-ordering-page.tsx` dipindah ke **`OrderContext`** (React Context):

```tsx
// OrderContext menyediakan:
{
  step, setStep,
  partySize, setPartySize,
  freeRefillOptIn, setFreeRefillOptIn,
  menuMode, setMenuMode,
  activeCategoryId, setActiveCategoryId,
  manualCode, setManualCode,
  codeFeedback, setCodeFeedback,
  cart, setCart, addToCart, updateCartQuantity,
  cartOpen, setCartOpen,
  serviceOpen, setServiceOpen,
  scannerOpen, setScannerOpen,
  productSheet, setProductSheet,
  paymentChoice, setPaymentChoice,
  customerName, setCustomerName,
  tableNumber, setTableNumber,
  notes, setNotes,
  dessertLater, setDessertLater,
  receipt, setReceipt,
  isSubmitting, setIsSubmitting,
  // Computed
  total, totalItems, subtotal, grossSubtotal, promoDiscount,
  taxAmount, serviceChargeAmount, freeRefillCharge,
  // Auth (dari existing context)
  isAuthenticated, customer, authLoading,
}
```

### Guest Data Flow

```
[Guest] → / (landing)
           ↓ (klik "Mulai pesan")
         /daftar (form)
           ↓ (isi nama, email, no WA)
         save ke localStorage
           ↓ (klik "Lanjut")
         /order?step=party
           
[Member] → / (landing, sudah login)
            ↓ (auto-detect)
          /order?step=party
```

---

## Task Breakdown

### Task 1: Buat OrderContext

**Files:**
- Create: `apps/customer/src/hooks/use-order-context.tsx`

**Step 1:** Buat file context dengan semua state yang di-extract dari `customer-ordering-page.tsx`.

```tsx
// konten inti:
type OrderStep = "party" | "refill" | "menu" | "checkout" | "payment" | "receipt";

interface OrderContextType {
  step: OrderStep;
  setStep: (step: OrderStep) => void;
  partySize: number;
  setPartySize: (n: number) => void;
  freeRefillOptIn: boolean | null;
  setFreeRefillOptIn: (v: boolean | null) => void;
  menuMode: MenuMode;
  setMenuMode: (v: MenuMode) => void;
  activeCategoryId: Id<"categories"> | null;
  setActiveCategoryId: (v: Id<"categories"> | null) => void;
  manualCode: string;
  setManualCode: (v: string) => void;
  codeFeedback: string;
  setCodeFeedback: (v: string) => void;
  cart: CartItem[];
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  serviceOpen: boolean;
  setServiceOpen: (v: boolean) => void;
  scannerOpen: boolean;
  setScannerOpen: (v: boolean) => void;
  productSheet: any | null;
  setProductSheet: (v: any | null) => void;
  paymentChoice: PaymentChoice;
  setPaymentChoice: (v: PaymentChoice) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  tableNumber: string;
  setTableNumber: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  dessertLater: boolean;
  setDessertLater: (v: boolean) => void;
  receipt: ReceiptState | null;
  setReceipt: (v: ReceiptState | null) => void;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  // computed helpers
  addToCart: (item: CartItem) => void;
  updateCartQuantity: (productId: Id<"products">, variant: string | undefined, delta: number) => void;
  // guest data
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  setGuestName: (v: string) => void;
  setGuestEmail: (v: string) => void;
  setGuestPhone: (v: string) => void;
}
```

**Step 2:** Provider wrapper — pasang di `__root.tsx` bersama `CustomerAuthProvider` existing.

**Step 3:** Export `useOrderContext()` hook.

**Verifikasi:** Build lulus, tidak ada error import.

---

### Task 2: Buat Route `/daftar` (Guest Form)

**Files:**
- Create: `apps/customer/src/routes/daftar.tsx`
- Create: `apps/customer/src/routes/daftar.lazy.tsx`

**Step 1: `daftar.tsx`** — route definition:
```tsx
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/daftar")({});
```

**Step 2: `daftar.lazy.tsx`** — form component:

```tsx
function DaftarPage() {
  const { guestName, setGuestName, guestEmail, setGuestEmail, guestPhone, setGuestPhone } = useOrderContext();
  const navigate = useNavigate();

  const handleSubmit = () => {
    if (!guestName.trim()) { toast.error("Nama wajib diisi"); return; }
    // Save ke localStorage
    localStorage.setItem("guest-data", JSON.stringify({ name: guestName, email: guestEmail, phone: guestPhone }));
    navigate({ to: "/order", search: { step: "party" } });
  };

  return (
    <div className="min-h-app bg-background">
      <header className="sticky top-0 z-20 ...">
        {/* back button + logo */}
      </header>
      <main className="px-3 py-4">
        <h2 className="text-lg font-black">Data diri</h2>
        <p className="text-xs text-muted-foreground">Isi data kamu sebelum mulai memesan.</p>
        
        {/* Guest form */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-bold">Nama *</label>
            <input value={guestName} onChange={e => setGuestName(e.target.value)} 
              className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Nama kamu" />
          </div>
          <div>
            <label className="text-xs font-bold">Email</label>
            <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} 
              className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="email@example.com" type="email" />
          </div>
          <div>
            <label className="text-xs font-bold">No. WhatsApp</label>
            <input value={guestPhone} onChange={e => setGuestPhone(e.target.value)} 
              className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="08xxxx" type="tel" />
          </div>
        </div>

        <button onClick={handleSubmit} className="mt-6 w-full rounded-xl py-3 text-sm font-black text-white" 
          style={{ background: themeColor }}>
          Lanjut memesan
        </button>
      </main>
    </div>
  );
}
```

**Verifikasi:** Buka `/daftar` → form muncul, isi data → klik "Lanjut memesan" → redirect ke `/order?step=party`.

---

### Task 3: Buat Route `/order` + Step Map

**Files:**
- Create: `apps/customer/src/routes/order.tsx`
- Create: `apps/customer/src/routes/order.lazy.tsx`

**Step 1: `order.tsx`** — route definition dengan query param `step`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const orderSearchSchema = z.object({
  step: z.enum(["party", "refill", "menu", "checkout", "payment", "receipt"]).optional().default("party"),
  orderId: z.string().optional(),
  table: z.string().optional(),
});

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>) => orderSearchSchema.parse(search),
});
```

**Step 2: `order.lazy.tsx`** — render step sesuai query param `step`:

```tsx
function OrderPage() {
  const { step, setStep, ... } = useOrderContext();
  const search = Route.useSearch();
  const navigate = useNavigate();

  // Sync query param → context state on mount
  useEffect(() => {
    if (search.step && search.step !== step) {
      setStep(search.step);
    }
  }, [search.step]);

  // Sync context state → query param on step change
  useEffect(() => {
    navigate({ to: "/order", search: { step, ...(step === "receipt" ? { orderId: receipt?.orderId } : {}) }, replace: true });
  }, [step]);

  // ── Extract & render existing step sections from customer-ordering-page.tsx ──
  // Reuse: menu-section.tsx, checkout-section.tsx, receipt-section.tsx
  // Inline: party section (currently ~30 lines in customer-ordering-page.tsx)
  // Inline: refill section (currently ~20 lines)

  return (
    <div className="app-page min-h-app">
      <div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
        {/* Header — reuse existing pattern */}
        <header>...</header>

        <main className={cn("flex-1", step === "menu" ? "overflow-y-auto pb-24" : step === "receipt" ? "overflow-y-auto pb-32" : "overflow-hidden pb-20")}>
          {step === "party" && <PartySection />}
          {step === "refill" && <RefillSection />}
          {step === "menu" && renderMenuSection({...})}
          {step === "checkout" && renderCheckoutSection({...})}
          {step === "receipt" && receipt && renderReceiptSection({...})}
        </main>

        {/* Bottom bar */}
        {step !== "party" && step !== "refill" && <BottomBar />}
      </div>

      {/* Sheets — cart, service, scanner, product */}
      <CartSheet />
      <ServiceSheet />
      <ScannerSheet />
      <ProductSheet />
    </div>
  );
}
```

**Step 3:** Extract PartySection, RefillSection, BottomBar, CartSheet, ServiceSheet, ScannerSheet, ProductSheet components from `customer-ordering-page.tsx`.

**Verifikasi:** Buka `/order?step=party` → party size selector muncul. Ganti step via URL.

---

### Task 4: Perbaiki Landing Page `/` — Guest vs Member

**Modify:**
- `apps/customer/src/routes/index.lazy.tsx`
- `apps/customer/src/routes/index.tsx`

**Step 1:** Di `index.lazy.tsx`, deteksi status auth:

```tsx
function BrandCustomerOrderingRoute() {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const navigate = useNavigate();

  // Already logged in → go to order
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/order", search: { step: "party" } });
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) return <LoadingSpinner />;
  if (isAuthenticated) return <Redirecting />;

  // Guest → show welcome page
  return <WelcomePage />;
}
```

**Step 2:** Extract Welcome section dari `customer-ordering-page.tsx` ke komponen sendiri, dengan 2 tombol:
- "Mulai pesan" → navigate(`/daftar`) untuk guest
- "Masuk / Daftar untuk poin" → buka AuthModal

**Verifikasi:** Guest buka `/` → landing page → klik "Mulai pesan" → `/daftar`. Member (sudah login) → auto-redirect ke `/order?step=party`.

---

### Task 5: Buat AuthHeader + ProfileCard di `/order`

**Modify:**
- `apps/customer/src/routes/order.lazy.tsx`
- `apps/customer/src/components/customer/auth-header.tsx` (minor)

Step `/order` harus tetap menampilkan AuthHeader (profile card) seperti sekarang — di atas content, di bawah header.

**Verifikasi:** Login di `/order` → profile card muncul di atas konten step.

---

### Task 6: Hapus Welcome & Party dari customer-ordering-page.tsx

**Modify:**
- `apps/customer/src/components/customer/customer-ordering-page.tsx`

Setelah semua step terpisah ke route `/order`, hapus:
- `step`, `setStep` state (pindah ke OrderContext)
- Welcome section
- Party section
- Refill section

Yang tersisa di `customer-ordering-page.tsx`:
- Data fetching hooks (siteSettings, brandSettings, categories, products, discounts, dll)
- Computed values
- Checkout logic (`checkout` function)
- Menu section render
- Checkout section render
- Receipt section render

Atau... sisa-sisa ini tetap di `order.lazy.tsx` langsung (karena itu file baru, tidak perlu di-refactor dari file lama).

**Alternatif:** Biarkan `customer-ordering-page.tsx` seperti sekarang sebagai "fallback/legacy" — file baru `/order` mengambil alih. Jangan hapus untuk menghindari break.

---

### Task 7: Build & Debug

**Step 1:** `cd apps/customer && npm run build`

**Step 2:** Fix error TypeScript (import tidak ditemukan, type mismatch).

**Step 3:** Commit + push + deploy.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `apps/customer/src/hooks/use-order-context.tsx` | **Create** | OrderContext dengan semua state flow |
| `apps/customer/src/routes/daftar.tsx` | **Create** | Route definition `/daftar` |
| `apps/customer/src/routes/daftar.lazy.tsx` | **Create** | Guest form component |
| `apps/customer/src/routes/order.tsx` | **Create** | Route definition `/order` with step schema |
| `apps/customer/src/routes/order.lazy.tsx` | **Create** | Order flow orchestrator |
| `apps/customer/src/routes/index.lazy.tsx` | **Modify** | Guest vs member detection + redirect |
| `apps/customer/src/routes/index.tsx` | **Modify** | Update search schema (simplify) |
| `apps/customer/src/routes/__root.tsx` | **Modify** | Wrap with OrderProvider |
| `apps/customer/src/components/customer/customer-ordering-page.tsx` | **Modify** | Extract party/refill/welcome sections (minor or none) |
| `apps/customer/src/components/customer/types.ts` | **Modify** | Expose Step type (remove "welcome") |

---

## Dependency Graph

```
📊 Dependency Graph:

Level 1 (independen → paralel 🔥)
  ├── [1] Task 1: OrderContext — pure create file
  ├── [2] Task 2: Route /daftar + form — pure create files
  ├── [3] Task 4: Update index route — pure modify

Level 2 (dependen pada Task 1 — butuh OrderContext)
  └── [4] Task 3: Route /order — butuh OrderContext + extract sections

Level 3 (integrasi)
  ├── [5] Task 5: AuthHeader in /order
  └── [6] Task 6: Cleanup legacy

Level 4 (verifikasi)
  └── [7] Task 7: Build + fix
```

---

## 🔥 Wave Execution

```
Wave 1 (paralel):
  - Subagent A: Task 1 — Buat OrderContext (use-order-context.tsx)
  - Subagent B: Task 2 — Buat route /daftar (daftar.tsx + daftar.lazy.tsx)
  - Subagent C: Task 4 — Update index route (guest vs member detect)

Wave 2 (sequential):
  - Kamu: Task 3 — Buat route /order + extract sections dari customer-ordering-page.tsx
  - Kamu: Task 5 — Wiring AuthHeader in /order

Wave 3:
  - Kamu: Task 7 — Build + fix error
```

---

## Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| **Payment flow rusak** | 🔴 Kritis | Jangan ubah checkout/payment/receipt logic. Ekstrak apa adanya. |
| **State hilang** | 🟠 Sedang | Context state di-mount ulang tiap page. Auto-save cart ke sessionStorage sebagai cadangan. |
| **TypeScript error import** | 🟡 Rendah | Build check setelah tiap task. |
| **TanStack Router auto-gen** | 🟢 Rendah | `routeTree.gen.ts` auto-regenerate saat build. |

---

## Verifikasi

- [ ] Build lulus (`cd apps/customer && npm run build`)
- [ ] `/` → Landing (guest: welcome + tombol Mulai/Daftar; member: auto-redirect ke `/order`)
- [ ] `/daftar` → Form muncul, isi data → redirect ke `/order?step=party`
- [ ] `/order?step=party` → Party size selector
- [ ] `/order?step=menu` → Katalog menu + cart
- [ ] `/order?step=checkout` → Checkout form
- [ ] `?step=receipt&orderId=xxx` → Receipt
- [ ] Back/forward browser → step berubah sesuai query param
- [ ] Login via auth modal → profile card muncul di `/order`
- [ ] Checkout flow (cashier + QRIS) masih berfungsi sama seperti sebelum refactor
