import { createLazyFileRoute } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import {
	useHybridCreateDiscount,
	useHybridDeleteDiscount,
	useHybridGenerateDiscountStrategy,
	useHybridUpdateDiscount,
} from "@/hooks/use-hybrid-write-actions";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertCircle,
	Calendar,
	Check,
	Clock,
	Copy,
	Download,
	Edit,
	EyeOff,
	Filter,
	LayoutGrid,
	List,
	MoreHorizontal,
	Plus,
	Search,
	Sparkles,
	Tag,
	Trash2,
	TrendingUp,
	X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { withSaveToast } from "@/lib/with-save-toast";
import {
	useHybridAllDiscounts,
	useHybridAllProducts,
	useHybridCategories,
	useHybridOrders,
} from "@/hooks/use-hybrid-pos-data";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createLazyFileRoute("/admin/discounts")({
	component: AdminDiscountsPage,
});

function AdminDiscountsPage() {
	const discounts = useHybridAllDiscounts();
	const categories = useHybridCategories();
	const products = useHybridAllProducts();

	const createDiscount = useHybridCreateDiscount();
	const updateDiscount = useHybridUpdateDiscount();
	const deleteDiscount = useHybridDeleteDiscount();

	const orders = useHybridOrders();
	const generateDiscountStrategy = useHybridGenerateDiscountStrategy();

	const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
	const [loadingAi, setLoadingAi] = useState(false);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [searchTarget, setSearchTarget] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [filterStatus, setFilterStatus] = useState<string>("all");
	const [filterType, setFilterType] = useState<string>("all");
	const [viewMode, setViewMode] = useState<"table" | "card">("table");
	const [showDjiwaPayRule, setShowDjiwaPayRule] = useState(true);

	const djiwaPayRule = {
		name: "Voucher Djiwa Pay 20%",
		value: 20,
		channel: "Djiwa Pay saja",
		reward: "+Rp1.000 Saldo Djiwa Pay",
	};

	const [formData, setFormData] = useState<{
		id?: Id<"discounts">;
		name: string;
		code: string;
		type: "FIXED" | "PERCENTAGE" | "FLAT_PRICE";
		value: string;
		targetType: "ALL" | "CATEGORY" | "PRODUCT";
		targetIds: string[];
		isActive: boolean;
		startDate: string;
		endDate: string;
		startTime: string;
		endTime: string;
		days: number[];
		isHappyHour: boolean;
		productPrices: { productId: string; price: number }[];
		isFreeRefill: boolean;
		refillPrice: string;
		refillAvailability: "ALWAYS" | "HAPPY_HOUR";
	}>({
		name: "",
		code: "",
		type: "PERCENTAGE",
		value: "",
		targetType: "ALL",
		targetIds: [],
		isActive: true,
		startDate: "",
		endDate: "",
		startTime: "",
		endTime: "",
		days: [],
		isHappyHour: false,
		productPrices: [],
		isFreeRefill: false,
		refillPrice: "20000",
		refillAvailability: "ALWAYS",
	});

	const daysOfWeek = [
		{ id: 0, label: "Min" },
		{ id: 1, label: "Sen" },
		{ id: 2, label: "Sel" },
		{ id: 3, label: "Rab" },
		{ id: 4, label: "Kam" },
		{ id: 5, label: "Jum" },
		{ id: 6, label: "Sab" },
	];

	const getPromoStatus = useCallback((d: Doc<"discounts">) => {
		if (!d.isActive) {
			return {
				label: "Non-Aktif",
				class: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
				icon: EyeOff,
			};
		}

		const now = new Date();
		const timestamp = now.getTime();

		if (d.startDate && timestamp < d.startDate) {
			return {
				label: "Terjadwal",
				class: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
				icon: Calendar,
			};
		}
		if (d.endDate && timestamp > d.endDate) {
			return {
				label: "Kedaluwarsa",
				class: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
				icon: AlertCircle,
			};
		}

		const day = now.getDay();
		if (d.days && d.days.length > 0 && !d.days.includes(day)) {
			return {
				label: "Tidak hari ini",
				class:
					"bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
				icon: Calendar,
			};
		}

		if (d.startTime && d.endTime) {
			const [startH, startM] = d.startTime.split(":").map(Number);
			const [endH, endM] = d.endTime.split(":").map(Number);
			const start = startH * 60 + startM;
			const end = endH * 60 + endM;
			const current = now.getHours() * 60 + now.getMinutes();

			if (current < start) {
				return {
				label: "Terjadwal",
					class:
						"bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
					icon: Clock,
				};
			}
			if (current > end) {
				return {
					label: "Sudah selesai",
					class:
						"bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
					icon: Clock,
				};
			}
		}

		return {
			label: "Aktif",
			class:
				"bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
			icon: Check,
		};
	}, []);

	const handleSubmit = async (e?: React.FormEvent) => {
		if (e) {
			e.preventDefault();
		}

		const submissionData = {
			name: formData.name,
			code: formData.code || undefined,
			type: formData.type,
			value: Number(formData.value),
			targetType: formData.targetType,
			targetIds: formData.targetIds.length > 0 ? formData.targetIds : undefined,
			isActive: formData.isActive,
			startDate: formData.startDate
				? new Date(formData.startDate).getTime()
				: undefined,
			endDate: formData.endDate
				? new Date(formData.endDate).getTime()
				: undefined,
			startTime: formData.startTime || undefined,
			endTime: formData.endTime || undefined,
			days: formData.days.length > 0 ? formData.days : undefined,
			isHappyHour: formData.isHappyHour,
			productPrices: formData.isHappyHour ? formData.productPrices : undefined,
			isFreeRefill: formData.isFreeRefill,
			refillPrice: formData.isFreeRefill ? Number(formData.refillPrice) : undefined,
			refillAvailability: formData.isFreeRefill ? formData.refillAvailability : undefined,
		};

		const result2 = await withSaveToast(async () => {
			if (formData.id) {
				await updateDiscount({ id: formData.id, ...submissionData });
			} else {
				await createDiscount(submissionData);
			}
			triggerHybridRefresh();
			triggerHybridRefresh();
		}, { success: formData.id ? "Diskon diperbarui" : "Diskon dibuat" });
		if (result2.success) {
			setIsModalOpen(false);
			resetForm();
		}
	};

	const handleDelete = (id: Id<"discounts">) => {
		toast("Hapus diskon ini?", {
			action: {
				label: "Hapus",
				onClick: async () => {
					const result = await withSaveToast(
						async () => {
							await deleteDiscount({ id });
							triggerHybridRefresh();
							triggerHybridRefresh();
						},
						{ success: "Diskon dihapus" }
					);
				},
			},
		});
	};

	const resetForm = () => {
		setFormData({
			name: "",
			code: "",
			type: "PERCENTAGE",
			value: "",
			targetType: "ALL",
			targetIds: [],
			isActive: true,
			startDate: "",
			endDate: "",
			startTime: "",
			endTime: "",
			days: [],
			isHappyHour: false,
			productPrices: [],
			isFreeRefill: false,
			refillPrice: "20000",
			refillAvailability: "ALWAYS",
		});
		setSearchTarget("");
	};

	const openEdit = (discount: Doc<"discounts">) => {
		setFormData({
			id: discount._id,
			name: discount.name,
			code: discount.code || "",
			type: discount.type,
			value: String(discount.value),
			targetType: discount.targetType,
			targetIds:
				(discount as { targetIds?: string[] }).targetIds ||
				(discount.targetId ? [discount.targetId] : []),
			isActive: discount.isActive,
			startDate: discount.startDate
				? new Date(discount.startDate).toISOString().split("T")[0]
				: "",
			endDate: discount.endDate
				? new Date(discount.endDate).toISOString().split("T")[0]
				: "",
			startTime: discount.startTime || "",
			endTime: discount.endTime || "",
			days: discount.days || [],
			isHappyHour: discount.isHappyHour || false,
			productPrices: discount.productPrices || [],
			isFreeRefill: discount.isFreeRefill || false,
			refillPrice: String(discount.refillPrice || "20000"),
			refillAvailability: discount.refillAvailability || "ALWAYS",
		});
		setIsModalOpen(true);
	};

	const toggleDay = (dayId: number) => {
		setFormData((prev) => {
			if (prev.days.includes(dayId)) {
				return { ...prev, days: prev.days.filter((d) => d !== dayId) };
			}
			return { ...prev, days: [...prev.days, dayId].sort() };
		});
	};

	const toggleTarget = (id: string) => {
		setFormData((prev) => {
			if (prev.targetIds.includes(id)) {
				return { ...prev, targetIds: prev.targetIds.filter((t) => t !== id) };
			}
			return { ...prev, targetIds: [...prev.targetIds, id] };
		});
	};

	const toggleAllTargets = (ids: string[]) => {
		setFormData((prev) => {
			const allSelected = ids.every((id) => prev.targetIds.includes(id));
			if (allSelected) {
				return {
					...prev,
					targetIds: prev.targetIds.filter((id) => !ids.includes(id)),
				};
			}
			return {
				...prev,
				targetIds: Array.from(new Set([...prev.targetIds, ...ids])),
			};
		});
	};

	const copyDiscountCode = (code: string) => {
		navigator.clipboard.writeText(code);
		toast.success("Kode diskon disalin!");
	};

	const exportFilteredCsv = () => {
		const header = ["Nama", "Kode", "Tipe", "Nilai", "Status", "Mulai", "Berakhir", "Jam", "Cakupan"];
		const rows = filteredDiscounts.map((d: any) => [d.name, d.code || "", d.type, d.value, getPromoStatus(d).label, d.startDate ? new Date(d.startDate).toLocaleDateString("id-ID") : "", d.endDate ? new Date(d.endDate).toLocaleDateString("id-ID") : "", d.startTime && d.endTime ? `${d.startTime}-${d.endTime} WIB` : "", d.targetType === "ALL" ? "Semua produk" : d.targetType]);
		const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
		const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `promosi-${new Date().toISOString().slice(0, 10)}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
		toast.success(`${rows.length} promosi diekspor`);
	};

	// Filter and search logic
	const filteredDiscounts = useMemo(() => {
		if (!discounts) {
			return [];
		}

		return discounts.filter((d: any) => {
			// Search filter
			const matchesSearch =
				searchQuery === "" ||
				d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				d.code?.toLowerCase().includes(searchQuery.toLowerCase());

			// Status filter
			const status = getPromoStatus(d);
			const matchesStatus =
				filterStatus === "all" ||
				status.label.toLowerCase() === filterStatus.toLowerCase();

			// Type filter
			const matchesType =
				filterType === "all" ||
				d.type.toLowerCase() === filterType.toLowerCase();

			return matchesSearch && matchesStatus && matchesType;
		});
	}, [discounts, searchQuery, filterStatus, filterType, getPromoStatus]);

	// Statistics
	const stats = useMemo(() => {
		if (!discounts) {
			return { total: 0, active: 0, scheduled: 0, expired: 0 };
		}

		return {
			total: discounts.length,
			active: discounts.filter((d: any) => getPromoStatus(d).label === "Aktif")
				.length,
			scheduled: discounts.filter(
				(d: any) => getPromoStatus(d).label === "Terjadwal"
			).length,
			expired: discounts.filter(
				(d: any) => getPromoStatus(d).label === "Kedaluwarsa"
			).length,
		};
	}, [discounts, getPromoStatus]);

	return (
		<div className="fade-in slide-in-from-bottom-4 min-h-app animate-in bg-[#f6f8fb] duration-500">
			{/* Header Section */}
			<div className="mb-4 md:mb-8">
				<div className="mb-4 flex flex-wrap items-start justify-between gap-3 md:mb-6 md:gap-4">
					<div>
						<h1 className="mb-1 font-display font-bold text-xl tracking-tight md:mb-2 md:text-2xl lg:text-2xl">
							Manajemen Promosi
						</h1>
						<p className="text-muted-foreground text-xs md:text-sm lg:text-base">
							Control center untuk diskon, voucher, Happy Hour, dan promo pembayaran
						</p>
						<p className="mt-1 text-[11px] font-semibold text-emerald-700">Djiwa Pay: diskon otomatis 20% · reward transaksi +Rp1.000 saldo</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<button
							className="group flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-4 py-2.5 font-semibold text-purple-700 text-sm shadow-sm transition-all hover:bg-purple-50 active:scale-95 disabled:opacity-50"
							disabled={loadingAi}
							onClick={async () => {
								setLoadingAi(true);
								try {
									const salesSummary =
										orders?.slice(0, 30).map((o: any) => ({
											total: o.totalAmount,
											date: o._creationTime,
										})) || [];
									const existingDiscountsData =
										discounts?.map((d: any) => ({
											name: d.name,
											type: d.type,
											value: d.value,
										})) || [];
									const result = await generateDiscountStrategy({
										salesSummary: JSON.stringify(salesSummary),
										existingDiscounts: JSON.stringify(existingDiscountsData),
									});
									setAiSuggestion(result);
									toast.success("AI memberikan saran!");
								} catch {
									toast.error("Gagal mendapatkan saran AI");
								} finally {
									setLoadingAi(false);
								}
							}}
							type="button"
						>
							<Sparkles
								className={`h-4 w-4 ${loadingAi ? "animate-spin" : "transition-transform group-hover:rotate-12"}`}
							/>
							{loadingAi ? "Menganalisis..." : "Bantu buat promo"}
						</button>
						<button type="button" onClick={exportFilteredCsv} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 text-sm shadow-sm transition hover:bg-slate-50 active:scale-95"><Download className="h-4 w-4" />Ekspor CSV</button>
						<button
							className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground text-sm shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
							onClick={() => {
								resetForm();
								setIsModalOpen(true);
							}}
							type="button"
						>
							<Plus className="h-4 w-4" />
							Buat Promosi
						</button>
					</div>
				</div>

				{showDjiwaPayRule ? <div className="mb-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950 shadow-sm" data-marketing-rule="djiwa-pay-20">
					<div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Tag className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-black">{djiwaPayRule.name}</p><p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800">Diskon {djiwaPayRule.value}% otomatis untuk pembayaran Djiwa Pay. Tunai/kasir dan QRIS tidak eligible. Reward transaksi: {djiwaPayRule.reward}.</p></div><button type="button" onClick={() => setShowDjiwaPayRule(false)} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Sembunyikan</button></div>
				</div> : <button type="button" onClick={() => setShowDjiwaPayRule(true)} className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"><Tag className="h-3.5 w-3.5" />Lihat aturan Djiwa Pay</button>}

				{/* Statistics Cards */}
				<div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="rounded-xl border bg-card p-4 shadow-sm"
						initial={{ opacity: 0, y: 20 }}
						transition={{ delay: 0.1 }}
					>
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Total Diskon
								</p>
								<p className="mt-1 font-bold text-xl">{stats.total}</p>
							</div>
							<div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
								<Tag className="h-5 w-5 text-blue-600 dark:text-blue-300" />
							</div>
						</div>
					</motion.div>

					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="rounded-xl border bg-card p-4 shadow-sm"
						initial={{ opacity: 0, y: 20 }}
						transition={{ delay: 0.2 }}
					>
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Aktif
								</p>
								<p className="mt-1 font-bold text-xl text-green-600">
									{stats.active}
								</p>
							</div>
							<div className="rounded-lg bg-green-100 p-3 dark:bg-green-900">
								<TrendingUp className="h-5 w-5 text-green-600 dark:text-green-300" />
							</div>
						</div>
					</motion.div>

					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="rounded-xl border bg-card p-4 shadow-sm"
						initial={{ opacity: 0, y: 20 }}
						transition={{ delay: 0.3 }}
					>
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Terjadwal
								</p>
								<p className="mt-1 font-bold text-xl text-blue-600">
									{stats.scheduled}
								</p>
							</div>
							<div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
								<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-300" />
							</div>
						</div>
					</motion.div>

					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="rounded-xl border bg-card p-4 shadow-sm"
						initial={{ opacity: 0, y: 20 }}
						transition={{ delay: 0.4 }}
					>
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Kedaluwarsa
								</p>
								<p className="mt-1 font-bold text-xl text-red-600">
									{stats.expired}
								</p>
							</div>
							<div className="rounded-lg bg-red-100 p-3 dark:bg-red-900">
								<AlertCircle className="h-5 w-5 text-red-600 dark:text-red-300" />
							</div>
						</div>
					</motion.div>
				</div>

				{/* AI Suggestion Banner */}
				<AnimatePresence>
					{aiSuggestion && (
						<motion.div
							animate={{ opacity: 1, height: "auto" }}
							className="mb-6 overflow-hidden rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 shadow-sm dark:border-purple-800 dark:from-purple-950 dark:to-pink-950"
							exit={{ opacity: 0, height: 0 }}
							initial={{ opacity: 0, height: 0 }}
						>
							<div className="p-5">
								<div className="mb-3 flex items-center justify-between">
									<h3 className="flex items-center gap-2 font-bold text-purple-900 dark:text-purple-100">
										<Sparkles className="h-5 w-5" />
										Rekomendasi Strategi AI
									</h3>
									<button
										className="rounded-lg p-1 text-purple-700 transition-colors hover:bg-purple-200 dark:text-purple-300 dark:hover:bg-purple-900"
										onClick={() => setAiSuggestion(null)}
										type="button"
									>
										<X className="h-4 w-4" />
									</button>
								</div>
								<div className="whitespace-pre-line text-purple-900/90 text-sm leading-relaxed dark:text-purple-100/90">
									{aiSuggestion}
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Search and Filter Bar */}
				<div className="rounded-[18px] border border-slate-200/80 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
				<div className="mb-3 flex flex-wrap items-center gap-2">
					{([["all", "Semua", stats.total], ["aktif", "Aktif", stats.active], ["terjadwal", "Terjadwal", stats.scheduled], ["kedaluwarsa", "Berakhir", stats.expired]] as Array<[string, string, number]>).map(([value, label, count]) => <button key={value} type="button" onClick={() => setFilterStatus(value)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${filterStatus === value ? "bg-[#1a5dc6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label} <span className="ml-1 opacity-70">{count}</span></button>)}
					<span className="ml-auto text-xs text-muted-foreground">{filteredDiscounts.length} promosi ditemukan</span>
				</div>
					<div className="relative flex-1">
						<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							className="w-full rounded-lg border bg-background py-2 pr-4 pl-10 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Cari diskon atau kode voucher..."
							type="text"
							value={searchQuery}
						/>
					</div>

					<div className="flex flex-wrap gap-2">
						<div className="flex items-center gap-2">
							<span className="text-[11px] font-semibold text-slate-500">Filter</span>
							<select
								className="rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
								onChange={(e) => setFilterStatus(e.target.value)}
								value={filterStatus}
							>
								<option value="all">Semua Status</option>
								<option value="aktif">Aktif</option>
								<option value="terjadwal">Terjadwal</option>
								<option value="kedaluwarsa">Kedaluwarsa</option>
								<option value="non-aktif">Non-Aktif</option>
							</select>
						</div>

						<select
							className="rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
							onChange={(e) => setFilterType(e.target.value)}
							value={filterType}
						>
							<option value="all">Semua Tipe</option>
							<option value="percentage">Persentase</option>
							<option value="fixed">Potongan</option>
							<option value="flat_price">Harga Flat</option>
						</select>

						{(searchQuery ||
							filterStatus !== "all" ||
							filterType !== "all") && (
							<button
								className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm transition-colors hover:bg-muted/80"
								onClick={() => {
									setSearchQuery("");
									setFilterStatus("all");
									setFilterType("all");
								}}
								type="button"
							>
								<X className="h-3 w-3" />
								Reset
							</button>
						)}
						<div className="ml-auto flex rounded-lg border bg-background p-0.5" aria-label="Tampilan daftar promosi">
							<button type="button" aria-label="Tampilan tabel" onClick={() => setViewMode("table")} className={`rounded-md p-1.5 ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><List className="h-4 w-4" /></button>
							<button type="button" aria-label="Tampilan kartu" onClick={() => setViewMode("card")} className={`rounded-md p-1.5 ${viewMode === "card" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><LayoutGrid className="h-4 w-4" /></button>
						</div>
					</div>
				</div>
			</div>

			{/* Discounts Grid */}
			{viewMode === "table" ? <div className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.04)]"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="border-b bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Promosi</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Nilai</th><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Cakupan</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{!discounts ? <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Memuat promosi…</td></tr> : filteredDiscounts.map((d: any) => { const status = getPromoStatus(d); const StatusIcon = status.icon; return <tr key={d._id} className="transition hover:bg-slate-50/80"><td className="px-4 py-3"><div className="font-semibold text-slate-900">{d.name}</div><div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">{d.code ? <code>{d.code}</code> : <span>Tanpa kode voucher</span>}{d.isHappyHour && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">Happy Hour</span>}</div></td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${status.class}`}><StatusIcon className="h-3 w-3" />{status.label}</span></td><td className="px-4 py-3 font-semibold text-[#1a5dc6]">{d.type === "PERCENTAGE" ? `${d.value}% OFF` : `Rp ${new Intl.NumberFormat("id-ID").format(Number(d.value))}`}</td><td className="px-4 py-3 text-xs text-slate-600">{d.startDate ? new Date(d.startDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"}<br />{d.endDate ? new Date(d.endDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"}{d.startTime && d.endTime ? <span className="text-slate-400"> · {d.startTime}–{d.endTime} WIB</span> : null}</td><td className="px-4 py-3 text-xs text-slate-600">{d.targetType === "ALL" ? "Semua produk" : `${d.targetType === "CATEGORY" ? "Kategori" : "Produk"} · ${(d as { targetIds?: string[]; targetId?: string }).targetIds?.length || (d.targetId ? 1 : 0)} item`}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" aria-label={`Edit ${d.name}`} onClick={() => openEdit(d)} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-[#1a5dc6]"><Edit className="h-4 w-4" /></button><button type="button" aria-label={`Salin kode ${d.name}`} onClick={() => d.code && copyDiscountCode(d.code)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Copy className="h-4 w-4" /></button><button type="button" aria-label={`Hapus ${d.name}`} onClick={() => handleDelete(d._id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><MoreHorizontal className="h-4 w-4" /></button></div></td></tr>; })}{discounts && filteredDiscounts.length === 0 && <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-500">Tidak ada promosi yang cocok dengan filter.</td></tr>}</tbody></table></div></div> : (<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{!discounts ? (
					Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
							<div className="flex justify-between">
								<div className="space-y-2 flex-1">
									<Skeleton className="h-6 w-3/4" />
									<Skeleton className="h-4 w-1/2" />
								</div>
								<div className="flex gap-2">
									<Skeleton className="h-8 w-8 rounded-lg" />
									<Skeleton className="h-8 w-8 rounded-lg" />
								</div>
							</div>
							<Skeleton className="h-6 w-24 rounded-full" />
							<Skeleton className="h-20 w-full rounded-lg" />
							<div className="space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-2/3" />
							</div>
						</div>
					))
				) : (
					<>
						<AnimatePresence mode="popLayout">
							{(filteredDiscounts || []).map((d: any, index: number) => {
								const status = getPromoStatus(d);
								const StatusIcon = status.icon;

								return (
									<motion.div
										animate={{ opacity: 1, scale: 1 }}
										className="group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-lg"
										exit={{ opacity: 0, scale: 0.9 }}
										initial={{ opacity: 0, scale: 0.9 }}
										key={d._id}
										layout
										transition={{ delay: index * 0.05 }}
									>
								{/* Gradient Overlay */}
								<div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

								<div className="relative p-5">
									{/* Header */}
									<div className="mb-4 flex items-start justify-between gap-3">
										<div className="flex-1 space-y-2">
											<h3 className="font-bold text-foreground text-lg leading-tight">
												{d.name}
											</h3>
											{d.code && (
												<div className="flex items-center gap-2">
													<code className="rounded bg-muted px-2 py-1 font-mono text-xs">
														{d.code}
													</code>
													<button
														className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
														onClick={() => copyDiscountCode(d.code || "")}
														type="button"
													>
														<Copy className="h-3 w-3" />
													</button>
												</div>
											)}
										</div>

										{/* Action Buttons */}
										<div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
											<button
												className="rounded-lg bg-primary/10 p-2 text-primary transition-all hover:bg-primary hover:text-primary-foreground"
												onClick={() => openEdit(d)}
												type="button"
											>
												<Edit className="h-4 w-4" />
											</button>
											<button
												className="rounded-lg bg-red-100 p-2 text-red-600 transition-all hover:bg-red-600 hover:text-white dark:bg-red-900 dark:text-red-300"
												onClick={() => handleDelete(d._id)}
												type="button"
											>
												<Trash2 className="h-4 w-4" />
											</button>
										</div>
									</div>

									{/* Status Badge */}
									<div className="mb-4 flex flex-wrap gap-2">
										<span
											className={`inline-flex max-w-[48%] items-center gap-1 overflow-hidden rounded-full px-2 py-0.5 font-semibold text-[10px] whitespace-nowrap ${status.class}`}
										>
											<StatusIcon className="h-3 w-3" />
											{status.label}
										</span>
										{d.isHappyHour && (
											<span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-700 text-xs dark:bg-purple-900 dark:text-purple-300">
												<Clock className="h-3 w-3" />
												Happy Hour
											</span>
										)}
										{d.isFreeRefill && (
											<span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
												<Sparkles className="h-3 w-3" />
												Free Refill
											</span>
										)}
									</div>

									{/* Discount Value */}
									<div className="mb-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 p-4">
										<div className="flex items-baseline gap-2">
											<span className="font-bold text-xl text-primary">
												{(() => {
													if (d.type === "PERCENTAGE") {
														return `${d.value}%`;
													}
													if (d.type === "FIXED") {
														return `Rp ${new Intl.NumberFormat("id-ID").format(Number(d.value))}`;
													}
													return `Rp ${new Intl.NumberFormat("id-ID").format(Number(d.value))}`;
												})()}
											</span>
											<span className="font-semibold text-muted-foreground text-xs uppercase">
												{(() => {
													if (d.type === "PERCENTAGE") {
														return "OFF";
													}
													if (d.type === "FIXED") {
														return "Potongan";
													}
													return "Harga Flat";
												})()}
											</span>
										</div>
									</div>

									{/* Details */}
									<div className="space-y-3">
										{/* Target */}
										<div className="flex items-center gap-2 text-sm">
											<Tag className="h-4 w-4 text-muted-foreground" />
											<span className="font-medium text-muted-foreground">
												Target:
											</span>
											<span className="font-semibold">
												{d.targetType === "ALL"
													? "Semua Produk"
													: `${d.targetType === "CATEGORY" ? "Kategori" : "Produk"} (${(d as { targetIds?: string[]; targetId?: string }).targetIds?.length || (d.targetId ? 1 : 0)})`}
											</span>
										</div>

										{/* Schedule Info */}
										{(d.startDate || d.endDate) && (
											<div className="flex items-center gap-2 text-sm">
												<Calendar className="h-4 w-4 text-muted-foreground" />
												<span className="font-medium text-muted-foreground">
													Periode:
												</span>
												<span className="font-semibold text-xs">
													{d.startDate
														? new Date(d.startDate).toLocaleDateString(
																"id-ID",
																{
																	day: "numeric",
																	month: "short",
																}
															)
														: "—"}
													{" - "}
													{d.endDate
														? new Date(d.endDate).toLocaleDateString("id-ID", {
																day: "numeric",
																month: "short",
															})
														: "—"}
												</span>
											</div>
										)}

										{/* Time Info */}
										{d.startTime && d.endTime && (
											<div className="flex items-center gap-2 text-sm">
												<Clock className="h-4 w-4 text-muted-foreground" />
												<span className="font-medium text-muted-foreground">
													Waktu:
												</span>
												<span className="font-semibold text-xs">
													{d.startTime} - {d.endTime}
												</span>
											</div>
										)}

										{/* Days */}
										{d.days && d.days.length > 0 && (
											<div className="flex flex-wrap gap-1">
												{d.days.map((dayId: number) => (
													<span
														className="rounded bg-muted px-2 py-0.5 font-semibold text-[10px] uppercase"
														key={dayId}
													>
														{daysOfWeek[dayId].label}
													</span>
												))}
											</div>
										)}
									</div>
								</div>
							</motion.div>
								);
							})}
						</AnimatePresence>

						{/* Empty State */}
						{filteredDiscounts?.length === 0 && (
							<motion.div
								animate={{ opacity: 1 }}
								className="col-span-full py-20 text-center"
								initial={{ opacity: 0 }}
							>
								<div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
									<Tag className="h-10 w-10 text-muted-foreground" />
								</div>
								<h3 className="mb-2 font-bold text-lg">
									{searchQuery || filterStatus !== "all" || filterType !== "all"
										? "Tidak ada diskon yang cocok"
										: "Belum ada diskon"}
								</h3>
								<p className="mb-6 text-muted-foreground text-sm">
									{searchQuery || filterStatus !== "all" || filterType !== "all"
										? "Coba ubah filter atau kata kunci pencarian"
										: "Mulai buat diskon pertama Anda untuk meningkatkan penjualan"}
								</p>
								{!searchQuery && filterStatus === "all" && filterType === "all" && (
									<button
										className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg transition-all hover:scale-105"
										onClick={() => {
											resetForm();
											setIsModalOpen(true);
										}}
										type="button"
									>
										<Plus className="h-4 w-4" />
										Buat Diskon Pertama
									</button>
								)}
							</motion.div>
						)}
					</>
				)}
			</div>)}

			{/* Modal Form */}
			<AnimatePresence>
				{isModalOpen && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
						data-admin-modal-backdrop
					>
						<motion.div
							animate={{ opacity: 1, scale: 1, y: 0 }}
							className="relative my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
							data-admin-modal-card
							exit={{ opacity: 0, scale: 0.95, y: 20 }}
							initial={{ opacity: 0, scale: 0.95, y: 20 }}
						>
							{/* Modal Header */}
							<div className="border-b bg-gradient-to-r from-primary/5 to-primary/10 p-4">
								<div className="flex items-center justify-between">
									<div>
										<h3 className="font-bold text-xl">
											{formData.id ? "Edit Diskon" : "Buat Diskon Baru"}
										</h3>
										<p className="mt-1 text-muted-foreground text-sm">
											Konfigurasi detail promosi dan penawaran
										</p>
									</div>
									<button
										className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={() => setIsModalOpen(false)}
										type="button"
									>
										<X className="h-5 w-5" />
									</button>
								</div>
							</div>

							{/* Modal Body */}
							<form
								className="scrollbar-thin max-h-[70vh] space-y-6 overflow-y-auto p-4"
								onSubmit={handleSubmit}
							>
								{/* Basic Information */}
								<div className="space-y-4">
									<h4 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
										<Tag className="h-4 w-4" />
										Informasi Dasar
									</h4>

									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<label
												className="font-medium text-sm"
												htmlFor="campaign-name"
											>
												Nama Kampanye
												<span className="text-red-500">*</span>
											</label>
											<input
												className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
												id="campaign-name"
												onChange={(e) =>
													setFormData({ ...formData, name: e.target.value })
												}
												placeholder="Promo Akhir Tahun"
												required
												type="text"
												value={formData.name}
											/>
										</div>

										<div className="space-y-2">
											<label
												className="font-medium text-sm"
												htmlFor="promo-code"
											>
												Kode Voucher (Opsional)
											</label>
											<input
												className="w-full rounded-lg border bg-background px-4 py-2.5 font-mono text-sm uppercase outline-none transition-all focus:ring-2 focus:ring-primary"
												id="promo-code"
												onChange={(e) =>
													setFormData({ ...formData, code: e.target.value })
												}
												placeholder="PROMO2024"
												type="text"
												value={formData.code}
											/>
										</div>
									</div>

									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<label
												className="font-medium text-sm"
												htmlFor="value-type"
											>
												Tipe Diskon
												<span className="text-red-500">*</span>
											</label>
											<select
												className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
												id="value-type"
												onChange={(e) =>
													setFormData({
														...formData,
														type: e.target.value as
															| "FIXED"
															| "PERCENTAGE"
															| "FLAT_PRICE",
													})
												}
												value={formData.type}
											>
												<option value="PERCENTAGE">Persentase (%)</option>
												<option value="FIXED">Potongan Harga (Rp)</option>
												<option value="FLAT_PRICE">Harga Flat (Rp)</option>
											</select>
										</div>

										<div className="space-y-2">
											<label
												className="font-medium text-sm"
												htmlFor="promo-value"
											>
												Nilai Diskon
												<span className="text-red-500">*</span>
											</label>
											<div className="relative">
												<input
													className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
													id="promo-value"
													min="0"
													onChange={(e) =>
														setFormData({ ...formData, value: e.target.value })
													}
													placeholder="0"
													required
													step={formData.type === "PERCENTAGE" ? "1" : "1000"}
													type="number"
													value={formData.value}
												/>
												<span className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground text-sm">
													{formData.type === "PERCENTAGE" ? "%" : "Rp"}
												</span>
											</div>
										</div>
									</div>
								</div>

								{/* Happy Hour Settings */}
								<div className="space-y-4 rounded-xl border border-purple-200 bg-purple-50/30 p-4 dark:border-purple-800 dark:bg-purple-900/10">
									<div className="flex items-center justify-between">
										<h4 className="flex items-center gap-2 font-semibold text-purple-900 text-sm uppercase tracking-wide dark:text-purple-100">
											<Clock className="h-4 w-4" />
											Pengaturan Happy Hour
										</h4>
										<label className="relative inline-flex cursor-pointer items-center">
											<input
												checked={formData.isHappyHour}
												className="peer sr-only"
												onChange={(e) =>
													setFormData({
														...formData,
														isHappyHour: e.target.checked,
														type: e.target.checked ? "FLAT_PRICE" : formData.type,
													})
												}
												type="checkbox"
											/>
											<div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:bg-gray-700 dark:peer-focus:ring-purple-800" />
											<span className="ml-3 font-medium text-purple-900 text-sm dark:text-purple-100">
												Aktifkan Happy Hour
											</span>
										</label>
									</div>

									{formData.isHappyHour && (
										<div className="space-y-4 pt-2">
											<p className="text-muted-foreground text-xs italic">
												Happy Hour akan memaksa tipe diskon menjadi "Harga
												Flat". Anda dapat mengatur harga flat untuk setiap
												produk di bawah ini.
											</p>

											<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
												<div className="space-y-2">
													<label className="font-medium text-sm">
														Harga Flat Global (Opsional)
													</label>
													<div className="flex gap-2">
														<div className="relative flex-1">
															<input
																className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
																onChange={(e) =>
																	setFormData({
																		...formData,
																		value: e.target.value,
																	})
																}
																placeholder="Set harga untuk semua..."
																type="number"
																value={formData.value}
															/>
															<span className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground text-sm">
																Rp
															</span>
														</div>
														<button
															className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white text-sm hover:bg-purple-700 active:scale-95"
															onClick={() => {
																if (!formData.value) return;
																const price = Number(formData.value);
																const newProductPrices = formData.targetIds.map(
																	(id) => ({ productId: id, price })
																);
																setFormData({
																	...formData,
																	productPrices: newProductPrices,
																});
																toast.success("Harga diterapkan ke semua target"); triggerHybridRefresh(); triggerHybridRefresh();
															}}
															type="button"
														>
															Terapkan
														</button>
													</div>
												</div>
											</div>

											{formData.targetType === "PRODUCT" &&
												formData.targetIds.length > 0 && (
													<div className="rounded-lg border bg-background p-3 space-y-3">
														<p className="font-semibold text-xs">
															Detail Harga per Produk:
														</p>
														<div className="max-h-60 overflow-y-auto space-y-2 pr-2">
															{formData.targetIds.map((id) => {
																const product = products?.find(
																	(p: any) => p._id === id
																);
																const currentPrice =
																	formData.productPrices.find(
																		(pp) => pp.productId === id
																	)?.price || "";

																return (
																	<div
																		className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-2"
																		key={id}
																	>
																		<div className="flex-1 truncate">
																			<p className="truncate font-medium text-sm">
																				{product?.name || "Produk tidak dikenal"}
																			</p>
																			<p className="text-muted-foreground text-xs">
																				Harga Normal: Rp{" "}
																				{product?.price.toLocaleString()}
																			</p>
																		</div>
																		<div className="relative w-32">
																			<input
																				className="w-full rounded-md border bg-background px-2 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-purple-500"
																				onChange={(e) => {
																					const price = Number(e.target.value);
																					setFormData((prev) => {
																						const filtered =
																							prev.productPrices.filter(
																								(pp) => pp.productId !== id
																							);
																						return {
																							...prev,
																							productPrices: [
																								...filtered,
																								{ productId: id, price },
																							],
																						};
																					});
																				}}
																				placeholder="0"
																				type="number"
																				value={currentPrice}
																			/>
																		</div>
																	</div>
																);
															})}
														</div>
													</div>
												)}
										</div>
									)}
								</div>

								{/* Free Refill Settings */}
								<div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4 dark:border-blue-800 dark:bg-blue-900/10">
									<div className="flex items-center justify-between">
										<h4 className="flex items-center gap-2 font-semibold text-blue-900 text-sm uppercase tracking-wide dark:text-blue-100">
											<Sparkles className="h-4 w-4" />
											Promo Free Refill
										</h4>
										<label className="relative inline-flex cursor-pointer items-center">
											<input
												checked={formData.isFreeRefill}
												className="peer sr-only"
												onChange={(e) =>
													setFormData({
														...formData,
														isFreeRefill: e.target.checked,
													})
												}
												type="checkbox"
											/>
											<div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:bg-gray-700 dark:peer-focus:ring-blue-800" />
											<span className="ml-3 font-medium text-blue-900 text-sm dark:text-blue-100">
												Aktifkan Free Refill
											</span>
										</label>
									</div>

									{formData.isFreeRefill && (
										<div className="space-y-4 pt-2">
											<p className="text-muted-foreground text-xs italic">
												Jika aktif, sistem akan secara otomatis menambahkan
												item "Free Refill" ke keranjang saat checkout.
											</p>

											<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
												<div className="space-y-2">
													<label className="font-medium text-sm">
														Harga Add-on Refill
													</label>
													<div className="relative">
														<input
															className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
															onChange={(e) =>
																setFormData({
																	...formData,
																	refillPrice: e.target.value,
																})
															}
															placeholder="20000"
															type="number"
															value={formData.refillPrice}
														/>
														<span className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground text-sm">
															Rp
														</span>
													</div>
												</div>

												<div className="space-y-2">
													<label className="font-medium text-sm">
														Ketersediaan Promo
													</label>
													<select
														className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
														onChange={(e) =>
															setFormData({
																...formData,
																refillAvailability: e.target.value as
																	| "ALWAYS"
																	| "HAPPY_HOUR",
															})
														}
														value={formData.refillAvailability}
													>
														<option value="ALWAYS">Tersedia 24 Jam</option>
														<option value="HAPPY_HOUR">
															Hanya Saat Happy Hour
														</option>
													</select>
												</div>
											</div>
										</div>
									)}
								</div>

								{/* Target Selection */}
								<div className="space-y-4 rounded-xl border bg-muted/30 p-4">
									<h4 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
										<Filter className="h-4 w-4" />
										Target Produk
									</h4>

									<div className="flex items-center justify-between">
										<label
											className="font-medium text-sm"
											htmlFor="target-scope"
										>
											Berlaku untuk
										</label>
										<select
											className="rounded-lg border bg-background px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
											id="target-scope"
											onChange={(e) =>
												setFormData({
													...formData,
													targetType: e.target.value as
														| "ALL"
														| "CATEGORY"
														| "PRODUCT",
													targetIds: [],
												})
											}
											value={formData.targetType}
										>
											<option value="ALL">Semua Produk</option>
											<option value="CATEGORY">Kategori Tertentu</option>
											<option value="PRODUCT">Produk Tertentu</option>
										</select>
									</div>

									{formData.targetType !== "ALL" && (
										<div className="space-y-3">
											<div className="flex gap-2">
												<div className="relative flex-1">
													<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
													<input
														className="w-full rounded-lg border bg-background py-2 pr-4 pl-10 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
														onChange={(e) => setSearchTarget(e.target.value)}
														placeholder={`Cari ${formData.targetType === "CATEGORY" ? "kategori" : "produk"}...`}
														type="text"
														value={searchTarget}
													/>
												</div>
												<button
													className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm transition-all hover:brightness-110"
													onClick={() => {
														const selectableItems = (
															formData.targetType === "CATEGORY"
																? categories ?? []
																: products ?? []
														) as Array<{ _id: string; name: string }>;
														const filteredIds = selectableItems
															.filter((item: any) =>
																item.name
																	.toLowerCase()
																	.includes(searchTarget.toLowerCase())
															)
															.map((item: any) => item._id);
														toggleAllTargets(filteredIds);
													}}
													type="button"
												>
													Pilih Semua
												</button>
											</div>

											<div className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-background p-2">
												{((formData.targetType === "CATEGORY"
													? categories ?? []
													: products ?? []) as Array<{
													_id: string;
													name: string;
												}>)
													?.filter((item: any) =>
														item.name
															.toLowerCase()
															.includes(searchTarget.toLowerCase())
													)
													.map((item: any) => (
														<button
															className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm transition-all ${
																formData.targetIds.includes(item._id)
																	? "bg-primary text-primary-foreground shadow-sm"
																	: "hover:bg-muted"
															}`}
															key={item._id}
															onClick={() => toggleTarget(item._id)}
															type="button"
														>
															<span className="font-medium">{item.name}</span>
															{formData.targetIds.includes(item._id) && (
																<Check className="h-4 w-4" />
															)}
														</button>
													))}
											</div>

											<p className="text-muted-foreground text-xs">
												{formData.targetIds.length} item dipilih
											</p>
										</div>
									)}
								</div>

								{/* Schedule Settings */}
								<div className="space-y-4">
									<h4 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
										<Calendar className="h-4 w-4" />
										Jadwal & Waktu
									</h4>

									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
										{/* Date Range */}
										<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
											<div className="block font-medium text-sm">
												Periode Tanggal
											</div>
											<div className="space-y-2">
												<input
													className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
													id="start-date"
													onChange={(e) =>
														setFormData({
															...formData,
															startDate: e.target.value,
														})
													}
													type="date"
													value={formData.startDate}
												/>
												<div className="text-center text-muted-foreground text-xs">
													sampai
												</div>
												<input
													className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
													id="end-date"
													onChange={(e) =>
														setFormData({
															...formData,
															endDate: e.target.value,
														})
													}
													type="date"
													value={formData.endDate}
												/>
											</div>
										</div>

										{/* Time Range */}
										<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
											<div className="block font-medium text-sm">
												Jam Operasional
											</div>
											<div className="space-y-2">
												<input
													className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
													id="start-time"
													onChange={(e) =>
														setFormData({
															...formData,
															startTime: e.target.value,
														})
													}
													type="time"
													value={formData.startTime}
												/>
												<div className="text-center text-muted-foreground text-xs">
													sampai
												</div>
												<input
													className="w-full rounded-lg border bg-background px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary"
													id="end-time"
													onChange={(e) =>
														setFormData({
															...formData,
															endTime: e.target.value,
														})
													}
													type="time"
													value={formData.endTime}
												/>
											</div>
										</div>
									</div>
								</div>

								{/* Days Selection */}
								<div className="space-y-4 rounded-xl border bg-muted/30 p-4">
									<div className="flex items-center justify-between">
										<div className="font-medium text-sm">Hari Berlaku</div>
										<button
											className="text-primary text-xs hover:underline"
											onClick={() => {
												if (formData.days.length === 7) {
													setFormData({ ...formData, days: [] });
												} else {
													setFormData({
														...formData,
														days: [0, 1, 2, 3, 4, 5, 6],
													});
												}
											}}
											type="button"
										>
											{formData.days.length === 7
												? "Hapus Semua"
												: "Pilih Semua"}
										</button>
									</div>

									<div className="flex flex-wrap gap-2">
										{daysOfWeek.map((day) => (
											<button
												className={`min-w-[80px] flex-1 rounded-lg px-4 py-2.5 font-semibold text-sm transition-all ${
													formData.days.includes(day.id)
														? "bg-primary text-primary-foreground shadow-md"
														: "border bg-background hover:bg-muted"
												}`}
												key={day.id}
												onClick={() => toggleDay(day.id)}
												type="button"
											>
												{day.label}
											</button>
										))}
									</div>
								</div>

								{/* Active Status Toggle */}
								<div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
									<div>
										<label
											className="font-medium text-sm"
											htmlFor="is-active-switch"
										>
											Status Aktif
										</label>
										<p className="text-muted-foreground text-xs">
											Aktifkan diskon ini sekarang
										</p>
									</div>
									<button
										aria-checked={formData.isActive}
										className={`relative h-8 w-14 rounded-full transition-colors ${formData.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
										id="is-active-switch"
										onClick={() =>
											setFormData({ ...formData, isActive: !formData.isActive })
										}
										role="switch"
										type="button"
									>
										<div
											className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${formData.isActive ? "translate-x-6" : ""}`}
										/>
									</button>
								</div>
							</form>

							{/* Modal Footer */}
							<div className="flex gap-3 border-t bg-muted/30 p-4">
								<button
									className="flex-1 rounded-lg border bg-background px-6 py-3 font-semibold text-sm transition-all hover:bg-muted"
									onClick={() => setIsModalOpen(false)}
									type="button"
								>
									Batal
								</button>
								<button
									className="flex-[2] rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground text-sm shadow-lg transition-all hover:brightness-110 active:scale-[0.98]"
									onClick={() => handleSubmit()}
									type="submit"
								>
									{formData.id ? "Perbarui Diskon" : "Buat Diskon"}
								</button>
							</div>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
		</div>
	);
}



