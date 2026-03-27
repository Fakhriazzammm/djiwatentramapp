import { useCart } from "@/context/cart-context";
import { 
	User, 
	Table, 
	ShoppingBag, 
	Trash2, 
	Minus, 
	Plus, 
	CreditCard,
	ChevronRight,
	Info,
	Store
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function CheckoutSidebar({ onCheckout }: { onCheckout: () => void }) {
	const {
		items,
		updateQuantity,
		totalAmount,
		totalItems,
		customerInfo,
		updateCustomerInfo,
		discountAmount,
		finalTotal,
		taxAmount,
		serviceChargeAmount,
	} = useCart();

	const [activeStep, setActiveStep] = useState<"customer" | "menu" | "payment">("customer");

	const fmt = (n: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(n);

	return (
		<div className="flex h-full flex-col border-l border-border bg-card shadow-sm">
			{/* Progress Header */}
			<div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className={cn(
						"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
						activeStep === "customer" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
					)}>1</div>
					<span className={cn("text-xs font-medium", activeStep === "customer" ? "text-foreground" : "text-muted-foreground")}>Info</span>
				</div>
				<ChevronRight className="h-3 w-3 text-muted-foreground" />
				<div className="flex items-center gap-2">
					<div className={cn(
						"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
						activeStep === "menu" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
					)}>2</div>
					<span className={cn("text-xs font-medium", activeStep === "menu" ? "text-foreground" : "text-muted-foreground")}>Menu</span>
				</div>
				<ChevronRight className="h-3 w-3 text-muted-foreground" />
				<div className="flex items-center gap-2">
					<div className={cn(
						"flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
						activeStep === "payment" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
					)}>3</div>
					<span className={cn("text-xs font-medium", activeStep === "payment" ? "text-foreground" : "text-muted-foreground")}>Bayar</span>
				</div>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-4 space-y-6">
					{/* Section 1: Informasi Pelanggan */}
					<div className={cn("space-y-4", activeStep !== "customer" && "opacity-50 pointer-events-none")}>
						<div className="flex items-center gap-2">
							<User className="h-4 w-4 text-primary" />
							<h3 className="text-sm font-bold uppercase tracking-wider">Informasi Pelanggan</h3>
						</div>
						
						<div className="grid gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="customer-name" className="text-[10px] uppercase text-muted-foreground font-bold">Nama Pelanggan</Label>
								<Input 
									id="customer-name"
									placeholder="Nama..."
									value={customerInfo.name}
									onChange={(e) => updateCustomerInfo({ name: e.target.value })}
									className="h-9 text-sm"
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<Label className="text-[10px] uppercase text-muted-foreground font-bold">Tipe Order</Label>
									<div className="flex gap-1 rounded-lg border border-input p-1 bg-background">
										<button 
											onClick={() => updateCustomerInfo({ orderType: "dine_in" })}
											className={cn(
												"flex-1 rounded-md py-1 text-[10px] font-bold transition-all",
												customerInfo.orderType === "dine_in" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"
											)}
										>Dine In</button>
										<button 
											onClick={() => updateCustomerInfo({ orderType: "takeaway" })}
											className={cn(
												"flex-1 rounded-md py-1 text-[10px] font-bold transition-all",
												customerInfo.orderType === "takeaway" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"
											)}
										>Takeaway</button>
									</div>
								</div>
								{customerInfo.orderType === "dine_in" && (
									<div className="space-y-1.5">
										<Label htmlFor="table-number" className="text-[10px] uppercase text-muted-foreground font-bold">No. Meja</Label>
										<Input 
											id="table-number"
											placeholder="01"
											value={customerInfo.tableNumber}
											onChange={(e) => updateCustomerInfo({ tableNumber: e.target.value })}
											className="h-9 text-sm"
										/>
									</div>
								)}
							</div>
						</div>
						{activeStep === "customer" && (
							<Button 
								onClick={() => setActiveStep("menu")}
								className="w-full h-9 text-xs font-bold"
								variant="outline"
							>
								Lanjut Pilih Menu <ChevronRight className="ml-2 h-3 w-3" />
							</Button>
						)}
					</div>

					<Separator className="border-dashed" />

					{/* Section 2: Pilih Menu (Cart Items) */}
					<div className={cn("space-y-4", activeStep === "customer" && "opacity-50 pointer-events-none")}>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<ShoppingBag className="h-4 w-4 text-primary" />
								<h3 className="text-sm font-bold uppercase tracking-wider">Pesanan ({totalItems})</h3>
							</div>
							{activeStep === "menu" && (
								<Button 
									variant="ghost" 
									size="sm" 
									className="h-7 px-2 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("customer")}
								>Edit Info</Button>
							)}
						</div>

						{items.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
								<ShoppingBag className="h-8 w-8 text-muted-foreground/30 mb-2" />
								<p className="text-[10px] font-medium text-muted-foreground">Belum ada menu terpilih</p>
							</div>
						) : (
							<div className="space-y-3">
								{items.map((item) => (
									<div key={`${item.productId}-${item.variant}`} className="group relative flex gap-3 rounded-lg border border-border bg-background p-2 transition-all hover:border-primary/50">
										<div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted">
											{item.image && <img src={item.image} alt={item.name} className="h-full w-full object-cover" />}
										</div>
										<div className="flex flex-1 flex-col justify-between min-w-0">
											<div className="flex justify-between items-start gap-1">
												<h4 className="line-clamp-1 text-[11px] font-bold text-foreground leading-tight">{item.name}</h4>
												<p className="text-[11px] font-bold shrink-0">{fmt(item.price * item.quantity)}</p>
											</div>
											{item.variant && <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tight truncate">{item.variant}</p>}
											
											<div className="mt-1.5 flex items-center justify-between">
												<div className="flex items-center gap-1.5 bg-muted rounded-md p-0.5">
													<button 
														onClick={() => updateQuantity(item.productId, item.variant, -1)}
														className="h-5 w-5 flex items-center justify-center rounded bg-background shadow-sm hover:bg-muted active:scale-90 transition-all"
													>
														{item.quantity === 1 ? <Trash2 className="h-2.5 w-2.5 text-destructive" /> : <Minus className="h-2.5 w-2.5" />}
													</button>
													<span className="min-w-[14px] text-center text-[10px] font-bold">{item.quantity}</span>
													<button 
														onClick={() => updateQuantity(item.productId, item.variant, 1)}
														className="h-5 w-5 flex items-center justify-center rounded bg-background shadow-sm hover:bg-muted active:scale-90 transition-all"
													>
														<Plus className="h-2.5 w-2.5" />
													</button>
												</div>
												<p className="text-[9px] text-muted-foreground font-medium">{fmt(item.price)}</p>
											</div>
										</div>
									</div>
								))}
							</div>
						)}

						{activeStep === "menu" && items.length > 0 && (
							<Button 
								onClick={() => setActiveStep("payment")}
								className="w-full h-9 text-xs font-bold"
								variant="outline"
							>
								Lanjut Pembayaran <ChevronRight className="ml-2 h-3 w-3" />
							</Button>
						)}
					</div>

					<Separator className="border-dashed" />

					{/* Section 3: Ringkasan & Pembayaran */}
					<div className={cn("space-y-4", activeStep !== "payment" && "opacity-50 pointer-events-none")}>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<CreditCard className="h-4 w-4 text-primary" />
								<h3 className="text-sm font-bold uppercase tracking-wider">Ringkasan Bayar</h3>
							</div>
							{activeStep === "payment" && (
								<Button 
									variant="ghost" 
									size="sm" 
									className="h-7 px-2 text-[10px] text-muted-foreground font-bold"
									onClick={() => setActiveStep("menu")}
								>Edit Menu</Button>
							)}
						</div>

						{/* Struk Design */}
						<div className="rounded-xl border border-border bg-background p-4 space-y-3 font-mono shadow-sm overflow-hidden relative">
							{/* Receipt top edge */}
							<div className="absolute top-0 left-0 right-0 h-1 bg-[radial-gradient(circle,transparent_0,transparent_4px,var(--border)_4px,var(--border)_5px,transparent_5px)] bg-[length:10px_10px] bg-repeat-x" />
							
							<div className="space-y-1.5 text-[11px]">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Subtotal</span>
									<span className="font-bold">{fmt(totalAmount)}</span>
								</div>
								{discountAmount > 0 && (
									<div className="flex justify-between text-primary">
										<span>Diskon</span>
										<span className="font-bold">-{fmt(discountAmount)}</span>
									</div>
								)}
								<div className="flex justify-between text-muted-foreground">
									<span>Pajak</span>
									<span>{fmt(taxAmount)}</span>
								</div>
								<div className="flex justify-between text-muted-foreground">
									<span>Service Charge</span>
									<span>{fmt(serviceChargeAmount)}</span>
								</div>
							</div>

							<Separator className="border-dashed" />

							<div className="flex justify-between items-center py-1">
								<span className="text-xs font-black uppercase tracking-widest">Total</span>
								<span className="text-xl font-black text-primary tracking-tighter">{fmt(finalTotal)}</span>
							</div>

							<div className="text-[9px] text-muted-foreground text-center pt-2 space-y-1">
								<p>Terima kasih atas pesanan Anda!</p>
								<div className="flex items-center justify-center gap-1">
									<Store className="h-2 w-2" />
									<span>YumiPOS • Djiwa Tentram</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</ScrollArea>

			{/* Fixed Footer Payment Button */}
			<div className="p-4 border-t border-border bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
				<Button 
					onClick={onCheckout}
					disabled={items.length === 0 || activeStep !== "payment"}
					className="w-full h-12 text-sm font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
					size="lg"
				>
					Bayar Sekarang
				</Button>
				<p className="mt-2 text-center text-[9px] text-muted-foreground font-medium uppercase tracking-tight">
					Metode Pembayaran: Tunai, QRIS, Transfer
				</p>
			</div>
		</div>
	);
}
