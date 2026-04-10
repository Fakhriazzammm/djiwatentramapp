import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import Papa from "papaparse";

export const formatCurrencyIDR = (amount: number, short: boolean = false) => {
	if (short) {
		if (amount >= 1000000) {
			return `Rp${(amount / 1000000).toFixed(1)}jt`;
		}
		if (amount >= 1000) {
			return `Rp${(amount / 1000).toFixed(0)}rb`;
		}
		return `Rp${amount}`;
	}
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(amount);
};

// ─────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────

function addPDFHeader(doc: jsPDF, title: string, period: string, storeName: string) {
	doc.setFontSize(16);
	doc.setFont("helvetica", "bold");
	doc.text(storeName, 14, 18);

	doc.setFontSize(12);
	doc.setFont("helvetica", "normal");
	doc.text(title, 14, 26);

	doc.setFontSize(9);
	doc.setTextColor(100);
	doc.text(`Periode: ${period}`, 14, 33);
	doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { dateStyle: "full" })}`, 14, 38);
	doc.setTextColor(0);

	doc.setDrawColor(200);
	doc.line(14, 42, 196, 42);
}

export function exportProfitLossPDF(data: ProfitLossData, storeName: string, period: string) {
	const doc = new jsPDF();
	addPDFHeader(doc, "LAPORAN LABA RUGI", period, storeName);

	let y = 50;

	// === PENDAPATAN ===
	doc.setFontSize(10);
	doc.setFont("helvetica", "bold");
	doc.text("PENDAPATAN", 14, y);
	y += 6;

	const incomeRows: (string | number)[][] = [];
	if (data.income.salesRevenue > 0) {
		incomeRows.push(["  Penjualan (Dari Pesanan)", formatCurrencyIDR(data.income.salesRevenue)]);
	}
	if (data.income.sources) {
		data.income.sources
			.filter((s) => s.category !== "Penjualan")
			.forEach((s) => {
				incomeRows.push([`  ${s.category.replace(/_/g, " ")}`, formatCurrencyIDR(s.amount)]);
			});
	}
	incomeRows.push(["TOTAL PENDAPATAN", formatCurrencyIDR(data.income.total)]);

	autoTable(doc, {
		startY: y,
		head: [["Keterangan", "Jumlah"]],
		body: incomeRows,
		theme: "plain",
		styles: { fontSize: 9 },
		headStyles: { fillColor: [240, 240, 240], fontStyle: "bold", fontSize: 9 },
		columnStyles: { 1: { halign: "right" } },
		didParseCell: (data) => {
			if (data.row.index === incomeRows.length - 1) {
				data.cell.styles.fontStyle = "bold";
				data.cell.styles.fillColor = [230, 255, 230];
			}
		},
	});

	y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

	// === BEBAN OPERASIONAL ===
	doc.setFont("helvetica", "bold");
	doc.text("BEBAN OPERASIONAL", 14, y);
	y += 6;

	const expenseRows: (string | number)[][] = data.expense.operatingExpenses.map((e) => [
		`  ${e.category.replace(/_/g, " ")}`,
		formatCurrencyIDR(e.amount),
	]);
	expenseRows.push(["TOTAL BEBAN", formatCurrencyIDR(data.expense.total)]);

	autoTable(doc, {
		startY: y,
		head: [["Keterangan", "Jumlah"]],
		body: expenseRows,
		theme: "plain",
		styles: { fontSize: 9 },
		headStyles: { fillColor: [240, 240, 240], fontStyle: "bold", fontSize: 9 },
		columnStyles: { 1: { halign: "right" } },
		didParseCell: (data) => {
			if (data.row.index === expenseRows.length - 1) {
				data.cell.styles.fontStyle = "bold";
				data.cell.styles.fillColor = [255, 230, 230];
			}
		},
	});

	y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

	// === LABA BERSIH ===
	const isProfit = data.netProfit >= 0;
	autoTable(doc, {
		startY: y,
		body: [
			["LABA BERSIH", formatCurrencyIDR(data.netProfit)],
			["Margin Bersih", `${data.netMargin.toFixed(1)}%`],
		],
		theme: "plain",
		styles: { fontSize: 10, fontStyle: "bold" },
		columnStyles: { 1: { halign: "right" } },
		didParseCell: (data) => {
			data.cell.styles.fillColor = isProfit ? [200, 240, 200] : [240, 200, 200];
		},
	});

	doc.save(`laporan-laba-rugi-${Date.now()}.pdf`);
}

export function exportCashFlowPDF(data: CashFlowData, storeName: string, period: string) {
	const doc = new jsPDF();
	addPDFHeader(doc, "LAPORAN ARUS KAS", period, storeName);

	// Summary
	autoTable(doc, {
		startY: 50,
		head: [["Keterangan", "Jumlah"]],
		body: [
			["Total Pemasukan (Inflow)", formatCurrencyIDR(data.totalInflow)],
			["Total Pengeluaran (Outflow)", formatCurrencyIDR(data.totalOutflow)],
			["Arus Kas Bersih", formatCurrencyIDR(data.netCashFlow)],
		],
		theme: "striped",
		styles: { fontSize: 9 },
		headStyles: { fillColor: [59, 130, 246] },
		columnStyles: { 1: { halign: "right" } },
	});

	const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

	// Payment method breakdown
	doc.setFontSize(10);
	doc.setFont("helvetica", "bold");
	doc.text("Berdasarkan Metode Pembayaran", 14, afterSummary);

	autoTable(doc, {
		startY: afterSummary + 4,
		head: [["Metode", "Pemasukan", "Pengeluaran", "Net"]],
		body: Object.entries(data.byPaymentMethod).map(([method, val]) => [
			method,
			formatCurrencyIDR(val.inflow),
			formatCurrencyIDR(val.outflow),
			formatCurrencyIDR(val.inflow - val.outflow),
		]),
		theme: "striped",
		styles: { fontSize: 9 },
		headStyles: { fillColor: [59, 130, 246] },
		columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
	});

	const afterMethod = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

	// Daily cash flow
	doc.setFont("helvetica", "bold");
	doc.text("Arus Kas Harian", 14, afterMethod);

	autoTable(doc, {
		startY: afterMethod + 4,
		head: [["Tanggal", "Pemasukan", "Pengeluaran", "Net", "Saldo"]],
		body: data.dailyCashFlow.map((d) => [
			new Date(d.date).toLocaleDateString("id-ID"),
			formatCurrencyIDR(d.inflow),
			formatCurrencyIDR(d.outflow),
			formatCurrencyIDR(d.net),
			formatCurrencyIDR(d.balance),
		]),
		theme: "striped",
		styles: { fontSize: 8 },
		headStyles: { fillColor: [59, 130, 246] },
		columnStyles: {
			1: { halign: "right" },
			2: { halign: "right" },
			3: { halign: "right" },
			4: { halign: "right" },
		},
	});

	doc.save(`laporan-arus-kas-${Date.now()}.pdf`);
}

export function exportTransactionsPDF(
	transactions: TransactionRow[],
	storeName: string,
	period: string,
	totals: { totalIncome: number; totalExpense: number; netBalance: number },
) {
	const doc = new jsPDF({ orientation: "landscape" });
	addPDFHeader(doc, "LAPORAN TRANSAKSI DETAIL", period, storeName);

	autoTable(doc, {
		startY: 50,
		head: [[
			"Tanggal",
			"Jenis",
			"Kategori",
			"Merchant",
			"Keterangan",
			"Grup",
			"Ref",
			"No Struk",
			"Fingerprint",
			"Metode",
			"Jumlah",
		]],
		body: transactions.map((t) => [
			new Date(t.date).toLocaleDateString("id-ID"),
			t.type === "income" ? "Pemasukan" : "Pengeluaran",
			t.category.replace(/_/g, " "),
			t.merchant || "-",
			t.description || "-",
			(t as any).receiptGroupLabel || "-",
			(t as any).sourceRef || "-",
			(t as any).receiptNumber || "-",
			(t as any).sourceFingerprint || "-",
			t.paymentMethod || "Cash",
			(t.type === "income" ? "+ " : "- ") + formatCurrencyIDR(t.amount),
		]),
		foot: [
			["", "", "", "", "", "", "", "", "", "Total Pemasukan", formatCurrencyIDR(totals.totalIncome)],
			["", "", "", "", "", "", "", "", "", "Total Pengeluaran", formatCurrencyIDR(totals.totalExpense)],
			["", "", "", "", "", "", "", "", "", "Saldo Bersih", formatCurrencyIDR(totals.netBalance)],
		],
		theme: "striped",
		styles: { fontSize: 7 },
		headStyles: { fillColor: [59, 130, 246] },
		footStyles: { fontStyle: "bold" },
		columnStyles: { 10: { halign: "right" } },
	});

	doc.save(`laporan-transaksi-${Date.now()}.pdf`);
}

// ─────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────

export function exportProfitLossJPG(data: ProfitLossData, storeName: string, period: string) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	canvas.width = 800;
	// Calculate dynamic height based on rows
	let numRows = 8; // Headers, totals, etc.
	if (data.income.salesRevenue > 0) numRows++;
	if (data.income.sources) numRows += data.income.sources.filter(s => s.category !== "Penjualan").length;
	numRows += data.expense.operatingExpenses.length;
	
	canvas.height = 300 + (numRows * 40);

	// Background
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Header
	ctx.fillStyle = "#10b981"; // Emerald
	ctx.fillRect(0, 0, canvas.width, 100);

	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 32px Arial";
	ctx.fillText(storeName.toUpperCase(), 40, 60);
	
	ctx.font = "20px Arial";
	ctx.fillText(`LAPORAN LABA RUGI - ${period}`, 40, 90);

	let y = 150;
	const drawSection = (title: string, color: string) => {
		ctx.fillStyle = color;
		ctx.font = "bold 16px Arial";
		ctx.fillText(title, 40, y);
		y += 30;
	};

	const drawRow = (label: string, value: string, isIndent: boolean = false, isBold: boolean = false) => {
		ctx.fillStyle = "#374151";
		ctx.font = `${isBold ? "bold" : "normal"} 14px Arial`;
		ctx.fillText(label, isIndent ? 70 : 40, y);
		ctx.fillText(value, canvas.width - 200, y);
		y += 30;
	};

	// Income
	drawSection("PENDAPATAN", "#10b981");
	if (data.income.salesRevenue > 0) {
		drawRow("Penjualan (Dari Pesanan)", formatCurrencyIDR(data.income.salesRevenue), true);
	}
	if (data.income.sources) {
		data.income.sources.filter(s => s.category !== "Penjualan").forEach(s => {
			drawRow(s.category.replace(/_/g, " "), formatCurrencyIDR(s.amount), true);
		});
	}
	ctx.fillStyle = "#f0fdf4";
	ctx.fillRect(40, y - 20, canvas.width - 80, 40);
	drawRow("TOTAL PENDAPATAN", formatCurrencyIDR(data.income.total), false, true);
	y += 20;

	// Expenses
	drawSection("BEBAN OPERASIONAL", "#ef4444");
	data.expense.operatingExpenses.forEach(e => {
		drawRow(e.category.replace(/_/g, " "), formatCurrencyIDR(e.amount), true);
	});
	ctx.fillStyle = "#fef2f2";
	ctx.fillRect(40, y - 20, canvas.width - 80, 40);
	drawRow("TOTAL BEBAN", formatCurrencyIDR(data.expense.total), false, true);
	y += 40;

	// Net Profit
	const isProfit = data.netProfit >= 0;
	ctx.fillStyle = isProfit ? "#d1fae5" : "#fee2e2";
	ctx.fillRect(40, y - 20, canvas.width - 80, 80);
	
	ctx.fillStyle = isProfit ? "#047857" : "#b91c1c";
	ctx.font = "bold 20px Arial";
	ctx.fillText("LABA BERSIH", 60, y + 10);
	ctx.fillText(formatCurrencyIDR(data.netProfit), canvas.width - 200, y + 10);
	
	ctx.font = "14px Arial";
	ctx.fillText(`Margin Bersih: ${data.netMargin.toFixed(1)}%`, 60, y + 40);

	// Download
	const link = document.createElement("a");
	link.download = `laporan-laba-rugi-${Date.now()}.jpg`;
	link.href = canvas.toDataURL("image/jpeg", 0.9);
	link.click();
}
export function exportProfitLossExcel(data: ProfitLossData, storeName: string, period: string) {
	const wb = XLSX.utils.book_new();

	// Sheet 1: Ringkasan
	const summaryRows: (string | number)[][] = [
		[storeName],
		["LAPORAN LABA RUGI"],
		[`Periode: ${period}`],
		[],
		["PENDAPATAN", ""],
	];
	if (data.income.salesRevenue > 0) {
		summaryRows.push(["  Penjualan (Dari Pesanan)", data.income.salesRevenue]);
	}
	if (data.income.sources) {
		for (const s of data.income.sources.filter((s) => s.category !== "Penjualan")) {
			summaryRows.push([`  ${s.category.replace(/_/g, " ")}`, s.amount]);
		}
	}
	summaryRows.push(["TOTAL PENDAPATAN", data.income.total]);
	summaryRows.push([]);
	summaryRows.push(["BEBAN OPERASIONAL", ""]);
	for (const e of data.expense.operatingExpenses) {
		summaryRows.push([`  ${e.category.replace(/_/g, " ")}`, e.amount]);
	}
	summaryRows.push(["TOTAL BEBAN", data.expense.total]);
	summaryRows.push([]);
	summaryRows.push(["LABA BERSIH", data.netProfit]);
	summaryRows.push(["Margin Bersih (%)", `${data.netMargin.toFixed(1)}%`]);

	const ws = XLSX.utils.aoa_to_sheet(summaryRows);
	ws["!cols"] = [{ wch: 35 }, { wch: 20 }];
	XLSX.utils.book_append_sheet(wb, ws, "Laba Rugi");

	XLSX.writeFile(wb, `laporan-laba-rugi-${Date.now()}.xlsx`);
}

export function exportCashFlowExcel(data: CashFlowData, storeName: string, period: string) {
	const wb = XLSX.utils.book_new();

	// Sheet 1: Ringkasan
	const summaryRows: (string | number)[][] = [
		[storeName],
		["LAPORAN ARUS KAS"],
		[`Periode: ${period}`],
		[],
		["Keterangan", "Jumlah"],
		["Total Pemasukan", data.totalInflow],
		["Total Pengeluaran", data.totalOutflow],
		["Arus Kas Bersih", data.netCashFlow],
		[],
		["METODE PEMBAYARAN", "", ""],
		["Metode", "Pemasukan", "Pengeluaran", "Net"],
	];
	for (const [method, val] of Object.entries(data.byPaymentMethod)) {
		summaryRows.push([method, val.inflow, val.outflow, val.inflow - val.outflow]);
	}

	const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
	ws1["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
	XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

	// Sheet 2: Harian
	const dailyRows: (string | number)[][] = [
		["Tanggal", "Pemasukan", "Pengeluaran", "Net", "Saldo Kumulatif"],
		...data.dailyCashFlow.map((d) => [
			new Date(d.date).toLocaleDateString("id-ID"),
			d.inflow,
			d.outflow,
			d.net,
			d.balance,
		]),
	];
	const ws2 = XLSX.utils.aoa_to_sheet(dailyRows);
	ws2["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
	XLSX.utils.book_append_sheet(wb, ws2, "Arus Kas Harian");

	XLSX.writeFile(wb, `laporan-arus-kas-${Date.now()}.xlsx`);
}

export function exportTransactionsExcel(
	transactions: TransactionRow[],
	storeName: string,
	period: string,
	totals: { totalIncome: number; totalExpense: number; netBalance: number },
) {
	const wb = XLSX.utils.book_new();

	const rows: (string | number)[][] = [
		[storeName],
		["LAPORAN TRANSAKSI DETAIL"],
		[`Periode: ${period}`],
		[],
		["Tanggal", "Jenis", "Kategori", "Merchant", "Keterangan", "Grup", "Ref", "No Struk", "Fingerprint", "Metode Bayar", "Jumlah", "Status"],
		...transactions.map((t) => [
			new Date(t.date).toLocaleDateString("id-ID"),
			t.type === "income" ? "Pemasukan" : "Pengeluaran",
			t.category.replace(/_/g, " "),
			t.merchant || "-",
			t.description || "-",
			(t as any).receiptGroupLabel || "-",
			(t as any).sourceRef || "-",
			(t as any).receiptNumber || "-",
			(t as any).sourceFingerprint || "-",
			t.paymentMethod || "Cash",
			t.type === "income" ? t.amount : -t.amount,
			t.status,
		]),
		[],
		["", "", "", "", "", "", "", "", "", "Total Pemasukan", totals.totalIncome, ""],
		["", "", "", "", "", "", "", "", "", "Total Pengeluaran", totals.totalExpense, ""],
		["", "", "", "", "", "", "", "", "", "Saldo Bersih", totals.netBalance, ""],
	];

	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws["!cols"] = [
		{ wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 20 },
		{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
	];
	XLSX.utils.book_append_sheet(wb, ws, "Transaksi");

	XLSX.writeFile(wb, `laporan-transaksi-${Date.now()}.xlsx`);
}

// ─────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────

export function exportTransactionsCSV(transactions: TransactionRow[], period: string) {
	const data = transactions.map((t) => ({
		Tanggal: new Date(t.date).toLocaleDateString("id-ID"),
		Jenis: t.type === "income" ? "Pemasukan" : "Pengeluaran",
		Kategori: t.category.replace(/_/g, " "),
		Merchant: t.merchant || "-",
		Keterangan: t.description || "-",
		Grup: (t as any).receiptGroupLabel || "-",
		Referensi: (t as any).sourceRef || "-",
		"No Struk": (t as any).receiptNumber || "-",
		Fingerprint: (t as any).sourceFingerprint || "-",
		"Metode Bayar": t.paymentMethod || "Cash",
		Jumlah: t.type === "income" ? t.amount : -t.amount,
		Status: t.status,
	}));

	const csv = Papa.unparse(data);
	const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `laporan-transaksi-${Date.now()}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────

