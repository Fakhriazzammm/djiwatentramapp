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
const ORDER_NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;
const REST_PAGE_SIZE = 500;
const REST_MAX_PAGES = 20;


function canonicalOrderNumber(order: any) {
  const raw = String(order.orderNumber ?? order.order_number ?? "").trim();
  if (!raw) return null;
  if (/^ORD-[A-Z]+-[A-Z0-9]+-\d{4}-\d{6}$/i.test(raw)) return raw.toUpperCase();
  const match = raw.match(/^ORD(\d{1,6})-([A-Z0-9]+)-/i);
  if (!match) return raw;
  const sequence = match[1].padStart(4, "0");
  const type = match[2].toUpperCase();
  const timestamp = Number(order.createdAt ?? order.created_at ?? Date.now());
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(timestamp));
  const source = String(order.source ?? "").trim().toLowerCase();
  const brand = String(order.brandSlug ?? order.brand_slug ?? "").trim().toLowerCase();
  const business = String(order.businessUnit ?? order.business_unit ?? "").trim().toLowerCase();
  const sourceApp = String(order.sourceApp ?? order.source_app ?? "").trim().toLowerCase();
  const channel = brand === "merchandise" ? "MERCH"
    : brand === "b2b" || business === "b2b" ? "B2B"
      : source === "customer_self_service" || sourceApp.includes("djiwaapp") ? "APP"
        : source === "booking" ? "BOOK"
          : source.includes("gofood") || sourceApp.includes("gofood") ? "GF"
            : source.includes("grabfood") || sourceApp.includes("grabfood") ? "GRAB"
              : source.includes("shopeefood") || sourceApp.includes("shopeefood") ? "SF"
                : source === "telegram" || sourceApp.includes("telegram") ? "TG"
                  : "POS";
  return `ORD-${channel}-${type}-${sequence}-${date.replaceAll("/", "")}`;
}

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

