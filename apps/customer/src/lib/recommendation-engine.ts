export type RecommendationPeriod = "today" | "month" | "all";

export type RecommendationScoreInput = {
  recentScore?: number;
  periodScore?: number;
  pairingScore?: number;
  promoScore?: number;
  diversityPenalty?: number;
};

/** Deterministic, explainable score. Business arithmetic stays in code. */
export function deterministicRecommendationScore(input: RecommendationScoreInput): number {
  const recent = Math.max(0, Number(input.recentScore ?? 0));
  const period = Math.max(0, Number(input.periodScore ?? 0));
  const pairing = Math.max(0, Number(input.pairingScore ?? 0));
  const promo = Math.max(0, Number(input.promoScore ?? 0));
  const penalty = Math.max(0, Number(input.diversityPenalty ?? 0));
  return recent * 1000 + period * 10 + pairing * 5 + promo - penalty;
}

export function recencyDecay(ageDays: number): number {
  const days = Math.max(0, Number(ageDays));
  if (days <= 1) return 1;
  if (days <= 7) return 0.7;
  if (days <= 30) return 0.35;
  return 0.1;
}
