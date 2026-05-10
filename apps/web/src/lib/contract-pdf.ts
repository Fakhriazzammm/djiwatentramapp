import { jsPDF } from "jspdf";
import type { EmployeeOnboardingDraft } from "./employee-onboarding-schema";

export async function dataUrlToBlob(dataUrl: string) {
	const res = await fetch(dataUrl);
	return res.blob();
}

function splitLines(pdf: jsPDF, text: string, width: number) {
	return pdf.splitTextToSize(String(text || ""), width) as string[];
}

export async function generateContractPdfBlob(draft: EmployeeOnboardingDraft, element?: HTMLElement | null) {
	const pdf = new jsPDF("p", "mm", "a4");
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();
	const margin = 15;
	const usableWidth = pageWidth - margin * 2;
	let y = margin;

	const addTextLine = (line: string, fontSize = 10, style: "normal" | "bold" = "normal", align: "left" | "center" = "left") => {
		pdf.setFont("helvetica", style);
		pdf.setFontSize(fontSize);
		if (y + fontSize * 0.45 > pageHeight - margin) {
			pdf.addPage();
			y = margin;
		}
		pdf.text(line, align === "center" ? pageWidth / 2 : margin, y, { align });
		y += fontSize * 0.45 + 1.5;
	};

	const companyName = element?.querySelector("p")?.textContent?.trim() || "Djiwa Tentram Cafe & Resto";
	addTextLine(companyName, 10, "bold", "center");
	addTextLine(draft.contract.title || "Perjanjian Kerja", 16, "bold", "center");
	y += 2;
	pdf.setDrawColor(190);
	pdf.line(margin, y, pageWidth - margin, y);
	y += 7;

	const bodyText = element?.querySelector(".whitespace-pre-wrap, .prose")?.textContent || draft.contract.plainText || draft.contract.clauses.map((clause) => `${clause.title}\n${clause.body}`).join("\n\n");
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(10);
	for (const paragraph of String(bodyText).split(/\n+/)) {
		for (const line of splitLines(pdf, paragraph, usableWidth)) addTextLine(line, 10);
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
