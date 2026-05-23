# Plan: Standarisasi API Communication — Djiwa Tentram App

## Goal
Standardisasi seluruh komunikasi backend-frontend agar konsisten dalam format response, error handling, status code usage, dan frontend error parsing.

## Current Context

Saat ini ada **3 format response** berbeda yang digunakan secara campuran:

| Format | Digunakan Oleh |
|--------|---------------|
| `{ success: true, data/message }` | onboarding-admin (sebagian action) |
| `{ ok: true, result/data }` | generate-payroll, record-financial-transaction, send-telegram-report |
| `{ data }` / `{ users }` (raw) | yumi-auth, yumi-ai, onboarding-admin (list) |

Dan **2 format error**:

| Format | Digunakan Oleh |
|--------|---------------|
| `{ error: string }` | yumi-auth, onboarding-admin, generate-payroll |
| `{ ok: false, error: string }` | record-financial-transaction, yumi-ai internal |

### External Callers (hasil investigasi)

| Caller | Edge Function | Actions | Parse Response Method |
|--------|--------------|---------|----------------------|
| **yumi-ai-bot** (6x) | yumi-ai | `recordTransaction`, `yumiChat`, `generateBusinessBriefing`, `insertInventory` | `data.get("ok")`, `data.get("content")`, `data.get("sourceId")` — via `httpx` fetch langsung |
| **yumi-finance-agent** (2x) | yumi-ai | `classifyTransactionItems` | `result.get("ok")`, `result.get("classifications")` — via `httpx` fetch langsung |
| **yumi-purchasing-agent** (0x) | — | — | — |
| **Frontend** | yumi-ai, yumi-auth, onboarding-admin, record-financial-transaction, generate-payroll, send-telegram-report | Semua action | Via `supabase.functions.invoke()` + manual check |

### Cron / Schedule
- yumi-ai-bot punya APScheduler untuk daily briefing (22:00 WIB) & marketlist (07:00 WIB)
- Auto-close-shifts dijalankan via Supabase pg_cron (bukan panggil response)
- Tidak ada cron/webhook yang tergantung response shape

## Proposed Approach

### Format Standar Tunggal

```
Success (HTTP 2xx):
  → { success: true, <field1>: <value1>, <field2>: <value2>, ... }
     (field2+ adalah data spesifik dari endpoint, tanpa wrapper "data")

Error (HTTP 4xx/5xx):
  → { success: false, error: { code: "ERROR_CODE", message: "..." } }
```

**Kenapa field endpoint langsung di top level, bukan di `data`?**
Karena 3 external agent (yumi-ai-bot, yumi-finance-agent) parse `data.get("sourceId")`, `data.get("content")` langsung dari response — tidak ada wrapper. Supaya minimum perubahan, data tetap di top level, hanya `ok` diganti `success`.

Jadi perubahan minimal per endpoint:

| Saat Ini | Menjadi |
|----------|---------|
| `{ ok: true, sourceId: "..." }` | `{ success: true, sourceId: "..." }` |
| `{ ok: false, error: "msg" }` | `{ success: false, error: { code, message } }` |
| `{ content: "...", toolCalls: [] }` | `{ success: true, content: "...", toolCalls: [] }` |
| `{ users: [...] }` | `{ success: true, users: [...] }` |
| `{ data: [...] }` | `{ success: true, data: [...] }` |
| `{ success: true, message, sourceId }` | ✅ sudah ok |
| `{ error: "..." }` (status 400) | `{ success: false, error: { code, message } }` |

### Aturan Status Code
- `200` = success
- `400` = validation error (input salah)
- `401` = unauthorized (auth missing/invalid)
- `403` = forbidden (tidak punya akses)
- `404` = not found
- `409` = conflict (duplicate, wrong state)
- `500` = internal server error
- **TIDAK BOLEH** return error dengan status 200 (kecuali backward compat sementara)

### Error Code Standar
| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | input tidak valid |
| `NOT_FOUND` | resource tidak ditemukan |
| `UNAUTHORIZED` | auth/token tidak valid |
| `FORBIDDEN` | tidak punya akses |
| `CONFLICT` | duplicate, wrong state |
| `INTERNAL_ERROR` | server error |
| `UNKNOWN_ACTION` | action tidak dikenali |

