import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Users, Wallet, CheckCircle, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DateRange } from "./period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";

interface Props {
	range: DateRange;
}

export function ShiftReport({ range }: Props) {
	const shifts = useQuery(api.finance.getHistoricalShifts, {
		startDate: range.startDate,
		endDate: range.endDate,
	});

	// Get transactions to calculate shift expenses
	const transactions = useQuery(api.finance.getTransactionDetailReport, {
		startDate: range.startDate,
		endDate: range.endDate,
	});

	// Get orders to calculate shift revenue
	const orders = useQuery(api.orders.getOrders, {});
	const categoriesList = useQuery(api.products.getCategories);

	if (!shifts || !transactions || orders === undefined || categoriesList === undefined) {
		return (
			<div className="space-y-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-32 w-full rounded-xl" />
				))}
			</div>
		);
	}

	if (shifts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
				<Users className="h-10 w-10 mb-3 opacity-30" />
				<p>Tidak ada data shift pada periode ini</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{shifts.map((shift: any) => {
				const isCurrentActive = !shift.endTime;
				const statusLabel = isCurrentActive ? "AKTIF" : "SELESAI";
				const sEnd = shift.endTime || Date.now();
				
				// Calculate Shift Expenses
				let shiftExpense = 0;
				transactions.transactions?.forEach((t: any) => {
					if (t.type === "expense" && t.status === "completed" && t.date >= shift.startTime && t.date <= sEnd) {
						shiftExpense += t.amount;
					}
				});

				// Calculate Shift Revenue & Items
				let shiftRevenue = 0;
				let shiftDiscount = 0;
				let shiftCash = 0;
				let shiftQris = 0;
				let shiftItems = 0;
				const itemsByCategory: Record<string, number> = {};
				const itemsByName: Record<string, number> = {};

				orders.forEach((o: any) => {
					if ((o.status === "completed" || o.status === "paid") && o.createdAt >= shift.startTime && o.createdAt <= sEnd) {
						shiftRevenue += o.totalAmount;
						shiftDiscount += (o.discountAmount || 0);
						if (o.paymentMethod === 'cash') shiftCash += o.totalAmount;
						if (o.paymentMethod === 'qris' || o.paymentMethod === 'transfer') shiftQris += o.totalAmount;

						o.items.forEach((item: any) => {
							shiftItems += item.quantity;
							const cat = categoriesList?.find((c: any) => c._id === item.categoryId)?.name || 'Lainnya';
							itemsByCategory[cat] = (itemsByCategory[cat] || 0) + item.quantity;
							itemsByName[item.productName || 'Unknown'] = (itemsByName[item.productName || 'Unknown'] || 0) + item.quantity;
						});
					}
				});

				const topProducts = Object.entries(itemsByName)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 3);

				return (
					<div key={shift.id} className={`rounded-xl border p-5 ${isCurrentActive ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-card'}`}>
						<div className="flex justify-between items-start mb-4 pb-4 border-b border-border/50">
							<div>
								<div className="flex items-center gap-2 mb-1">
									<h3 className="font-bold text-lg">{shift.shiftName || "Shift"}</h3>
									<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCurrentActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
										{statusLabel}
									</span>
								</div>
								<div className="text-sm text-muted-foreground">
									<p>Kasir: <span className="font-medium text-foreground">{shift.cashierName || "Unknown"}</span></p>
									<p>Mulai: {new Date(shift.startTime).toLocaleString("id-ID")}</p>
									{shift.endTime && <p>Selesai: {new Date(shift.endTime).toLocaleString("id-ID")}</p>}
								</div>
							</div>
							<div className="text-right">
								<p className="text-xs text-muted-foreground mb-1">Produk Terjual</p>
								<p className="font-bold text-xl">{shiftItems} <span className="text-sm font-normal text-muted-foreground">item</span></p>
							</div>
						</div>
						
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-border/50">
							<div>
								<p className="text-xs text-muted-foreground mb-1">Modal Awal</p>
								<p className="font-semibold">{formatCurrencyIDR(shift.modalAwal || 0)}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-1">Total Penjualan (Net)</p>
								<p className="font-semibold text-green-600">+{formatCurrencyIDR(shiftRevenue)}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-1">Potongan Diskon</p>
								<p className="font-semibold text-orange-600">-{formatCurrencyIDR(shiftDiscount)}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-1">Total Pengeluaran</p>
								<p className="font-semibold text-red-600">-{formatCurrencyIDR(shiftExpense)}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-1">Setoran Akhir (Fisik Laci)</p>
								<p className="font-semibold text-primary">{shift.setoranAkhir !== undefined ? formatCurrencyIDR(shift.setoranAkhir) : "-"}</p>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div>
								<h4 className="font-semibold text-sm mb-2">Metode Pembayaran</h4>
								<div className="space-y-1 text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Cash/Kasir:</span>
										<span className="font-medium">{formatCurrencyIDR(shiftCash)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Debit/QRIS:</span>
										<span className="font-medium">{formatCurrencyIDR(shiftQris)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Delivery Online:</span>
										<span className="font-medium">Rp 0</span>
									</div>
								</div>
							</div>
							<div>
								<h4 className="font-semibold text-sm mb-2">Rincian Produk Terjual</h4>
								{Object.keys(itemsByCategory).length > 0 ? (
									<div className="space-y-1 text-sm">
										{Object.entries(itemsByCategory).map(([cat, qty]) => (
											<div key={cat} className="flex justify-between">
												<span className="text-muted-foreground">{cat}:</span>
												<span className="font-medium">{qty} item</span>
											</div>
										))}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">-</p>
								)}
								
								<h4 className="font-semibold text-sm mb-2 mt-4 text-amber-600 flex items-center gap-1"><Star className="h-4 w-4" /> Top 3 Produk (Shift Ini)</h4>
								{topProducts.length > 0 ? (
									<div className="space-y-1 text-sm">
										{topProducts.map(([name, qty]) => (
											<div key={name} className="flex justify-between">
												<span className="text-muted-foreground">{name}:</span>
												<span className="font-medium">{qty} item</span>
											</div>
										))}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">-</p>
								)}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}