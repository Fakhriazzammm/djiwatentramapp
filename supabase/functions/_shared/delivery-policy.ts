// Pure Delivery rules, shared by handlers and fixture tests. No provider/database calls.
type Row = Record<string, any>;
// requireContact=false dipakai saat hanya meminta tarif: harga ditentukan jarak dan berat, bukan penerima.
// Nama/telepon penerima baru wajib saat membuat pesanan kurir (diambil dari order, bukan dari quote).
export function validateDestination(body: Row, requireContact = true) {
	const keys = requireContact ? ['destination_contact_name', 'destination_contact_phone', 'destination_address'] : ['destination_address'];
	for (const key of keys) {
		if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 1000) throw new Error(`Invalid ${key}`);
	}
	if (requireContact && (!/^\+?[0-9][0-9 ()-]{6,19}$/.test(body.destination_contact_phone.trim()) || body.destination_contact_phone.replace(/\D/g, '').length < 8)) throw new Error('Invalid contact phone');
	if (typeof body.destination_postal_code !== 'string' || !/^\d{5}$/.test(body.destination_postal_code)) throw new Error('Invalid postal code');
	for (const [key, max] of [['destination_latitude', 90], ['destination_longitude', 180]] as const) {
		if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || Math.abs(body[key]) > max) throw new Error(`Invalid ${key}`);
	}
}
export function catalogItems(cart: unknown, products: Row[]) {
	if (!Array.isArray(cart) || !cart.length || cart.length > 100) throw new Error('Invalid cart');
	const byId = new Map(products.map(p => [p.source_id, p]));
	return cart.map(item => {
		const p = byId.get(item?.productId);
		if (!p || p.delivery_enabled !== true || !Number.isInteger(p.delivery_weight_grams) || p.delivery_weight_grams <= 0 || p.delivery_weight_grams > 1000000) throw new Error('Product delivery weight unavailable');
		if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) throw new Error('Invalid quantity');
		if (!p.name || !Number.isFinite(Number(p.price)) || Number(p.price) < 0) throw new Error('Invalid product');
		return { name: p.name, sku: p.source_id, value: Math.round(Number(p.price)), quantity: item.quantity, weight: p.delivery_weight_grams };
	});
}
export function eligibleRate(rates: Row[], courier: string) {
	return rates.find(r => r.courierCode === courier && r.serviceCode && Number.isInteger(r.price ?? r.shippingFee) && (r.price ?? r.shippingFee) >= 0);
}
export function quoteSnapshot(rate: Row | undefined, config: Row, body: Row, now = Date.now()) {
	if (!rate || !['gojek', 'grab'].includes(body.couriers) || !rate.serviceCode || !Number.isInteger(rate.price ?? rate.shippingFee) || (rate.price ?? rate.shippingFee) < 0) throw new Error('Actual courier rate unavailable');
	return { provider: 'biteship', courierCode: body.couriers, serviceCode: rate.serviceCode, serviceType: rate.serviceType ?? null, courierType: rate.serviceCode, deliveryType: 'now', fee: rate.price ?? rate.shippingFee, feeSource: 'biteship', currency: 'IDR', destinationLatitude: body.destination_latitude, destinationLongitude: body.destination_longitude, destinationPostalCode: body.destination_postal_code, quotedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() };
}
export function deliveryTotal(base: number, fee: number) {
	if (!Number.isFinite(base) || !Number.isInteger(fee) || fee < 0) throw new Error('Invalid delivery total');
	return base + fee;
}
export function mapProviderStatus(status: string): string | null {
	if (status === 'delivered') return 'delivered';
	if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
	if (['confirmed', 'scheduled', 'allocated', 'picking_up', 'picked', 'in_transit', 'dropping_off'].includes(status)) return 'out_for_delivery';
	if (['on_hold', 'return_in_transit', 'returned', 'rejected', 'disposed', 'courier_not_found', 'failed'].includes(status)) return 'failed';
	return null;
}
export function webhookPatch(data: Row, current: Row) {
	const update: Row = {};
	const mapped = mapProviderStatus(String(data.status ?? '').toLowerCase());
	// Compare-and-set in the handler protects this decision against concurrent events.
	const terminal = ['delivered', 'cancelled', 'failed'].includes(current.delivery_status);
	if (mapped && !terminal) update.delivery_status = mapped;
	const tracking = data.courier_tracking_id ?? data.tracking_id;
	const waybill = data.courier_waybill_id ?? data.waybill_id;
	if (typeof tracking === 'string' && tracking.trim() && !current.delivery_tracking_id) update.delivery_tracking_id = tracking.trim();
	if (typeof waybill === 'string' && waybill.trim() && !current.delivery_waybill_id) update.delivery_waybill_id = waybill.trim();
	// order.price is retained in the inbox; it never changes customer-paid financial fields.
	return update;
}
export function readyTransition(order: Row, next: unknown) {
	const transitions: Record<string, string> = { pending_payment: 'packing', paid: 'packing', preparing: 'packing', packing: 'ready_to_ship' };
	return order.order_type === 'delivery' && order.shipping_rate_snapshot?.feeSource !== 'fallback' && order.receipt_meta?.fulfillmentMode !== 'manual_hold' && ['paid', 'completed'].includes(order.status) && !order.delivery_provider_order_id && transitions[order.delivery_status] === next;
}
export function shipmentEligible(order: Row) {
	const q = order.shipping_rate_snapshot;
	return order.order_type === 'delivery' && ['paid', 'completed'].includes(order.status) && order.delivery_status === 'ready_to_ship' && !order.delivery_provider_order_id && q?.feeSource === 'biteship' && ['gojek', 'grab'].includes(q.courierCode) && q.courierCode === order.delivery_provider && q.courierType && /^\d{5}$/.test(q.destinationPostalCode) && Number.isInteger(order.shipping_fee_amount) && q.fee === order.shipping_fee_amount;
}
export function shipmentResponseId(payload: Row, ok: boolean, referenceId?: string) {
	if (ok && payload.success === true && typeof payload.id === 'string') return payload.id;
	// Biteship documents this code and details.order_id for a reused reference_id.
	if (payload.success === false && String(payload.code) === '40002060' && typeof payload.details?.order_id === 'string' && (!referenceId || payload.details.reference_id === referenceId)) return payload.details.order_id;
	return '';
}

