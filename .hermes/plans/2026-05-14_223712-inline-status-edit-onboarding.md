# Plan: Inline Status Edit — Table Onboarding (UX-First)

**Date:** 2026-05-14  
**Slug:** inline-status-edit-onboarding

---

## Goal

Replace the 3-button action column (Setujui, Review, Delete) on `/admin/operational-team/register/onboarding` with a **clickable status badge** that opens an inline dropdown to change status — auto-save via edge function. Zero page reloads. Kecepatan maksimal.

---

## Current Context

1. **Onboarding table** (`/admin/onboarding.lazy.tsx`) currently has:
   - **Kolom Status** (line 310-312): badge-only (`pending`, `approved`, `rejected`, `needs_revision`), plus optional `Kontrak ✅` badge
   - **Kolom Aksi** (line 314-347): 
     - `Setujui` button (visible only when `app.status === "pending"`)
     - `Review` link (goes to detail page `/admin/.../application/$registrationNumber`)
     - `Hapus` button (danger trash icon)

2. **Edge function** `onboarding-admin` supports:
   - `approve` (creates yumi_users account + updates status)
   - `reject` (just updates status)
   - `mark_revision` (just updates status)
   - `delete` (removes record — only if not yet approved)
   - Currently no `set_status` action — need to add one or reuse existing actions

3. **Valid status transitions** (based on business rules):
   - `pending` → `approved` (creates user, starts contract flow)
   - `pending` → `rejected`
   - `pending` → `needs_revision`
   - `rejected` → `pending` (revive/reopen)
   - `needs_revision` → `pending` (reset for re-review)
   - `needs_revision` → `approved` (quick-approve after revision)
   - `approved` → immutable (cannot change unless revoked — leave as future)

4. **Detail page** (`/admin/.../application/$registrationNumber`) still needed for: full form review, contract preview, generating PDF. It's NOT replaced.

5. **Site settings** (`employeeOnboarding`) already contain:
   - `defaultPassword` — used in detail page for quick approve
   - `defaultRoleId` / `defaultRoleName` — possible defaults
   - `signatoryName` / `signatoryPersonName` — for contract
   - Not yet used for inline approve, but available

---

## Post-Approve Flow (Existing — Already Working)

Setelah admin klik approve, berikut yang terjadi **secara otomatis**:

| Apa yang terjadi | Detail |
|-----------------|--------|
| **User dibuat** | `yumi_users` record dengan `source_id`, `username`, `name`, `role_source_id`, `is_active=true`, `slug`, `home_pin_fingerprint` (hash PIN) |
| **Status aplikasi** | `employee_onboarding_applications.status = "approved"`, `raw.pipelineStep = "approved"` |
| **Start date** | `employment.startDate` di-set ke hari ini |
| **Notif Telegram** | Admin group mendapat notifikasi "✅ Pendaftaran Disetujui — [nama]" dengan link ke `/register/selesai/[regNumber]` |

### Setelah approve — Karyawan bisa:

| Aktivitas | Route / Flow | Keterangan |
|-----------|-------------|------------|
| **Login** ✅ | PIN 6 digit via `yumi-auth` → session token di localStorage | Login dari halaman `/login` |
| **Absen** ✅ | Check-in/out via `/attendance` atau `/karyawan/[slug]` | Role permission menentukan |
| **Lihat & Edit Profil** ✅ | `/karyawan/[slug]` — **sudah ada sejak awal** | Edit nama, email/username, slug, password (dengan verifikasi password lama) |
| **Ganti PIN** ✅ | Di halaman yang sama, section "Pengaturan Akun" → PIN Keamanan | Ada alert `requiresPinChange` kalau PIN masih default |
| **Tanda Tangan Kontrak** ✅ | `/register/selesai/[regNumber]` | Halaman polling yang sudah dibuat |
| **Lihat Slip Gaji** ✅ | `/karyawan/[slug]` → "Slip Gaji Terakhir" | Tergantung konfigurasi payroll |
| **Riwayat Absensi** ✅ | `/karyawan/[slug]` → "Log Kehadiran" | Per bulan, filter by month/year |

