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
      p_session_id: null,
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
