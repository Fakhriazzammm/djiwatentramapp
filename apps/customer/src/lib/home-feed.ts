import type { CartItem } from "@/components/customer/types";
import type { CustomerOrder } from "@/lib/customer-order";
import type { DayPeriod } from "@/lib/day-period";

/** Bentuk minimal data Best Seller dari hook, cukup untuk memilih menu. */
export type BestSellerLike = { productId: string; productName?: string; totalSold?: number };
export type ProductLike = Record<string, any>;

export type FeaturedProduct = {
  productId: string;
  name: string;
  price: number | null;
  image: string | null;
  totalSold: number | null;
  isAvailable: boolean;
  categoryId: string;
  menuNumber: number | null;
};

/** Teks pembuka di kartu editorial tiap waktu hari. */
export const FEATURED_KICKER: Record<DayPeriod, string> = {
  pagi: "Mulai pagi dengan",
  siang: "Pilihan paling laris",
  sore: "Teman ngobrol sore",
  malam: "Makan malam di rumah",
};

/** Indeks Best Seller yang diutamakan per waktu (berputar bila daftar lebih pendek). */
const FEATURED_PREFERRED_INDEX: Record<DayPeriod, number> = { pagi: 1, siang: 0, sore: 1, malam: 0 };

function isHttpImage(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function toFeatured(best: BestSellerLike, product: ProductLike | undefined): FeaturedProduct {
  const rawImage = product?.image;
  const price = product?.price != null && Number.isFinite(Number(product.price)) ? Number(product.price) : null;
  return {
    productId: best.productId,
    name: String(product?.name ?? best.productName ?? "Menu pilihan"),
    price,
    image: isHttpImage(rawImage) ? rawImage : null,
    totalSold: best.totalSold != null && Number.isFinite(Number(best.totalSold)) ? Number(best.totalSold) : null,
    isAvailable: product?.isAvailable !== false,
    categoryId: String(product?.categoryId ?? ""),
    menuNumber: product?.menuNumber != null && Number.isFinite(Number(product.menuNumber)) ? Number(product.menuNumber) : null,
  };
}

/**
 * Menu unggulan untuk kartu editorial. Hanya menu yang masih ada dan tersedia.
 * Berganti antar menu terlaris sesuai waktu supaya kartu tidak monoton.
 */
export function pickFeaturedProduct(
  bestSellers: readonly BestSellerLike[] | null | undefined,
  productMap: ReadonlyMap<string, ProductLike>,
  period: DayPeriod,
): FeaturedProduct | null {
  const candidates = (bestSellers ?? [])
    .map((best) => toFeatured(best, productMap.get(best.productId)))
    .filter((item) => item.isAvailable && item.price != null);
  if (candidates.length === 0) return null;
  return candidates[FEATURED_PREFERRED_INDEX[period] % candidates.length];
}

/** Tiga menu terlaris untuk daftar berperingkat (menu yang tidak tersedia tetap tampil, tombolnya nonaktif). */
export function pickTopSellers(
  bestSellers: readonly BestSellerLike[] | null | undefined,
  productMap: ReadonlyMap<string, ProductLike>,
  limit = 3,
): FeaturedProduct[] {
  return (bestSellers ?? []).slice(0, limit).map((best) => toFeatured(best, productMap.get(best.productId)));
}

/** Pesanan terakhir yang sudah dibayar atau selesai (urutan data: terbaru lebih dulu). */
export function pickLastCompletedOrder(orders: readonly CustomerOrder[] | null | undefined): CustomerOrder | null {
  for (const order of orders ?? []) {
    if (!["paid", "completed"].includes(String(order.status ?? "").toLowerCase())) continue;
    if (!order.items || order.items.length === 0) continue;
    return order;
  }
  return null;
}

export type ReorderResult = { items: CartItem[]; missing: number };

/**
 * Susun keranjang dari pesanan lama memakai harga dan ketersediaan TERKINI.
 * Menu yang sudah dihapus atau tidak tersedia dilewati dan dihitung sebagai `missing`.
 */
export function buildReorderCart(order: CustomerOrder, productMap: ReadonlyMap<string, ProductLike>): ReorderResult {
  const items: CartItem[] = [];
  let missing = 0;
  for (const item of order.items) {
    const product = productMap.get(item.productId);
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    if (!product || product.isAvailable === false) {
      missing += quantity;
      continue;
    }
    const price = Number(product.price ?? item.price ?? 0);
    const existing = items.find((entry) => entry.productId === item.productId && entry.variant === (item.variant ?? undefined));
    if (existing) {
      existing.quantity += quantity;
      continue;
    }
    items.push({
      productId: item.productId as CartItem["productId"],
      name: String(product.name ?? item.productName),
      price,
      originalPrice: Number(product.originalPrice ?? product.compareAtPrice ?? 0) || undefined,
      quantity,
      variant: item.variant ?? undefined,
      image: typeof product.image === "string" ? product.image : undefined,
      categoryId: String(product.categoryId ?? "") as CartItem["categoryId"],
      menuNumber: product.menuNumber == null ? undefined : Number(product.menuNumber),
    });
  }
  return { items, missing };
}

/** "27 Okt 2026" */
export function formatOrderDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

/** "Americano Long Black + Air Mineral" (maksimal dua nama, sisanya "+N lagi"). */
export function summarizeOrderItems(order: CustomerOrder): string {
  const names = order.items.map((item) => String(item.productName ?? "").trim()).filter(Boolean);
  if (names.length <= 2) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} +${names.length - 2} lagi`;
}
