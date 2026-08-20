import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type Candidate = JsonRecord & {
  product_source_id: string;
  recommended_product_source_id: string;
  sort_order: number;
  recommended_name: string;
};

const supabaseUrl = Deno.env.get("YUMI_PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("YUMI_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const openaiBaseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
const openaiModel = Deno.env.get("OPENAI_MODEL_CHAT") ?? "gpt-4o-mini";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase function secrets");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadCandidates(sourceProductId: string): Promise<Candidate[]> {
  const { data, error } = await supabaseAdmin
    .from("pos_product_upsell_recommendations")
    .select("*")
    .eq("product_source_id", sourceProductId)
    .order("sort_order", { ascending: true })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as Candidate[];
}

async function verifyMember(sourceId: string, email: string) {
  if (!sourceId || !email) return false;
  const { data, error } = await supabaseAdmin
    .schema("pos")
    .from("customers")
    .select("source_id, email")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error || !data) return false;
  return text(data.email).toLowerCase() === email.toLowerCase();
}

async function loadBehavior(sourceId: string) {
  const { data: orders, error: orderError } = await supabaseAdmin
    .schema("pos")
    .from("orders")
    .select("source_id, creation_time, status")
    .eq("customer_source_id", sourceId)
    .in("status", ["paid", "completed"])
    .order("creation_time", { ascending: false })
    .limit(30);

  if (orderError) throw orderError;
  const orderIds = (orders ?? []).map((order) => text(order.source_id)).filter(Boolean);
  if (orderIds.length === 0) return [];

  const { data: items, error: itemError } = await supabaseAdmin
    .schema("pos")
    .from("order_items")
    .select("order_source_id, product_source_id, product_name, quantity")
    .in("order_source_id", orderIds);

  if (itemError) throw itemError;

  const counts = new Map<string, { name: string; quantity: number; orders: number }>();
  const orderProducts = new Map<string, Set<string>>();
  for (const rawItem of items ?? []) {
    const item = rawItem as JsonRecord;
    const productId = text(item.product_source_id);
    const orderId = text(item.order_source_id);
    if (!productId) continue;
    const current = counts.get(productId) ?? {
      name: text(item.product_name) || productId,
      quantity: 0,
      orders: 0,
    };
    current.quantity += number(item.quantity, 1);
    const productsInOrder = orderProducts.get(orderId) ?? new Set<string>();
    if (!productsInOrder.has(productId)) current.orders += 1;
    productsInOrder.add(productId);
    orderProducts.set(orderId, productsInOrder);
    counts.set(productId, current);
  }

  return [...counts.entries()]
    .map(([productId, value]) => ({ productId, ...value }))
    .sort((a, b) => b.orders - a.orders || b.quantity - a.quantity)
    .slice(0, 12);
}

function deterministicOrder(candidates: Candidate[], behavior: Array<{ productId: string; orders: number; quantity: number }>) {
  const behaviorMap = new Map(behavior.map((item) => [item.productId, item]));
  return [...candidates].sort((a, b) => {
    const aBehavior = behaviorMap.get(a.recommended_product_source_id);
    const bBehavior = behaviorMap.get(b.recommended_product_source_id);
    const aScore = (aBehavior?.orders ?? 0) * 10 + (aBehavior?.quantity ?? 0);
    const bScore = (bBehavior?.orders ?? 0) * 10 + (bBehavior?.quantity ?? 0);
    return bScore - aScore || number(a.sort_order) - number(b.sort_order);
  });
}

function parseIds(content: string) {
  const cleaned = content.replace(/```json|```/gi, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as JsonRecord;
    return Array.isArray(parsed.recommendedProductSourceIds)
      ? parsed.recommendedProductSourceIds.map(text).filter(Boolean)
      : [];
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}

async function rankWithAi(candidates: Candidate[], behavior: Array<{ productId: string; name: string; orders: number; quantity: number }>, maxRecommendations: number) {
  const isLocalRouter = openaiBaseUrl.includes(":20128");
  if ((!openaiApiKey && !isLocalRouter) || behavior.length === 0 || candidates.length === 0) return [];

  const candidatePayload = candidates.map((candidate) => ({
    sourceId: candidate.recommended_product_source_id,
    name: candidate.recommended_name,
    categoryId: candidate.recommended_category_id,
    price: number(candidate.recommended_price),
  }));
  const behaviorPayload = behavior.map((item) => ({
    productId: item.productId,
    name: item.name,
    orders: item.orders,
    quantity: item.quantity,
  }));

  const response = await fetch(`${openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      ...(openaiApiKey ? { Authorization: `Bearer ${openaiApiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.1,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: "Kamu adalah mesin ranking upsell restoran. Pilih hanya sourceId dari candidateProducts. Jangan membuat ID baru, jangan mengubah harga, dan jangan memberi penjelasan. Balas JSON valid dengan format {\"recommendedProductSourceIds\":[\"id\"]}.",
        },
        {
          role: "user",
          content: JSON.stringify({ behavior: behaviorPayload, candidateProducts: candidatePayload, maxRecommendations }),
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) throw new Error(`AI ranking failed with ${response.status}`);
  const payload = (await response.json()) as JsonRecord;
  return parseIds(text((payload.choices as Array<JsonRecord> | undefined)?.[0]?.message && ((payload.choices as Array<JsonRecord>)[0].message as JsonRecord).content));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);

  try {
    const payload = (await req.json()) as JsonRecord;
    const sourceProductId = text(payload.sourceProductId);
    const customerSourceId = text(payload.customerSourceId);
    const customerEmail = text(payload.customerEmail);
    const maxRecommendations = Math.min(5, Math.max(1, number(payload.maxRecommendations, 3)));
    if (!sourceProductId) return json({ success: false, error: { code: "SOURCE_PRODUCT_REQUIRED", message: "sourceProductId wajib diisi" } }, 400);

    const candidates = await loadCandidates(sourceProductId);
    if (candidates.length === 0) return json({ success: true, recommendations: [], strategy: "database_empty" });

    const isVerifiedMember = await verifyMember(customerSourceId, customerEmail);
    const behavior = isVerifiedMember ? await loadBehavior(customerSourceId) : [];
    const fallback = deterministicOrder(candidates, behavior);
    let ordered = fallback;
    let strategy = isVerifiedMember && behavior.length > 0 ? "database_behavior_fallback" : "database";

    if (isVerifiedMember && behavior.length > 0) {
      try {
        const rankedIds = await rankWithAi(candidates, behavior, maxRecommendations);
        const candidateMap = new Map(candidates.map((candidate) => [candidate.recommended_product_source_id, candidate]));
        const ranked = rankedIds.map((id) => candidateMap.get(id)).filter(Boolean) as Candidate[];
        const rankedSet = new Set(rankedIds);
        ordered = [...ranked, ...fallback.filter((candidate) => !rankedSet.has(candidate.recommended_product_source_id))];
        if (ranked.length > 0) strategy = "ai_behavior";
      } catch (error) {
        console.warn("[customer-upsell-ai] fallback:", error instanceof Error ? error.message : error);
      }
    }

    return json({ success: true, recommendations: ordered.slice(0, maxRecommendations), strategy });
  } catch (error) {
    console.error("[customer-upsell-ai]", error);
    return json({ success: false, error: { code: "UPSELL_RECOMMENDATION_FAILED", message: "Rekomendasi sementara tidak tersedia" } }, 200);
  }
});
