import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

it("both responsive checkout surfaces print by the persisted result ID", () => {
	const menu = source("routes/menu.lazy.tsx");
	expect([...menu.matchAll(/onPrintOrder=\{/g)].length).toBe(2);
	expect(menu.includes("!customerInfo.isSubmitted && cartItems.length === 0")).toBe(false);
});

it("restored and new carts cannot remain on the preceding order result", () => {
	const cart = source("context/cart-context.tsx");
	expect(cart).toContain("previous.result ? createCheckoutDraft() : previous");
	expect(cart).toContain("setCheckoutDraft(createCheckoutDraft());\n\t\tsetItems(newItems)");
});

it("acknowledged shift expenses are locked and skipped on close retries", () => {
	const sidebar = source("components/pos/menu-sidebar.tsx");
	expect(sidebar).toContain("if (exp.savedId) continue;");
	expect(sidebar).toContain("disabled={isSubmitting || Boolean(exp.savedId)}");
	expect(sidebar).toContain("sourceFingerprint: `shift-close:");
});

it("keeps modal focus independent from POS shortcuts and hides unsupported QRIS", () => {
	const menu = source("routes/menu.lazy.tsx");
	const paymentModal = source("components/pos/payment-modal.tsx");
	expect(menu).toContain("enabled: !panel && !isSearchFocused");
	expect(paymentModal).toContain("Dynamic Mayar QRIS is not offered in POS");
});
