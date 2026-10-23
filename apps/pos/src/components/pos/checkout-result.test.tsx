import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutResult } from "./checkout-result";
import type { CheckoutSubmissionResult } from "@/lib/pos-checkout";

const paid: CheckoutSubmissionResult = {
	orderId: "just-created-123",
	status: "paid",
	paymentMethod: "cash",
	total: 30000,
	cashReceived: 50000,
	changeAmount: 20000,
};
describe("checkout result", () => {
	it("shows the created ID, actual paid status, cash and change", () => {
		const html = renderToStaticMarkup(
			<CheckoutResult result={paid} onPrint={() => {}} />,
		);
		expect(html).toContain("just-created-123");
		expect(html).toContain("Lunas");
		expect(html).toContain("Uang diterima");
		expect(html).toContain("Kembalian");
		expect(html).toContain("50.000");
		expect(html).toContain("20.000");
	});
	it("pending receipt does not claim payment and exposes the invoice", () => {
		const html = renderToStaticMarkup(
			<CheckoutResult
				result={{
					...paid,
					status: "pending",
					paymentMethod: "mayar",
					invoiceUrl: "https://pay.example.com/current",
				}}
				onPrint={() => {}}
			/>,
		);
		expect(html).toContain("Menunggu pembayaran");
		expect(html.includes("Lunas")).toBe(false);
		expect(html).toContain("Cetak pesanan belum lunas");
		expect(html).toContain("https://pay.example.com/current");
	});
	it("queued result offers no receipt or kitchen printing", () => {
		const html = renderToStaticMarkup(
			<CheckoutResult
				result={{ ...paid, orderId: null, status: "queued" }}
				onPrint={() => {}}
				onPrintKitchen={() => {}}
			/>,
		);
		expect(html).toContain("antrean offline");
		expect(html.includes("Cetak")).toBe(false);
		expect(html.includes("Lunas")).toBe(false);
	});
});
