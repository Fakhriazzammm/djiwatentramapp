import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Json = Record<string, unknown>;
type UserContext = {
  id: string;
  role: string;
  branchId: string | null;
  name: string;
};

const dbUrl = (Deno.env.get("YUMI_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const serviceKey = Deno.env.get("YUMI_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function response(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dbHeaders() {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function dbGet(table: string, params: Record<string, string>): Promise<any[]> {
  const query = new URLSearchParams(params);
  const result = await fetch(`${dbUrl}/rest/v1/${table}?${query}`, { headers: dbHeaders() });
  if (!result.ok) throw new Error(`DB read failed (${result.status})`);
  return (await result.json()) as any[];
}

async function dbWrite(table: string, method: "POST" | "PATCH", body: unknown, params = "") {
  const result = await fetch(`${dbUrl}/rest/v1/${table}${params}`, {
    method,
    headers: {
      ...dbHeaders(),
      Prefer: method === "POST" ? "resolution=ignore-duplicates,return=representation" : "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`DB write failed (${result.status}): ${detail.slice(0, 300)}`);
  }
  const text = await result.text();
  return text ? JSON.parse(text) : [];
}

function bearer(req: Request) {
  const value = req.headers.get("Authorization") ?? "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

async function authenticate(req: Request): Promise<UserContext | null> {
  const token = bearer(req);
  if (!token || !dbUrl || !serviceKey) return null;

  const sessions = await dbGet("yumi_sessions", {
    select: "user_source_id,expires_at",
    token: `eq.${token}`,
    expires_at: `gt.${new Date().toISOString()}`,
    limit: "1",
  });
  const session = sessions?.[0];
  if (!session?.user_source_id) return null;

  const users = await dbGet("yumi_users", {
    select: "source_id,name,role_source_id,is_active,raw",
    source_id: `eq.${session.user_source_id}`,
    limit: "1",
  });
  const user = users?.[0];
  if (!user || user.is_active === false) return null;

  const raw = user.raw && typeof user.raw === "object" ? user.raw : {};
  const roles = await dbGet("yumi_roles", {
    select: "name",
    source_id: `eq.${user.role_source_id}`,
    limit: "1",
  });
  const role = String(roles?.[0]?.name ?? raw.roleName ?? raw.role ?? "").trim().toLowerCase();
  const branchId = String(raw.branchId ?? raw.branch_id ?? user.branch_id ?? "").trim() || null;
  return {
    id: String(user.source_id),
    name: String(user.name ?? ""),
    role,
    branchId,
  };
}

function isAdmin(user: UserContext) {
  return user.role === "admin" || user.role.includes("manager") || user.role.includes("owner");
}

function sourceOf(order: any) {
  return String(order.source ?? order.sourceApp ?? order.source_app ?? "").trim().toLowerCase();
}

function paymentType(order: any) {
  const receipt = String(order.paymentReceiptKind ?? order.payment_receipt_kind ?? "").trim().toLowerCase();
  const method = String(order.paymentMethod ?? order.payment_method ?? "").trim().toLowerCase();
  const gateway = order.paymentGateway ?? order.payment_gateway;
  if (receipt.includes("cashier") || method === "cash" || method === "tunai" || method === "cashier") return "cashier";
  if (receipt.includes("mayar") || gateway) return "mayar";
  return "unknown";
}

async function syncRecentOrders() {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const orders = await dbGet("pos_orders", {
    select: "_id,orderNumber,status,totalAmount,paymentMethod,paymentReceiptKind,paymentGateway,customerName,source,sourceApp,createdAt,items",
    source: "eq.customer_self_service",
    createdAt: `gte.${Date.parse(since)}`,
    order: "createdAt.desc",
    limit: "100",
  });
  let created = 0;
  for (const order of orders ?? []) {
    const status = String(order.status ?? "").toLowerCase();
    const payment = paymentType(order);
    let type: string | null = null;
    let title = "";
    let message = "";
    if (status === "pending" && payment === "cashier") {
      type = "order_cashier_pending";
      title = "Pesanan baru — Bayar di Kasir";
      message = `${order.customerName || "Customer"} · ${Number(order.totalAmount ?? 0).toLocaleString("id-ID")} · ${Array.isArray(order.items) ? order.items.length : 0} item`;
    } else if (status === "pending" && payment === "mayar") {
      type = "order_mayar_pending";
      title = "Menunggu pembayaran DjiwaApp";
      message = `${order.customerName || "Customer"} · ${Number(order.totalAmount ?? 0).toLocaleString("id-ID")}`;
    } else if (status === "paid" || status === "completed") {
      type = "order_paid";
      title = "Pembayaran DjiwaApp diterima";
      message = `${order.customerName || "Customer"} · ${Number(order.totalAmount ?? 0).toLocaleString("id-ID")}`;
    }
    if (!type || !order._id) continue;
    const result = await dbWrite("pos_notifications", "POST", {
      notification_type: type,
      priority: type === "order_cashier_pending" ? "high" : "normal",
      title,
      message,
      order_source_id: String(order._id),
      order_number: order.orderNumber ?? null,
      source: "customer_self_service",
      dedupe_key: `order:${order._id}:${type}`,
      action_type: "open_order",
      action_payload: { orderId: order._id, orderNumber: order.orderNumber ?? null },
      created_at: new Date().toISOString(),
      is_active: true,
    }, "?on_conflict=dedupe_key");
    if (Array.isArray(result) && result.length > 0) created++;
  }
  return { scanned: orders?.length ?? 0, created };
}

async function listNotifications(user: UserContext) {
  const rows = await dbGet("pos_notifications", {
    select: "*",
    is_active: "eq.true",
    order: "created_at.desc",
    limit: "100",
  });
  const now = Date.now();
  const visible = (rows ?? []).filter((item: any) => {
    if (item.expires_at && Date.parse(item.expires_at) < now) return false;
    if (item.target_user_id && item.target_user_id !== user.id) return false;
    if (item.target_role && item.target_role.toLowerCase() !== user.role) return false;
    if (item.target_branch_id && item.target_branch_id !== user.branchId) return false;
    return true;
  }).map((item: any) => ({
    ...item,
    isRead: Boolean(item.global_read_at),
    readAt: item.global_read_at ?? null,
    acknowledgedAt: item.global_acknowledged_at ?? null,
  }));
  return visible;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!dbUrl || !serviceKey) return response({ error: "Notification service is not configured" }, 500);
    const user = await authenticate(req);
    if (!user) return response({ error: "Unauthorized" }, 401);

    const payload = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const action = String((payload as Json).action ?? (req.method === "GET" ? "list" : "list"));

    if (action === "sync_recent") {
      const result = await syncRecentOrders();
      return response({ success: true, ...result });
    }

    if (action === "list") return response({ success: true, notifications: await listNotifications(user) });

    if (action === "mark_read" || action === "acknowledge") {
      const notificationId = String((payload as Json).notificationId ?? "");
      if (!notificationId) return response({ error: "notificationId is required" }, 400);
      await dbWrite("pos_notifications", "PATCH", {
        global_read_at: new Date().toISOString(),
        global_acknowledged_at: action === "acknowledge" ? new Date().toISOString() : null,
      }, `?id=eq.${encodeURIComponent(notificationId)}`);
      return response({ success: true });
    }

    if (action === "create_admin") {
      if (!isAdmin(user)) return response({ error: "Admin role required" }, 403);
      const title = String((payload as Json).title ?? "").trim();
      const message = String((payload as Json).message ?? "").trim();
      const type = String((payload as Json).notificationType ?? "admin_info");
      if (!title || !message || !["admin_info", "admin_briefing"].includes(type)) return response({ error: "Invalid notification payload" }, 400);
      const dedupeKey = String((payload as Json).dedupeKey ?? `admin:${crypto.randomUUID()}`);
      const created = await dbWrite("pos_notifications", "POST", {
        notification_type: type,
        priority: ["normal", "high", "urgent"].includes(String((payload as Json).priority)) ? (payload as Json).priority : "normal",
        title: title.slice(0, 160),
        message: message.slice(0, 4000),
        target_branch_id: String((payload as Json).targetBranchId ?? "").trim() || null,
        target_role: String((payload as Json).targetRole ?? "").trim().toLowerCase() || null,
        target_user_id: String((payload as Json).targetUserId ?? "").trim() || null,
        dedupe_key: dedupeKey,
        created_by: user.id,
        expires_at: (payload as Json).expiresAt ?? null,
        is_active: true,
      });
      return response({ success: true, notification: created?.[0] ?? null });
    }

    return response({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[pos-notifications]", error);
    return response({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
