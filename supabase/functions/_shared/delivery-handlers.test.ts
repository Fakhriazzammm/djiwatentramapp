import { afterEach, expect, test } from 'bun:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const fixtureDirectories: string[] = [];
const originalFetch = globalThis.fetch;
const originalDeno = (globalThis as any).Deno;
afterEach(async () => { for (const path of fixtureDirectories.splice(0)) await rm(path, { recursive: true }); globalThis.fetch = originalFetch; (globalThis as any).Deno = originalDeno; });
const fixtures = { SUPABASE_URL: 'https://storage.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', BITESHIP_WEBHOOK_TOKEN: 'fixture-webhook', BITESHIP_API_KEY: 'fixture-provider', BITESHIP_ORIGIN_LATITUDE: '-6.9', BITESHIP_ORIGIN_LONGITUDE: '107.6', BITESHIP_ORIGIN_POSTAL_CODE: '40141' };
async function handler(name: string, env: Record<string, string> = fixtures) {
	let serve!: (req: Request) => Promise<Response>;
	(globalThis as any).Deno = { env: { get: (key: string) => env[key] }, serve: (fn: typeof serve) => { serve = fn; } };
	const path = resolve(import.meta.dir, '../', name, 'index.ts');
	const source = (await readFile(path, 'utf8')).replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', '').replace(/from "(\.\.[^"]+)"/g, (_, relative) => `from "${resolve(dirname(path), relative)}"`);
	const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
	const temp = await mkdtemp('/tmp/delivery-handler-'); fixtureDirectories.push(temp);
	await writeFile(`${temp}/handler.mjs`, js);
	await import(`${temp}/handler.mjs`);
	return (body: unknown, headers: Record<string, string> = {}) => serve(new Request('https://function.invalid', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
}
const j = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const cart = { destination_contact_name: 'Customer', destination_contact_phone: '08123456789', destination_address: 'Jalan 1', destination_postal_code: '40141', destination_latitude: -6.9, destination_longitude: 107.6, couriers: 'grab', items: [{ productId: 'p1', quantity: 2, weight: 1, name: 'forged', value: 1 }] };
function ratesFetch(provider: (body: any) => Response, products: any[] = [{ source_id: 'p1', name: 'Catalog', price: 30000, delivery_enabled: true, delivery_weight_grams: 350 }]) {
	globalThis.fetch = (async (input, init) => {
		const url = String(input);
		if (url.includes('customer_delivery_settings?')) return j([{ is_enabled: true, allowed_couriers: ['grab'], default_courier: 'grab', fallback_fee: 17300 }]);
		if (url.includes('products?')) return j(products);
		if (url === 'https://api.biteship.com/v1/rates/couriers') return provider(JSON.parse(String(init?.body)));
		throw new Error(`Unexpected fixture request ${url}`);
	}) as typeof fetch;
}
test('rates handler uses catalog authority and eligible Biteship total', async () => {
	let providerCalls = 0;
	ratesFetch(body => { providerCalls++; expect(body.items).toEqual([{ name: 'Catalog', sku: 'p1', value: 30000, quantity: 2, weight: 350 }]); expect(body.origin_latitude).toBe(-6.9); return j({ success: true, pricing: [{ courier_code: 'grab', courier_service_code: 'instant', service_type: 'same_day', price: 15000, shipping_fee: 14000 }] }); });
	const call = await handler('biteship-rates'); const res = await call(cart);
	expect(res.status).toBe(200); const result = await res.json(); expect(result.quote.fee).toBe(15000); expect(result.quote.feeSource).toBe('biteship'); expect(providerCalls).toBe(1);
});
test('provider failure and no eligible rate fail closed without a quote', async () => {
	for (const reply of [j({}, 503), j({ success: true, pricing: [{ courier_code: 'jne', price: 10000 }] })]) {
		ratesFetch(() => reply); const call = await handler('biteship-rates'); const res = await call(cart); const result = await res.json();
		expect(res.status).toBe(503); expect(result.error.code).toBe('RATE_UNAVAILABLE'); expect(result.quote).toBeUndefined();
	}
});
test('validation never falls back or calls the provider', async () => {
	ratesFetch(() => { throw new Error('Provider must not be called'); }); const call = await handler('biteship-rates');
	for (const patch of [{ destination_postal_code: '4014' }, { destination_contact_phone: '' }, { destination_latitude: null }, { items: [{ productId: 'unknown', quantity: 1 }] }]) { const res = await call({ ...cart, ...patch }); expect(res.status).toBe(400); expect((await res.json()).quote).toBeUndefined(); }
	ratesFetch(() => { throw new Error('Provider must not be called'); }, [{ source_id: 'p1', delivery_enabled: true, delivery_weight_grams: null }]); expect((await call(cart)).status).toBe(400);
});
test('empty install probes never write; nonempty requires exact configured header', async () => {
	globalThis.fetch = (async () => { throw new Error('No fixture writes allowed'); }) as typeof fetch;
	const call = await handler('biteship-webhook'); const probe = await call(''); expect(probe.status).toBe(200); expect(await probe.text()).toBe('ok'); expect((await call({})).status).toBe(200);
	expect((await call({ event: 'order.status', order_id: 'provider' }, { authorization: 'Bearer fixture-webhook' })).status).toBe(401);
});
test('official webhook retries mapping before processing and replay is idempotent', async () => {
	let inboxStatus = 'queued'; let failOrder = true; let order = { source_id: 'order', delivery_status: 'ready_to_ship', delivery_tracking_id: null, delivery_waybill_id: null }; let patches = 0;
	globalThis.fetch = (async (input, init) => {
		const url = String(input); const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
		if (url.includes('rpc/enqueue_biteship_webhook_event')) return j({ ok: true, id: 'inbox', status: inboxStatus });
		if (url.includes('/orders?') && init?.method === 'PATCH') { if (failOrder) return j({}, 500); patches++; order = { ...order, ...payload }; return j([order]); }
		if (url.includes('/orders?')) return j([order]);
		if (url.includes('biteship_webhook_events?')) { expect(order.delivery_status).toBe('out_for_delivery'); inboxStatus = payload.status; return j([{ id: 'inbox' }]); }
		throw new Error('Unexpected fixture request');
	}) as typeof fetch;
	const call = await handler('biteship-webhook'); const event = { event: 'order.status', order_id: 'provider', status: 'picked', courier_tracking_id: 'track', courier_waybill_id: 'awb' }; const headers = { 'x-biteship-webhook-token': 'fixture-webhook' };
	expect((await call(event, headers)).status).toBe(503); expect(inboxStatus).toBe('queued'); failOrder = false;
	expect((await call(event, headers)).status).toBe(200); expect(order.delivery_tracking_id).toBe('track'); expect(order.delivery_waybill_id).toBe('awb'); expect(inboxStatus).toBe('processed');
	expect((await call(event, headers)).status).toBe(200); expect(patches).toBe(1);
});
test('order.price retains evidence only, without patching any order field', async () => {
	let stored: any;
	globalThis.fetch = (async (input, init) => {
		const url = String(input); const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
		if (url.includes('rpc/enqueue_biteship_webhook_event')) { stored = payload.p_payload; return j({ ok: true, id: 'price', status: 'queued' }); }
		if (url.includes('/orders?')) { expect(init?.method).toBe('GET'); return j([{ source_id: 'order', delivery_status: 'delivered' }]); }
		if (url.includes('biteship_webhook_events?')) return j([{ id: 'price' }]);
		throw new Error('Unexpected fixture request');
	}) as typeof fetch;
	const call = await handler('biteship-webhook'); const event = { event: 'order.price', order_id: 'provider', price: 90000 };
	expect((await call(event, { 'x-biteship-webhook-token': 'fixture-webhook' })).status).toBe(200); expect(stored.price).toBe(90000);
});
