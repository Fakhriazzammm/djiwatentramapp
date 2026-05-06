import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, UserPlus, XCircle } from "lucide-react";
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
	calculateEstimatedMonthlySalary,
	createEmployeeSlug,
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
		startDate: new Date().toISOString().slice(0, 10),
		employmentType: "probation",
		monthlySalary: 0,
		dailyAllowance: 0,
		shiftRate: 0,
		location: "Djiwa Tentram",
		username: "",
		slug: "",
		homePin: "",
	},
	contract: { mode: "template", title: "Perjanjian Kerja", plainText: "", clauses: [] },
	signatureDataUrl: "",
	agreements: { dataIsTrue: false, contractApproved: false },
};

const STEPS = ["Data Diri", "Data Kerja", "Kontrak", "Tanda Tangan", "Selesai"];

function moneyValue(v?: number) {
	return v ? String(v) : "";
}

/* -------- page component -------- */
function RegisterPage() {
	const roles = useHybridStaffRoles() ?? [];
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);
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
	const [applicationId, setApplicationId] = useState<string | null>(null);

	/* persist draft */
	useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);

	useEffect(() => {
		setDraft((prev) => applyOnboardingDefaultsToDraft(prev, onboardingSettings, roles as any[]));
	}, [onboardingSettings.defaultRoleId, onboardingSettings.defaultLocation, onboardingSettings.defaultEmploymentType, onboardingSettings.prefillSalaryFromRole, roles]);

	/* auto slug */
	useEffect(() => {
		if (!draft.personal.fullName) return;
		const slug = createEmployeeSlug(draft.personal.fullName);
		setDraft((prev) => ({
			...prev,
			employment: {
				...prev.employment,
				username: prev.employment.username || (onboardingSettings.autoGenerate.username ? slug : ""),
				slug: prev.employment.slug || (onboardingSettings.autoGenerate.slug ? slug : ""),
			},
		}));
	}, [draft.personal.fullName, onboardingSettings.autoGenerate.username, onboardingSettings.autoGenerate.slug]);

	const contractPreview = useMemo(() => {
		if (draft.contract.plainText || draft.contract.clauses.length > 0) return draft.contract;
		const roleTemplate = onboardingSettings.contractTemplatesByRoleId[draft.employment.roleId];
		const defaultTemplate = onboardingSettings.contractTemplatesByRoleId.__default__;
		const templateText = roleTemplate || defaultTemplate;
		if (templateText) {
			return {
				mode: "template" as const,
				title: `Perjanjian Kerja ${draft.employment.roleName || ""}`,
				plainText: templateText,
				html: `<article><p>${templateText.replace(/\n/g, "<br/>")}</p></article>`,
				clauses: [{ title: "Ketentuan Kontrak", body: templateText }],
			};
		}
		return buildEmployeeContractTemplate(draft.personal, draft.employment);
	}, [draft, onboardingSettings.contractTemplatesByRoleId]);

	/* helpers */
	const updatePersonal = (k: keyof EmployeeOnboardingDraft["personal"], v: string) =>
		setDraft((p) => ({ ...p, personal: { ...p.personal, [k]: v } }));
	const updateEmployment = (k: keyof EmployeeOnboardingDraft["employment"], v: any) =>
		setDraft((p) => ({ ...p, employment: { ...p.employment, [k]: v } }));

	function applyTemplate() {
		setDraft((p) => ({ ...p, contract: contractPreview }));
	}

	async function handleSubmit() {
		const validation = validateEmployeeOnboardingDraft({ ...draft, contract: contractPreview });
		const settingErrors = validateDraftForSettings({ ...draft, contract: contractPreview }, onboardingSettings);
		if (!validation.success || settingErrors.length) {
			[...validation.errors, ...settingErrors].forEach((e) => toast.error(e));
			return;
		}
		setIsSubmitting(true);
		try {
			const appKey = crypto.randomUUID();
			const sigBlob = await dataUrlToBlob(draft.signatureDataUrl || "");
			const signatureUrl = await uploadFile({ file: sigBlob, contentType: "image/png", fileName: `${appKey}-signature.png`, folder: "employee-contracts/signatures" });
			let contractPdfUrl: string | null = null;
			try {
				const pdfBlob = await generateContractPdfBlob({ ...draft, contract: contractPreview }, document.getElementById("employee-contract-preview"));
				contractPdfUrl = await uploadFile({ file: pdfBlob, contentType: "application/pdf", fileName: `${appKey}-contract.pdf`, folder: "employee-contracts/contracts" });
			} catch (e) { console.warn("PDF gen failed", e); }
			const payload = buildEmployeeOnboardingPayload({ ...draft, contract: contractPreview }, { signatureUrl, contractPdfUrl });
			payload.raw = {
				...payload.raw,
				registrationMode: onboardingSettings.registrationMode,
				pipelineStatus: onboardingSettings.pipeline.defaultStatus,
				documentChecklist: onboardingSettings.documentChecklist,
				salaryPreview: onboardingSettings.salaryPreview,
			};
			const id = await submitApplication({ payload });
			setApplicationId(String(id ?? appKey));
			localStorage.removeItem(DRAFT_KEY);
			setStep(4);
			toast.success("Pendaftaran berhasil dikirim");
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
		<div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-3 py-6 sm:px-4 sm:py-8">
			<div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">

				{/* ---- header ---- */}
				<div className="flex flex-col gap-3 rounded-2xl border bg-card/80 p-4 shadow-lg backdrop-blur sm:rounded-3xl sm:p-6 md:flex-row md:items-center md:justify-between">
					<div>
						<Badge className="mb-2 sm:mb-3" variant="secondary">
							<UserPlus className="mr-1 h-3 w-3" /> Register Karyawan
						</Badge>
						<h1 className="text-xl font-bold sm:text-3xl">Pendaftaran Karyawan Baru</h1>
						<p className="mt-1 text-muted-foreground text-xs sm:mt-2 sm:text-sm">
							Isi data, buat kontrak kerja, tanda tangan digital, lalu tunggu approval admin.
						</p>
					</div>

					{/* step pills — scrollable on mobile */}
					<div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:gap-2">
						{STEPS.map((label, idx) => (
							<div
								key={label}
								className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap sm:px-3 sm:py-1.5 ${idx === step ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground"}`}
							>
								{idx + 1}. {idx < 4 ? (idx === 0 ? label : label) : label}
							</div>
						))}
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
										updateEmployment("roleId", e.target.value);
										updateEmployment("roleName", role?.name ?? "");
									}}
								>
									<option value="">Pilih jabatan</option>
									{roles.map((r: any) => <option key={r._id} value={r._id}>{r.name}</option>)}
								</select>
							</Field>
							<Field label="Tanggal mulai"><Input type="date" value={draft.employment.startDate} onChange={(e) => updateEmployment("startDate", e.target.value)} /></Field>
							{onboardingSettings.fields.employmentType?.visible !== false && <Field label="Tipe kerja">
								<select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={draft.employment.employmentType} onChange={(e) => updateEmployment("employmentType", e.target.value)}>
									<option value="probation">Probation</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="freelance">Freelance</option>
								</select>
								{draft.employment.employmentType === "probation" && onboardingSettings.probation.enabled && (() => {
									const endDate = calculateProbationEndDate(draft.employment.startDate, onboardingSettings.probation.defaultMonths);
									return endDate ? <p className="mt-1 text-xs text-muted-foreground">Masa probation berakhir: <span className="font-semibold text-amber-600">{new Date(endDate).toLocaleDateString("id-ID")}</span></p> : null;
								})()}
							</Field>}
							<Field label="Lokasi"><Input value={draft.employment.location} onChange={(e) => updateEmployment("location", e.target.value)} /></Field>
							{onboardingSettings.salaryPreview.enabled && onboardingSettings.salaryPreview.candidateVisibility !== "hidden" && (() => {
								const estMonthly = calculateEstimatedMonthlySalary(draft.employment);
								const hasMonthly = (draft.employment.monthlySalary ?? 0) > 0;
								return (
									<div className="rounded-lg border bg-primary/5 p-3 text-sm md:col-span-2">
										<p className="font-medium">Estimasi Gaji Bulanan</p>
										<p className="text-foreground font-semibold">{formatOnboardingCurrency(estMonthly)}</p>
										<p className="text-muted-foreground mt-1">
											{hasMonthly ? `Gaji pokok ${formatOnboardingCurrency(draft.employment.monthlySalary)}` : null}
											{hasMonthly && (draft.employment.dailyAllowance ?? 0) > 0 ? " • " : ""}
											{(draft.employment.dailyAllowance ?? 0) > 0 ? `Harian ${formatOnboardingCurrency(draft.employment.dailyAllowance)} × 22 hari` : null}
											{((hasMonthly || (draft.employment.dailyAllowance ?? 0) > 0) && (draft.employment.shiftRate ?? 0) > 0) ? " • " : ""}
											{(draft.employment.shiftRate ?? 0) > 0 ? `Shift ${formatOnboardingCurrency(draft.employment.shiftRate)} × 22 hari` : null}
										</p>
									</div>
								);
							})()}
							<Field label="Gaji bulanan"><Input disabled={onboardingSettings.salaryPreview.behavior === "readonly"} inputMode="numeric" value={moneyValue(draft.employment.monthlySalary)} onChange={(e) => updateEmployment("monthlySalary", Number(e.target.value || 0))} /></Field>
							<Field label="Tunjangan transportasi"><Input disabled={onboardingSettings.salaryPreview.behavior === "readonly"} inputMode="numeric" value={moneyValue(draft.employment.dailyAllowance)} onChange={(e) => updateEmployment("dailyAllowance", Number(e.target.value || 0))} /></Field>
							<Field label="Rate shift"><Input disabled={onboardingSettings.salaryPreview.behavior === "readonly"} inputMode="numeric" value={moneyValue(draft.employment.shiftRate)} onChange={(e) => updateEmployment("shiftRate", Number(e.target.value || 0))} /></Field>
							<Field label="PIN login (6 digit)"><Input maxLength={6} inputMode="numeric" value={draft.employment.homePin} onChange={(e) => updateEmployment("homePin", e.target.value.replace(/\D/g, ""))} /></Field>
							<Field label="Username"><Input value={draft.employment.username} onChange={(e) => updateEmployment("username", e.target.value)} /></Field>
							<Field label="Slug"><Input value={draft.employment.slug} onChange={(e) => updateEmployment("slug", e.target.value)} /></Field>
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
							<ContractPreview contract={contractPreview} employeeName={draft.personal.fullName} />
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
								<label className="flex items-start gap-3 text-sm">
									<Checkbox
										checked={draft.agreements.dataIsTrue}
										onCheckedChange={(v) => setDraft((p) => ({ ...p, agreements: { ...p.agreements, dataIsTrue: Boolean(v) } }))}
									/>
									<span>Saya menyatakan data yang saya isi benar.</span>
								</label>
								<label className="flex items-start gap-3 text-sm">
									<Checkbox
										checked={draft.agreements.contractApproved}
										onCheckedChange={(v) => setDraft((p) => ({ ...p, agreements: { ...p.agreements, contractApproved: Boolean(v) } }))}
									/>
									<span>Saya menyetujui isi kontrak kerja.</span>
								</label>
								<Button className="w-full" disabled={isSubmitting} onClick={handleSubmit}>
									{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Kirim Pendaftaran
								</Button>
							</CardContent>
						</Card>
						<div className="flex-1">
							<ContractPreview contract={contractPreview} employeeName={draft.personal.fullName} signatureDataUrl={draft.signatureDataUrl} />
						</div>
					</div>
				)}

				{/* ---- step 4: selesai ---- */}
				{step === 4 && (
					<Card className="mx-auto max-w-md text-center sm:max-w-xl">
						<CardContent className="space-y-4 px-6 py-8 sm:px-10 sm:py-12">
							<CheckCircle2 className="mx-auto h-12 w-12 text-green-500 sm:h-16 sm:w-16" />
							<h2 className="text-lg font-bold sm:text-2xl">Pendaftaran berhasil dikirim</h2>
							<p className="text-muted-foreground text-sm">
								Status saat ini: <b>menunggu approval admin</b>.<br />
								Nomor pendaftaran: <b className="break-all">{applicationId}</b>
							</p>
							<Button onClick={() => { window.location.href = "/login"; }}>Kembali ke Login</Button>
						</CardContent>
					</Card>
				)}

				{/* ---- navigation ---- */}
				{step < 4 && (
					<div className="flex items-center justify-between gap-3 pt-1">
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
								if (step === 1 && !draft.contract.plainText) applyTemplate();
								setStep((s) => Math.min(3, s + 1));
							}}
							size="sm"
							className="sm:h-10 sm:px-4 sm:text-sm"
						>
							Lanjut<ChevronRight className="ml-1 h-4 w-4 sm:ml-2" />
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

export const Route = createLazyFileRoute("/register" as any)({ component: RegisterPage });
