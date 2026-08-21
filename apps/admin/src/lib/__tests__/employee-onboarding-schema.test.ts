import { describe, expect, it } from "bun:test";
import {
	buildEmployeeContractTemplate,
	buildEmployeeOnboardingPayload,
	createEmployeeSlug,
	validateEmployeeOnboardingDraft,
	type EmployeeOnboardingDraft,
} from "../employee-onboarding-schema";

const validDraft: EmployeeOnboardingDraft = {
	personal: {
		fullName: "Fakhri Azzam",
		email: "fakhri@example.com",
		phone: "081234567890",
		identityNumber: "3273010101010001",
		address: "Jl. Tentram No. 1",
		birthDate: "1998-10-31",
		emergencyContactName: "Selina",
		emergencyContactPhone: "081111111111",
	},
	employment: {
		roleId: "role_barista",
		roleName: "Barista",
		startDate: "2026-05-01",
		employmentType: "probation",
		monthlySalary: 2500000,
		dailyAllowance: 25000,
		shiftRate: 100000,
		location: "Djiwa Tentram Centrik",
		username: "fakhri",
		slug: "fakhri-azzam",
		homePin: "311098",
	},
	contract: {
		mode: "template",
		title: "Perjanjian Kerja Barista",
		plainText: "Isi kontrak kerja",
		clauses: [{ title: "Pasal 1", body: "Karyawan bekerja sebagai Barista." }],
	},
	signatureDataUrl: "data:image/png;base64,abc123",
	agreements: {
		dataIsTrue: true,
		contractApproved: true,
	},
};

describe("employee onboarding schema", () => {
	it("creates stable slug from Indonesian names", () => {
		expect(createEmployeeSlug("Fakhri Azzam!!!")).toBe("fakhri-azzam");
		expect(createEmployeeSlug("  Selina   Djiwa  ")).toBe("selina-djiwa");
	});

	it("rejects invalid draft before submit", () => {
		const result = validateEmployeeOnboardingDraft({
			...validDraft,
			personal: { ...validDraft.personal, fullName: "", phone: "" },
			employment: { ...validDraft.employment, homePin: "123" },
			agreements: { dataIsTrue: false, contractApproved: true },
		});

		expect(result.success).toBe(false);
		expect(result.errors).toContain("Nama lengkap wajib diisi");
		expect(result.errors).toContain("Nomor HP wajib diisi");
		expect(result.errors).toContain("PIN harus 6 digit angka");
		expect(result.errors).toContain("Persetujuan kebenaran data wajib dicentang");
	});

	it("builds application payload without leaking raw PIN", () => {
		const result = validateEmployeeOnboardingDraft(validDraft);
		expect(result.success).toBe(true);

		const payload = buildEmployeeOnboardingPayload(validDraft, {
			signatureUrl: "https://example.com/signature.png",
			contractPdfUrl: "https://example.com/contract.pdf",
		});

		expect(payload.full_name).toBe("Fakhri Azzam");
		expect(payload.phone).toBe("081234567890");
		expect(payload.status).toBe("pending");
		expect(payload.employment.roleId).toBe("role_barista");
		expect("homePin" in payload.employment).toBe(false);
		expect(payload.employment.homePinProvided).toBe(true);
		expect(JSON.stringify(payload).includes("311098")).toBe(false);
	});

	it("builds readable Indonesian contract template", () => {
		const contract = buildEmployeeContractTemplate(validDraft.personal, validDraft.employment, "Djiwa Tentram Centrik");

		expect(contract.title).toContain("Perjanjian Kerja");
		expect(contract.plainText).toContain("Fakhri Azzam");
		expect(contract.plainText).toContain("Barista");
		expect(contract.clauses.length >= 5).toBe(true);
	});
});
