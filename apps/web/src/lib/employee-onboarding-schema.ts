export type EmployeePersonalData = {
	fullName: string;
	email?: string;
	phone: string;
	identityNumber?: string;
	address?: string;
	birthDate?: string;
	placeOfBirth?: string;
	religion?: string;
	maritalStatus?: string;
	emergencyContactName?: string;
	emergencyContactPhone?: string;
	bankName?: string;
	bankAccount?: string;
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
	password?: string;
	contractDuration?: number;
	/** Selected by candidate: 6, 12, or 24 months for probation type; fixed 1 for others */
	probationDurationMonths?: 1 | 6 | 12 | 24;
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
	cvUrl?: string;
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
	birth_place: string | null;
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
	cv_url: string | null;
	registration_number: string | null;
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

	if (!cleanText(personal.fullName)) errors.push("Nama lengkap wajib diisi");
	if (!cleanText(personal.phone)) errors.push("Nomor HP wajib diisi");
	if (personal.email && !EMAIL_REGEX.test(cleanText(personal.email))) {
		errors.push("Email tidak valid");
	}
	if (personal.identityNumber && !/^\d{16}$/.test(cleanText(personal.identityNumber))) {
		errors.push("NIK/nomor identitas harus 16 digit angka");
	}
	if (!cleanText(employment.roleId)) errors.push("Jabatan wajib dipilih");
	if (!cleanText(employment.startDate)) errors.push("Tanggal mulai kerja wajib diisi");
	if (!cleanText(employment.username)) errors.push("Username wajib diisi");
	if (employment.homePin && !HOME_PIN_REGEX.test(cleanText(employment.homePin))) {
		errors.push("PIN harus 6 digit angka");
	}
	/* probation duration */
	if (employment.employmentType === "probation") {
		if (![6, 12, 24].includes(employment.probationDurationMonths ?? 0)) {
			errors.push("Pilih durasi masa probation: 6, 12, atau 24 bulan");
		}
	}
	if (!draft.agreements?.dataIsTrue) {
		errors.push("Persetujuan kebenaran data wajib dicentang");
	}

	return errors.length ? { success: false, errors } : { success: true, errors: [] };
}

