import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileSignature, Download, GripVertical, Loader2, Plus, Save, Sparkles, Trash2, Upload } from "lucide-react";
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
import { useHybridSiteSettings, useHybridStaffRoles, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateSiteSettings } from "@/hooks/use-hybrid-write-actions";
import { compressFileToLimit, dataURLtoBlob, isOversized } from "@/lib/image-compress";
import { createClient } from "@/lib/client";
import {
	buildEmployeeContractTemplate,
	buildContractVariableContext,
	replaceContractVariables,
	clausesToPlainText,
	type EmployeeContractClause,
	type EmployeeContractDraft,
} from "@/lib/employee-onboarding-schema";
import {
	getRoleSalaryDefaults,
	normalizeEmployeeOnboardingSettings,
	type EmployeeOnboardingSettings,
} from "@/lib/employee-onboarding-settings";

type ContractTemplateValue = string | {
	version: number;
	title: string;
	clauses: EmployeeContractClause[];
	aiPrompt?: string;
	metadata?: Record<string, string>;
	salaryFieldMappings?: string[];
};

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
		const looksLikeTitle = /^(pasal|bab|klausul|ketentuan)\s*\d*/i.test(line);
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

function templateToString(t: string | ContractTemplateValue | null | undefined): string {
	if (typeof t === "string") return t;
	if (t && typeof t === "object" && "title" in t) {
		return t.title + "\n" + (t as any).clauses?.map((c: any) => c.title + "\n" + c.body).join("\n\n") || t.title;
	}
	return "";
}

function buildPlaceholderContract(roleName = "[Jabatan]", role?: any, signatoryName?: string) {
	const salaryDefaults = role ? getRoleSalaryDefaults(role) : { monthlySalary: 0, dailyAllowance: 0, shiftRate: 0, bonusTargetConfig: null, customAllowances: [] };
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
		signatoryName,
		(salaryDefaults as any).bonusTargetConfig ?? undefined,
		(salaryDefaults as any).customAllowances ?? []
	);
}

function getBonusBasisLabel(basis: string) {
	if (basis === "daily") return "Per Hari";
	if (basis === "monthly") return "Per Bulan";
	return "Per Shift";
}