### Halaman Profile `/karyawan/[slug]` — Fitur Lengkap

```
┌─────────────────────────────────────┐
│  [Initial] Nama Lengkap             │
│           ROLE_NAME                 │
│           email@example.com         │
│           @slug                     │
├─────────────────────────────────────┤
│  Periode: [Bulan] [Tahun]           │
├─────────────────────────────────────┤
│  [Total Jam]  [Kehadiran %]         │
│  ──────────   ──────────            │
├─────────────────────────────────────┤
│  Slip Gaji Terakhir                 │
│  ─────────────────────────────      │
├─────────────────────────────────────┤
│  Log Kehadiran [Bulan] [Tahun]      │
│  ─────────────────────────────      │
│  Tanggal  │ Masuk │ Keluar          │
├─────────────────────────────────────┤
│  Data Pribadi  ▶ EDIT               │
│  ─────────────────────────────      │
│  • Nama (bisa diedit)               │
│  • Email / Username (bisa diedit)   │
│  • Slug (bisa diedit)               │
│  • Password (bisa diganti)          │
├─────────────────────────────────────┤
│  Pengaturan Akun                    │
│  ─────────────────────────────      │
│  🔑 PIN Keamanan (bisa diganti)     │
│  ⚠️ Alert: "Ganti PIN default"      │
│     (kalau requiresPinChange=true)  │
└─────────────────────────────────────┘
```

**Tidak perlu tambahan apa pun** — semua sudah siap. Halaman `useHybridUpdateUserPin`, `useHybridUpdateUserProfile`, private data, dan staff logs semua sudah terintegrasi.

---

## Proposed Approach

### A. Remove Action Column Entirely

Delete the `<th>` and `<td>` for the action column in both desktop table and mobile cards.

### B. Clickable Status Badge → Inline Dropdown

| Status | Click behavior | Options |
|--------|---------------|---------|
| `pending` | Click → dropdown | Setujui, Tolak, Minta Revisi |
| `approved` | Click → info toast "Approved — tidak bisa diubah" | — |
| `rejected` | Click → dropdown | Aktifkan Kembali (→ pending) |
| `needs_revision` | Click → dropdown | Setujui, Tolak, Kembalikan ke Pending |
| `contract_signed` | Display only | — |

Dropdown behavior:
- Pilihan diklik → konfirmasi via `window.confirm()`
- Auto-save via edge function
- On success: update row state optimistically + refetch
- On error: toast error, revert status

**Two edge function actions:**
- `set_status` → simple status transitions (reject, pending, needs_revision)
- `approve` → existing handler, enhanced for inline use with auto-generated fields

### C. Delete — Move to Kebab Menu (⋮)

Three-dot menu in the status cell, with one option:
- `Hapus` (only for non-approved records)

### D. Detail Page Access

No more "Review" button. Instead:
- **Click nama karyawan** → navigasi ke detail page
- Nama rendered as `<a>` or `<button>` with proper link

### E. Bulk Delete Stays

The header-level "Hapus N terpilih" + checkbox column remain unchanged.

### F. Mobile Cards

Same treatment: remove full-width Review button, replace with clickable status + kebab for delete.

---

## Files to Change

| File | Changes |
|------|---------|
| `apps/web/src/routes/admin/onboarding.lazy.tsx` | Remove action column, add `StatusCell` component with dropdown + kebab, add `getValidTransitions()` helper, add inline approve logic |
| `apps/web/src/hooks/use-employee-onboarding-actions.ts` | Add `useHybridSetOnboardingStatus()` hook calling edge function |
| `supabase/functions/onboarding-admin/index.ts` | Add `set_status` handler with validation, wire into switch |

---

## Expanded: Komponen StatusCell (Detail, Production-Ready)

Full component with dropdown, kebab menu, inline approve branching, and all UI states.

