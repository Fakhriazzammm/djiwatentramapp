# Perbaikan Buka/Tutup Kasir — Bug Fix, UX Polish & Notifikasi Telegram

> **Goal:** Memperbaiki 9 isu flow buka/tutup kasir + integrasi notifikasi ke grup [Report] via Yumi General Manager Agent (@YummeAIbot).

**Architecture:**
- **Frontend-only fixes:** `menu-sidebar.tsx` (form) + `use-hybrid-write-actions.ts` (hook) — tanpa migration DB
- **Notifikasi Telegram:** Frontend → panggil existing Edge Function `send-telegram-report` → forward ke yumi-ai-bot HTTP endpoint (`localhost:8001/send-report`) → kirim ke grup [Report] (`TELEGRAM_REPORT_CHAT_ID = -1003991897388`)

**Tech Stack:** React + TypeScript + Tailwind + shadcn/ui + Supabase Edge Functions + Telegram Bot API

**Existing infrastructure (sudah ada, tinggal pakai):**
- ✅ Edge Function: `send-telegram-report` (di `supabase/functions/send-telegram-report/`)
- ✅ Bot: Yumi General Manager Agent (@YummeAIbot) — Python service `yumi-ai-bot`
- ✅ Grup: [Report] Djiwa Tentram — chat_id `-1003991897388`
- ✅ Cara panggil: `supabase.functions.invoke("send-telegram-report", { body: { text, chat_id } })`

**Status:** 0% — Belum mulai

---

## 🔍 Ringkasan Semua Task

| # | Task | File | Tipe | Severity |
|---|------|------|------|----------|
| 1 | Catatan shift di-append, bukan replace | `use-hybrid-write-actions.ts` | Bug fix | 🔴 High |
| 2 | Hapus limit 1000 query orders (risiko data salah shift ramai) | `use-hybrid-write-actions.ts` | Bug fix | 🔴 High |
| 3 | Non-cash confirmed auto-fill dari qrisRevenue | `menu-sidebar.tsx` | UX | 🟡 Medium |
| 4 | Group pecahan → Kertas (grid) + Logam (collapsible) | `menu-sidebar.tsx` | UX | 🟡 Medium |
| 5 | Kasir auto-fill dari current user (tampil teks, bukan dropdown) | `menu-sidebar.tsx` | UX | 🟡 Medium |
| 6 | Selisih pake Lucide icon (CheckCircle2, ArrowUpCircle, ArrowDownCircle) | `menu-sidebar.tsx` | Style | 🟢 Low |
| 7 | Button label → "Akhiri & Kirim Laporan" | `menu-sidebar.tsx` | Label | 🟢 Low |
| 8 | Tooltip di tab disabled ("Tutup shift aktif terlebih dahulu") | `menu-sidebar.tsx` | UX | 🟢 Low |
| 9 | Input uang pake `inputMode="numeric"` | `menu-sidebar.tsx` | Mobile UX | 🟢 Low |
| **10** | **Notifikasi Telegram — BUKA KASIR (per-role team + detail)** | `menu-sidebar.tsx` | **New** | 🔵 New |
| **11** | **Notifikasi Telegram — TUTUP KASIR (include breakdown pecahan)** | `menu-sidebar.tsx` + `use-hybrid-write-actions.ts` | **New** | 🔵 New |
| **11b** | **Auto-generate PDF laporan shift + kirim ke grup [Report]** | `menu-sidebar.tsx` + `lib/shift-report-pdf.ts` | **New** | 🔵 New |
| **12** | **Hook return summary + payment breakdown** | `use-hybrid-write-actions.ts` | **Sinkronisasi** | 🔵 New |
| **13** | **UI label "Modal Awal" → "Modal Kasir" di semua halaman** | 4 file UI | **Label fix** | 🟡 Medium |

---

## 📊 Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] use-hybrid-write-actions.ts — notes append, limit hapus
  ├── [2] menu-sidebar.tsx — non-cash auto-fill + group pecahan
  ├── [3] menu-sidebar.tsx — kasir auto-fill read-only + emoji→icon + label + tooltip + inputMode
  ├── [12] use-hybrid-write-actions.ts — hook return summary + payment breakdown
  ├── [13] 4 file UI — label "Modal Awal" → "Modal Kasir"
  └── [11b-part1] lib/shift-report-pdf.ts — buat fungsi generate PDF

Level 2 (dependen — butuh hasil Task 12)
  ├── [10] menu-sidebar.tsx — notifikasi buka kasir ← butuh format per-role
  ├── [11] menu-sidebar.tsx — notifikasi tutup kasir ← butuh summary dari hook
  └── [11b-part2] menu-sidebar.tsx — integrasi PDF ke handleEndShift ← butuh [11b-part1]

Level 3 (dependen — butuh yumi-ai-bot)
  └── [11b-part3] yumi-ai-bot/app.py — tambah endpoint /send-document

Level 4 (verifikasi)
  └── [14] Build + typecheck + restart bot

🔥 Wave 1: delegasi [1], [2], [3], [12], [13], [11b-part1] paralel
👤 Kamu: [10], [11] sequential (butuh [12])
👤 Kamu: [11b-part2], [11b-part3] sequential
🔥 Wave 2: [14] verifikasi build + restart bot
```

---

## Task Detail

### Task 1: Fix notes overwrite + hapus limit 1000 — `use-hybrid-write-actions.ts`

**Objective:** Catatan buka shift tidak hilang saat diisi catatan tutup shift. Limit query orders dihapus untuk shift ramai.

**Files:**
- Modify: `apps/pos/src/hooks/use-hybrid-write-actions.ts:4515` (notes)
- Modify: `apps/pos/src/hooks/use-hybrid-write-actions.ts:4480` (limit)

**Step 1 — Fix notes append (line ~4515)**

**Current:**
```ts
notes: args?.notes ?? shift.notes ?? null,
```

**Fix — append with separator, jangan replace:**
```ts
notes: args?.notes
  ? (shift.notes
    ? shift.notes + "\n\n[TUTUP SHIFT] " + args.notes
    : args.notes)
  : (shift.notes ?? null),