export interface ProfitLossData {
	period: { startDate?: number; endDate?: number };
	income: {
		salesRevenue: number;
		otherIncome: number;
		total: number;
		byCategory: Record<string, number>;
		sources?: { category: string; amount: number }[];
	};
	expense: {
		hppAmount?: number;
		operatingExpenses: { category: string; amount: number }[];
		total: number;
		byCategory: Record<string, number>;
	};
	grossProfit: number;
	netProfit: number;
	netMargin: number;
	transactionCount: number;
}

export interface CashFlowData {
	period: { startDate?: number; endDate?: number };
	totalInflow: number;
	totalOutflow: number;
	netCashFlow: number;
	byPaymentMethod: Record<string, { inflow: number; outflow: number }>;
	dailyCashFlow: {
		date: string;
		inflow: number;
		outflow: number;
		net: number;
		balance: number;
	}[];
}

export interface TransactionRow {
	_id: string;
	type: "income" | "expense";
	amount: number;
	category: string;
	merchant?: string;
	description?: string;
	date: number;
	paymentMethod?: string;
	status: string;
}

// ─────────────────────────────────────────────
// BOOKING ORDERS EXPORT
// ─────────────────────────────────────────────

export interface BookingOrderRow {
	bookingCode: string;
	customerName: string;
	customerPhone: string;
	customerEmail: string;
	bookingDate: string;
	totalAmount: number;
	paymentMethod: string;
	paymentStatus: string;
	bookingStatus: string;
	guestCount?: number;
	createdAt: number;
}