```tsx
/* ✨ Di tempat kolom aksi — ganti jadi badge yang bisa diklik + kebab */

type Transition = { value: string; label: string; icon?: React.ReactNode; variant?: string };

const STATUS_META: Record<string, { label: string; variant: string }> = {
  pending:   { label: "Pending",   variant: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",  variant: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected:  { label: "Ditolak",   variant: "bg-red-100 text-red-700 border-red-200" },
  needs_revision: { label: "Revisi", variant: "bg-purple-100 text-purple-700 border-purple-200" },
  contract_signed: { label: "Selesai ✅", variant: "bg-sky-100 text-sky-700 border-sky-200" },
};

function getValidTransitions(status: string): Transition[] {
  const map: Record<string, Transition[]> = {
    pending: [
      { value: "approve", label: "Setujui", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
      { value: "rejected", label: "Tolak", icon: <XCircle className="h-3.5 w-3.5" /> },
      { value: "needs_revision", label: "Minta Revisi", icon: <PencilLine className="h-3.5 w-3.5" /> },
    ],
    rejected: [
      { value: "pending", label: "Aktifkan Kembali", icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ],
    needs_revision: [
      { value: "approve", label: "Setujui", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
      { value: "rejected", label: "Tolak", icon: <XCircle className="h-3.5 w-3.5" /> },
      { value: "pending", label: "Kembalikan ke Pending", icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ],
  };
  return map[status] ?? [];
}

// ── Main component ──

function StatusCell({
  app,
  onboardingSettings,
  onStatusChange,
}: {
  app: any;
  onboardingSettings: any;
  onStatusChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const setStatus = useHybridSetOnboardingStatus();
  const approveApp = useHybridApproveApplication();
  const deleteApp = useHybridDeleteApplication();
  const navigate = useNavigate();
  const options = useMemo(() => getValidTransitions(app.status), [app.status]);
  const canDelete = app.status !== "approved" && app.status !== "contract_signed";

  async function handleTransition(option: Transition) {
    const name = app.full_name || "Karyawan";

    if (option.value === "approve") {
      // ── INLINE APPROVE (only if defaults exist) ──
      const defaultsAvailable = onboardingSettings?.defaultPassword && onboardingSettings?.defaultRoleId;
      if (defaultsAvailable) {
        if (!window.confirm(`Setujui "${name}"? User akan dibuat otomatis dengan pengaturan default.`)) return;
        setSaving(true);
        try {
          const autoUsername = (name.toLowerCase().replace(/[^a-z0-9]/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "") || "user")
            + Math.random().toString(36).slice(2, 6);
          await approveApp({
            applicationId: String(app.id),
            username: autoUsername,
            name: name,
            roleId: onboardingSettings.defaultRoleId,
            homePin: app.raw?.registrationNumber?.slice(-6) || "123456",
            onboardingApplicationId: String(app.id),
            employment: app.employment || {},
            reviewNotes: null,
            reviewedBy: "admin",
          });
          toast.success(`✅ "${name}" disetujui — username: ${autoUsername}`);
          onStatusChange();
        } catch (e: any) {
          toast.error(e?.message || "Gagal approve");
        } finally {
          setSaving(false);
          setOpen(false);
        }
      } else {
        // No defaults → navigate to detail page
        setOpen(false);
        navigate({
          to: "/admin/operational-team/register/application/$registrationNumber",
          params: { registrationNumber: app.raw?.registrationNumber || app.id },
        });
      }
      return;
    }

    // ── Simple status transitions → set_status ──
    const label = option.label.toLowerCase();
    if (!window.confirm(`${label} "${name}" dari ${app.status}?`)) return;
    setSaving(true);
    try {
      await setStatus({ id: String(app.id), status: option.value });
      toast.success(`"${name}" → ${STATUS_META[option.value]?.label || option.value}`);
      onStatusChange();
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengubah status");
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  async function handleDelete() {
    const name = app.full_name || "Karyawan";
    if (!window.confirm(`Hapus pendaftaran "${name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    setDeleting(true);
    try {
      await deleteApp(String(app.id));
      toast.success(`"${name}" dihapus`);
      onStatusChange();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  }

  const meta = STATUS_META[app.status] || STATUS_META.pending;

  return (
    <div className="flex items-center gap-1">
      {/* ── Clickable Status Badge ── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={saving || deleting || app.status === "contract_signed"}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all hover:ring-2 hover:ring-offset-1 ${
            meta.variant
          } ${saving || deleting ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {meta.label}
          {(options.length > 0 || app.status === "pending") && !saving && (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        {/* ── Dropdown ── */}
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1 w-52 rounded-lg border bg-popover p-1 shadow-lg">
              {options.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">Tidak ada aksi tersedia</div>
              ) : (
                options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTransition(opt)}
                    disabled={saving}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Contract Signed badge ── */}
      {app.raw?.pipelineStep === "contract_signed" && (
        <Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
          ✓ TTD
        </Badge>
      )}

      {/* ── Kebab Menu (⋮) ── */}
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive gap-2 text-xs"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
```

**Imports needed in `onboarding.lazy.tsx`:**

```tsx
// New/additional imports:
import { ChevronDown, MoreHorizontal, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHybridApproveApplication, useHybridSetOnboardingStatus } from "@/hooks/use-employee-onboarding-actions";
```

Note: `DropdownMenu` component is already in the project (`@/components/ui/dropdown-menu`). If not, it's a standard shadcn component.

### Rendering in the Table

Instead of the old action column:

```tsx
{/* OLD — delete this entire <td> */}
<td className="p-2 sm:p-3 ...">
  <div className="flex items-center justify-end gap-1">
    {app.status === "pending" && <Button>Setujui</Button>}
    <Link to="...">Review</Link>
    <Button>Hapus</Button>
  </div>
