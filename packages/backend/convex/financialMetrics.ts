type OrderLike = {
	status?: string | null;
	totalAmount?: number | null;
	discountAmount?: number | null;
	taxAmount?: number | null;
	serviceChargeAmount?: number | null;
};

type BookingLike = {
	paymentStatus?: string | null;
	bookingStatus?: string | null;
	totalAmount?: number | null;
	taxAmount?: number | null;
	serviceChargeAmount?: number | null;
};

export function isSettledOrder(order: OrderLike) {
	return order.status === "paid" || order.status === "completed";
}

export function isSettledBooking(booking: BookingLike) {
	return (
		booking.paymentStatus === "paid" ||
		booking.bookingStatus === "confirmed" ||
		booking.bookingStatus === "completed"
	);
}

export function getOrderFinancialSnapshot(order: OrderLike) {
	const finalCollected = order.totalAmount ?? 0;
	const discount = order.discountAmount ?? 0;
	const tax = order.taxAmount ?? 0;
	const serviceCharge = order.serviceChargeAmount ?? 0;
	const netSales = Math.max(0, finalCollected - tax - serviceCharge);
	const grossSales = netSales + discount;

	return {
		finalCollected,
		grossSales,
		netSales,
		discount,
		tax,
		serviceCharge,
	};
}

export function getBookingFinancialSnapshot(booking: BookingLike) {
	const finalCollected = booking.totalAmount ?? 0;
	const tax = booking.taxAmount ?? 0;
	const serviceCharge = booking.serviceChargeAmount ?? 0;
	const netSales = Math.max(0, finalCollected - tax - serviceCharge);

	return {
		finalCollected,
		grossSales: netSales,
		netSales,
		discount: 0,
		tax,
		serviceCharge,
	};
}
