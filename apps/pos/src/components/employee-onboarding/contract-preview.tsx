import type { EmployeeContractDraft } from "@/lib/employee-onboarding-schema";
import { sanitizeContractHtml } from "@/lib/sanitize-contract-html";
import { SignaturePad } from "@/components/employee-onboarding/signature-pad";

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/** Render legacy plain-text contracts in a deterministic single-column layout. */
function plainTextToHtml(text: string) {
	const lines = text.split("\n").map((line) => line.trim());
	const blocks: string[] = [];
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length > 0) {
			blocks.push(`<p>${paragraph.map(escapeHtml).join("<br />")}</p>`);
			paragraph = [];
		}
	};
	for (const line of lines) {
		if (!line) {
			flush();
			continue;
		}
		if (/^(Pasal|Bab|Klausul|Ketentuan)\s+\d+/i.test(line)) {
			flush();
			blocks.push(`<h3>${escapeHtml(line)}</h3>`);
		} else {
			paragraph.push(line);
		}
	}
	flush();
	return `<article>${blocks.join("\n")}</article>`;
}

function documentInfoToHtml(body: string) {
	const rows = body.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
		const separator = line.indexOf(":");
		return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : [line, ""];
	});
	return `<table class="contract-document-info"><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>`;
}

/**
 * Generate HTML from saved clauses for backward compatibility
 * (contracts saved before html field was added)
 */
function clausesToHtml(clauses: { title: string; body: string }[], title?: string) {
	const article = document.createElement("article");
	for (const clause of clauses) {
		const section = document.createElement("section");
		const h3 = document.createElement("h3");
		h3.textContent = clause.title;
		section.appendChild(h3);
		if (clause.title.toLowerCase() === "informasi dokumen") {
			section.insertAdjacentHTML("beforeend", documentInfoToHtml(clause.body));
		} else {
			const lines = clause.body.split("\n").map((l) => l.trim()).filter(Boolean);
			for (const line of lines) {
				const p = document.createElement("p");
				p.textContent = line;
				section.appendChild(p);
			}
		}
		article.appendChild(section);
	}
	return article.outerHTML;
}

/**
 * Fix <br/>-based HTML from old saved contracts:
 * 1. <br/><br/> → </p><p> (double break = paragraph separator)
 * 2. single <br/> → </p><p> (each line becomes its own paragraph)
 * 3. Detects pasal titles (e.g. "Pasal 1 — Para Pihak") and wraps in <h3>
 *    so they render as bold + centered, not just another justified paragraph
 */
function fixBrBasedHtml(html: string): string {
	// Old format: <article><p>line1<br/><br/>Pasal 1 — Title<br/>body...</p></article>
	// Step 1: split <br/> into separate <p> tags
	let fixed = html
		.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "</p><p>")
		.replace(/<br\s*\/?>/gi, "</p><p>");
	// Step 2: promote pasal titles from <p> to <h3>
	// Matches: <p>Pasal X — ...</p> or <p>Pasal X -- ...</p>
	fixed = fixed.replace(
		/<p>(Pasal\s+\d+\s*[—–-].*?)<\/p>/gi,
		"<h3>$1</h3>"
	);
	// Step 3: promote "Perjanjian Kerja" title line to <h3>
	fixed = fixed.replace(
		/<p>(Perjanjian Kerja\s*(?:\[.*?\])?)<\/p>/gi,
		"<h3>$1</h3>"
	);
	return fixed;
}

type ContractPreviewProps = {
	contract: EmployeeContractDraft;
	signatureDataUrl?: string;
	employeeName?: string;
	companyName?: string;
	signatoryName?: string;
	signatorySignatureUrl?: string;
	editable?: boolean;
	onSignatureChange?: (value: string) => void;
};

