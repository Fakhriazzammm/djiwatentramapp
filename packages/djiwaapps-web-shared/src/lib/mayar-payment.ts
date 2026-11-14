export function normalizeMayarInvoice(value: unknown) {
	const record = (input: unknown): Record<string, unknown> =>
		input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
	const root = record(value);
	const data = record(root.data);
	if (root.success === false || Number(root.statusCode ?? 200) >= 400) {
		throw new Error("Gagal menyiapkan pembayaran Mayar. Silakan coba lagi.");
	}
	let link: string | undefined;
	for (const candidate of [data, root]) {
		for (const key of ["paymentUrl", "payment_url", "paymentLink", "payment_link", "link", "url", "checkoutUrl", "checkout_url", "invoiceUrl"]) {
			const value = candidate[key];
			if (typeof value !== "string") continue;
			try {
				const url = new URL(value.trim());
				if (url.protocol === "https:" && !url.username && !url.password) { link = url.href; break; }
			} catch { /* Try the next alias. */ }
		}
		if (link) break;
	}
	if (!link) throw new Error("Mayar belum mengembalikan link pembayaran. Silakan coba lagi.");
	const fields = { ...root, ...data };
	return {
		statusCode: 200,
		data: {
			id: typeof fields.id === "string" ? fields.id : undefined,
			transactionId: typeof fields.transactionId === "string" ? fields.transactionId : undefined,
			link,
		},
	};
}