</td>

{/* NEW — just the status column renders everything */}
<td className="p-2 sm:p-3">
  <StatusCell
    app={app}
    onboardingSettings={onboardingSettings}
    onStatusChange={refreshApplications}
  />
</td>
```

---

## Expanded: Edge Function `set_status` — Full Code

### A. Add to the switch statement (top of `serve`)

```ts
case "set_status":
  return await handleSetStatus(supabase, payload);
```

### B. New handler function

```ts
async function handleSetStatus(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { id, status } = payload as { id?: string; status?: string };

  // ── Validate input ──
  if (!id || !status) {
    return jsonResponse({ error: "Parameter id dan status wajib diisi" }, 400);
  }

  const VALID_TARGETS = ["pending", "rejected", "needs_revision"] as const;
  if (!VALID_TARGETS.includes(status as any)) {
    return jsonResponse({
      error: `Status target tidak valid. Gunakan: ${VALID_TARGETS.join(", ")}`,
    }, 400);
  }

  // ── Check current application ──
  const { data: app, error: appError } = await supabase
    .from("employee_onboarding_applications")
    .select("id, status")
    .eq("id", String(id))
    .maybeSingle();

  if (appError) {
    console.error("[onboarding-admin] set_status fetch error:", appError);
    return jsonResponse({ error: appError.message }, 500);
  }
  if (!app) {
    return jsonResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  }

  // ── Validate transition ──
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending:         ["rejected", "needs_revision"],
    rejected:        ["pending"],
    needs_revision:  ["pending", "rejected"],
    approved:        [],         // cannot be changed via set_status
    contract_signed: [],         // cannot be changed
  };

  const allowed = VALID_TRANSITIONS[app.status] ?? [];
  if (!allowed.includes(status)) {
    return jsonResponse({
      error: `Transisi tidak valid: ${app.status} → ${status}. Transisi yang diizinkan: ${allowed.join(", ") || "tidak ada"}`,
    }, 400);
  }

  // ── Prevent set_status from doing approve (must use handleApprove) ──
  // Already handled by VALID_TARGETS above (approved not in list)

  // ── Execute update ──
  const updatePayload: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };

  // Only set reviewed_by if transitioning away from pending (a review decision)
  if (app.status === "pending" && (status === "rejected" || status === "needs_revision")) {
    updatePayload.reviewed_by = payload.reviewedBy ?? "admin";
  }

  const { error: updateError } = await supabase
    .from("employee_onboarding_applications")
    .update(updatePayload)
    .eq("id", String(id));

  if (updateError) {
    console.error("[onboarding-admin] set_status update error:", updateError);
    return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({
    success: true,
    message: `Status diubah ke ${status}`,
  });
}
```

### C. Full transition matrix (server-side enforced)

```
              set_status allowed?
