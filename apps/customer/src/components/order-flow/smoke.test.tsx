import { renderToString } from "react-dom/server";
import { OrderFlowHeader, OrderModeSwitch, flowIndex, previousFlowStep } from "./flow-header";
import { TableStep, PartyStep } from "./table-party-steps";
import { CourierStep, formatDuration } from "./courier-step";
import { FlowDock } from "./flow-dock";
import { DeliveryLiveTracker, resolveLiveState } from "./delivery-live-tracker";
import { renderCheckoutSection } from "@/components/customer/checkout-section";
import { CUSTOMER_ORDERING_DEFAULTS } from "@/components/customer/types";

declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => any;

const noop = () => undefined;
const currency = (n: number) => `Rp${n}`;

describe("order flow render smoke", () => {
	test("header, steps and dock render", () => {
		expect(renderToString(<OrderFlowHeader step="menu" mode="dine_in" storeName="Djiwa" onBack={noop} onHome={noop} />)).toContain("Pilih menu");
		expect(renderToString(<OrderModeSwitch mode="delivery" onChange={noop} />)).toContain("Delivery");
		expect(renderToString(<TableStep value="12" onChange={noop} onNext={noop} mode="dine_in" onModeChange={noop} />)).toContain("Duduk di meja berapa?");
		expect(renderToString(<PartyStep value={3} onChange={noop} onNext={noop} table="12" />)).toMatch(/Meja\s*(<!-- -->)?12/);
		expect(renderToString(<FlowDock totalItems={2} totalLabel="Rp55.000" hasReceipt={false} primaryLabel="Review" primaryDisabled={false} onMenu={noop} onHistory={noop} onCart={noop} onStaff={noop} onPrimary={noop} />)).toContain("Rp55.000");
	});
	test("courier step shows both fees", () => {
		const html = renderToString(<CourierStep options={["grab", "gojek"]} selected="grab" quotes={{ grab: { fee: 10000, duration: "1 - 3 Hours", feeSource: "biteship" }, gojek: { fee: 15000, feeSource: "biteship" } }} loading={false} error={null} canRetry blocked={false} currency={currency} onSelect={noop} onRetry={noop} onBack={noop} onNext={noop} />);
		expect(html).toContain("Rp10000");
		expect(html).toContain("Rp15000");
		expect(html).toContain("1 - 3 jam");
		expect(formatDuration("1 - 2 Hours")).toBe("1 - 2 jam");
	});
	test("flow navigation", () => {
		expect(flowIndex("shipping", "delivery")).toBe(2);
		expect(previousFlowStep("review", "delivery")).toBe("shipping");
		expect(previousFlowStep("review", "dine_in")).toBe("menu");
		expect(previousFlowStep("table", "dine_in")).toBeNull();
		expect(previousFlowStep("receipt", "dine_in")).toBeNull();
	});
	test("live tracker maps Biteship statuses", () => {
		expect(resolveLiveState({ deliveryStatus: "paid" }).index).toBe(0);
		expect(resolveLiveState({ deliveryStatus: "ready_to_ship" }).index).toBe(1);
		expect(resolveLiveState({ deliveryStatus: "out_for_delivery", deliveryCourierStatus: "allocated", deliveryDriverName: "Budi" })).toMatchObject({ index: 2, headline: "Budi ditemukan" });
		expect(resolveLiveState({ deliveryStatus: "out_for_delivery", deliveryCourierStatus: "picked" }).index).toBe(3);
		expect(resolveLiveState({ deliveryStatus: "out_for_delivery", deliveryCourierStatus: "dropping_off" }).index).toBe(4);
		expect(resolveLiveState({ deliveryStatus: "delivered", deliveryCourierStatus: "delivered" })).toMatchObject({ index: 5, live: false });
		expect(resolveLiveState({ deliveryStatus: "failed", deliveryCourierStatus: "courier_not_found" }).tone).toBe("warn");
		const html = renderToString(<DeliveryLiveTracker order={{ deliveryStatus: "out_for_delivery", deliveryCourierStatus: "picking_up", deliveryDriverName: "Budi", deliveryDriverPlate: "B 1234 AAA", deliveryDriverPhone: "0812", deliveryStatusUpdatedAt: Date.now() }} courierLabel="Grab Instant" />);
		expect(html).toContain("Budi menuju kafe");
		expect(html).toContain("B 1234 AAA");
	});
});

describe("checkout render smoke", () => {
	const base: any = {
		cart: [{ productId: "p1", name: "Bubur Ayam", price: 25000, quantity: 2, image: null }],
		checkout: async () => undefined, config: CUSTOMER_ORDERING_DEFAULTS, currency, customerName: "Azzam", customerDescription: "", guestEmail: "", guestPhone: "",
		isAuthenticated: true, dessertLater: false, freeRefillCharge: 0, hasDessertInCart: false, isSubmitting: false, notes: "", paymentChoice: "wallet",
		paymentOptions: [{ key: "wallet", label: "Djiwa Pay", description: "Saldo" }, { key: "mayar", label: "QRIS", description: "Bayar QRIS" }, { key: "cashier", label: "Bayar di Kasir", description: "Tunjukkan tiket" }],
		productGrossSubtotal: 50000, promoDiscount: 0, serviceChargeAmount: 0, serviceChargeRate: 0, setCustomerName: noop, setCustomerDescription: noop, setGuestEmail: noop, setGuestPhone: noop,
		setDessertLater: noop, setNotes: noop, setPaymentChoice: noop, setTableNumber: noop, tableNumber: "4", updateCartQuantity: noop, onRemoveItem: noop, onEditMenu: noop,
		onContinueToPayment: noop, onBackToMenu: noop, taxAmount: 5000, taxEnabled: true, taxRate: 10, total: 55000, walletBalance: 85000, onTopup: noop, checkoutError: null,
	};
	test("review shows items, fields and total", () => {
		const html = renderToString(renderCheckoutSection({ ...base, mode: "review" }));
		expect(html).toContain("Review pesanan");
		expect(html).toContain("Bubur Ayam");
		expect(html).toContain("Catatan order");
		expect(html).toContain("Lanjut ke pembayaran");
	});
	test("payment lists methods and flags insufficient wallet", () => {
		const html = renderToString(renderCheckoutSection({ ...base, mode: "payment", walletBalance: 1000 }));
		expect(html).toContain("Pilih pembayaran");
		expect(html).toContain("QRIS");
		expect(html).toContain("Top up");
	});
	test("empty cart state", () => {
		expect(renderToString(renderCheckoutSection({ ...base, cart: [], mode: "review" }))).toContain("Keranjang masih kosong");
	});
});
