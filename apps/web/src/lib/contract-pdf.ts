import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { EmployeeOnboardingDraft } from "./employee-onboarding-schema";

export async function dataUrlToBlob(dataUrl: string) {
	const res = await fetch(dataUrl);
	return res.blob();
}

/**
 * Generate a PDF from the HTML contract preview DOM element using html2canvas.
 * This ensures the PDF matches the visual preview (Times New Roman font,
 * centering, bold titles, signature areas, etc.) exactly.
 */
export async function generateContractPdfBlob(
	_draft: EmployeeOnboardingDraft,
	element?: HTMLElement | null,
) {
	const pdf = new jsPDF("p", "mm", "a4");
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();

	if (!element) {
		// Fallback: generate simple text PDF if no DOM element available
		return generateFallbackPdf(_draft, pdf);
	}

	try {
		// Capture the contract preview as a canvas image
		const canvas = await html2canvas(element, {
			scale: 3, // High resolution for crisp text
			useCORS: true,
			allowTaint: false,
			logging: false,
			backgroundColor: "#ffffff",
		});

		const imgData = canvas.toDataURL("image/jpeg", 0.95);
		const imgWidth = pageWidth;
		const imgHeight = (canvas.height * imgWidth) / canvas.width;

		// If content fits on one page
		if (imgHeight <= pageHeight) {
			pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
		} else {
			// Split into multiple pages
			const totalPages = Math.ceil(imgHeight / pageHeight);
			for (let i = 0; i < totalPages; i++) {
				if (i > 0) pdf.addPage();
				// Calculate the portion of the canvas to render on this page
				const srcY = (i * pageHeight * canvas.width) / imgWidth;
				const srcHeight = (pageHeight * canvas.width) / imgWidth;
				// Create a temporary canvas for this page slice
				const pageCanvas = document.createElement("canvas");
				pageCanvas.width = canvas.width;
				pageCanvas.height = srcHeight;
				const pageCtx = pageCanvas.getContext("2d");
				if (pageCtx) {
					pageCtx.drawImage(
						canvas,
						0, srcY,
						canvas.width, srcHeight,
						0, 0,
						canvas.width, srcHeight,
					);
				}
				const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
				pdf.addImage(pageImgData, "JPEG", 0, 0, imgWidth, pageHeight);
			}
		}

		return pdf.output("blob");
	} catch (e) {
		console.warn("[contract-pdf] html2canvas failed, falling back to text PDF:", e);
		return generateFallbackPdf(_draft, pdf);
	}
}

/**
 * Fallback: simple text-based PDF when html2canvas fails or no DOM element.
 */
function generateFallbackPdf(
	draft: EmployeeOnboardingDraft,
	pdf: jsPDF,
) {
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 15;
	const usableWidth = pageWidth - margin * 2;
	let y = margin;

	const addTextLine = (
		line: string,
		fontSize = 10,
		style: "normal" | "bold" = "normal",
		align: "left" | "center" = "left",
	) => {
		pdf.setFont("helvetica", style);
		pdf.setFontSize(fontSize);
		if (y + fontSize * 0.45 > pageHeight - margin) {
			pdf.addPage();
			y = margin;
		}
		pdf.text(line, align === "center" ? pageWidth / 2 : margin, y, { align });
		y += fontSize * 0.45 + 1.5;
	};

	addTextLine("Djiwa Tentram Cafe & Resto", 10, "bold", "center");
	addTextLine(draft.contract.title || "Perjanjian Kerja", 16, "bold", "center");
	y += 2;
	pdf.setDrawColor(190);
	pdf.line(margin, y, pageWidth - margin, y);
	y += 7;

	const bodyText =
		draft.contract.plainText ||
		draft.contract.clauses
			.map((clause) => `${clause.title}\n${clause.body}`)
			.join("\n\n");
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(10);
	for (const paragraph of String(bodyText).split(/\n+/)) {
		for (const line of pdf.splitTextToSize(paragraph, usableWidth) as string[])
			addTextLine(line, 10);
		y += 2;
	}

	if (y > pageHeight - 55) {
		pdf.addPage();
		y = margin;
	}
	y += 8;
	const columnWidth = usableWidth / 2 - 6;
	const leftX = margin;
	const rightX = margin + columnWidth + 12;
	pdf.setFontSize(9);
	pdf.text("Pihak Perusahaan", leftX, y);
	pdf.text("Karyawan", rightX, y);
	y += 28;
	pdf.line(leftX, y, leftX + columnWidth, y);
	pdf.line(rightX, y, rightX + columnWidth, y);
	y += 5;
	pdf.setFont("helvetica", "bold");
	pdf.text("Penanggung Jawab Perusahaan", leftX, y);
	pdf.text(draft.personal.fullName || "Karyawan", rightX, y);

	return pdf.output("blob");
}