export function exportBookingOrdersPDF(orders: BookingOrderRow[], storeName: string, period: string) {
	const doc = new jsPDF({ orientation: "landscape" });
	addPDFHeader(doc, "DAFTAR BOOKING", period, storeName);

	const body = orders.map((o) => [
		o.bookingCode,
		o.customerName,
		new Date(o.bookingDate).toLocaleDateString("id-ID"),
		o.guestCount || "-",
		o.paymentMethod.replace("_", " "),
		o.paymentStatus === "paid" ? "Lunas" : "Belum Bayar",
		o.bookingStatus.toUpperCase(),
		formatCurrencyIDR(o.totalAmount),
	]);

	const total = orders.reduce((sum, o) => sum + o.totalAmount, 0);

	autoTable(doc, {
		startY: 50,
		head: [["Kode", "Pelanggan", "Tanggal", "Pax", "Metode", "Pembayaran", "Status", "Total"]],
		body,
		foot: [["", "", "", "", "", "", "TOTAL SELESAI", formatCurrencyIDR(total)]],
		theme: "striped",
		styles: { fontSize: 8 },
		headStyles: { fillColor: [16, 185, 129] },
		footStyles: { fontStyle: "bold" },
		columnStyles: { 7: { halign: "right" } },
	});

	doc.save(`daftar-booking-${Date.now()}.pdf`);
}

