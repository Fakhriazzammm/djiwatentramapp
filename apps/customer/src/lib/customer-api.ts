import { CUSTOMER_API_BASE } from "@/lib/customer-auth-config";

export { CUSTOMER_API_BASE } from "@/lib/customer-auth-config";

export type CustomerOrderReference = {
  orderId: string;
  accessToken: string;
};

export type CustomerOrderReferenceInput = {
  orderId: string;
  accessToken?: string;
};

export function normalizeCustomerOrderReferences(references: ReadonlyArray<CustomerOrderReferenceInput>) {
  return references.filter((reference): reference is CustomerOrderReference => Boolean(reference.accessToken));
}

type CustomerApiResponse = {
  success?: boolean;
  orders?: Array<Record<string, unknown>>;
  error?: string | { message?: string };
  message?: string;
};

async function requestJson<T extends CustomerApiResponse>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${CUSTOMER_API_BASE}${path}`, {
    ...init,
    credentials: "include",
  });
  let payload: T | null = null;
  try {
    payload = await response.json() as T;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload?.error;
    const detail = typeof error === "string" ? error : error?.message || payload?.message;
    throw new Error(`Customer API HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  if (payload?.success === false) {
    const error = payload.error;
    const detail = typeof error === "string" ? error : error?.message || payload.message || "Request gagal";
    throw new Error(`Customer API request failed: ${detail}`);
  }
  return payload ?? {} as T;
}

export async function fetchMemberOrders(signal?: AbortSignal) {
  const payload = await requestJson<CustomerApiResponse>("/orders", {
    signal,
    headers: { Accept: "application/json" },
  });
  return payload.orders ?? [];
}

export async function fetchGuestOrders(references: CustomerOrderReference[], signal?: AbortSignal) {
  if (references.length === 0) return [];
  const payload = await requestJson<CustomerApiResponse>("/guest-orders", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orders: references }),
  });
  return payload.orders ?? [];
}

function orderId(row: Record<string, unknown>) {
  return String(row._id ?? row.source_id ?? row.id ?? "");
}

export async function fetchCustomerOrderById(
  id: string,
  references: CustomerOrderReference[],
  signal?: AbortSignal,
) {
  const guestReference = references.find((reference) => reference.orderId === id && reference.accessToken);
  if (guestReference) {
    const orders = await fetchGuestOrders([guestReference], signal);
    return orders[0] ?? null;
  }
  const orders = await fetchMemberOrders(signal);
  return orders.find((row) => orderId(row) === id) ?? null;
}

export async function subscribeCustomerPush(payload: Record<string, unknown>, signal?: AbortSignal) {
  await requestJson("/push/subscribe", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function unsubscribeCustomerPush(endpoint: string, signal?: AbortSignal) {
  await requestJson("/push/unsubscribe", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}
