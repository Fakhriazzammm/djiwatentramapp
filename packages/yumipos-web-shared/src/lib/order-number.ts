export type OrderChannel =
  | "pos"
  | "app"
  | "booking"
  | "gofood"
  | "grabfood"
  | "shopeefood"
  | "telegram"
  | "merchandise"
  | "b2b"
  | "unknown";

export type OrderNumberContext = {
  source?: string | null;
  sourceApp?: string | null;
  businessUnit?: string | null;
  orderType?: string | null;
  platform?: string | null;
  brandSlug?: string | null;
  booking?: boolean;
};

function normalized(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function getOrderChannel(context: OrderNumberContext): OrderChannel {
  if (context.booking || normalized(context.source) === "booking") return "booking";

  if (normalized(context.brandSlug) === "merchandise") return "merchandise";
  if (normalized(context.brandSlug) === "b2b" || normalized(context.businessUnit) === "b2b") return "b2b";

  const businessUnit = normalized(context.businessUnit);
  if (businessUnit === "ordermieyamin" || businessUnit === "mieyamin") return "app";

  const source = normalized(context.source);
  const sourceApp = normalized(context.sourceApp);
  const platform = normalized(context.platform);
  const joined = `${source} ${sourceApp} ${platform}`;

  if (joined.includes("gofood") || joined.includes("go_food")) return "gofood";
  if (joined.includes("grabfood") || joined.includes("grab_food")) return "grabfood";
  if (joined.includes("shopeefood") || joined.includes("shopee_food")) return "shopeefood";
  if (joined.includes("telegram")) return "telegram";
  if (source === "customer_self_service" || joined.includes("djiwaapp")) return "app";
  if (!source || ["pos", "kasir", "internal"].includes(source)) return "pos";
  return "unknown";
}

export function getOrderChannelCode(channel: OrderChannel): string {
  return {
    pos: "POS",
    app: "APP",
    booking: "BOOK",
    gofood: "GF",
    grabfood: "GRAB",
    shopeefood: "SF",
    telegram: "TG",
    merchandise: "MERCH",
    b2b: "B2B",
    unknown: "UNK",
  }[channel];
}

export function getOrderTypeCode(orderType?: string | null, platform?: string | null): string {
  const type = normalized(orderType);
  if (type === "dine_in" || type === "dinein") return "D";
  if (type === "takeaway" || type === "take_away") return "T";
  if (type === "delivery") return "DL";
  if (type === "online") {
    const p = normalized(platform);
    if (p === "grab" || p === "grabfood") return "OG";
    if (p === "gofood" || p === "go_food") return "OF";
    if (p === "shopeefood" || p === "shopee_food") return "OS";
    return "O";
  }
  return "X";
}

function dateCode(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}${values.month}${values.year}`;
}

export function formatOrderNumber(args: {
  sequence?: number | null;
  createdAt?: number | null;
  context?: OrderNumberContext;
}) {
  const sequence = Number(args.sequence ?? 0);
  const channel = getOrderChannel(args.context ?? {});
  const type = getOrderTypeCode(args.context?.orderType, args.context?.platform);
  const date = dateCode(Number(args.createdAt ?? Date.now()));
  return `ORD-${getOrderChannelCode(channel)}-${type}-${String(sequence).padStart(4, "0")}-${date}`;
}

/**
 * Converts the legacy human-readable number only for display.
 * Database order_number remains untouched for audit/payment compatibility.
 */
export function getDisplayOrderNumber(orderNumber: string | null | undefined, context: OrderNumberContext & { createdAt?: number | null; sequence?: number | null }) {
  const raw = String(orderNumber ?? "").trim();
  if (!raw) return "-";
  if (/^ORD-[A-Z]+-[A-Z]+-\d{4}-\d{6}$/i.test(raw)) {
    const channel = getOrderChannel(context);
    if (channel === "b2b" && !/^ORD-B2B-/i.test(raw)) {
      const sequence = Number(raw.match(/^ORD-[A-Z]+-[A-Z]+-(\d{4})-/i)?.[1] ?? 0);
      if (sequence) return formatOrderNumber({ sequence, createdAt: context.createdAt, context });
    }
    return raw.toUpperCase();
  }

  const legacySequence = context.sequence ?? Number(raw.match(/^ORD(\d{1,6})-/i)?.[1] ?? 0);
  if (!legacySequence) return raw;
  return formatOrderNumber({ sequence: legacySequence, createdAt: context.createdAt, context });
}