function BonusSummaryBadge({ config }: { config?: { basis?: string; tiers?: { thresholdPct: number; bonusAmount: number }[] } | null }) {
	if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) return null;
	const basis = getBonusBasisLabel(config.basis || "shift");
	const tiers = config.tiers
		.filter((t) => t.bonusAmount > 0)
		.map((t) => `${t.thresholdPct}%: Rp${t.bonusAmount.toLocaleString("id-ID")}`)
		.join(" | ");
	if (!tiers) return null;
	return (
		<Badge variant="secondary" className="gap-1 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
			🎯 Bonus: {basis} — {tiers}
		</Badge>
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
	const [localTemplates, setLocalTemplates] = useState<Record<string, string | ContractTemplateValue>>({});
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [draft, setDraft] = useState<ContractDraft>(() => contractToDraft(buildPlaceholderContract("", undefined, onboardingSettings.signatoryName)));
	const [signatoryNameLocal, setSignatoryNameLocal] = useState(onboardingSettings.signatoryName || "Djiwa Tentram Cafe & Resto");
	const [signatoryPersonNameLocal, setSignatoryPersonNameLocal] = useState(onboardingSettings.signatoryPersonName || "");
	const [signatorySigUrlLocal, setSignatorySigUrlLocal] = useState(onboardingSettings.signatorySignatureUrl || "");
	const [companyAddressLocal, setCompanyAddressLocal] = useState(onboardingSettings.signatoryCompanyAddress || "");
	const [companyNIBLocal, setCompanyNIBLocal] = useState(onboardingSettings.signatoryCompanyNIB || "");
	const [personTitleLocal, setPersonTitleLocal] = useState(onboardingSettings.signatoryPersonTitle || "");
	const [signatoryLocationLocal, setSignatoryLocationLocal] = useState(onboardingSettings.signatoryLocation || "");
	const [showClauseLibrary, setShowClauseLibrary] = useState(false);
	const [showTestPreview, setShowTestPreview] = useState(false);
	const [testPreviewName, setTestPreviewName] = useState("");
	const [testPreviewNIK, setTestPreviewNIK] = useState("");
	const [testPreviewAddress, setTestPreviewAddress] = useState("");
	const [selectedEmploymentType, setSelectedEmploymentType] = useState("full_time");

	useEffect(() => {
		setSignatoryNameLocal(onboardingSettings.signatoryName || "Djiwa Tentram Cafe & Resto");
	}, [onboardingSettings.signatoryName]);

	useEffect(() => {
		setSignatoryPersonNameLocal(onboardingSettings.signatoryPersonName || "");
	}, [onboardingSettings.signatoryPersonName]);

	useEffect(() => {
		setSignatorySigUrlLocal(onboardingSettings.signatorySignatureUrl || "");
	}, [onboardingSettings.signatorySignatureUrl]);

	useEffect(() => {
		setCompanyAddressLocal(onboardingSettings.signatoryCompanyAddress || "");
	}, [onboardingSettings.signatoryCompanyAddress]);

	useEffect(() => {
		setCompanyNIBLocal(onboardingSettings.signatoryCompanyNIB || "");
	}, [onboardingSettings.signatoryCompanyNIB]);

	useEffect(() => {
		setPersonTitleLocal(onboardingSettings.signatoryPersonTitle || "");
	}, [onboardingSettings.signatoryPersonTitle]);

	useEffect(() => {
		setSignatoryLocationLocal(onboardingSettings.signatoryLocation || "");
	}, [onboardingSettings.signatoryLocation]);

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
	const persistedTemplate = templateToString(effectiveTemplates[selectedTemplateKey]);
	const savedTemplate = persistedTemplate;
	const companyDisplayName = String(siteSettings?.companyName || siteSettings?.businessName || siteSettings?.storeName || siteSettings?.name || signatoryNameLocal || "Djiwa Tentram").trim();

	useEffect(() => {
		setLocalTemplates(onboardingSettings.contractTemplatesByRoleId);
	}, [onboardingSettings.contractTemplatesByRoleId]);

	const contractPreview: EmployeeContractDraft = useMemo(() => ({
		mode: "custom",
		title: draft.title,
		plainText: clausesToPlainText(draft.title, draft.clauses),
		html: `<article>${draft.clauses.map((c) => {
			const paragraphs = c.body.split("\n").map((l: string) => l.trim()).filter(Boolean).map((para: string) => `<p>${para}</p>`).join("\n");
			return `<section><h3>${c.title}</h3>${paragraphs}</section>`;
		}).join("")}</article>`,
		clauses: draft.clauses,
	}), [draft]);
	const currentTemplateText = contractPreview.plainText;

	/* ── Test data preview ── */
	const testPreviewText = useMemo(() => {
		if (!testPreviewName.trim()) return null;
		const ctx = buildContractVariableContext(
			{
				fullName: testPreviewName,
				phone: "",
				identityNumber: testPreviewNIK || undefined,
				address: testPreviewAddress || undefined,
				birthDate: undefined,
				placeOfBirth: undefined,
			},
			{
				roleId: selectedRole?._id || "",
				roleName: selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName,
				startDate: new Date().toISOString().slice(0, 10),
				employmentType: selectedEmploymentType as any,
				location: onboardingSettings.defaultLocation || "Djiwa Tentram",
				monthlySalary: selectedRole ? getRoleSalaryDefaults(selectedRole).monthlySalary : 0,
				dailyAllowance: selectedRole ? getRoleSalaryDefaults(selectedRole).dailyAllowance : 0,
				shiftRate: selectedRole ? getRoleSalaryDefaults(selectedRole).shiftRate : 0,
				username: "",
				slug: "",
				contractDuration: 12,
			},
			companyDisplayName,
			signatoryPersonNameLocal || companyDisplayName,
			onboardingSettings.signatoryCompanyAddress,
			onboardingSettings.signatoryCompanyNIB,
			onboardingSettings.signatoryPersonTitle,
			onboardingSettings.signatoryLocation,
		);
		return replaceContractVariables(currentTemplateText, ctx);
	}, [testPreviewName, testPreviewNIK, testPreviewAddress, currentTemplateText, selectedRole, selectedRoleName, selectedEmploymentType, companyDisplayName, signatoryPersonNameLocal, onboardingSettings]);
	const isDirty = normalizeLineBreaks(currentTemplateText) !== normalizeLineBreaks(persistedTemplate);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!isDirty) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [isDirty]);

	const lastLoadedRef = useRef<string | null>(null);

	const loadTemplate = useCallback((templateKey: string, settings: EmployeeOnboardingSettings) => {
		const templateText = { ...settings.contractTemplatesByRoleId, ...localTemplates }[templateKey];
		if (templateText) {
			setDraft(parseTemplateText(templateToString(templateText)));
			lastLoadedRef.current = templateKey;
			return;
		}
		const role = roles.find((item: any) => String(item?._id) === templateKey);
		setDraft(contractToDraft(buildPlaceholderContract(
			templateKey === DEFAULT_TEMPLATE_KEY ? "[Jabatan]" : (role?.name || "[Jabatan]"),
			role,
			signatoryNameLocal
		)));
		lastLoadedRef.current = templateKey;
	}, [localTemplates, roles, signatoryNameLocal]);

	useEffect(() => {
		if (lastLoadedRef.current !== selectedTemplateKey) {
			loadTemplate(selectedTemplateKey, onboardingSettings);
		}
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

	const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

	const moveClause = useCallback((fromIdx: number, toIdx: number) => {
		if (fromIdx === toIdx) return;
		setDraft((p) => {
			const clauses = [...p.clauses];
			const [moved] = clauses.splice(fromIdx, 1);
			clauses.splice(toIdx, 0, moved);
			return { ...p, clauses };
		});
		// Auto-save setelah reorder
		setTimeout(() => { saveTemplate(); }, 100);
	}, []);

	/* ── Clause Library ── */
	const CLAUSE_LIBRARY: { title: string; body: string }[] = [
		{
			title: "Pasal Kerahasiaan (Non-Disclosure)",
			body: "Pihak Kedua wajib menjaga kerahasiaan seluruh data perusahaan, termasuk namun tidak terbatas pada resep, SOP, daftar pelanggan, strategi bisnis, dan informasi keuangan. Pelanggaran terhadap ketentuan ini dapat dikenakan sanksi sesuai peraturan perusahaan dan/atau tuntutan hukum yang berlaku.",
		},
		{
			title: "Pasal Non-Compete",
			body: "Pihak Kedua tidak diperkenankan bekerja atau terlibat dengan usaha sejenis yang berada dalam radius kompetitif yang ditetapkan perusahaan selama masa kerja dan 3 (tiga) bulan setelah berakhirnya hubungan kerja.",
		},
		{
			title: "Pasal Lembur (Overtime)",
			body: "Pihak Kedua diwajibkan bekerja lembur apabila diperlukan untuk memenuhi kebutuhan operasional. Lembur dihitung dan dikompensasikan sesuai dengan ketentuan yang berlaku di perusahaan dan peraturan perundang-undangan ketenagakerjaan.",
		},
		{
			title: "Pasal Disiplin & Sanksi",
			body: "Pelanggaran terhadap tata tertib dan SOP perusahaan akan dikenakan sanksi bertahap mulai dari surat peringatan (SP1, SP2, SP3) hingga pemutusan hubungan kerja untuk pelanggaran berat. Keputusan sanksi bersifat final dan mengikat.",
		},
		{
			title: "Pasal Masa Percobaan (Probation)",
			body: "Pihak Kedua menjalani masa percobaan selama 3 (tiga) bulan terhitung sejak tanggal mulai kerja. Selama masa percobaan, kedua pihak berhak mengakhiri hubungan kerja tanpa pemberitahuan terlebih dahulu. Setelah masa percobaan berakhir dan dinyatakan lulus, Pihak Kedua akan diangkat menjadi karyawan tetap.",
		},
		{
			title: "Pasal Cuti & Izin",
			body: "Pihak Kedua berhak atas cuti tahunan sebanyak 12 (dua belas) hari kerja setelah bekerja selama 12 (dua belas) bulan berturut-turut. Izin tidak masuk kerja karena alasan darurat dapat diberikan dengan pemberitahuan minimal 1 (satu) jam sebelum jam kerja dimulai.",
		},
	];


	async function saveTemplate() {
		if (!contractPreview.plainText.trim()) {
			toast.error("Isi kontrak tidak boleh kosong");
			return;
		}
		setIsSaving(true);
		try {
			// Save as structured JSON (serialized to plain text for DB compatibility)
			const templateValue: ContractTemplateValue = {
				version: 2,
				title: draft.title,
				clauses: draft.clauses.map((c, i) => ({ ...c, order: i })),
				metadata: {
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					updatedBy: "admin",
				},
				salaryFieldMappings: ["monthlyFixedSalary", "dailyAllowance", "baseShiftRate"],
			};
			const nextTemplates = {
				...effectiveTemplates,
				[selectedTemplateKey]: templateToString(templateValue),
			};
			const nextSettings = normalizeEmployeeOnboardingSettings({
				...onboardingSettings,
				contractTemplatesByRoleId: nextTemplates,
				signatoryName: signatoryNameLocal,
				signatoryPersonName: signatoryPersonNameLocal,
				signatorySignatureUrl: signatorySigUrlLocal,
				signatoryCompanyAddress: companyAddressLocal,
				signatoryCompanyNIB: companyNIBLocal,
				signatoryPersonTitle: personTitleLocal,
				signatoryLocation: signatoryLocationLocal,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			setLocalTemplates(nextTemplates);
			triggerHybridRefresh();
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
				signatoryName: signatoryNameLocal,
				signatoryPersonName: signatoryPersonNameLocal,
				signatorySignatureUrl: signatorySigUrlLocal,
				signatoryCompanyAddress: companyAddressLocal,
				signatoryCompanyNIB: companyNIBLocal,
				signatoryPersonTitle: personTitleLocal,
				signatoryLocation: signatoryLocationLocal,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			setLocalTemplates(nextTemplates);
			setDraft(contractToDraft(buildPlaceholderContract(
				selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName,
				selectedRole,
				signatoryNameLocal
			)));
			triggerHybridRefresh();
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

	async function saveSignatorySettings(updates: {
		signatoryName?: string; signatoryPersonName?: string; signatorySignatureUrl?: string;
		signatoryCompanyAddress?: string; signatoryCompanyNIB?: string;
		signatoryPersonTitle?: string; signatoryLocation?: string;
	}) {
		try {
			const nextSettings = normalizeEmployeeOnboardingSettings({
				...onboardingSettings,
				signatoryName: signatoryNameLocal,
				signatoryPersonName: signatoryPersonNameLocal,
				signatorySignatureUrl: signatorySigUrlLocal,
				signatoryCompanyAddress: companyAddressLocal,
				signatoryCompanyNIB: companyNIBLocal,
				signatoryPersonTitle: personTitleLocal,
				signatoryLocation: signatoryLocationLocal,
				...updates,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			triggerHybridRefresh();
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
			const compressedDataUrl = await compressFileToLimit(file);
			const blob = dataURLtoBlob(compressedDataUrl);
			const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "png";
			const path = `company/signatures/signature-${Date.now()}.${ext}`;
			const { data, error } = await createClient().storage.from("employee-contracts").upload(path, blob, { contentType: blob.type, upsert: true });
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
		setIsDownloadingPdf(true);
		try {
			const pdf = new jsPDF("p", "mm", "a4");
			const pw = pdf.internal.pageSize.getWidth();
			const ph = pdf.internal.pageSize.getHeight();
			const m = 15;
			const uw = pw - m * 2;
			let y = m;

			function addWrappedText(text: string, fontSize = 10, style: "normal" | "bold" = "normal", align: "left" | "center" = "left") {
				pdf.setFont("helvetica", style);
				pdf.setFontSize(fontSize);
				for (const ln of pdf.splitTextToSize(String(text || ""), uw) as string[]) {
					if (y + fontSize * 0.45 > ph - m) { pdf.addPage(); y = m; }
					pdf.text(ln, align === "center" ? pw / 2 : m, y, { align });
					y += fontSize * 0.45 + 1.5;
				}
			}

			// Gunakan testPreviewText jika tersedia (sudah di-replace variablenya)
			const pdfBodyText = testPreviewText || contractPreview.plainText ||
				contractPreview.clauses.map((c) => `${c.title}\n${c.body}`).join("\n\n");
			const pdfEmployeeName = testPreviewName || "[Nama Karyawan]";

			addWrappedText(companyDisplayName, 10, "bold", "center");
			addWrappedText(contractPreview.title || "Perjanjian Kerja", 16, "bold", "center");
			y += 2;
			pdf.setDrawColor(180);
			pdf.line(m, y, pw - m, y);
			y += 6;

			for (const paragraph of String(pdfBodyText || "").split(/\n+/)) {
				const trimmed = paragraph.trim();
				if (!trimmed) { y += 2; continue; }
				addWrappedText(trimmed, 10);
				y += 1;
			}

			if (y > ph - 55) { pdf.addPage(); y = m; }
			y += 8;
			const cw = uw / 2 - 6;
			pdf.setFontSize(9);
			pdf.setFont("helvetica", "normal");
			pdf.text("Pihak Perusahaan", m, y);
			pdf.text(pdfEmployeeName, m + cw + 12, y);
			y += 28;
			pdf.setDrawColor(180);
			pdf.line(m, y, m + cw, y);
			pdf.line(m + cw + 12, y, m + cw + 12 + cw, y);
			y += 5;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(10);
			pdf.text(signatoryPersonNameLocal || companyDisplayName, m, y);
			pdf.text(pdfEmployeeName, m + cw + 12, y);

			pdf.save(`kontrak-${(contractPreview.title || "perjanjian-kerja").replace(/\s+/g, "-").toLowerCase()}.pdf`);
			toast.success("PDF berhasil diunduh");
		} catch (e: any) { toast.error(e?.message || "Gagal mengunduh PDF"); }
		finally { setIsDownloadingPdf(false); }
	}
	return (
		<div className="mx-auto w-full max-w-7xl">
			<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3 flex-wrap">
					<Badge variant="secondary" className="gap-1 shrink-0">
						<FileSignature className="h-3 w-3" />
						Kontrak Kerja
					</Badge>
					{isDirty ? (
						<Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700">
							<AlertCircle className="h-3 w-3" /> Ada perubahan
						</Badge>
					) : savedTemplate ? (
						<Badge variant="default" className="gap-1">
							<CheckCircle2 className="h-3 w-3" /> Tersimpan
						</Badge>
					) : (
						<Badge variant="outline" className="text-muted-foreground">Belum tersimpan</Badge>
					)}
					{selectedRole && (getRoleSalaryDefaults(selectedRole) as any).bonusTargetConfig && (
						<BonusSummaryBadge config={(getRoleSalaryDefaults(selectedRole) as any).bonusTargetConfig} />
					)}
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					<Select value={selectedTemplateKey} onValueChange={(nextKey) => {
						if (isDirty && !window.confirm("Template belum disimpan. Pindah dan buang perubahan?")) return;
						setSelectedTemplateKey(nextKey || DEFAULT_TEMPLATE_KEY);
					}}>
						<SelectTrigger className="h-8 w-44 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={DEFAULT_TEMPLATE_KEY}>Semua Jabatan (default)</SelectItem>
							{roles.map((role: any) => (
								<SelectItem key={role._id} value={role._id}>{role.name}</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button size="sm" variant="outline" onClick={downloadContractPdf} disabled={isDownloadingPdf} type="button" className="h-8 gap-1.5 text-xs">
						{isDownloadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
						PDF
					</Button>
					<Button size="sm" variant="outline" onClick={resetToDefault} disabled={isSaving || isGenerating} className="h-8 text-xs">
						Reset
					</Button>
					<Button size="sm" variant="outline" onClick={deleteTemplate} disabled={isSaving || !savedTemplate} className="h-8 text-xs">
						<Trash2 className="mr-1 h-3 w-3" />
						Hapus
					</Button>
					<Button size="sm" onClick={saveTemplate} disabled={isSaving} className="h-8 text-xs">
						{isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
						{isSaving ? "Menyimpan..." : "Simpan"}
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-4 lg:flex-row">
				<div className="flex-1 min-w-0 space-y-3 lg:w-[60%]">
					<div className="rounded-lg border bg-card p-2.5">
						<div className="flex items-center justify-between mb-2">
							<button type="button" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowTestPreview(!showTestPreview)}>
								{showTestPreview ? "\u25BC" : "\u25B6"} Preview Data Uji
							</button>
							<span className="text-[10px] text-muted-foreground">Isi data untuk preview realtime</span>
						</div>
						{showTestPreview && (
							<div className="grid gap-2 sm:grid-cols-3">
								<input value={testPreviewName} onChange={(e) => setTestPreviewName(e.target.value)} placeholder="Nama karyawan" className="h-7 rounded-md border bg-background px-2 text-xs" />
								<input value={testPreviewNIK} onChange={(e) => setTestPreviewNIK(e.target.value)} placeholder="NIK 16 digit" className="h-7 rounded-md border bg-background px-2 text-xs" />
								<input value={testPreviewAddress} onChange={(e) => setTestPreviewAddress(e.target.value)} placeholder="Alamat" className="h-7 rounded-md border bg-background px-2 text-xs" />
							</div>
						)}
					</div>
					<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
						<div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5">
							<h3 className="text-xs font-semibold text-foreground">{contractPreview.title || "Perjanjian Kerja"}</h3>
							<span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tampilan kandidat</span>
						</div>
						<div className="p-3 max-h-[70vh] overflow-y-auto">
							<ContractPreview
								contract={testPreviewText ? (() => {
	const paragraphs = testPreviewText.split("\n").map((l: string) => l.trim()).filter(Boolean).map((para: string) => `<p>${para}</p>`).join("\n");
	return { ...contractPreview, plainText: testPreviewText, html: `<article>${paragraphs}</article>` };
})() : contractPreview}
								employeeName={testPreviewName || "[Nama Karyawan]"}
								companyName={companyDisplayName}
								signatoryName={signatoryPersonNameLocal || companyDisplayName}
								signatorySignatureUrl={signatorySigUrlLocal}
							/>
						</div>
					</div>
				</div>
				<div className="flex flex-col gap-3 lg:w-[40%] lg:max-w-md">
					<div className="rounded-lg border bg-card p-2.5 flex items-center gap-2">
						<span className="text-[11px] font-medium text-muted-foreground shrink-0">Tipe:</span>
						<Select value={selectedEmploymentType} onValueChange={(v) => { if (isDirty && !window.confirm("Ganti tipe kerja? Perubahan belum disimpan.")) return; setSelectedEmploymentType(v || "probation"); }}>
							<SelectTrigger className="h-7 text-xs flex-1">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="full_time">Penuh Waktu</SelectItem>
								<SelectItem value="probation">Masa Percobaan</SelectItem>
								<SelectItem value="part_time">Paruh Waktu</SelectItem>
								<SelectItem value="freelance">Freelance</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<details className="rounded-lg border bg-card" open={false}>
						<summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
							Informasi Perusahaan
						</summary>
						<div className="space-y-2 px-3 pb-3">
							<input value={signatoryNameLocal} onChange={(e) => setSignatoryNameLocal(e.target.value)} onBlur={() => { if (signatoryNameLocal !== onboardingSettings.signatoryName) saveSignatoryName(signatoryNameLocal); }} placeholder="Nama perusahaan" className="h-7 w-full rounded-md border bg-background px-2 text-xs" />
							<input value={signatoryPersonNameLocal} onChange={(e) => setSignatoryPersonNameLocal(e.target.value)} onBlur={() => { if (signatoryPersonNameLocal !== onboardingSettings.signatoryPersonName) saveSignatoryPersonName(signatoryPersonNameLocal); }} placeholder="Nama penandatangan" className="h-7 w-full rounded-md border bg-background px-2 text-xs" />
							<input value={companyAddressLocal} onChange={(e) => setCompanyAddressLocal(e.target.value)} onBlur={() => { if (companyAddressLocal !== onboardingSettings.signatoryCompanyAddress) saveSignatorySettings({ signatoryCompanyAddress: companyAddressLocal }); }} placeholder="Alamat perusahaan" className="h-7 w-full rounded-md border bg-background px-2 text-xs" />
							<div className="flex gap-2">
								<input value={companyNIBLocal} onChange={(e) => setCompanyNIBLocal(e.target.value)} onBlur={() => { if (companyNIBLocal !== onboardingSettings.signatoryCompanyNIB) saveSignatorySettings({ signatoryCompanyNIB: companyNIBLocal }); }} placeholder="NIB" className="h-7 flex-1 rounded-md border bg-background px-2 text-xs" />
								<input value={personTitleLocal} onChange={(e) => setPersonTitleLocal(e.target.value)} onBlur={() => { if (personTitleLocal !== onboardingSettings.signatoryPersonTitle) saveSignatorySettings({ signatoryPersonTitle: personTitleLocal }); }} placeholder="Jabatan" className="h-7 flex-1 rounded-md border bg-background px-2 text-xs" />
							</div>
							<input value={signatoryLocationLocal} onChange={(e) => setSignatoryLocationLocal(e.target.value)} onBlur={() => { if (signatoryLocationLocal !== onboardingSettings.signatoryLocation) saveSignatorySettings({ signatoryLocation: signatoryLocationLocal }); }} placeholder="Kota penandatanganan" className="h-7 w-full rounded-md border bg-background px-2 text-xs" />
							<div className="flex items-center gap-2">
								{signatorySigUrlLocal ? (
									<div className="relative">
										<img alt="TTD" className="h-8 w-auto rounded border object-contain" src={signatorySigUrlLocal} />
										<Button size="icon" variant="ghost" className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setSignatorySigUrlLocal(''); saveSignatorySettings({ signatorySignatureUrl: '' }); }}>
											<Trash2 className="h-2.5 w-2.5" />
										</Button>
									</div>
								) : <span className="text-[10px] text-muted-foreground">Belum ada TTD</span>}
								<input ref={signatorySigRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; await uploadSignatorySignature(file); if (signatorySigRef.current) signatorySigRef.current.value = ""; }} />
								<Button size="sm" variant="outline" disabled={isUploadingSig} onClick={() => signatorySigRef.current?.click()} type="button" className="h-7 text-xs">
									{isUploadingSig ? <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> : <Upload className="mr-1 h-2.5 w-2.5" />}
									{isUploadingSig ? "..." : (signatorySigUrlLocal ? "Ganti" : "Unggah TTD")}
								</Button>
							</div>
						</div>
					</details>
					<div className="rounded-lg border bg-card p-3 space-y-2">
						<div className="flex items-center justify-between">
							<Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
								Pasal <Badge variant="secondary" className="ml-1 text-[10px]">{draft.clauses.length}</Badge>
							</Label>
							<Button size="sm" variant="outline" onClick={addClause} type="button" className="h-6 text-[10px] gap-1">
								<Plus className="h-2.5 w-2.5" /> Pasal
							</Button>
						</div>
						<div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
							{draft.clauses.map((clause, idx) => (
								<div
									key={idx}
									draggable
									onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(idx)); }}
									onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
									onDragLeave={() => setDragOverIdx(null)}
									onDrop={(e) => {
										e.preventDefault();
										const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
										setDragOverIdx(null);
										moveClause(fromIdx, idx);
									}}
									className={`rounded-md border bg-background p-2 space-y-1.5 transition-colors ${dragOverIdx === idx ? "border-primary ring-1 ring-primary" : ""}`}
								>
									<div className="flex items-center gap-1.5">
										<button type="button" className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors">
											<GripVertical className="h-3.5 w-3.5" />
										</button>
										<Badge variant="outline" className="shrink-0 text-[9px] tabular-nums h-5 w-5 flex items-center justify-center p-0">{idx + 1}</Badge>
										<input className="h-7 flex-1 rounded border-0 bg-transparent px-1 text-xs font-medium outline-none focus:ring-1 focus:ring-border" value={clause.title} onChange={(e) => updateClause(idx, "title", e.target.value)} placeholder={"Pasal " + (idx + 1)} />
										<Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeClause(idx)}>
											<Trash2 className="h-3 w-3" />
										</Button>
									</div>
									<textarea className="w-full min-h-[48px] resize-y rounded border-0 bg-transparent px-1 text-[11px] leading-relaxed text-foreground outline-none focus:ring-1 focus:ring-border" value={clause.body} onChange={(e) => updateClause(idx, "body", e.target.value)} placeholder="Isi pasal..." />
								</div>
							))}
						</div>
					</div>
					<details className="rounded-lg border bg-card">
						<summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
							<Sparkles className="h-3 w-3" /> AI Assistant
						</summary>
						<div className="space-y-2 px-3 pb-3">
							<textarea value={draft.aiPrompt} onChange={(e) => setDraft((p) => ({ ...p, aiPrompt: e.target.value }))} placeholder="Contoh: masa percobaan 3 bulan, training barista..." className="w-full min-h-[60px] resize-y rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-border" />
							<Button size="sm" disabled={isGenerating} onClick={handleGenerateAi} type="button" className="h-7 w-full text-xs">
								{isGenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
								{isGenerating ? "Membuat..." : "Buat dengan AI"}
							</Button>
						</div>
					</details>
					<details className="rounded-lg border bg-card">
						<summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
							Klausul Siap Pakai
						</summary>
						<div className="space-y-1 px-3 pb-3 max-h-[200px] overflow-y-auto">
							{CLAUSE_LIBRARY.map((clause, idx) => (
								<button key={idx} type="button" className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left text-[11px] hover:bg-accent transition-colors" onClick={() => setDraft((p) => ({ ...p, clauses: [...p.clauses, { title: clause.title, body: clause.body }] }))}>
									<span className="font-medium text-xs">{clause.title}</span>
									<p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{clause.body}</p>
								</button>
							))}
						</div>
					</details>
				</div>
			</div>
		</div>
	);
}


export const Route = createLazyFileRoute("/admin/operational-team/register/contract" as any)({
	component: AdminContractPage,
});
