import { invokeEdgeFunction, ApiError } from "@/lib/api-helper";

export type RunLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export type RunTier = {
  code: string;
  name: string;
  targetKm: number;
  distanceKm: number;
  status: "in_progress" | "completed" | "upgraded";
  rewardName?: string | null;
  rewardStatus?: string | null;
  expiresAt?: string | null;
};

export type RunActivity = {
  id: string;
  activityDate: string;
  activityType: string;
  distanceKm: number;
  status: "accepted" | "review" | "rejected" | string;
  createdAt?: string | null;
  reviewNote?: string | null;
};

export type RunOverview = {
  campaignId?: string | null;
  campaignName: string;
  periodLabel: string;
  monthlyDistanceKm: number;
  monthlyTargetKm: number;
  weeklyDistanceKm: number;
  weeklyTargetKm: number;
  tiers: RunTier[];
  activities: RunActivity[];
  rewardStatus?: string | null;
  rewardName?: string | null;
  rewardId?: string | null;
  rewardExpiresAt?: string | null;
};

export type RunSubmissionResult = {
  status: "accepted" | "review" | "rejected";
  activity?: RunActivity;
  extractedData?: {
    ownerName?: string | null;
    activityDate?: string | null;
    activityType?: string | null;
    distanceKm?: number | null;
    durationSeconds?: number | null;
    confidence?: number | null;
  };
  message?: string;
};

export type RunOcrData = {
  ownerName: string | null;
  activityDate: string | null;
  activityType: string | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  confidence: number | null;
};

export type RunOcrResult = {
  status: "confirmation_required" | "rejected" | "unavailable";
  proofStoragePath: string | null;
  extractedData: RunOcrData;
  message?: string;
};

export class DjiwaRunUnavailableError extends Error {
  constructor(message = "Fitur Djiwa Run belum tersedia di server.") {
    super(message);
    this.name = "DjiwaRunUnavailableError";
  }
}

function isUnavailableError(error: unknown): boolean {
  if (error instanceof DjiwaRunUnavailableError) return true;
  if (!(error instanceof ApiError)) return true;
  return error.status === 404 || error.status === 405 || error.status === 501 || ["FUNCTION_ERROR", "NOT_FOUND", "FEATURE_UNAVAILABLE", "ACTION_NOT_FOUND", "UNKNOWN_ACTION", "INVALID_ACTION"].includes(error.code);
}

function firstValue(raw: Record<string, any>, ...keys: string[]) {
  for (const key of keys) if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  return null;
}

function normalizeOcrResult(value: Record<string, any>, proofStoragePath: string | null): RunOcrResult {
  const raw = (value.data ?? value.result ?? value.extracted_data ?? value.extractedData ?? value) as Record<string, any>;
  const extracted = (raw.extracted_data ?? raw.extractedData ?? raw.fields ?? raw.ocr ?? raw) as Record<string, any>;
  const confidenceValue = firstValue(raw, "confidence", "ai_confidence", "ocr_confidence") ?? firstValue(extracted, "confidence", "ai_confidence", "ocr_confidence");
  const status = String(value.status ?? raw.status ?? raw.processing_status ?? "review").toLowerCase();
  return {
    status: status === "rejected" ? "rejected" : status === "unavailable" ? "unavailable" : "confirmation_required",
    proofStoragePath: String(value.proof_storage_path ?? raw.proof_storage_path ?? proofStoragePath ?? "") || null,
    extractedData: {
      ownerName: firstValue(extracted, "ownerName", "owner_name", "name", "athlete_name"),
      activityDate: firstValue(extracted, "activityDate", "activity_date", "date"),
      activityType: firstValue(extracted, "activityType", "activity_type", "type", "sport"),
      distanceKm: Number(firstValue(extracted, "distanceKm", "distance_km", "distance")) || null,
      durationSeconds: Number(firstValue(extracted, "durationSeconds", "duration_seconds", "duration")) || null,
      confidence: confidenceValue == null ? null : Number(confidenceValue),
    },
    message: typeof value.message === "string" ? value.message : typeof raw.message === "string" ? raw.message : undefined,
  };
}

async function invokeWithActionAliases<T>(actions: string[], payload: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (const action of actions) {
    try {
      return await invokeEdgeFunction<T>("djiwa-run", { ...payload, action });
    } catch (error) {
      lastError = error;
      if (!isUnavailableError(error)) throw error;
    }
  }
  throw lastError ?? new DjiwaRunUnavailableError();
}