From         → pending    → rejected    → needs_revision
─────────────────────────────────────────────────────────
pending        N/A          ✅             ✅
rejected       ✅           N/A            ❌
needs_revision ✅           ✅             N/A
approved       ❌           ❌             ❌
contract_sig   ❌           ❌             ❌
```

Note: `pending → approved` is handled by the existing `handleApprove` (creates yumi_users). The frontend calls `approve` action via `useHybridApproveApplication`, not `set_status`.

---

## Expanded: Detail Logic Approve Inline — Auto-Generate Username + Default Role Flow

### Why Inline Approve is Tricky

The existing `handleApprove` requires:
```
applicationId, username, password, name, roleId, homePin, requiresPinChange,
slug, receiveReportEmails, onboardingApplicationId, reviewNotes, reviewedBy, employment
```

Most of these can be **auto-generated** if the admin has configured defaults in Site Settings.

### What We Need from Site Settings

| Setting | Fallback if missing |
|---------|-------------------|
| `defaultPassword` | `"123456"` |
| `defaultRoleId` | Not set → **cannot inline-approve** → navigate to detail page |
| `defaultRoleName` | Used for display only |

### Auto-Generation Rules

```ts
// Full name → username with uniqueness suffix
function generateUsername(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 20); // max 20 chars base
  const suffix = Math.random().toString(36).slice(2, 6); // 4-char random
  return `${base}.${suffix}`;
  // Note: edge case — still could collide. But 4-char random + 20-char base = 1.6M combos
}

