import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ArrowLeft,
	Copy,
	FileText,
	RefreshCw,
} from "lucide-react";
import type { Doc } from "@/types/backend-compat";
import {
	useHybridOrders,
	useHybridShiftStatus,
	useHybridShiftReportRows,
	useHybridProducts,
	useHybridCategories,
	useHybridCurrentMonthProgress,
	useHybridSiteSettings,
	useHybridStaffUsers,
	triggerHybridRefresh,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridAllTransactions,
} from "@/hooks/use-hybrid-finance-analytics-data";

export const Route = createLazyFileRoute("/laporan")({
	component: LaporanPage,
});

function LaporanPage() {
	const navigate = useNavigate();
	const [refreshTick, setRefreshTick] = useState(0);

	const today = useMemo(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}, []);

	const todayStart = today.getTime();

	const siteSettings = useHybridSiteSettings(refreshTick);
	const shiftStatus = useHybridShiftStatus(refreshTick);
	const shiftReportRows = useHybridShiftReportRows(refreshTick);
	const allStaffUsers = useHybridStaffUsers();
	const monthProgress = useHybridCurrentMonthProgress(refreshTick);
	const categoriesList = useHybridCategories(refreshTick);
	const products = useHybridProducts(null, refreshTick);

		const todayOrders = useHybridOrders({
			limit: 2000,
			refreshTrigger: refreshTick,
		});

	const todayTransactions = useHybridAllTransactions({
		startDate: todayStart,
		refreshTrigger: refreshTick,
	});

	const dailyReportText = useMemo(() => {
		const dateStr = new Date().toLocaleDateString("id-ID", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		});

		const completedOrders = (todayOrders ?? []).filter(
			(o: Doc<"orders">) =>
				(o.status === "completed" || o.status === "paid") &&
				o.createdAt >= todayStart,
		);

		const totalCash = completedOrders
			.filter(
				(o: Doc<"orders">) =>
					["cash", "tunai"].includes(String(o.paymentMethod ?? "").toLowerCase())
			)
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);

		const totalQris = completedOrders
			.filter(
				(o: Doc<"orders">) =>
					["qris", "transfer"].includes(String(o.paymentMethod ?? "").toLowerCase())
			)
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);

		const totalDjiwaPay = completedOrders
			.filter((o: Doc<"orders">) => ["wallet", "djiwa_pay", "djiwaapp"].includes(String(o.paymentMethod ?? "").toLowerCase()))
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
		const totalOther = completedOrders
			.filter((o: Doc<"orders">) => !["cash", "tunai", "qris", "transfer", "wallet", "djiwa_pay", "djiwaapp"].includes(String(o.paymentMethod ?? "").toLowerCase()))
			.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);

		const totalItems = completedOrders.reduce(
			(acc: number, o: Doc<"orders">) =>
				acc +
				o.items.reduce((s: number, i: any) => s + i.quantity, 0),
			0
		);

		const totalDiscountAmount = completedOrders.reduce(
			(acc: number, o: Doc<"orders">) => acc + (o.discountAmount || 0),
			0
		);

		const totalRevenue = totalCash + totalQris + totalDjiwaPay + totalOther;
		const totalGrossRevenue = totalRevenue + totalDiscountAmount;

		const itemsByCatAndProd: Record<string, Record<string, number>> = {};
		const itemsByName: Record<string, number> = {};

		completedOrders.forEach((o: Doc<"orders">) => {
			o.items.forEach((item: any) => {
				const product = products?.find((p: any) => p._id === item.productId);
				const cat =
					categoriesList?.find((c: any) => c._id === product?.categoryId)
						?.name || "Lainnya";
				const name = item.productName || "Unknown";
				if (!itemsByCatAndProd[cat]) itemsByCatAndProd[cat] = {};
				itemsByCatAndProd[cat][name] =
					(itemsByCatAndProd[cat][name] || 0) + item.quantity;
				itemsByName[name] = (itemsByName[name] || 0) + item.quantity;
			});
		});

		let productsText = "";
		Object.entries(itemsByCatAndProd).forEach(([cat, prods]) => {
			const catTotal = Object.values(prods).reduce((a, b) => a + b, 0);
			productsText += `- ${cat} (${catTotal}):\n`;
			Object.entries(prods).forEach(([name, qty]) => {
				productsText += `  • ${name}: ${qty}\n`;
			});
		});
		if (!productsText) productsText = "-";
		else productsText = productsText.trimEnd();

		const topProductsText = Object.entries(itemsByName)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([name, qty]) => `- ${name}: ${qty}`)
			.join("\n") || "-";

		const expensesByCategory: Record<string, number> = {};
		let totalExpenseVal = 0;
		(todayTransactions ?? [])
			.filter((t: any) => t.type === "expense" && t.status === "completed")
			.forEach((t: any) => {
				const cat = t.category || "Lainnya";
				expensesByCategory[cat] =
					(expensesByCategory[cat] || 0) + t.amount;
				totalExpenseVal += t.amount;
			});

		const netBalance = totalRevenue - totalExpenseVal;

		const expensesText = Object.entries(expensesByCategory)
			.map(
				([cat, amount]) =>
					`${cat}: Rp. ${amount.toLocaleString("id-ID")}`
			)
			.join("\n") || "Tidak ada pengeluaran hari ini";

		const shopName = siteSettings?.storeName || "Djiwa Tentram";

		let allShiftsText = "";
		if (shiftStatus?.allShifts && shiftStatus.allShifts.length > 0) {
			shiftStatus.allShifts.forEach(
				(shiftObj: any, index: number) => {
					const sStart = shiftObj.startTime;
					const sEnd = shiftObj.endTime || Date.now();
					const sOrders = completedOrders.filter(
						(o: Doc<"orders">) =>
							o.createdAt >= sStart && o.createdAt <= sEnd
					);
					const sCash = sOrders
						.filter(
							(o: Doc<"orders">) =>
								o.paymentMethod === "cash" ||
								o.paymentMethod === "tunai"
						)
						.reduce(
							(acc: number, o: Doc<"orders">) => acc + o.totalAmount,
							0
						);
					const sQris = sOrders
						.filter((o: Doc<"orders">) => ["qris", "transfer"].includes(String(o.paymentMethod ?? "").toLowerCase()))
						.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
					const sDjiwaPay = sOrders
						.filter((o: Doc<"orders">) => ["wallet", "djiwa_pay", "djiwaapp"].includes(String(o.paymentMethod ?? "").toLowerCase()))
						.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
					const sOther = sOrders
						.filter((o: Doc<"orders">) => !["cash", "tunai", "qris", "transfer", "wallet", "djiwa_pay", "djiwaapp"].includes(String(o.paymentMethod ?? "").toLowerCase()))
						.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);
					const sItems = sOrders.reduce(
						(acc: number, o: Doc<"orders">) =>
							acc +
							o.items.reduce(
								(s: number, i: any) => s + i.quantity,
								0
							),
						0
					);
					const sDiscountAmount = sOrders.reduce(
						(acc: number, o: Doc<"orders">) =>
							acc + (o.discountAmount || 0),
						0
					);
					const sRevenue = sCash + sQris + sDjiwaPay + sOther;
					const sGrossRevenue = sRevenue + sDiscountAmount;

					const sItemsByCatAndProd: Record<
						string,
						Record<string, number>
					> = {};
					const sItemsByName: Record<string, number> = {};
					sOrders.forEach((o: Doc<"orders">) => {
						o.items.forEach((item: any) => {
							const product = products?.find(
								(p: any) => p._id === item.productId
							);
							const cat =
								categoriesList?.find(
									(c: any) => c._id === product?.categoryId
								)?.name || "Lainnya";
							const name = item.productName || "Unknown";
							if (!sItemsByCatAndProd[cat])
								sItemsByCatAndProd[cat] = {};
							sItemsByCatAndProd[cat][name] =
								(sItemsByCatAndProd[cat][name] || 0) +
								item.quantity;
							sItemsByName[name] =
								(sItemsByName[name] || 0) + item.quantity;
						});
					});

					let sProductsText = "";
					Object.entries(sItemsByCatAndProd).forEach(([cat, prods]) => {
						const catTotal = Object.values(prods).reduce(
							(a, b) => a + b,
							0
						);
						sProductsText += `- ${cat} (${catTotal}):\n`;
						Object.entries(prods).forEach(([name, qty]) => {
							sProductsText += `  • ${name}: ${qty}\n`;
						});
					});
					if (!sProductsText) sProductsText = "-";
					else sProductsText = sProductsText.trimEnd();

					const sTopProductsText =
						Object.entries(sItemsByName)
							.sort((a, b) => b[1] - a[1])
							.slice(0, 3)
							.map(([name, qty]) => `- ${name}: ${qty}`)
							.join("\n") || "-";

					const sTransactions =
						(todayTransactions ?? []).filter(
							(t: any) => t.date >= sStart && t.date <= sEnd
						) || [];
					let sExpenseVal = 0;
					let sModalVal = 0;
					sTransactions
						.filter((t: any) => t.status === "completed")
						.forEach((t: any) => {
							if (t.type === "expense") sExpenseVal += t.amount;
							if (
								t.type === "income" &&
								t.category?.toLowerCase().includes("modal")
							)
								sModalVal += t.amount;
						});

					const statusLabel = shiftObj.endTime
						? " (SELESAI)"
						: " (AKTIF)";

					const teamLabel = (() => {
						if (!shiftObj.teamMembers) return "";
						const names = shiftObj.teamMembers
							.split(",")
							.map((n: string) => n.trim())
							.filter(Boolean);
						if (!names.length) return "";
						if (!allStaffUsers?.length)
							return `\nTim: ${shiftObj.teamMembers}`;
						const grouped = new Map<string, string[]>();
						names.forEach((name: string) => {
							const user = allStaffUsers.find(
								(u: any) =>
									u.name.trim().toLowerCase() ===
									name.toLowerCase()
							);
							const role = user?.roleName?.trim() || "Lainnya";
							if (!grouped.has(role)) grouped.set(role, []);
							grouped.get(role)!.push(name);
						});
						const roleOrder = [
							"Barista",
							"Kitchen",
							"Kasir",
							"Waitress",
							"Manajer",
						];
						const sortedRoles = [...grouped.keys()].sort((a, b) => {
							const ai = roleOrder.findIndex(
								(r) => r.toLowerCase() === a.toLowerCase()
							);
							const bi = roleOrder.findIndex(
								(r) => r.toLowerCase() === b.toLowerCase()
							);
							return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
						});
						return (
							"\n" +
							sortedRoles
								.map((role) => {
									const formattedRole =
										role.charAt(0).toUpperCase() +
										role.slice(1).toLowerCase();
									return `${formattedRole}: ${grouped.get(role)!.join(", ")}`;
								})
								.join("\n")
						);
					})();

					allShiftsText += `👥 ${(
						shiftObj.shiftName?.toUpperCase() ||
						`SHIFT ${index + 1}`
					)}${statusLabel}\nModal Kasir: Rp. ${sModalVal.toLocaleString(
						"id-ID"
					)}\nTunai: Rp. ${sCash.toLocaleString(
						"id-ID"
					)}\nDebit/QRIS: Rp. ${sQris.toLocaleString(
						"id-ID"
					)}\nDJIWA PAY: Rp. ${sDjiwaPay.toLocaleString(
						"id-ID"
					)}\nLainnya: Rp. ${sOther.toLocaleString(
						"id-ID"
					)}\n\nTotal Penjualan Bruto: Rp. ${sGrossRevenue.toLocaleString(
						"id-ID"
					)}\nTotal Potongan (Diskon): Rp. ${sDiscountAmount.toLocaleString(
						"id-ID"
					)}\nTotal Revenue Bersih ${shiftObj.shiftName || "Shift"}: Rp. ${sRevenue.toLocaleString(
						"id-ID"
					)}\n\nProduk Terjual: ${sItems}\nRincian Produk:\n${sProductsText}\n\n⭐ TOP 3 PRODUK TERLARIS (SHIFT INI):\n${sTopProductsText}\n\nPengeluaran Shift: Rp. ${sExpenseVal.toLocaleString(
						"id-ID"
					)}\n\n${(() => {
						if (!monthProgress?.hasTarget) return "";
						const shiftTarget = monthProgress.shiftTarget || 0;
						const isMet = sRevenue >= shiftTarget;
						const pct =
							shiftTarget > 0
								? Math.round((sRevenue / shiftTarget) * 100)
								: 0;
						const statusIcon = isMet ? "✅" : "❌";
						return `🎯 TARGET SHIFT:\n- Target: Rp. ${shiftTarget.toLocaleString(
							"id-ID"
						)}\n- Realisasi: Rp. ${sRevenue.toLocaleString(
							"id-ID"
						)}\n- ${statusIcon} ${isMet ? "Tercapai" : "Belum Tercapai"} (${pct}%)`;
					})()}\n\n${(() => {
						const report = (shiftReportRows ?? []).find((row: any) => Number(row.startTime) === Number(sStart));
						const bonuses = report?.memberBonuses ?? [];
						if (!bonuses.length) return "";
						const lines = bonuses.map((member: any) => {
							const tiers = (member.allTiers ?? []).map((tier: any) => `${tier.thresholdPct}%: Rp. ${Number(tier.bonusAmount ?? 0).toLocaleString("id-ID")}`).join(" | ");
							const achieved = member.achievedTiers?.length ? `Tercapai ${member.achievedTiers.join("%, ")}%` : "Belum mencapai tier";
							return `- ${member.name} (${member.roleName}) — Basis ${member.basis === "daily" ? "Harian" : member.basis === "monthly" ? "Bulanan" : "Shift"}\n  Tier: ${tiers || "-"}\n  ${achieved} | Bonus: Rp. ${Number(member.bonus ?? 0).toLocaleString("id-ID")}`;
						}).join("\\n");
						return `🎁 BONUS BERTINGKAT:\\n${lines}`;
					})()}\n\nKasir: ${shiftObj.cashierName || "Kasir"}${teamLabel}\n---\n`;
				}
			);
		} else {
			allShiftsText = `👥 BELUM ADA SHIFT\n---\n`;
		}

		return `📊 Daily Revenue Report\n${shopName} -\n🗕️ Tanggal: ${dateStr}\n---\n${allShiftsText}\n💰 TOTAL REVENUE HARIAN (NET):\nRp. ${totalRevenue.toLocaleString(
			"id-ID"
		)}\n📦 TOTAL PRODUK TERJUAL: ${totalItems}\nTotal Penjualan Bruto (Gross): Rp. ${totalGrossRevenue.toLocaleString(
			"id-ID"
		)}\nTotal Potongan (Diskon/Voucher): Rp. ${totalDiscountAmount.toLocaleString(
			"id-ID"
		)}\nNet Revenue Harian: Rp. ${totalRevenue.toLocaleString("id-ID")}\n\nRincian Produk Harian:\n${productsText}\n\n⭐ TOP 3 PRODUK TERLARIS (HARIAN):\n${topProductsText}\n${(() => {
			if (!monthProgress?.hasTarget) return "";
			const pct = Math.round(monthProgress.progressPct || 0);
			const monthlyTarget = monthProgress.targetRevenue || 0;
			const monthlyIncome = monthProgress.currentIncome || 0;
			const dailyTarget = monthProgress.dailyTarget || 0;
			const isDailyMet = totalRevenue >= dailyTarget;
			return `---\n🎯 TARGET BULANAN:\n• Target: Rp. ${monthlyTarget.toLocaleString(
				"id-ID"
			)}\n• Realisasi: Rp. ${monthlyIncome.toLocaleString(
				"id-ID"
			)}\n• Progress: ${pct}% (Hari ${monthProgress.daysPassed}/${monthProgress.daysInMonth})\n• Proyeksi Akhir: Rp. ${Math.round(
				monthProgress.projectedMonthly || 0
			).toLocaleString("id-ID")}\n\n🎯 TARGET HARIAN:\n• Target: Rp. ${dailyTarget.toLocaleString(
				"id-ID"
			)}\n• Realisasi: Rp. ${totalRevenue.toLocaleString(
				"id-ID"
			)}\n• ${isDailyMet ? "✅ Tercapai" : "❌ Belum Tercapai"} (${dailyTarget > 0 ? Math.round((totalRevenue / dailyTarget) * 100) : 0}%)`;
		})()}\n---\n📝 RINGKASAN PENGELUARAN HARIAN\n${expensesText}\nTotal Pengeluaran: Rp. ${totalExpenseVal.toLocaleString(
			"id-ID"
		)}\n---\n📝 RINGKASAN HARIAN\n${dateStr} :\nGrand Total Revenue (Net): Rp. ${totalRevenue.toLocaleString(
			"id-ID"
		)}\nTotal Penjualan Bruto: Rp. ${totalGrossRevenue.toLocaleString(
			"id-ID"
		)}\nTotal Potongan: Rp. ${totalDiscountAmount.toLocaleString(
			"id-ID"
		)}\nTotal Pengeluaran: Rp. ${totalExpenseVal.toLocaleString(
			"id-ID"
		)}\nKas Bersih (Net): Rp. ${netBalance.toLocaleString("id-ID")}\n`;
	}, [
		todayOrders,
		todayTransactions,
		shiftStatus,
		shiftReportRows,
		products,
		categoriesList,
		monthProgress,
		siteSettings,
		allStaffUsers,
	]);

	const handleRefresh = () => {
		setRefreshTick((t) => t + 1);
		triggerHybridRefresh();
		toast.success("Data sudah real-time!");
	};

	const isLoading =
		todayOrders === undefined ||
		todayTransactions === undefined ||
		shiftStatus === undefined;

	return (
		<div className="app-page min-h-app text-foreground">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-4 md:max-w-4xl">
				{/* Header */}
				<header className="flex items-center gap-3 mb-5">
					<button
						type="button"
						onClick={() => navigate({ to: "/menu" })}
						className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/80"
					>
						<ArrowLeft className="h-5 w-5" />
					</button>
					<div className="flex items-center gap-2">
						<FileText className="h-5 w-5 text-primary" />
						<h1 className="text-base font-bold tracking-tight">
							Laporan Harian
						</h1>
					</div>
				</header>

				{/* Ringkasan Hari Ini — sama persis dashboard */}
				<section className="mb-5 space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="font-bold text-sm">Ringkasan Hari Ini</h3>
						<div className="flex items-center gap-0.5">
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
								disabled={!dailyReportText}
								onClick={async () => {
									if (!dailyReportText) return;
									await navigator.clipboard.writeText(dailyReportText);
									toast.success("Laporan Harian Berhasil Disalin!");
								}}
							>
								<Copy className="h-3.5 w-3.5" />
								Salin
							</button>
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-600 disabled:opacity-50"
								disabled={!dailyReportText}
								onClick={async () => {
									if (!dailyReportText) return;
									try {
										const { sendTelegramReport } = await import(
											"@/lib/telegram-report"
										);
										const result = await sendTelegramReport(dailyReportText);
										if (result.ok) {
											toast.success(
												"Laporan berhasil dikirim ke Telegram!"
											);
										} else {
											toast.error(
												result.error ||
													"Gagal mengirim ke Telegram"
											);
										}
									} catch (err: any) {
										toast.error(
											err?.message ||
												"Gagal mengirim ke Telegram"
										);
									}
								}}
							>
								<svg
									className="h-3.5 w-3.5"
									viewBox="0 0 24 24"
									fill="currentColor"
								>
									<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
								</svg>
								Telegram
							</button>
							<button
								type="button"
								className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
								onClick={handleRefresh}
								title="Refresh Data"
							>
								<RefreshCw className="h-3.5 w-3.5" />
								Refresh
							</button>
						</div>
					</div>

					{isLoading ? (
						<div className="py-8 text-sm text-muted-foreground">
							Memuat data laporan...
						</div>
					) : (
						<div className="rounded-2xl border border-border bg-card p-4 text-foreground shadow-sm">
							<pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5">
								{dailyReportText}
							</pre>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
