import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Max-Age": "86400",
};

type JsonRecord = Record<string, unknown>;
type Application = {
  id: string;
  registration_number: string | null;
  status: string;
  full_name: string;
  email: string | null;
  phone: string;
  employment: JsonRecord;
  contract: JsonRecord;
  signature_url: string | null;
  contract_pdf_url: string | null;
  contract_status: string | null;
  contract_approved_by_admin_at: string | null;
  contract_signed_by_employee_at: string | null;
  created_at: string;
  updated_at: string;
  raw?: JsonRecord;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function ok(data: JsonRecord, status = 200) {
  return response({ success: true, data }, status);
}

function fail(code: string, message: string, status = 400) {
  return response({ success: false, error: { code, message } }, status);
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}

function requiredText(value: unknown, field: string, max = 500): string {
  const result = text(value, max);
  if (!result) throw new ApiError("VALIDATION_ERROR", `${field} wajib diisi`, 400);
  return result;
}

function isIsoDate(value: string | null) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSafeUrl(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 2000;
  } catch {
    return false;
  }
}

class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function tokenFromRequest(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newOpaqueToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

function dbHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: "application/json" };
}

async function db(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new ApiError("SERVER_MISCONFIGURED", "Database service is not configured", 500);
  const headers = { ...dbHeaders(), ...(init.headers ?? {}) };
  const result = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const body = await result.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* preserve database error as text */ }
  if (!result.ok) {
    const message = typeof parsed === "object" && parsed && "message" in parsed
      ? String((parsed as JsonRecord).message)
      : body.slice(0, 500);
    throw new ApiError("DATABASE_ERROR", message || "Database request failed", 500);
  }
  return parsed;
}

async function select(table: string, columns: string, query: string) {
  return await db(`${table}?select=${encodeURIComponent(columns)}&${query}`) as unknown[];
}

async function insert(table: string, payload: JsonRecord) {
  return await db(table, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  }) as unknown[];
}