```

**Step 2 — Hapus limit 1000 (line ~4480)**

**Current:**
```ts
.limit(1000);
```

**Fix:**
```ts
.limit(10000);
```

**Step 3 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
```

---

### Task 2: Non-cash auto-fill + group pecahan — `menu-sidebar.tsx`

**Objective:** Non-cash confirmed auto-fill dari qrisRevenue. Pecahan uang digroup (Kertas grid + Logam collapsible).

**Files:**
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx`

**Step 1 — Non-cash auto-fill**

Di komponen `ShiftManagement`, state `nonCashConfirmed` otomatis terisi dari nilai `shiftQris`:

```tsx
useEffect(() => {
  if (shiftQris > 0 && !nonCashConfirmed) {
    setNonCashConfirmed(shiftQris.toString());
  }
}, [shiftQris]);
```

Tambahkan hint di label: "Konfirmasi QRIS/EDC (Rp) — otomatis dari sistem"

**Step 2 — Group pecahan jadi "Kertas" + "Logam"**

**Current:** 10 input dalam 1 grid:
```
100k  50k   20k   10k   5k
2k    1k    500   200   100
```

**Fix — pisah jadi 2 section:**

Section 1 — **Uang Kertas** (nilai ≥ 1000):
```
100k  50k   20k   10k
5k    2k    1k
```

Section 2 — **Uang Logam** (collapsible, default collapsed):
```
▶ Koin (500, 200, 100)
  [500] [200] [100]
```

**Code:**
```tsx
const billKeys = Object.keys(breakdown).filter(
  k => Number(k.replace('bill', '')) >= 1000
);
const coinKeys = Object.keys(breakdown).filter(
  k => Number(k.replace('bill', '')) < 1000
);
```

Import Collapsible:
```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
```

**Step 3 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
```

---

### Task 3: Kasir auto-fill + emoji→icon + label + tooltip + inputMode — `menu-sidebar.tsx`

**Objective:** Perbaikan UX minor.

**Files:**
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx`

**Step 1 — Kasir auto-fill read-only dengan opsi ganti**

```tsx
{cashierName === currentUser?.name ? (
  <div className="flex items-center justify-between h-9 px-3 rounded-md border bg-muted/30">
    <span className="text-xs font-bold">{cashierName}</span>
    <span className="text-[9px] text-muted-foreground">· diri sendiri</span>
    <button type="button" onClick={() => setCashierName("")} className="text-[9px] text-primary font-bold hover:underline ml-auto">Ganti</button>
  </div>
) : (
  <Select ...> // dropdown as usual</Select>
)}
```

**Step 2 — Emoji → Lucide icon**

**Current:** `const icon = isExact ? '✅' : diff > 0 ? '⬆️' : '⬇️';`

**Fix:**
```tsx
import { CheckCircle2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
const SelisihIcon = isExact ? CheckCircle2 : diff > 0 ? ArrowUpCircle : ArrowDownCircle;
const iconColor = isExact ? 'text-emerald-500' : diff > 0 ? 'text-amber-500' : 'text-rose-500';
```

**Step 3 — Button label fix**

**Current:** `Akhiri & Cetak Laporan`

**Fix:** `Akhiri & Kirim Laporan`

**Step 4 — Tooltip untuk tab disabled**

```tsx
title={shiftType === "mulai" ? "Buka shift baru" : "Tutup shift aktif terlebih dahulu"}
```

**Step 5 — `inputMode="numeric"`**

Semua `<Input type="number">` untuk uang tambah `inputMode="numeric"`.

**Step 6 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
```

---

### Task 11b: Auto-generate PDF laporan shift + kirim ke grup [Report]

**Flow:** Setelah `handleEndShift` sukses (shift ditutup di DB + notifikasi text terkirim), generate PDF lalu kirim sebagai dokumen ke grup [Report] via bot Telegram.

**Arsitektur:**

```
handleEndShift sukses
  → 1. Kirim notifikasi text (Task 11) — sudah ada
  → 2. Generate PDF di frontend (html2canvas + jsPDF) — BARU
  → 3. Kirim PDF ke Edge Function → bot → grup [Report] — BARU
```

**Library (sudah terinstall):**
- `jspdf` ^4.2.0 — generate PDF
- `jspdf-autotable` — table plugin
- `html2canvas` ^1.4.1 — capture HTML ke canvas

**Files:**
- Create: `apps/pos/src/lib/shift-report-pdf.ts` — fungsi generate PDF
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx` — panggil setelah endShift

**Step 1 — Buat fungsi generate PDF (`shift-report-pdf.ts`)**

Buat komponen React hidden yang merender desain laporan shift (compact 360px), lalu capture dengan html2canvas dan generate PDF dengan jsPDF.

```typescript
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export type ShiftPDFData = {
  shiftName: string;
  cashierName: string;
  teamMembers: string;
  startTime: number;
  endTime: number;
  startingCash: number;
  cashRevenue: number;
  paymentBreakdown: {
    qris: number;
    debit: number;
    credit: number;
    transfer: number;
    onlineFoodPlatforms?: Record<string, number>;
  };
  totalExpenses: number;
  totalDiscount: number;
  totalItemsSold: number;
  cashInRegister: number;
  cashBreakdown: Record<string, number>;
  notes: string;
};

export async function generateShiftReportPDF(data: ShiftPDFData): Promise<Blob> {
  // 1. Buat HTML element sementara dengan desain laporan
  // 2. html2canvas → canvas
  // 3. jsPDF → tambah canvas sebagai image
  // 4. return blob

  const container = document.createElement("div");
  container.innerHTML = buildReportHTML(data);
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = "360px";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 360,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [360, canvas.height * 0.5], // 360px width, auto height
    });

    pdf.addImage(imgData, "PNG", 0, 0, 360, canvas.height * 0.5);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}
