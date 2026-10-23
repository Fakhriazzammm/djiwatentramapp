import { describe, expect, it } from "bun:test";
import {
	getKasirLoginErrorMessage,
	isRetryableKasirLoginError,
	normalizeKasirSearch,
} from "./kasir-login-utils";

describe("kasir login utils", () => {
	it("normalizes search input without changing its meaning", () => {
		expect(normalizeKasirSearch("  Budi   ")).toBe("Budi");
		expect(normalizeKasirSearch("   ")).toBe("");
	});

	it("recognizes network and rate-limit failures as retryable", () => {
		expect(isRetryableKasirLoginError({ status: 429 })).toBe(true);
		expect(isRetryableKasirLoginError({ status: 503 })).toBe(true);
		expect(isRetryableKasirLoginError(new Error("Failed to fetch"))).toBe(true);
		expect(isRetryableKasirLoginError(new Error("PIN salah"))).toBe(false);
	});

	it("returns actionable copy without exposing server internals", () => {
		expect(getKasirLoginErrorMessage({ status: 429 })).toContain("Terlalu banyak");
		expect(getKasirLoginErrorMessage({ status: 503 })).toContain("koneksi");
		expect(getKasirLoginErrorMessage(new Error("PIN salah"))).toBe(
		"PIN salah. Periksa kembali 6 digit PIN kamu.",
	);
	});
});
