import { createLazyFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHybridSiteSettings, useHybridStaffRoles, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";
import {
	getRoleSalaryDefaults,
} from "@/lib/employee-onboarding-settings";
import {
	buildContractVariableContext,
	replaceContractVariables,
	buildEmployeeContractTemplate,
} from "@/lib/employee-onboarding-schema";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";

function normalizeLineBreaks(value: string) {
	return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function templateToString(t: any): string {
	if (typeof t === "string") return t;
	if (t && typeof t === "object" && "title" in t) {
		return t.title + "\n" + (t as any).clauses?.map((c: any) => c.title + "\n" + c.body).join("\n\n") || t.title;
	}
	return "";
}

function extractNameFromKey(key: string, roles: any[]): string {
	if (key === "__default__") return "Semua Jabatan (Default)";
	if (key.startsWith("custom_")) return key.slice(7).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
	const role = roles.find((r: any) => String(r?._id) === key);
	return role?.name || key;
}

function ContractPreviewPage() {
	const { templateId } = useParams({ from: "/admin/operational-team/register/contract/$templateId/preview" as any });
	const navigate = useNavigate();
	const siteSettings = useHybridSiteSettings();
	const roles = useHybridStaffRoles() ?? [];
	const [refreshKey, setRefreshKey] = useState(0);

	// Force refresh on mount to ensure fresh data
	useEffect(() => {
		triggerHybridRefresh();
		const timer = setTimeout(() => setRefreshKey((n) => n + 1), 500);
		return () => clearTimeout(timer);
	}, []);

	const [testName, setTestName] = useState("");
	const [testNIK, setTestNIK] = useState("");
	const [testAddress, setTestAddress] = useState("");
	const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
	const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);

	const onboardingSettings = useMemo(
		() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding),
		[siteSettings?.employeeOnboarding, refreshKey]
	);

	// Pre-fetch admin signature to data URL for PDF inclusion
	useEffect(() => {
		if (onboardingSettings.signatorySignatureUrl && !sigDataUrl) {
			fetch(onboardingSettings.signatorySignatureUrl, { mode: "cors" })
				.then((r) => r.blob())
				.then((blob) => {
					return new Promise<string>((resolve) => {
						const reader = new FileReader();
						reader.onloadend = () => resolve(reader.result as string);
						reader.readAsDataURL(blob);
					});
				})
				.then((dataUrl) => setSigDataUrl(dataUrl))
				.catch(() => {/* signature tetap tidak wajib */});
		}
	}, [onboardingSettings.signatorySignatureUrl, sigDataUrl]);
	const contractTemplatesByRoleId = onboardingSettings.contractTemplatesByRoleId || {};
	const templateValue = contractTemplatesByRoleId[templateId];
	const templateName = extractNameFromKey(templateId, roles);

	const rawTemplateText = useMemo(() => {
		if (!templateValue) return "";
		return normalizeLineBreaks(templateToString(templateValue));
	}, [templateValue]);

	// Build preview with test data if available
	const previewPlainText = useMemo(() => {
		if (!rawTemplateText) return "";
		if (!testName.trim()) return rawTemplateText;
		const selectedRole = roles.find((r: any) => String(r?._id) === templateId);
		const roleDefaults = selectedRole
			? (() => { const d = getRoleSalaryDefaults(selectedRole); return { monthlySalary: d.monthlySalary, dailyAllowance: d.dailyAllowance, shiftRate: d.shiftRate }; })()
			: { monthlySalary: 0, dailyAllowance: 0, shiftRate: 0 };
		const bonusConfig = (selectedRole as any)?.bonusTargetConfig ?? undefined;
		const ctx = buildContractVariableContext(
			{ fullName: testName, phone: "", identityNumber: testNIK || undefined, address: testAddress || undefined, birthDate: undefined, placeOfBirth: undefined },
			{ roleId: "", roleName: templateName, startDate: new Date().toISOString().slice(0, 10), employmentType: "full_time", location: onboardingSettings.defaultLocation || "Djiwa Tentram", monthlySalary: roleDefaults.monthlySalary, dailyAllowance: roleDefaults.dailyAllowance, shiftRate: roleDefaults.shiftRate, username: "", slug: "", contractDuration: 12 },
			onboardingSettings.signatoryName || "Djiwa Tentram",
			onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName || "Djiwa Tentram",
			onboardingSettings.signatoryCompanyAddress,
			onboardingSettings.signatoryCompanyNIB,
			onboardingSettings.signatoryPersonTitle,
			onboardingSettings.signatoryLocation,
		);
		return replaceContractVariables(rawTemplateText, ctx);
	}, [rawTemplateText, testName, testNIK, testAddress, roles, templateId, templateName, onboardingSettings]);

	const clauseCount = useMemo(() => {
		try {
			const parsed = JSON.parse(templateValue);
			if (parsed?.clauses && Array.isArray(parsed.clauses)) return parsed.clauses.length;
		} catch {}
		return rawTemplateText.split("\n").filter((l) => /^(pasal|bab|klausul|ketentuan)\s*\d/i.test(l.trim())).length || 1;
	}, [templateValue, rawTemplateText]);

	const displayText = previewPlainText || rawTemplateText;

	const previewContract = useMemo(() => {
		const paragraphs = displayText.split("\n").map((l: string) => l.trim()).filter(Boolean).map((para: string) => `<p>${para}</p>`).join("\n");
		return {
			mode: "template" as const,
			title: `Perjanjian Kerja ${templateName}`,
			plainText: displayText,
			html: `<article>${paragraphs}</article>`,
			clauses: [{ title: "Ketentuan Kontrak", body: displayText }],
		};
	}, [displayText, templateName]);

	async function downloadPdf() {
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

			const companyName = onboardingSettings.signatoryName || "Djiwa Tentram";
			const signatoryName = onboardingSettings.signatoryPersonName || companyName;

			addWrappedText(companyName, 10, "bold", "center");
			addWrappedText(`Perjanjian Kerja ${templateName}`, 16, "bold", "center");
			y += 2;
			pdf.setDrawColor(180);
			pdf.line(m, y, pw - m, y);
			y += 6;

			for (const paragraph of String(displayText || "").split(/\n+/)) {
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
			const signatureTop = y + 40;
			pdf.setDrawColor(180);
			// Sisipkan gambar tanda tangan admin jika tersedia
			if (sigDataUrl) {
				try {
					const sigImg = new Image();
					sigImg.src = sigDataUrl;
					const sigW = 40;
					const sigH = (sigImg.height / sigImg.width) * sigW;
					pdf.addImage(sigDataUrl, "PNG", m, y + 4, sigW, Math.min(sigH, 20));
				} catch {/* skip jika gagal */}
			}
			pdf.text(testName || "[Nama Karyawan]", m + cw + 12, y);
			y += 28;
			pdf.line(m, y, m + cw, y);
			pdf.line(m + cw + 12, y, m + cw + 12 + cw, y);
			y += 5;
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(10);
			pdf.text(signatoryName, m, y);
			pdf.text(testName || "[Nama Karyawan]", m + cw + 12, y);

			pdf.save(`kontrak-${templateName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
			toast.success("PDF berhasil diunduh");
		} catch (e: any) {
			toast.error(e?.message || "Gagal mengunduh PDF");
		} finally {
			setIsDownloadingPdf(false);
		}
	}

	// Not found
	if (!templateValue && siteSettings !== undefined) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-12 text-center">
				<p className="mb-2 text-lg font-semibold text-muted-foreground">Template tidak ditemukan</p>
				<p className="mb-4 text-sm text-muted-foreground/60">Template dengan ID "{templateId}" tidak tersedia.</p>
				<Button size="sm" variant="outline" onClick={() => navigate({ to: "/admin/operational-team/register/contract" })} className="gap-1.5 text-xs">
					<ArrowLeft className="h-3.5 w-3.5" />
					Kembali ke daftar template
				</Button>
			</div>
		);
	}

	// Loading
	if (!templateValue) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-6">
				<div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted/50" />
				<div className="h-96 animate-pulse rounded-xl bg-muted/50" />
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-6">
			{/* Header */}
			<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/admin/operational-team/register/contract" })} className="h-8 w-8 p-0">
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<p className="text-sm font-semibold">{templateName}</p>
						<Badge variant="secondary" className="text-[10px] h-4 gap-1">
							{clauseCount} pasal · Preview
						</Badge>
					</div>
				</div>
				<Button size="sm" variant="outline" onClick={downloadPdf} disabled={isDownloadingPdf} className="h-8 gap-1.5 text-xs">
					{isDownloadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
					PDF
				</Button>
			</div>

			{/* Test Data Inputs */}
			<div className="mb-4 rounded-lg border bg-card p-3">
				<p className="mb-2 text-[11px] font-medium text-muted-foreground">Data Uji (untuk preview variabel)</p>
				<div className="grid gap-2 sm:grid-cols-3">
					<input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="Nama karyawan" className="h-7 rounded-md border bg-background px-2 text-xs" />
					<input value={testNIK} onChange={(e) => setTestNIK(e.target.value)} placeholder="NIK 16 digit" className="h-7 rounded-md border bg-background px-2 text-xs" />
					<input value={testAddress} onChange={(e) => setTestAddress(e.target.value)} placeholder="Alamat" className="h-7 rounded-md border bg-background px-2 text-xs" />
				</div>
			</div>

			{/* Contract Preview */}
			<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
				<div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5">
					<h3 className="text-xs font-semibold">Perjanjian Kerja {templateName}</h3>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tampilan kandidat</span>
				</div>
				<div className="max-h-[70vh] overflow-y-auto p-3">
					<ContractPreview
						contract={previewContract}
						employeeName={testName || "[Nama Karyawan]"}
						companyName={onboardingSettings.signatoryName || "Djiwa Tentram"}
						signatoryName={onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName || "Djiwa Tentram"}
						signatorySignatureUrl={onboardingSettings.signatorySignatureUrl}
					/>
				</div>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register/contract/$templateId/preview")({
	component: ContractPreviewPage,
});
