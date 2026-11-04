import { invokeEdgeFunction } from "@/lib/api-helper";
import { resolvePhotoUrl, type JumatBerkahOverview } from "@/lib/jumat-berkah-logic";

type Identity = { sourceId?: string | null; email?: string | null };
type Wrapped<T> = { result?: T };

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "");

export function photoUrl(path: string): string {
  return resolvePhotoUrl(path, SUPABASE_URL);
}

export async function fetchJumatBerkah(identity: Identity): Promise<JumatBerkahOverview> {
  const response = await invokeEdgeFunction<Wrapped<JumatBerkahOverview>>("jumat-berkah", {
    action: "overview", sourceId: identity.sourceId ?? "", email: identity.email ?? "",
  });
  const overview = response.result ?? { enabled: false as const };
  if (!overview.enabled) return overview;
  return { ...overview, gallery: overview.gallery.map((photo) => ({ ...photo, imageUrl: photoUrl(photo.imageUrl) })) };
}

export type CreatedDonation = { donationId: string; status: string; invoiceUrl: string; amount: number };

export async function createJumatBerkahDonation(input: Identity & { portions: number; showName: boolean; prayer: string; idempotencyKey: string; returnUrl: string }) {
  const response = await invokeEdgeFunction<Wrapped<CreatedDonation>>("jumat-berkah", { action: "create-donation", ...input });
  if (!response.result?.invoiceUrl) throw new Error("Tautan pembayaran belum tersedia. Silakan coba lagi.");
  return response.result;
}

export type DonationStatus = {
  donationId?: string; status?: "pending" | "paid" | "expired" | "cancelled" | "refunded"; portions?: number; amount?: number;
  displayName?: string; prayer?: string | null; distributionDate?: string; invoiceUrl?: string | null; prayerStatus?: string | null;
};

export async function fetchJumatBerkahDonationStatus(identity: Identity & { donationId: string }): Promise<DonationStatus> {
  const response = await invokeEdgeFunction<Wrapped<DonationStatus>>("jumat-berkah", { action: "status", ...identity });
  return response.result ?? {};
}

export async function toggleJumatBerkahAmin(identity: Identity & { prayerId: string }) {
  const response = await invokeEdgeFunction<Wrapped<{ prayerId: string; aminCount: number; aminByMe: boolean }>>("jumat-berkah", { action: "toggle-amin", ...identity });
  if (!response.result) throw new Error("Aamiin belum tersimpan");
  return response.result;
}
