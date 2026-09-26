import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Json = Record<string, unknown>;
type UserContext = {
  id: string;
  role: string;
  branchId: string | null;
  name: string;
};

type PushSubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  userAgent?: unknown;
};

const dbUrl = (Deno.env.get("YUMI_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const serviceKey = Deno.env.get("YUMI_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PENDING_ORDER_NOTIFICATION_TTL_MS = 30 * 60 * 1000;
const PAID_ORDER_NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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

async function dbWrite(table: string, method: "POST" | "PATCH", body: unknown, params = "", preferOverride?: string) {
  const result = await fetch(`${dbUrl}/rest/v1/${table}${params}`, {
    method,
    headers: {
      ...dbHeaders(),
      Prefer: preferOverride ?? (method === "POST" ? "resolution=ignore-duplicates,return=representation" : "return=representation"),
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

async function upsertPushSubscription(user: UserContext, payload: PushSubscriptionInput) {
  const endpoint = String(payload.endpoint ?? "").trim();
  const p256dh = String(payload.keys?.p256dh ?? "").trim();
  const auth = String(payload.keys?.auth ?? "").trim();
  if (!endpoint.startsWith("https://") || !p256dh || !auth || endpoint.length > 2048) throw new Error("Invalid push subscription");
  await dbWrite("pos_notification_push_subscriptions", "POST", {
    endpoint, p256dh, auth, user_id: user.id, target_role: user.role || null,
    target_branch_id: user.branchId, user_agent: String(payload.userAgent ?? "").slice(0, 1000) || null,
    is_active: true, last_seen_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
  }, "?on_conflict=endpoint", "resolution=merge-duplicates,return=representation");
  return { success: true };
}

async function removePushSubscription(user: UserContext, endpoint: unknown) {
  const value = String(endpoint ?? "").trim();
  if (!value) throw new Error("endpoint is required");
  await dbWrite("pos_notification_push_subscriptions", "PATCH", { is_active: false, updated_at: new Date().toISOString() }, `?endpoint=eq.${encodeURIComponent(value)}&user_id=eq.${encodeURIComponent(user.id)}`);
  return { success: true };
}

async function pushStatus(user: UserContext, endpoint: unknown) {
  const value = String(endpoint ?? "").trim();
  if (!value) return { subscribed: false };
  const rows = await dbGet("pos_notification_push_subscriptions", { select: "id", endpoint: `eq.${encodeURIComponent(value)}`, user_id: `eq.${encodeURIComponent(user.id)}`, is_active: "eq.true", limit: "1" });
  return { subscribed: rows.length > 0 };
}

async function dispatchWebPush(notification: any) {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@yumme.id";
  if (!vapidPublicKey || !vapidPrivateKey || !notification?.id) return;
  const subscriptions = await dbGet("pos_notification_push_subscriptions", { select: "id,endpoint,p256dh,auth,user_id,customer_id,app_scope,target_role,target_branch_id", is_active: "eq.true", limit: "500" });
  const targets = (subscriptions ?? []).filter((item: any) => {
    const customerScope = item.app_scope === "customer";
    const scopeMatches = !customerScope || Boolean(notification.target_user_id);
    const ownerMatches = !notification.target_user_id
      || notification.target_user_id === item.user_id
      || notification.target_user_id === item.customer_id;
    const roleMatches = !notification.target_role || notification.target_role === item.target_role;
    const branchMatches = !notification.target_branch_id || notification.target_branch_id === item.target_branch_id;
    return scopeMatches && ownerMatches && roleMatches && branchMatches;
  });
  if (!targets.length) return;
  // @ts-ignore Deno resolves the npm package at Edge Function runtime.
  const webpush = await import("npm:web-push@3.6.7");
  webpush.default?.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const body = JSON.stringify({ title: notification.title, body: notification.message, notificationId: notification.id, url: notification.action_type === "open_order" ? "/admin/orders" : "/admin" });
  await Promise.all(targets.map(async (item: any) => {
    const delivery = await dbWrite("pos_notification_push_deliveries", "POST", { notification_id: notification.id, subscription_id: item.id, status: "sent" }, "?on_conflict=notification_id,subscription_id");
    if (!Array.isArray(delivery) || !delivery.length) return;
    try {
      await webpush.default?.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, body);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Web Push failed";
      await dbWrite("pos_notification_push_deliveries", "PATCH", { status: "failed", error_message: message }, `?notification_id=eq.${encodeURIComponent(notification.id)}&subscription_id=eq.${encodeURIComponent(item.id)}`);
      const statusCode = Number((error as { statusCode?: number })?.statusCode);
      if (statusCode === 404 || statusCode === 410) await dbWrite("pos_notification_push_subscriptions", "PATCH", { is_active: false, last_error: message, updated_at: new Date().toISOString() }, `?id=eq.${encodeURIComponent(item.id)}`);
    }
  }));
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
  if (receipt.includes("wallet") || method === "wallet" || method === "djiwaapp") return "wallet";
  if (receipt.includes("mayar") || gateway) return "mayar";
  return "unknown";
}

async function syncRecentOrders() {
  // Reconcile a bounded recent window so a short function outage does not
  // permanently lose an operational alert. Initial POS load seeds silently;
  // only newly observed IDs create a popup in the client.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const orders = await dbGet("pos_orders", {
    select: "_id,orderNumber,status,totalAmount,paymentMethod,paymentReceiptKind,paymentGateway,customerName,tableNumber,orderType,source,sourceApp,createdAt,items",
    order: "createdAt.desc",
    limit: "500",
  });
  let created = 0;
  for (const order of orders ?? []) {
    const source = sourceOf(order);
    const createdAt = Number(order.createdAt ?? 0);
    if (source !== "customer_self_service" || !Number.isFinite(createdAt) || createdAt < Date.parse(since)) continue;
    const status = String(order.status ?? "").toLowerCase();
    const payment = paymentType(order);
    let type: string | null = null;
    let title = "";
    let message = "";
    if (status === "pending" && payment === "cashier") {
      type = "order_cashier_pending";
      title = "Pesanan Baru dari DjiwaApp";
      message = "Menunggu Pembayaran di Kasir";
    } else if (status === "pending" && payment === "mayar") {
      type = "order_mayar_pending";
      title = "Menunggu Pembayaran QRIS DjiwaApp";
      message = "Pembayaran belum dikonfirmasi";
    } else if ((status === "paid" || status === "completed") && (payment === "mayar" || payment === "cashier" || payment === "wallet")) {
      type = "order_paid";
      title = payment === "cashier" ? "Pembayaran TUNAI Berhasil" : payment === "wallet" ? "Pembayaran DJIWA PAY Berhasil" : "Pembayaran QRIS Berhasil";
      message = payment === "cashier" ? "Pesanan DjiwaApp Sudah Dibayar secara TUNAI" : payment === "wallet" ? "Pesanan DjiwaApp Sudah Dibayar dengan DJIWA PAY" : "Pesanan DjiwaApp Sudah Lunas";
    }
    if (!type || !order._id) continue;

    // Satu order tidak boleh menampilkan state pembayaran lama dan baru
    // bersamaan. Setelah order settled, nonaktifkan notifikasi pending lama;
    // dedupe_key tetap menjaga agar event paid hanya dibuat sekali.
    if (status === "paid" || status === "completed") {
      await dbWrite(
        "pos_notifications",
        "PATCH",
        { is_active: false },
        `?order_source_id=eq.${encodeURIComponent(String(order._id))}&notification_type=in.%28order_cashier_pending,order_mayar_pending%29&is_active=eq.true`,
      );
    }

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
      action_payload: {
        orderId: order._id,
        orderNumber: order.orderNumber ?? null,
        source: "djiwaapp",
        paymentMethod: payment === "mayar" ? "qris" : payment === "wallet" ? "wallet" : "cashier",
        paymentStatus: status,
        customerName: order.customerName ?? null,
        tableNumber: order.tableNumber ?? null,
        orderType: order.orderType ?? null,
        itemCount: Array.isArray(order.items) ? order.items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0) : 0,
        totalAmount: Number(order.totalAmount ?? 0),
        items: Array.isArray(order.items) ? order.items : [],
      },
      created_at: Number.isFinite(Number(order.createdAt))
        ? new Date(Number(order.createdAt)).toISOString()
        : new Date().toISOString(),
      expires_at: Number.isFinite(Number(order.createdAt))
        ? new Date(Number(order.createdAt) + (type === "order_paid" ? PAID_ORDER_NOTIFICATION_RETENTION_MS : PENDING_ORDER_NOTIFICATION_TTL_MS)).toISOString()
        : new Date(Date.now() + (type === "order_paid" ? PAID_ORDER_NOTIFICATION_RETENTION_MS : PENDING_ORDER_NOTIFICATION_TTL_MS)).toISOString(),
      is_active: true,
    }, "?on_conflict=dedupe_key");
    if (Array.isArray(result) && result.length > 0) {
      created++;
      await dispatchWebPush(result[0]).catch((error) => console.error("[pos-notifications] push dispatch", error));
    }
  }
  return { scanned: orders?.length ?? 0, created };
}

