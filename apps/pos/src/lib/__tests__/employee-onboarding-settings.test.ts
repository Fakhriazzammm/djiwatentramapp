import { describe, expect, it } from "vitest";
import {
	DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS,
	applyOnboardingDefaultsToDraft,
	formatOnboardingCurrency,
	generateSixDigitPin,
	normalizeEmployeeOnboardingSettings,
	validateDraftForSettings,
} from "../employee-onboarding-settings";
import type { EmployeeOnboardingDraft } from "../employee-onboarding-schema";

const baseDraft: EmployeeOnboardingDraft = {
	personal: { fullName: "Fakhri Azzam", phone: "0812" },
	employment: {
		roleId: "",
		roleName: "",
		startDate: "2026-05-01",
		employmentType: "probation",
		location: "",
		username: "",
		slug: "",
		homePin: "",
	},
	contract: { mode: "template", title: "Kontrak", plainText: "Isi", clauses: [] },
	signatureDataUrl: "data:image/png;base64,abc",
	agreements: { dataIsTrue: true, contractApproved: true },
};

describe("employee onboarding settings", () => {
	it("normalizes legacy minimal settings", () => {
		const settings = normalizeEmployeeOnboardingSettings({ registrationEnabled: false, defaultPassword: "secret" });
		expect(settings.registrationEnabled).toBe(false);
		expect(settings.defaultPassword).toBe("secret");
		expect(settings.registrationMode).toBe("public");
		expect(settings.fields.fullName.required).toBe(true);
		expect(settings.steps.map((step) => step.id)).toContain("documents");
	});

	it("prefills role salary and generated account fields", () => {
		const settings = normalizeEmployeeOnboardingSettings({ defaultRoleId: "barista", autoGenerate: { pin: true } });
		const draft = applyOnboardingDefaultsToDraft(baseDraft, settings, [
			{ _id: "barista", name: "Barista", monthlyFixedSalary: 2500000, dailyAllowance: 25000, baseShiftRate: 100000 },
		]);
		expect(draft.employment.roleId).toBe("barista");
		expect(draft.employment.roleName).toBe("Barista");
		expect(draft.employment.monthlySalary).toBe(2500000);
		expect(draft.employment.dailyAllowance).toBe(25000);
		expect(draft.employment.shiftRate).toBe(100000);
		expect(draft.employment.username).toBe("fakhri-azzam");
		expect(draft.employment.homePin).toMatch(/^\d{6}$/);
	});

	it("validates required fields from settings", () => {
		const settings = normalizeEmployeeOnboardingSettings({ fields: { email: { visible: true, required: true } } });
		const errors = validateDraftForSettings(baseDraft, settings);
		expect(errors).toContain("Email wajib diisi");
	});

	it("formats currency and pin helpers", () => {
		expect(formatOnboardingCurrency(40000)).toContain("40.000");
		expect(generateSixDigitPin("abc")).toMatch(/^\d{6}$/);
		expect(DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS.pipeline.defaultStatus).toBe("submitted");
	});
});
