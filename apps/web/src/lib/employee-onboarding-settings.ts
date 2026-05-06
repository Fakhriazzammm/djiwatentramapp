import { createEmployeeSlug, type EmployeeEmploymentData, type EmployeeOnboardingDraft } from "./employee-onboarding-schema";

export type EmployeeOnboardingFieldKey =
	| "fullName"
	| "phone"
	| "email"
	| "identityNumber"
	| "birthDate"
	| "address"
	| "emergencyContactName"
	| "emergencyContactPhone"
	| "roleId"
	| "startDate"
	| "employmentType"
	| "location"
	| "salary"
	| "homePin"
	| "username"
	| "slug"
	| "contract"
	| "documents"
	| "signature";

export type EmployeeOnboardingStepId = "personal" | "employment" | "contract" | "documents" | "signature";

export type EmployeeOnboardingFieldSetting = {
	visible: boolean;
	required: boolean;
};

export type EmployeeOnboardingStepSetting = {
	id: EmployeeOnboardingStepId;
	enabled: boolean;
	title: string;
	description: string;
};

export type EmployeeOnboardingDocumentSetting = {
	id: string;
	label: string;
	enabled: boolean;
	required: boolean;
	requiredBeforeApproval?: boolean;
	acceptedTypes: string[];
};

export type EmployeeOnboardingSettings = {
	registrationEnabled: boolean;
	registrationMode: "public" | "internal" | "invite_only";
	inviteCode: string;
	closedMessage: string;
	companyName: string;
	companySignatureUrl: string;
	defaultPassword: string;
	defaultRoleId: string;
	defaultEmploymentType: EmployeeEmploymentData["employmentType"];
	defaultLocation: string;
	prefillSalaryFromRole: boolean;
	salaryPreview: {
		enabled: boolean;
		candidateVisibility: "hidden" | "summary" | "detail";
		behavior: "readonly" | "editable";
	};
	fields: Record<EmployeeOnboardingFieldKey, EmployeeOnboardingFieldSetting>;
	steps: EmployeeOnboardingStepSetting[];
	autoGenerate: {
		username: boolean;
		slug: boolean;
		pin: boolean;
		allowEditInProfile: boolean;
	};
	pipeline: {
		enabled: boolean;
		statuses: string[];
		defaultStatus: string;
	};
	documentChecklist: EmployeeOnboardingDocumentSetting[];
	documentUploads: EmployeeOnboardingDocumentSetting[];
	contractTemplatesByRoleId: Record<string, string>;
	probation: {
		enabled: boolean;
		defaultMonths: number;
		autoSetEndDate: boolean;
	};
	approvalPreview: {
		enabled: boolean;
		requireConfirmation: boolean;
	};
};

const fieldDefaults: Record<EmployeeOnboardingFieldKey, EmployeeOnboardingFieldSetting> = {
	fullName: { visible: true, required: true },
	phone: { visible: true, required: true },
	email: { visible: true, required: false },
	identityNumber: { visible: true, required: false },
	birthDate: { visible: true, required: false },
	address: { visible: true, required: false },
	emergencyContactName: { visible: true, required: false },
	emergencyContactPhone: { visible: true, required: false },
	roleId: { visible: true, required: true },
	startDate: { visible: true, required: true },
	employmentType: { visible: true, required: true },
	location: { visible: true, required: false },
	salary: { visible: true, required: false },
	homePin: { visible: true, required: false },
	username: { visible: true, required: true },
	slug: { visible: true, required: false },
	contract: { visible: true, required: true },
	documents: { visible: true, required: false },
	signature: { visible: true, required: true },
};