function normalizeOverview(value: Partial<RunOverview> & Record<string, unknown>): RunOverview {
  const raw = value as Record<string, any>;
  return {
    campaignId: raw.campaignId ?? raw.campaign_id ?? raw.campaign?.id ?? null,
    campaignName: String(raw.campaignName ?? raw.campaign_name ?? raw.campaign?.name ?? "Djiwa Run"),
    periodLabel: String(raw.periodLabel ?? raw.period_label ?? "Periode aktif"),
    monthlyDistanceKm: Number(raw.monthlyDistanceKm ?? raw.monthly_distance_km ?? 0),
    monthlyTargetKm: Number(raw.monthlyTargetKm ?? raw.monthly_target_km ?? 0),
    weeklyDistanceKm: Number(raw.weeklyDistanceKm ?? raw.weekly_distance_km ?? 0),
    weeklyTargetKm: Number(raw.weeklyTargetKm ?? raw.weekly_target_km ?? 0),
    tiers: Array.isArray(raw.tiers) ? raw.tiers.map((tier: Record<string, any>) => ({
      code: String(tier.code ?? ""), name: String(tier.name ?? tier.code ?? "Tier"),
      targetKm: Number(tier.targetKm ?? tier.target_km ?? 0), distanceKm: Number(tier.distanceKm ?? tier.distance_km ?? 0),
      status: tier.status === "completed" || tier.status === "upgraded" ? tier.status : "in_progress",
      rewardName: typeof tier.rewardName === "string" ? tier.rewardName : typeof tier.reward_name === "string" ? tier.reward_name : null,
      rewardStatus: typeof tier.rewardStatus === "string" ? tier.rewardStatus : typeof tier.reward_status === "string" ? tier.reward_status : null,
      expiresAt: typeof tier.expiresAt === "string" ? tier.expiresAt : typeof tier.expires_at === "string" ? tier.expires_at : null,
    })) : [],
    activities: Array.isArray(raw.activities) ? raw.activities.map((activity: Record<string, any>) => ({
      id: String(activity.id ?? crypto.randomUUID()), activityDate: String(activity.activityDate ?? activity.activity_date ?? ""),
      activityType: String(activity.activityType ?? activity.activity_type ?? "Aktivitas"), distanceKm: Number(activity.distanceKm ?? activity.distance_km ?? 0),
      status: String(activity.status ?? "review"), createdAt: typeof activity.createdAt === "string" ? activity.createdAt : typeof activity.created_at === "string" ? activity.created_at : null, reviewNote: typeof activity.reviewNote === "string" ? activity.reviewNote : typeof activity.review_note === "string" ? activity.review_note : null,
    })) : [],
    rewardStatus: typeof raw.rewardStatus === "string" ? raw.rewardStatus : typeof raw.reward_status === "string" ? raw.reward_status : null,
    rewardName: typeof raw.rewardName === "string" ? raw.rewardName : typeof raw.reward_name === "string" ? raw.reward_name : null,
    rewardId: typeof raw.rewardId === "string" ? raw.rewardId : typeof raw.reward_id === "string" ? raw.reward_id : (Array.isArray(raw.rewards) ? String(raw.rewards.find((reward: Record<string, any>) => ["unlocked", "credited"].includes(String(reward.status)))?.id ?? "") || null : null),
    rewardExpiresAt: typeof raw.rewardExpiresAt === "string" ? raw.rewardExpiresAt : typeof raw.reward_expires_at === "string" ? raw.reward_expires_at : null,
  };
}

export async function getDjiwaRunOverview(customerSourceId: string, customerEmail: string | null): Promise<RunOverview> {
  try {
    const result = await invokeEdgeFunction<Partial<RunOverview> & Record<string, unknown>>("djiwa-run", { action: "get_progress", customerSourceId, customerEmail });
    return normalizeOverview(result);
  } catch (error) {
    if (isUnavailableError(error)) throw new DjiwaRunUnavailableError();
    throw error;
  }
}

