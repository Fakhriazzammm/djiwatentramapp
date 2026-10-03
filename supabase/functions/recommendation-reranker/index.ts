import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const MAX_CANDIDATES = 50;
const MAX_RESULTS = 20;
const MIN_CONFIDENCE = 0.6;
const REQUEST_TIMEOUT_MS = 1_500;
const OPENROUTER_API_URL = "https://openrouter.ai/api/alpha/decisions";
const OPENROUTER_MODEL = "typesafe/jev-1.13";
const OPENROUTER_PROVIDER = "TypeSafe";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CandidateInput = { productId: string; deterministicScore: number };
type CatalogProduct = { _id: string; isAvailable: boolean };
type RankedCandidate = CandidateInput & { confidence?: number };
type RequestPayload = { candidates: CandidateInput[]; maxResults?: number };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function featureEnabled(): boolean {
  return (Deno.env.get("RECOMMENDATION_RERANKER_ENABLED") ?? "false").toLowerCase() === "true";
}

function deterministicFallback(candidates: CandidateInput[], maxResults: number): RankedCandidate[] {
  return [...candidates]
    .sort((a, b) => b.deterministicScore - a.deterministicScore || a.productId.localeCompare(b.productId))
    .slice(0, maxResults);
}

function parsePayload(value: unknown): RequestPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payload must be an object");
  }
  const body = value as Record<string, unknown>;
  const rawCandidates = body.candidates;
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0 || rawCandidates.length > MAX_CANDIDATES) {
    throw new Error(`candidates must contain 1-${MAX_CANDIDATES} items`);
  }
  const candidates: CandidateInput[] = rawCandidates.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`candidate ${index} must be an object`);
    }
    const candidate = item as Record<string, unknown>;
    const productId = candidate.productId;
    const score = candidate.deterministicScore;
    // Deliberately accept only productId and a numeric deterministic score: no PII or free text.
    if (Object.keys(candidate).some((key) => key !== "productId" && key !== "deterministicScore")) {
      throw new Error(`candidate ${index} contains unsupported fields`);
    }
    if (typeof productId !== "string" || productId.length < 1 || productId.length > 128) {
      throw new Error(`candidate ${index} has an invalid productId`);
    }
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new Error(`candidate ${index} has an invalid deterministicScore`);
    }
    return { productId, deterministicScore: score };
  });
  const ids = new Set(candidates.map((candidate) => candidate.productId));
  if (ids.size !== candidates.length) throw new Error("candidate productId values must be unique");
  const requestedMax = body.maxResults;
  if (requestedMax !== undefined && (typeof requestedMax !== "number" || !Number.isInteger(requestedMax) || requestedMax < 1 || requestedMax > MAX_RESULTS)) {
    throw new Error(`maxResults must be an integer from 1-${MAX_RESULTS}`);
  }
  return { candidates, maxResults: requestedMax === undefined ? undefined : requestedMax };
}

async function fetchAvailableProducts(ids: string[]): Promise<Set<string>> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Catalog configuration is unavailable");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase
    .from("pos_products_all")
    .select("_id,isAvailable")
    .in("_id", ids);
  if (error) throw error;
  return new Set((data as CatalogProduct[] ?? [])
    .filter((product) => product.isAvailable === true)
    .map((product) => String(product._id)));
}

function parseDecisionRanking(value: unknown, candidates: CandidateInput[]): RankedCandidate[] | null {
  if (!value || typeof value !== "object") return null;
  const answers = (value as Record<string, unknown>).answers;
  if (!answers || typeof answers !== "object") return null;
  const rows = Object.entries(answers as Record<string, unknown>).map(([key, answer]) => {
    if (!answer || typeof answer !== "object") return null;
    const score = (answer as Record<string, unknown>).score;
    const confidence = (answer as Record<string, unknown>).confidence;
    const index = Number(key.replace(/^candidate_/, ""));
    if (!Number.isInteger(index) || !candidates[index] || typeof score !== "number" || !Number.isFinite(score)) return null;
    if (typeof confidence === "number" && (confidence < MIN_CONFIDENCE || confidence > 1)) return null;
    return { productId: candidates[index].productId, deterministicScore: score, ...(typeof confidence === "number" ? { confidence } : {}) };
  });
  if (rows.some((row) => row === null)) return null;
  return (rows as RankedCandidate[]).sort((a, b) => b.deterministicScore - a.deterministicScore || a.productId.localeCompare(b.productId));
}

async function requestProvider(candidates: CandidateInput[]): Promise<RankedCandidate[] | null> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const questions = Object.fromEntries(candidates.map((_candidate, index) => [
      `candidate_${index}`,
      { type: "score", instructions: "How relevant is this product for the supplied recommendation context?", criteria: ["Not relevant", "Possibly relevant", "Relevant", "Highly relevant"] },
    ]));
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENROUTER_MODEL, provider: { order: [OPENROUTER_PROVIDER], allow_fallbacks: false }, state: { candidates }, questions }),
    });
    if (!response.ok) return null;
    const parsed = parseDecisionRanking(await response.json(), candidates);
    return parsed && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true });
  if (req.method !== "POST") return jsonResponse({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);
  try {
    const payload = parsePayload(await req.json());
    const maxResults = payload.maxResults ?? Math.min(payload.candidates.length, MAX_RESULTS);
    const availableIds = await fetchAvailableProducts(payload.candidates.map((candidate) => candidate.productId));
    const available = payload.candidates.filter((candidate) => availableIds.has(candidate.productId));
    const fallback = deterministicFallback(available, maxResults);
    if (available.length === 0) {
      return jsonResponse({ success: true, enabled: featureEnabled(), source: "deterministic_fallback", items: [], rejectedUnavailable: payload.candidates.length });
    }
    if (!featureEnabled()) {
      return jsonResponse({ success: true, enabled: false, source: "deterministic_fallback", items: fallback, rejectedUnavailable: payload.candidates.length - available.length });
    }
    const reranked = await requestProvider(available);
    const items = (reranked ?? fallback).slice(0, maxResults);
    return jsonResponse({ success: true, enabled: true, source: reranked ? "jev" : "deterministic_fallback", items, rejectedUnavailable: payload.candidates.length - available.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return jsonResponse({ success: false, error: { code: "INVALID_REQUEST", message } }, 400);
  }
});
