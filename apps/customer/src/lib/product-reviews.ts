import { invokeEdgeFunction } from "@/lib/api-helper";

export type ProductReviewSummary = {
  productSourceId: string;
  publishedCount: number;
  ratingAverage: number | null;
  rating1Count?: number;
  rating2Count?: number;
  rating3Count?: number;
  rating4Count?: number;
  rating5Count?: number;
  lastReviewedAt?: string | null;
};

export type ProductReview = {
  id: string;
  productSourceId: string;
  rating: number;
  comment: string | null;
  customerDisplayName: string | null;
  createdAt: string;
};

export type CreateProductReviewInput = {
  productSourceId: string;
  orderSourceId: string;
  rating: number;
  comment?: string;
};

type RawSummary = Partial<ProductReviewSummary> & Record<string, unknown>;
type SummaryResponse = { summary?: RawSummary | null; product?: RawSummary | null };
type ListResponse = { reviews?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>>; hasMore?: boolean; nextCursor?: string | null };
type CreateResponse = { review?: Record<string, unknown> | null; pending?: boolean; status?: string };

function numberOrNull(value: unknown): number | null {
  return value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
}

function mapSummary(raw: RawSummary | null | undefined, productSourceId: string): ProductReviewSummary {
  return {
    productSourceId: String(raw?.productSourceId ?? raw?.product_source_id ?? productSourceId),
    publishedCount: Math.max(0, Number(raw?.publishedCount ?? raw?.published_count ?? 0)),
    ratingAverage: numberOrNull(raw?.ratingAverage ?? raw?.rating_average),
    rating1Count: Number(raw?.rating1Count ?? raw?.rating_1_count ?? 0),
    rating2Count: Number(raw?.rating2Count ?? raw?.rating_2_count ?? 0),
    rating3Count: Number(raw?.rating3Count ?? raw?.rating_3_count ?? 0),
    rating4Count: Number(raw?.rating4Count ?? raw?.rating_4_count ?? 0),
    rating5Count: Number(raw?.rating5Count ?? raw?.rating_5_count ?? 0),
    lastReviewedAt: (raw?.lastReviewedAt ?? raw?.last_reviewed_at ?? null) as string | null,
  };
}

function mapReview(raw: Record<string, unknown>, productSourceId: string): ProductReview {
  return {
    id: String(raw.id ?? raw.source_id ?? ""),
    productSourceId: String(raw.productSourceId ?? raw.product_source_id ?? productSourceId),
    rating: Math.min(5, Math.max(1, Number(raw.rating ?? 0))),
    comment: raw.comment == null ? null : String(raw.comment),
    customerDisplayName: raw.customerDisplayName == null && raw.customer_display_name == null ? null : String(raw.customerDisplayName ?? raw.customer_display_name),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

export async function getProductReviewSummary(productSourceId: string): Promise<ProductReviewSummary> {
  const response = await invokeEdgeFunction<SummaryResponse>("product-reviews", { action: "summary", productSourceId });
  return mapSummary(response.summary ?? response.product ?? response as unknown as RawSummary, productSourceId);
}

export async function listProductReviews(productSourceId: string, cursor?: string | null): Promise<{ reviews: ProductReview[]; hasMore: boolean; nextCursor: string | null }> {
  const response = await invokeEdgeFunction<ListResponse>("product-reviews", { action: "list", productSourceId, limit: 10, ...(cursor ? { cursor } : {}) });
  const rows = response.reviews ?? response.items ?? [];
  return { reviews: rows.map((row) => mapReview(row, productSourceId)), hasMore: response.hasMore === true, nextCursor: response.nextCursor ?? null };
}

export async function createProductReview(input: CreateProductReviewInput): Promise<{ review: ProductReview | null; status: string }> {
  const comment = input.comment?.trim() || undefined;
  const response = await invokeEdgeFunction<CreateResponse>("product-reviews", { action: "create", productSourceId: input.productSourceId, orderSourceId: input.orderSourceId, rating: input.rating, ...(comment ? { comment } : {}) });
  return { review: response.review ? mapReview(response.review, input.productSourceId) : null, status: String(response.status ?? (response.pending === false ? "published" : "pending")) };
}
