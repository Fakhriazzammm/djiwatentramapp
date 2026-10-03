import { createClient } from "@/lib/client";

export type RecommendationEventType = "impression" | "click" | "add_to_cart" | "purchase" | "dismiss" | "not_interested";

export async function recordRecommendationEvent(input: {
  eventType: RecommendationEventType;
  productSourceId?: string | null;
  recommendedProductSourceId: string;
  strategy: string;
  placement?: string;
  customerSourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const eventKey = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await createClient().rpc("record_product_recommendation_event", {
      p_event_key: eventKey,
      p_event_type: input.eventType,
      p_product_source_id: input.productSourceId ?? null,
      p_recommended_product_source_id: input.recommendedProductSourceId,
      p_strategy: input.strategy,
      p_placement: input.placement ?? "inline_menu",
      p_customer_source_id: input.customerSourceId ?? null,
      p_session_id: getRecommendationSessionKey(),
      p_metadata: input.metadata ?? {},
    });
  } catch {
    // Analytics must never block menu or cart interactions.
  }
}

export function getRecommendationSessionKey(): string {
  const storageKey = "djiwa-recommendation-session";
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(storageKey, value);
    return value;
  } catch {
    return `volatile-${Date.now()}`;
  }
}

export async function assignRecommendationExperiment(experimentKey: string): Promise<string | null> {
  try {
    const { data } = await createClient().rpc("assign_product_recommendation_experiment", {
      p_experiment_key: experimentKey,
      p_subject_key: getRecommendationSessionKey(),
    });
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

const FATIGUE_STORAGE_KEY = "djiwa-recommendation-impressions";

export function getRecommendationImpressionCount(productSourceId: string): number {
  try {
    const raw = window.sessionStorage.getItem(FATIGUE_STORAGE_KEY);
    const counts = raw ? JSON.parse(raw) as Record<string, number> : {};
    return Math.max(0, Number(counts[productSourceId] ?? 0));
  } catch {
    return 0;
  }
}

export function markRecommendationImpressions(productSourceIds: string[]): void {
  try {
    const raw = window.sessionStorage.getItem(FATIGUE_STORAGE_KEY);
    const counts = raw ? JSON.parse(raw) as Record<string, number> : {};
    for (const productSourceId of productSourceIds) {
      if (productSourceId) counts[productSourceId] = Math.min(10, getRecommendationImpressionCount(productSourceId) + 1);
    }
    window.sessionStorage.setItem(FATIGUE_STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Fatigue tracking must never block rendering.
  }
}

export function recommendationFatiguePenalty(productSourceId: string): number {
  const impressions = getRecommendationImpressionCount(productSourceId);
  return impressions <= 1 ? 0 : Math.min(80, (impressions - 1) * 20);
}

const NOT_INTERESTED_STORAGE_KEY = "djiwa-recommendation-not-interested";

export function markRecommendationNotInterested(productSourceId: string): void {
  try {
    const raw = window.sessionStorage.getItem(NOT_INTERESTED_STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) as string[] : [];
    if (!ids.includes(productSourceId)) window.sessionStorage.setItem(NOT_INTERESTED_STORAGE_KEY, JSON.stringify([...ids, productSourceId].slice(-50)));
  } catch {
    // Feedback must never block the menu.
  }
}

export function recommendationFeedbackPenalty(productSourceId: string): number {
  try {
    const raw = window.sessionStorage.getItem(NOT_INTERESTED_STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) as string[] : [];
    return ids.includes(productSourceId) ? 10000 : 0;
  } catch {
    return 0;
  }
}
