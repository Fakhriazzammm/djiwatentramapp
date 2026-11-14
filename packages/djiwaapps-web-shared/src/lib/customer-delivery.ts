export type DeliveryConfig = {
  active: boolean;
  couriers: Array<"gojek" | "grab">;
  defaultCourier: "gojek" | "grab";
  fallbackFee: number;
};

export class DeliveryApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryApiError";
  }
}

type DeliveryFunction = "delivery-admin" | "biteship-rates";

export async function deliveryApi<T>(
  fn: DeliveryFunction,
  body: Record<string, unknown>,
): Promise<T> {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const supabaseKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new DeliveryApiError("CONFIGURATION_ERROR", 500, "Konfigurasi Supabase tidak tersedia");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null) as {
    success?: boolean;
    error?: { code?: unknown; message?: unknown };
  } | null;

  if (!response.ok || data?.success === false) {
    throw new DeliveryApiError(
      String(data?.error?.code ?? "HTTP_ERROR"),
      response.status,
      String(data?.error?.message ?? "Layanan delivery tidak tersedia"),
    );
  }

  if (!data) {
    throw new DeliveryApiError("INVALID_RESPONSE", 502, "Respons delivery tidak valid");
  }

  return data as T;
}
