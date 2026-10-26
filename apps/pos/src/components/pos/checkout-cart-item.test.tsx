import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutCartItem } from "./checkout-cart-item";

describe("checkout cart item", () => {
	it("shows the product image and compact quantity controls", () => {
		const html = renderToStaticMarkup(
			<CheckoutCartItem
				item={{
					productId: "coffee-1",
					name: "Tentrem Koffie Premium",
					price: 30000,
					quantity: 1,
					image: "https://supabase.yumme.id/storage/v1/object/public/app-assets/migrated/products/coffee.jpg",
				}}
				onQuantityChange={() => {}}
				onPriceChange={() => {}}
			/>,
		);

		expect(html).toContain('alt="Tentrem Koffie Premium"');
		expect(html).toContain("https://supabase.djiwatentram.web.id/storage/v1/object/public/app-assets/migrated/products/coffee.jpg");
		expect(html).toContain("coffee.jpg");
		expect(html).toContain("h-11 w-11");
		expect(html).toContain("h-7 w-7");
	});
});
