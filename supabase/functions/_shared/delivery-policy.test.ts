import { describe, expect, test } from 'bun:test';
import { catalogItems, deliveryTotal, eligibleRate, mapProviderStatus, quoteSnapshot, readyTransition, shipmentEligible, shipmentResponseId, validateDestination, webhookPatch, webhookTrackingPatch } from './delivery-policy.ts';
const destination = { destination_contact_name: 'Customer', destination_contact_phone: '08123456789', destination_address: 'Jalan test 1', destination_postal_code: '40141', destination_latitude: -6.9, destination_longitude: 107.6, couriers: 'grab' };
const product = { source_id: 'p1', name: 'Catalog name', price: 30000, delivery_enabled: true, delivery_weight_grams: 350 };
const order = { source_id: 'order_1', order_type: 'delivery', status: 'paid', delivery_status: 'ready_to_ship', delivery_provider: 'grab', shipping_fee_amount: 15000, shipping_rate_snapshot: { feeSource: 'biteship', courierCode: 'grab', courierType: 'instant', destinationPostalCode: '40141', fee: 15000 } };
describe('authoritative quote validation', () => {
	test('ignores supplied weight/name/value', () => expect(catalogItems([{ productId: 'p1', quantity: 2, weight: 1, value: 1, name: 'fake' }], [product])).toEqual([{ name: 'Catalog name', sku: 'p1', value: 30000, quantity: 2, weight: 350 }]));
	test.each([null, 0, -1, 1.5])('rejects missing/nonpositive/nonintegral catalog grams %s', weight => expect(() => catalogItems([{ productId: 'p1', quantity: 1 }], [{ ...product, delivery_weight_grams: weight }])).toThrow());
	test('rejects disabled/unknown products and invalid quantity', () => { for (const products of [[], [{ ...product, delivery_enabled: false }]]) expect(() => catalogItems([{ productId: 'p1', quantity: 1 }], products)).toThrow(); expect(() => catalogItems([{ productId: 'p1', quantity: 0 }], [product])).toThrow(); });
	test('rate quotes do not need recipient contact, but still need address, postal code and coordinates', () => {
		const { destination_contact_name: _n, destination_contact_phone: _p, ...noContact } = destination;
		expect(() => validateDestination(noContact)).toThrow();
		validateDestination(noContact, false);
		for (const patch of [{ destination_address: '' }, { destination_postal_code: '1234' }, { destination_latitude: null }]) expect(() => validateDestination({ ...noContact, ...patch }, false)).toThrow();
	});
	test('postal, contact, address and coordinates are hard errors', () => { validateDestination(destination); for (const patch of [{ destination_postal_code: '1234' }, { destination_postal_code: 'x40141' }, { destination_contact_phone: '' }, { destination_address: '' }, { destination_latitude: null }, { destination_longitude: 181 }]) expect(() => validateDestination({ ...destination, ...patch })).toThrow(); });
	test('unavailable actual rate rejects instead of flat fallback', () => { expect(eligibleRate([{ courierCode: 'jne', serviceCode: 'reg', price: 1 }], 'grab')).toBeUndefined(); expect(() => quoteSnapshot(undefined, { fallbackFee: 17300 }, destination, 0)).toThrow(); });
});
describe('shipment safety', () => {
	test('requires paid, ready, genuine quote and fee parity', () => { expect(Boolean(shipmentEligible(order))).toBe(true); for (const patch of [{ status: 'pending' }, { delivery_status: 'packing' }, { shipping_fee_amount: 1 }, { delivery_provider_order_id: 'existing' }, { shipping_rate_snapshot: { ...order.shipping_rate_snapshot, feeSource: 'fallback' } }]) expect(Boolean(shipmentEligible({ ...order, ...patch }))).toBe(false); });
	test('readiness is sequential and never changes payment', () => { expect(readyTransition({ ...order, delivery_status: 'paid' }, 'packing')).toBe(true); expect(readyTransition({ ...order, delivery_status: 'packing' }, 'ready_to_ship')).toBe(true); expect(readyTransition({ ...order, delivery_status: 'paid' }, 'ready_to_ship')).toBe(false); expect(readyTransition({ ...order, status: 'pending', delivery_status: 'packing' }, 'ready_to_ship')).toBe(false); });
	test('documented duplicate reference returns existing order only', () => { expect(shipmentResponseId({ success: false, code: 40002060, details: { order_id: 'existing', reference_id: 'order_1' } }, false)).toBe('existing'); expect(shipmentResponseId({ success: false, code: 40002060, details: { order_id: 'wrong', reference_id: 'other' } }, false, 'order_1')).toBe(''); expect(shipmentResponseId({ code: 40003001, details: { order_id: 'unrelated' } }, false)).toBe(''); expect(shipmentResponseId({ id: 'fake', success: false }, false)).toBe(''); });
});
describe('official webhook lifecycle', () => {
	test('official tracking and waybill fields', () => expect(webhookPatch({ status: 'picked', courier_tracking_id: 'track', courier_waybill_id: 'awb' }, { delivery_status: 'ready_to_ship' })).toEqual({ delivery_status: 'out_for_delivery', delivery_tracking_id: 'track', delivery_waybill_id: 'awb' }));
	test.each(['delivered', 'failed', 'cancelled'])('stale events cannot regress terminal %s', status => expect(webhookPatch({ status: 'confirmed' }, { delivery_status: status })).toEqual({}));
	test('replay preserves identifiers and payment/price fields', () => { expect(webhookPatch({ status: 'delivered', courier_tracking_id: 'replacement', price: 999999 }, { delivery_status: 'delivered', delivery_tracking_id: 'original' })).toEqual({}); expect(webhookPatch({ price: 99999 }, {})).toEqual({}); });
	test('maps provider statuses to valid enum only', () => { expect(mapProviderStatus('dropping_off')).toBe('out_for_delivery'); expect(mapProviderStatus('courier_not_found')).toBe('failed'); expect(mapProviderStatus('arbitrary')).toBeNull(); });
});