export function ContractPreview({ contract, signatureDataUrl, employeeName, companyName, signatoryName, signatorySignatureUrl, editable, onSignatureChange }: ContractPreviewProps) {
	const displayPlainText = (() => {
		const normalized = contract.plainText
			? contract.plainText.replace(new RegExp(`^\s*${escapeRegExp(contract.title || "Perjanjian Kerja")}\s*\n+`, "i"), "")
			: "";
		const lines = normalized.split("\n");
		if (lines[0]?.trim() && /^(perjanjian kerja|pkwt)/i.test(lines[0].trim())) lines.shift();
		if (lines[0]?.trim() && /^[A-Z][A-Z0-9 &/.-]{1,40}$/.test(lines[0].trim())) lines.shift();
		return lines.join("\n");
	})();
	// Prefer the deterministic parser for legacy/full-text contracts. This avoids
	// carrying old floating-column markup into the PDF renderer.
	const rawHtml = contract.clauses?.length > 1
		? clausesToHtml(contract.clauses, contract.title)
		: plainTextToHtml(displayPlainText);
	const safeHtml = rawHtml ? sanitizeContractHtml(fixBrBasedHtml(rawHtml)) : "";
	const displayCompanyName = companyName || "Djiwa Tentram Cafe & Resto";
	const displaySignatoryName = signatoryName || "Penanggung Jawab Perusahaan";

	return (
		<div
			className="border border-slate-300 bg-white p-6 text-slate-950 sm:p-10"
			id="employee-contract-preview"
			style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
		>
			{/* header */}
			<div className="mb-5 border-b-2 border-slate-300 pb-4 text-center sm:mb-8 sm:pb-5">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 sm:text-sm">
					{displayCompanyName}
				</p>
				<h2 className="mt-2 text-lg font-bold uppercase tracking-wide sm:mt-3 sm:text-2xl">
					{contract.title || "Perjanjian Kerja"}
				</h2>
			</div>

			{/* body */}
			{safeHtml ? (
				<div
					className="text-justify text-xs leading-[1.7] sm:text-sm sm:leading-[1.9] space-y-2"
					style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
					dangerouslySetInnerHTML={{
						__html: safeHtml
							.replace(/<h3>/g, '<h3 style="font-family: Times New Roman, Times, serif; font-size: 11pt; font-weight: bold; text-align: center; margin-top: 14px; margin-bottom: 6px;">')
							.replace(/<\/h3>/g, "</h3>")
							.replace(/<table class="contract-document-info">/g, '<table style="width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:10.5pt;">')
							.replace(/<th>/g, '<th style="width:38%; border:1px solid #cbd5e1; background:#f8fafc; padding:6px 8px; text-align:left; font-weight:bold;">')
							.replace(/<td>/g, '<td style="border:1px solid #cbd5e1; padding:6px 8px;">')
							.replace(/<p>/g, '<p style="font-family: Times New Roman, Times, serif; font-size: 11pt; text-align: justify; line-height: 1.8; margin-bottom: 4px;">')
							.replace(/<\/p>/g, "</p>")
					}}
				/>
			) : (
				<div
					className="whitespace-pre-wrap text-justify text-xs leading-[1.7] sm:text-sm sm:leading-[1.9]"
					style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
				>
					{displayPlainText}
				</div>
			)}

			{/* signature area */}
			<div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-2 sm:gap-8" style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}>
				<div>
					<p className="text-xs font-semibold text-slate-600 uppercase tracking-wider sm:text-sm">Pihak Perusahaan</p>
					<p className="text-xs font-medium text-slate-800 sm:text-sm">{displayCompanyName}</p>
					{signatorySignatureUrl ? (
						<img
							crossOrigin="anonymous"
							alt="Tanda tangan perusahaan"
							className="mt-3 h-20 object-contain sm:mt-4 sm:h-24"
							src={signatorySignatureUrl}
						/>
					) : (
						<div className="mt-12 sm:mt-16" />
					)}
					<div className="border-slate-400 border-t pt-2 text-xs font-semibold sm:mt-2 sm:text-base">
						{displaySignatoryName}
					</div>
				</div>
				<div>
					<p className="text-xs text-slate-500 sm:text-sm">Karyawan</p>
					{signatureDataUrl ? (
						<img
							crossOrigin="anonymous"
							alt="Tanda tangan karyawan"
							className="mt-3 h-20 object-contain sm:mt-4 sm:h-24"
							src={signatureDataUrl}
						/>
					) : editable ? (
						<div className="mt-2 sm:mt-3">
							<SignaturePad
								value={signatureDataUrl}
								onChange={(v) => onSignatureChange?.(v)}
							/>
						</div>
					) : (
						<div className="mt-12 sm:mt-16" />
					)}
					<div className="border-slate-400 border-t pt-2 text-xs font-semibold sm:text-base">
						{employeeName || "Karyawan"}
					</div>
				</div>
			</div>
		</div>
	);
}