export const DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS: EmployeeOnboardingSettings = {
	registrationEnabled: true,
	registrationMode: "public",
	inviteCode: "",
	closedMessage: "Saat ini pendaftaran karyawan baru sedang tidak dibuka. Silakan hubungi admin untuk informasi lebih lanjut.",
	companyName: "Djiwa Tentram Cafe & Resto",
	companySignatureUrl: "",
	defaultPassword: "djiwatentram123",
	defaultRoleId: "",
	defaultEmploymentType: "probation",
	defaultLocation: "Djiwa Tentram",
	prefillSalaryFromRole: true,
	salaryPreview: {
		enabled: true,
		candidateVisibility: "summary",
		behavior: "readonly",
	},
	fields: fieldDefaults,
	steps: [
		{ id: "personal", enabled: true, title: "Data Diri", description: "Identitas dasar dan kontak kandidat" },
		{ id: "employment", enabled: true, title: "Data Kerja", description: "Role, tanggal mulai, lokasi, dan gaji" },
		{ id: "contract", enabled: true, title: "Kontrak", description: "Preview template kontrak kerja" },
		{ id: "documents", enabled: true, title: "Dokumen", description: "Checklist dan upload dokumen pendukung" },
		{ id: "signature", enabled: true, title: "Tanda Tangan", description: "Persetujuan akhir dan tanda tangan digital" },
	],
	autoGenerate: {
		username: true,
		slug: true,
		pin: true,
		allowEditInProfile: true,
	},
	pipeline: {
		enabled: true,
		statuses: ["submitted", "screening", "interview", "trial", "approved", "rejected", "archived"],
		defaultStatus: "submitted",
	},
	documentChecklist: [
		{ id: "ktp", label: "KTP / identitas", enabled: true, required: true, requiredBeforeApproval: true, acceptedTypes: ["image/*", "application/pdf"] },
		{ id: "photo", label: "Pas foto", enabled: true, required: false, requiredBeforeApproval: false, acceptedTypes: ["image/*"] },
		{ id: "cv", label: "CV / riwayat kerja", enabled: true, required: false, requiredBeforeApproval: false, acceptedTypes: ["application/pdf", "image/*"] },
	],
	documentUploads: [
		{ id: "ktp", label: "Upload KTP", enabled: true, required: true, requiredBeforeApproval: true, acceptedTypes: ["image/*", "application/pdf"] },
		{ id: "photo", label: "Upload pas foto", enabled: true, required: false, requiredBeforeApproval: false, acceptedTypes: ["image/*"] },
		{ id: "cv", label: "Upload CV", enabled: true, required: false, requiredBeforeApproval: false, acceptedTypes: ["application/pdf", "image/*"] },
	],
	contractTemplatesByRoleId: {},
	probation: {
		enabled: true,
		defaultMonths: 3,
		autoSetEndDate: true,
	},
	approvalPreview: {
		enabled: true,
		requireConfirmation: true,
	},
};

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown, fallback = "") {
	const text = String(value ?? "").trim();
	return text || fallback;
}

function cleanNumber(value: unknown, fallback: number) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function mergeFields(value: unknown) {
	const source = isObject(value) ? value : {};
	return (Object.keys(fieldDefaults) as EmployeeOnboardingFieldKey[]).reduce(
		(acc, key) => {
			const raw = source[key];
			const existing = isObject(raw) ? raw : {};
			acc[key] = {
				visible: typeof existing.visible === "boolean" ? existing.visible : fieldDefaults[key].visible,
				required: typeof existing.required === "boolean" ? existing.required : fieldDefaults[key].required,
			};
			return acc;
		},
		{} as Record<EmployeeOnboardingFieldKey, EmployeeOnboardingFieldSetting>
	);
}

function mergeSteps(value: unknown) {
	const source = Array.isArray(value) ? value : [];
	return DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS.steps.map((fallbackStep) => {
		const existing = source.find((item) => isObject(item) && item.id === fallbackStep.id) as Record<string, unknown> | undefined;
		return {
			id: fallbackStep.id,
			enabled: typeof existing?.enabled === "boolean" ? existing.enabled : fallbackStep.enabled,
			title: cleanString(existing?.title, fallbackStep.title),
			description: cleanString(existing?.description, fallbackStep.description),
		};
	});
}

function mergeDocuments(value: unknown, fallback: EmployeeOnboardingDocumentSetting[]) {
	const source = Array.isArray(value) ? value : [];
	const merged = fallback.map((doc) => {
		const existing = source.find((item) => isObject(item) && item.id === doc.id) as Record<string, unknown> | undefined;
		return {
			...doc,
			label: cleanString(existing?.label, doc.label),
			enabled: typeof existing?.enabled === "boolean" ? existing.enabled : doc.enabled,
			required: typeof existing?.required === "boolean" ? existing.required : doc.required,
			requiredBeforeApproval: typeof existing?.requiredBeforeApproval === "boolean" ? existing.requiredBeforeApproval : doc.requiredBeforeApproval,
			acceptedTypes: Array.isArray(existing?.acceptedTypes) ? existing.acceptedTypes.map(String) : doc.acceptedTypes,
		};
	});
	const custom = source
		.filter((item): item is Record<string, unknown> => isObject(item) && !fallback.some((doc) => doc.id === item.id))
		.map((item) => ({
			id: cleanString(item.id, `doc-${Date.now()}`),
			label: cleanString(item.label, "Dokumen tambahan"),
			enabled: item.enabled !== false,
			required: item.required === true,
			requiredBeforeApproval: item.requiredBeforeApproval === true,
			acceptedTypes: Array.isArray(item.acceptedTypes) ? item.acceptedTypes.map(String) : ["image/*", "application/pdf"],
		}));
	return [...merged, ...custom];
}

