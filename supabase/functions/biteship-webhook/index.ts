import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { webhookPatch } from "../_shared/delivery-policy.ts";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const object = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (...values: unknown[]) => values.find(v => typeof v === 'string' && v.trim())?.toString().trim() ?? '';
Deno.serve(async req => {
	if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
	const raw = await req.text();
	if (!raw.trim()) return new Response('ok', { headers: { 'content-type': 'text/plain' } });
	let body: Record<string, any>;
	try { const v = JSON.parse(raw); if (!object(v)) throw new Error(); body = v; } catch { return json({ error: 'INVALID_JSON' }, 400); }
	if (!Object.keys(body).length) return new Response('ok', { headers: { 'content-type': 'text/plain' } });
	const secret = Deno.env.get('BITESHIP_WEBHOOK_TOKEN')?.trim();
	if (!secret || req.headers.get('x-biteship-webhook-token') !== secret) return json({ error: 'UNAUTHORIZED' }, 401);
	const data = object(body.data) ? body.data : body;
	const event = str(body.event, body.event_type, body.type);
	const orderId = str(data.order_id, body.order_id);
	if (!event || !orderId) return json({ error: 'MISSING_EVENT_IDENTITY' }, 400);
	// Hash the authenticated payload when no provider event ID exists; status/waybill
	// events without timestamps must not collapse onto the same key.
	const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body))))).map(b => b.toString(16).padStart(2, '0')).join('');
	const eventKey = str(req.headers.get('x-biteship-event-id'), body.event_id, body.eventId) || `${orderId}:${event}:${hash}`;
	const url = Deno.env.get('YUMI_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
	const key = Deno.env.get('YUMI_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!url || !key) return json({ error: 'WEBHOOK_NOT_CONFIGURED' }, 503);
	const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'pos', 'Accept-Profile': 'pos', Prefer: 'return=representation' };
	async function rest(path: string, method = 'GET', payload?: unknown) {
		const response = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
		if (!response.ok) throw new Error('Storage unavailable');
		return response.json();
	}
	try {
		const inbox = await rest('rpc/enqueue_biteship_webhook_event', 'POST', { p_provider_event_key: eventKey, p_event_type: event, p_provider_order_id: orderId, p_payload: body });
		if (!inbox?.ok || !inbox.id) throw new Error('Inbox unavailable');
		if (inbox.status === 'processed') return json({ ok: true, duplicate: true });
		if (['order.status', 'order.waybill_id', 'order.price'].includes(event)) {
			const filter = `delivery_provider_order_id=eq.${encodeURIComponent(orderId)}`;
			let mapped = false;
			for (let attempt = 0; attempt < 3; attempt++) {
				const orders = await rest(`orders?select=source_id,delivery_status,delivery_tracking_id,delivery_waybill_id&${filter}`);
				if (!Array.isArray(orders) || orders.length !== 1) throw new Error('Order mapping deferred');
				const current = orders[0];
				const patch = event === 'order.price' ? {} : webhookPatch(data, current);
				if (!Object.keys(patch).length) { mapped = true; break; }
				const condition = (field: string) => current[field] == null ? `${field}=is.null` : `${field}=eq.${encodeURIComponent(current[field])}`;
				const updated = await rest(`orders?${filter}&${['delivery_status', 'delivery_tracking_id', 'delivery_waybill_id'].map(condition).join('&')}`, 'PATCH', patch);
				if (Array.isArray(updated) && updated.length === 1) { mapped = true; break; }
			}
			if (!mapped) throw new Error('Concurrent mapping deferred');
		} else return json({ error: 'EVENT_MAPPING_UNSUPPORTED' }, 503);
		const processed = await rest(`biteship_webhook_events?id=eq.${encodeURIComponent(inbox.id)}`, 'PATCH', { status: 'processed', updated_at: Date.now() });
		if (!Array.isArray(processed) || processed.length !== 1) throw new Error('Inbox update deferred');
		return json({ ok: true });
	} catch { return json({ error: 'EVENT_MAPPING_DEFERRED' }, 503); }
});
