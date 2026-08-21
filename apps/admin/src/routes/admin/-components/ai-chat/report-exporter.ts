import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toRupiah } from "./utils";

export type ExportFormat = "pdf" | "excel";

interface ExportData {
	title: string;
	rows: Array<Record<string, any>>;
	columns: Array<{ header: string; key: string }>;
	summary?: string;
}

export const exportReport = async (data: ExportData, format: ExportFormat) => {
	if (format === "pdf") {
		const doc = new jsPDF();
		
		// Header
		doc.setFontSize(18);
		doc.text(data.title, 14, 22);
		
		doc.setFontSize(11);
		doc.setTextColor(100);
		doc.text(`Dihasilkan oleh Centrik AI pada ${new Date().toLocaleString("id-ID")}`, 14, 30);

		if (data.summary) {
			doc.setFontSize(12);
			doc.setTextColor(0);
			const splitSummary = doc.splitTextToSize(data.summary, 180);
			doc.text(splitSummary, 14, 40);
		}

		// Table
		const head = [data.columns.map(c => c.header)];
		const body = data.rows.map(row => data.columns.map(col => {
			const val = row[col.key];
			if (typeof val === "number" && (col.key.toLowerCase().includes("amount") || col.key.toLowerCase().includes("total") || col.key.toLowerCase().includes("price"))) {
				return toRupiah(val);
			}
			return val;
		}));

		autoTable(doc, {
			startY: data.summary ? 60 : 40,
			head,
			body,
			theme: "grid",
			headStyles: { fillColor: [59, 130, 246] },
		});

		doc.save(`${data.title.replace(/\s+/g, "_")}.pdf`);
	} else {
		// Excel
		const ws = XLSX.utils.json_to_sheet(data.rows);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Laporan");
		XLSX.writeFile(wb, `${data.title.replace(/\s+/g, "_")}.xlsx`);
	}
};
