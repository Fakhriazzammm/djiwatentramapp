# API Standards — Djiwa Tentram App

## Format Response Standar

### Success (HTTP 2xx)
```json
{
  "success": true,
  ...data (fields spesifik endpoint, di top level)
}
```

### Error (HTTP 4xx/5xx)
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## Aturan

1. **Data di top level** — jangan bungkus dalam `data` key.
2. **Status code** wajib sesuai:
   - `200` = success
   - `400` = VALIDATION_ERROR
   - `401` = UNAUTHORIZED
   - `403` = FORBIDDEN
   - `404` = NOT_FOUND
   - `409` = CONFLICT
   - `500` = INTERNAL_ERROR
3. **JANGAN** return error dengan status 200.

## Error Codes

| Code | Meaning |
|------|---------|
| `VALIDATION_ERROR` | Input tidak valid |
| `NOT_FOUND` | Resource tidak ditemukan |
| `UNAUTHORIZED` | Auth/token tidak valid |
| `FORBIDDEN` | Tidak punya akses |
| `CONFLICT` | Duplicate, wrong state |
| `INTERNAL_ERROR` | Server error |
| `UNKNOWN_ACTION` | Action tidak dikenali |
| `METHOD_NOT_ALLOWED` | HTTP method salah |
| `QUERY_ERROR` | Database query error |
| `INSERT_ERROR` | Database insert error |
| `UPDATE_ERROR` | Database update error |
| `DELETE_ERROR` | Database delete error |
| `CREATE_USER_ERROR` | Gagal buat user |
| `TELEGRAM_ERROR` | Telegram API error |
| `AI_PARSE_ERROR` | AI response parse error |
| `INVALID_TRANSITION` | Status transition invalid |

## Frontend Helper

Gunakan `invokeEdgeFunction<T>()` dari `@/lib/api-helper`:

```typescript
import { invokeEdgeFunction, ApiError } from "@/lib/api-helper";

// Sukses → return typed data
const data = await invokeEdgeFunction<{ user: YumiSessionUser }>(
  "yumi-auth",
  { action: "validateSession", token }
);

// Error → throw ApiError dengan code + message
try {
  await invokeEdgeFunction("yumi-auth", { action: "loginWithPin", userId, pin });
} catch (err) {
  if (err instanceof ApiError) {
    console.log(err.code);   // "VALIDATION_ERROR"
    console.log(err.message); // "PIN harus 6 digit"
  }
}
```

Untuk endpoint non-Supabase (custom headers), gunakan `invokeDirectFetch()`.

## Cara Menambah Endpoint Baru

1. Response success: `{ success: true, field1, field2, ... }`
2. Response error: `{ success: false, error: { code, message } }`
3. Gunakan helper yang sudah ada: `jsonOk()`, `fail()`, `jsonResponse()`

## Edge Functions & Status

| Function | Status | Catatan |
|----------|--------|---------|
| yumi-auth | ✅ Standard | `json()` wraps `{ success: true, ... }` |
| yumi-ai | ✅ Standard | `jsonOk()` + `fail()` handler |
| onboarding-admin | ✅ Standard | Semua action + error codes |
| delete-employee-cascade | ✅ Standard | Error codes added |
| generate-payroll | ✅ Standard | `ok` → `success` |
| record-financial-transaction | ✅ Standard | Error codes, no more 200-error |
| auto-close-shifts | ✅ Standard | Edge cases + error codes |
| send-telegram-report | ✅ Standard | Error codes |

## External Agents Status

| Agent | Status | Catatan |
|-------|--------|---------|
| yumi-ai-bot | ✅ Updated | Parsing `success` not `ok` |
| yumi-finance-agent | ✅ Updated | Parsing `success` not `ok` |
