import { createLazyFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { todayStrWIB } from "@/lib/wib-utils";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHybridSiteSettings, useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import { createClient } from "@/lib/client";
import {
	useHybridGenerateEmployeeContract,
	useHybridGenerateEmployeeOnboardingUploadUrl,
	useHybridSubmitEmployeeApplication,
} from "@/hooks/use-employee-onboarding-actions";
import {
	buildEmployeeContractTemplate,
	buildEmployeeOnboardingPayload,
	clausesToPlainText,
	createEmployeeSlug,
	sha256Hex,
	type EmployeeContractClause,
	type EmployeeOnboardingDraft,
} from "@/lib/employee-onboarding-schema";
import {
	DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS,
	type EmployeeOnboardingSettings,
	type EmployeeOnboardingFieldKey,
	type EmployeeOnboardingStepSetting,
	applyOnboardingDefaultsToDraft,
	normalizeEmployeeOnboardingSettings,
	getProbationEndDate,
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
		placeOfBirth: "",
		emergencyContactName: "",
		emergencyContactPhone: "",
		bankName: "",
		bankAccount: "",
	},
	employment: {
		roleId: "",
		roleName: "",
		startDate: todayStrWIB(),
		employmentType: "probation",
		monthlySalary: 0,
		dailyAllowance: 0,
		shiftRate: 0,
		location: "Djiwa Tentram Centrik",
		username: "",
		slug: "",
		homePin: "",
		password: "",
	},
	contract: { mode: "template", title: "", plainText: "", clauses: [] },
	signatureDataUrl: "",
	cvUrl: "",
	photoUrl: "",
	agreements: { dataIsTrue: false, contractApproved: false },
};

function dataUrlToBlob(dataUrl: string): Blob {
	const parts = dataUrl.split(",");
	const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
	const bytes = atob(parts[1]);
	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
	return new Blob([arr], { type: mime });
}

async function generateContractPdfBlob(_draft: Record<string, unknown>, _previewEl: HTMLElement | null): Promise<Blob> {
	// Fallback: return a simple PDF blob if html2canvas/jspdf isn't available
	const { default: jsPDF } = await import("jspdf");
	const doc = new jsPDF({ format: "a4", unit: "mm" });
	doc.text("Kontrak Karyawan", 105, 20, { align: "center" });
	doc.text("Kontrak akan tersedia setelah diunduh.", 105, 40, { align: "center" });
	return doc.output("blob");
}

function getEnabledOnboardingSteps(settings: EmployeeOnboardingSettings): EmployeeOnboardingStepSetting[] {
	return settings.steps.filter((s) => s.enabled);
}

function moneyValue(v?: number) {
	return v ? String(v) : "";
}

/** Build active step labels — fase 1: Data Diri + Data Kerja & CV */
function getActiveSteps(_settings: EmployeeOnboardingSettings): string[] {
	return ["Data Diri", "Data Kerja & CV"];
}

/** Submit after step 1 — redirect ke /register/selesai/:id, bukan step success di sini */
function getSubmitStepIndex(_settings: EmployeeOnboardingSettings): number {
	return 2; // step 0,1 are form steps
}

/* -------- page component -------- */
function RegisterPageWrapper() {
	const location = useLocation();
	// Jika URL child route (/register/selesai/...), render Outlet biar child component tampil
	if (location.pathname.startsWith("/register/selesai/")) {
		return <Outlet />;
	}
	return <RegisterPage />;
}