export async function submitDjiwaRunActivity(input: { customerSourceId: string; customerEmail: string | null; campaignId: string; file: File; location: RunLocation; idempotencyKey: string }): Promise<RunOcrResult> {
  try {
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    const proofDataUrl = `data:${input.file.type};base64,${btoa(binary)}`;
    const uploaded = await invokeEdgeFunction<Record<string, any>>("djiwa-run", {
      action: "upload_proof", customer_source_id: input.customerSourceId, customer_email: input.customerEmail, campaign_id: input.campaignId,
      idempotency_key: input.idempotencyKey, latitude: input.location.latitude, longitude: input.location.longitude,
      location_accuracy_m: input.location.accuracy ?? null, proof_base64: proofDataUrl,
    });
    const proofStoragePath = String(uploaded.proof_storage_path ?? uploaded.proofStoragePath ?? "") || null;
    const ocr = await invokeWithActionAliases<Record<string, any>>(["ocr_proof", "process_ocr", "extract_proof"], {
      customer_source_id: input.customerSourceId, customer_email: input.customerEmail, campaign_id: input.campaignId,
      proof_storage_path: proofStoragePath, idempotency_key: input.idempotencyKey,
    });
    return normalizeOcrResult(ocr, proofStoragePath);
  } catch (error) {
    if (isUnavailableError(error)) throw new DjiwaRunUnavailableError();
    throw error;
  }
}

export type RunCheckoutReservation = {
  rewardId: string;
  reservationId: string;
  orderId: string;
  amount: number;
};

export async function reserveDjiwaRunCheckoutReward(input: { customerSourceId: string; customerEmail: string; rewardId: string; orderId: string; idempotencyKey: string }): Promise<RunCheckoutReservation> {
  const result = await invokeEdgeFunction<{ result?: Record<string, unknown> }>("djiwa-run", {
    action: "reserve_checkout_reward", customer_source_id: input.customerSourceId, customer_email: input.customerEmail,
    reward_id: input.rewardId, order_id: input.orderId, idempotency_key: input.idempotencyKey,
  });
  const raw = result.result ?? {};
  if (typeof raw.reservation_id !== "string" || typeof raw.amount !== "number") throw new Error("Reservation reward tidak valid");
  return { rewardId: String(raw.reward_id ?? input.rewardId), reservationId: raw.reservation_id, orderId: String(raw.order_id ?? input.orderId), amount: raw.amount };
}

export async function releaseDjiwaRunCheckoutReward(input: { customerSourceId: string; customerEmail: string; rewardId: string; orderId: string; reservationId: string; idempotencyKey: string; reason?: string }) {
  return invokeEdgeFunction("djiwa-run", { action: "release_checkout_reward", customer_source_id: input.customerSourceId, customer_email: input.customerEmail, reward_id: input.rewardId, order_id: input.orderId, reservation_id: input.reservationId, idempotency_key: input.idempotencyKey, reason: input.reason ?? "Checkout dibatalkan" });
}

export async function finalizeDjiwaRunCheckoutReward(input: { customerSourceId: string; customerEmail: string; rewardId: string; orderId: string; reservationId: string; idempotencyKey: string }) {
  return invokeEdgeFunction("djiwa-run", { action: "finalize_checkout_reward", customer_source_id: input.customerSourceId, customer_email: input.customerEmail, reward_id: input.rewardId, order_id: input.orderId, reservation_id: input.reservationId, idempotency_key: input.idempotencyKey });
}

export async function confirmDjiwaRunActivity(input: { customerSourceId: string; customerEmail: string | null; campaignId: string; proofStoragePath: string; extractedData: RunOcrData; location: RunLocation; idempotencyKey: string }): Promise<RunSubmissionResult> {
  try {
    const result = await invokeWithActionAliases<Record<string, any>>(["confirm_activity", "confirm_proof", "submit_activity"], {
      customer_source_id: input.customerSourceId, customer_email: input.customerEmail, campaign_id: input.campaignId,
      proof_storage_path: input.proofStoragePath, extracted_data: input.extractedData, idempotency_key: input.idempotencyKey,
      latitude: input.location.latitude, longitude: input.location.longitude, location_accuracy_m: input.location.accuracy ?? null,
    });
    const extracted = normalizeOcrResult(result, input.proofStoragePath).extractedData;
    const status = String(result.status ?? result.activity?.status ?? "review").toLowerCase();
    return { status: status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "review", activity: result.activity, extractedData: extracted, message: String(result.message ?? "Aktivitas dikirim dan menunggu review admin.") };
  } catch (error) {
    if (isUnavailableError(error)) throw new DjiwaRunUnavailableError();
    throw error;
  }
}