async function dbGetPaged(table: string, params: Record<string, string>): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < REST_MAX_PAGES; page += 1) {
    const batch = await dbGet(table, {
      ...params,
      limit: String(REST_PAGE_SIZE),
      offset: String(page * REST_PAGE_SIZE),
    });
    rows.push(...batch);
    if (batch.length < REST_PAGE_SIZE) break;
  }
  return rows;
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
  const rows = await dbGet("pos_notification_push_subscriptions", { select: "id", endpoint: `eq.${value}`, user_id: `eq.${user.id}`, is_active: "eq.true", limit: "1" });
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
    const delivery = await dbWrite(
      "pos_notification_push_deliveries",
      "POST",
      { notification_id: notification.id, subscription_id: item.id, status: "sent", error_message: null },
      "?on_conflict=notification_id,subscription_id",
      "resolution=merge-duplicates,return=representation",
    );
    if (!Array.isArray(delivery) || !delivery.length) return;
    try {
      await webpush.default?.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, body);
      await dbWrite("pos_notification_push_deliveries", "PATCH", { status: "sent", error_message: null }, `?notification_id=eq.${encodeURIComponent(notification.id)}&subscription_id=eq.${encodeURIComponent(item.id)}`);
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
  if (token === serviceKey) {
    return { id: "notification-sync", role: "admin", branchId: null, name: "Notification sync" };
  }

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
  const since = new Date(Date.now() - ORDER_NOTIFICATION_RETENTION_MS).toISOString();
  const orders = await dbGetPaged("pos_orders", {
    select: "_id,orderNumber,status,totalAmount,subtotalAmount,shippingFeeAmount,paymentMethod,paymentReceiptKind,paymentGateway,customerName,tableNumber,orderType,source,sourceApp,brandSlug,businessUnit,createdAt,items,deliveryProvider,deliveryContactName,deliveryContactPhone,deliveryAddress,deliveryNotes",
    order: "createdAt.desc",
  });
  let created = 0;
  for (const order of orders ?? []) {
    const source = sourceOf(order);
    const displayOrderNumber = canonicalOrderNumber(order);
    const createdAt = Number(order.createdAt ?? 0);
    if (!source || !Number.isFinite(createdAt) || createdAt < Date.parse(since)) continue;
    const status = String(order.status ?? "").toLowerCase();
    const payment = paymentType(order);
    const sourceLabel = source === "customer_self_service" || source === "djiwaapp"
      ? "DjiwaApp"
      : source === "pos"
        ? "POS"
        : source === "ordermieyamin"
          ? "Order Mie Yamin"
          : source === "merchandise"
            ? "Merchandise"
            : source;
    let type: string | null = null;
    let title = "";
    let message = "";
    if (status === "pending" && payment === "cashier") {
      type = "order_cashier_pending";
      title = `Pesanan Baru dari ${sourceLabel}`;
      message = "Menunggu Pembayaran di Kasir";
    } else if (status === "pending" && payment === "mayar") {
      type = "order_mayar_pending";
      title = `Menunggu Pembayaran QRIS ${sourceLabel}`;
      message = "Pembayaran belum dikonfirmasi";
    } else if (status === "cancelled" && source && (payment === "wallet" || payment === "mayar")) {
      type = "order_payment_failed";
      title = `Pembayaran ${sourceLabel} Gagal`;
      message = payment === "wallet" ? "Saldo Djiwa Pay tidak cukup atau pembayaran dibatalkan" : "Pembayaran QRIS gagal atau kedaluwarsa";
    } else if ((status === "paid" || status === "completed") && source) {
      type = "order_paid";
      title = payment === "cashier"
        ? `Pembayaran ${sourceLabel} TUNAI Berhasil`
        : payment === "wallet"
          ? `Pembayaran ${sourceLabel} Djiwa Pay Berhasil`
          : payment === "mayar"
            ? `Pembayaran ${sourceLabel} QRIS Berhasil`
            : `Transaksi ${sourceLabel} Berhasil`;
      message = payment === "cashier"
        ? `Pesanan ${sourceLabel} sudah dibayar secara TUNAI`
        : payment === "wallet"
          ? `Pesanan ${sourceLabel} sudah dibayar dengan Djiwa Pay`
          : payment === "mayar"
            ? `Pesanan ${sourceLabel} sudah lunas`
            : `Order ${order.orderNumber ?? order._id} berstatus ${status}`;
    }
    if (!type || !order._id) continue;

    // Never mutate or deactivate a previous order event. A settlement creates
    // its own order_paid card; the unique dedupe key only prevents replaying
    // the same order + event type.
    const result = await dbWrite("pos_notifications", "POST", {
      notification_type: type,
      priority: type === "order_cashier_pending" ? "high" : "normal",
      title,
      message,
      order_source_id: String(order._id),
      order_number: displayOrderNumber,
      source,
      source_app: source === "pos" ? "pos" : "customer",
      source_module: "orders",
      entity_type: "order",
      entity_id: String(order._id),
      event_id: crypto.randomUUID(),
      dedupe_key: `order:${order._id}:${type}`,
      action_type: "open_order",
      action_payload: {
        orderId: order._id,
        orderNumber: displayOrderNumber,
        source,
        paymentMethod: payment === "mayar" ? "qris" : payment === "wallet" ? "wallet" : payment === "cashier" ? "cashier" : "unknown",
        paymentStatus: status,
        customerName: order.customerName ?? null,
        deliveryProvider: order.deliveryProvider ?? null,
        deliveryContactName: order.deliveryContactName ?? null,
        deliveryContactPhone: order.deliveryContactPhone ?? null,
        deliveryAddress: order.deliveryAddress ?? null,
        deliveryNotes: order.deliveryNotes ?? null,
        shippingFee: Number(order.shippingFeeAmount ?? 0),
        subtotalAmount: Number(order.subtotalAmount ?? 0),
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
        ? new Date(Number(order.createdAt) + ORDER_NOTIFICATION_RETENTION_MS).toISOString()
        : new Date(Date.now() + ORDER_NOTIFICATION_RETENTION_MS).toISOString(),
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
  const userReads = await dbGet("pos_notification_reads", {
    select: "notification_id,read_at,acknowledged_at",
    user_id: `eq.${encodeURIComponent(user.id)}`,
    limit: "5000",
  });
  const readByNotification = new Map((userReads ?? []).map((read: any) => [String(read.notification_id), read]));
  const rows = await dbGet("pos_notifications", {
    select: "*",
    is_active: "eq.true",
    order: "created_at.desc",
    limit: "500",
  });
  const now = Date.now();
  const expiredOrderIds = (rows ?? [])
    .filter((item: any) => {
      if (!String(item.notification_type ?? "").startsWith("order_")) return false;
      const createdAt = Date.parse(String(item.created_at ?? ""));
      const expiresAt = item.expires_at ? Date.parse(String(item.expires_at)) : 0;
      return (Number.isFinite(expiresAt) && expiresAt < now)
        || (Number.isFinite(createdAt) && createdAt + ORDER_NOTIFICATION_RETENTION_MS < now);
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
    if (item.expires_at && Date.parse(item.expires_at) < now) return false;
    if (item.target_user_id && item.target_user_id !== user.id) return false;
    if (item.target_role && item.target_role.toLowerCase() !== user.role) return false;
    if (item.target_branch_id && item.target_branch_id !== user.branchId) return false;
    // Keep every persisted order event visible. A later paid event must not
    // replace or hide the earlier cashier/QRIS-pending event; each event is
    // an individual notification card and dedupe is limited to the same
    // order + event type at insert time.
    return true;
  }).map((item: any) => ({
    ...item,
    isRead: Boolean(readByNotification.get(String(item.id))?.read_at),
    readAt: readByNotification.get(String(item.id))?.read_at ?? null,
    acknowledgedAt: readByNotification.get(String(item.id))?.acknowledged_at ?? null,
  }));
  return visible;
}

async function assertNotificationVisible(notificationId: string, user: UserContext) {
  const rows = await dbGet("pos_notifications", { select: "id,is_active,expires_at,target_user_id,target_role,target_branch_id", id: `eq.${encodeURIComponent(notificationId)}`, limit: "1" });
  const item = rows[0];
  if (!item || item.is_active !== true) throw new Error("Notification tidak ditemukan");
  if (item.expires_at && Date.parse(String(item.expires_at)) < Date.now()) throw new Error("Notification sudah kedaluwarsa");
  if (item.target_user_id && String(item.target_user_id) !== user.id) throw new Error("Notification tidak dapat diakses");
  if (item.target_role && String(item.target_role).toLowerCase() !== user.role) throw new Error("Notification tidak dapat diakses");
  if (item.target_branch_id && String(item.target_branch_id) !== String(user.branchId ?? "")) throw new Error("Notification tidak dapat diakses");
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
      await assertNotificationVisible(notificationId, user);
      const now = new Date().toISOString();
      await dbWrite("pos_notification_reads", "POST", {
        notification_id: notificationId,
        user_id: user.id,
        read_at: now,
        acknowledged_at: action === "acknowledge" ? now : null,
      }, "?on_conflict=notification_id,user_id", "resolution=merge-duplicates,return=representation");
      if (action === "dismiss") {
        await dbWrite("pos_notifications", "PATCH", { is_active: false }, `?id=eq.${encodeURIComponent(notificationId)}`);
      }
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