```

**Fungsi `buildReportHTML(data)`** — generate HTML string sesuai desain di `/tmp/shift-report-preview-v3.html` (compact 360px, semua Rp pake `&nbsp;`, chart donut distribusi pembayaran, pecahan uang, dll).

Chart donut pake Canvas API manual (tanpa Chart.js) biar gak perlu load CDN di PDF:

```typescript
function buildDoughnutChart(data: number[], labels: string[], colors: string[]): string {
  // Render chart sebagai SVG inline — arc segments + legend
  // Atau cukup pake tabel distribusi jika SVG terlalu kompleks
  let rows = "";
  const total = data.reduce((a, b) => a + b, 0);
  data.forEach((val, i) => {
    const pct = ((val / total) * 100).toFixed(1);
    const barWidth = Math.max(2, (val / total) * 100);
    rows += `<tr>
      <td style="padding:2px 4px;font-size:7px;color:#6b7280;white-space:nowrap;">${labels[i]}</td>
      <td style="padding:2px 4px;font-size:7px;font-weight:700;text-align:right;white-space:nowrap;">Rp ${val.toLocaleString("id-ID")}</td>
      <td style="padding:2px 4px;font-size:7px;color:#9ca3af;text-align:right;">${pct}%</td>
    </tr>`;
  });
  return `<table style="width:100%;border-collapse:collapse;">${rows}</table>`;
}
```

**Desain PDF (sama persis dengan preview):**
| Section | Konten |
|---------|--------|
| Header | **Logo Djiwa Tentram** (`logo.png`, lingkaran biru + burung putih) + Laporan Shift + badge status + jam |
| Info | Kasir, Modal Kasir, Tim per-role |
| Badge | Total Penjualan, Item Terjual, Pengeluaran |
| Pendapatan | Tunai, Non-Tunai breakdown per platform, Diskon |
| Distribusi | Horizontal bar chart (SVG inline, warna per metode) |
| Rekonsiliasi Laci | Modal Kasir, Uang Fisik, Selisih |
| Pecahan Uang | Grid pecahan per nominal + total |
| Footer | Catatan, timestamp cetak |

**Logo:**
- File: `apps/pos/public/logo.png` (512×512px, lingkaran biru dengan burung putih)
- Cara embed di PDF: load sebagai base64 via `fetch` + `FileReader` atau import static asset
```typescript
// Load logo sebagai base64 untuk html2canvas
async function loadLogoBase64(): Promise<string> {
  const resp = await fetch("/logo.png");
  const blob = await resp.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
```
- Ukuran di PDF: 28×28px (di header, samping judul "Laporan Shift")

**Step 2 — Kirim PDF ke grup [Report]**

Gunakan Edge Function `send-telegram-report` yang sudah ada. Edge function saat ini cuma support text — perlu kirim document. Dua opsi:

**Opsi A (sederhana):** Kirim via bot API langsung dari frontend dengan encode PDF ke base64, lalu kirim ke endpoint bot.

**Opsi B (disarankan):** Buat endpoint baru di yumi-ai-bot (`/send-document`) yang support kirim file.

**Opsi C (paling praktis):** Kirim PDF sebagai file ke grup via Hermes `send_message` dengan MEDIA path, atau upload ke Supabase Storage dulu baru kirim link.

Untuk implementasi awal, kirim PDF via bot dengan cara:
1. Generate PDF blob
2. Convert ke base64
3. Kirim ke endpoint bot `/send-document` dengan multipart/form-data

```typescript
async function sendPDFtoTelegram(pdfBlob: Blob, caption: string) {
  const formData = new FormData();
  formData.append("document", pdfBlob, `laporan-shift-${Date.now()}.pdf`);
  formData.append("caption", caption);
  formData.append("chat_id", "-1003991897388");

  try {
    await fetch("http://localhost:8001/send-document", {
      method: "POST",
      body: formData,
    });
  } catch (e) {
    console.error("[shift-pdf] Gagal kirim PDF:", e);
  }
}
```

Dan di yumi-ai-bot (`app.py`), tambah endpoint `/send-document`:
```python
async def _handle_send_document(request):
    data = await request.post()
    chat_id = data.get("chat_id") or TELEGRAM_REPORT_CHAT_ID
    document = data.get("document")
    caption = data.get("caption", "")
    msg = await request.app["bot"].send_document(
        chat_id=int(chat_id),
        document=document.file,
        caption=caption,
    )
    return web.json_response({"ok": True, "message_id": msg.message_id})
```

**Step 3 — Integrasi ke `handleEndShift`**

Di dalam `handleEndShift`, setelah shift sukses ditutup dan setelah notifikasi text terkirim, panggil generate + send PDF:

```typescript
// Setelah endShift sukses...
// ...kirim notifikasi text (dari Task 11)...

// Generate & kirim PDF (best-effort, async, jangan blocking)
generateShiftReportPDF({
  shiftName: shiftInfo.shiftName || shiftName || "-",
  cashierName: shiftInfo.cashierName || cashierName || "-",
  teamMembers: teamMembers.join(", ") || shiftInfo.teamMembers || "",
  startTime: shiftInfo.startTime || Date.now(),
  endTime: Date.now(),
  startingCash: Number(shiftInfo.startingCash ?? 0),
  cashRevenue: summary.cashRevenue,
  paymentBreakdown: summary.paymentBreakdown || {},
  totalExpenses: summary.totalExpenses,
  totalDiscount: summary.totalDiscount,
  totalItemsSold: summary.totalItemsSold,
  cashInRegister: Number(cashInRegister || 0),
  cashBreakdown: breakdown,
  notes: notes || "",
}).then((pdfBlob) => {
  sendPDFtoTelegram(pdfBlob, `📊 Laporan Shift — ${shiftInfo.shiftName || shiftName}`);
}).catch((e) => {
  console.error("[shift-pdf] Gagal generate PDF:", e);
});
```

**⚠️ Catatan: PDF generation bersifat async + best-effort** — tidak blocking, tidak mempengaruhi flow tutup shift. Jika gagal (misal library error), shift tetap berhasil ditutup.

**Step 4 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
cd /opt/djiwatentramapp && sudo systemctl restart yumi-ai-bot.service
```

**Step 5 — Test end-to-end:**
1. Buka shift → catat transaksi
2. Tutup shift → isi pecahan + catatan
3. Klik "Akhiri & Kirim Laporan"
4. Cek grup [Report] → harus ada PDF + notifikasi text
5. Buka PDF → cek semua data, chart, pecahan

---

**⚠️ KRITIS — Alasan:**
- UI menghitung `shiftCash`/`shiftQris` dari `pos.orders` (by `paymentMethod`)
- Hook `useHybridEndShift` menghitung `cashRevenue`/`qrisRevenue` dari `pos.financial_transactions` (by `payment_method`)
- Notifikasi harus pakai data YANG SAMA dengan yang disimpan ke DB
- Non-tunai perlu breakdown: QRIS, EDC, Online Food, Transfer

**Objective:** Hook return object `{ shiftId, summary, shift }` termasuk payment breakdown.

**Files:**
- Modify: `apps/pos/src/hooks/use-hybrid-write-actions.ts`

**Step 1 — Ubah perhitungan non-tunai dari flat `qrisRevenue` jadi per-metode**

Di dalam loop `for (const row of completed)` (line ~4453), ubah dari:
```ts
let cashRevenue = 0;
let qrisRevenue = 0;
// ...
const method = String(row.paymentMethod ?? "").toLowerCase();
if (method === "cash" || method === "tunai") cashRevenue += amount;
else qrisRevenue += amount;
```

Jadi per-metode:
```ts
let cashRevenue = 0;
let qrisRevenue = 0;
const paymentBreakdown: Record<string, number | Record<string, number>> = {
  cash: 0,
  qris: 0,
  debit: 0,
  credit: 0,
  transfer: 0,
  onlineFoodPlatforms: {} as Record<string, number>,
};
// ...
const method = String(row.paymentMethod ?? "").toLowerCase();
if (method === "cash" || method === "tunai") {
  cashRevenue += amount;
  paymentBreakdown.cash += amount;
} else {
  qrisRevenue += amount;
  // Track by specific method
  if (paymentBreakdown[method] !== undefined) {
    paymentBreakdown[method] += amount;
  } else {
    paymentBreakdown[method] = amount;
  }
}
```

**Step 2 — Query orders untuk bedakan Online Food vs Transfer**

Online Food = order dengan `orderType='online'` dan `paymentMethod='transfer'`.
Transfer manual = order dengan `paymentMethod='transfer'` tapi bukan online food.

Di query orders yang sudah ada untuk diskon (line ~4472), tambah `order_type` dan `raw` ke select, lalu group by platform:

```ts
// Reset online food counters
const onlineFoodPlatforms: Record<string, number> = {};

// In the orders query, update select to include order_type and raw:
const { data: shiftOrders } = await supabase
  .schema("pos")
  .from("orders")
  .select("total_amount, discount_amount, order_type, raw")
  .gte("creation_time", Number(shift.startTime))
  .lt("creation_time", endTime)
  .in("status", ["completed", "paid"])
  .limit(10000);

// ... existing discount calculation ...

// After processing discounts, compute online food breakdown by platform:
if (shiftOrders && shiftOrders.length > 0) {
  shiftOrders.forEach((o: any) => {
    const orderType = String(o.order_type ?? "").toLowerCase();
    if (orderType === "online") {
      const platform = String((o.raw as any)?.platform ?? "").toLowerCase();
      const totalAmount = Number(o.total_amount ?? 0);
      if (platform && totalAmount > 0) {
        onlineFoodPlatforms[platform] = (onlineFoodPlatforms[platform] ?? 0) + totalAmount;
      }
    }
  });
}
```

Setelah loop financial_transactions, perbaiki breakdown:

```ts
// Online food revenue dari orders (per platform)
paymentBreakdown.onlineFoodPlatforms = onlineFoodPlatforms;

// Hitung total online food untuk kurangi dari transfer
const totalOnlineFood = Object.values(onlineFoodPlatforms).reduce((sum, v) => sum + v, 0);

// Sesuaikan transfer: kurangi online food dari total transfer
if (paymentBreakdown.transfer > 0 && totalOnlineFood > 0) {
  const actualTransfer = Number(paymentBreakdown.transfer) - totalOnlineFood;
  paymentBreakdown.transfer = Math.max(0, actualTransfer);
}
```
**Step 3 — Return object dengan summary + shift + payment breakdown**

**Current (line ~4563):**
```ts
return shiftId;
```

**Fix:**
```ts
return {
  shiftId,
  summary: {
    cashRevenue,
    qrisRevenue,
    totalRevenue,
    totalGrossSales,
    totalDiscount: totalDiscountFromOrders,
    totalExpenses,
    totalItemsSold: Math.max(
      Number((shift.summary as any)?.totalItemsSold ?? 0),
      totalItemsSold
    ),
    endingCashExpected,
    endingCashPhysical: Number(args?.endingCashPhysical ?? 0),
    nonCashExpected,
    nonCashConfirmed: Number(args?.nonCashConfirmed ?? 0),
    paymentBreakdown,
  },
  shift: {
    shiftName: shift.shiftName,
    cashierName: shift.cashierName,
    startingCash: shift.startingCash,
    startTime: shift.startTime,
    teamMembers: shift.teamMembers ?? "",
  },
};
```

**Step 2 — Update caller (`handleEndShift` di menu-sidebar.tsx)**

Di `ShiftManagement` component, fungsi `handleEndShift` saat ini:
```tsx
await endShift({ shiftId, endingCashPhysical, nonCashConfirmed, cashBreakdown, notes });
```

**Fix — tangkap return value:**
```tsx
const result = await endShift({ shiftId, endingCashPhysical, nonCashConfirmed, cashBreakdown, notes });
// result.summary ← angka persis dari hook
// result.shift ← info shift
```

**Step 3 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
```

---

### Task 10: Notifikasi BUKA KASIR — per-role team + detail — `menu-sidebar.tsx`

**Objective:** Setelah shift berhasil dibuka, kirim notifikasi ke grup [Report] dengan format per-role.

**Files:**
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx`

**Step 1 — Helper format team per-role**

Pakai fungsi yang SUDAH ADA di komponen (yang sama dipake buat ngegroup checkbox di form):

```tsx
function formatTeamByRole(teamMembers: string[], allStaff: any[]): string {
  if (!teamMembers.length) return "-";
  
  const roleOrder = ["Barista", "Kitchen", "Kasir", "Waitress", "Manajer"];
  const roleNormalize = new Map<string, string>();
  for (const r of roleOrder) {
    roleNormalize.set(r.toUpperCase(), r);
    roleNormalize.set(r.toLowerCase(), r);
  }
  roleNormalize.set("CHEF", "Kitchen");
  roleNormalize.set("MANAGER", "Manajer");

  const grouped = new Map<string, string[]>();
  teamMembers.forEach((name) => {
    const user = allStaff.find((u: any) => u.name?.trim()?.toLowerCase() === name.toLowerCase());
    const rawRole = user?.roleName?.trim() || "Lainnya";
    const role = roleNormalize.get(rawRole.toUpperCase()) ?? rawRole;
    if (!grouped.has(role)) grouped.set(role, []);
    grouped.get(role)!.push(name);
  });

  const sortedRoles = [...grouped.keys()].sort((a, b) => {
    const ai = roleOrder.findIndex(r => r.toLowerCase() === a.toLowerCase());
    const bi = roleOrder.findIndex(r => r.toLowerCase() === b.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return sortedRoles.map(role => {
    const formattedRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    return `${formattedRole}: ${grouped.get(role)!.join(", ")}`;
  }).join("\n");
}
```

**Step 2 — Helper kirim notifikasi**

```tsx
async function sendTelegramNotif(title: string, details: Record<string, string>) {
  const supabase = createClient();
  const lines = [
    `📋 *${title}*`,
    `━━━━━━━━━━━━━━━`,
    ...Object.entries(details).map(([k, v]) => `${k} ${v}`),
    `━━━━━━━━━━━━━━━`,
    `🕐 ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" })}`,
  ];
  
  try {
    await supabase.functions.invoke("send-telegram-report", {
      body: { text: lines.join("\n"), chat_id: -1003991897388 }
    });
  } catch (e) {
    console.error("[shift-notif] Gagal kirim notifikasi:", e);
  }
}
```

**Step 3 — Panggil setelah startShift sukses**

Di `handleSubmit`, setelah `await startShift({...})` sukses:

```tsx
// Kirim notifikasi ke grup Report
const teamFormatted = formatTeamByRole(teamMembers, staffUsers);
sendTelegramNotif("✅ SHIFT DIBUKA", {
  "🏪": "Djiwa Tentram",
  "🔄 Shift": shiftName,
  "💰 Modal Kasir": `Rp ${Number(amount).toLocaleString("id-ID")}`,
  "👥 Tim": `\n${teamFormatted}`,
});
```

**Contoh output di Telegram:**
```
📋 ✅ SHIFT DIBUKA
━━━━━━━━━━━━━━━
🏪 Djiwa Tentram
🔄 Shift: Shift Pagi
💰 Modal Kasir: Rp 500.000
👥 Tim:
Barista: Ayunda, Rian
Kitchen: Siti Nurhaliza
Kasir: Andi Pratama
Waitress: Melati
━━━━━━━━━━━━━━━
🕐 Jumat, 12 Juni 2026 08.00 WIB
```

**Catatan:** Tidak ada baris `👤 Kasir` terpisah — Kasir sudah tercakup di per-role Tim. Nama kasir diambil dari `cashierName` dan di-skip dari daftar role di Tim biar gak dobel.
**Step 4 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
```

