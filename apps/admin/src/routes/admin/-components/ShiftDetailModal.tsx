import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { Clock, Receipt, ShoppingBag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridShiftDetails } from "@/hooks/use-hybrid-pos-data";

interface ShiftDetailModalProps {
	shift: any;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ShiftDetailModal({ shift, isOpen, onOpenChange }: ShiftDetailModalProps) {
	const details = useHybridShiftDetails(
		isOpen && shift ? { startTime: shift.startTime, endTime: shift.endTime } : "skip"
	);

	if (!shift) return null;

	const cashRevenue = details?.cashRevenue ?? shift.cashRevenue ?? 0;
	const qrisRevenue = details?.qrisRevenue ?? shift.qrisRevenue ?? 0;
	const totalRevenue = details?.totalRevenue ?? shift.revenue ?? 0;
	const endingCashExpected = details?.endingCashExpected ?? shift.endingCashExpected ?? 0;
	const endingCashPhysical = details?.endingCashPhysical ?? shift.endingCashPhysical ?? 0;
	const nonCashExpected = details?.nonCashExpected ?? shift.nonCashExpected ?? qrisRevenue;
	const nonCashConfirmed = details?.nonCashConfirmed ?? shift.nonCashConfirmed ?? 0;
	const cashBreakdown = details?.cashBreakdown ?? shift.cashBreakdown;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl bg-background/95 backdrop-blur-xl">
				{/* Header - Compact */}
				<div className="shrink-0 p-4 bg-primary/5 border-b border-primary/10">
					<div className="flex items-center justify-between">
						<div className="flex-1 min-w-0">
							<DialogTitle className="text-lg font-bold tracking-tight text-primary mb-1">
								Ringkasan Sesi
							</DialogTitle>
							<div className="flex items-center gap-2 text-muted-foreground text-[10px]">
								<Clock className="w-3 h-3" />
								<span className="truncate">
									{new Date(shift.startTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
								</span>
								<span className="w-px h-3 bg-muted-foreground/30" />
								<span>
									{new Date(shift.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
									{' - '}
									{shift.endTime
										? new Date(shift.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
										: "Sekarang"
									}
								</span>
							</div>
						</div>
						<div className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${!shift.endTime ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-slate-200 text-slate-600'}`}>
							{!shift.endTime ? 'Berjalan' : 'Selesai'}
						</div>
					</div>
				</div>

				{/* Scrollable Content */}
				<div className="flex-1 overflow-y-auto p-4 space-y-3">
					{/* Stats Grid - 4 columns */}
					<div className="grid grid-cols-4 gap-2">
						<div className="bg-muted/30 rounded-lg p-2 text-center">
							<p className="text-[8px] font-bold text-muted-foreground/70 uppercase mb-1">Total</p>
							<p className="text-xs font-bold text-primary">{formatCurrencyIDR(totalRevenue, true)}</p>
						</div>
						<div className="bg-emerald-50/50 rounded-lg p-2 text-center border border-emerald-100/50">
							<p className="text-[8px] font-bold text-emerald-700/70 uppercase mb-1">Tunai</p>
							<p className="text-xs font-bold text-emerald-700">{formatCurrencyIDR(cashRevenue, true)}</p>
						</div>
						<div className="bg-blue-50/50 rounded-lg p-2 text-center border border-blue-100/50">
							<p className="text-[8px] font-bold text-blue-700/70 uppercase mb-1">QRIS</p>
							<p className="text-xs font-bold text-blue-700">{formatCurrencyIDR(qrisRevenue, true)}</p>
						</div>
						<div className="bg-orange-50/50 rounded-lg p-2 text-center border border-orange-100/50">
							<p className="text-[8px] font-bold text-orange-700/70 uppercase mb-1">Item</p>
							<p className="text-xs font-bold text-orange-700">{details?.orderCount ?? 0}</p>
						</div>
					</div>

					{/* Audit & Reconciliation - Compact */}
					{(details?.shiftDoc?.startingCash !== undefined ||
						shift.endingCashPhysical !== undefined ||
						shift.nonCashConfirmed !== undefined) && (
						<div className="grid grid-cols-2 gap-2">
							<div className="p-3 rounded-lg bg-muted/30 border border-border/50">
								<p className="text-[9px] font-bold text-muted-foreground/70 uppercase mb-2">Selisih Tunai</p>
								<div className="flex justify-between items-end">
									<div>
										<p className="text-[9px] text-muted-foreground">Ekspektasi: {formatCurrencyIDR(endingCashExpected, true)}</p>
										<p className="text-xs font-bold">Fisik: {formatCurrencyIDR(endingCashPhysical, true)}</p>
									</div>
									<div className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(endingCashPhysical - endingCashExpected) >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
										{(endingCashPhysical - endingCashExpected) >= 0 ? '+' : ''}{formatCurrencyIDR(endingCashPhysical - endingCashExpected, true)}
									</div>
								</div>
							</div>
							<div className="p-3 rounded-lg bg-muted/30 border border-border/50">
								<p className="text-[9px] font-bold text-muted-foreground/70 uppercase mb-2">Non-Tunai</p>
								<div className="flex justify-between items-end">
									<div>
										<p className="text-[9px] text-muted-foreground">Sistem: {formatCurrencyIDR(nonCashExpected, true)}</p>
										<p className="text-xs font-bold">Konfirmasi: {formatCurrencyIDR(nonCashConfirmed, true)}</p>
									</div>
									<div className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(nonCashConfirmed - nonCashExpected) >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
										{(nonCashConfirmed - nonCashExpected) >= 0 ? '+' : ''}{formatCurrencyIDR(nonCashConfirmed - nonCashExpected, true)}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Cash Breakdown - Compact */}
					{cashBreakdown && (
						<div>
							<h4 className="text-[9px] font-bold uppercase text-muted-foreground/70 mb-2">Pecahan Uang</h4>
							<div className="grid grid-cols-5 gap-1">
								{Object.entries(cashBreakdown).map(([val, count]: [string, any]) => (
									count > 0 && (
										<div key={val} className="p-1.5 rounded-lg bg-muted/20 border border-border/40 text-center">
											<p className="text-[8px] font-bold text-muted-foreground uppercase">
												{Number(val.replace('bill', '')) >= 1000 ? `${Number(val.replace('bill', ''))/1000}k` : val.replace('bill', '')}
											</p>
											<p className="text-[10px] font-black">{count}x</p>
										</div>
									)
								))}
							</div>
						</div>
					)}

					{/* Recent Transactions - Compact list */}
					<div>
						<div className="flex items-center justify-between mb-2">
							<h4 className="text-[9px] font-bold uppercase text-muted-foreground/70">Transaksi Terakhir</h4>
							<span className="text-[8px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Sesi Ini</span>
						</div>

						{details === undefined ? (
							<div className="space-y-1">
								{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
							</div>
						) : !details || details.recentTransactions.length === 0 ? (
							<div className="py-6 text-center bg-muted/20 rounded-lg border border-dashed border-border">
								<Receipt className="w-8 h-8 text-muted-foreground/20 mx-auto mb-1" />
								<p className="text-[10px] text-muted-foreground font-medium">Belum ada transaksi</p>
							</div>
						) : (
							<div className="space-y-1">
								{details.recentTransactions.slice(0, 8).map((tx: any) => (
									<div key={tx.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/40 transition-colors border border-transparent">
										<div className="flex items-center gap-2 flex-1 min-w-0">
											<div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${tx.type === 'pos' ? 'bg-primary/10 text-primary' : 'bg-orange-500/10 text-orange-600'}`}>
												{tx.type === 'pos' ? <ShoppingBag className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-[10px] font-bold text-foreground truncate">
													{tx.type === 'pos' ? `#${tx.name}` : tx.name}
												</p>
											</div>
										</div>
										<div className="flex items-center gap-2 ml-2 shrink-0">
											<p className="text-[10px] font-bold text-foreground">{formatCurrencyIDR(tx.amount, true)}</p>
											<span className={`text-[7px] font-bold uppercase tracking-tighter px-1 py-0.5 rounded ${
												tx.status === 'completed' || tx.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
											}`}>
												{tx.status}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Footer - Compact */}
				<div className="shrink-0 p-4 bg-muted/10 border-t border-border/40">
					<button
						onClick={() => onOpenChange(false)}
						className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
					>
						Tutup
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