async function listNotifications(user: UserContext) {
  const rows = await dbGet("pos_notifications", {
    select: "*",
    is_active: "eq.true",
    order: "created_at.desc",
    limit: "500",
  });
  const now = Date.now();
  const orderIds = [...new Set((rows ?? []).map((item: any) => String(item.order_source_id ?? "")).filter(Boolean))];
  const orderStatuses = new Map<string, string>();
  if (orderIds.length > 0) {
    const orders = await dbGet("pos_orders", {
      select: "_id,status",
      _id: `in.(${orderIds.join(",")})`,
      limit: "500",
    });
    for (const order of orders ?? []) {
      orderStatuses.set(String(order._id), String(order.status ?? "").toLowerCase());
    }
  }
  const expiredOrderIds = (rows ?? [])
    .filter((item: any) => {
      if (!String(item.notification_type ?? "").startsWith("order_")) return false;
      if (item.notification_type === "order_paid") return false;
      const createdAt = Date.parse(String(item.created_at ?? ""));
      const expiresAt = item.expires_at ? Date.parse(String(item.expires_at)) : 0;
      return (Number.isFinite(expiresAt) && expiresAt < now)
        || (Number.isFinite(createdAt) && createdAt + PENDING_ORDER_NOTIFICATION_TTL_MS < now);
    })
    .map((item: any) => String(item.id ?? ""))
    .filter(Boolean);
  if (expiredOrderIds.length > 0) {
    await Promise.all(expiredOrderIds.map((id) => dbWrite(
      "pos_notifications",
      "PATCH",
      { is_active: false },
      `?id=eq.${encodeURIComponent(id)}`,
    )));
  }
  const visible = (rows ?? []).filter((item: any) => {
    if (expiredOrderIds.includes(String(item.id ?? ""))) return false;
    if (item.expires_at && Date.parse(item.expires_at) < now && item.notification_type !== "order_paid") return false;
    if (item.target_user_id && item.target_user_id !== user.id) return false;
    if (item.target_role && item.target_role.toLowerCase() !== user.role) return false;
    if (item.target_branch_id && item.target_branch_id !== user.branchId) return false;
    const orderStatus = item.order_source_id
      ? orderStatuses.get(String(item.order_source_id))
      : undefined;
    if (orderStatus === "cancelled") return false;
    // Pending payment notifications are stale as soon as the order is paid.
    if ((item.notification_type === "order_cashier_pending" || item.notification_type === "order_mayar_pending")
      && (orderStatus === "paid" || orderStatus === "completed")) return false;
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

    if (action === "push_subscribe") return response(await upsertPushSubscription(user, payload as PushSubscriptionInput));
    if (action === "push_unsubscribe") return response(await removePushSubscription(user, (payload as Json).endpoint));
    if (action === "push_status") return response(await pushStatus(user, (payload as Json).endpoint));

    if (action === "list") return response({ success: true, notifications: await listNotifications(user) });

    if (action === "mark_read" || action === "acknowledge" || action === "dismiss") {
      const notificationId = String((payload as Json).notificationId ?? "");
      if (!notificationId) return response({ error: "notificationId is required" }, 400);
      await dbWrite("pos_notifications", "PATCH", action === "dismiss"
        ? { is_active: false, global_read_at: new Date().toISOString() }
        : {
            global_read_at: new Date().toISOString(),
            global_acknowledged_at: action === "acknowledge" ? new Date().toISOString() : null,
          },
      `?id=eq.${encodeURIComponent(notificationId)}`);
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
      if (created?.[0]) await dispatchWebPush(created[0]).catch((error) => console.error("[pos-notifications] push dispatch", error));
      return response({ success: true, notification: created?.[0] ?? null });
    }

    return response({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("[pos-notifications]", error);
    return response({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
