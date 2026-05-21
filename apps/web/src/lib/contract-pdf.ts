import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { EmployeeOnboardingDraft } from "./employee-onboarding-schema";

export async function dataUrlToBlob(dataUrl: string) {
	const res = await fetch(dataUrl);
	return res.blob();
}

/**
 * Wait for all images in an element to finish loading before capture.
 */
function waitForImages(element: HTMLElement, timeout = 5000): Promise<void> {
	const images = Array.from(element.querySelectorAll("img, canvas")) as (HTMLImageElement | HTMLCanvasElement)[];
	if (images.length === 0) return Promise.resolve();

	return new Promise((resolve) => {
		let loaded = 0;
		const total = images.length;
		const timer = setTimeout(() => resolve(), timeout);

		for (const img of images) {
			if (img instanceof HTMLImageElement) {
				if (img.complete && img.naturalWidth > 0) {
					loaded++;
					if (loaded >= total) { clearTimeout(timer); resolve(); }
				} else {
					img.onload = () => {
						loaded++;
						if (loaded >= total) { clearTimeout(timer); resolve(); }
					};
					img.onerror = () => {
						loaded++;
						if (loaded >= total) { clearTimeout(timer); resolve(); }
					};
				}
			} else {
				// Canvas is always "loaded"
				loaded++;
				if (loaded >= total) { clearTimeout(timer); resolve(); }
			}
		}
	});
}

/**
 * Generate a PDF from the HTML contract preview DOM element using html2canvas.
 * This ensures the PDF matches the visual preview (Times New Roman font,
 * centering, bold titles, signature areas, etc.) exactly, including both
 * company and employee signature images.
 */
export async function generateContractPdfBlob(
	_draft: EmployeeOnboardingDraft,
	element?: HTMLElement | null,
) {
	const pdf = new jsPDF("p", "mm", "a4");
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();

	if (!element) {
		return generateFallbackPdf(_draft, pdf);
	}

	try {
		// Wait for all images to load before capturing
		await waitForImages(element);

		// Small additional delay to allow CSS rendering to settle
		await new Promise((r) => setTimeout(r, 300));

		const canvas = await html2canvas(element, {
			scale: 3,
			useCORS: true,
			allowTaint: false,
			logging: false,
			backgroundColor: "#ffffff",
		});

		const imgData = canvas.toDataURL("image/jpeg", 0.95);
		const imgWidth = pageWidth;
		const imgHeight = (canvas.height * imgWidth) / canvas.width;

		if (imgHeight <= pageHeight) {
			pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
		} else {
			const totalPages = Math.ceil(imgHeight / pageHeight);
			for (let i = 0; i < totalPages; i++) {
				if (i > 0) pdf.addPage();
				const srcY = (i * pageHeight * canvas.width) / imgWidth;
				const srcHeight = (pageHeight * canvas.width) / imgWidth;
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