import { signQuote, verifyQuote, quoteMatchesOrder } from './delivery-quote.ts';
describe('quote authentication', () => {
	test('binds persisted cart/contact/fee and rejects tampered provenance', async () => {
		const previous = (globalThis as any).Deno;
		(globalThis as any).Deno = { env: { get: () => 'fixture-signing-key-only' } };
		try {
			const body = { ...destination, items: [{ productId: 'p1', quantity: 2 }] };
			const q = await signQuote(quoteSnapshot({ courierCode: 'grab', serviceCode: 'instant', price: 15000 }, {}, body), body);
			expect((await verifyQuote(q)).fee).toBe(15000);
			expect((await verifyQuote({ ...q, cart: [{ quantity: 2, productId: 'p1' }] })).fee).toBe(15000);
			const persisted = { shipping_fee_amount: 15000, delivery_provider: 'grab', delivery_address: destination.destination_address, delivery_contact_name: destination.destination_contact_name, delivery_contact_phone: destination.destination_contact_phone };
			expect(quoteMatchesOrder(q, persisted, [{ product_source_id: 'p1', quantity: 2 }])).toBe(true);
			expect(quoteMatchesOrder(q, { ...persisted, shipping_fee_amount: 1 }, [{ product_source_id: 'p1', quantity: 2 }])).toBe(false);
			expect(quoteMatchesOrder(q, persisted, [{ product_source_id: 'p1', quantity: 3 }])).toBe(false);
			await expect(verifyQuote({ ...q, feeSource: 'fallback' })).rejects.toThrow();
			await expect(verifyQuote({ ...q, signedPayload: q.signedPayload.replace('15000', '1') })).rejects.toThrow();
			const expired = await signQuote(quoteSnapshot({serviceCode:'instant',price:17300}, {}, body, 0), body);
			await expect(verifyQuote(expired)).rejects.toThrow('expired');
			expect((await verifyQuote(expired, true)).feeSource).toBe('biteship');
		} finally { (globalThis as any).Deno = previous; }
	});
});

describe('live tracking patch', () => {
	const payload = { event: 'order.status', status: 'allocated', courier_driver_name: 'Budi', courier_driver_phone: '0812', courier_driver_plate_number: 'B 1234 AAA', courier_driver_photo_url: 'https://img.example/p.jpg', courier_link: 'https://track.example/x' };
	test('stores raw courier status, driver, link and history once', () => {
		const patch = webhookTrackingPatch(payload, { delivery_status_history: [] }, 1000);
		expect(patch).toMatchObject({ delivery_courier_status: 'allocated', delivery_driver_name: 'Budi', delivery_driver_plate: 'B 1234 AAA', delivery_tracking_link: 'https://track.example/x', delivery_status_updated_at: 1000 });
		expect(patch.delivery_status_history).toEqual([{ status: 'allocated', at: 1000 }]);
	});
	test('is a no-op when nothing changed', () => {
		const current = { delivery_courier_status: 'allocated', delivery_driver_name: 'Budi', delivery_driver_phone: '0812', delivery_driver_plate: 'B 1234 AAA', delivery_driver_photo_url: 'https://img.example/p.jpg', delivery_tracking_link: 'https://track.example/x', delivery_status_history: [{ status: 'allocated', at: 1 }] };
		expect(webhookTrackingPatch(payload, current, 2000)).toEqual({});
	});
	test('ignores non-https photo and link, keeps history capped', () => {
		const history = Array.from({ length: 40 }, (_, i) => ({ status: 's' + i, at: i }));
		const patch = webhookTrackingPatch({ status: 'picked', courier_driver_photo_url: 'javascript:alert(1)', courier_link: 'http://x' }, { delivery_status_history: history }, 5);
		expect(patch.delivery_driver_photo_url).toBeUndefined();
		expect(patch.delivery_tracking_link).toBeUndefined();
		expect(patch.delivery_status_history).toHaveLength(40);
	});
});