export function normalizeEmployeeOnboardingSettings(value: unknown): EmployeeOnboardingSettings {
	const source = isObject(value) ? value : {};
	const defaults = DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS;
	const mode = ["public", "internal", "invite_only"].includes(String(source.registrationMode)) ? String(source.registrationMode) : defaults.registrationMode;
	const employmentType = ["probation", "full_time", "part_time", "freelance"].includes(String(source.defaultEmploymentType))
		? String(source.defaultEmploymentType)
		: defaults.defaultEmploymentType;
	const salaryPreview = isObject(source.salaryPreview) ? source.salaryPreview : {};
	const autoGenerate = isObject(source.autoGenerate) ? source.autoGenerate : {};
	const pipeline = isObject(source.pipeline) ? source.pipeline : {};
	const probation = isObject(source.probation) ? source.probation : {};
	const approvalPreview = isObject(source.approvalPreview) ? source.approvalPreview : {};
	return {
		registrationEnabled: source.registrationEnabled !== false,
		registrationMode: mode as EmployeeOnboardingSettings["registrationMode"],
		inviteCode: cleanString(source.inviteCode),
		closedMessage: cleanString(source.closedMessage, defaults.closedMessage),
		companyName: cleanString(source.companyName, defaults.companyName),
		companySignatureUrl: cleanString(source.companySignatureUrl),
		defaultPassword: cleanString(source.defaultPassword, defaults.defaultPassword),
		defaultRoleId: cleanString(source.defaultRoleId),
		defaultEmploymentType: employmentType as EmployeeEmploymentData["employmentType"],
		defaultLocation: cleanString(source.defaultLocation, defaults.defaultLocation),
		prefillSalaryFromRole: source.prefillSalaryFromRole !== false,
		salaryPreview: {
			enabled: salaryPreview.enabled !== false,
			candidateVisibility: ["hidden", "summary", "detail"].includes(String(salaryPreview.candidateVisibility))
				? (salaryPreview.candidateVisibility as EmployeeOnboardingSettings["salaryPreview"]["candidateVisibility"])
				: defaults.salaryPreview.candidateVisibility,
			behavior: salaryPreview.behavior === "editable" ? "editable" : defaults.salaryPreview.behavior,
		},
		fields: mergeFields(source.fields),
		steps: mergeSteps(source.steps),
		autoGenerate: {
			username: autoGenerate.username !== false,
			slug: autoGenerate.slug !== false,
			pin: autoGenerate.pin === true,
			allowEditInProfile: autoGenerate.allowEditInProfile !== false,
		},
		pipeline: {
			enabled: pipeline.enabled !== false,
			statuses: Array.isArray(pipeline.statuses) && pipeline.statuses.length ? pipeline.statuses.map(String) : defaults.pipeline.statuses,
			defaultStatus: cleanString(pipeline.defaultStatus, defaults.pipeline.defaultStatus),
		},
		documentChecklist: mergeDocuments(source.documentChecklist, defaults.documentChecklist),
		documentUploads: mergeDocuments(source.documentUploads, defaults.documentUploads),
		contractTemplatesByRoleId: isObject(source.contractTemplatesByRoleId)
			? Object.fromEntries(Object.entries(source.contractTemplatesByRoleId).map(([key, text]) => [key, String(text ?? "")]))
			: {},
		probation: {
			enabled: probation.enabled !== false,
			defaultMonths: cleanNumber(probation.defaultMonths, defaults.probation.defaultMonths),
			autoSetEndDate: probation.autoSetEndDate !== false,
		},
		approvalPreview: {
			enabled: approvalPreview.enabled !== false,
			requireConfirmation: approvalPreview.requireConfirmation !== false,
		},
	};
}

export function getEnabledOnboardingSteps(settings: EmployeeOnboardingSettings) {
	return settings.steps.filter((step) => step.enabled);
}

export function isOnboardingFieldVisible(settings: EmployeeOnboardingSettings, key: EmployeeOnboardingFieldKey) {
	return settings.fields[key]?.visible !== false;
}

export function isOnboardingFieldRequired(settings: EmployeeOnboardingSettings, key: EmployeeOnboardingFieldKey) {
	return settings.fields[key]?.visible !== false && settings.fields[key]?.required === true;
}

