import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSignature, Download, Loader2, Plus, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";
import { useHybridSiteSettings, useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateSiteSettings } from "@/hooks/use-hybrid-write-actions";
import { compressFileToLimit, isOversized } from "@/lib/image-compress";
import { createClient } from "@/lib/client";
import {
	buildEmployeeContractTemplate,
	clausesToPlainText,
	type EmployeeContractClause,
	type EmployeeContractDraft,
} from "@/lib/employee-onboarding-schema";
import {
	getRoleSalaryDefaults,
	normalizeEmployeeOnboardingSettings,
	type EmployeeOnboardingSettings,
} from "@/lib/employee-onboarding-settings";

const DEFAULT_TEMPLATE_KEY = "__default__";

type ContractDraft = {
	title: string;
	clauses: EmployeeContractClause[];
	aiPrompt: string;
};

function normalizeLineBreaks(value: string) {
	return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function contractToDraft(contract: EmployeeContractDraft, aiPrompt = ""): ContractDraft {
	return {
		title: contract.title || "Perjanjian Kerja",
		clauses: contract.clauses?.length ? contract.clauses : [{ title: "Ketentuan Kontrak", body: contract.plainText || "" }],
		aiPrompt,
	};
}

function parseTemplateText(text: string): ContractDraft {
	const lines = normalizeLineBreaks(text).split("\n");
	const title = lines.shift()?.trim() || "Perjanjian Kerja";
	const clauses: EmployeeContractClause[] = [];
	let current: EmployeeContractClause | null = null;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const looksLikeTitle = /^(pasal|bab|klausul|ketentuan)\b/i.test(line) || (line.length <= 80 && !/[.!?]$/.test(line));
		if (looksLikeTitle) {
			if (current) clauses.push(current);
			current = { title: line, body: "" };
			continue;
		}
		if (!current) current = { title: "Ketentuan Kontrak", body: line };
		else current.body = [current.body, line].filter(Boolean).join("\n");
	}
	if (current) clauses.push(current);

	return {
		title,
		clauses: clauses.length ? clauses : [{ title: "Ketentuan Kontrak", body: normalizeLineBreaks(text) }],
		aiPrompt: "",
	};
}

function buildPlaceholderContract(roleName = "[Jabatan]", role?: any, signatoryName?: string) {
	const salaryDefaults = role ? getRoleSalaryDefaults(role) : {};
	return buildEmployeeContractTemplate(
		{ fullName: "[Nama Karyawan]", phone: "" },
		{
			roleId: "",
			roleName,
			startDate: "[Tanggal Mulai]",
			employmentType: "probation",
			location: "Djiwa Tentram",
			monthlySalary: salaryDefaults.monthlySalary ?? 0,
			dailyAllowance: salaryDefaults.dailyAllowance ?? 0,
			shiftRate: salaryDefaults.shiftRate ?? 0,
			username: "",
			slug: "",
		},
		signatoryName
	);
}

