import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────────────

export type PayslipData = {
	id?: string;
	user_id?: string;
	user_name?: string;
	period_name?: string;
	period_start?: string;
	period_end?: string;
	gross_pay?: number;
	deductions?: number;
	net_pay?: number;
	status?: string;
	sent_at?: string | null;
	acknowledged_at?: string | null;
	breakdown?: PayslipBreakdown;
};

export type PayslipBreakdown = {
	role_name?: string;
	base_shift_rate?: number;
	monthly_fixed_salary?: number;
	daily_allowance?: number;
	overtime_rate_per_hour?: number;
	shifts?: number;
	days_worked?: number;
	total_shift_pay?: number;
	total_allowance?: number;
	total_overtime_bonus?: number;
	total_penalty?: number;
	bonus_target?: {
		basis?: string;
		total_bonus?: number;
		tiers?: Array<{
			threshold_pct: number;
			amount: number;
			achieved: boolean;
		}>;
	};
};

// ─── Colors ──────────────────────────────────────────────────────────────

const C = {
	primary: [41, 57, 86] as const,
	accent: [34, 139, 34] as const,
	muted: [128, 128, 128] as const,
	light: [240, 240, 240] as const,
	border: [200, 200, 200] as const,
	danger: [220, 38, 38] as const,
};

/** Helper: create a mutable RGB tuple for jspdf / autoTable */
function rgb(r: number, g: number, b: number): [number, number, number] {
	return [r, g, b];
}

const MARGIN = 15;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "decimal",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(n);
}