---

## Step-by-Step Plan

### Phase 0: Persiapan (15 min) — SUDAH DILAKUKAN
- [x] Investigasi external callers (yumi-ai-bot, yumi-finance-agent, yumi-purchasing-agent)
- [x] Identifikasi semua action dan response shape yang diparse
- [ ] Buat `docs/api-standards.md` sebagai acuan

### Phase 1: Frontend Helper + Update Semua Caller Frontend (45 min)

#### Step 1: Buat `apps/web/src/lib/api-helper.ts`
- Type definitions: `ApiResponse<T>`, `ApiError` class
- Fungsi `invokeApi<T>(fnName, body)` — wrapper supabase.functions.invoke + parse standar
- Backward compat untuk fungsi yang belum diupdate (handle `ok` dan `success`)

#### Step 2: Update `yumi-auth-client.ts`
- Ganti manual `invokeAuth()` dengan `invokeApi()`
- Pertahankan 3-level fallback mechanism

#### Step 3: Update `use-employee-onboarding-actions.ts`
- Ganti `fetch()` + manual parse dengan `invokeApi()`

#### Step 4: Update `use-hybrid-write-actions.ts`
- Ganti `supabase.functions.invoke()` calls dengan `invokeApi()`

#### Step 5: Update `telegram-report.ts`
- Ganti invoke yumi-ai (sendTelegram) dengan `invokeApi()`

#### Step 6: Update `use-hybrid-payroll-data.ts`
- Ganti invoke generate-payroll dengan `invokeApi()`

**Files changed:**
- `apps/web/src/lib/api-helper.ts` — **BARU**
- `apps/web/src/lib/yumi-auth-client.ts`
- `apps/web/src/hooks/use-employee-onboarding-actions.ts`
- `apps/web/src/hooks/use-hybrid-write-actions.ts` (beberapa bagian)
- `apps/web/src/lib/telegram-report.ts`
- `apps/web/src/hooks/use-hybrid-payroll-data.ts`

### Phase 2: Update External Agents (1 jam)

#### Step 7: Update `yumi-ai-bot/app.py`
- `data.get("ok")` → `data.get("success")` di 2 tempat (line ~322, ~602)
- `data.get("sourceId")` → tetap sama (top level)
- `data.get("content")` → tetap sama (top level)
- Handle `{ success: false, error: { code, message } }` format baru

#### Step 8: Update `yumi-finance-agent/app.py`
- `result.get("ok")` → `result.get("success")` di line ~1896
- `result.get("classifications")` → tetap sama (top level)

**Files changed:**
- `yumi-ai-bot/app.py`
- `yumi-ai-bot/receipt_restock.py`
- `yumi-finance-agent/app.py`

### Phase 3: Standardisasi Backend (2 jam)

#### Step 9: Standardisasi `yumi-ai/index.ts`
**Ini yang paling kompleks.** Strategy:
1. Buat `jsonOk(data, status=200)` → return `{ success: true, ...data }`
2. Buat `jsonError(code, message, status=400)` → return `{ success: false, error: { code, message } }`
3. Hapus semua `return { ok: false, error }` dengan status 200 → pindah ke status yang benar
4. Khusus `sendTelegram`, `recordTransaction`, `executeSql`, dll yang internal return `{ ok }` — wrap response di handler, jangan ubah internal return
5. `fail()` di top-level handler tetap ada untuk catch-all errors

#### Step 10: Standardisasi `record-financial-transaction/index.ts`
1. `fail()` → `jsonError()`
2. `{ ok: true, sourceId }` → `{ success: true, sourceId }`
3. Hapus error di status 200 (ini yang paling clean — cuma frontend yg panggil)

#### Step 11: Standardisasi `yumi-auth/index.ts`
1. Tambah helper `jsonOk()` dan `jsonError()`
2. `json({ users })` → `json({ success: true, users })`
3. `fail()` → `jsonError()`

#### Step 12: Standardisasi `onboarding-admin/index.ts`
1. `list` action: `{ data }` → `{ success: true, data }`
2. Semua action lain sudah pakai `{ success: true }` — ✅ ok
3. Error format: `{ error }` → `{ success: false, error: { code, message } }`