export function exportBookingOrdersExcel(orders: BookingOrderRow[], storeName: string, period: string) {
	const wb = XLSX.utils.book_new();

	const rows: (string | number)[][] = [
		[storeName],
		["DAFTAR BOOKING"],
		[`Periode: ${period}`],
		[],
		["Kode", "Nama Pelanggan", "WhatsApp", "Email", "Tanggal", "Pax", "Metode", "Status Bayar", "Status Booking", "Total"],
		...orders.map((o) => [
			o.bookingCode,
			o.customerName,
			o.customerPhone,
			o.customerEmail,
			o.bookingDate,
			o.guestCount || 0,
			o.paymentMethod,
			o.paymentStatus,
			o.bookingStatus,
			o.totalAmount,
		]),
		[],
		["", "", "", "", "", "", "", "", "TOTAL", orders.reduce((sum, o) => sum + o.totalAmount, 0)],
	];

	const ws = XLSX.utils.aoa_to_sheet(rows);
	ws["!cols"] = [
		{ wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 25 },
		{ wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 12 },
		{ wch: 12 }, { wch: 15 }
	];
	XLSX.utils.book_append_sheet(wb, ws, "Booking");

	XLSX.writeFile(wb, `daftar-booking-${Date.now()}.xlsx`);
}

export function exportBookingOrdersJPG(orders: BookingOrderRow[], storeName: string, period: string) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	// Simple professional layout
	canvas.width = 1200;
	canvas.height = 800 + (orders.length * 40);

	// Background
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Header
	ctx.fillStyle = "#10b981"; // Emerald
	ctx.fillRect(0, 0, canvas.width, 100);

	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 32px Arial";
	ctx.fillText(storeName.toUpperCase(), 40, 60);
	
	ctx.font = "20px Arial";
	ctx.fillText(`DAFTAR BOOKING - ${period}`, 40, 90);

	// Table Header
	ctx.fillStyle = "#f3f4f6";
	ctx.fillRect(40, 120, canvas.width - 80, 40);

	ctx.fillStyle = "#374151";
	ctx.font = "bold 16px Arial";
	const cols = [
		{ label: "KODE", x: 60 },
		{ label: "PELANGGAN", x: 200 },
		{ label: "TANGGAL", x: 450 },
		{ label: "PAX", x: 600 },
		{ label: "METODE", x: 700 },
		{ label: "PEMBAYARAN", x: 850 },
		{ label: "TOTAL", x: 1050 },
	];
	cols.forEach(c => ctx.fillText(c.label, c.x, 145));

	// Rows
	let y = 180;
	ctx.font = "14px Arial";
	orders.forEach((o, i) => {
		if (i % 2 === 0) {
			ctx.fillStyle = "#f9fafb";
			ctx.fillRect(40, y - 25, canvas.width - 80, 40);
		}
		ctx.fillStyle = "#4b5563";
		ctx.fillText(o.bookingCode, 60, y);
		ctx.fillText(o.customerName, 200, y);
		ctx.fillText(o.bookingDate, 450, y);
		ctx.fillText((o.guestCount || 0).toString(), 640, y);
		ctx.fillText(o.paymentMethod.replace("_", " "), 700, y);
		ctx.fillText(o.paymentStatus === "paid" ? "Lunas" : "Menunggu", 850, y);
		ctx.fillText(formatCurrencyIDR(o.totalAmount), 1050, y);
		y += 40;
	});

	// Totals
	ctx.fillStyle = "#10b981";
	ctx.fillRect(40, y, canvas.width - 80, 50);
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 18px Arial";
	const total = orders.reduce((sum, o) => sum + o.totalAmount, 0);
	ctx.fillText("TOTAL", 60, y + 32);
	ctx.fillText(formatCurrencyIDR(total), 1050, y + 32);

	// Download
	const link = document.createElement("a");
	link.download = `daftar-booking-${Date.now()}.jpg`;
	link.href = canvas.toDataURL("image/jpeg", 0.9);
	link.click();
}

