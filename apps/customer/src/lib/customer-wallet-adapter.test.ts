import { walletTransactionLabel } from "./customer-wallet-adapter";

declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

describe("walletTransactionLabel", () => {
	 test("names transfer counterparties so the direction is explicit", () => {
		expect(walletTransactionLabel({ type: "wallet_transfer_sent", direction: "debit", counterparty_name: "Budi" })).toBe("Saldo dikirim ke Budi");
		expect(walletTransactionLabel({ type: "wallet_transfer_received", direction: "credit", counterparty_name: "Sari" })).toBe("Saldo diterima dari Sari");
	});

	test("falls back to direction for unknown ledger types", () => {
		expect(walletTransactionLabel({ type: "manual_credit", direction: "credit", counterparty_name: null })).toBe("Saldo masuk");
		expect(walletTransactionLabel({ type: "manual_debit", direction: "debit", counterparty_name: null })).toBe("Saldo keluar");
	});
});
