// Shared, testable logic for the Travel finance book gateway.
//
// The book itself lives in the shared finance service (schema `finance`), so this gateway is the
// only surface the Travel host talks to. It never returns provider or platform secrets.

export const INTERNAL_SECRET_HEADER = "x-djiwa-travel-settlement-secret";

export type LedgerExpenseRequest = {
  kind: "expense";
  sourceId: string;
  amount: number;
  category: string;
  description: string;
  merchant: string | null;
  occurredAtMs: number;
  paymentMethod: string;
  metadata: Record<string, unknown>;
};

export type LedgerReportRequest = { kind: "report"; days: number };

export type LedgerRequest = LedgerExpenseRequest | LedgerReportRequest;

export type TravelBookEntry = {
  sourceId: string;
  txType: "income" | "expense";
  amount: number;
  category: string | null;
  merchant: string | null;
  description: string | null;
  txDateMs: number;
  status: string | null;
};

export type TravelBookReport = {
  ok: true;
  days: number;
  truncated: boolean;
  totals: {
    income: number;
    expense: number;
    net: number;
    incomeCount: number;
    expenseCount: number;
  };
  byCategory: Array<{ category: string; txType: "income" | "expense"; amount: number; count: number }>;
  daily: Array<{ day: string; income: number; expense: number }>;
  recent: TravelBookEntry[];
};

const MAX_DAYS = 366;
const DEFAULT_DAYS = 30;
const MAX_AMOUNT = 1_000_000_000;
const MAX_TEXT = 200;
const MAX_ROWS = 2000;

const SOURCE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

function fail(message: string): never {
  throw new Error(message);
}

/** Constant-time comparison so a wrong secret leaks no timing signal. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function authorizeLedgerSecret(supplied: string, configured: string): "ok" | "missing_config" | "unauthorized" {
  if (!configured) return "missing_config";
  return constantTimeEqual(supplied, configured) ? "ok" : "unauthorized";
}

function readText(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== "string") fail(`${field} is invalid`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) fail(`${field} is invalid`);
  // Control characters would corrupt logs and CSV exports downstream.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) fail(`${field} is invalid`);
  return trimmed;
}

function readOptionalText(value: unknown, field: string, max = MAX_TEXT): string | null {
  if (value === undefined || value === null || value === "") return null;
  return readText(value, field, max);
}

function readAmount(value: unknown): number {
  const amount = typeof value === "string" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) fail("amount is invalid");
  if (amount <= 0 || amount > MAX_AMOUNT) fail("amount is outside the accepted range");
  return Math.round(amount);
}

/**
 * Accepts the two supported actions and rejects anything else, so the gateway cannot be turned
 * into a general-purpose write path into the finance service.
 */
export function parseLedgerRequest(body: unknown): LedgerRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("body is invalid");
  const input = body as Record<string, unknown>;
  const action = input["action"];

  if (action === "report") {
    const rawDays = input["days"];
    let days = DEFAULT_DAYS;
    if (rawDays !== undefined && rawDays !== null) {
      const parsed = typeof rawDays === "string" ? Number(rawDays) : rawDays;
      if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 1 || parsed > MAX_DAYS) {
        fail("days is outside the accepted range");
      }
      days = Math.floor(parsed);
    }
    return { kind: "report", days };
  }

  if (action === "expense") {
    const externalId = readText(input["externalId"], "externalId", 64);
    if (!SOURCE_ID_RE.test(`trav_exp_${externalId}`)) fail("externalId is invalid");
    const occurredAt = input["occurredAtMs"];
    let occurredAtMs = Date.now();
    if (occurredAt !== undefined && occurredAt !== null) {
      const parsed = typeof occurredAt === "string" ? Number(occurredAt) : occurredAt;
      if (typeof parsed !== "number" || !Number.isFinite(parsed)) fail("occurredAtMs is invalid");
      occurredAtMs = Math.round(parsed);
    }
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries((input["metadata"] as Record<string, unknown>) ?? {})) {
      if (typeof key !== "string" || key.length > 40) continue;
      if (typeof value === "string" && value.length <= MAX_TEXT) metadata[key] = value;
    }
    return {
      kind: "expense",
      sourceId: `trav_exp_${externalId}`,
      amount: readAmount(input["amount"]),
      category: readText(input["category"], "category", 60),
      description: readText(input["description"], "description"),
      merchant: readOptionalText(input["merchant"], "merchant", 80),
      occurredAtMs,
      paymentMethod: readOptionalText(input["paymentMethod"], "paymentMethod", 40) ?? "transfer",
      metadata,
    };
  }

  return fail("unsupported action");
}

/** Provider payloads are untrusted input: keep only well-formed rows. */
export function normalizeBookRows(rows: unknown, limit = MAX_ROWS): { entries: TravelBookEntry[]; truncated: boolean } {
  if (!Array.isArray(rows)) fail("book response is invalid");
  const entries: TravelBookEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const txType = item["tx_type"];
    if (txType !== "income" && txType !== "expense") continue;
    const amount = Number(item["amount"]);
    const txDateMs = Number(item["tx_date"]);
    if (!Number.isFinite(amount)) continue;
    entries.push({
      sourceId: String(item["source_id"] ?? ""),
      txType,
      amount: Math.round(amount),
      category: item["category"] === null || item["category"] === undefined ? null : String(item["category"]),
      merchant: item["merchant"] === null || item["merchant"] === undefined ? null : String(item["merchant"]),
      description: item["description"] === null || item["description"] === undefined ? null : String(item["description"]),
      txDateMs: Number.isFinite(txDateMs) ? txDateMs : 0,
      status: item["status"] === null || item["status"] === undefined ? null : String(item["status"]),
    });
    if (entries.length >= limit) return { entries, truncated: true };
  }
  return { entries, truncated: false };
}

const WIB_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Bookkeeping days follow WIB, matching how the business reads its own reports. */
export function wibDay(txDateMs: number): string {
  if (!Number.isFinite(txDateMs) || txDateMs <= 0) return "unknown";
  return WIB_DATE.format(new Date(txDateMs));
}

export function buildTravelBookReport(
  entries: TravelBookEntry[],
  days: number,
  truncated: boolean,
  recentLimit = 50,
): TravelBookReport {
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  const byCategory = new Map<string, { category: string; txType: "income" | "expense"; amount: number; count: number }>();
  const daily = new Map<string, { day: string; income: number; expense: number }>();

  for (const entry of entries) {
    if (entry.txType === "income") {
      income += entry.amount;
      incomeCount += 1;
    } else {
      expense += entry.amount;
      expenseCount += 1;
    }

    const category = entry.category ?? "Lainnya";
    const categoryKey = `${entry.txType}:${category}`;
    const categoryRow = byCategory.get(categoryKey) ?? { category, txType: entry.txType, amount: 0, count: 0 };
    categoryRow.amount += entry.amount;
    categoryRow.count += 1;
    byCategory.set(categoryKey, categoryRow);

    const day = wibDay(entry.txDateMs);
    const dayRow = daily.get(day) ?? { day, income: 0, expense: 0 };
    dayRow[entry.txType] += entry.amount;
    daily.set(day, dayRow);
  }

  const recent = [...entries].sort((a, b) => b.txDateMs - a.txDateMs).slice(0, recentLimit);

  return {
    ok: true,
    days,
    truncated,
    totals: { income, expense, net: income - expense, incomeCount, expenseCount },
    byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    daily: [...daily.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    recent,
  };
}
