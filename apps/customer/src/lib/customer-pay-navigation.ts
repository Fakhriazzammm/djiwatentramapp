import { buildDjiwaPayUrl } from "@yumipos/djiwapay-core";

export function getCustomerPayPath(username: string): string {
	return buildDjiwaPayUrl({ context: "customer", username });
}