export interface ShiftReportRow {
	shiftId: string;
	shiftName: string;
	cashierName: string;
	teamMembers: string;
	startTime: number;
	endTime?: number;
	status: "SELESAI" | "AKTIF";
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalExpenses: number;
	totalItemsSold: number;
	orderCount: number;
	bookingCount: number;
	endingCashExpected: number;
	endingCashPhysical?: number;
	nonCashExpected: number;
	nonCashConfirmed?: number;
	hasTarget?: boolean;
	targetMonth?: string;
	dailyTarget?: number;
	shiftTarget?: number;
	dailyCollected?: number;
	shiftCollected?: number;
	dailyTargetProgress?: number;
	shiftTargetProgress?: number;
	isDailyTargetMet?: boolean;
	isShiftTargetMet?: boolean;
}

export interface ShiftReportTotals {
	totalRevenue: number;
	totalGross: number;
	totalDiscount: number;
	totalExpenses: number;
	totalItems: number;
	activeCount: number;
}

export interface ShiftReportDetails {
	topProducts?: Array<{ productName: string; quantity: number }>;
	productBreakdown?: Array<{
		categoryName: string;
		totalQuantity: number;
		items: Array<{ productName: string; quantity: number }>;
	}>;
	expenseBreakdown?: Array<{ category: string; amount: number }>;
}

