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
		<div className="space-y-3">
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
					<div key={shift.id} className={`rounded-lg border p-3 ${isCurrentActive ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-card'}`}>
						{/* Header - Compact */}
						<div className="flex items-center justify-between mb-2 pb-2 border-b border-border/50">
							<div className="flex items-center gap-2 flex-1 min-w-0">
								<div className="flex items-center gap-1.5 min-w-0 flex-1">
									<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${isCurrentActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
										{statusLabel}
									</span>
									<h3 className="font-bold text-sm truncate">{shift.shiftName || "Shift"}</h3>
								</div>
								<span className="text-xs text-muted-foreground whitespace-nowrap">{shiftItems} item</span>
							</div>
						</div>

						{/* Subheader - Time & Cashier */}
						<div className="flex items-center justify-between mb-2 text-[10px] text-muted-foreground">
							<div className="flex items-center gap-1">
								<span className="font-medium">{shift.cashierName || "Unknown"}</span>
								<span className="w-px h-3 bg-border/30" />
								<span>{new Date(shift.startTime).toLocaleDateString("id-ID", { day: 'numeric', month: 'short' })}</span>
							</div>
							<div className="text-[10px]">
								{new Date(shift.startTime).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })}
								{shift.endTime && ` - ${new Date(shift.endTime).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })}`}
							</div>
						</div>

						{/* Stats Grid - More compact */}
						<div className="grid grid-cols-3 gap-2 mb-2">
							<div className="bg-muted/30 rounded-lg p-1.5 text-center">
								<p className="text-[8px] font-bold text-muted-foreground/70 uppercase mb-0.5">Modal</p>
								<p className="text-xs font-semibold">{formatCurrencyIDR(shift.modalAwal || 0, true)}</p>
							</div>
							<div className="bg-emerald-50/50 rounded-lg p-1.5 text-center border border-emerald-100/50">
								<p className="text-[8px] font-bold text-emerald-700/70 uppercase mb-0.5">Net Sales</p>
								<p className="text-xs font-bold text-emerald-700">{formatCurrencyIDR(shiftRevenue, true)}</p>
							</div>
							<div className="bg-red-50/50 rounded-lg p-1.5 text-center border border-red-100/50">
								<p className="text-[8px] font-bold text-red-700/70 uppercase mb-0.5">Expense</p>
								<p className="text-xs font-bold text-red-700">{formatCurrencyIDR(shiftExpense, true)}</p>
							</div>
						</div>

						{/* Secondary Stats */}
						<div className="grid grid-cols-2 gap-2 mb-2">
							<div className="flex justify-between items-center px-2 py-1 bg-muted/20 rounded">
								<span className="text-[10px] text-muted-foreground">Diskon:</span>
								<span className="text-[10px] font-semibold text-orange-600">-{formatCurrencyIDR(shiftDiscount, true)}</span>
							</div>
							<div className="flex justify-between items-center px-2 py-1 bg-muted/20 rounded">
								<span className="text-[10px] text-muted-foreground">Setoran:</span>
								<span className="text-[10px] font-semibold text-primary">{shift.setoranAkhir !== undefined ? formatCurrencyIDR(shift.setoranAkhir, true) : "-"}</span>
							</div>
						</div>

						{/* Payment Methods & Top Products - Side by side */}
						<div className="grid grid-cols-2 gap-2">
							<div>
								<h4 className="text-[9px] font-bold uppercase text-muted-foreground/70 mb-1">Pembayaran</h4>
								<div className="space-y-0.5">
									<div className="flex justify-between text-[10px]">
										<span className="text-muted-foreground">Cash:</span>
										<span className="font-semibold">{formatCurrencyIDR(shiftCash, true)}</span>
									</div>
									<div className="flex justify-between text-[10px]">
										<span className="text-muted-foreground">QRIS:</span>
										<span className="font-semibold">{formatCurrencyIDR(shiftQris, true)}</span>
									</div>
								</div>
							</div>
							<div>
								<h4 className="text-[9px] font-bold uppercase text-amber-600/80 mb-1 flex items-center gap-0.5"><Star className="h-3 w-3" /> Top 3</h4>
								<div className="space-y-0.5">
									{topProducts.length > 0 ? topProducts.map(([name, qty]) => (
										<div key={name} className="flex justify-between text-[10px]">
											<span className="text-muted-foreground truncate max-w-[80px]">{name}</span>
											<span className="font-medium text-foreground">{qty}</span>
										</div>
									)) : (
										<p className="text-[10px] text-muted-foreground">-</p>
									)}
								</div>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}