export default function AdminContractPage() {
	const siteSettings = useHybridSiteSettings();
	const roles = useHybridStaffRoles() ?? [];
	const updateSiteSettings = useHybridUpdateSiteSettings();

	const onboardingSettings = useMemo(
		() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding),
		[siteSettings?.employeeOnboarding]
	);

	const [selectedTemplateKey, setSelectedTemplateKey] = useState(DEFAULT_TEMPLATE_KEY);
	const [localTemplates, setLocalTemplates] = useState<Record<string, string>>({});
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [draft, setDraft] = useState<ContractDraft>(() => contractToDraft(buildPlaceholderContract("", undefined, onboardingSettings.signatoryName)));
	const [signatoryNameLocal, setSignatoryNameLocal] = useState(onboardingSettings.signatoryName || "Djiwa Tentram Cafe & Resto");
	const [signatoryPersonNameLocal, setSignatoryPersonNameLocal] = useState(onboardingSettings.signatoryPersonName || "");
	const [signatorySigUrlLocal, setSignatorySigUrlLocal] = useState(onboardingSettings.signatorySignatureUrl || "");

	useEffect(() => {
		setSignatoryNameLocal(onboardingSettings.signatoryName || "Djiwa Tentram Cafe & Resto");
	}, [onboardingSettings.signatoryName]);

	useEffect(() => {
		setSignatoryPersonNameLocal(onboardingSettings.signatoryPersonName || "");
	}, [onboardingSettings.signatoryPersonName]);

	useEffect(() => {
		setSignatorySigUrlLocal(onboardingSettings.signatorySignatureUrl || "");
	}, [onboardingSettings.signatorySignatureUrl]);

	const selectedRole = useMemo(
		() => roles.find((role: any) => String(role?._id) === selectedTemplateKey),
		[roles, selectedTemplateKey]
	);
	const selectedRoleName = selectedTemplateKey === DEFAULT_TEMPLATE_KEY
		? "Semua Jabatan"
		: (selectedRole?.name || "[Jabatan]");

	const effectiveTemplates = useMemo(
		() => ({ ...onboardingSettings.contractTemplatesByRoleId, ...localTemplates }),
		[localTemplates, onboardingSettings.contractTemplatesByRoleId]
	);
	const savedTemplate = effectiveTemplates[selectedTemplateKey] || "";
	const companyDisplayName = String(siteSettings?.companyName || siteSettings?.businessName || siteSettings?.storeName || siteSettings?.name || signatoryNameLocal || "Djiwa Tentram").trim();

	useEffect(() => {
		setLocalTemplates(onboardingSettings.contractTemplatesByRoleId);
	}, [onboardingSettings.contractTemplatesByRoleId]);

	const contractPreview: EmployeeContractDraft = useMemo(() => ({
		mode: "custom",
		title: draft.title,
		plainText: clausesToPlainText(draft.title, draft.clauses),
		clauses: draft.clauses,
	}), [draft]);

	const loadTemplate = useCallback((templateKey: string, settings: EmployeeOnboardingSettings) => {
		const templateText = { ...settings.contractTemplatesByRoleId, ...localTemplates }[templateKey];
		if (templateText) {
			setDraft(parseTemplateText(templateText));
			return;
		}
		const role = roles.find((item: any) => String(item?._id) === templateKey);
		setDraft(contractToDraft(buildPlaceholderContract(
			templateKey === DEFAULT_TEMPLATE_KEY ? "[Jabatan]" : (role?.name || "[Jabatan]"),
			role,
			signatoryNameLocal
		)));
	}, [localTemplates, roles, signatoryNameLocal]);

	useEffect(() => {
		loadTemplate(selectedTemplateKey, onboardingSettings);
	}, [loadTemplate, onboardingSettings, selectedTemplateKey]);

	const resetToDefault = useCallback(() => {
		setDraft((prev) => ({
			...contractToDraft(buildPlaceholderContract(
				selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName,
				selectedRole,
				signatoryNameLocal
			)),
			aiPrompt: prev.aiPrompt,
		}));
		toast.success("Direset ke template dasar");
	}, [selectedRoleName, selectedRole, signatoryNameLocal]);

	const handleGenerateAi = useCallback(async () => {
		if (!draft.aiPrompt.trim()) {
			toast.error("Tulis instruksi untuk AI terlebih dahulu");
			return;
		}
		setIsGenerating(true);
		try {
			const roleName = selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName;
			const companyName = signatoryNameLocal || "Djiwa Tentram Cafe & Resto";

			const systemPrompt = `Kamu adalah asisten HR yang membantu membuat kontrak kerja perusahaan F&B.
Buat kontrak kerja dalam bahasa Indonesia yang profesional dan lengkap.
Format response HARUS JSON saja, tanpa markdown, tanpa teks lain di luar JSON:
{
  "title": "Perjanjian Kerja [Jabatan]",
  "clauses": [
    { "title": "Pasal 1 — Para Pihak", "body": "..." },
    { "title": "Pasal 2 — Jabatan dan Lokasi Kerja", "body": "..." },
    { "title": "Pasal 3 — Masa Percobaan dan Tanggal Mulai", "body": "..." },
    { "title": "Pasal 4 — Kompensasi", "body": "..." },
    { "title": "Pasal 5 — Kewajiban Karyawan", "body": "..." },
    { "title": "Pasal 6 — Penutup", "body": "..." }
  ]
}
Setiap body pasal harus berupa paragraf lengkap 2-3 kalimat dalam bahasa Indonesia formal.
Pastikan body pasal 1 menyebut "${companyName} sebagai perwakilan perusahaan".`;

			const userMessage = `Buat kontrak kerja untuk jabatan: ${roleName}.
Perusahaan: ${companyName}.
Instruksi tambahan: ${draft.aiPrompt}.`;

			const { data, error } = await createClient().functions.invoke("yumi-ai", {
				body: {
					action: "yumiChat",
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userMessage },
					],
					chat_id: `generate-contract-${Date.now()}`,
				},
			});
			if (error) throw new Error(error.message);
			if (data?.error) throw new Error(data.error);

			const content: string = data?.content || "";
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (!jsonMatch) throw new Error("AI tidak menghasilkan format kontrak yang valid");

			const parsed = JSON.parse(jsonMatch[0]);
			const clauses = Array.isArray(parsed.clauses) ? parsed.clauses : [];
			if (clauses.length === 0) throw new Error("AI tidak menghasilkan pasal kontrak");

			setDraft({
				title: parsed.title || `Perjanjian Kerja ${roleName}`,
				clauses,
				aiPrompt: draft.aiPrompt,
			});
			toast.success("Kontrak berhasil dibuat oleh AI");
		} catch (e: any) {
			toast.error(e?.message || "Gagal membuat kontrak");
		} finally {
			setIsGenerating(false);
		}
	}, [draft.aiPrompt, selectedRoleName, signatoryNameLocal]);

	const addClause = useCallback(() => {
		setDraft((p) => ({
			...p,
			clauses: [...p.clauses, { title: "Klausul Baru", body: "" }],
		}));
	}, []);

	const updateClause = useCallback((idx: number, key: keyof EmployeeContractClause, value: string) => {
		setDraft((p) => {
			const clauses = [...p.clauses];
			clauses[idx] = { ...clauses[idx], [key]: value };
			return { ...p, clauses };
		});
	}, []);

	const removeClause = useCallback((idx: number) => {
		setDraft((p) => ({
			...p,
			clauses: p.clauses.filter((_, i) => i !== idx),
		}));
	}, []);

	async function saveTemplate() {
		if (!contractPreview.plainText.trim()) {
			toast.error("Isi kontrak tidak boleh kosong");
			return;
		}
		setIsSaving(true);
		try {
			const nextTemplates = {
				...effectiveTemplates,
				[selectedTemplateKey]: contractPreview.plainText,
			};
			const nextSettings = normalizeEmployeeOnboardingSettings({
				...onboardingSettings,
				contractTemplatesByRoleId: nextTemplates,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			setLocalTemplates(nextTemplates);
			toast.success(`Template untuk ${selectedRoleName} disimpan`);
		} catch (e: any) {
			toast.error(e?.message || "Gagal menyimpan template");
		} finally {
			setIsSaving(false);
		}
	}

	async function deleteTemplate() {
		if (!savedTemplate) return;
		if (!window.confirm(`Hapus template kontrak untuk ${selectedRoleName}?`)) return;
		setIsSaving(true);
		try {
			const nextTemplates = { ...effectiveTemplates };
			delete nextTemplates[selectedTemplateKey];
			const nextSettings = normalizeEmployeeOnboardingSettings({
				...onboardingSettings,
				contractTemplatesByRoleId: nextTemplates,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			setLocalTemplates(nextTemplates);
			setDraft(contractToDraft(buildPlaceholderContract(
				selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName,
				selectedRole,
				signatoryNameLocal
			)));
			toast.success("Template dihapus");
		} catch (e: any) {
			toast.error(e?.message || "Gagal menghapus template");
		} finally {
			setIsSaving(false);
		}
	}

	async function saveSignatoryName(name: string) {
		setSignatoryNameLocal(name);
		await saveSignatorySettings({ signatoryName: name });
	}

	async function saveSignatoryPersonName(name: string) {
		setSignatoryPersonNameLocal(name);
		await saveSignatorySettings({ signatoryPersonName: name });
	}

	async function saveSignatorySettings(updates: { signatoryName?: string; signatoryPersonName?: string; signatorySignatureUrl?: string }) {
		try {
			const nextSettings = normalizeEmployeeOnboardingSettings({
				...onboardingSettings,
				...updates,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			toast.success("Pengaturan perusahaan disimpan");
		} catch (e: any) {
			toast.error(e?.message || "Gagal menyimpan pengaturan");
		}
	}

	const signatorySigRef = useRef<HTMLInputElement>(null);
	const [isUploadingSig, setIsUploadingSig] = useState(false);
	const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

	async function uploadSignatorySignature(file: File) {
		if (!file.type.startsWith("image/")) {
			toast.error("Hanya file gambar yang diperbolehkan");
			return;
		}
		if (isOversized(file)) {
			toast.error("Ukuran file terlalu besar (max 5MB)");
			return;
		}
		setIsUploadingSig(true);
		try {
			const compressed = await compressFileToLimit(file);
			const blob = await fetch(compressed).then((r) => r.blob());
			const ext = file.name.split(".").pop() || "png";
			const path = `company/signatures/signature-${Date.now()}.${ext}`;
			const { data, error } = await createClient().storage.from("employee-contracts").upload(path, blob, { upsert: true });
			if (error) throw error;
			const { data: urlData } = createClient().storage.from("employee-contracts").getPublicUrl(data.path);
			setSignatorySigUrlLocal(urlData.publicUrl);
			await saveSignatorySettings({ signatorySignatureUrl: urlData.publicUrl });
			return urlData.publicUrl;
		} catch (e: any) {
			toast.error(e?.message || "Gagal mengunggah tanda tangan");
			throw e;
		} finally {
			setIsUploadingSig(false);
		}
	}

	async function downloadContractPdf() {
		const element = document.getElementById("employee-contract-preview");
		if (!element) { toast.error("Elemen pratinjau kontrak tidak ditemukan"); return; }
		setIsDownloadingPdf(true);
		try {
			const pdf = new jsPDF("p", "mm", "a4");
			const pw = pdf.internal.pageSize.getWidth();
			const ph = pdf.internal.pageSize.getHeight();
			const m = 15; const uw = pw - m * 2;
			let y = m;

			const head = element.querySelector(".text-\\[10px\\]");
			if (head) { pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.text(String(head.textContent || companyDisplayName), pw / 2, y, { align: "center" }); y += 5; }
			const h2 = element.querySelector("h2");
			if (h2) { pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.text(String(h2.textContent || contractPreview.title || "Perjanjian Kerja"), pw / 2, y, { align: "center" }); y += 8; }
			pdf.setDrawColor(180); pdf.line(m, y, pw - m, y); y += 6;

			const bodyEl = element.querySelector(".whitespace-pre-wrap");
			if (bodyEl) {
				pdf.setFontSize(10); pdf.setFont("helvetica", "normal");
				for (const ln of pdf.splitTextToSize(bodyEl.textContent || "", uw)) {
					if (y + 5 > ph - m) { pdf.addPage(); y = m; }
					pdf.text(ln, m, y); y += 5;
				}
			}
			y += 6;

			const sigDivs = element.querySelector(".grid")?.querySelectorAll(":scope > div");
			if (sigDivs && sigDivs.length >= 2) {
				const cw = uw / 2 - 5;
				const cy = y;
				const c0 = sigDivs[0].querySelectorAll("p");
				const c0Name = sigDivs[0].querySelector(".border-slate-400");
				let yy = cy;
				if (c0[0]) { pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.text(c0[0].textContent || "Pihak Perusahaan", m, yy); yy += 4; }
				if (c0[1]) { pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.text(c0[1].textContent || "", m, yy); yy += 4; }
				yy += 16;
				pdf.setDrawColor(180); pdf.line(m, yy, m + cw, yy); yy += 4;
				if (c0Name) { pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.text(c0Name.textContent || "", m, yy); }

				const c1 = sigDivs[1].querySelector("p");
				const c1Name = sigDivs[1].querySelector(".border-slate-400");
				let ey = cy;
				if (c1) { pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.text(c1.textContent || "Karyawan", m + cw + 10, ey); ey += 4; }
				ey += 20;
				pdf.setDrawColor(180); pdf.line(m + cw + 10, ey, m + cw + 10 + cw, ey); ey += 4;
				if (c1Name) { pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.text(c1Name.textContent || "", m + cw + 10, ey); }
			}

			pdf.save(`kontrak-${(contractPreview.title || "perjanjian-kerja").replace(/\\s+/g, "-").toLowerCase()}.pdf`);
			toast.success("PDF berhasil diunduh");
		} catch (e: any) { toast.error(e?.message || "Gagal mengunduh PDF"); }
		finally { setIsDownloadingPdf(false); }
	}

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6">
			{/* ── Header ── */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="gap-1">
							<FileSignature className="h-3 w-3" />
							Kontrak Kerja
						</Badge>
						{savedTemplate ? (
							<Badge variant="default" className="gap-1">Tersimpan</Badge>
						) : (
							<Badge variant="outline" className="text-muted-foreground">Belum tersimpan</Badge>
						)}
					</div>
					<h1 className="text-xl font-bold tracking-tight md:text-2xl">
						Kelola Template Kontrak
					</h1>
					<p className="text-sm text-muted-foreground max-w-xl">
						Template ini dibaca kandidat di halaman /register sebelum menandatangani. Role spesifik diprioritaskan, lalu default, lalu fallback sistem.
					</p>
				</div>

				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={resetToDefault}
						disabled={isSaving || isGenerating}
					>
						Reset ke Dasar
					</Button>
					<Button
						size="sm"
						variant="destructive"
						onClick={deleteTemplate}
						disabled={isSaving || !savedTemplate}
					>
						<Trash2 className="mr-1.5 h-3.5 w-3.5" />
						Hapus
					</Button>
					<Button
						size="sm"
						onClick={saveTemplate}
						disabled={isSaving}
					>
						{isSaving ? (
							<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-1.5 h-4 w-4" />
						)}
						Simpan Template
					</Button>
				</div>
			</div>

			{/* ── Company Info ── */}
			<Card className="border-border/60">
				<CardContent className="grid gap-4 p-4 md:grid-cols-3 md:items-start">
					<div className="space-y-2">
						<Label className="text-sm font-medium">Nama Perusahaan</Label>
						<Input
							value={signatoryNameLocal}
							onChange={(e) => setSignatoryNameLocal(e.target.value)}
							onBlur={() => {
								if (signatoryNameLocal !== onboardingSettings.signatoryName) {
									saveSignatoryName(signatoryNameLocal);
								}
							}}
							placeholder="Nama perusahaan/bisnis di header kontrak"
							className="h-10"
						/>
					</div>
					<div className="space-y-2">
						<Label className="text-sm font-medium">Nama Pihak Perusahaan</Label>
						<Input
							value={signatoryPersonNameLocal}
							onChange={(e) => setSignatoryPersonNameLocal(e.target.value)}
							onBlur={() => {
								if (signatoryPersonNameLocal !== onboardingSettings.signatoryPersonName) {
									saveSignatoryPersonName(signatoryPersonNameLocal);
								}
							}}
							placeholder="Nama orang yang tanda tangan"
							className="h-10"
						/>
					</div>
					<div className="space-y-2">
						<Label className="text-sm font-medium">Tanda Tangan Perusahaan</Label>
						<div className="flex items-center gap-3">
							{signatorySigUrlLocal ? (
								<div className="relative">
									<img
										alt="Tanda tangan perusahaan"
										className="h-12 w-auto object-contain rounded border"
										src={signatorySigUrlLocal}
									/>
									<Button
										size="icon"
										variant="ghost"
										className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
										onClick={() => { setSignatorySigUrlLocal(''); saveSignatorySettings({ signatorySignatureUrl: '' }); }}
									>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							) : (
								<span className="text-xs text-muted-foreground">Belum ada tanda tangan</span>
							)}
							<input
								ref={signatorySigRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={async (e) => {
									const file = e.target.files?.[0];
									if (!file) return;
									await uploadSignatorySignature(file);
									if (signatorySigRef.current) signatorySigRef.current.value = "";
								}}
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={isUploadingSig}
								onClick={() => signatorySigRef.current?.click()}
								type="button"
							>
								{isUploadingSig ? (
									<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
								) : (
									<Upload className="mr-1.5 h-3.5 w-3.5" />
								)}
								{isUploadingSig ? "Mengunggah..." : (signatorySigUrlLocal ? "Ganti" : "Unggah")}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* ── Toolbar ── */}
			<Card className="border-border/60">
				<CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<Label className="shrink-0 text-sm font-medium">Template untuk</Label>
						<Select
							value={selectedTemplateKey}
							onValueChange={setSelectedTemplateKey}
						>
							<SelectTrigger className="w-56">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={DEFAULT_TEMPLATE_KEY}>Semua Jabatan (default)</SelectItem>
								{roles.map((role: any) => (
									<SelectItem key={role._id} value={role._id}>{role.name}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						{savedTemplate ? (
							<>
								<span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
								Template aktif
								</>
							) : (
								<>
								<span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
								Menggunakan template dasar
								</>
							)}
					</div>
				</CardContent>
			</Card>

			{/* ── Editor + Preview ── */}
			<div className="flex flex-col gap-6 lg:flex-row">
				{/* Editor */}
				<div className="flex flex-col gap-5 lg:w-[55%]">
					{/* AI Section */}
					<Card className="border-border/60">
						<CardContent className="p-4 space-y-3">
							<div className="flex items-center justify-between">
								<Label className="text-sm font-semibold">Buat Kontrak dengan AI</Label>
								<Button
									size="sm"
									disabled={isGenerating}
									onClick={handleGenerateAi}
									type="button"
								>
									{isGenerating ? (
										<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
									) : (
										<Sparkles className="mr-1.5 h-4 w-4" />
									)}
									{isGenerating ? "Membuat..." : "Buat dengan AI"}
								</Button>
							</div>
							<Textarea
								value={draft.aiPrompt}
								onChange={(e) => setDraft((p) => ({ ...p, aiPrompt: e.target.value }))}
								placeholder="Contoh: masa percobaan 3 bulan, training barista, libur menyesuaikan jadwal outlet"
								className="text-sm min-h-[80px] resize-y"
							/>
						</CardContent>
					</Card>

					{/* Title */}
					<div className="space-y-1.5">
						<Label className="text-sm font-medium">Judul Kontrak</Label>
						<Input
							value={draft.title}
							onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
							placeholder="Perjanjian Kerja"
							className="h-10"
						/>
					</div>

					{/* Clauses */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<Label className="text-sm font-medium">
								Klausul
								<Badge variant="secondary" className="ml-2 text-[10px] font-normal">
									{draft.clauses.length} pasal
								</Badge>
							</Label>
							<Button
								size="sm"
								variant="outline"
								onClick={addClause}
								type="button"
							>
								<Plus className="mr-1 h-3.5 w-3.5" />
								Tambah Klausul
							</Button>
						</div>

						<ScrollArea className="max-h-[420px] rounded-xl border pr-2">
							<div className="space-y-3 p-3">
								{draft.clauses.map((clause, idx) => (
									<div
										key={idx}
										className="rounded-lg border bg-background p-3 space-y-2"
									>
										<div className="flex items-center gap-2">
											<Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
												{idx + 1}
											</Badge>
											<Input
												className="h-8 text-sm flex-1"
												value={clause.title}
												onChange={(e) => updateClause(idx, "title", e.target.value)}
												placeholder={`Judul pasal ${idx + 1}`}
											/>
											<Button
												size="icon"
												variant="ghost"
												className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
												onClick={() => removeClause(idx)}
											>
												<Trash2 className="h-3.5 w-3.5" />
											</Button>
										</div>
										<Textarea
											className="text-sm min-h-[72px] resize-y"
											value={clause.body}
											onChange={(e) => updateClause(idx, "body", e.target.value)}
											placeholder="Isi pasal..."
										/>
									</div>
								))}
							</div>
						</ScrollArea>
					</div>
				</div>

				<Separator orientation="vertical" className="hidden lg:block" />

				{/* Preview */}
				<div className="flex-1 space-y-3 min-w-0">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-foreground">Pratinjau Kontrak</h3>
						<div className="flex items-center gap-2">
							<Button size="sm" variant="outline" onClick={downloadContractPdf} disabled={isDownloadingPdf} type="button" className="h-7 gap-1.5 text-xs">
								{isDownloadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
								PDF
							</Button>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tampilan kandidat</span>
						</div>
					</div>
		<ContractPreview
						contract={contractPreview}
						employeeName="[Nama Karyawan]"
						companyName={companyDisplayName}
						signatoryName={signatoryPersonNameLocal || companyDisplayName}
						signatorySignatureUrl={signatorySigUrlLocal}
					/>
				</div>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register/contract" as any)({
	component: AdminContractPage,
});