function formatShiftRangeForExport(startTime: number, endTime?: number) {
	const date = new Date(startTime).toLocaleDateString("id-ID");
	const start = new Date(startTime).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const end = endTime
		? new Date(endTime).toLocaleTimeString("id-ID", {
				hour: "2-digit",
				minute: "2-digit",
			})
		: "Aktif";
	return `${date} ${start}-${end}`;
}

export function exportShiftReportsPDF(
	rows: ShiftReportRow[],
	storeName: string,
	period: string,
	totals: ShiftReportTotals,
	selectedShift?: ShiftReportRow,
	details?: ShiftReportDetails,
) {
	const doc = new jsPDF({ orientation: "landscape" });
	addPDFHeader(doc, "LAPORAN SHIFT DETAIL", period, storeName);

	autoTable(doc, {
		startY: 50,
		head: [[
			"Tanggal",
			"Shift",
			"Status",
			"Kasir",
			"Tim",
			"Modal",
			"Tunai",
			"QRIS",
			"Bruto",
			"Diskon",
			"Net",
			"Target Shift",
			"Target Harian",
			"Pengeluaran",
			"Produk",
			"Transaksi",
		]],
		body: rows.map((shift) => [
			formatShiftRangeForExport(shift.startTime, shift.endTime),
			shift.shiftName || "-",
			shift.status,
			shift.cashierName || "-",
			shift.teamMembers || "-",
			formatCurrencyIDR(shift.startingCash),
			formatCurrencyIDR(shift.cashRevenue),
			formatCurrencyIDR(shift.qrisRevenue),
			formatCurrencyIDR(shift.totalGrossSales),
			formatCurrencyIDR(shift.totalDiscount),
			formatCurrencyIDR(shift.totalRevenue),
			shift.hasTarget
				? `${formatCurrencyIDR(shift.shiftCollected ?? shift.totalRevenue)} / ${formatCurrencyIDR(shift.shiftTarget ?? 0)} (${shift.isShiftTargetMet ? "Tercapai" : "Tidak"})`
				: "-",
			shift.hasTarget
				? `${formatCurrencyIDR(shift.dailyCollected ?? 0)} / ${formatCurrencyIDR(shift.dailyTarget ?? 0)} (${shift.isDailyTargetMet ? "Tercapai" : "Tidak"})`
				: "-",
			formatCurrencyIDR(shift.totalExpenses),
			String(shift.totalItemsSold),
			String(shift.orderCount),
		]),
		foot: [
			[
				"",
				"",
				"",
				"",
				"TOTAL",
				"",
				"",
				"",
				formatCurrencyIDR(totals.totalGross),
				formatCurrencyIDR(totals.totalDiscount),
				formatCurrencyIDR(totals.totalRevenue),
				"",
				"",
				formatCurrencyIDR(totals.totalExpenses),
				String(totals.totalItems),
				"",
			],
		],
		theme: "striped",
		styles: { fontSize: 7, cellPadding: 1.5 },
		headStyles: { fillColor: [59, 130, 246], fontSize: 7 },
		footStyles: { fontStyle: "bold" },
		columnStyles: {
			5: { halign: "right" },
			6: { halign: "right" },
			7: { halign: "right" },
			8: { halign: "right" },
			9: { halign: "right" },
			10: { halign: "right" },
			13: { halign: "right" },
			14: { halign: "center" },
			15: { halign: "center" },
		},
	});

	if (selectedShift) {
		let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
		const pageHeight = doc.internal.pageSize.getHeight();
		if (y > pageHeight - 70) {
			doc.addPage("a4", "landscape");
			addPDFHeader(doc, "RINGKASAN SHIFT TERPILIH", period, storeName);
			y = 50;
		}

		doc.setFont("helvetica", "bold");
		doc.setFontSize(11);
		doc.text(`Ringkasan Shift: ${selectedShift.shiftName}`, 14, y);
		y += 6;

		autoTable(doc, {
			startY: y,
			head: [["Field", "Nilai"]],
			body: [
				["Tanggal", formatShiftRangeForExport(selectedShift.startTime, selectedShift.endTime)],
				["Kasir", selectedShift.cashierName || "-"],
				["Tim", selectedShift.teamMembers || "-"],
				["Status", selectedShift.status],
				["Revenue Bersih", formatCurrencyIDR(selectedShift.totalRevenue)],
				["Penjualan Bruto", formatCurrencyIDR(selectedShift.totalGrossSales)],
				["Diskon", formatCurrencyIDR(selectedShift.totalDiscount)],
				["Pengeluaran", formatCurrencyIDR(selectedShift.totalExpenses)],
				["Total Produk", `${selectedShift.totalItemsSold} item`],
				["Total Transaksi", `${selectedShift.orderCount} transaksi`],
				["Target Shift", selectedShift.hasTarget ? (selectedShift.isShiftTargetMet ? "Tercapai" : "Tidak Tercapai") : "-"],
				["Target Harian", selectedShift.hasTarget ? (selectedShift.isDailyTargetMet ? "Tercapai" : "Tidak Tercapai") : "-"],
			],
			theme: "grid",
			styles: { fontSize: 8 },
			headStyles: { fillColor: [16, 185, 129] },
			columnStyles: { 1: { halign: "right" } },
		});

		if (details?.topProducts?.length) {
			const topY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
			autoTable(doc, {
				startY: topY,
				head: [["Top Produk", "Qty"]],
				body: details.topProducts.map((p) => [p.productName, String(p.quantity)]),
				theme: "striped",
				styles: { fontSize: 8 },
				headStyles: { fillColor: [99, 102, 241] },
				columnStyles: { 1: { halign: "right" } },
			});
		}
	}

	doc.save(`laporan-shift-${Date.now()}.pdf`);
}

