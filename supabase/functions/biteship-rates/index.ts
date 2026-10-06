import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { getDeliveryConfig } from "../_shared/customer-delivery.ts";

const BITESHIP_RATES_URL = "https://api.biteship.com/v1/rates/couriers";
const BITESHIP_COURIERS_URL = "https://api.biteship.com/v1/couriers";
const apiKey = Deno.env.get("BITESHIP_API_KEY")?.trim() ?? "";
const originPostalCode = Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE")?.trim() ?? "";
const originLatitude = Number(Deno.env.get("BITESHIP_ORIGIN_LATITUDE"));
const originLongitude = Number(Deno.env.get("BITESHIP_ORIGIN_LONGITUDE"));
const validOriginPostalCode = /^\d{5}$/.test(originPostalCode);
const validOriginCoordinates = Number.isFinite(originLatitude) && Number.isFinite(originLongitude);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type JsonObject = Record<string, unknown>;
type RateItem = {
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  value: number;
  quantity: number;
  weight: number;
  height?: number;
  length?: number;
  width?: number;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(code: string, message: string, status = 400) {
  return response({ success: false, error: { code, message } }, status);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${field} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > max) {
    throw new Error(`${field} must be a positive integer no greater than ${max}`);
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, field: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${field} must be a non-negative integer no greater than ${max}`);
  }
  return value as number;
}

function coordinate(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -180 || value > 180) {
    throw new Error(`${field} must be a valid coordinate`);
  }
  return value;
}

function postalCode(value: unknown, field: string): number {
  const text = requiredString(value, field, 10);
  if (!/^\d{5}$/.test(text)) throw new Error(`${field} must contain exactly 5 digits`);
  return Number(text);
}

function normalizeItem(value: unknown, index: number): RateItem {
  if (!isObject(value)) throw new Error(`items[${index}] must be an object`);
  const item: RateItem = {
    name: requiredString(value.name, `items[${index}].name`, 200),
    value: nonNegativeInteger(value.value, `items[${index}].value`, 2_000_000_000),
    quantity: positiveInteger(value.quantity, `items[${index}].quantity`, 1_000),
    weight: positiveInteger(value.weight, `items[${index}].weight`, 1_000_000),
  };
  for (const field of ["description", "category", "sku"] as const) {
    if (value[field] !== undefined) item[field] = requiredString(value[field], `items[${index}].${field}`, 200);
  }
  if (item.category && !new Set(["fashion", "healthcare", "food_and_drink", "electronic", "beauty", "outdoor_gear", "home_accessories", "hobby", "collection", "sparepart", "groceries", "frozen_food", "others"]).has(item.category)) {
    throw new Error(`items[${index}].category is not supported by Biteship`);
  }
  for (const field of ["height", "length", "width"] as const) {
    if (value[field] !== undefined) item[field] = nonNegativeInteger(value[field], `items[${index}].${field}`, 1_000);
  }
  return item;
}

function normalizeRate(value: unknown): JsonObject | null {
  if (!isObject(value)) return null;
  const numberOrNull = (field: string) => typeof value[field] === "number" && Number.isFinite(value[field]) ? value[field] : null;
  const stringOrNull = (field: string) => typeof value[field] === "string" ? value[field] : null;
  return {
    company: stringOrNull("company"),
    courierCode: stringOrNull("courier_code"),
    courierName: stringOrNull("courier_name"),
    serviceName: stringOrNull("courier_service_name"),
    serviceCode: stringOrNull("courier_service_code"),
    serviceType: stringOrNull("service_type"),
    shippingType: stringOrNull("shipping_type"),
    description: stringOrNull("description"),
    duration: stringOrNull("duration"),
    durationRange: stringOrNull("shipment_duration_range"),
    durationUnit: stringOrNull("shipment_duration_unit"),
    currency: stringOrNull("currency"),
    shippingFee: numberOrNull("shipping_fee"),
    price: numberOrNull("price"),
    insuranceFee: numberOrNull("insurance_fee"),
    cashOnDeliveryFee: numberOrNull("cash_on_delivery_fee"),
    shippingFeeDiscount: numberOrNull("shipping_fee_discount"),
    shippingFeeSurcharge: numberOrNull("shipping_fee_surcharge"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST required", 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Request body must be valid JSON");
  }
  if (!isObject(body)) return fail("INVALID_BODY", "Request body must be an object");
  let config;
  try { config = await getDeliveryConfig(); } catch { return fail("CONFIG_UNAVAILABLE", "Delivery configuration unavailable", 503); }
  if (body.action === "delivery_config") return response({ config });
  if (!config.active) return fail("DELIVERY_DISABLED", "Delivery sedang dinonaktifkan", 403);
  if (typeof body.couriers === "string" && body.couriers.toLowerCase().split(",").some((courier) => !config.couriers.includes(courier))) return fail("COURIER_DISABLED", "Kurir tidak tersedia", 403);
  if (!apiKey || !validOriginPostalCode) return fail("NOT_CONFIGURED", "Shipping rates are not configured", 503);
  if (body.action === "list_couriers") {
    const upstream = await fetch(BITESHIP_COURIERS_URL, { headers: { authorization: apiKey } });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !isObject(payload) || !Array.isArray(payload.couriers)) return fail("BITESHIP_COURIERS_REQUEST_FAILED", "Biteship courier catalog unavailable", upstream.ok ? 502 : 400);
    const couriers = payload.couriers.filter((entry) => isObject(entry) && config.couriers.includes(String(entry.courier_code).toLowerCase()));
    return response({ success: true, couriers });
  }

  try {
    const allowedFields = new Set(["destination_postal_code", "destination_latitude", "destination_longitude", "couriers", "items"]);
    const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
    if (unknownFields.length > 0) throw new Error(`Unknown request field: ${unknownFields[0]}`);
    const destinationPostalCode = postalCode(body.destination_postal_code, "destination_postal_code");
    const destinationLatitude = body.destination_latitude === undefined ? undefined : coordinate(body.destination_latitude, "destination_latitude");
    const destinationLongitude = body.destination_longitude === undefined ? undefined : coordinate(body.destination_longitude, "destination_longitude");
    if ((destinationLatitude === undefined) !== (destinationLongitude === undefined)) throw new Error("destination latitude and longitude must be provided together");
    const couriers = requiredString(body.couriers, "couriers", 200);
    if (!/^(?:gojek|grab)(?:,(?:gojek|grab))*$/i.test(couriers)) throw new Error("Only Gojek and Grab are supported for customer delivery");
    if (!/^[a-z0-9]+(?:,[a-z0-9]+)*$/i.test(couriers)) {
      throw new Error("couriers must be a comma-separated list of courier codes");
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
      throw new Error("items must contain between 1 and 100 entries");
    }
    const items = body.items.map(normalizeItem);
    const instantCourierRequested = /(^|,)(gojek|grab)(,|$)/i.test(couriers);
    if (instantCourierRequested && (!validOriginCoordinates || destinationLatitude === undefined || destinationLongitude === undefined)) {
      throw new Error("Gojek/Grab requires pickup and destination coordinates");
    }
    const upstreamBody = instantCourierRequested
      ? { origin_postal_code: Number(originPostalCode), destination_postal_code: destinationPostalCode, origin_latitude: originLatitude, origin_longitude: originLongitude, destination_latitude: destinationLatitude, destination_longitude: destinationLongitude, couriers, items }
      : { origin_postal_code: Number(originPostalCode), destination_postal_code: destinationPostalCode, couriers, items };

    const upstream = await fetch(BITESHIP_RATES_URL, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify(upstreamBody),
    });
    const upstreamPayload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return fail("BITESHIP_RATE_REQUEST_FAILED", "Biteship could not return shipping rates", upstream.status >= 500 ? 502 : 400);
    }
    if (!isObject(upstreamPayload) || upstreamPayload.success !== true || !Array.isArray(upstreamPayload.pricing)) {
      return fail("INVALID_BITESHIP_RESPONSE", "Biteship returned an invalid rates response", 502);
    }

    return response({
      success: true,
      destinationPostalCode,
      rates: upstreamPayload.pricing.map(normalizeRate).filter((rate): rate is JsonObject => rate !== null),
    });
  } catch (error) {
    if (error instanceof TypeError) return fail("QUOTE_UNAVAILABLE", "Shipping rates temporarily unavailable", 503);
    return fail("INVALID_REQUEST", "Invalid shipping request");
  }
});
