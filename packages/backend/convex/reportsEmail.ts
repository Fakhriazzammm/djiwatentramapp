import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCurrency(amount: number) {
	return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatDateTime(timestamp: number) {
	return new Intl.DateTimeFormat("id-ID", {
		timeZone: "Asia/Jakarta",
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(timestamp));
}

function formatDateOnly(timestamp: number) {
	return new Intl.DateTimeFormat("id-ID", {
		timeZone: "Asia/Jakarta",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(new Date(timestamp));
}

function formatShiftTimeRange(startTime: number, endTime?: number) {
	return `${formatDateTime(startTime)} - ${
		endTime ? formatDateTime(endTime) : "Aktif"
	}`;
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function buildShiftReportLines(input: {
	storeName: string;
	startTime: number;
	shiftName: string;
	status: string;
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalItemsSold: number;
	totalExpenses: number;
	cashierName: string;
	teamMembers?: string;
	productBreakdown?: Array<{
		categoryName: string;
		totalQuantity: number;
		items: Array<{ productName: string; quantity: number }>;
	}>;
	topProducts?: Array<{ productName: string; quantity: number }>;
	expenseBreakdown?: Array<{ category: string; amount: number }>;
}) {
	const lines: string[] = [
		"Daily Revenue Report",
		input.storeName,
		`Tanggal: ${formatDateOnly(input.startTime)}`,
		"",
		`${input.shiftName} (${input.status})`,
		`Modal Kasir: ${formatCurrency(input.startingCash)}`,
		`Tunai: ${formatCurrency(input.cashRevenue)}`,
		`Debit/QRIS: ${formatCurrency(input.qrisRevenue)}`,
		`Lainnya: ${formatCurrency(input.otherRevenue)}`,
		"",
		`Total Penjualan Bruto: ${formatCurrency(input.totalGrossSales)}`,
		`Total Potongan (Diskon): ${formatCurrency(input.totalDiscount)}`,
		`Total Revenue Bersih: ${formatCurrency(input.totalRevenue)}`,
		"",
		`Produk Terjual: ${input.totalItemsSold}`,
		"Rincian Produk:",
	];

	if (input.productBreakdown && input.productBreakdown.length > 0) {
		for (const category of input.productBreakdown) {
			lines.push(`- ${category.categoryName} (${category.totalQuantity})`);
			for (const item of category.items) {
				lines.push(`  • ${item.productName}: ${item.quantity}`);
			}
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	lines.push("TOP 3 PRODUK TERLARIS:");
	if (input.topProducts && input.topProducts.length > 0) {
		for (const item of input.topProducts) {
			lines.push(`- ${item.productName}: ${item.quantity}`);
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	lines.push(`Pengeluaran Shift: ${formatCurrency(input.totalExpenses)}`);
	if (input.expenseBreakdown && input.expenseBreakdown.length > 0) {
		for (const item of input.expenseBreakdown) {
			lines.push(`- ${item.category}: ${formatCurrency(item.amount)}`);
		}
	}

	lines.push("");
	lines.push(`Kasir: ${input.cashierName || "-"}`);
	lines.push(`Tim: ${input.teamMembers?.trim() || "-"}`);

	return lines;
}

function buildShiftReportHtml(lines: string[]) {
	return `
		<div style="font-family: Arial, sans-serif; color: #0f172a;">
			<h2 style="margin: 0 0 12px;">Laporan Shift</h2>
			<p style="margin: 0 0 12px; color: #475569;">
				Format email ini sama dengan ringkasan laporan shift pada aplikasi.
			</p>
			<pre style="white-space: pre-wrap; font-family: 'Courier New', monospace; background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 12px; line-height: 1.7; font-size: 13px;">${escapeHtml(
				lines.join("\n"),
			)}</pre>
		</div>
	`;
}

async function getRecipients(
	ctx: any,
	explicitTo?: string[]
) {
	if (explicitTo && explicitTo.length > 0) {
		return explicitTo;
	}

	const fromUsers = await ctx.runQuery(
		(api as any).users.getReportRecipientEmails,
		{}
	);
	if (fromUsers && fromUsers.length > 0) {
		return fromUsers;
	}

	const envTargets =
		process.env.ADMIN_REPORT_EMAILS ??
		process.env.REPORT_ADMIN_EMAILS ??
		"";
	const recipients = envTargets
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

	if (recipients.length === 0) {
		throw new ConvexError(
			"Email admin belum diset. Isi ADMIN_REPORT_EMAILS di environment Convex."
		);
	}

	return recipients;
}

async function sendEmail(params: {
	ctx: any;
	to?: string[];
	subject: string;
	html: string;
	text: string;
}) {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		throw new ConvexError(
			"RESEND_API_KEY belum diset di environment Convex."
		);
	}

	const settings = await params.ctx.runQuery(api.site_settings.getSettings, {});
	const configuredFrom =
		typeof settings?.resendFromEmail === "string"
			? settings.resendFromEmail.trim().toLowerCase()
			: "";
	const envFrom = (process.env.RESEND_FROM_EMAIL || "").trim().toLowerCase();
	const fromCandidate = configuredFrom || envFrom;
	const from = EMAIL_REGEX.test(fromCandidate)
		? fromCandidate
		: "onboarding@resend.dev";
	const to = await getRecipients(params.ctx, params.to);

	const requestPayload = {
		from,
		to,
		subject: params.subject,
		html: params.html,
		text: params.text,
	};

	const response = await fetch(RESEND_ENDPOINT, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestPayload),
	});

	const result = await response.json();
	if (!response.ok) {
		const rawMessage =
			typeof result?.message === "string"
				? result.message
				: "Gagal mengirim email via Resend.";
		const sandboxMatch = rawMessage.match(/\(([^\s@]+@[^\s@]+\.[^\s@]+)\)/);
		if (rawMessage.includes("You can only send testing emails to your own email address") && sandboxMatch) {
			const sandboxRecipient = sandboxMatch[1].toLowerCase();
			const retryResponse = await fetch(RESEND_ENDPOINT, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					...requestPayload,
					to: [sandboxRecipient],
				}),
			});
			const retryResult = await retryResponse.json();
			if (retryResponse.ok) {
				return {
					...retryResult,
					_fallbackRecipient: sandboxRecipient,
				};
			}
			throw new ConvexError(
				`Resend masih mode testing. Email hanya bisa dikirim ke ${sandboxRecipient}.`
			);
		}
		throw new ConvexError(rawMessage);
	}

	return result;
}

export const sendShiftClosureEmail = action({
	args: {
		storeName: v.optional(v.string()),
		shiftName: v.string(),
		cashierName: v.string(),
		startTime: v.number(),
		endTime: v.number(),
		startingCash: v.number(),
		endingCashPhysical: v.number(),
		totalRevenue: v.number(),
		totalExpenses: v.number(),
		totalItemsSold: v.number(),
		cashRevenue: v.number(),
		qrisRevenue: v.number(),
		totalDiscount: v.number(),
		notes: v.optional(v.string()),
		to: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const storeName = args.storeName?.trim() || "Toko";
		const subject = `[${storeName}] Laporan Shift ${args.shiftName} - ${new Date(
			args.endTime
		).toLocaleDateString("id-ID")}`;

		const html = `
			<div style="font-family: Arial, sans-serif; color: #0f172a;">
				<h2 style="margin: 0 0 12px;">Laporan Shift - ${storeName}</h2>
				<p style="margin: 0 0 16px;">Shift <strong>${args.shiftName}</strong> oleh <strong>${args.cashierName}</strong></p>
				<table style="border-collapse: collapse; width: 100%; max-width: 640px;">
					<tr><td style="padding: 6px 0;">Waktu</td><td style="padding: 6px 0;"><strong>${formatDateTime(args.startTime)} - ${formatDateTime(args.endTime)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Modal Awal</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.startingCash)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Setoran Fisik</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.endingCashPhysical)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Total Revenue</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalRevenue)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Total Expense</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalExpenses)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Cash</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.cashRevenue)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">QRIS/Transfer</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.qrisRevenue)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Diskon</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalDiscount)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Item Terjual</td><td style="padding: 6px 0;"><strong>${args.totalItemsSold}</strong></td></tr>
				</table>
				${
					args.notes
						? `<p style="margin-top: 16px;"><strong>Catatan:</strong><br/>${args.notes}</p>`
						: ""
				}
			</div>
		`;

		const textLines = [
			`Laporan Shift - ${storeName}`,
			`Shift: ${args.shiftName}`,
			`Kasir: ${args.cashierName}`,
			`Waktu: ${formatDateTime(args.startTime)} - ${formatDateTime(args.endTime)}`,
			`Modal Awal: ${formatCurrency(args.startingCash)}`,
			`Setoran Fisik: ${formatCurrency(args.endingCashPhysical)}`,
			`Total Revenue: ${formatCurrency(args.totalRevenue)}`,
			`Total Expense: ${formatCurrency(args.totalExpenses)}`,
			`Cash: ${formatCurrency(args.cashRevenue)}`,
			`QRIS/Transfer: ${formatCurrency(args.qrisRevenue)}`,
			`Diskon: ${formatCurrency(args.totalDiscount)}`,
			`Item Terjual: ${args.totalItemsSold}`,
		];
		if (args.notes) {
			textLines.push(`Catatan: ${args.notes}`);
		}

		const result = await sendEmail({
			ctx,
			to: args.to,
			subject,
			html,
			text: textLines.join("\n"),
		});

		return { success: true, result };
	},
});

export const sendShiftReportEmail = action({
	args: {
		startTime: v.number(),
		endTime: v.optional(v.number()),
		to: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const settings = await ctx.runQuery(api.site_settings.getSettings, {});
		const storeName = settings?.storeName?.trim() || "Toko";
		const details = await ctx.runQuery(api.finance.getShiftDetails, {
			startTime: args.startTime,
			endTime: args.endTime,
		});

		if (!details) {
			throw new ConvexError("Data shift tidak ditemukan.");
		}

		const lines = buildShiftReportLines({
			storeName,
			startTime: details.startTime,
			shiftName: details.shiftName || "Shift",
			status: details.status || "SELESAI",
			startingCash: details.startingCash || 0,
			cashRevenue: details.cashRevenue || 0,
			qrisRevenue: details.qrisRevenue || 0,
			otherRevenue: details.otherRevenue || 0,
			totalGrossSales: details.totalGrossSales || 0,
			totalDiscount: details.totalDiscount || 0,
			totalRevenue: details.totalRevenue || 0,
			totalItemsSold: details.totalItemsSold || 0,
			totalExpenses: details.totalExpenses || 0,
			cashierName: details.cashierName || "-",
			teamMembers: details.teamMembers || "-",
			productBreakdown: details.productBreakdown || [],
			topProducts: details.topProducts || [],
			expenseBreakdown: details.expenseBreakdown || [],
		});

		const subject = `[${storeName}] Laporan Shift ${
			details.shiftName || "Shift"
		} - ${formatDateOnly(details.startTime)}`;

		const result = await sendEmail({
			ctx,
			to: args.to,
			subject,
			html: buildShiftReportHtml(lines),
			text: lines.join("\n"),
		});

		return {
			success: true,
			result,
			subject,
			previewText: lines.join("\n"),
		};
	},
});

export const sendDailySummaryEmail = action({
	args: {
		storeName: v.optional(v.string()),
		periodLabel: v.string(),
		totalIncome: v.number(),
		totalExpense: v.number(),
		netProfit: v.number(),
		totalInflow: v.number(),
		totalOutflow: v.number(),
		netCashFlow: v.number(),
		transactionCount: v.number(),
		to: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const storeName = args.storeName?.trim() || "Toko";
		const subject = `[${storeName}] Laporan Harian - ${args.periodLabel}`;

		const html = `
			<div style="font-family: Arial, sans-serif; color: #0f172a;">
				<h2 style="margin: 0 0 12px;">Laporan Harian - ${storeName}</h2>
				<p style="margin: 0 0 16px;">Periode: <strong>${args.periodLabel}</strong></p>
				<table style="border-collapse: collapse; width: 100%; max-width: 640px;">
					<tr><td style="padding: 6px 0;">Total Income</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalIncome)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Total Expense</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalExpense)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Net Profit</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.netProfit)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Cash Inflow</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalInflow)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Cash Outflow</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.totalOutflow)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Net Cash Flow</td><td style="padding: 6px 0;"><strong>${formatCurrency(args.netCashFlow)}</strong></td></tr>
					<tr><td style="padding: 6px 0;">Jumlah Transaksi</td><td style="padding: 6px 0;"><strong>${args.transactionCount}</strong></td></tr>
				</table>
			</div>
		`;

		const text = [
			`Laporan Harian - ${storeName}`,
			`Periode: ${args.periodLabel}`,
			`Total Income: ${formatCurrency(args.totalIncome)}`,
			`Total Expense: ${formatCurrency(args.totalExpense)}`,
			`Net Profit: ${formatCurrency(args.netProfit)}`,
			`Cash Inflow: ${formatCurrency(args.totalInflow)}`,
			`Cash Outflow: ${formatCurrency(args.totalOutflow)}`,
			`Net Cash Flow: ${formatCurrency(args.netCashFlow)}`,
			`Jumlah Transaksi: ${args.transactionCount}`,
		].join("\n");

		const result = await sendEmail({
			ctx,
			to: args.to,
			subject,
			html,
			text,
		});

		return { success: true, result };
	},
});
