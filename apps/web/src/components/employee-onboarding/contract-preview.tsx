import type { EmployeeContractDraft } from "@/lib/employee-onboarding-schema";
import { sanitizeContractHtml } from "@/lib/sanitize-contract-html";

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ContractPreviewProps = {
	contract: EmployeeContractDraft;
	signatureDataUrl?: string;
	employeeName?: string;
	signatoryName?: string;
	signatorySignatureUrl?: string;
};

export function ContractPreview({ contract, signatureDataUrl, employeeName, signatoryName, signatorySignatureUrl }: ContractPreviewProps) {
	const safeHtml = contract.html ? sanitizeContractHtml(contract.html) : "";
	const displayPlainText = contract.plainText
		? contract.plainText.replace(new RegExp(`^\\s*${escapeRegExp(contract.title || "Perjanjian Kerja")}\\s*\\n+`, "i"), "")
		: "";
	const displaySignatoryName = signatoryName || "Djiwa Tentram Cafe & Resto";

	return (
		<div
			className="rounded-xl border bg-white p-4 text-slate-950 shadow-sm sm:rounded-2xl sm:p-6"
			id="employee-contract-preview"
		>
			{/* header */}
			<div className="mb-4 border-b pb-3 text-center sm:mb-6 sm:pb-4">
				<p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 sm:text-xs sm:tracking-[0.2em]">
					{displaySignatoryName}
				</p>
				<h2 className="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl">
					{contract.title || "Perjanjian Kerja"}
				</h2>
			</div>

			{/* body */}
			{safeHtml ? (
				<div className="prose prose-slate max-w-none text-sm sm:text-base" dangerouslySetInnerHTML={{ __html: safeHtml }} />
			) : (
				<div className="whitespace-pre-wrap text-xs leading-6 sm:text-sm sm:leading-7">{displayPlainText}</div>
			)}

			{/* signature area */}
			<div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-2 sm:gap-8">
				<div>
					<p className="text-[10px] text-slate-500 sm:text-sm">Pihak Perusahaan</p>
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
