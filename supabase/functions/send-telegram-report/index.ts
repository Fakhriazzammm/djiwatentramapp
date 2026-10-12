import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * Server-side shift report + closing evidence delivery.
 *
 * Delivery talks straight to the Telegram Bot API: the legacy localhost:8001
 * bridge is unreachable from the edge-runtime container (connection refused).
 * Each target owns its bot identity and the tokens stay server-side:
 *   [Report]    -> TELEGRAM_BOT_TOKEN
 *   [Transaksi] -> TELEGRAM_SUPERVISOR_BOT_TOKEN
 */

const REPORT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? ""
const SUPERVISOR_TOKEN = Deno.env.get("TELEGRAM_SUPERVISOR_BOT_TOKEN") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const PUBLIC_SUPABASE_URL = (
  Deno.env.get("YUMI_PUBLIC_SUPABASE_URL") ?? "https://supabase.yumme.id"
).replace(/\/+$/, "")

const EVIDENCE_BUCKET = "shift-closing-photos"
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function fail(code: string, message: string, status: number) {
  return json({ success: false, error: { code, message } }, status)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  return "jpg"
}

/** Upload evidence with the service role; `anon` has no storage.objects write grant. */
async function uploadEvidence(
  shiftId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[send-telegram-report] storage upload skipped: supabase env missing")
    return null
  }
  const path = `${shiftId}/${Date.now()}-closing.${extensionFor(mime)}`
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${EVIDENCE_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: bytes,
    },
  )
  if (!res.ok) {
    console.error(
      `[send-telegram-report] evidence upload failed (${res.status}): ${await res.text()}`,
    )
    return null
  }
  return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${EVIDENCE_BUCKET}/${path}`
}

/**
 * Bind the evidence to the shift so the close stays auditable and later
 * recaps can attach the same image. `raw` is the existing audit column, so
 * this is an additive JSONB merge with no schema change.
 */
async function persistEvidence(shiftId: string, url: string): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_KEY) return false
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Accept-Profile": "pos",
    "Content-Profile": "pos",
    "Content-Type": "application/json",
  }
  try {
    const readRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shifts?select=raw&source_id=eq.${encodeURIComponent(shiftId)}`,
      { headers },
    )
    if (!readRes.ok) {
      console.error(`[send-telegram-report] shift read failed (${readRes.status})`)
      return false
    }
    const rows = await readRes.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error("[send-telegram-report] shift not found for evidence persist")
      return false
    }
    const currentRaw =
      rows[0]?.raw && typeof rows[0].raw === "object" ? rows[0].raw : {}
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shifts?source_id=eq.${encodeURIComponent(shiftId)}`,
      {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          raw: {
            ...currentRaw,
            closingEvidenceUrl: url,
            closingEvidenceAt: Date.now(),
          },
        }),
      },
    )
    if (!patchRes.ok) {
      console.error(
        `[send-telegram-report] evidence persist failed (${patchRes.status}): ${await patchRes.text()}`,
      )
      return false
    }
    return true
  } catch (error) {
    console.error("[send-telegram-report] evidence persist error:", error)
    return false
  }
}

async function sendMessage(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok && data?.ok === true, messageId: data?.result?.message_id, detail: data }
}

async function sendPhoto(
  token: string,
  chatId: string,
  caption: string,
  photoUrl: string | null,
  fallbackBytes: Uint8Array | null,
  filename: string,
  mime: string,
) {
  // Prefer the stored public URL so Telegram shows the exact audited object;
  // fall back to an inline upload when storage is unavailable.
  const res = photoUrl
    ? await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
      })
    : await (() => {
        const form = new FormData()
        form.append("chat_id", chatId)
        form.append("caption", caption)
        form.append(
          "photo",
          new Blob([fallbackBytes ?? new Uint8Array()], { type: mime }),
          filename,
        )
        return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          body: form,
        })
      })()
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok && data?.ok === true, messageId: data?.result?.message_id, detail: data }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405)
  }

  try {
    const body = await req.json()
    const {
      text,
      chat_id,
      sender = "report",
      photo_base64,
      photo_filename = "shift-closing-evidence.jpg",
      photo_mime = "image/jpeg",
      shift_id,
    } = body ?? {}

    if (!text || typeof text !== "string") {
      return fail("VALIDATION_ERROR", "text is required", 400)
    }

    const token = sender === "supervisor" ? SUPERVISOR_TOKEN : REPORT_TOKEN
    if (!token) return fail("CONFIG_ERROR", `Missing bot token for sender=${sender}`, 500)
    if (!chat_id) return fail("VALIDATION_ERROR", "chat_id is required", 400)

    let photoBytes: Uint8Array | null = null
    if (typeof photo_base64 === "string" && photo_base64.length > 0) {
      if (!ALLOWED_PHOTO_TYPES.includes(String(photo_mime))) {
        return fail("VALIDATION_ERROR", "photo_mime harus JPG, PNG, atau WEBP", 400)
      }
      photoBytes = decodeBase64(photo_base64)
      if (photoBytes.byteLength > MAX_PHOTO_BYTES) {
        return fail("VALIDATION_ERROR", "Ukuran foto bukti melebihi 5MB", 413)
      }
    }

    let evidenceUrl: string | null = null
    let persisted = false
    if (photoBytes && shift_id) {
      evidenceUrl = await uploadEvidence(String(shift_id), photoBytes, String(photo_mime))
      if (evidenceUrl) persisted = await persistEvidence(String(shift_id), evidenceUrl)
    }

    console.log(
      `[send-telegram-report] sender=${sender} chat=${chat_id} textLen=${text.length} ` +
      `photoBytes=${photoBytes ? photoBytes.byteLength : 0} url=${evidenceUrl ? "yes" : "no"} persisted=${persisted}`,
    )

    const results: Record<string, unknown> = {}

    const messageResult = await sendMessage(token, String(chat_id), text)
    results.message = { ok: messageResult.ok, message_id: messageResult.messageId }
    if (!messageResult.ok) {
      console.error(
        "[send-telegram-report] text failed:",
        JSON.stringify(messageResult.detail).slice(0, 400),
      )
    }

    let photoSent = false
    if (photoBytes) {
      const caption = `📸 Foto bukti tutup kasir${shift_id ? ` — ${shift_id}` : ""}`
      const photoResult = await sendPhoto(
        token,
        String(chat_id),
        caption,
        evidenceUrl,
        photoBytes,
        String(photo_filename),
        String(photo_mime),
      )
      photoSent = photoResult.ok
      results.photo = { ok: photoResult.ok, message_id: photoResult.messageId }
      if (!photoResult.ok) {
        console.error(
          "[send-telegram-report] photo failed:",
          JSON.stringify(photoResult.detail).slice(0, 400),
        )
      }
    }

    return json({
      success: messageResult.ok,
      evidence_url: evidenceUrl,
      evidence_persisted: persisted,
      text_sent: messageResult.ok,
      photo_sent: photoSent,
      results,
    })
  } catch (error) {
    console.error("[send-telegram-report] error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return fail("INTERNAL_ERROR", message, 500)
  }
})
