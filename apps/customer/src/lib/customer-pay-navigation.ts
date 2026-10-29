import { buildDjiwaPayBridgeUrl } from "@yumipos/djiwapay-core";

// Djiwa Pay is served from djiwapay.web.id, a different registrable domain than
// the customer app. Open it through the auth bridge so the existing
// .djiwatentram.web.id session is exchanged for a Pay ticket instead of
// landing on the Pay login screen.
export function getCustomerPayPath(username: string, returnTo?: string): string {
	return buildDjiwaPayBridgeUrl({ context: "customer", username, returnTo });
}
