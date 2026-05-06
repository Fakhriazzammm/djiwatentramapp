import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSignature, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { useHybridGenerateEmployeeContract } from "@/hooks/use-employee-onboarding-actions";
import { useHybridSiteSettings, useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateSiteSettings } from "@/hooks/use-hybrid-write-actions";
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

function buildPlaceholderContract(roleName = "[Jabatan]", role?: any) {
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
		}
	);
}

export default function AdminContractPage() {
	const siteSettings = useHybridSiteSettings();
	const roles = useHybridStaffRoles() ?? [];
	const generateContract = useHybridGenerateEmployeeContract();
	const updateSiteSettings = useHybridUpdateSiteSettings();

	const onboardingSettings = useMemo(
		() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding),
		[siteSettings?.employeeOnboarding]
	);

	const [selectedTemplateKey, setSelectedTemplateKey] = useState(DEFAULT_TEMPLATE_KEY);
	const [localTemplates, setLocalTemplates] = useState<Record<string, string>>({});
	const [isGenerating, setIsGenerating] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [draft, setDraft] = useState<ContractDraft>(() => contractToDraft(buildPlaceholderContract()));

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
			role
		)));
	}, [localTemplates, roles]);

	useEffect(() => {
		loadTemplate(selectedTemplateKey, onboardingSettings);
	}, [loadTemplate, onboardingSettings, selectedTemplateKey]);

	const resetToDefault = useCallback(() => {
		setDraft((prev) => ({
			...contractToDraft(buildPlaceholderContract(
				selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName,
				selectedRole
			)),
			aiPrompt: prev.aiPrompt,
		}));
		toast.success("Direset ke template dasar");
	}, [selectedRoleName, selectedRole]);

	const handleGenerateAi = useCallback(async () => {
		if (!draft.aiPrompt.trim()) {
			toast.error("Tulis instruksi untuk AI terlebih dahulu");
			return;
		}
		setIsGenerating(true);
		try {
			const c = await generateContract({
				employee: { fullName: "[Nama Karyawan]" },
				employment: { roleName: selectedRoleName === "Semua Jabatan" ? "[Jabatan]" : selectedRoleName, startDate: "[Tanggal Mulai]" },
				company: { name: "Djiwa Tentram Cafe & Resto" },
				options: { tone: "formal", customNotes: draft.aiPrompt },
			});
			setDraft({
				title: c.title ?? "Perjanjian Kerja",
				clauses: c.clauses ?? [],
				aiPrompt: draft.aiPrompt,
			});
			toast.success("Kontrak berhasil dibuat oleh AI");
		} catch (e: any) {
			toast.error(e?.message || "Gagal membuat kontrak");
		} finally {
			setIsGenerating(false);
		}
	}, [draft.aiPrompt, generateContract, selectedRoleName]);

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
				selectedRole
			)));
			toast.success("Template dihapus");
		} catch (e: any) {
			toast.error(e?.message || "Gagal menghapus template");
		} finally {
			setIsSaving(false);
		}
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
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tampilan kandidat</span>
					</div>
					<ContractPreview
						contract={contractPreview}
						employeeName="[Nama Karyawan]"
					/>
				</div>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register/contract" as any)({
	component: AdminContractPage,
});
