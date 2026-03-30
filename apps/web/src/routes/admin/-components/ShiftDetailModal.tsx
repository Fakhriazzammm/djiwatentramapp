import { useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { Clock, DollarSign, Receipt, ShoppingBag, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ShiftDetailModalProps {
	shift: any;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ShiftDetailModal({ shift, isOpen, onOpenChange }: ShiftDetailModalProps) {
	const details = useQuery(
		api.finance.getShiftDetails,
		isOpen && shift ? { startTime: shift.startTime, endTime: shift.endTime } : "skip"
	);

	if (!shift) return null;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-background/95 backdrop-blur-xl">
				<DialogHeader className="p-6 pb-4 bg-primary/5 border-b border-primary/10">
					<div className="flex items-center justify-between">
						<div>
							<DialogTitle className="text-2xl font-bold tracking-tight text-primary">
								Ringkasan Sesi
							</DialogTitle>
							<div className="flex items-center gap-2 mt-1.5 text-muted-foreground text-xs font-medium">
								<Clock className="w-3.5 h-3.5" />
								<span>
									{new Date(shift.startTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
								</span>
								<span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
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
						<div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${!shift.endTime ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-200 text-slate-600'}`}>
							{!shift.endTime ? 'Sedang Berjalan' : 'Selesai'}
						</div>
					</div>
				</DialogHeader>

				<ScrollArea className="flex-1 p-6">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
						{/* Revenue Stats */}
						<div className="space-y-4">
							<h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
								Ringkasan Finansial
							</h4>
							<div className="space-y-3">
								<div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50">
									<div className="flex items-center gap-3">
										<div className="p-2 rounded-xl bg-primary/10 text-primary">
											<DollarSign className="w-4 h-4" />
										</div>
										<span className="text-sm font-semibold">Subtotal</span>
									</div>
									<span className="text-sm font-bold text-primary">{formatCurrencyIDR(shift.revenue)}</span>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<div className="p-3 rounded-2xl bg-muted/30 border border-border/50">
										<p className="text-[10px] font-bold text-muted-foreground/70 uppercase mb-1">Tunai/Laci</p>
										<p className="text-sm font-bold">{formatCurrencyIDR(shift.cashRevenue)}</p>
									</div>
									<div className="p-3 rounded-2xl bg-muted/30 border border-border/50">
										<p className="text-[10px] font-bold text-muted-foreground/70 uppercase mb-1">E-Wallet/QRIS</p>
										<p className="text-sm font-bold">{formatCurrencyIDR(shift.qrisRevenue)}</p>
									</div>
								</div>
							</div>
						</div>

						{/* Shift Info */}
						<div className="space-y-4">
							<h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
								Informasi Tugas
							</h4>
							<div className="space-y-3">
								<div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/50">
									<div className="p-2 rounded-xl bg-orange-500/10 text-orange-600">
										<User className="w-4 h-4" />
									</div>
									<div>
										<p className="text-[10px] font-bold text-muted-foreground/70 uppercase">Kasir</p>
										<p className="text-sm font-bold">{shift.cashierName || 'Unknown'}</p>
									</div>
								</div>
								<div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/50">
									<div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
										<ShoppingBag className="w-4 h-4" />
									</div>
									<div>
										<p className="text-[10px] font-bold text-muted-foreground/70 uppercase">Nama Shift</p>
										<p className="text-sm font-bold">{shift.shiftName || 'N/A'}</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Recent Transactions */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
								Transaksi Terakhir
							</h4>
							<span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
								Sesi Ini
							</span>
						</div>
						
						{details === undefined ? (
							<div className="space-y-2">
								{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
							</div>
						) : !details || details.recentTransactions.length === 0 ? (
							<div className="py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
								<Receipt className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
								<p className="text-sm text-muted-foreground font-medium">Belum ada transaksi</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-2">
								{details.recentTransactions.map((tx: any) => (
									<div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 transition-colors hover:bg-muted/50 border border-transparent hover:border-border/50">
										<div className="flex items-center gap-3">
											<div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.type === 'pos' ? 'bg-primary/10 text-primary' : 'bg-orange-500/10 text-orange-600'}`}>
												{tx.type === 'pos' ? <ShoppingBag className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
											</div>
											<div>
												<p className="text-xs font-bold text-foreground truncate max-w-[120px]">
													{tx.type === 'pos' ? `#${tx.name}` : tx.name}
												</p>
												<p className="text-[9px] text-muted-foreground">
													{new Date(tx.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
												</p>
											</div>
										</div>
										<div className="text-right">
											<p className="text-xs font-bold text-foreground">{formatCurrencyIDR(tx.amount)}</p>
											<span className={`text-[8px] font-bold uppercase tracking-tighter px-1 py-0.5 rounded-md ${
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
				</ScrollArea>

				<div className="p-6 bg-muted/10 border-t border-border/40">
					<button
						onClick={() => onOpenChange(false)}
						className="w-full py-3 bg-primary text-primary-foreground rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
					>
						Tutup Ringkasan
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