---

### Task 11: Notifikasi TUTUP KASIR — include breakdown pecahan + sinkron — `menu-sidebar.tsx`

**Objective:** Setelah shift ditutup, kirim laporan lengkap ke grup [Report]. Data dari **summary hasil return hook** (Task 12), bukan dari UI state. Include detail pecahan.

**Files:**
- Modify: `apps/pos/src/components/pos/menu-sidebar.tsx`

**Step 1 — Panggil di `handleEndShift` setelah `endShift` sukses**

```tsx
const result = await endShift({ shiftId, endingCashPhysical, nonCashConfirmed, cashBreakdown, notes });

// result.summary = { cashRevenue, qrisRevenue, paymentBreakdown, totalRevenue, ... }
// result.shift = { shiftName, cashierName, startingCash, teamMembers }

const { summary, shift: shiftInfo } = result;

// Format breakdown pecahan (hanya nominal dengan count > 0)
const breakdownLines = Object.entries(breakdown)
  .filter(([_, count]) => Number(count) > 0)
  .sort(([a], [b]) => Number(b.replace("bill", "")) - Number(a.replace("bill", "")))
  .map(([key, count]) => {
    const nominal = Number(key.replace("bill", ""));
    return `Rp ${nominal.toLocaleString("id-ID")} × ${count} = Rp ${(nominal * Number(count)).toLocaleString("id-ID")}`;
  });

// Format non-tunai breakdown (dari summary.paymentBreakdown)
const nonTunaiLines = [
  `   ├ QRIS: Rp ${(summary.paymentBreakdown?.qris ?? 0).toLocaleString("id-ID")}`,
  `   ├ EDC: Rp ${(summary.paymentBreakdown?.edc ?? 0).toLocaleString("id-ID")}`,
  ...((summary.paymentBreakdown?.onlineFoodPlatforms && Object.keys(summary.paymentBreakdown.onlineFoodPlatforms).length > 0)
    ? [
        `   ├ Online Food:`,
        ...Object.entries(summary.paymentBreakdown.onlineFoodPlatforms)
          .filter(([_, val]) => Number(val) > 0)
          .map(([platform, val], i, arr) => {
            const isLast = i === arr.length - 1;
            const prefix = isLast ? "   │  └" : "   │  ├";
            const label = platform === "grab" ? "GrabFood"
              : platform === "gofood" ? "GoFood"
              : platform === "maxim" ? "Maxim"
              : platform === "shopeefood" ? "ShopeeFood"
              : platform;
            return `${prefix} ${label}: Rp ${Number(val).toLocaleString("id-ID")}`;
          }),
      ]
    : []),
  `   └ Transfer: Rp ${(summary.paymentBreakdown?.transfer ?? 0).toLocaleString("id-ID")}`,
];

// Hitung selisih
const diffCash = Number(cashInRegister || 0) - summary.cashRevenue;
const diffModal = (shiftInfo.startingCash ?? 0) - (shiftInfo.startingCash ?? 0); // always 0

const selisihIcon = (val: number) => val === 0 ? "✅" : val > 0 ? "⬆️" : "⬇️";
const selisihRp = (val: number) => val === 0 ? "Rp 0" : `${selisihIcon(val)} Rp ${Math.abs(val).toLocaleString("id-ID")}`;

// Kirim laporan
sendTelegramNotif("📊 LAPORAN SHIFT", {
  "🏪": "Djiwa Tentram",
  "🔄 Shift": shiftInfo.shiftName || shiftName || "-",
  "👥 Tim": `\n${formatTeamByRole(teamMembers.length ? teamMembers : (shiftInfo.teamMembers?.split(", ").filter(Boolean) || []), staffUsers)}`,
  "",
  "━━━ DI SISTEM ━━━": "",
  "💰 Modal Kasir": `Rp ${Number(shiftInfo.startingCash ?? 0).toLocaleString("id-ID")}`,
  "💵 Penjualan Tunai": `Rp ${summary.cashRevenue.toLocaleString("id-ID")}`,
  "💳 Non-Tunai": `\n${nonTunaiLines.join("\n")}`,
  "💸 Pengeluaran": `Rp ${summary.totalExpenses.toLocaleString("id-ID")}`,
  "📦 Item Terjual": `${summary.totalItemsSold}`,
  "🏷️ Diskon": `Rp ${summary.totalDiscount.toLocaleString("id-ID")}`,
  "",
  "━━━ DI LACI ━━━": "",
  "💰 Modal Kasir": `Rp ${Number(shiftInfo.startingCash ?? 0).toLocaleString("id-ID")}`,
  "💵 Uang Fisik": `Rp ${Number(cashInRegister || 0).toLocaleString("id-ID")}`,
  "🔢 Pecahan": breakdownLines.length ? `\n${breakdownLines.join("\n")}` : "(tidak diisi)",
  "",
  "━━━ SELISIH ━━━": "",
  "Modal": `${selisihRp(diffModal)}`,
  "Penjualan vs Uang Fisik": `${selisihRp(Number(cashInRegister || 0) - summary.cashRevenue)}`,
  "",
  "📝 Catatan": notes || "-",
});
```

