import type { EmployeeContractDraft } from "@/lib/employee-onboarding-schema";
import { sanitizeContractHtml } from "@/lib/sanitize-contract-html";

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ContractPreviewProps = {
	contract: EmployeeContractDraft;
	signatureDataUrl?: string;
	employeeName?: string;
	companyName?: string;
	signatoryName?: string;
	signatorySignatureUrl?: string;
};

export function ContractPreview({ contract, signatureDataUrl, employeeName, companyName, signatoryName, signatorySignatureUrl }: ContractPreviewProps) {
	const safeHtml = contract.html ? sanitizeContractHtml(contract.html) : "";
	const displayPlainText = contract.plainText
		? contract.plainText.replace(new RegExp(`^\\s*${escapeRegExp(contract.title || "Perjanjian Kerja")}\\s*\\n+`, "i"), "")
		: "";
	const displayCompanyName = companyName || "Djiwa Tentram Cafe & Resto";
	const displaySignatoryName = signatoryName || "Penanggung Jawab Perusahaan";

	return (
		<div
			className="rounded-xl border bg-white p-4 text-slate-950 shadow-sm sm:rounded-2xl sm:p-8"
			id="employee-contract-preview"
			style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
		>
			{/* header */}
			<div className="mb-5 border-b-2 border-slate-300 pb-4 text-center sm:mb-8 sm:pb-5">
				<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 sm:text-xs">
					{displayCompanyName}
				</p>
				<h2 className="mt-2 text-xl font-bold uppercase tracking-wide sm:mt-3 sm:text-2xl">
					{contract.title || "Perjanjian Kerja"}
				</h2>
			</div>

			{/* body */}
			{safeHtml ? (
				<div
					className="text-justify text-[11px] leading-[1.8] sm:text-xs sm:leading-[1.9] space-y-2"
					style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
					dangerouslySetInnerHTML={{
						__html: safeHtml
							.replace(/<h3>/g, '<h3 style="font-family: Times New Roman, Times, serif; font-size: 11pt; font-weight: bold; text-align: center; margin-top: 14px; margin-bottom: 6px;">')
							.replace(/<\/h3>/g, "</h3>")
							.replace(/<p>/g, '<p style="font-family: Times New Roman, Times, serif; font-size: 11pt; text-align: justify; line-height: 1.8; margin-bottom: 4px;">')
							.replace(/<\/p>/g, "</p>")
					}}
				/>
			) : (
				<div
					className="whitespace-pre-wrap text-justify text-[11px] leading-[1.8] sm:text-xs sm:leading-[1.9]"
					style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
				>
					{displayPlainText}
				</div>
			)}

			{/* signature area */}
			<div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-2 sm:gap-8" style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}>
				<div>
					<p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider sm:text-xs">Pihak Perusahaan</p>
					<p className="text-[11px] font-medium text-slate-800 sm:text-sm">{displayCompanyName}</p>
					{signatorySignatureUrl ? (
						<img
							alt="Tanda tangan perusahaan"
							className="mt-3 h-16 object-contain sm:mt-4 sm:h-24"
							src={signatorySignatureUrl}
						/>
					) : (
						<div className="mt-12 sm:mt-16" />
					)}
					<div className="border-slate-400 border-t pt-2 text-sm font-semibold sm:mt-2 sm:text-base">
						{displaySignatoryName}
					</div>
				</div>
				<div>
					<p className="text-[10px] text-slate-500 sm:text-sm">Karyawan</p>
					{signatureDataUrl ? (
						<img
							alt="Tanda tangan karyawan"
							className="mt-3 h-16 object-contain sm:mt-4 sm:h-24"
							src={signatureDataUrl}
						/>
					) : (
						<div className="mt-12 sm:mt-16" />
					)}
					<div className="border-slate-400 border-t pt-2 text-sm font-semibold sm:text-base">
						{employeeName || "Karyawan"}
					</div>
				</div>
			</div>
		</div>
	);
}
