import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TELEGRAM_BOT_URL = Deno.env.get('TELEGRAM_BOT_URL') || 'http://localhost:8001/send-report'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }), {
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    }

    const body = await req.json()
    const { text, chat_id, sender = 'report', photo_base64, photo_filename = 'shift-closing-evidence.jpg', photo_mime = 'image/jpeg', shift_id } = body

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "text is required" } }), {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    }

    const supervisorToken = sender === 'supervisor' ? Deno.env.get('TELEGRAM_SUPERVISOR_BOT_TOKEN') : null
    const botUrl = supervisorToken
      ? `https://api.telegram.org/bot${supervisorToken}/sendMessage`
      : TELEGRAM_BOT_URL

    console.log('[Edge Function] Sending via:', sender, 'to:', botUrl.replace(/bot[^/]+/, 'bot***'))
    console.log('[Edge Function] Text length:', text.length)
    console.log('[Edge Function] Chat ID:', chat_id || 'default')

    const requestBody = supervisorToken && photo_base64
      ? (() => {
          const form = new FormData()
          const binary = Uint8Array.from(atob(String(photo_base64)), (char) => char.charCodeAt(0))
          form.append('chat_id', String(chat_id ?? ''))
          form.append('caption', text)
          form.append('photo', new Blob([binary], { type: photo_mime }), photo_filename)
          return { body: form }
        })()
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, chat_id, photo_base64, photo_filename, photo_mime, shift_id }),
        }

    const botResponse = await fetch(botUrl, {
      method: 'POST',
      ...requestBody,
    })

    const data = await botResponse.json()

    console.log('[Edge Function] Bot response status:', botResponse.status)
    console.log('[Edge Function] Bot response:', data)

    return new Response(JSON.stringify({ success: true, ...data }), {
      status: botResponse.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('[Edge Function] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message || 'Internal server error' },
      }),
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
