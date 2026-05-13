import { createLazyFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { ChevronLeft, ChevronRight, FileText, Loader2, PenLine, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";
import { SignaturePad } from "@/components/employee-onboarding/signature-pad";
import { useHybridSiteSettings, useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridGenerateEmployeeOnboardingUploadUrl,
	useHybridSubmitEmployeeApplication,
} from "@/hooks/use-employee-onboarding-actions";
import {
	buildEmployeeContractTemplate,
	buildEmployeeOnboardingPayload,
	buildCompensationBody,
	calculateEstimatedMonthlySalary,
	createEmployeeSlug,
	replaceContractVariables,
	buildContractVariableContext,
	type EmployeeOnboardingDraft,
	validateEmployeeOnboardingDraft,
} from "@/lib/employee-onboarding-schema";
import { dataUrlToBlob, generateContractPdfBlob } from "@/lib/contract-pdf";
import {
	applyOnboardingDefaultsToDraft,
	formatOnboardingCurrency,
	getRoleSalaryDefaults,
	normalizeEmployeeOnboardingSettings,
	validateDraftForSettings,
	calculateProbationEndDate,
} from "@/lib/employee-onboarding-settings";

/* -------- constants -------- */
const DRAFT_KEY = "employee-register-draft-v1";

const initialDraft: EmployeeOnboardingDraft = {
	personal: {
		fullName: "",
		email: "",
		phone: "",
		identityNumber: "",
		address: "",
		birthDate: "",
		emergencyContactName: "",
		emergencyContactPhone: "",
	},
	employment: {
		roleId: "",
		roleName: "",
		startDate: "",
		employmentType: "probation",
		monthlySalary: 0,
		dailyAllowance: 0,
		shiftRate: 0,
		location: "Djiwa Tentram",
		username: "",
		slug: "",
		homePin: "",
		contractDuration: 6,
	},
	contract: { mode: "template", title: "Perjanjian Kerja", plainText: "", clauses: [] },
	signatureDataUrl: "",
	agreements: { dataIsTrue: false, contractApproved: false },
};

const STEPS = ["Data Diri", "Data Kerja", "Kontrak", "Tanda Tangan", "Selesai"];

function moneyValue(v?: number) {
	return v ? String(v) : "";
}

function replaceClauseBody(templateText: string, clauseNumber: number, clauseTitle: string, body: string) {
	const nextClausePattern = "\\n\\s*Pasal\\s+\\d+\\s+[—-]";
	const clausePattern = new RegExp(`(Pasal\\s+${clauseNumber}\\s+[—-]\\s+${clauseTitle}\\s*\\n)([\\s\\S]*?)(?=${nextClausePattern}|$)`, "i");

	if (clausePattern.test(templateText)) {
		return templateText.replace(clausePattern, `$1${body}\n\n`);
	}

	return templateText;
}

function normalizeUsername(value: string) {
	return createEmployeeSlug(value).replace(/^-+|-+$/g, "");
}

function getCompanyDisplayName(siteSettings: any, signatoryName: string) {
	return String(siteSettings?.companyName || siteSettings?.businessName || siteSettings?.storeName || siteSettings?.name || signatoryName || "Djiwa Tentram").trim();
}

function syncDynamicContractClauses(templateText: string, personal: EmployeeOnboardingDraft["personal"], employment: EmployeeOnboardingDraft["employment"], companyName: string, signatoryName: string, signatoryAddress = "", signatoryNib = "", signatoryTitle = "", signatoryLocation = "") {
	const ctx = buildContractVariableContext(
		personal as any,
		employment as any,
		companyName,
		signatoryName,
		signatoryAddress,
		signatoryNib,
		signatoryTitle,
		signatoryLocation,
	);
	return replaceContractVariables(templateText, ctx);
}

/* -------- page component -------- */
function RegisterPage() {
	const roles = useHybridStaffRoles() ?? [];
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);
	const companyDisplayName = useMemo(() => getCompanyDisplayName(siteSettings, onboardingSettings.signatoryName), [siteSettings, onboardingSettings.signatoryName]);
	const signatoryPersonName = onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName;
	const registrationEnabled = onboardingSettings.registrationEnabled;
	const uploadFile = useHybridGenerateEmployeeOnboardingUploadUrl();
	const submitApplication = useHybridSubmitEmployeeApplication();

	const [step, setStep] = useState(0);
	const [draft, setDraft] = useState<EmployeeOnboardingDraft>(() => {
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			return saved ? { ...initialDraft, ...JSON.parse(saved) } : initialDraft;
		} catch { return initialDraft; }
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [cvFile, setCvFile] = useState<File | null>(null);

	/* persist draft */
	useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);

	useEffect(() => {
		setDraft((prev) => applyOnboardingDefaultsToDraft(prev, onboardingSettings, roles as any[]));
	}, [onboardingSettings.defaultRoleId, onboardingSettings.defaultLocation, onboardingSettings.defaultEmploymentType, onboardingSettings.prefillSalaryFromRole, roles]);

	/* auto username + slug */
	useEffect(() => {
		if (!draft.personal.fullName || draft.employment.username) return;
		const username = normalizeUsername(draft.personal.fullName);
		setDraft((prev) => ({
			...prev,
			employment: {
				...prev.employment,
				username: onboardingSettings.autoGenerate.username ? username : prev.employment.username,
				slug: onboardingSettings.autoGenerate.slug ? username : prev.employment.slug,
			},
		}));
	}, [draft.personal.fullName, draft.employment.username, onboardingSettings.autoGenerate.username, onboardingSettings.autoGenerate.slug]);

	const contractPreview = useMemo(() => {
		const roleTemplate = onboardingSettings.contractTemplatesByRoleId[draft.employment.roleId];
		const defaultTemplate = onboardingSettings.contractTemplatesByRoleId.__default__;
		const templateText = roleTemplate || defaultTemplate;
		const selectedRole = roles.find((r: any) => String(r?._id) === draft.employment.roleId);
		const roleDefaults = selectedRole ? getRoleSalaryDefaults(selectedRole) : { bonusTargetConfig: null, customAllowances: [] };
		if (templateText) {
			const templateStr = typeof templateText === "string" ? templateText : (templateText as any).title + "\n" + (templateText as any).clauses?.map((c: any) => c.title + "\n" + c.body).join("\n\n") || "";
			const syncedTemplateText = syncDynamicContractClauses(templateStr, draft.personal, draft.employment, companyDisplayName, signatoryPersonName, onboardingSettings.signatoryCompanyAddress, onboardingSettings.signatoryCompanyNIB, onboardingSettings.signatoryPersonTitle, onboardingSettings.signatoryLocation);
			const htmlParagraphs = syncedTemplateText
				.split("\n")
				.map((l: string) => l.trim())
				.filter(Boolean)
				.map((para: string) => `<p>${para}</p>`)
				.join("\n");
			return {
				mode: "template" as const,
				title: `Perjanjian Kerja ${draft.employment.roleName || ""}`,
				plainText: syncedTemplateText,
				html: `<article>${htmlParagraphs}</article>`,
				clauses: [{ title: "Ketentuan Kontrak", body: syncedTemplateText }],
			};
		}
		const built = buildEmployeeContractTemplate(
			draft.personal,
			draft.employment,
			companyDisplayName,
			roleDefaults.bonusTargetConfig ?? undefined,
			roleDefaults.customAllowances ?? []
		);
		const ctx = buildContractVariableContext(
			draft.personal as any,
			draft.employment as any,
			companyDisplayName,
			signatoryPersonName,
			onboardingSettings.signatoryCompanyAddress,
			onboardingSettings.signatoryCompanyNIB,
			onboardingSettings.signatoryPersonTitle,
			onboardingSettings.signatoryLocation,
		);
			return {
				...built,
				plainText: replaceContractVariables(built.plainText, ctx),
				clauses: built.clauses.map((c) => ({ ...c, body: replaceContractVariables(c.body, ctx) })),
			html: `<article>${built.clauses.map((c) => {
				const body = replaceContractVariables(c.body, ctx);
				const paragraphs = body.split("\n").map((l: string) => l.trim()).filter(Boolean).map((para: string) => `<p>${para}</p>`).join("\n");
				return `<section><h3>${c.title}</h3>${paragraphs}</section>`;
			}).join("")}</article>`,
			};
	}, [draft.employment, draft.personal, onboardingSettings.contractTemplatesByRoleId, companyDisplayName]);

	/* helpers */
	const updatePersonal = (k: keyof EmployeeOnboardingDraft["personal"], v: string) =>
		setDraft((p) => ({ ...p, personal: { ...p.personal, [k]: v } }));
	const updateEmployment = (k: keyof EmployeeOnboardingDraft["employment"], v: any) =>
		setDraft((p) => ({ ...p, employment: { ...p.employment, [k]: v } }));

	function validateCurrentStep(): boolean {
		const errors: string[] = [];
		if (step === 0) {
			if (!draft.personal.fullName.trim()) errors.push("Nama lengkap wajib diisi");
			if (!draft.personal.phone.trim()) errors.push("Nomor HP wajib diisi");
			if (draft.personal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.personal.email))
				errors.push("Format email tidak valid");
			if (draft.personal.identityNumber && !/^\d{16}$/.test(draft.personal.identityNumber))
				errors.push("NIK harus 16 digit angka");
		}
		if (step === 1) {
			if (!draft.employment.roleId) errors.push("Jabatan wajib dipilih");
			if (!draft.employment.username.trim()) errors.push("Username wajib diisi");
		}
		if (errors.length) { errors.forEach((e) => toast.error(e)); return false; }
		return true;
	}

	function applyTemplate() {
		setDraft((p) => ({ ...p, contract: contractPreview }));
	}

	async function isUsernameTaken(username: string) {
		const cleanUsername = normalizeUsername(username);
		if (!cleanUsername) return false;
		const supabase = createClient();
		const [{ data: existingUser, error: userError }, { data: existingApplication, error: appError }] = await Promise.all([
			supabase.from("yumi_users").select("source_id").eq("username", cleanUsername).maybeSingle(),
			supabase.from("employee_onboarding_applications").select("id").eq("employment->>username", cleanUsername).neq("status", "rejected").limit(1).maybeSingle(),
		]);
		if (userError) throw userError;
		if (appError) throw appError;
		return Boolean(existingUser || existingApplication);
	}

	async function handleSubmit() {
		const username = normalizeUsername(draft.employment.username || draft.personal.fullName);
		const finalDraft = {
			...draft,
			employment: {
				...draft.employment,
				username,
				slug: username,
				startDate: new Date().toISOString().slice(0, 10),
			},
			contract: contractPreview,
		};
		const validation = validateEmployeeOnboardingDraft(finalDraft);
		const settingErrors = validateDraftForSettings(finalDraft, onboardingSettings);
		if (!validation.success || settingErrors.length) {
			[...validation.errors, ...settingErrors].forEach((e) => toast.error(e));
			return;
		}
		setIsSubmitting(true);
		try {
			if (await isUsernameTaken(username)) {
				toast.error("Username sudah dipakai. Silakan ganti username terlebih dahulu.");
				setStep(1);
				return;
			}
			const appKey = crypto.randomUUID();
			let cvUrl: string | null = null;
			if (cvFile) {
				try {
					const ext = cvFile.name.split(".").pop() || "pdf";
					const contentType = cvFile.type || "application/pdf";
					cvUrl = await uploadFile({ file: cvFile, contentType, fileName: `${appKey}-cv.${ext}`, folder: "employee-contracts/cvs" });
				} catch (e) {
					console.warn("CV upload failed", e);
					toast.warning("Gagal mengupload CV, pendaftaran tetap dilanjutkan");
				}
			}
			const sigBlob = await dataUrlToBlob(draft.signatureDataUrl || "");
			const signatureUrl = await uploadFile({ file: sigBlob, contentType: "image/png", fileName: `${appKey}-signature.png`, folder: "employee-contracts/signatures" });
			let contractPdfUrl: string | null = null;
			try {
				const pdfBlob = await generateContractPdfBlob(finalDraft, document.getElementById("employee-contract-preview"));
				contractPdfUrl = await uploadFile({ file: pdfBlob, contentType: "application/pdf", fileName: `${appKey}-contract.pdf`, folder: "employee-contracts/contracts" });
			} catch (e) {
				console.warn("PDF gen failed", e);
				toast.warning("Gagal generate PDF kontrak, pendaftaran tetap dilanjutkan tanpa PDF");
			}
			const payload = buildEmployeeOnboardingPayload(finalDraft, { signatureUrl, contractPdfUrl, cvUrl });
			const uniqueCode = crypto.randomUUID().slice(0, 8).toUpperCase().replace(/-/g, "");
			const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
			const registrationNumber = `${username.toUpperCase()}-${uniqueCode}-${dateStr}`;
			payload.raw = {
				...payload.raw,
				registrationNumber,
				registrationMode: onboardingSettings.registrationMode,
				pipelineStatus: onboardingSettings.pipeline.defaultStatus,
				documentChecklist: onboardingSettings.documentChecklist,
				salaryPreview: onboardingSettings.salaryPreview,
			};
			await submitApplication({ payload });
			localStorage.removeItem(DRAFT_KEY);
			toast.success("Pendaftaran berhasil dikirim");
			window.location.href = `/register/selesai-${registrationNumber}`;
		} catch (e: any) {
			toast.error(e?.message || "Gagal submit pendaftaran");
		} finally { setIsSubmitting(false); }
	}

	/* -------- render -------- */

	// Jika registration dinonaktifkan, tampilkan halaman tertutup
	if (!registrationEnabled) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-3 py-6 sm:px-4 sm:py-8">
				<div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
					<Card className="mx-auto max-w-md text-center sm:max-w-xl">
						<CardContent className="space-y-4 px-6 py-8 sm:px-10 sm:py-12">
							<XCircle className="mx-auto h-12 w-12 text-amber-500 sm:h-16 sm:w-16" />
							<h2 className="text-lg font-bold sm:text-2xl">Pendaftaran Ditutup</h2>
							<p className="text-muted-foreground text-sm">
								Saat ini pendaftaran karyawan baru sedang tidak dibuka.{" "}
								Silakan hubungi admin untuk informasi lebih lanjut.
							</p>
							<Button onClick={() => { window.location.href = "/login"; }}>
								Kembali ke Login
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--background)),rgba(16,185,129,0.08))] px-3 py-6 sm:px-4 sm:py-8">
			<div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">

				{/* ---- header ---- */}
				<div className="overflow-hidden rounded-3xl border bg-card/90 shadow-xl backdrop-blur">
					<div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[1.2fr_1fr] md:items-center">
						<div>
							<Badge className="mb-2 sm:mb-3" variant="secondary">
								<UserPlus className="mr-1 h-3 w-3" /> Register Karyawan
							</Badge>
							<h1 className="text-2xl font-black tracking-tight sm:text-4xl">Pendaftaran Karyawan Baru</h1>
							<p className="mt-2 max-w-2xl text-muted-foreground text-xs leading-relaxed sm:text-sm">
								Isi data singkat, baca kontrak, tanda tangan digital, lalu admin akan review pendaftaran Anda.
							</p>
							<div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
								<span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><ShieldCheck className="h-3 w-3 text-emerald-600" />Draft tersimpan di perangkat</span>
								<span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><FileText className="h-3 w-3 text-sky-600" />Kontrak jadi PDF otomatis</span>
								<span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><PenLine className="h-3 w-3 text-amber-600" />Tanda tangan digital</span>
							</div>
						</div>

						<div className="space-y-3">
							<div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
								<span>Progress</span>
								<span>{Math.min(step + 1, 4)} dari 4</span>
							</div>
							<div className="h-2 overflow-hidden rounded-full bg-muted">
								<div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all" style={{ width: `${Math.min(((step + 1) / 4) * 100, 100)}%` }} />
							</div>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
								{STEPS.slice(0, 4).map((label, idx) => (
									<div key={label} className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition-all ${idx === step ? "border-primary bg-primary text-primary-foreground shadow-sm" : idx < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-background text-muted-foreground"}`}>
										<span className="block text-[10px] opacity-75">Langkah {idx + 1}</span>{label}
									</div>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* ---- step 0: data diri ---- */}
				{step === 0 && (
					<Card className="border sm:rounded-xl">
						<CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">Data Diri</CardTitle></CardHeader>
						<CardContent className="grid gap-3 sm:gap-4 md:grid-cols-2">
							<Field label="Nama lengkap"><Input value={draft.personal.fullName} onChange={(e) => updatePersonal("fullName", e.target.value)} placeholder="Nama sesuai identitas" /></Field>
							<Field label="No HP / WhatsApp"><Input value={draft.personal.phone} onChange={(e) => updatePersonal("phone", e.target.value)} placeholder="08xxxxxxxxxx" /></Field>
							<Field label="Email"><Input value={draft.personal.email} onChange={(e) => updatePersonal("email", e.target.value)} placeholder="nama@email.com" /></Field>
							<Field label="NIK / No Identitas"><Input value={draft.personal.identityNumber} onChange={(e) => updatePersonal("identityNumber", e.target.value)} /></Field>
							<Field label="Tanggal lahir"><Input type="date" value={draft.personal.birthDate} onChange={(e) => updatePersonal("birthDate", e.target.value)} /></Field>
							<Field label="Kontak darurat"><Input value={draft.personal.emergencyContactName} onChange={(e) => updatePersonal("emergencyContactName", e.target.value)} placeholder="Nama kontak darurat" /></Field>
							<Field label="No kontak darurat"><Input value={draft.personal.emergencyContactPhone} onChange={(e) => updatePersonal("emergencyContactPhone", e.target.value)} /></Field>
							<Field className="md:col-span-2" label="Alamat"><Textarea value={draft.personal.address} onChange={(e) => updatePersonal("address", e.target.value)} /></Field>
							{/* Upload CV */}
							<div className="md:col-span-2 space-y-1.5 sm:space-y-2">
								<Label className="text-xs sm:text-sm">Upload CV / Resume</Label>
								<div className="flex items-center gap-3">
									<input
										type="file"
										accept=".pdf,.png,.jpg,.jpeg,.webp"
										className="hidden"
										id="cv-upload"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) setCvFile(file);
										}}
									/>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => document.getElementById("cv-upload")?.click()}
									>
										{cvFile ? "Ganti CV" : "Pilih File CV"}
									</Button>
									{cvFile && (
										<>
											<span className="text-xs text-muted-foreground truncate max-w-[200px]">
												{cvFile.name}
											</span>
											<Button
												type="button"
												size="icon"
												variant="ghost"
												className="h-6 w-6 text-destructive"
												onClick={() => setCvFile(null)}
											>
												<XCircle className="h-4 w-4" />
											</Button>
										</>
									)}
									{!cvFile && (
										<span className="text-xs text-muted-foreground">
											Opsional. Format: PDF, PNG, JPG (max 5MB)
										</span>
									)}
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* ---- step 1: data kerja ---- */}
				{step === 1 && (
					<Card className="border sm:rounded-xl">
						<CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">Data Kerja</CardTitle></CardHeader>
						<CardContent className="grid gap-3 sm:gap-4 md:grid-cols-2">
							<Field label="Jabatan / Role">
								<select
									className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
									value={draft.employment.roleId}
									onChange={(e) => {
						const role = roles.find((r: any) => r._id === e.target.value);
						const salaryDefaults: Partial<Pick<EmployeeOnboardingDraft["employment"], "monthlySalary" | "dailyAllowance" | "shiftRate">> =
							onboardingSettings.prefillSalaryFromRole && role ? getRoleSalaryDefaults(role) : {};
										setDraft((prev) => ({
											...prev,
											contract: { mode: "template", title: "Perjanjian Kerja", plainText: "", clauses: [] },
											employment: {
												...prev.employment,
												roleId: e.target.value,
												roleName: role?.name ?? "",
												monthlySalary: salaryDefaults.monthlySalary ?? 0,
												dailyAllowance: salaryDefaults.dailyAllowance ?? 0,
												shiftRate: salaryDefaults.shiftRate ?? 0,
											},
										}));
									}}
								>
									<option value="">Pilih jabatan</option>
									{roles.map((r: any) => <option key={r._id} value={r._id}>{r.name}</option>)}
								</select>
							</Field>
							<div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
								<p className="font-semibold text-foreground">Tanggal mulai</p>
								<p>Tanggal mulai kerja akan otomatis mengikuti tanggal admin approve pendaftaran.</p>
							</div>
							{onboardingSettings.fields.employmentType?.visible !== false && <Field label="Tipe kerja">
								<select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={draft.employment.employmentType} onChange={(e) => updateEmployment("employmentType", e.target.value)}>
									<option value="probation">Probation</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="freelance">Freelance</option>
								</select>
								{draft.employment.employmentType === "probation" && onboardingSettings.probation.enabled && (
									<p className="mt-1 text-xs text-muted-foreground">Masa probation dihitung mulai tanggal approval admin.</p>
								)}
							</Field>}
							<Field label="Masa kontrak">
								<select
									className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
									value={String(draft.employment.contractDuration || 6)}
									onChange={(e) => updateEmployment("contractDuration", parseInt(e.target.value, 10))}
								>
									<option value="6">6 bulan</option>
									<option value="12">1 tahun (12 bulan)</option>
									<option value="18">1,5 tahun (18 bulan)</option>
									<option value="24">2 tahun (24 bulan)</option>
								</select>
							</Field>
							<Field label="Lokasi"><Input value={draft.employment.location} onChange={(e) => updateEmployment("location", e.target.value)} /></Field>
						{onboardingSettings.salaryPreview.enabled && onboardingSettings.salaryPreview.candidateVisibility !== "hidden" && <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground md:col-span-2">Estimasi gaji akan diinformasikan oleh admin setelah pendaftaran disetujui.</div>}
							<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 md:col-span-2">
								Akses login akan aktif setelah admin menyetujui pendaftaran. Admin akan membuat PIN 6 digit dan memberikannya ke karyawan saat approval.
							</div>
							<Field label="Username">
								<Input
									value={draft.employment.username}
									onChange={(e) => {
										const username = normalizeUsername(e.target.value);
										updateEmployment("username", username);
										updateEmployment("slug", username);
									}}
									placeholder="contoh: adam"
								/>
								<p className="mt-1 text-xs text-muted-foreground">Slug otomatis mengikuti username. Jika username sudah ada, sistem akan meminta Anda menggantinya saat submit.</p>
							</Field>
						</CardContent>
					</Card>
				)}

			{/* ---- step 2: kontrak (read-only) ---- */}
			{/* ---- step 2: kontrak ---- */}
			{step === 2 && (
				<Card className="border sm:rounded-xl">
					<CardHeader className="pb-2 sm:pb-4">
						<CardTitle className="text-base sm:text-lg">Kontrak Kerja</CardTitle>
						<CardDescription className="text-xs sm:text-sm">
							Kontrak disiapkan oleh admin. Baca dengan saksama sebelum tanda tangan.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{!contractPreview.plainText && contractPreview.clauses.length === 0 ? (
							<div className="rounded-lg border border-dashed p-4 text-center">
								<p className="text-muted-foreground text-sm">Belum ada kontrak.</p>
								<p className="text-muted-foreground text-xs">Admin akan menyiapkan kontrak kerja untuk Anda.</p>
							</div>
						) : (
							<ContractPreview contract={contractPreview} employeeName={draft.personal.fullName} companyName={companyDisplayName} signatoryName={signatoryPersonName} signatorySignatureUrl={onboardingSettings.signatorySignatureUrl} />
						)}
					</CardContent>
				</Card>
			)}

				{/* ---- step 3: tanda tangan ---- */}
				{step === 3 && (
					<div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
						<Card className="flex-1 border sm:rounded-xl">
							<CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">Tanda Tangan &amp; Submit</CardTitle></CardHeader>
							<CardContent className="space-y-4">
								<SignaturePad value={draft.signatureDataUrl} onChange={(v) => setDraft((p) => ({ ...p, signatureDataUrl: v }))} />
								<label className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
									<Checkbox
										checked={draft.agreements.dataIsTrue}
										onCheckedChange={(v) => setDraft((p) => ({ ...p, agreements: { ...p.agreements, dataIsTrue: Boolean(v) } }))}
										className="size-5 border-2"
									/>
									<span className="font-medium text-foreground select-none">Saya menyatakan data yang saya isi benar.</span>
								</label>
								<label className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
									<Checkbox
										checked={draft.agreements.contractApproved}
										onCheckedChange={(v) => setDraft((p) => ({ ...p, agreements: { ...p.agreements, contractApproved: Boolean(v) } }))}
										className="size-5 border-2"
									/>
									<span className="font-medium text-foreground select-none">Saya menyetujui isi kontrak kerja.</span>
								</label>
							</CardContent>
						</Card>
						<div className="flex-1">
							<ContractPreview contract={contractPreview} employeeName={draft.personal.fullName} signatureDataUrl={draft.signatureDataUrl} companyName={companyDisplayName} signatoryName={signatoryPersonName} signatorySignatureUrl={onboardingSettings.signatorySignatureUrl} />
						</div>
					</div>
				)}

				{/* ---- navigation ---- */}
				{step < 4 && (
					<div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border bg-card/95 p-2 shadow-xl backdrop-blur sm:static sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
						<Button
							disabled={step === 0}
							onClick={() => setStep((s) => Math.max(0, s - 1))}
							size="sm"
							variant="outline"
							className="sm:h-10 sm:px-4 sm:text-sm"
						>
							<ChevronLeft className="mr-1 h-4 w-4 sm:mr-2" />Sebelumnya
						</Button>

						{/* mobile step dots */}
						<div className="flex gap-1 sm:hidden">
							{STEPS.slice(0, 4).map((_, idx) => (
								<div key={idx} className={`h-1.5 w-1.5 rounded-full transition-colors ${idx === step ? "bg-primary" : "bg-border"}`} />
							))}
						</div>

						<Button
							onClick={() => {
								if (step === 3) {
									handleSubmit();
									return;
								}
								if (!validateCurrentStep()) return;
								if (step === 1 && !draft.contract.plainText) applyTemplate();
								setStep((s) => Math.min(3, s + 1));
							}}
							disabled={isSubmitting}
							size="sm"
							className="sm:h-10 sm:px-4 sm:text-sm"
						>
							{step === 3 ? (isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengirim</> : "Kirim Pendaftaran") : <>Lanjut<ChevronRight className="ml-1 h-4 w-4 sm:ml-2" /></>}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}

/* -------- field helper -------- */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
	return (
		<div className={`space-y-1.5 sm:space-y-2 ${className ?? ""}`}>
			<Label className="text-xs sm:text-sm">{label}</Label>
			{children}
		</div>
	);
}

function RegisterLayout() {
	const location = useLocation();
	const isSelesai = location.pathname.includes("/register/selesai-");
	if (isSelesai) return <Outlet />;
	return <RegisterPage />;
}

export const Route = createLazyFileRoute("/register" as any)({ component: RegisterLayout });