**⚠️ Catatan sinkronisasi:** 
- `summary.cashRevenue`, `summary.qrisRevenue`, `summary.totalExpenses` berasal dari **return value hook** (sama persis dengan yang disimpan ke DB)
- `cashInRegister`, `nonCashConfirmed`, `breakdown` berasal dari **UI state** (input user, bukan dari DB)
- Ini sengaja: uang fisik dan pecahan adalah input manual kasir, bukan dari sistem

**Step 2 — Format selisih dinamis**

`summary.endingCashExpected` =
```ts
Number(shift.startingCash ?? 0) + cashRevenue - totalExpenses
```

Selisih = `cashInRegister - endingCashExpected`.

Tambahkan emoji status di samping selisih:
- 0 → ✅ Pas
- Positif → ⬆️ Lebih Rp X
- Negatif → ⬇️ Kurang Rp X

**Contoh output di Telegram:**
```
📋 📊 LAPORAN SHIFT
━━━━━━━━━━━━━━━
🏪 Djiwa Tentram
🔄 Shift: Shift Pagi
👥 Tim:
Barista: Ayunda, Rian
Kitchen: Siti Nurhaliza
Kasir: Andi Pratama
Waitress: Melati

━━━ DI SISTEM ━━━
💰 Modal Kasir: Rp 500.000
💵 Penjualan Tunai: Rp 1.200.000
💳 Non-Tunai
   ├ QRIS: Rp 400.000
   ├ EDC: Rp 250.000
   ├ Online Food:
   │  ├ GrabFood: Rp 80.000
   │  ├ GoFood: Rp 40.000
   │  ├ Maxim: Rp 15.000
   │  └ ShopeeFood: Rp 15.000
   └ Transfer: Rp 50.000
💸 Pengeluaran: Rp 75.000
📦 Item Terjual: 24
🏷️ Diskon: Rp 50.000

━━━ DI LACI ━━━
💰 Modal Kasir: Rp 500.000
💵 Uang Fisik: Rp 1.200.000
🔢 Pecahan:
Rp 100.000 × 10 = Rp 1.000.000
Rp 50.000 × 8 = Rp 400.000
Rp 20.000 × 5 = Rp 100.000
Rp 10.000 × 10 = Rp 100.000
Rp 5.000 × 5 = Rp 25.000

━━━ SELISIH ━━━
Modal: ✅ Rp 0
Penjualan vs Uang Fisik: ✅ Rp 0

📝 Catatan: Stok gula habis
━━━━━━━━━━━━━━━
🕐 Jumat, 12 Juni 2026 16.00 WIB
```

