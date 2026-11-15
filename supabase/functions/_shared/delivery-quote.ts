import { validateDestination } from './delivery-policy.ts';
type Row = Record<string, any>;
function signingKey() {
	const key = Deno.env.get('YUMI_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!key) throw new Error('Delivery signing unavailable');
	return key;
}
async function mac(payload: string) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function signQuote(snapshot: Row, body: Row) {
	const signedPayload = JSON.stringify({ ...snapshot, destinationContactName: String(body.destination_contact_name ?? '').trim(), destinationContactPhone: String(body.destination_contact_phone ?? '').trim(), destinationAddress: body.destination_address.trim(), cart: body.items.map((i: Row) => ({ productId: i.productId, quantity: i.quantity })) });
	return { ...JSON.parse(signedPayload), signedPayload, signature: await mac(signedPayload) };
}
function canonical(value: any): string {
	if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
	if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
	return JSON.stringify(value);
}
export async function verifyQuote(value: unknown, expiredAllowed = false): Promise<Row> {
	const q = value as Row;
	if (!q || typeof q.signedPayload !== 'string' || q.signedPayload.length > 50000 || typeof q.signature !== 'string' || !/^[a-f0-9]{64}$/.test(q.signature)) throw new Error('Invalid quote');
	const expected = await mac(q.signedPayload);
	let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ q.signature.charCodeAt(i);
	if (diff) throw new Error('Invalid quote signature');
	const snapshot = JSON.parse(q.signedPayload);
	// All public snapshot fields must agree with the authenticated payload.
	for (const field of Object.keys(snapshot)) if (canonical(q[field]) !== canonical(snapshot[field])) throw new Error('Quote changed');
	const expiry = Date.parse(snapshot.expiresAt);
	if (!Number.isFinite(expiry) || (!expiredAllowed && expiry <= Date.now())) throw new Error('Quote expired');
	validateDestination({ destination_contact_name: snapshot.destinationContactName, destination_contact_phone: snapshot.destinationContactPhone, destination_address: snapshot.destinationAddress, destination_postal_code: snapshot.destinationPostalCode, destination_latitude: snapshot.destinationLatitude, destination_longitude: snapshot.destinationLongitude }, false);
	return snapshot;
}
export function quoteMatchesOrder(q: Row, order: Row, items: Row[]) {
	const identities = (rows: Row[]) => rows.map(i => `${i.productId ?? i.product_source_id}:${Number(i.quantity)}`).sort().join('|');
	return q.fee === Number(order.shipping_fee_amount) && q.courierCode === order.delivery_provider && q.destinationAddress === order.delivery_address?.trim() && q.destinationContactName === order.delivery_contact_name?.trim() && q.destinationContactPhone === order.delivery_contact_phone?.trim() && identities(q.cart) === identities(items);
}
