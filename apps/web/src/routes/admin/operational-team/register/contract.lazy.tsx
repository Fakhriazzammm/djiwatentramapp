import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSignature, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

function buildPlaceholderContract(roleName = "[Jabatan]") {
	return buildEmployeeContractTemplate(
		{ fullName: "[Nama Karyawan]", phone: "" },
		{
			roleId: "",
			roleName,
			startDate: "[Tanggal Mulai]",
			employmentType: "probation",
			location: "Djiwa Tentram",
			monthlySalary: 0,
			dailyAllowance: 0,
			shiftRate: 0,
			username: "",
			slug: "",
		}
	);
}

function AdminContractPage() {
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
	const selectedRoleName = selectedTemplateKey === DEFAULT_TEMPLATE_KEY ? "Semua Role" : (selectedRole?.name || "[Jabatan]");
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
		setDraft(contractToDraft(buildPlaceholderContract(templateKey === DEFAULT_TEMPLATE_KEY ? "[Jabatan]" : (role?.name || "[Jabatan]"))));
	}, [localTemplates, roles]);

	useEffect(() => {
		loadTemplate(selectedTemplateKey, onboardingSettings);
	}, [loadTemplate, onboardingSettings, selectedTemplateKey]);

	const applyTemplate = useCallback(() => {
		setDraft((prev) => ({
			...contractToDraft(buildPlaceholderContract(selectedRoleName === "Semua Role" ? "[Jabatan]" : selectedRoleName)),
			aiPrompt: prev.aiPrompt,
		}));
		toast.success("Template diterapkan di editor");
	}, [selectedRoleName]);

	const handleGenerateAi = useCallback(async () => {
		setIsGenerating(true);
		try {
			const c = await generateContract({
				employee: { fullName: "[Nama Karyawan]" },
				employment: { roleName: selectedRoleName === "Semua Role" ? "[Jabatan]" : selectedRoleName, startDate: "[Tanggal Mulai]" },
				company: { name: "Djiwa Tentram Cafe & Resto" },
				options: { tone: "formal", customNotes: draft.aiPrompt },
			});
			setDraft({
				title: c.title ?? "Perjanjian Kerja",
				clauses: c.clauses ?? [],
				aiPrompt: draft.aiPrompt,
			});
			toast.success("Kontrak AI berhasil dibuat");
		} catch (e: any) {
			toast.error(e?.message || "Gagal generate kontrak");
		} finally {
			setIsGenerating(false);
		}
	}, [draft.aiPrompt, generateContract, selectedRoleName]);

	const addClause = useCallback(() => {
		setDraft((p) => ({
			...p,
			clauses: [...p.clauses, { title: "Pasal Baru", body: "Isi klausul..." }],
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
			toast.error("Isi kontrak belum boleh kosong");
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
			toast.success(`Template kontrak ${selectedRoleName} disimpan`);
		} catch (e: any) {
			toast.error(e?.message || "Gagal menyimpan template kontrak");
		} finally {
			setIsSaving(false);
		}
	}

	async function deleteTemplate() {
		if (!savedTemplate) return;
		if (!window.confirm(`Hapus template kontrak ${selectedRoleName}?`)) return;
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
			setDraft(contractToDraft(buildPlaceholderContract(selectedRoleName === "Semua Role" ? "[Jabatan]" : selectedRoleName)));
			toast.success("Template kontrak dihapus");
		} catch (e: any) {
			toast.error(e?.message || "Gagal menghapus template kontrak");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="mx-auto w-full max-w-7xl space-y-4 md:space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Badge className="mb-2" variant="secondary">
						<FileSignature className="mr-1 h-3 w-3" /> Kontrak Kerja
					</Badge>
					<h2 className="font-bold text-foreground text-xl tracking-tight md:text-3xl">
						Pengaturan Kontrak Register
					</h2>
					<p className="mt-1 text-muted-foreground text-xs md:text-sm">
						Semua input, form editor, kanvas preview, dan CRUD template kontrak berada di halaman admin ini. Halaman /register hanya menampilkan preview kontrak untuk dibaca dan ditandatangani.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button size="sm" onClick={saveTemplate} disabled={isSaving} className="sm:h-10 sm:px-4 sm:text-sm">
						{isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
						Simpan Template
					</Button>
					<Button size="sm" variant="outline" onClick={deleteTemplate} disabled={isSaving || !savedTemplate} className="sm:h-10 sm:px-4 sm:text-sm">
						<Trash2 className="mr-1.5 h-4 w-4" /> Hapus
					</Button>
				</div>
			</div>

			<Card>
				<CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
					<div className="space-y-1.5 lg:col-span-2">
						<Label>Template untuk role</Label>
						<select
							className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
							value={selectedTemplateKey}
							onChange={(event) => setSelectedTemplateKey(event.target.value)}
						>
							<option value={DEFAULT_TEMPLATE_KEY}>Semua Role (default)</option>
							{roles.map((role: any) => (
								<option key={role._id} value={role._id}>{role.name}</option>
							))}
						</select>
					</div>
					<div className="rounded-lg border bg-muted/30 p-3 text-xs">
						<p className="font-semibold">Status</p>
						<p className="text-muted-foreground">{savedTemplate ? "Tersimpan di pengaturan register" : "Belum tersimpan, memakai template dasar"}</p>
					</div>
					<div className="rounded-lg border bg-muted/30 p-3 text-xs">
						<p className="font-semibold">Dipakai di /register</p>
						<p className="text-muted-foreground">Role spesifik diprioritaskan, lalu default, lalu fallback sistem.</p>
					</div>
				</CardContent>
			</Card>

			<div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
				<Card className="flex-1 border sm:rounded-xl">
					<CardHeader className="pb-2 sm:pb-4">
						<CardTitle className="text-base sm:text-lg">Form Editor Kontrak</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 sm:space-y-4">
						<div className="flex flex-wrap gap-2">
							<Button size="sm" onClick={applyTemplate} type="button" variant="outline" className="sm:h-10 sm:px-4 sm:text-sm">
								Gunakan Template
							</Button>
							<Button size="sm" disabled={isGenerating} onClick={handleGenerateAi} type="button" className="sm:h-10 sm:px-4 sm:text-sm">
								{isGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
								{isGenerating ? "Generate..." : "Generate AI"}
							</Button>
						</div>

						<div className="space-y-2">
							<Label>Catatan untuk AI</Label>
							<Textarea
								value={draft.aiPrompt}
								onChange={(e) => setDraft((p) => ({ ...p, aiPrompt: e.target.value }))}
								placeholder="Masa probation 3 bulan, training barista, libur menyesuaikan jadwal outlet"
								className="text-sm"
							/>
						</div>

						<div className="space-y-2">
							<Label>Judul Kontrak</Label>
							<Input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
						</div>

						<div className="space-y-2.5 sm:space-y-3">
							{draft.clauses.map((clause, idx) => (
								<div key={idx} className="group rounded-lg border p-2.5 sm:rounded-xl sm:p-3">
									<div className="mb-2 flex items-center gap-2">
										<Input className="text-sm" value={clause.title} onChange={(e) => updateClause(idx, "title", e.target.value)} />
										<Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => removeClause(idx)}>
											<Trash2 className="h-4 w-4 text-destructive" />
										</Button>
									</div>
									<Textarea className="text-sm" value={clause.body} onChange={(e) => updateClause(idx, "body", e.target.value)} />
								</div>
							))}
							<Button size="sm" type="button" variant="outline" onClick={addClause}>
								<Plus className="mr-1 h-4 w-4" /> Tambah Klausul
							</Button>
						</div>
					</CardContent>
				</Card>

				<div className="flex-1 space-y-2">
					<div className="rounded-xl border bg-muted/30 px-4 py-3">
						<p className="text-sm font-semibold">Kanvas Preview Kontrak</p>
						<p className="text-xs text-muted-foreground">Preview inilah yang dibaca karyawan di tab Kontrak /register sebelum tanda tangan.</p>
					</div>
					<ContractPreview contract={contractPreview} employeeName="[Nama Karyawan]" />
				</div>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register/contract" as any)({
	component: AdminContractPage,
});
