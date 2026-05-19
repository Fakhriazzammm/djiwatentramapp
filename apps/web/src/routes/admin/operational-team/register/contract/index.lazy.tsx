import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { FileSignature, Plus, Trash2, Eye, Edit, Loader2, CheckCircle2, ArrowLeft, FileText, User } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHybridSiteSettings, useHybridStaffRoles, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateSiteSettings } from "@/hooks/use-hybrid-write-actions";
import { normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";

type TemplateInfo = {
	id: string;
	name: string;
	isDefault: boolean;
	isCustom: boolean;
	isSaved: boolean;
	clauseCount: number;
};

function countClauses(templateText: string): number {
	try {
		const parsed = JSON.parse(templateText);
		if (parsed?.clauses && Array.isArray(parsed.clauses)) return parsed.clauses.length;
	} catch {}
	// Plain text: count lines starting with Pasal/Bab/Klausul
	return templateText.split("\n").filter((l) => /^(pasal|bab|klausul|ketentuan)\s*\d/i.test(l.trim())).length || 1;
}

function extractNameFromKey(key: string, roles: any[]): string {
	if (key === "__default__") return "Semua Jabatan";
	if (key.startsWith("custom_")) return key.slice(7).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	const role = roles.find((r: any) => String(r?._id) === key);
	return role?.name || key;
}

function ContractLandingPage() {
	const siteSettings = useHybridSiteSettings();
	const roles = useHybridStaffRoles() ?? [];
	const updateSiteSettings = useHybridUpdateSiteSettings();
	const navigate = useNavigate();

	const onboardingSettings = useMemo(
		() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding),
		[siteSettings?.employeeOnboarding]
	);

	const [isDeleting, setIsDeleting] = useState<string | null>(null);
	const [isInitialLoading, setIsInitialLoading] = useState(true);

	useEffect(() => {
		if (siteSettings !== undefined) {
			setIsInitialLoading(false);
		}
	}, [siteSettings]);

	const contractTemplatesByRoleId = onboardingSettings.contractTemplatesByRoleId || {};

	const templates = useMemo((): TemplateInfo[] => {
		const result: TemplateInfo[] = [];

		// 1. Default template
		const defaultText = contractTemplatesByRoleId["__default__"];
		result.push({
			id: "__default__",
			name: "Semua Jabatan (Default)",
			isDefault: true,
			isCustom: false,
			isSaved: !!defaultText,
			clauseCount: defaultText ? countClauses(defaultText) : 0,
		});

		// 2. Role-based templates
		for (const role of roles) {
			const roleId = String(role?._id || "");
			if (!roleId) continue;
			const templateText = contractTemplatesByRoleId[roleId];
			result.push({
				id: roleId,
				name: role?.name || roleId,
				isDefault: false,
				isCustom: false,
				isSaved: !!templateText,
				clauseCount: templateText ? countClauses(templateText) : 0,
			});
		}

		// 3. Custom templates (key with prefix "custom_")
		for (const key of Object.keys(contractTemplatesByRoleId)) {
			if (key === "__default__") continue;
			if (roles.some((r: any) => String(r?._id) === key)) continue;
			if (!key.startsWith("custom_")) continue;
			const templateText = contractTemplatesByRoleId[key];
			result.push({
				id: key,
				name: extractNameFromKey(key, roles),
				isDefault: false,
				isCustom: true,
				isSaved: true,
				clauseCount: templateText ? countClauses(templateText) : 0,
			});
		}

		return result;
	}, [contractTemplatesByRoleId, roles]);

	const roleTemplateCount = templates.filter((t) => !t.isCustom).length;
	const customTemplateCount = templates.filter((t) => t.isCustom).length;
	const savedCount = templates.filter((t) => t.isSaved).length;

	const handleDelete = useCallback(async (templateId: string, name: string) => {
		if (!window.confirm(`Hapus template "${name}"?`)) return;
		setIsDeleting(templateId);
		try {
			const nextTemplates = { ...contractTemplatesByRoleId };
			delete nextTemplates[templateId];
			const nextSettings = normalizeEmployeeOnboardingSettings({
				...onboardingSettings,
				contractTemplatesByRoleId: nextTemplates,
			});
			await updateSiteSettings({ employeeOnboarding: nextSettings });
			triggerHybridRefresh();
			toast.success(`Template "${name}" dihapus`);
		} catch (e: any) {
			toast.error(e?.message || "Gagal menghapus template");
		} finally {
			setIsDeleting(null);
		}
	}, [contractTemplatesByRoleId, onboardingSettings, updateSiteSettings]);

	// Loading state
	if (isInitialLoading) {
		return (
			<div className="mx-auto max-w-5xl px-4 py-6">
				<div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted/50" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
							<div className="mb-3 h-4 w-32 rounded bg-muted/50" />
							<div className="mb-2 h-3 w-24 rounded bg-muted/50" />
							<div className="h-8 w-full rounded bg-muted/50" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-5xl px-4 py-6">
			{/* ── Header ── */}
			<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/admin/operational-team/register" })} className="h-8 w-8 p-0">
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<Badge variant="secondary" className="gap-1.5 text-xs">
						<FileSignature className="h-3 w-3" />
						Kontrak Kerja
					</Badge>
					<span className="text-xs text-muted-foreground">
						{savedCount} tersimpan
					</span>
				</div>
				<Button size="sm" onClick={() => navigate({ to: "/admin/operational-team/register/contract/edit/new" })} className="gap-1.5 text-xs">
					<Plus className="h-3.5 w-3.5" />
					Buat Template Baru
				</Button>
			</div>

			{/* ── Stats ── */}
			<div className="mb-6 grid grid-cols-3 gap-3">
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold">{roleTemplateCount}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Role</p>
				</div>
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold">{customTemplateCount}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kustom</p>
				</div>
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold">{savedCount}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tersimpan</p>
				</div>
			</div>

			{/* ── Card Grid ── */}
			{templates.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card/50 p-12 text-center">
					<FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
					<p className="text-sm font-medium text-muted-foreground">Belum ada template kontrak.</p>
					<p className="mb-4 text-xs text-muted-foreground/60">Buat template baru untuk setiap role.</p>
					<Button size="sm" onClick={() => navigate({ to: "/admin/operational-team/register/contract/edit/new" })} className="gap-1.5 text-xs">
						<Plus className="h-3.5 w-3.5" />
						Buat Template Baru
					</Button>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{templates.map((tmpl) => (
						<div
							key={tmpl.id}
							className={`group relative rounded-xl border bg-card shadow-sm transition-all hover:shadow-md ${
								!tmpl.isSaved ? "border-dashed border-muted-foreground/30" : ""
							}`}
						>
							<div className="p-4">
								{/* Header */}
								<div className="mb-3 flex items-start justify-between">
									<div className="flex items-center gap-2 min-w-0">
										<div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
											tmpl.isDefault
												? "bg-primary/10 text-primary"
												: tmpl.isCustom
												? "bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400"
												: "bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
										}`}>
											{tmpl.isDefault ? (
												<FileSignature className="h-4 w-4" />
											) : tmpl.isCustom ? (
												<FileText className="h-4 w-4" />
											) : (
												<User className="h-4 w-4" />
											)}
										</div>
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold leading-tight">{tmpl.name}</p>
											<div className="mt-0.5 flex items-center gap-1.5">
												{tmpl.isDefault && (
													<Badge variant="secondary" className="text-[9px] h-4 px-1.5">Default</Badge>
												)}
												{tmpl.isCustom && (
													<Badge variant="outline" className="text-[9px] h-4 px-1.5">Kustom</Badge>
												)}
												{tmpl.isSaved ? (
													<Badge variant="default" className="text-[9px] h-4 px-1.5 gap-0.5 bg-emerald-600 hover:bg-emerald-600">
														<CheckCircle2 className="h-2.5 w-2.5" /> {tmpl.clauseCount} ps
													</Badge>
												) : (
													<Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">
														Belum dibuat
													</Badge>
												)}
											</div>
										</div>
									</div>
								</div>

								{/* Actions */}
								<div className="flex items-center gap-1.5">
									<Button
										size="sm"
										variant="outline"
										className="h-7 flex-1 text-[11px] gap-1"
										onClick={() => navigate({ to: "/admin/operational-team/register/contract/edit/" + tmpl.id })}
									>
										<Edit className="h-3 w-3" />
										Edit
									</Button>
									{tmpl.isSaved && (
										<Button
											size="sm"
											variant="outline"
											className="h-7 flex-1 text-[11px] gap-1"
											onClick={() => navigate({ to: "/admin/operational-team/register/contract/" + tmpl.id + "/preview" })}
										>
											<Eye className="h-3 w-3" />
											Preview
										</Button>
									)}
									{!tmpl.isDefault && (
										<Button
											size="sm"
											variant="ghost"
											className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
											disabled={isDeleting === tmpl.id || !tmpl.isSaved}
											onClick={() => handleDelete(tmpl.id, tmpl.name)}
										>
											{isDeleting === tmpl.id ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												<Trash2 className="h-3 w-3" />
											)}
										</Button>
									)}
								</div>
							</div>
						</div>
					))}

					{/* Create new card */}
					<button
						type="button"
						onClick={() => navigate({ to: "/admin/operational-team/register/contract/edit/new" })}
						className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-card/50 p-6 text-sm text-muted-foreground transition-all hover:border-primary/50 hover:text-primary active:scale-[0.98]"
					>
						<Plus className="h-5 w-5" />
						Buat Template Baru
					</button>
				</div>
			)}
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register/contract/" as any)({
	component: ContractLandingPage,
});
