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
    const { text, chat_id } = body

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "text is required" } }), {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      })
    }

    console.log('[Edge Function] Sending to bot:', TELEGRAM_BOT_URL)
    console.log('[Edge Function] Text length:', text.length)
    console.log('[Edge Function] Chat ID:', chat_id || 'default')

    // Forward request to yumi-ai-bot
    const botResponse = await fetch(TELEGRAM_BOT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, chat_id }),
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
