export type GuestOrderReference = { orderId: string; accessToken: string };

// The auth server exposes customer data under /api/customer. Keep this shared
// with profile and order history so an authenticated session uses one route family.
export const CUSTOMER_API_BASE =
  import.meta.env.VITE_CUSTOMER_API_URL?.trim() || "https://api.djiwatentram.web.id/api/customer";

export function customerApiUrl(path: string): string {
  return `${CUSTOMER_API_BASE}/${path.replace(/^\/+/, "")}`;
}

export function buildCustomerOrdersRequest(
  sourceId: string | null | undefined,
  guestReferences: GuestOrderReference[],
): { url: string; init: RequestInit } | null {
  if (sourceId) {
    return {
      url: customerApiUrl("orders"),
      init: { credentials: "include", headers: { Accept: "application/json" } },
    };
  }
  if (guestReferences.length === 0) return null;
  return {
    url: customerApiUrl("guest-orders"),
    init: {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: guestReferences }),
    },
  };
}