**Perbandingan Di Sistem vs Di Laci:**
| Sistem | Laci | Harus Sama |
|--------|------|------------|
| Modal Kasir | Modal Kasir | ✅ |
| Penjualan Tunai | Uang Fisik | ✅ |
| QRIS | — (tidak ada di laci) | Cek via dashboard Mayar |
| EDC | — (tidak ada di laci) | Cek via mesin EDC |
| GrabFood | — (tidak ada di laci) | Cek via dashboard Grab |
| GoFood | — (tidak ada di laci) | Cek via dashboard Gojek |
| Maxim | — (tidak ada di laci) | Cek via dashboard Maxim |
| ShopeeFood | — (tidak ada di laci) | Cek via dashboard Shopee |
| Transfer | — (tidak ada di laci) | Cek via mutasi bank |

**Catatan:**
- `Uang Fisik` = jumlah tunai di laci (murni penjualan tunai, **tidak termasuk modal**)
- `Modal Kasir` = modal awal shift, dipisah dari uang fisik
- Non-Tunai **hanya ada di Sistem** — tidak ada input manual di laci
- Selisih hanya bandingin item yang ada di kedua sisi

**Step 3 — Panggil juga dari `handleEndShift` untuk buka**
Tidak perlu — sudah di Task 10.

**Step 4 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | head -30
```

---

### Task 13: UI label "Modal Awal" → "Modal Kasir" di semua halaman

**⚠️ JANGAN ubah DB category value** — "Modal Awal" di `financial_transactions.category` tetap, karena dipakai filter query di seluruh sistem. Hanya UI label yang diganti.

**Objective:** Seragamkan semua label "Modal Awal" jadi "Modal Kasir" di UI.

**Files yang diubah (8 file — semua UI label):**

| # | File | Baris | Label Lama | Label Baru |
|---|------|-------|-----------|------------|
| 1 | `apps/pos/src/components/pos/menu-sidebar.tsx` | ~2675 | `Modal Awal (Rp)` | `Modal Kasir (Rp)` |
| 2 | `apps/pos/src/routes/admin/finance/reports/-components/shift-report.tsx` | ~1215 | `Modal Awal (Rp)` | `Modal Kasir (Rp)` |
| 3 | `apps/pos/src/routes/admin/finance/reports/-components/shift-report.tsx` | ~1285 | `Modal Awal (Rp)` | `Modal Kasir (Rp)` |
| 4 | `apps/pos/src/routes/admin/operational-team/-components/OperationalDashboard.tsx` | ~517 | `Modal Awal` | `Modal Kasir` |
| 5 | `apps/pos/src/routes/admin/operational-team/attendance/pengaturan.lazy.tsx` | ~377 | `Modal Awal Default` | `Modal Kasir Default` |
| 6 | `apps/web/src/components/pos/menu-sidebar.tsx` | ~2645 | `Modal Awal (Rp)` | `Modal Kasir (Rp)` |
| 7 | `apps/web/src/routes/admin/finance/reports/-components/shift-report.tsx` | ~1215 | `Modal Awal (Rp)` | `Modal Kasir (Rp)` |
| 8 | `apps/web/src/routes/admin/finance/reports/-components/shift-report.tsx` | ~1285 | `Modal Awal (Rp)` | `Modal Kasir (Rp)` |
| 9 | `apps/web/src/routes/admin/operational-team/-components/OperationalDashboard.tsx` | ~517 | `Modal Awal` | `Modal Kasir` |
| 10 | `apps/web/src/routes/admin/operational-team/attendance/pengaturan.lazy.tsx` | ~377 | `Modal Awal Default` | `Modal Kasir Default` |

**Step 1 — Ubah menu-sidebar.tsx**

Cari `"Modal Awal (Rp)"` di file dan ganti jadi `"Modal Kasir (Rp)"`.

**Step 2 — Ubah shift-report.tsx (2 tempat)**

Cari `"Modal Awal (Rp)"` di baris ~1215 dan ~1285 (form edit & create shift), ganti jadi `"Modal Kasir (Rp)"`.

**Step 3 — Ubah OperationalDashboard.tsx**

Cari `label="Modal Awal"` di baris ~517, ganti jadi `label="Modal Kasir"`.

**Step 4 — Ubah pengaturan.lazy.tsx**

Cari `"Modal Awal Default"` di baris ~377, ganti jadi `"Modal Kasir Default"`.

**Files yang TIDAK diubah (DB category — jangan disentuh):**

| File | Alasan |
|------|--------|
| `use-hybrid-write-actions.ts` | `category: "Modal Awal"` = nilai DB, dipakai query filter |
| `use-hybrid-pos-data.ts` | Filter `.not("category", "in", ("Modal Awal", ...))` |
| `use-hybrid-finance-analytics-data.ts` | Filter exclude Modal Awal dari revenue |
| `public-pos-write-helpers.ts` | `category: "Modal Awal"` = nilai DB |

**Step 5 — Verify**
```bash
cd /opt/djiwatentramapp/apps/pos && grep -rn '"Modal Awal"' src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
```
Expected: hanya muncul di file backend/hooks (DB category), bukan di JSX label UI.

---

### Task 14: Integrasi & Verifikasi

**Objective:** Reconcile semua perubahan dari 5 subagent, pastikan tidak ada konflik, build lulus.

**Files:**
- Check: `apps/pos/src/components/pos/menu-sidebar.tsx`
- Check: `apps/pos/src/hooks/use-hybrid-write-actions.ts`

**Step 1 — Reconcile imports**
- `CheckCircle2`, `ArrowUpCircle`, `ArrowDownCircle` dari `lucide-react`
- `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` dari `@/components/ui/collapsible`
- `createClient` dari `@/lib/supabase` atau hook yang sudah ada

**Step 2 — Build + TypeScript**
```bash
cd /opt/djiwatentramapp/apps/pos && npm run build 2>&1 | tail -20
```

**Step 3 — TypeScript strict check**
```bash
cd /opt/djiwatentramapp/apps/pos && npx tsc --noEmit --pretty 2>&1 | tail -20
```

---

## Execution

### Wave 1: Parallel 🔥 (6 subagent)

| Task | Subagent | Tools | Context Penting | Estimasi |
|------|----------|-------|----------------|----------|
| 1 — Notes append + hapus limit | subagent-backend | terminal, file | `use-hybrid-write-actions.ts` — cari baris `.limit(1000)` (~4480) dan `notes:` di update (~4515) | 5 menit |
| 2 — Non-cash auto-fill + group pecahan | subagent-frontend | terminal, file | `menu-sidebar.tsx` — bagian form "Akhiri" (~2740-2770). Filter keys: `>= 1000` = kertas, `< 1000` = koin. Import Collapsible. | 8 menit |
| 3 — UX polish (icon, label, tooltip, inputMode, kasir read-only) | subagent-frontend | terminal, file | `menu-sidebar.tsx` — 5 perubahan di baris berbeda. Cari: emoji `'✅'`, button label `Cetak`, title di button tab, type="number" | 10 menit |
| **12 — Hook return summary + payment breakdown** | subagent-backend | terminal, file | **KRITIS.** `use-hybrid-write-actions.ts:~4453-4563` — ubah loop financial_tx jadi per-metode, tambah query orders untuk platform online, return `{ shiftId, summary, shift }` | 12 menit |
| **13 — Label "Modal Awal" → "Modal Kasir"** | subagent-frontend | terminal, file | 10 tempat di 8 file: `apps/pos/` (5 label) + `apps/web/` (5 label). **JANGAN** ubah di hooks/backend. Cari string `Modal Awal` case-sensitive di file .tsx | 5 menit |
| **11b-p1 — Fungsi generate PDF** | subagent-frontend | terminal, file | Create `apps/pos/src/lib/shift-report-pdf.ts`. Fungsi `generateShiftReportPDF()` pake html2canvas + jsPDF. Desain compact 360px (copy dari `/tmp/shift-report-preview-v3.html`). Chart pake SVG inline horizontal bar. Semua Rp pake `&nbsp;` | 15 menit |

### Wave 2: Sequential (kamu kerjakan)

| Task | Tools | Estimasi |
|------|-------|----------|
| 10 — Notifikasi buka kasir (per-role) | patch langsung | 5 menit |
| 11 — Notifikasi tutup kasir (text + breakdown) | patch langsung | 8 menit |
| 11b-p2 — Integrasi PDF ke handleEndShift | patch langsung | 5 menit |
| 11b-p3 — Tambah endpoint /send-document di yumi-ai-bot | terminal + patch | 5 menit |

### Wave 3: Verifikasi

| Task | Tools | Estimasi |
|------|-------|----------|
| 14 — Build + typecheck + restart bot | terminal | 3 menit |

### Recovery

Jika subagent gagal:
1. Baca error message
2. Retry dengan context lebih detail (line numbers exact + kode sekitar)
3. Jika masih gagal, kerjakan manual via patch

---

## Catatan Penting

### 1. Sinkronisasi Data — **KRITIS** ⚠️

| Komponen | Sumber Data | Dipakai Untuk |
|----------|------------|---------------|
| UI `shiftCash` | `pos.orders` (paymentMethod='cash') | Tampilan di form |
| UI `shiftQris` | `pos.orders` (paymentMethod='qris'/'transfer') | Tampilan di form |
| Hook `cashRevenue` | `pos.financial_transactions` (payment_method='cash'/'tunai') | **Disimpan ke DB** |
| Hook `qrisRevenue` | `pos.financial_transactions` (payment_method ≠ cash/tunai) | **Disimpan ke DB** |

**Potensi mismatch:** UI pake `orders`, hook pake `financial_transactions`. Meskipun biasanya sama karena order create juga create financial tx, tapi untuk keamanan:
- ✅ **Notifikasi buka shift** — pake UI state (data masih fresh, shift baru dibuka, belum ada transaksi)
- ✅ **Notifikasi tutup shift** — pake **return value hook** (Task 12), yaitu data YANG SAMA dengan yang disimpan ke DB

### 2. Notifikasi Best-Effort
- Jika `send-telegram-report` error (bot down, network), shift tetap berhasil
- Notifikasi gagal tidak blocking flow utama
- Error cukup di `console.error`, tidak perlu toast

### 3. Pecahan di Notifikasi
Hanya pecahan yang `count > 0` yang ditampilkan (filter `filter(([_, count]) => Number(count) > 0)`)

### 4. Markdown Format di Telegram
- `*text*` → bold
- `\n` → newline
- Maks 4096 karakter per pesan (dihandle oleh Edge Function)

---

## Verification Checklist

- [ ] Build lulus (`npm run build` / `npx tsc --noEmit`)
- [ ] Notes buka shift tidak hilang saat diisi catatan tutup shift
- [ ] Non-cash confirmed auto terisi dari qrisRevenue
- [ ] Pecahan koin collapsible (default collapsed)
- [ ] Kasir auto-fill dari current user (tampil sebagai teks)
- [ ] Selisih pake Lucide icon (bukan emoji)
- [ ] Button label "Akhiri & Kirim Laporan"
- [ ] Tooltip di tab disabled
- [ ] Input uang pake `inputMode="numeric"`
- [ ] Notifikasi buka shift ke grup [Report] — team per-role
- [ ] Notifikasi tutup shift ke grup [Report] — include breakdown pecahan
- [ ] Notifikasi tutup shift pakai data dari return hook (sinkron dengan DB)
- [ ] `useHybridEndShift` return object `{ shiftId, summary, shift }`
