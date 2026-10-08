import { trustedServer } from "../_shared/payment-auth.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { deliveryRest, getDeliveryConfig } from "../_shared/customer-delivery.ts";
import { catalogItems, validateDestination, eligibleRate, quoteSnapshot } from "../_shared/delivery-policy.ts";
import { signQuote, verifyQuote, quoteMatchesOrder } from "../_shared/delivery-quote.ts";
type JsonObject = Record<string, unknown>;
function isObject(v: unknown): v is JsonObject { return typeof v === "object" && v !== null && !Array.isArray(v); }
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function fail(code: string, status: number) { return response({ success: false, error: { code, message: code === "INVALID_REQUEST" ? "Lengkapi alamat, kontak, lokasi, kode pos dan produk delivery yang valid." : "Tarif delivery tidak tersedia." } }, status); }
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

Deno.serve(async req => {
	if (req.method === "OPTIONS") return response({ ok: true });
	if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
	let body: any;
	try { body = await req.json(); if (!isObject(body)) throw new Error(); } catch { return fail("INVALID_REQUEST", 400); }
	if (body.action === "verify_quote" && !trustedServer(req)) return fail("UNAUTHORIZED", 401);
	let config;
	try { config = await getDeliveryConfig(); } catch { return fail("CONFIG_UNAVAILABLE", 503); }
	if (body.action === "delivery_config") return response({ success: true, config });
	if (body.action === "verify_quote") {
		try {
			const q = await verifyQuote(body.quote);
			const order = { shipping_fee_amount: body.fee, delivery_provider: body.provider, delivery_address: body.address, delivery_contact_name: body.contactName, delivery_contact_phone: body.contactPhone };
			if (q.feeSource !== "biteship" || q.provider !== "biteship" || !["gojek", "grab"].includes(q.courierCode) || typeof q.courierType !== "string" || !q.courierType.trim() || !config.active || !config.couriers.includes(q.courierCode) || !Array.isArray(body.items) || !quoteMatchesOrder(q, order, body.items as Record<string, any>[])) throw new Error();
			return response({ success: true });
		} catch { return fail("INVALID_QUOTE", 400); }
	}
	if (!config.active) return fail("DELIVERY_DISABLED", 403);
	if (!config.couriers.includes(body.couriers)) return fail("COURIER_DISABLED", 403);
	let items;
	try {
		validateDestination(body);
		if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100 || body.items.some((i: any) => typeof i?.productId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(i.productId))) throw new Error();
		const ids = [...new Set(body.items.map((i: any) => i.productId))];
		const products = await deliveryRest("products", { select: "source_id,name,price,delivery_enabled,delivery_weight_grams", source_id: `in.(${ids.join(",")})`, limit: "100" });
		items = catalogItems(body.items, products);
	} catch (error) { return fail(error instanceof Error && error.message === "Delivery storage unavailable" ? "CATALOG_UNAVAILABLE" : "INVALID_REQUEST", error instanceof Error && error.message === "Delivery storage unavailable" ? 503 : 400); }
	const key = Deno.env.get("BITESHIP_API_KEY")?.trim();
	const lat = Deno.env.get("BITESHIP_ORIGIN_LATITUDE")?.trim();
	const lng = Deno.env.get("BITESHIP_ORIGIN_LONGITUDE")?.trim();
	const postal = Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE")?.trim();
	// Invalid/missing origin is an operational configuration error, not a fallback quote.
	if (!lat || !lng || !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90 || !Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180 || !/^\d{5}$/.test(postal ?? "")) return fail("NOT_CONFIGURED", 503);
	let rates: JsonObject[] = [];
	if (key) {
		try {
			const upstream = await fetch("https://api.biteship.com/v1/rates/couriers", { method: "POST", headers: { authorization: key, "content-type": "application/json" }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ origin_postal_code: Number(postal), origin_latitude: Number(lat), origin_longitude: Number(lng), destination_postal_code: Number(body.destination_postal_code), destination_latitude: body.destination_latitude, destination_longitude: body.destination_longitude, couriers: body.couriers, items }) });
			const payload = await upstream.json().catch(() => null);
			if (upstream.ok && payload?.success === true && Array.isArray(payload.pricing)) { rates = payload.pricing.map(normalizeRate).filter((r: JsonObject | null): r is JsonObject => r !== null); }
		} catch { /* Provider failure must reject quote creation. */ }
	}
	const rate = eligibleRate(rates, String(body.couriers));
	try {
		const quoteBase = rate
			? { ...quoteSnapshot(rate, config, body), originLatitude: Number(lat), originLongitude: Number(lng), originPostalCode: postal }
			: { provider: "biteship", courierCode: body.couriers, serviceCode: "fallback", serviceType: "fallback", courierType: "fallback", deliveryType: "now", fee: 12000, feeSource: "fallback", currency: "IDR", destinationLatitude: body.destination_latitude, destinationLongitude: body.destination_longitude, destinationPostalCode: body.destination_postal_code, quotedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), originLatitude: Number(lat), originLongitude: Number(lng), originPostalCode: postal };
		const quote = await signQuote(quoteBase, body);
		const fallbackRate = rate ?? { courierCode: body.couriers, shippingFee: 12000, price: 12000, serviceCode: "fallback", serviceType: "fallback", courierType: "fallback" };
		return response({ success: true, rates: [fallbackRate], quote });
	} catch { return fail("QUOTE_SIGNING_UNAVAILABLE", 503); }
});
