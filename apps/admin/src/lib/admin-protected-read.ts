
export type ProtectedReadAction = "orders" | "booking" | "finance";
export type ProtectedReadQuery = {
  select?: string;
  eq?: Record<string, string | number | boolean | null>;
  gte?: Record<string, string | number>;
  gt?: Record<string, string | number>;
  lte?: Record<string, string | number>;
  lt?: Record<string, string | number>;
  in?: Record<string, Array<string | number>>;
  order?: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }>;
  range?: [number, number];
  limit?: number;
};

export async function adminProtectedRead<T = any>(
  action: ProtectedReadAction,
  query: ProtectedReadQuery = {},
): Promise<T[]> {
  if (typeof window === "undefined") return [];
  const token = window.localStorage.getItem("yumi_session_token")?.trim();
  if (!token) throw new Error("Sesi admin tidak ditemukan");

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const publishableKey = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  );
  if (!supabaseUrl || !publishableKey) throw new Error("Konfigurasi Supabase tidak tersedia");

  const response = await fetch(`${supabaseUrl}/functions/v1/admin-protected-read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "x-yumi-session-token": token,
    },
    body: JSON.stringify({ action, query }),
  });
  const text = await response.text();
  let body: any;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(body?.error?.message ?? body?.error ?? `Protected read failed (${response.status})`);
  }
  if (!body || body.success !== true || !Array.isArray(body.data)) {
    throw new Error("Protected read returned an invalid response");
  }
  return body.data as T[];
}

export function protectedReadQueryFromRange(
  column: string,
  start: number,
  end: number,
): Pick<ProtectedReadQuery, "gte" | "lte"> {
  return { gte: { [column]: start }, lte: { [column]: end } };
}