function RegisterPage() {
	const roles = useHybridStaffRoles() ?? [];
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);
	const registrationEnabled = onboardingSettings.registrationEnabled;
	const isDataLoading = useMemo(() => siteSettings === undefined && roles.length === 0, [siteSettings, roles]);
	const generateContract = useHybridGenerateEmployeeContract();
	const uploadFile = useHybridGenerateEmployeeOnboardingUploadUrl();
	const submitApplication = useHybridSubmitEmployeeApplication();

	const [step, setStep] = useState(0);
	const [draft, setDraft] = useState<EmployeeOnboardingDraft>(() => {
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			return saved ? { ...initialDraft, ...JSON.parse(saved) } : initialDraft;
		} catch { return initialDraft; }
	});
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [applicationId, setApplicationId] = useState<string | null>(null);
	const [cvFile, setCvFile] = useState<File | null>(null);
	const [isUploadingCv, setIsUploadingCv] = useState(false);
	const [cvUploadedUrl, setCvUploadedUrl] = useState<string | null>(null);
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
	const [photoUploadedUrl, setPhotoUploadedUrl] = useState<string | null>(null);

	/* ── Sync salary from payroll when role changes ── */
	useEffect(() => {
		const role = roles.find((r: any) => r._id === draft.employment.roleId);
		if (role && onboardingSettings.prefillSalaryFromRole) {
			import("@/lib/employee-onboarding-settings").then((mod) => {
				const salary = mod.getRoleSalaryDefaults(role);
				setDraft((prev) => ({
					...prev,
					employment: {
						...prev.employment,
						monthlySalary: prev.employment.monthlySalary || salary.monthlySalary || 0,
						dailyAllowance: prev.employment.dailyAllowance || salary.dailyAllowance || 0,
						shiftRate: prev.employment.shiftRate || salary.shiftRate || 0,
					},
				}));
			});
		}
	}, [draft.employment.roleId, onboardingSettings.prefillSalaryFromRole]);

	/* persist draft */
	useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);

	useEffect(() => {
		setDraft((prev) => applyOnboardingDefaultsToDraft(prev, onboardingSettings, roles as any[]));
	}, [onboardingSettings.defaultRoleId, onboardingSettings.defaultLocation, onboardingSettings.defaultEmploymentType, onboardingSettings.prefillSalaryFromRole, roles]);

	/* auto slug dari username */
	useEffect(() => {
		if (!draft.employment.username) return;
		const slug = createEmployeeSlug(draft.employment.username);
		setDraft((prev) => ({
			...prev,
			employment: { ...prev.employment, slug },
		}));
	}, [draft.employment.username]);

	const contractPreview = useMemo(() => {
		if (draft.contract.plainText || draft.contract.clauses.length > 0) return draft.contract;
		const roleTemplate = onboardingSettings.contractTemplatesByRoleId[draft.employment.roleId];
		if (roleTemplate) {
			return {
				mode: "template" as const,
				title: `Perjanjian Kerja ${draft.employment.roleName || ""}`,
				plainText: roleTemplate,
				html: `<article><p>${roleTemplate.replace(/\n/g, "<br/>")}</p></article>`,
				clauses: [{ title: "Ketentuan Kontrak", body: roleTemplate }],
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
		const c = buildEmployeeContractTemplate(draft.personal, draft.employment);
		setDraft((p) => ({ ...p, contract: c }));
		toast.success("Template kontrak dibuat");
	}

	async function handleGenerateAi() {
		setIsGenerating(true);
		try {
			const c = await generateContract({
				employee: draft.personal,
				employment: draft.employment,
				company: { name: "Djiwa Tentram Centrik" },
				options: { tone: "formal", customNotes: draft.contract.aiPrompt },
			});
			setDraft((p) => ({
				...p,
				contract: {
					mode: "ai",
					title: c.title ?? "Perjanjian Kerja",
					plainText: c.plainText ?? clausesToPlainText(c.title ?? "Perjanjian Kerja", c.clauses ?? []),
					html: c.html,
					clauses: c.clauses ?? [],
					aiPrompt: p.contract.aiPrompt,
				},
			}));
			toast.success("Kontrak AI berhasil dibuat");
		} catch (e: any) {
			toast.error(e?.message || "Gagal generate kontrak");
		} finally { setIsGenerating(false); }
	}

	function updateClause(idx: number, key: keyof EmployeeContractClause, value: string) {
		setDraft((p) => {
			const clauses = [...p.contract.clauses];
			clauses[idx] = { ...clauses[idx], [key]: value };
			return { ...p, contract: { ...p.contract, mode: "custom" as const, clauses, plainText: clausesToPlainText(p.contract.title, clauses), html: undefined } };
		});
	}

	async function handleSubmit() {
		// Phase 1 validation — hanya personal + employment data
		const personal = draft.personal;
		const employment = draft.employment;
		const errors: string[] = [];
		if (!personal.fullName.trim()) errors.push("Nama lengkap wajib diisi");
		if (!personal.phone.trim()) errors.push("No HP / WhatsApp wajib diisi");
		if (!employment.roleId) errors.push("Jabatan / role wajib dipilih");
		if (!employment.username.trim()) errors.push("Username wajib diisi");
		if (!employment.homePin || employment.homePin.length < 6) errors.push("PIN login harus 6 digit");
		if (errors.length) {
			errors.forEach((e) => toast.error(e));
			return;
		}

		setIsSubmitting(true);
		try {
			// Generate sequential registration number REG-YYYY-NNNN
			const supabase = createClient();
			const { data: regNum, error: regErr } = await supabase.rpc("next_registration_number", {
				p_category: "registration",
				p_prefix: "REG",
			});
			if (regErr || !regNum) throw new Error(regErr?.message || "Gagal generate nomor pendaftaran");
			const appKey = String(regNum);

			// Upload CV jika ada
			let cvUrl: string | null = cvUploadedUrl ?? null;
			if (cvFile && !cvUploadedUrl) {
				setIsUploadingCv(true);
				cvUrl = await uploadFile({ file: cvFile, contentType: cvFile.type || "application/pdf", fileName: `${appKey}-cv.${cvFile.name.split(".").pop() || "pdf"}`, folder: "employee-contracts/cvs" });
				setCvUploadedUrl(cvUrl);
				setIsUploadingCv(false);
			}

			// Upload foto profile jika ada
			let photoUrl: string | null = photoUploadedUrl ?? null;
			if (photoFile && !photoUploadedUrl) {
				setIsUploadingPhoto(true);
				photoUrl = await uploadFile({ file: photoFile, contentType: photoFile.type || "image/jpeg", fileName: `${appKey}-photo.${photoFile.name.split(".").pop() || "jpg"}`, folder: "employee-contracts/profile-photos" });
				setPhotoUploadedUrl(photoUrl);
				setIsUploadingPhoto(false);
			}

			// Build payload fase 1 — tanpa contract & signature
			const payload = buildEmployeeOnboardingPayload(
				{ ...draft, contract: { mode: "template", title: "", plainText: "", clauses: [] }, signatureDataUrl: "", agreements: { dataIsTrue: true, contractApproved: false } },
				{ cvUrl, photoUrl, registrationNumber: appKey },
			);
			payload.raw = {
				...payload.raw,
				registrationMode: onboardingSettings.registrationMode,
				pipelineStatus: onboardingSettings.pipeline.defaultStatus,
				documentChecklist: onboardingSettings.documentChecklist,
				salaryPreview: onboardingSettings.salaryPreview,
				registrationNumber: appKey,
				// Simpan SHA-256 fingerprint PIN agar admin bisa approve tanpa harus
				// ganti PIN — user bisa login dengan PIN yang sama saat registrasi
				homePinFingerprint: draft.employment.homePin
					? await sha256Hex(draft.employment.homePin)
					: undefined,
			};
			const id = await submitApplication({ payload });
			console.log("[RegisterPage] submit success, db id:", id, "appKey:", appKey);
			localStorage.removeItem(DRAFT_KEY);
			toast.success("Pendaftaran berhasil dikirim");

			// Redirect ke halaman tracking status — gunakan appKey (registrationNumber di raw)
			const dest = `/register/selesai/${appKey}`;
			console.log("[RegisterPage] redirecting to:", dest);
			window.location.replace(dest);
		} catch (e: any) {
			console.error("[RegisterPage] submit error:", e);
			toast.error(e?.message || "Gagal submit pendaftaran");
			setIsSubmitting(false);
		}
	}

	/* -------- validation -------- */
	function validateStep(step: number): boolean {
		const errors: string[] = [];
		switch (step) {
			case 0: {
				const p = draft.personal;
				if (!p.fullName.trim()) errors.push("Nama lengkap wajib diisi");
				if (!p.phone.trim()) errors.push("No HP / WhatsApp wajib diisi");
				if (!p.identityNumber?.trim()) errors.push("NIK / No identitas wajib diisi");
				break;
			}
			case 1: {
				const e = draft.employment;
				if (!e.roleId) errors.push("Jabatan / role wajib dipilih");
				if (!e.homePin || e.homePin.length < 6) errors.push("PIN login harus 6 digit");
				if (!e.username.trim()) errors.push("Username wajib diisi");
				break;
			}
		}
		errors.forEach((e) => toast.error(e));
		return errors.length === 0;
	}

	/* -------- render -------- */

	// Jika data masih loading, tampilkan skeleton
	if (isDataLoading) {
		return (
			<div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
				<div className="w-full max-w-lg space-y-4">
					<div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-muted" />
					<div className="mx-auto h-5 w-48 animate-pulse rounded-md bg-muted" />
					<div className="mx-auto h-3 w-32 animate-pulse rounded bg-muted" />
					<div className="rounded-xl border bg-card shadow-sm">
						<div className="space-y-4 px-6 py-10">
							<div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
							<div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
							<div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
							<div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
							<div className="flex justify-between pt-2">
								<div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
								<div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Jika registration dinonaktifkan, tampilkan halaman tertutup
	if (!registrationEnabled) {
		return (
			<div className="min-h-screen bg-background px-3 py-6 sm:px-4 sm:py-8"
				style={{ paddingLeft: "calc(0.75rem + var(--safe-area-left, 0px))", paddingRight: "calc(0.75rem + var(--safe-area-right, 0px))", paddingBottom: "calc(1.5rem + var(--safe-area-bottom, 0px))" }}>
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
		<div className="min-h-screen bg-background px-3 py-6 sm:px-4 sm:py-8"
			style={{ paddingLeft: "calc(0.75rem + var(--safe-area-left, 0px))", paddingRight: "calc(0.75rem + var(--safe-area-right, 0px))", paddingBottom: "calc(1.5rem + var(--safe-area-bottom, 0px))" }}>
			<div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">

				{/* ---- header ---- */}
				<div className="flex flex-col gap-3 rounded-2xl border bg-card/80 p-4 shadow-lg backdrop-blur sm:rounded-3xl sm:p-6 md:flex-row md:items-center md:justify-between">
					<div>
						<Badge className="mb-2 sm:mb-3" variant="secondary">
							<UserPlus className="mr-1 h-3 w-3" /> Register Karyawan
						</Badge>
						<h1 className="text-xl font-bold sm:text-3xl">Pendaftaran Karyawan Baru</h1>
					<p className="mt-1 text-muted-foreground text-xs sm:mt-2 sm:text-sm">
						Isi data diri dan data kerja + upload CV, lalu tunggu approval admin untuk lanjut ke kontrak.
					</p>
					</div>

					{/* step pills — scrollable on mobile */}
					<div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:gap-2">
						{getActiveSteps(onboardingSettings).map((label, idx) => (
							<div
								key={label}
								className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap sm:px-3 sm:py-1.5 ${idx === step ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground"}`}
							>
								{idx + 1}. {label}
							</div>
						))}
					</div>
				</div>

				<AnimatePresence mode="wait">
					{/* ---- step 0: data diri ---- */}
					{step === 0 && (
						<motion.div
							key="step-0"
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -12 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
						>
						<Card className="border sm:rounded-xl">
							<CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">Data Diri</CardTitle></CardHeader>
							<CardContent className="grid gap-3 sm:gap-4 md:grid-cols-2">
								<Field label="Nama lengkap"><Input value={draft.personal.fullName} onChange={(e) => updatePersonal("fullName", e.target.value)} placeholder="Nama sesuai identitas" /></Field>
								<Field label="No HP / WhatsApp"><Input value={draft.personal.phone} onChange={(e) => updatePersonal("phone", e.target.value)} placeholder="08xxxxxxxxxx" /></Field>
								<Field label="Email"><Input value={draft.personal.email} onChange={(e) => updatePersonal("email", e.target.value)} placeholder="nama@email.com" /></Field>
								<Field label="NIK / No Identitas"><Input value={draft.personal.identityNumber} onChange={(e) => updatePersonal("identityNumber", e.target.value)} /></Field>
								<Field label="Tanggal lahir"><Input type="date" value={draft.personal.birthDate} onChange={(e) => updatePersonal("birthDate", e.target.value)} /></Field>
								<Field label="Tempat lahir"><Input value={draft.personal.placeOfBirth} onChange={(e) => updatePersonal("placeOfBirth", e.target.value)} placeholder="Contoh: Jakarta" /></Field>
								<Field label="Kontak darurat"><Input value={draft.personal.emergencyContactName} onChange={(e) => updatePersonal("emergencyContactName", e.target.value)} placeholder="Nama kontak darurat" /></Field>
								<Field label="No kontak darurat"><Input value={draft.personal.emergencyContactPhone} onChange={(e) => updatePersonal("emergencyContactPhone", e.target.value)} /></Field>
								<Field label="Nama Bank"><Input value={draft.personal.bankName} onChange={(e) => updatePersonal("bankName", e.target.value)} placeholder="Contoh: BCA" /></Field>
								<Field label="No Rekening"><Input value={draft.personal.bankAccount} onChange={(e) => updatePersonal("bankAccount", e.target.value)} placeholder="0123456789" /></Field>
								<Field className="md:col-span-2" label="Alamat"><Textarea value={draft.personal.address} onChange={(e) => updatePersonal("address", e.target.value)} /></Field>
							</CardContent>
						</Card>
						</motion.div>
					)}

					{/* ---- step 1: data kerja ---- */}
					{step === 1 && (
						<motion.div
							key="step-1"
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -12 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
						>
						<Card className="border sm:rounded-xl">
							<CardHeader className="pb-2 sm:pb-4"><CardTitle className="text-base sm:text-lg">Data Kerja</CardTitle></CardHeader>
							<CardContent className="grid gap-3 sm:gap-4 md:grid-cols-2 scroll-mb-40">
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
								</Field>}
								{/* Fulltime/Partime/Freelance: pilih durasi 6/12/24 bulan */}
								{draft.employment.employmentType !== "probation" && onboardingSettings.probation.enabled && (
									<div className="space-y-2 md:col-span-2">
										<Field label="Durasi Probation">
											<select
												className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
												value={draft.employment.probationDurationMonths ?? 6}
												onChange={(e) => updateEmployment("probationDurationMonths", Number(e.target.value))}
											>
												<option value={6}>6 bulan</option>
												<option value={12}>1 tahun (12 bulan)</option>
												<option value={24}>2 tahun (24 bulan)</option>
											</select>
										</Field>
										{draft.employment.startDate && draft.employment.probationDurationMonths && (() => {
											const endDate = getProbationEndDate(draft.employment.startDate, "probation", draft.employment.probationDurationMonths);
											return endDate ? <p className="text-xs text-muted-foreground">Masa probation berakhir: <span className="font-semibold text-amber-600">{new Date(endDate).toLocaleDateString("id-ID")}</span></p> : null;
										})()}
									</div>
								)}
								{/* Probation: 1 bulan fixed */}
								{draft.employment.employmentType === "probation" && onboardingSettings.probation.enabled && (() => {
									const endDate = getProbationEndDate(draft.employment.startDate, draft.employment.employmentType);
									return endDate ? <p className="text-xs text-muted-foreground md:col-span-2">Probation: <span className="font-semibold text-amber-600">{new Date(endDate).toLocaleDateString("id-ID")}</span> (1 bulan)</p> : null;
								})()}
								<Field label="Lokasi"><Input value={draft.employment.location} onChange={(e) => updateEmployment("location", e.target.value)} /></Field>
								<Field label="PIN login (6 digit)"><Input maxLength={6} inputMode="numeric" value={draft.employment.homePin} onChange={(e) => updateEmployment("homePin", e.target.value.replace(/\D/g, ""))} /></Field>
								<Field label="Username"><Input value={draft.employment.username} onChange={(e) => updateEmployment("username", e.target.value)} /></Field>
								<Field label="Password"><Input type="password" value={draft.employment.password || ""} onChange={(e) => updateEmployment("password", e.target.value)} placeholder="Min. 6 karakter" /></Field>

								{/* Upload CV */}
								<div className="space-y-1.5 sm:space-y-2 md:col-span-2">
									<Label className="text-xs sm:text-sm">Upload CV (opsional)</Label>
									<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
										<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
											<FileUp className="h-4 w-4" />
											<span>{cvFile ? cvFile.name : "Pilih file CV"}</span>
											<input
												type="file"
												accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
												className="hidden"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														setCvFile(file);
														setCvUploadedUrl(null);
													}
												}}
											/>
										</label>
										{cvFile && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="text-xs text-destructive h-8"
												onClick={() => { setCvFile(null); setCvUploadedUrl(null); }}
											>
												Hapus
											</Button>
										)}
									</div>
									{cvFile && !cvUploadedUrl && (
										<p className="text-xs text-amber-600">CV akan diupload saat pendaftaran dikirim</p>
									)}
									{cvUploadedUrl && (
										<p className="text-xs text-emerald-600 flex items-center gap-1">
											<CheckCircle2 className="h-3 w-3" /> CV siap
										</p>
									)}
									<p className="text-xs text-muted-foreground">Format: PDF, DOC, JPG, PNG. Maksimal 5 MB.</p>
								</div>

								{/* Upload Foto Profile */}
								<div className="space-y-1.5 sm:space-y-2 md:col-span-2">
									<Label className="text-xs sm:text-sm">Upload Foto Profile (opsional)</Label>
									<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
										<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
											<Camera className="h-4 w-4" />
											<span>{photoFile ? photoFile.name : "Pilih file foto"}</span>
											<input
												type="file"
												accept=".jpg,.jpeg,.png,.webp"
												className="hidden"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														setPhotoFile(file);
														setPhotoUploadedUrl(null);
													}
												}}
											/>
										</label>
										{photoFile && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="text-xs text-destructive h-8"
												onClick={() => { setPhotoFile(null); setPhotoUploadedUrl(null); }}
											>
												Hapus
											</Button>
										)}
									</div>
									{photoFile && !photoUploadedUrl && (
										<p className="text-xs text-amber-600">Foto akan diupload saat pendaftaran dikirim</p>
									)}
									{photoUploadedUrl && (
										<p className="text-xs text-emerald-600 flex items-center gap-1">
											<CheckCircle2 className="h-3 w-3" /> Foto siap
										</p>
									)}
									{photoFile && (
										<div className="mt-1">
											<img
												src={URL.createObjectURL(photoFile)}
												alt="Preview foto"
												className="h-16 w-16 rounded-full object-cover border"
											/>
										</div>
									)}
								</div>
							</CardContent>
						</Card>
						</motion.div>
					)}

					{/* ---- step 2 (removed — kontrak & tanda tangan pindah ke selesai page setelah approval admin) ---- */}
				</AnimatePresence>

				{/* ---- navigation ---- */}
				{(() => { const submitIdx = getSubmitStepIndex(onboardingSettings);
				const maxFormIdx = submitIdx - 1; if (step > maxFormIdx) return null; return (
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
							{Array.from({ length: getSubmitStepIndex(onboardingSettings) }).map((_, idx) => (
								<div key={idx} className={`h-1.5 w-1.5 rounded-full transition-colors ${idx === step ? "bg-primary" : "bg-border"}`} />
							))}
						</div>

						{step === maxFormIdx ? (
							<Button
							disabled={isSubmitting || isUploadingCv || isUploadingPhoto}
							onClick={handleSubmit}
							size="sm"
							className="sm:h-10 sm:px-4 sm:text-sm"
						>
							{(isSubmitting || isUploadingCv || isUploadingPhoto) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
							{isUploadingCv ? "Mengupload CV..." : isUploadingPhoto ? "Mengupload Foto..." : "Kirim Pendaftaran"}
							</Button>
						) : (
							<Button
								onClick={() => {
									if (!validateStep(step)) return;
									setStep((s) => Math.min(maxFormIdx, s + 1));
								}}
								size="sm"
								className="sm:h-10 sm:px-4 sm:text-sm"
							>
								Lanjut<ChevronRight className="ml-1 h-4 w-4 sm:ml-2" />
							</Button>
						)}
					</div>
				); })()}
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

export const Route = createLazyFileRoute("/register")({ component: RegisterPageWrapper });