function fmtDate(d: string | number | Date | null | undefined): string {
	if (!d) return "-";
	return new Date(d).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

// ─── Table column widths (mm) ────────────────────────────────────────────
const COL_W = {
	no: 10,
	komponen: 108,
	jumlah: 44,
};

// ─── Generate Payslip PDF ────────────────────────────────────────────────

export function generatePayslipPDF(
	payslip: PayslipData,
	breakdown: PayslipBreakdown,
	siteName?: string,
	siteAddress?: string
): Blob {
	const doc = new jsPDF("portrait", "mm", "a4");
	let y = 25;

	// ── HEADER ────────────────────────────────────────────────────────
	doc.setFontSize(20);
	doc.setTextColor(...C.primary);
	doc.setFont("helvetica", "bold");
	doc.text(siteName || "TENTREM KOFFIE", PAGE_W / 2, y, { align: "center" });
	y += 7;

	if (siteAddress) {
		doc.setFontSize(8);
		doc.setTextColor(...C.muted);
		doc.setFont("helvetica", "normal");
		doc.text(siteAddress, PAGE_W / 2, y, { align: "center" });
		y += 4;
	}

	// ── Divider ───────────────────────────────────────────────────────
	doc.setDrawColor(...C.border);
	doc.setLineWidth(0.5);
	doc.line(MARGIN, y, PAGE_W - MARGIN, y);
	y += 6;

	// ── Judul ─────────────────────────────────────────────────────────
	doc.setFontSize(16);
	doc.setTextColor(...C.primary);
	doc.setFont("helvetica", "bold");
	doc.text("SLIP GAJI KARYAWAN", PAGE_W / 2, y, { align: "center" });
	y += 6;

	doc.setFontSize(10);
	doc.setTextColor(...C.muted);
	doc.setFont("helvetica", "normal");
	doc.text(`Periode: ${payslip.period_name ?? "-"}`, PAGE_W / 2, y, {
		align: "center",
	});
	y += 8;

	// ── INFO KARYAWAN ─────────────────────────────────────────────────
	const infoBoxH = 24;
	doc.setFillColor(...C.light);
	doc.rect(MARGIN, y, CONTENT_W, infoBoxH, "F");
	doc.setTextColor(...C.primary);
	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.text(`Nama            : ${payslip.user_name ?? "-"}`, MARGIN + 5, y + 6);
	doc.text(
		`Jabatan         : ${breakdown.role_name ?? "-"}`,
		MARGIN + 5,
		y + 12
	);
	doc.text(
		`Periode Gaji    : ${fmtDate(payslip.period_start)} s/d ${fmtDate(payslip.period_end)}`,
		MARGIN + 5,
		y + 18
	);
	y += infoBoxH + 6;

	// ── BUILD TABLE ROWS ──────────────────────────────────────────────
	const rows: [string, string, string][] = [];
	let rowNum = 1;

	if ((breakdown.monthly_fixed_salary ?? 0) > 0) {
		rows.push([
			String(rowNum++),
			"Gaji Tetap",
			fmt(breakdown.monthly_fixed_salary!),
		]);
	}
	if ((breakdown.total_shift_pay ?? 0) > 0) {
		rows.push([
			String(rowNum++),
			`Gaji Shift (${breakdown.shifts ?? 0} shift)`,
			fmt(breakdown.total_shift_pay!),
		]);
	}
	if ((breakdown.total_allowance ?? 0) > 0) {
		rows.push([
			String(rowNum++),
			"Tunjangan Transportasi",
			fmt(breakdown.total_allowance!),
		]);
	}
	if ((breakdown.total_overtime_bonus ?? 0) > 0) {
		rows.push([
			String(rowNum++),
			"Bonus Lembur",
			fmt(breakdown.total_overtime_bonus!),
		]);
	}
	if ((breakdown.bonus_target?.total_bonus ?? 0) > 0) {
		rows.push([
			String(rowNum++),
			"Bonus Target",
			fmt(breakdown.bonus_target!.total_bonus!),
		]);
	}

	// If no rows at all, add a placeholder so table renders
	if (rows.length === 0) {
		rows.push(["", "— Tidak ada komponen gaji —", "0"]);
	}

	// ── GROSS TOTAL TABLE ─────────────────────────────────────────────
	autoTable(doc, {
		startY: y,
		head: [
			[
				{ content: "No", styles: { halign: "center" as const } },
				{ content: "Komponen Gaji" },
				{ content: "Jumlah (Rp)", styles: { halign: "right" as const } },
			],
		],
		body: rows.map((r) => [
			{ content: r[0], styles: { halign: "center" as const } },
			{ content: r[1] },
			{ content: r[2], styles: { halign: "right" as const } },
		]),
		foot: [
			[
				{
					content: "GROSS TOTAL",
					colSpan: 2,
					styles: { fontStyle: "bold" },
				},
				{
					content: fmt(payslip.gross_pay ?? 0),
					styles: { fontStyle: "bold", halign: "right" as const },
				},
			],
		],
		theme: "grid",
		headStyles: {
			fillColor: rgb(...C.primary),
			textColor: rgb(255, 255, 255),
			fontStyle: "bold",
			fontSize: 10,
		},
		bodyStyles: { fontSize: 9 },
		footStyles: {
			fillColor: rgb(...C.light),
			textColor: rgb(...C.primary),
			fontStyle: "bold",
			fontSize: 10,
		},
		columnStyles: {
			0: { cellWidth: COL_W.no, halign: "center" },
			1: { cellWidth: COL_W.komponen },
			2: { cellWidth: COL_W.jumlah, halign: "right" },
		},
		margin: { left: MARGIN, right: MARGIN },
		tableLineColor: rgb(...C.border),
		tableLineWidth: 0.1,
	});

	y = (doc as any).lastAutoTable.finalY + 4;

	// ── DEDUCTIONS ROW ────────────────────────────────────────────────
	const deductions = payslip.deductions ?? 0;
	if (deductions > 0) {
		autoTable(doc, {
			startY: y,
			body: [
				[
					{
						content: String(rowNum++),
						styles: { halign: "center" as const },
					},
					{
						content: "Denda / Potongan",
						styles: { textColor: rgb(...C.danger) },
					},
					{
						content: fmt(-Math.abs(deductions)),
						styles: {
							textColor: rgb(...C.danger),
							halign: "right" as const,
						},
					},
				],
			],
			theme: "grid",
			bodyStyles: { fontSize: 9 },
			columnStyles: {
				0: { cellWidth: COL_W.no, halign: "center" },
				1: { cellWidth: COL_W.komponen },
				2: { cellWidth: COL_W.jumlah, halign: "right" },
			},
			margin: { left: MARGIN, right: MARGIN },
			tableLineColor: rgb(...C.border),
			tableLineWidth: 0.1,
		});
		y = (doc as any).lastAutoTable.finalY + 4;
	}

	// ── NET TOTAL ─────────────────────────────────────────────────────
	autoTable(doc, {
		startY: y,
		body: [
			[
				{
					content: "NET TOTAL (Diterima)",
					colSpan: 2,
					styles: { fontStyle: "bold", fontSize: 11 },
				},
				{
					content: fmt(payslip.net_pay ?? 0),
					styles: {
						fontStyle: "bold",
						fontSize: 11,
						halign: "right" as const,
						textColor: rgb(...C.accent),
					},
				},
			],
		],
		theme: "grid",
		bodyStyles: { fontSize: 10 },
		columnStyles: {
			0: { cellWidth: COL_W.no, halign: "center" },
			1: { cellWidth: COL_W.komponen },
			2: { cellWidth: COL_W.jumlah, halign: "right" },
		},
		margin: { left: MARGIN, right: MARGIN },
		tableLineColor: rgb(...C.accent),
		tableLineWidth: 0.3,
	});

	y = (doc as any).lastAutoTable.finalY + 8;

	// ── STATUS BOX ────────────────────────────────────────────────────
	const isAck = payslip.status === "acknowledged";
	const isSent = payslip.status === "sent";
	const statusBoxH = 8;

	if (isAck) doc.setFillColor(220, 252, 231);
	else if (isSent) doc.setFillColor(254, 243, 199);
	else doc.setFillColor(...C.light);

	doc.rect(MARGIN, y, CONTENT_W, statusBoxH, "F");

	doc.setFontSize(9);
	if (isAck) doc.setTextColor(...C.accent);
	else if (isSent) doc.setTextColor(180, 120, 0);
	else doc.setTextColor(...C.muted);
	doc.setFont("helvetica", "bold");

	let statusText = "○ Generated — Belum dikirim";
	if (isAck) {
		statusText = `✓ Diterima pada ${fmtDate(payslip.acknowledged_at)}`;
	} else if (isSent) {
		statusText = `✓ Dikirim pada ${fmtDate(payslip.sent_at)}`;
	}
	doc.text(statusText, PAGE_W / 2, y + 5.5, { align: "center" });
	y += statusBoxH + 6;

	// ── FOOTER ────────────────────────────────────────────────────────
	doc.setFontSize(7);
	doc.setTextColor(...C.muted);
	doc.setFont("helvetica", "italic");
	doc.text(
		"Terima kasih atas dedikasi dan kerja keras Anda!",
		PAGE_W / 2,
		y,
		{ align: "center" }
	);
	y += 4;
	doc.text(
		"Dokumen ini digenerate secara otomatis oleh sistem YumiPOS",
		PAGE_W / 2,
		y,
		{ align: "center" }
	);

	return doc.output("blob");
}