#### Step 13: Standardisasi `generate-payroll/index.ts`
1. `{ ok: true }` → `{ success: true }`
2. Semua response handler pakai `corsResponse({ success: true, ... })`

#### Step 14: Standardisasi `auto-close-shifts/index.ts`
1. Edge case (no active shifts, no schedules): tambah `success: true`
2. Error response: `{ success: false, error: { code, message } }`

#### Step 15: Standardisasi `delete-employee-cascade/index.ts`
- ✅ Sudah pakai `{ success: true, deleted, names }` — ok
- Error: `{ success: false, error: { code, message } }`

#### Step 16: Standardisasi `send-telegram-report/index.ts`
- `{ ok: false }` → `{ success: false }`
- Tambah `success: true` di success response

**Files changed:**
- `supabase/functions/yumi-ai/index.ts`
- `supabase/functions/record-financial-transaction/index.ts`
- `supabase/functions/yumi-auth/index.ts`
- `supabase/functions/onboarding-admin/index.ts`
- `supabase/functions/generate-payroll/index.ts`
- `supabase/functions/auto-close-shifts/index.ts`
- `supabase/functions/delete-employee-cascade/index.ts`
- `supabase/functions/send-telegram-report/index.ts`

### Phase 4: Testing & Dokumentasi (30 min)

#### Step 17: Build Check
```bash
cd /opt/djiwatentramapp
npm run check-types
npm run build
```

#### Step 18: Deploy Edge Functions
```bash
supabase functions deploy yumi-auth --no-verify-jwt
supabase functions deploy yumi-ai --no-verify-jwt
supabase functions deploy onboarding-admin --no-verify-jwt
supabase functions deploy delete-employee-cascade --no-verify-jwt
supabase functions deploy record-financial-transaction
supabase functions deploy generate-payroll --no-verify-jwt
supabase functions deploy auto-close-shifts --no-verify-jwt
supabase functions deploy send-telegram-report --no-verify-jwt
```

#### Step 19: Buat `docs/api-standards.md`
Dokumentasi lengkap yang mencakup:
- Format request/response standar
- Status code convention
- Error code list
- Cara menambah endpoint baru
- Contoh implementasi

## Implementation Order

```
Phase 1 (Frontend helper) ──→ Phase 2 (Agent update) ──→ Phase 3 (Backend) ──→ Phase 4 (Test)
     🔥 subagent 1                🔥 subagent 2              serial (kamu)          serial (kamu)
```

### Wave Plan

| Wave | Subagent | Task | Files |
|------|----------|------|-------|
| W1 | A 🔥 | Phase 1: Frontend helper + update | api-helper.ts, yumi-auth-client.ts, use-employee-onboarding-actions.ts, dll |
| W2 | B 🔥 | Phase 2: Update external agents | yumi-ai-bot/app.py, receipt_restock.py, yumi-finance-agent/app.py |
| — | Kamu | Phase 3: Backend standardisasi | 8 edge functions |
| — | Kamu | Phase 4: Test & docs | build, deploy, docs/api-standards.md |

## Verification

1. **Build:** `npm run check-types` tidak error
2. **Manual test:** Login flow, approve karyawan, create transaksi — semua masih jalan
3. **Agent test:** Restart yumi-ai-bot & yumi-finance-agent — pesan Telegram tetap terkirim
4. **Error handling test:** Coba input invalid di form → error message muncul

## Risks & Mitigations

| Risk | Mitigasi |
|------|----------|
| **🚨 yumi-ai-bot & yumi-finance-agent crash** setelah backend diupdate | Phase 2 dilakukan SEBELUM Phase 3 — agent sudah siap parse format baru |
| **🚨 Frontend broken** selama Phase 3 | Phase 1 dilakukan SEBELUM Phase 3 — frontend helper handle kedua format |
| **🚨 Build error** | `npm run check-types` setelah tiap phase |
| **Deploy timing** — window antara deploy beberapa edge function | Deploy semua function dalam batch cepat, atau lluar jam sibuk |
| **Yumi AI bot cron job (daily briefing)** crash | Phase 2 update app.py handle semua response path — restart bot setelah deploy |
| **record-financial-transaction punya verify_jwt=true** | Perlu testing khusus — pastikan frontend masih bisa invoke dengan session yang valid |