// Data live tracking untuk customer: status kurir mentah, driver, tautan lacak, dan riwayat status.
// Dipisah dari webhookPatch agar aturan status internal (delivery_status) tidak berubah.
export function webhookTrackingPatch(data: Row, current: Row, now = Date.now()) {
	const update: Row = {};
	const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');
	const raw = text(data.status).toLowerCase();
	const field = (column: string, value: string, max = 300) => { if (value && value.slice(0, max) !== current[column]) update[column] = value.slice(0, max); };
	field('delivery_driver_name', text(data.courier_driver_name), 120);
	field('delivery_driver_phone', text(data.courier_driver_phone), 40);
	field('delivery_driver_plate', text(data.courier_driver_plate_number), 40);
	field('delivery_driver_photo_url', /^https:\/\//.test(text(data.courier_driver_photo_url)) ? text(data.courier_driver_photo_url) : '', 500);
	field('delivery_tracking_link', /^https:\/\//.test(text(data.courier_link)) ? text(data.courier_link) : '', 500);
	const history: Row[] = Array.isArray(current.delivery_status_history) ? current.delivery_status_history : [];
	if (raw && raw !== current.delivery_courier_status) {
		update.delivery_courier_status = raw;
		update.delivery_status_history = [...history, { status: raw, at: now }].slice(-40);
	}
	if (Object.keys(update).length) update.delivery_status_updated_at = now;
	return update;
}