export function buildEmployeeOnboardingPayload(
	draft: EmployeeOnboardingDraft,
	files?: { signatureUrl?: string | null; contractPdfUrl?: string | null; cvUrl?: string | null; registrationNumber?: string | null }
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
		birth_place: cleanOptional(personal.placeOfBirth),
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
		cv_url: files?.cvUrl ?? null,
		registration_number: files?.registrationNumber ?? null,
		attachments: {},
		raw: {
			source: "public_register",
			agreements: draft.agreements,
			password: cleanText(employment.password),
			bankName: cleanOptional(draft.personal.bankName),
			bankAccount: cleanOptional(draft.personal.bankAccount),
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

const WORKING_DAYS_PER_MONTH = 22;

export function calculateEstimatedMonthlySalary(employment: EmployeeEmploymentData): number {
	const monthlySalary = employment.monthlySalary ?? 0;
	const dailyAllowance = employment.dailyAllowance ?? 0;
	const shiftRate = employment.shiftRate ?? 0;

	let estimatedMonthly = monthlySalary;
	if (shiftRate > 0) estimatedMonthly += shiftRate * WORKING_DAYS_PER_MONTH;
	if (dailyAllowance > 0) estimatedMonthly += dailyAllowance * WORKING_DAYS_PER_MONTH;

	return estimatedMonthly;
}

export function buildCompensationBody(
	employment: EmployeeEmploymentData,
	bonusConfig?: { basis?: string; tiers?: { thresholdPct: number; bonusAmount: number }[] },
	customAllowances?: { name?: string; amount?: number; type?: string }[],
): string {
	const monthly = employment.monthlySalary ?? 0;
	const daily = employment.dailyAllowance ?? 0;
	const shift = employment.shiftRate ?? 0;

	if (monthly <= 0 && daily <= 0 && shift <= 0) {
		return "Kompensasi akan diatur sesuai kebijakan perusahaan.";
	}

	const items: string[] = [];
	const details: string[] = [];

	if (monthly > 0) {
		items.push(`gaji bulanan ${formatMoney(monthly)}`);
		details.push(`Gaji pokok: ${formatMoney(monthly)}/bulan`);
	}
	if (daily > 0) {
		const estMonthly = daily * WORKING_DAYS_PER_MONTH;
		items.push(`tunjangan transportasi ${formatMoney(daily)}/hari`);
		details.push(`Tunjangan transportasi: ${formatMoney(daily)}/hari × ${WORKING_DAYS_PER_MONTH} hari = ${formatMoney(estMonthly)}/bulan`);
	}
	if (shift > 0) {
		const estMonthly = shift * WORKING_DAYS_PER_MONTH;
		items.push(`rate shift ${formatMoney(shift)}/shift`);
		details.push(`Rate shift: ${formatMoney(shift)}/shift × ${WORKING_DAYS_PER_MONTH} shift = ${formatMoney(estMonthly)}/bulan`);
	}

	const totalMonthly = calculateEstimatedMonthlySalary(employment);
	const itemsText = items.join(", ");
	const detailsText = details.join(". ");

	let result = `${itemsText}. ${detailsText}. Estimasi total penghasilan per bulan: ${formatMoney(totalMonthly)}. Perhitungan berdasarkan ${WORKING_DAYS_PER_MONTH} hari kerja per bulan.`;

	// Tambah keterangan bonus insentif
	if (bonusConfig && Array.isArray(bonusConfig.tiers) && bonusConfig.tiers.length > 0) {
		const basis = bonusConfig.basis === "shift" ? "per shift" : "per bulan";
		const tiers = bonusConfig.tiers
			.filter((t) => t.bonusAmount > 0)
			.sort((a, b) => a.thresholdPct - b.thresholdPct)
			.map((t) => `Pencapaian ${t.thresholdPct}% target: bonus ${formatMoney(t.bonusAmount)}`)
			.join(". ");
		result += ` Bonus insentif: ${tiers}. Bonus dibayarkan bersamaan dengan gaji periode berikutnya setelah evaluasi pencapaian target ${basis}.`;
	}

	// Tambah tunjangan tambahan (custom allowances)
	if (Array.isArray(customAllowances) && customAllowances.length > 0) {
		const lines = customAllowances
			.filter((a) => a.name && a.amount && a.amount > 0)
			.map((a) => {
				const period = a.type === "monthly" ? "bulan" : a.type === "daily" ? "hari" : "bulan";
				return `${a.name}: ${formatMoney(a.amount)}/${period}`;
			});
		if (lines.length > 0) {
			result += ` Tunjangan tambahan: ${lines.join(", ")}.`;
		}
	}

	return result;
}

export function buildBonusClause(bonusConfig?: { basis?: string; tiers?: { thresholdPct: number; bonusAmount: number }[] }): string {
	if (!bonusConfig || !Array.isArray(bonusConfig.tiers) || bonusConfig.tiers.length === 0) {
		return "";
	}
	const basis = bonusConfig.basis === "shift" ? "per shift" : "per bulan";
	const tiers = bonusConfig.tiers
		.sort((a, b) => a.thresholdPct - b.thresholdPct)
		.map((t) => `Pencapaian ${t.thresholdPct}% target: bonus ${formatMoney(t.bonusAmount)}`)
		.join(". ");
	return `Pihak Kedua berhak mendapatkan bonus insentif berdasarkan pencapaian target kerja ${basis}: ${tiers}. Bonus dibayarkan bersamaan dengan gaji periode berikutnya setelah evaluasi pencapaian target.`;
}

export function buildCustomAllowancesBody(customAllowances?: { name?: string; amount?: number; type?: string }[]): string {
	if (!Array.isArray(customAllowances) || customAllowances.length === 0) {
		return "";
	}
	const lines = customAllowances
		.filter((a) => a.name && a.amount && a.amount > 0)
		.map((a) => {
			const period = a.type === "monthly" ? "bulan" : a.type === "daily" ? "hari" : "bulan";
			return `${a.name}: ${formatMoney(a.amount)}/${period}`;
		});
	if (lines.length === 0) return "";
	return `Selain gaji pokok dan tunjangan transportasi, Pihak Kedua berhak atas tunjangan berikut: ${lines.join(", ")}.`;
}

export function buildEmployeeContractTemplate(
	personal: EmployeePersonalData,
	employment: EmployeeEmploymentData,
	signatoryName?: string,
	bonusConfig?: { basis?: string; tiers?: { thresholdPct: number; bonusAmount: number }[] },
	customAllowances?: { name?: string; amount?: number; type?: string }[],
): EmployeeContractDraft {
	const _signatoryName = signatoryName || "Djiwa Tentram Cafe & Resto";
	const roleName = cleanText(employment.roleName) || "Team";
	const location = cleanText(employment.location) || "Djiwa Tentram";
	const durationMonths = employment.contractDuration && employment.contractDuration >= 1 ? employment.contractDuration : 12;
	const bonusBody = buildBonusClause(bonusConfig);
	const allowancesBody = buildCustomAllowancesBody(customAllowances);

	// ── Conditional: Masa Percobaan (only for probation) ──
	const probationClause: EmployeeContractClause[] = employment.employmentType === "probation"
		? [{
			title: "Pasal 4 — Masa Percobaan",
			body: `(1) Dalam hal PIHAK KEDUA berstatus Masa Percobaan (Probation), maka PIHAK KEDUA menjalani masa percobaan sesuai ketentuan undang-undang yang berlaku.

(2) Selama masa percobaan, PIHAK PERTAMA berhak melakukan evaluasi berkala terhadap kinerja PIHAK KEDUA.

(3) PiHAK PERTAMA berhak mengakhiri hubungan kerja tanpa kewajiban memberikan pesangon apabila PIHAK KEDUA tidak memenuhi standar kinerja yang ditetapkan selama masa percobaan, sesuai dengan ketentuan peraturan perundang-undangan.`,
		}]
		: [];

	const clauseList: EmployeeContractClause[] = [
		{
			title: "Pasal 1 — Para Pihak",
			body: `Yang bertanda tangan di bawah ini:

1. {{nama_perusahaan}}, berkedudukan di {{alamat_perusahaan}} dengan Nomor Induk Berusaha (NIB) {{nib_perusahaan}} dalam hal ini diwakili oleh {{penandatangan}}, selaku {{jabatan_penandatangan}}, yang selanjutnya disebut sebagai "PIHAK PERTAMA" atau "Perusahaan".

2. {{nama_karyawan}}, NIK {{nik}}, bertempat tinggal di {{alamat}}, lahir di {{tempat_lahir}}, {{tanggal_lahir}}, yang selanjutnya disebut sebagai "PIHAK KEDUA" atau "Karyawan".

PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut "Para Pihak" sepakat untuk mengadakan Perjanjian Kerja dengan ketentuan sebagai berikut.`,
		},
		{
			title: "Pasal 2 — Kedudukan dan Penempatan",
			body: `(1) PIHAK KEDUA diangkat dan ditempatkan sebagai {{jabatan}} di {{lokasi_kerja}} atau lokasi lain yang ditetapkan oleh PIHAK PERTAMA sesuai kebutuhan operasional perusahaan.

(2) PIHAK PERTAMA berhak melakukan mutasi, rotasi, atau promosi jabatan dengan memberikan pemberitahuan tertulis kepada PIHAK KEDUA paling lambat 7 (tujuh) hari sebelum perubahan berlaku.`,
		},
		{
			title: "Pasal 3 — Masa Perjanjian dan Status Kerja",
			body: `(1) Perjanjian kerja ini berlaku untuk jangka waktu {{durasi_kontrak}} bulan, terhitung mulai {{tanggal_mulai}} sampai dengan {{tanggal_akhir}}.

(2) Status hubungan kerja PIHAK KEDUA adalah {{tipe_kontrak}}.

(3) Perjanjian ini dapat diperpanjang kembali atas kesepakatan tertulis Para Pihak dengan mengadakan perjanjian baru atau addendum.

(4) Apabila perjanjian ini berakhir dan PIHAK KEDUA tetap bekerja, maka perjanjian ini dinyatakan diperpanjang secara otomatis untuk jangka waktu yang sama, kecuali Para Pihak menyatakan lain secara tertulis.`,
		},
		...probationClause,
		{
			title: "Pasal 5 — Kompensasi dan Tunjangan",
			body: buildCompensationBody(employment, bonusConfig, customAllowances),
		},
		{
			title: "Pasal 6 — Waktu Kerja",
			body: `(1) Waktu kerja ditentukan oleh PIHAK PERTAMA sesuai dengan kebutuhan operasional dan ketentuan peraturan perundang-undangan yang berlaku.

(2) PIHAK KEDUA wajib mematuhi jadwal kerja yang ditetapkan dan hadir tepat waktu.

(3) Setiap perubahan jadwal kerja akan diberitahukan oleh PIHAK PERTAMA kepada PIHAK KEDUA dalam waktu yang wajar.`,
		},
		{
			title: "Pasal 7 — Hak dan Kewajiban PIHAK KEDUA",
			body: `PIHAK KEDUA berhak atas:
a) Gaji dan tunjangan sebagaimana diatur dalam Pasal 5;
b) Lingkungan kerja yang aman dan layak;
c) Cuti sesuai ketentuan yang berlaku;
d) Perlindungan keselamatan dan kesehatan kerja.

PIHAK KEDUA berkewajiban untuk:
a) Melaksanakan tugas dan pekerjaan dengan penuh tanggung jawab, jujur, dan disiplin;
b) Menaati seluruh peraturan, SOP, dan kebijakan perusahaan;
c) Menjaga kerahasiaan data, informasi, dan rahasia dagang perusahaan;
d) Menjaga nama baik dan citra perusahaan;
e) Melaporkan segala hambatan atau masalah dalam pekerjaan kepada atasan;
f) Menggunakan aset dan fasilitas perusahaan dengan bijak dan bertanggung jawab.`,
		},
		{
			title: "Pasal 8 — Hak dan Kewajiban PIHAK PERTAMA",
			body: `PIHAK PERTAMA berhak untuk:
a) Mengevaluasi dan menilai kinerja PIHAK KEDUA secara berkala;
b) Mengenakan sanksi yang proporsional atas pelanggaran yang dilakukan PIHAK KEDUA;
c) Mengakhiri hubungan kerja sesuai dengan ketentuan peraturan perundang-undangan.

PIHAK PERTAMA berkewajiban untuk:
a) Membayar kompensasi tepat waktu sesuai dengan ketentuan Pasal 5;
b) Menyediakan sarana dan lingkungan kerja yang layak dan aman;
c) Memberikan pelatihan dan pengembangan yang diperlukan.`,
		},
		{
			title: "Pasal 9 — Kerahasiaan",
			body: `(1) PIHAK KEDUA wajib menjaga kerahasiaan seluruh informasi, data, dokumen, dan rahasia dagang PIHAK PERTAMA yang diperoleh selama menjalankan pekerjaan.

(2) Kewajiban kerahasiaan ini tetap berlaku untuk jangka waktu 2 (dua) tahun setelah berakhirnya hubungan kerja.

(3) Pelanggaran terhadap ketentuan kerahasiaan ini dapat mengakibatkan sanksi sesuai dengan ketentuan perusahaan dan/atau tuntutan hukum sesuai peraturan perundang-undangan.`,
		},
		{
			title: "Pasal 10 — Disiplin dan Tata Tertib",
			body: `(1) PIHAK KEDUA wajib mematuhi seluruh peraturan disiplin dan tata tertib yang ditetapkan oleh PIHAK PERTAMA.

(2) Pelanggaran disiplin akan dikenakan sanksi bertahap berupa:
a) Teguran lisan;
b) Teguran tertulis;
c) Skorsing; dan/atau
d) Pemutusan hubungan kerja (PHK).

(3) PIHAK KEDUA yang tidak masuk kerja tanpa keterangan yang sah selama 5 (lima) hari kerja berturut-turut dianggap mengundurkan diri.`,
		},
		{
			title: "Pasal 11 — Pengakhiran Hubungan Kerja",
			body: `(1) Hubungan kerja dapat berakhir karena:
a) Berakhirnya jangka waktu perjanjian;
b) PIHAK KEDUA mengundurkan diri secara tertulis;
c) PHK oleh PIHAK PERTAMA karena pelanggaran berat;
d) Meninggal dunia;
e) Adanya putusan pengadilan yang berkekuatan hukum tetap;
f) Keadaan memaksa (force majeure).

(2) PIHAK KEDUA yang akan mengundurkan diri wajib mengajukan permohonan secara tertulis paling lambat 30 (tiga puluh) hari sebelum tanggal pengunduran diri.

(3) Segala hak dan kewajiban Para Pihak atas pengakhiran hubungan kerja akan diselesaikan sesuai dengan peraturan perundang-undangan yang berlaku di bidang ketenagakerjaan.`,
		},
		{
			title: "Pasal 12 — Penyelesaian Perselisihan",
			body: `(1) Apabila terjadi perselisihan antara Para Pihak, kedua belah pihak sepakat untuk menyelesaikannya secara musyawarah untuk mencapai mufakat terlebih dahulu.

(2) Apabila tidak tercapai kesepakatan melalui musyawarah, Para Pihak sepakat untuk menyelesaikan perselisihan melalui mekanisme yang diatur dalam peraturan perundang-undangan yang berlaku di bidang ketenagakerjaan.`,
		},
		{
			title: "Pasal 13 — Penutup",
			body: `(1) Perjanjian ini dibuat dalam rangkap 2 (dua) bermeterai cukup, masing-masing memiliki kekuatan hukum yang sama.

(2) Hal-hal yang belum diatur dalam perjanjian ini akan diatur kemudian melalui addendum yang merupakan satu kesatuan dan bagian yang tidak terpisahkan dari perjanjian ini.

(3) Perjanjian ini berlaku setelah ditandatangani secara digital oleh Para Pihak dan disetujui oleh admin/perwakilan perusahaan.`,
		},
	];

	if (bonusBody) {
		clauseList.splice(5, 0, { title: "Pasal 5A — Bonus dan Insentif", body: bonusBody });
	}
	if (allowancesBody) {
		clauseList.splice(allowancesBody ? 6 : 5, 0, { title: "Pasal 5B — Tunjangan Tambahan", body: allowancesBody });
	}

	const clauses = clauseList;
	const rawPlainText = clauses.flatMap((clause) => [clause.title, clause.body, ""]).join("\n");
	const html = `<article>${clauses
		.map(
			(clause) =>
				`<section><h3>${clause.title}</h3>${clause.body
					.split("\n")
					.map((l) => l.trim())
					.filter(Boolean)
					.map((para) => `<p>${para}</p>`)
					.join("\n")}</section>`
		)
		.join("")}</article>`;

	return {
		mode: "template",
		title: `Perjanjian Kerja ${roleName}`,
		plainText: rawPlainText,
		html,
		clauses,
	};
}

export function clausesToPlainText(title: string, clauses: EmployeeContractClause[]) {
	return [title, "", ...clauses.flatMap((clause) => [clause.title, clause.body, ""])].join("\n");
}

/* -------- dynamic variable replacement -------- */

export type ContractVariableContext = {
	personal: EmployeePersonalData;
	employment: EmployeeEmploymentData;
	company: {
		name: string;
		address: string;
		nib: string;
		signatoryName: string;
		signatoryTitle: string;
		signatoryLocation: string;
	};
};

const MONTHS_INDONESIA = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAYS_INDONESIA = [
	"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu",
];

export function buildContractVariableContext(
	personal: EmployeePersonalData,
	employment: EmployeeEmploymentData,
	companyName: string,
	signatoryName: string,
	companyAddress?: string,
	companyNib?: string,
	signatoryTitle?: string,
	signatoryLocation?: string,
): ContractVariableContext {
	const estimatedTotal = calculateEstimatedMonthlySalary(employment);
	const startDate = employment.startDate || new Date().toISOString().slice(0, 10);
	const startDateObj = new Date(startDate + "T00:00:00");
	const now = new Date();

	let endDateStr = "";
	let durationMonths = employment.contractDuration || 12;
	if (durationMonths > 0 && startDateObj.getTime()) {
		const end = new Date(startDateObj);
		end.setMonth(end.getMonth() + durationMonths);
		endDateStr = end.toISOString().slice(0, 10);
	}

	return {
		personal,
		employment,
		company: {
			name: companyName || "Djiwa Tentram",
			address: companyAddress || "-",
			nib: companyNib || "-",
			signatoryName: signatoryName || companyName || "perwakilan perusahaan",
			signatoryTitle: signatoryTitle || "Direktur",
			signatoryLocation: signatoryLocation || "Tangerang",
		},
	};
}

export function numberToWords(n: number): string {
	const words = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas", "dua puluh", "dua puluh satu", "dua puluh dua", "dua puluh tiga", "dua puluh empat"];
	return words[n] || String(n);
}

export function formatDateId(isoDate: string): string {
	if (!isoDate || isoDate === "-") return "-";
	const d = new Date(isoDate + "T00:00:00");
	if (!d.getTime()) return isoDate;
	return `${d.getDate()} ${MONTHS_INDONESIA[d.getMonth()]} ${d.getFullYear()}`;
}

export function replaceContractVariables(text: string, ctx: ContractVariableContext, bonusConfig?: { basis?: string; tiers?: { thresholdPct: number; bonusAmount: number }[] }): string {
	const { personal, employment, company } = ctx;

	const monthly = employment.monthlySalary ?? 0;
	const daily = employment.dailyAllowance ?? 0;
	const shift = employment.shiftRate ?? 0;
	const estimatedTotal = calculateEstimatedMonthlySalary(employment);
	const durationMonths = employment.contractDuration || 12;

	const startDate = employment.startDate || new Date().toISOString().slice(0, 10);
	const startDateObj = new Date(startDate + "T00:00:00");
	let endDateStr = "";
	if (durationMonths > 0 && startDateObj.getTime()) {
		const end = new Date(startDateObj);
		end.setMonth(end.getMonth() + durationMonths);
		endDateStr = end.toISOString().slice(0, 10);
	}

	const now = new Date();

	const vars: Record<string, string> = {
		// --- Employee data ---
		"{{nama_karyawan}}": personal.fullName || "Karyawan",
		"{{nik}}": personal.identityNumber || "-",
		"{{tempat_lahir}}": personal.placeOfBirth || "-",
		"{{tanggal_lahir}}": formatDateId(personal.birthDate),
		"{{alamat}}": personal.address || "-",
		"{{agama}}": personal.religion || "-",
		"{{status_pernikahan}}": personal.maritalStatus || "-",
		"{{telepon}}": personal.phone || "-",

		// --- Company data ---
		"{{nama_perusahaan}}": company.name,
		"{{alamat_perusahaan}}": company.address,
		"{{nib_perusahaan}}": company.nib,
		"{{penandatangan}}": company.signatoryName,
		"{{jabatan_penandatangan}}": company.signatoryTitle,
		"{{lokasi_ttd}}": company.signatoryLocation,

		// --- Employment data ---
		"{{jabatan}}": employment.roleName || "Karyawan",
		"[Jabatan]": employment.roleName || "Karyawan",
		"{{tanggal_mulai}}": formatDateId(startDate),
		"{{tanggal_akhir}}": formatDateId(endDateStr) || "-",
		"{{durasi_kontrak}}": String(durationMonths) + " (" + numberToWords(durationMonths) + ")",
		"{{tipe_kontrak}}": employmentTypeLabel(employment.employmentType),
		"{{lokasi_kerja}}": employment.location || "-",
		"{{nama_atasan}}": "-",

		// --- Compensation ---
		"{{gaji_pokok}}": formatMoney(monthly),
		"{{tunjangan_harian}}": formatMoney(daily),
		"{{rate_shift}}": formatMoney(shift),
		"{{estimasi_total}}": formatMoney(estimatedTotal),
		"{{kompensasi_body}}": buildCompensationBody(employment, bonusConfig),

		// --- Bonus Target ---
		"{{bonus_target_basis}}": bonusConfig ? (bonusConfig.basis === "daily" ? "Per Hari" : bonusConfig.basis === "monthly" ? "Per Bulan" : "Per Shift") : "-",
		"{{bonus_target_summary}}": bonusConfig && Array.isArray(bonusConfig.tiers) && bonusConfig.tiers.length > 0
			? bonusConfig.tiers
				.filter((t) => t.bonusAmount > 0)
				.map((t) => `${t.thresholdPct}% → ${formatMoney(t.bonusAmount)}`)
				.join("; ")
			: "Tidak ada target bonus",

		// --- Date ---
		"{{hari}}": DAYS_INDONESIA[now.getDay()],
		"{{tgl}}": String(now.getDate()),
		"{{bulan}}": MONTHS_INDONESIA[now.getMonth()],
		"{{tahun}}": String(now.getFullYear()),
	};

	let result = text;
	for (const [key, value] of Object.entries(vars)) {
		result = result.split(key).join(value);
	}
	return result;
}