export function formatOnboardingCurrency(value?: number) {
	const amount = Number(value ?? 0);
	if (!Number.isFinite(amount) || amount <= 0) return "-";
	return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export function getRoleSalaryDefaults(role: unknown) {
	const data = isObject(role) ? role : {};
	return {
		monthlySalary: cleanNumber(data.monthlyFixedSalary, 0),
		dailyAllowance: cleanNumber(data.dailyAllowance, 0),
		shiftRate: cleanNumber(data.baseShiftRate, cleanNumber(data.baseHourlyRate, 0)),
	};
}

export function generateSixDigitPin(seed?: string) {
	let value = 0;
	for (const char of String(seed || Date.now())) value = (value * 31 + char.charCodeAt(0)) % 1000000;
	if (!value) value = Math.floor(100000 + Math.random() * 900000);
	return String(value).padStart(6, "0").slice(0, 6);
}

export function applyOnboardingDefaultsToDraft(
	draft: EmployeeOnboardingDraft,
	settings: EmployeeOnboardingSettings,
	roles: any[] = []
): EmployeeOnboardingDraft {
	const role = roles.find((item) => item?._id === (draft.employment.roleId || settings.defaultRoleId));
	const roleId = draft.employment.roleId || settings.defaultRoleId || role?._id || "";
	const roleName = draft.employment.roleName || role?.name || "";
	const salary = settings.prefillSalaryFromRole && role ? getRoleSalaryDefaults(role) : {};
	const slug = draft.personal.fullName ? createEmployeeSlug(draft.personal.fullName) : "";
	return {
		...draft,
		employment: {
			...draft.employment,
			roleId,
			roleName,
			employmentType: draft.employment.employmentType || settings.defaultEmploymentType,
			location: draft.employment.location || settings.defaultLocation,
			monthlySalary: draft.employment.monthlySalary || salary.monthlySalary || 0,
			dailyAllowance: draft.employment.dailyAllowance || salary.dailyAllowance || 0,
			shiftRate: draft.employment.shiftRate || salary.shiftRate || 0,
			username: draft.employment.username || (settings.autoGenerate.username ? slug : ""),
			slug: draft.employment.slug || (settings.autoGenerate.slug ? slug : ""),
			homePin: draft.employment.homePin || (settings.autoGenerate.pin ? generateSixDigitPin(draft.personal.fullName) : ""),
		},
	};
}

export function validateDraftForSettings(draft: EmployeeOnboardingDraft, settings: EmployeeOnboardingSettings) {
	const errors: string[] = [];
	const required = (key: EmployeeOnboardingFieldKey, value: unknown, label: string) => {
		if (isOnboardingFieldRequired(settings, key) && !String(value ?? "").trim()) errors.push(`${label} wajib diisi`);
	};
	required("fullName", draft.personal.fullName, "Nama lengkap");
	required("phone", draft.personal.phone, "Nomor HP");
	required("email", draft.personal.email, "Email");
	required("identityNumber", draft.personal.identityNumber, "NIK / identitas");
	required("birthDate", draft.personal.birthDate, "Tanggal lahir");
	required("address", draft.personal.address, "Alamat");
	required("emergencyContactName", draft.personal.emergencyContactName, "Kontak darurat");
	required("emergencyContactPhone", draft.personal.emergencyContactPhone, "Nomor kontak darurat");
	required("roleId", draft.employment.roleId, "Jabatan");
	required("startDate", draft.employment.startDate, "Tanggal mulai");
	required("employmentType", draft.employment.employmentType, "Tipe kerja");
	required("location", draft.employment.location, "Lokasi");
	required("homePin", draft.employment.homePin, "PIN");
	required("username", draft.employment.username, "Username");
	required("slug", draft.employment.slug, "Slug");
	if (isOnboardingFieldRequired(settings, "contract") && !draft.contract.plainText && draft.contract.clauses.length === 0) errors.push("Kontrak kerja wajib dibuat");
	if (isOnboardingFieldRequired(settings, "signature") && !draft.signatureDataUrl) errors.push("Tanda tangan wajib diisi");
	return errors;
}

export function calculateProbationEndDate(startDate: string, months: number): string | null {
	if (!startDate || !months || months <= 0) return null;
	try {
		const d = new Date(startDate);
		if (isNaN(d.getTime())) return null;
		d.setMonth(d.getMonth() + months);
		return d.toISOString().slice(0, 10);
	} catch { return null; }
}