async function patch(table: string, query: string, payload: JsonRecord) {
  return await db(`${table}?${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  }) as unknown[];
}

const PUBLIC_COLUMNS = "id,registration_number,status,full_name,email,phone,employment,contract,signature_url,contract_pdf_url,contract_status,contract_approved_by_admin_at,contract_signed_by_employee_at,created_at,updated_at";

function publicApplication(app: Application) {
  const employment = record(app.employment);
  const contract = record(app.contract);
  return {
    id: app.id,
    registrationNumber: app.registration_number,
    status: app.status,
    fullName: app.full_name,
    email: app.email,
    phone: app.phone,
    employment: {
      roleName: text(employment.roleName),
      employmentType: text(employment.employmentType),
      roleId: text(employment.roleId),
    },
    contract: {
      title: text(contract.title),
      templateUsed: text(contract.templateUsed),
      agreedAt: text(contract.agreedAt),
    },
    signatureUrl: app.signature_url,
    contractPdfUrl: app.contract_pdf_url,
    contractStatus: app.contract_status,
    contractApprovedByAdminAt: app.contract_approved_by_admin_at,
    contractSignedByEmployeeAt: app.contract_signed_by_employee_at,
    createdAt: app.created_at,
    updatedAt: app.updated_at,
  };
}

function allowOnly(payload: JsonRecord, allowed: string[]) {
  const unknown = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ApiError("UNKNOWN_FIELD", `Field tidak diizinkan: ${unknown.join(", ")}`, 400);
}

async function register(payload: JsonRecord) {
  allowOnly(payload, ["fullName", "email", "phone", "identityNumber", "address", "birthDate", "birthPlace", "emergencyContact", "employment", "contract", "attachments", "registrationNumber"]);
  const fullName = requiredText(payload.fullName, "fullName", 200);
  const phone = requiredText(payload.phone, "phone", 50);
  const email = text(payload.email, 320);
  const birthDate = text(payload.birthDate, 10);
  if (!isIsoDate(birthDate)) throw new ApiError("VALIDATION_ERROR", "birthDate harus YYYY-MM-DD", 400);
  const employmentIn = record(payload.employment);
  allowOnly(employmentIn, ["roleId", "roleName", "employmentType", "slug", "jabatan"]);
  const contractIn = record(payload.contract);
  allowOnly(contractIn, ["title", "templateUsed", "agreedAt"]);
  const emergencyIn = record(payload.emergencyContact);
  allowOnly(emergencyIn, ["name", "phone", "relationship"]);
  const attachmentsIn = record(payload.attachments);
  allowOnly(attachmentsIn, ["cvUrl", "photoUrl"]);
  const registrationNumber = text(payload.registrationNumber, 100) ?? `REG-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const applicantToken = newOpaqueToken();
  const tokenHash = await sha256(applicantToken);
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const raw = { applicantTokenHash: tokenHash, applicantTokenExpiresAt: tokenExpiresAt, registrationNumber };
  const rows = await insert("employee_onboarding_applications", {
    full_name: fullName,
    email,
    phone,
    identity_number: text(payload.identityNumber, 100),
    address: text(payload.address, 2000),
    birth_date: birthDate,
    birth_place: text(payload.birthPlace, 200),
    emergency_contact: emergencyIn,
    employment: employmentIn,
    contract: contractIn,
    attachments: attachmentsIn,
    registration_number: registrationNumber,
    status: "pending",
    raw,
  });
  const app = rows?.[0] as Application | undefined;
  if (!app?.id) throw new ApiError("DATABASE_ERROR", "Pendaftaran tidak dapat dibuat", 500);
  return ok({ applicantToken, expiresAt: tokenExpiresAt, application: publicApplication(app) }, 201);
}

async function resolveApplicant(token: string) {
  if (!token || token.length < 40 || token.length > 200) throw new ApiError("UNAUTHORIZED", "Applicant token tidak valid", 401);
  const hash = await sha256(token);
  const rows = await select("employee_onboarding_applications", `${PUBLIC_COLUMNS},raw`, `raw->>applicantTokenHash=eq.${encodeURIComponent(hash)}&limit=1`);
  const app = rows?.[0] as Application | undefined;
  const raw = record(app?.raw);
  if (!app || !constantTimeEqual(String(raw.applicantTokenHash ?? ""), hash)) throw new ApiError("UNAUTHORIZED", "Applicant token tidak valid", 401);
  const expiresAt = Date.parse(String(raw.applicantTokenExpiresAt ?? ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new ApiError("TOKEN_EXPIRED", "Applicant token telah kedaluwarsa", 401);
  return app;
}

async function applicantStatus(payload: JsonRecord) {
  allowOnly(payload, ["applicantToken"]);
  const app = await resolveApplicant(requiredText(payload.applicantToken, "applicantToken", 200));
  return ok({ application: publicApplication(app) });
}

async function signContract(payload: JsonRecord) {
  allowOnly(payload, ["applicantToken", "signatureUrl", "contractPdfUrl"]);
  const app = await resolveApplicant(requiredText(payload.applicantToken, "applicantToken", 200));
  const signatureUrl = text(payload.signatureUrl, 2000);
  const contractPdfUrl = text(payload.contractPdfUrl, 2000);
  if (!signatureUrl || !isSafeUrl(signatureUrl)) throw new ApiError("VALIDATION_ERROR", "signatureUrl HTTPS wajib diisi", 400);
  if (!isSafeUrl(contractPdfUrl)) throw new ApiError("VALIDATION_ERROR", "contractPdfUrl harus HTTPS", 400);
  if (!["approved", "pending"].includes(app.status)) throw new ApiError("CONFLICT", "Pendaftaran tidak dapat ditandatangani pada status ini", 409);
  const now = new Date().toISOString();
  const rows = await patch("employee_onboarding_applications", `id=eq.${encodeURIComponent(app.id)}`, {
    signature_url: signatureUrl,
    contract_pdf_url: contractPdfUrl,
    contract_status: "signed",
    contract_signed_by_employee_at: now,
    status: app.status === "pending" ? "approved" : app.status,
  });
  return ok({ application: publicApplication(rows?.[0] as Application) });
}

async function requireAdmin(req: Request) {
  const sessionToken = tokenFromRequest(req);
  if (!sessionToken || sessionToken.length > 400) throw new ApiError("UNAUTHORIZED", "Yumi session diperlukan", 401);
  const sessions = await select("yumi_sessions", "user_source_id,expires_at", `token=eq.${encodeURIComponent(sessionToken)}&limit=1`);
  const session = sessions?.[0] as JsonRecord | undefined;
  if (!session || Date.parse(String(session.expires_at ?? "")) <= Date.now()) throw new ApiError("UNAUTHORIZED", "Yumi session tidak valid atau telah berakhir", 401);
  const users = await select("yumi_users", "source_id,is_active,role_source_id", `source_id=eq.${encodeURIComponent(String(session.user_source_id))}&limit=1`);
  const user = users?.[0] as JsonRecord | undefined;
  if (!user?.is_active) throw new ApiError("FORBIDDEN", "User tidak aktif", 403);
  const roles = await select("yumi_roles", "name,permissions", `source_id=eq.${encodeURIComponent(String(user.role_source_id))}&limit=1`);
  const role = roles?.[0] as JsonRecord | undefined;
  const roleName = text(role?.name)?.toLowerCase().replace(/\s+/g, " ");
  const permissions = Array.isArray(role?.permissions) ? role.permissions.map((v) => String(v).toLowerCase()) : [];
  const allowed = ["admin", "administrator", "owner", "superadmin", "super admin"].includes(roleName ?? "") || permissions.includes("users:manage");
  if (!allowed) throw new ApiError("FORBIDDEN", "Akses admin diperlukan", 403);
  return { user, role };
}

async function adminList(payload: JsonRecord) {
  allowOnly(payload, ["status", "limit"]);
  const limit = Math.min(Math.max(Number(payload.limit ?? 100), 1), 200);
  const status = text(payload.status, 40);
  const query = [`order=created_at.desc`, `limit=${limit}`];
  if (status) query.push(`status=eq.${encodeURIComponent(status)}`);
  const rows = await select("employee_onboarding_applications", PUBLIC_COLUMNS, query.join("&"));
  return ok({ applications: (rows as Application[]).map(publicApplication) });
}

async function adminUpdate(payload: JsonRecord) {
  allowOnly(payload, ["applicationId", "status", "reviewNotes"]);
  const id = requiredText(payload.applicationId, "applicationId", 100);
  const status = requiredText(payload.status, "status", 40);
  if (!["pending", "approved", "rejected", "needs_revision"].includes(status)) throw new ApiError("VALIDATION_ERROR", "status tidak valid", 400);
  const rows = await patch("employee_onboarding_applications", `id=eq.${encodeURIComponent(id)}`, {
    status,
    review_notes: text(payload.reviewNotes, 2000),
    reviewed_at: new Date().toISOString(),
  });
  if (!rows?.length) throw new ApiError("NOT_FOUND", "Pendaftaran tidak ditemukan", 404);
  return ok({ application: publicApplication(rows[0] as Application) });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Gunakan POST", 405);
  try {
    const payload = record(await req.json());
    const action = requiredText(payload.action, "action", 40);
    delete payload.action;
    switch (action) {
      case "register": return await register(payload);
      case "status": return await applicantStatus(payload);
      case "sign_contract": return await signContract(payload);
      case "admin_list": await requireAdmin(req); return await adminList(payload);
      case "admin_update": await requireAdmin(req); return await adminUpdate(payload);
      default: return fail("UNKNOWN_ACTION", `Action tidak dikenal: ${action}`, 400);
    }
  } catch (error) {
    if (error instanceof ApiError) return fail(error.code, error.message, error.status);
    console.error("[employee-onboarding-api]", error);
    return fail("INTERNAL_ERROR", "Terjadi kesalahan internal", 500);
  }
});