// Auto-generate PIN from registration number
function generatePin(registrationNumber?: string): string {
  // Use last 6 digits of registration number, or random
  if (registrationNumber) {
    const digits = registrationNumber.replace(/\D/g, "").slice(-6);
    if (digits.length === 6) return digits;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Auto-generate slug from name
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
}
```

### Inline Approve Flow (Frontend)

```
User clicks "Setujui" in dropdown
  ↓
Check: onboardingSettings.defaultRoleId exists?
  ├── YES ─────────────────────────────────────────────
  │   window.confirm("Setujui [name]? User akan dibuat otomatis.")
  │   ↓ user confirms
  │   Call approveApp({
  │     applicationId: app.id,
  │     username: generateUsername(app.full_name),
  │     name: app.full_name,
  │     roleId: onboardingSettings.defaultRoleId,
  │     homePin: generatePin(app.raw?.registrationNumber),
  │     password: onboardingSettings.defaultPassword,
  │     employment: app.employment,
  │     onboardingApplicationId: String(app.id),
  │     reviewedBy: "admin",
  │   })
  │   ↓ success
  │   toast.success("✅ [name] disetujui — username: [autoUsername]")
  │   refresh table
  │
  └── NO ──────────────────────────────────────────────
      navigate to detail page
      (user completes approval manually)
```

### Edge Cases

| Case | Handling |
|------|----------|
| `defaultRoleId` expired/deleted | Edge function returns error → toast shown to user → user navigates to detail page |
| Username collision (rare) | Edge function returns error "username already taken" → user navigates to detail page to fix manually |
| Already approved | Checked by edge function (409 conflict) → toast "sudah disetujui" |
| No `defaultPassword` | Use hardcoded `"123456"` fallback (existing behavior in detail page) |
| `homePin` generation fails | Fallback to `"123456"` — user can change on detail page |

### POST-Approve: What Happens

1. Edge function creates `yumi_users` record with auto-generated fields
2. Updates `employee_onboarding_applications.status = "approved"`
3. Sets `raw.pipelineStep = "approved"`
4. Ensures `employment.startDate = today`
5. Sends Telegram notification to admin group
6. Frontend refreshes: status badge now shows "Approved" (immutable)
7. Karyawan can now proceed to `/register/selesai/[registrationNumber]` for contract signing

---

## UI/UX Specification

### States

| State | Behavior |
|-------|----------|
| **Loading** | Badge shows spinner, dropdown disabled |
| **Error** | Toast error + revert badge to original status |
| **Empty** | No change — existing empty state stays |
| **Saving** | Badge opacity-60, cursor-not-allowed, spinner icon |
| **Success** | Badge updates immediately via refresh callback |
| **Approve (inline)** | Full-page toast with generated username shown |

### Layout — Desktop Table

```
[☐] [Nama 👁]  [Kontak]  [Tanggal]  [Status ▾ ⋮]
     roleName                           pending ↓
     (click → detail)              [✅ Setujui]
                                   [❌ Tolak]
                                   [✏️ Minta Revisi]
```

### Layout — Mobile Card

```
[☐] Nama
    roleName
    [Status ▾] [⋮]
    phone · email
    date
```

### Valid Status Transitions (Full Matrix)

```
From             → pending    → approved    → rejected    → needs_revision
─────────────────────────────────────────────────────────────────────────
pending            —            ✅ (approve)  ✅ (set_status)  ✅ (set_status)
approved           ❌           —             ❌              ❌
rejected           ✅           ❌            —              ❌
needs_revision     ✅           ✅ (approve)  ✅ (set_status)  —
contract_signed    ❌           ❌            ❌              ❌
```

---

## Integration Points

- **Edge Function**: Add `set_status` action + enhanced `approve` for inline use
- **Admin hooks**: Add `useHybridSetOnboardingStatus()` — lightweight, just updates status field
- **No Telegram/agent changes needed** — existing approve handler already sends Telegram notification
- **No DB migration needed** — all logic is in edge function + frontend

---

## Risks & Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Approve needs too many fields for inline | Check `onboardingSettings.defaultRoleId`; if exists → auto-approve. If not → navigate to detail |
| Accidental status change | `window.confirm()` before every change |
| Delete still accessible | Kebab menu (⋮) is 1 click away but visually clean |
| Detail page less discoverable | Click name to navigate — standard table pattern |
| `set_status` bypasses `reviewed_by` | Handler sets `reviewed_by` only when transitioning from `pending` |
| Username collision on auto-generate | Edge function returns error → fallback to detail page |
| `defaultRoleId` might be stale | Edge function rejects → toast + fallback to detail page |

---

## Validation / Testing

1. `bun run build` — must pass
2. **Status transitions:**
   - pending → Tolak → badge shows "Ditolak"
   - pending → Minta Revisi → badge shows "Revisi"
   - Ditolak → Aktifkan Kembali → badge shows "Pending"
   - Revisi → Tolak → badge shows "Ditolak"
   - Revisi → Kembalikan → badge shows "Pending"
3. **Inline approve (with defaults):**
   - Click Setujui → confirm → user created → badge "Approved" → toast with username
4. **Inline approve (no defaults):**
   - Click Setujui → navigates to detail page
5. **Delete via kebab:**
   - Click ⋮ → Hapus → confirm → row removed
6. **Detail page:**
   - Click nama → navigasi ke detail page
7. **Edge function validation:**
   - Invalid transitions return 400
   - Already-approved returns 409
   - Missing id/status returns 400
8. **Bulk delete:**
   - Checkbox + header button still works
9. **Mobile:**
   - Layout renders correctly on small screens

---

## Implementation Checklist

- [ ] Add `useHybridSetOnboardingStatus` hook in `use-employee-onboarding-actions.ts`
- [ ] Add `handleSetStatus` to edge function `onboarding-admin/index.ts`
- [ ] Deploy edge function: `supabase functions deploy onboarding-admin`
- [ ] Add imports to `onboarding.lazy.tsx` (DropdownMenu, ChevronDown, MoreHorizontal, RefreshCw, hooks)
- [ ] Add `STATUS_META` constants and `getValidTransitions()` helper
- [ ] Add `StatusCell` component (dropdown, kebab, inline approve branching)
- [ ] Remove old action column (`<td>`) from desktop table
- [ ] Wire `StatusCell` into table row, replace old `<td>` with new `<td>` containing only `StatusCell`
- [ ] Fix table header: remove action column `<th>`, let status column span its space
- [ ] Remove old action buttons from mobile cards — replace with `StatusCell`
- [ ] Make nama karyawan clickable → Link to detail page
- [ ] Remove unused imports (CheckCircle2, Eye, PencilLine, Trash2 if now unused)
- [ ] `bun run build` — verify
