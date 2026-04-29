export type EmployeePersonalData = {
	fullName: string;
	email?: string;
	phone: string;
	identityNumber?: string;
	address?: string;
	birthDate?: string;
	emergencyContactName?: string;
	emergencyContactPhone?: string;
};

export type EmployeeEmploymentData = {
	roleId: string;
	roleName: string;
	startDate: string;
	employmentType: "full_time" | "part_time" | "freelance" | "probation";
	monthlySalary?: number;
	dailyAllowance?: number;
	shiftRate?: number;
	location?: string;
	username: string;
	slug: string;
	homePin?: string;
};

export type EmployeeContractClause = {
	title: string;
	body: string;
};

export type EmployeeContractDraft = {
	mode: "template" | "ai" | "custom";
	title: string;
	plainText: string;
	html?: string;
	aiPrompt?: string;
	clauses: EmployeeContractClause[];
};

export type EmployeeOnboardingDraft = {
	personal: EmployeePersonalData;
	employment: EmployeeEmploymentData;
	contract: EmployeeContractDraft;
	signatureDataUrl?: string;
	agreements: {
		dataIsTrue: boolean;
		contractApproved: boolean;
	};
};

export type EmployeeOnboardingApplicationPayload = {
	status: "pending";
	full_name: string;
	email: string | null;
	phone: string;
	identity_number: string | null;
	address: string | null;
	birth_date: string | null;
	emergency_contact: {
		name: string | null;
		phone: string | null;
	};
	employment: Omit<EmployeeEmploymentData, "homePin"> & {
		homePinProvided: boolean;
	};
	contract: EmployeeContractDraft & {
		templateVersion: number;
		generatedAt: string;
	};
	signature_url: string | null;
	contract_pdf_url: string | null;
	attachments: Record<string, unknown>;
	raw: Record<string, unknown>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOME_PIN_REGEX = /^\d{6}$/;

function cleanText(value: unknown) {
	return String(value ?? "").trim();
}

function cleanOptional(value: unknown) {
	const text = cleanText(value);
	return text || null;
}

export function createEmployeeSlug(name: string) {
	const slug = cleanText(name)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
	return slug || "karyawan-baru";
}

export function validateEmployeeOnboardingDraft(draft: EmployeeOnboardingDraft):
	| { success: true; errors: [] }
	| { success: false; errors: string[] } {
	const errors: string[] = [];
	const personal = draft.personal ?? ({} as EmployeePersonalData);
	const employment = draft.employment ?? ({} as EmployeeEmploymentData);
	const contract = draft.contract ?? ({} as EmployeeContractDraft);

	if (!cleanText(personal.fullName)) errors.push("Nama lengkap wajib diisi");
	if (!cleanText(personal.phone)) errors.push("Nomor HP wajib diisi");
	if (personal.email && !EMAIL_REGEX.test(cleanText(personal.email))) {
		errors.push("Email tidak valid");
	}
	if (personal.identityNumber && !/^\d{8,20}$/.test(cleanText(personal.identityNumber))) {
		errors.push("NIK/nomor identitas harus angka minimal 8 digit");
	}
	if (!cleanText(employment.roleId)) errors.push("Jabatan wajib dipilih");
	if (!cleanText(employment.startDate)) errors.push("Tanggal mulai kerja wajib diisi");
	if (!cleanText(employment.username)) errors.push("Username wajib diisi");
	if (employment.homePin && !HOME_PIN_REGEX.test(cleanText(employment.homePin))) {
		errors.push("PIN harus 6 digit angka");
	}
	if (!cleanText(contract.plainText) && (!contract.clauses || contract.clauses.length === 0)) {
		errors.push("Kontrak kerja wajib diisi");
	}
	if (!cleanText(draft.signatureDataUrl)) errors.push("Tanda tangan wajib diisi");
	if (!draft.agreements?.dataIsTrue) {
		errors.push("Persetujuan kebenaran data wajib dicentang");
	}
	if (!draft.agreements?.contractApproved) {
		errors.push("Persetujuan kontrak kerja wajib dicentang");
	}

	return errors.length ? { success: false, errors } : { success: true, errors: [] };
}

export function buildEmployeeOnboardingPayload(
	draft: EmployeeOnboardingDraft,
	files?: { signatureUrl?: string | null; contractPdfUrl?: string | null }
): EmployeeOnboardingApplicationPayload {
	const personal = draft.personal;
	const employment = draft.employment;
	const { homePin: _homePin, ...safeEmployment } = employment;

	return {
		status: "pending",
		full_name: cleanText(personal.fullName),
		email: cleanOptional(personal.email),
		phone: cleanText(personal.phone),
		identity_number: cleanOptional(personal.identityNumber),
		address: cleanOptional(personal.address),
		birth_date: cleanOptional(personal.birthDate),
		emergency_contact: {
			name: cleanOptional(personal.emergencyContactName),
			phone: cleanOptional(personal.emergencyContactPhone),
		},
		employment: {
			...safeEmployment,
			username: cleanText(safeEmployment.username).toLowerCase(),
			slug: cleanText(safeEmployment.slug) || createEmployeeSlug(personal.fullName),
			homePinProvided: Boolean(cleanText(employment.homePin)),
		},
		contract: {
			...draft.contract,
			templateVersion: 1,
			generatedAt: new Date().toISOString(),
		},
		signature_url: files?.signatureUrl ?? null,
		contract_pdf_url: files?.contractPdfUrl ?? null,
		attachments: {},
		raw: {
			source: "public_register",
			agreements: draft.agreements,
		},
	};
}

function formatMoney(value?: number) {
	const amount = Number(value ?? 0);
	if (!Number.isFinite(amount) || amount <= 0) return "-";
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(amount);
}

function employmentTypeLabel(type: EmployeeEmploymentData["employmentType"]) {
	const labels: Record<EmployeeEmploymentData["employmentType"], string> = {
		full_time: "Penuh Waktu",
		part_time: "Paruh Waktu",
		freelance: "Freelance",
		probation: "Masa Percobaan",
	};
	return labels[type] ?? type;
}

export function buildEmployeeContractTemplate(
	personal: EmployeePersonalData,
	employment: EmployeeEmploymentData
): EmployeeContractDraft {
	const companyName = "Djiwa Tentram Cafe & Resto";
	const employeeName = cleanText(personal.fullName) || "Karyawan";
	const roleName = cleanText(employment.roleName) || "Team";
	const startDate = cleanText(employment.startDate) || "tanggal yang disepakati";
	const location = cleanText(employment.location) || "Djiwa Tentram";
	const clauses: EmployeeContractClause[] = [
		{
			title: "Pasal 1 — Para Pihak",
			body: `${companyName} sebagai pihak perusahaan dan ${employeeName} sebagai karyawan menyepakati hubungan kerja sesuai ketentuan dalam kontrak ini.`,
		},
		{
			title: "Pasal 2 — Jabatan dan Lokasi Kerja",
			body: `Karyawan ditempatkan sebagai ${roleName} di ${location} atau lokasi lain yang ditetapkan perusahaan sesuai kebutuhan operasional.`,
		},
		{
			title: "Pasal 3 — Mulai Kerja dan Status",
			body: `Hubungan kerja dimulai pada ${startDate} dengan status ${employmentTypeLabel(employment.employmentType)}. Evaluasi kinerja dapat dilakukan secara berkala oleh perusahaan.`,
		},
		{
			title: "Pasal 4 — Kompensasi",
			body: `Kompensasi yang disepakati meliputi gaji bulanan ${formatMoney(employment.monthlySalary)}, uang harian ${formatMoney(employment.dailyAllowance)}, dan/atau rate shift ${formatMoney(employment.shiftRate)} sesuai jadwal dan kebijakan perusahaan.`,
		},
		{
			title: "Pasal 5 — Kewajiban Karyawan",
			body: "Karyawan wajib hadir tepat waktu, menjaga kebersihan, melayani pelanggan dengan baik, menjaga kerahasiaan data usaha, dan mematuhi SOP yang berlaku.",
		},
		{
			title: "Pasal 6 — Penutup",
			body: "Kontrak ini berlaku setelah ditandatangani secara digital oleh karyawan dan disetujui oleh admin/perwakilan perusahaan.",
		},
	];
	const plainText = [`PERJANJIAN KERJA ${companyName.toUpperCase()}`, "", ...clauses.flatMap((clause) => [clause.title, clause.body, ""])].join("\n");
	const html = `<article>${clauses
		.map(
			(clause) =>
				`<section><h3>${clause.title}</h3><p>${clause.body}</p></section>`
		)
		.join("")}</article>`;

	return {
		mode: "template",
		title: `Perjanjian Kerja ${roleName}`,
		plainText,
		html,
		clauses,
	};
}

export function clausesToPlainText(title: string, clauses: EmployeeContractClause[]) {
	return [title, "", ...clauses.flatMap((clause) => [clause.title, clause.body, ""])].join("\n");
}
