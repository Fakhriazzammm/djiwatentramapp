type LoginErrorLike = {
	status?: number;
	message?: string;
};

export function getKasirLoginSuccessRoute() {
	return "/admin" as const;
}

function asLoginError(error: unknown): LoginErrorLike {
	if (error instanceof Error) return { message: error.message };
	if (typeof error === "object" && error !== null) {
		const candidate = error as LoginErrorLike;
		return { status: candidate.status, message: candidate.message };
	}
	return {};
}

export function normalizeKasirSearch(value: string) {
	return value.trim().replace(/\s+/g, " ");
}

export function isRetryableKasirLoginError(error: unknown) {
	const { status, message = "" } = asLoginError(error);
	const normalized = message.toLowerCase();
	return (
		status === 408 ||
		status === 429 ||
		(status !== undefined && status >= 500) ||
		normalized.includes("failed to fetch") ||
		normalized.includes("network") ||
		normalized.includes("timeout")
	);
}

export function getKasirLoginErrorMessage(error: unknown) {
	const { status, message = "" } = asLoginError(error);
	const normalized = message.toLowerCase();

	if (status === 429 || normalized.includes("too many") || normalized.includes("rate limit")) {
		return "Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.";
	}

	if (isRetryableKasirLoginError(error)) {
		return "Koneksi ke server bermasalah. Periksa koneksi terminal, lalu coba lagi.";
	}

	if (normalized.includes("pin") || normalized.includes("credential") || normalized.includes("unauthorized")) {
		return "PIN salah. Periksa kembali 6 digit PIN kamu.";
	}

	return "Login gagal. Periksa PIN kamu atau hubungi admin outlet.";
}