export function exportShiftReportsCSV(rows: ShiftReportRow[], period: string) {
	const data = rows.map((shift) => ({
		Periode: period,
		Tanggal: new Date(shift.startTime).toLocaleDateString("id-ID"),
		"Jam Mulai": new Date(shift.startTime).toLocaleTimeString("id-ID", {
			hour: "2-digit",
			minute: "2-digit",
		}),
		"Jam Selesai": shift.endTime
			? new Date(shift.endTime).toLocaleTimeString("id-ID", {
					hour: "2-digit",
					minute: "2-digit",
				})
			: "Aktif",
		Shift: shift.shiftName || "-",
		Status: shift.status,
		Kasir: shift.cashierName || "-",
		Tim: shift.teamMembers || "-",
		"Modal Kasir": shift.startingCash,
		Tunai: shift.cashRevenue,
		"Debit/QRIS": shift.qrisRevenue,
		Lainnya: shift.otherRevenue,
		"Penjualan Bruto": shift.totalGrossSales,
		Diskon: shift.totalDiscount,
		"Revenue Bersih": shift.totalRevenue,
		Pengeluaran: shift.totalExpenses,
		"Produk Terjual": shift.totalItemsSold,
		"Jumlah Transaksi": shift.orderCount,
		"Jumlah Booking": shift.bookingCount,
		"Expected Ending Cash": shift.endingCashExpected,
		"Actual Ending Cash": shift.endingCashPhysical ?? "",
		"Expected Non-Cash": shift.nonCashExpected,
		"Confirmed Non-Cash": shift.nonCashConfirmed ?? "",
		"Target Tersedia": shift.hasTarget ? "Ya" : "Tidak",
		"Target Shift": shift.shiftTarget ?? "",
		"Tercapai Shift": shift.shiftCollected ?? "",
		"Status Target Shift": shift.hasTarget ? (shift.isShiftTargetMet ? "Tercapai" : "Tidak Tercapai") : "",
		"Target Harian": shift.dailyTarget ?? "",
		"Tercapai Harian": shift.dailyCollected ?? "",
		"Status Target Harian": shift.hasTarget ? (shift.isDailyTargetMet ? "Tercapai" : "Tidak Tercapai") : "",
	}));

	const csv = Papa.unparse(data);
	const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `laporan-shift-${Date.now()}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

export function exportShiftReportsJPG(
	rows: ShiftReportRow[],
	storeName: string,
	period: string,
	totals: ShiftReportTotals,
	selectedShift?: ShiftReportRow,
	details?: ShiftReportDetails,
) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const paddingX = 28;
	const headerHeight = 128;
	const summaryHeight = 96;
	const rowCardHeight = 106;
	const rowGap = 12;
	const selectedHeight = selectedShift ? 216 : 0;
	const topProductsHeight = details?.topProducts?.length
		? 34 + (details.topProducts.length * 24)
		: 0;
	const expenseLines = details?.expenseBreakdown?.length ?? 0;
	const expenseHeight = expenseLines ? 34 + (expenseLines * 24) : 0;

	canvas.width = 1280;
	canvas.height =
		headerHeight +
		summaryHeight +
		(rows.length * (rowCardHeight + rowGap)) +
		selectedHeight +
		topProductsHeight +
		expenseHeight +
		80;

	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = "#0f172a";
	ctx.fillRect(0, 0, canvas.width, headerHeight);
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 32px Arial";
	ctx.fillText(storeName.toUpperCase(), paddingX, 50);
	ctx.font = "19px Arial";
	ctx.fillText("LAPORAN SHIFT DETAIL", paddingX, 80);
	ctx.font = "14px Arial";
	ctx.fillText(`Periode: ${period}`, paddingX, 106);

	let y = headerHeight + 20;
	ctx.fillStyle = "#f1f5f9";
	ctx.fillRect(paddingX, y - 8, canvas.width - (paddingX * 2), summaryHeight);
	ctx.fillStyle = "#0f172a";
	ctx.font = "bold 16px Arial";
	ctx.fillText(`Total Shift: ${rows.length}`, paddingX + 12, y + 18);
	ctx.fillText(`Shift Aktif: ${totals.activeCount}`, paddingX + 220, y + 18);
	ctx.fillText(`Produk: ${totals.totalItems}`, paddingX + 420, y + 18);
	ctx.font = "bold 15px Arial";
	ctx.fillText(`Net: ${formatCurrencyIDR(totals.totalRevenue)}`, paddingX + 12, y + 46);
	ctx.fillText(`Bruto: ${formatCurrencyIDR(totals.totalGross)}`, paddingX + 355, y + 46);
	ctx.fillText(`Diskon: ${formatCurrencyIDR(totals.totalDiscount)}`, paddingX + 700, y + 46);
	ctx.fillText(`Pengeluaran: ${formatCurrencyIDR(totals.totalExpenses)}`, paddingX + 12, y + 72);

	y += summaryHeight + 16;

	rows.forEach((row, index) => {
		const cardY = y;
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(paddingX, cardY, canvas.width - (paddingX * 2), rowCardHeight);
		ctx.strokeStyle = "#e2e8f0";
		ctx.lineWidth = 1;
		ctx.strokeRect(paddingX, cardY, canvas.width - (paddingX * 2), rowCardHeight);

		ctx.fillStyle = "#0f172a";
		ctx.font = "bold 15px Arial";
		const title = `${index + 1}. ${row.shiftName || "Shift"} • ${formatShiftRangeForExport(row.startTime, row.endTime)} • ${row.status}`;
		ctx.fillText(title, paddingX + 12, cardY + 22);

		ctx.fillStyle = "#334155";
		ctx.font = "13px Arial";
		ctx.fillText(`Kasir: ${row.cashierName || "-"} | Tim: ${row.teamMembers || "-"}`, paddingX + 12, cardY + 44);
		ctx.fillText(
			`Net: ${formatCurrencyIDR(row.totalRevenue)} | Bruto: ${formatCurrencyIDR(row.totalGrossSales)} | Diskon: ${formatCurrencyIDR(row.totalDiscount)} | Pengeluaran: ${formatCurrencyIDR(row.totalExpenses)}`,
			paddingX + 12,
			cardY + 64,
		);
		ctx.fillText(
			`Target Shift: ${
				row.hasTarget
					? `${formatCurrencyIDR(row.shiftCollected ?? row.totalRevenue)} / ${formatCurrencyIDR(row.shiftTarget ?? 0)} (${row.isShiftTargetMet ? "Tercapai" : "Tidak"})`
					: "-"
			}`,
			paddingX + 12,
			cardY + 84,
		);
		ctx.fillText(
			`Target Harian: ${
				row.hasTarget
					? `${formatCurrencyIDR(row.dailyCollected ?? 0)} / ${formatCurrencyIDR(row.dailyTarget ?? 0)} (${row.isDailyTargetMet ? "Tercapai" : "Tidak"})`
					: "-"
			} | Produk: ${row.totalItemsSold} | Trx: ${row.orderCount}`,
			paddingX + 12,
			cardY + 102,
		);

		y += rowCardHeight + rowGap;
	});

	if (selectedShift) {
		y += 8;
		ctx.fillStyle = "#eff6ff";
		ctx.fillRect(paddingX, y, canvas.width - (paddingX * 2), 198);
		ctx.strokeStyle = "#bfdbfe";
		ctx.strokeRect(paddingX, y, canvas.width - (paddingX * 2), 198);
		ctx.fillStyle = "#0f172a";
		ctx.font = "bold 18px Arial";
		ctx.fillText(`Ringkasan Shift Terpilih: ${selectedShift.shiftName}`, paddingX + 12, y + 28);
		y += 28;
		ctx.font = "14px Arial";
		const detailRows = [
			`Kasir: ${selectedShift.cashierName || "-"}`,
			`Tim: ${selectedShift.teamMembers || "-"}`,
			`Status: ${selectedShift.status}`,
			`Revenue Bersih: ${formatCurrencyIDR(selectedShift.totalRevenue)}`,
			`Penjualan Bruto: ${formatCurrencyIDR(selectedShift.totalGrossSales)}`,
			`Diskon: ${formatCurrencyIDR(selectedShift.totalDiscount)}`,
			`Pengeluaran: ${formatCurrencyIDR(selectedShift.totalExpenses)}`,
			`Total Produk: ${selectedShift.totalItemsSold} item`,
			`Transaksi: ${selectedShift.orderCount}`,
			`Target Shift: ${selectedShift.hasTarget ? (selectedShift.isShiftTargetMet ? "Tercapai" : "Tidak Tercapai") : "-"}`,
			`Target Harian: ${selectedShift.hasTarget ? (selectedShift.isDailyTargetMet ? "Tercapai" : "Tidak Tercapai") : "-"}`,
		];
		detailRows.forEach((line) => {
			ctx.fillStyle = "#1f2937";
			ctx.fillText(line, paddingX + 16, y + 24);
			y += 22;
		});
		y += 12;
	}

	if (details?.topProducts?.length) {
		y += 4;
		ctx.fillStyle = "#0f172a";
		ctx.font = "bold 16px Arial";
		ctx.fillText("Top Produk", paddingX, y);
		y += 24;
		ctx.font = "13px Arial";
		details.topProducts.forEach((p, index) => {
			ctx.fillStyle = "#1f2937";
			ctx.fillText(`${index + 1}. ${p.productName}`, paddingX + 4, y);
			ctx.fillText(`${p.quantity}`, paddingX + 520, y);
			y += 20;
		});
	}

	if (details?.expenseBreakdown?.length) {
		y += 8;
		ctx.fillStyle = "#0f172a";
		ctx.font = "bold 16px Arial";
		ctx.fillText("Rincian Pengeluaran", 30, y);
		y += 24;
		ctx.font = "13px Arial";
		details.expenseBreakdown.forEach((e) => {
			ctx.fillStyle = "#1f2937";
			ctx.fillText(e.category, paddingX + 4, y);
			ctx.fillText(formatCurrencyIDR(e.amount), paddingX + 330, y);
			y += 20;
		});
	}

	const link = document.createElement("a");
	link.download = `laporan-shift-${Date.now()}.jpg`;
	link.href = canvas.toDataURL("image/jpeg", 0.92);
	link.click();
}
