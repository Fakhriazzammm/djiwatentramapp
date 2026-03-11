import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	Banknote,
	BarChart3,
	Bot,
	ClipboardList,
	Clock,
	Loader2,
	type LucideIcon,
	Menu,
	Minus,
	Package,
	Pencil,
	Plus,
	ShoppingCart,
	Sparkles,
	SquarePlay,
	TrendingDown,
	TrendingUp,
	Wallet,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { YumiAIChat } from "@/components/pos/yumi-ai-chat";

interface ConfirmConfig {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	variant?: "danger" | "warning" | "info";
}

interface TabItem {
	value: string;
	label: string;
	icon: LucideIcon;
	iconColor: string;
}

const TABS: TabItem[] = [
	{
		value: "dashboard",
		label: "Dashboard",
		icon: BarChart3,
		iconColor: "text-primary",
	},
	{ value: "kas", label: "Kas", icon: Wallet, iconColor: "text-primary" },
	{ value: "stok", label: "Stok", icon: Package, iconColor: "text-accent" },
	{
		value: "yumi",
		label: "Yumi AI",
		icon: Bot,
		iconColor: "text-primary",
	},
];

export function MenuSidebar() {
	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState("dashboard");
	const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	const lowStockItems = useQuery(api.inventory.getLowStockItems);
	const lowStockCount = lowStockItems?.length || 0;

	return (
		<Sheet onOpenChange={setIsOpen} open={isOpen}>
			<SheetTrigger>
				<Button
					className="relative shrink-0 bg-background"
					onClick={() => setIsOpen(true)}
					size="icon"
					variant="outline"
				>
					<Menu className="h-5 w-5" />
					{lowStockCount > 0 && (
						<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-bold text-[9px] text-destructive-foreground">
							{lowStockCount > 9 ? "9+" : lowStockCount}
						</span>
					)}
					<span className="sr-only">Menu Operasional</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				className="flex w-full flex-col p-0 sm:max-w-[440px]"
				side="right"
			>
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle className="text-base font-bold">Menu Operasional</SheetTitle>
				</SheetHeader>
				<div className="flex-1 overflow-hidden">
					<Tabs className="flex h-full flex-col" value={activeTab} onValueChange={setActiveTab}>
						<div className="border-b bg-muted/20 px-2 pt-2">
							<TabsList className="grid h-14 w-full grid-cols-4 gap-0.5 rounded-t-lg bg-muted/50 p-1">
								{TABS.map((tab) => {
									const Icon = tab.icon;
									return (
										<TabsTrigger
											className="flex h-full flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 font-medium text-[10px] transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
											key={tab.value}
											value={tab.value}
										>
											<Icon className="h-4 w-4" />
											<span className="leading-none">{tab.label}</span>
										</TabsTrigger>
									);
								})}
							</TabsList>
						</div>

						<div className="flex-1 overflow-y-auto bg-background pb-10">
							<TabsContent className="m-0 h-full p-3" value="dashboard">
								<DashboardTab onClose={() => setIsOpen(false)} onNavigate={setActiveTab} />
							</TabsContent>
							<TabsContent className="m-0 h-full p-3" value="kas">
								<KasTab onClose={() => setIsOpen(false)} />
							</TabsContent>
							<TabsContent className="m-0 h-full p-3" value="stok">
								<StokTab setConfirmConfig={setConfirmConfig} />
							</TabsContent>
							<TabsContent className="m-0 h-[calc(100vh-16rem)] p-0" value="yumi">
								<YumiAIChat />
							</TabsContent>
						</div>
					</Tabs>
				</div>
			</SheetContent>

			<ConfirmationModal
				isOpen={confirmConfig.isOpen}
				message={confirmConfig.message}
				onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
				onConfirm={confirmConfig.onConfirm}
				title={confirmConfig.title}
			/>
		</Sheet>
	);
}

function DashboardTab({ onClose, onNavigate }: { onClose: () => void; onNavigate: (tab: string) => void }) {
	const orders = useQuery(api.orders.getOrders, {});
	const lowStockItems = useQuery(api.inventory.getLowStockItems);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const financialSummary = useQuery(api.finance.getFinancialSummary, {
		startDate: today.getTime(),
	});

	const income = financialSummary?.totalIncome || 0;
	const expense = financialSummary?.totalExpense || 0;
	const balance = financialSummary?.netBalance || 0;

	const todayOrders =
		orders?.filter((o) => o.createdAt >= today.getTime()) || [];
	const totalSales = todayOrders
		.filter(
			(o: Doc<"orders">) => o.status === "paid" || o.status === "completed"
		)
		.reduce((acc: number, o: Doc<"orders">) => acc + o.totalAmount, 0);

	const recentOrders = orders?.slice(0, 5) || [];

	const formatCurrency = (value: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(value);

	const formatTime = (timestamp: number) =>
		new Date(timestamp).toLocaleTimeString("id-ID", {
			hour: "2-digit",
			minute: "2-digit",
		});

	const todayLabel = new Date().toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "short",
	});

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-foreground text-sm">{todayLabel}</span>
				<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Live</span>
			</div>
			<div className="grid grid-cols-3 gap-2">
				<Card className="border-primary/20 bg-primary/5">
					<CardContent className="p-3 text-center">
						<TrendingUp className="mx-auto mb-1 h-4 w-4 text-primary" />
						<p className="text-[9px] text-primary/70 uppercase tracking-tight">
							Pemasukan
						</p>
						<p className="font-bold text-primary text-sm">
							{formatCurrency(income)}
						</p>
					</CardContent>
				</Card>
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="p-3 text-center">
						<TrendingDown className="mx-auto mb-1 h-4 w-4 text-destructive" />
						<p className="text-[9px] text-destructive/70 uppercase tracking-tight">
							Pengeluaran
						</p>
						<p className="font-bold text-destructive text-sm">
							{formatCurrency(expense)}
						</p>
					</CardContent>
				</Card>
				<Card className="border-accent/20 bg-accent/5">
					<CardContent className="p-3 text-center">
						<Banknote className="mx-auto mb-1 h-4 w-4 text-accent" />
						<p className="text-[9px] text-accent/70 uppercase tracking-tight">
							Kas Bersih
						</p>
						<p
							className={`font-bold text-sm ${balance >= 0 ? "text-primary" : "text-destructive"}`}
						>
							{formatCurrency(balance)}
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<Card className="border-border bg-muted/30">
					<CardContent className="p-3 text-center">
						<ClipboardList className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
						<p className="font-bold text-foreground text-lg">
							{todayOrders.length}
						</p>
						<p className="text-[9px] text-muted-foreground uppercase">
							Pesanan Hari Ini
						</p>
					</CardContent>
				</Card>
				<Card className="border-border bg-muted/30">
					<CardContent className="p-3 text-center">
						<Wallet className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
						<p className="font-bold text-foreground text-lg">
							{formatCurrency(totalSales)}
						</p>
						<p className="text-[9px] text-muted-foreground uppercase">
							Total Penjualan
						</p>
					</CardContent>
				</Card>
			</div>

			{(lowStockItems?.length || 0) > 0 && (
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="p-3">
						<div className="flex items-center gap-2">
							<AlertCircle className="h-4 w-4 text-destructive" />
							<span className="font-medium text-destructive text-sm">
								{lowStockItems?.length} item stok rendah!
							</span>
						</div>
					</CardContent>
				</Card>
			)}

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<h3 className="font-bold text-sm">Transaksi Terakhir</h3>
					<span className="text-[10px] text-muted-foreground">5 terbaru</span>
				</div>
				{recentOrders.length === 0 ? (
					<div className="rounded-lg border border-dashed py-6 text-center text-muted-foreground text-sm">
						Belum ada transaksi hari ini
					</div>
				) : (
					<div className="space-y-2">
						{recentOrders.map((order) => (
							<div
								className="flex items-center justify-between rounded-lg border bg-muted/30 p-2"
								key={order._id}
							>
								<div className="flex items-center gap-2">
									<div
										className={`h-2 w-2 rounded-full ${
											order.status === "completed" || order.status === "paid"
												? "bg-primary"
												: order.status === "pending"
													? "bg-accent"
													: "bg-destructive"
										}`}
									/>
									<div>
										<p className="font-medium text-xs">
											{order.items?.[0]?.productName || "Pesanan"}
											{order.items?.length > 1 && ` +${order.items.length - 1}`}
										</p>
										<p className="text-[10px] text-muted-foreground">
											{formatTime(order.createdAt)}
										</p>
									</div>
								</div>
								<span className="font-bold text-sm">
									{formatCurrency(order.totalAmount)}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="space-y-2">
				<h3 className="font-bold text-sm">Aksi Cepat</h3>
				<div className="grid grid-cols-2 gap-2">
					<Button
						className="h-auto flex-col gap-1 py-3"
						onClick={() => onNavigate("kas")}
						variant="outline"
					>
						<SquarePlay className="h-4 w-4" />
						<span className="text-[10px]">Mulai Shift</span>
					</Button>
					<Button
						className="h-auto flex-col gap-1 py-3"
						onClick={() => onClose()}
						variant="outline"
					>
						<Clock className="h-4 w-4" />
						<span className="text-[10px]">Tunda Order</span>
					</Button>
				</div>
			</div>

			<div className="h-6" />
		</div>
	);
}

function KasTab({ onClose }: { onClose: () => void }) {
	const [activeSubTab, setActiveSubTab] = useState<
		"shift" | "masuk" | "keluar"
	>("shift");

	const subTabs = [
		{ value: "shift" as const, label: "Shift", icon: SquarePlay },
		{ value: "masuk" as const, label: "Masuk", icon: TrendingUp },
		{ value: "keluar" as const, label: "Keluar", icon: TrendingDown },
	];

	return (
		<div className="space-y-3">
			<div className="flex gap-1 rounded-lg bg-muted/50 p-1">
				{subTabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<button
							className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 font-medium text-xs transition-all ${
								activeSubTab === tab.value
									? "bg-background text-foreground font-semibold shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							key={tab.value}
							onClick={() => setActiveSubTab(tab.value)}
							type="button"
						>
							<Icon className="h-3.5 w-3.5" />
							<span>{tab.label}</span>
						</button>
					);
				})}
			</div>

			{activeSubTab === "shift" && <ShiftManagement onClose={onClose} />}
			{activeSubTab === "masuk" && <IncomeForm onClose={onClose} />}
			{activeSubTab === "keluar" && <ExpenseForm onClose={onClose} />}
		</div>
	);
}

function ShiftManagement({ onClose }: { onClose: () => void }) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const [shiftType, setShiftType] = useState<"mulai" | "akhiri">("mulai");
	const [amount, setAmount] = useState("");
	const [cashInRegister, setCashInRegister] = useState("");
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const financialSummary = useQuery(api.finance.getFinancialSummary, {
		startDate: today.getTime(),
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!amount) {
			toast.error("Masukkan jumlah modal");
			return;
		}

		setIsSubmitting(true);
		try {
			await createTransaction({
				type: "income",
				amount: Number(amount),
				category: shiftType === "mulai" ? "Modal Awal" : "Setoran Akhir",
				description: `${shiftType === "mulai" ? "Mulai Shift" : "Akhiri Shift"} - ${notes || "Tanpa catatan"}`,
				date: Date.now(),
				status: "completed",
				paymentMethod: "tunai",
			});
			toast.success(shiftType === "mulai" ? "Shift dimulai" : "Shift diakhiri");
			setAmount("");
			setCashInRegister("");
			setNotes("");
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan data shift");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Manajemen Shift</h3>
				<p className="text-muted-foreground text-sm">
					Catat modal awal/akhir shift kasir
				</p>
			</div>

			<div className="flex gap-2 rounded-lg bg-muted/50 p-1">
				<button
					className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-all ${
						shiftType === "mulai"
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setShiftType("mulai")}
					type="button"
				>
					Mulai Shift
				</button>
				<button
					className={`flex-1 rounded-md px-3 py-2 font-medium text-sm transition-all ${
						shiftType === "akhiri"
							? "bg-destructive text-destructive-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setShiftType("akhiri")}
					type="button"
				>
					Akhiri Shift
				</button>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<Label>
						{shiftType === "mulai" ? "Modal Awal (Rp)" : "Setoran (Rp)"}
					</Label>
					<Input
						className="text-lg"
						min={0}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				{shiftType === "akhiri" && (
					<div className="space-y-2">
						<Label>Uang di Kasir (Rp)</Label>
						<Input
							className="text-lg"
							min={0}
							onChange={(e) => setCashInRegister(e.target.value)}
							placeholder="0"
							type="number"
							value={cashInRegister}
						/>
					</div>
				)}

				<div className="space-y-2">
					<Label>Catatan (Opsional)</Label>
					<Textarea
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Nama kasir, catatan tambahan..."
						value={notes}
					/>
				</div>

				{financialSummary && shiftType === "akhiri" && (
					<Card className="border-border bg-muted/30">
						<CardContent className="p-3">
							<p className="mb-1 text-[10px] text-muted-foreground uppercase">
								Ringkasan Hari Ini
							</p>
							<div className="space-y-1 text-xs">
								<div className="flex justify-between">
									<span>Pemasukan:</span>
									<span className="font-bold text-primary">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(financialSummary.totalIncome || 0)}
									</span>
								</div>
								<div className="flex justify-between">
									<span>Pengeluaran:</span>
									<span className="font-bold text-destructive">
										{new Intl.NumberFormat("id-ID", {
											style: "currency",
											currency: "IDR",
											maximumFractionDigits: 0,
										}).format(financialSummary.totalExpense || 0)}
									</span>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				<Button
					className="w-full"
					disabled={isSubmitting}
					type="submit"
					variant={shiftType === "mulai" ? "default" : "destructive"}
				>
					{isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					{shiftType === "mulai" ? "Mulai Shift" : "Akhiri Shift"}
				</Button>
			</form>
		</div>
	);
}

function IncomeForm({ onClose }: { onClose: () => void }) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Shift Pagi");
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!amount) {
			return;
		}

		setIsSubmitting(true);
		try {
			await createTransaction({
				type: "income",
				amount: Number(amount),
				category,
				description,
				date: Date.now(),
				status: "completed",
				paymentMethod: "tunai",
			});
			toast.success("Pemasukan berhasil dicatat");
			setAmount("");
			setDescription("");
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal mencatat pemasukan");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Input Pemasukan</h3>
				<p className="text-muted-foreground text-sm">
					Catat modal awal, tambahan modal, atau setoran shift.
				</p>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<Label>Kategori</Label>
					<Select
						onValueChange={(val) => setCategory(val || "")}
						value={category}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Shift Pagi">Shift Pagi</SelectItem>
							<SelectItem value="Shift Sore">Shift Sore</SelectItem>
							<SelectItem value="Modal Awal">Modal Awal</SelectItem>
							<SelectItem value="Lainnya">Lainnya</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label>Jumlah (Rp)</Label>
					<Input
						className="text-lg"
						min={0}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				<div className="space-y-2">
					<Label>Keterangan (Opsional)</Label>
					<Textarea
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Catatan tambahan..."
						value={description}
					/>
				</div>

				<Button className="w-full" disabled={isSubmitting} type="submit">
					{isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					Simpan Pemasukan
				</Button>
			</form>
		</div>
	);
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
	const createTransaction = useMutation(api.finance.createTransaction);
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("Bahan Baku");
	const [description, setDescription] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!amount) {
			return;
		}

		setIsSubmitting(true);
		try {
			await createTransaction({
				type: "expense",
				amount: Number(amount),
				category,
				description,
				date: Date.now(),
				status: "completed",
				paymentMethod: "tunai",
			});
			toast.success("Pengeluaran berhasil dicatat");
			setAmount("");
			setDescription("");
			onClose();
		} catch (error) {
			console.error(error);
			toast.error("Gagal mencatat pengeluaran");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-4 pt-2">
			<div className="space-y-2 text-center">
				<h3 className="font-medium text-lg">Input Pengeluaran</h3>
				<p className="text-muted-foreground text-sm">
					Catat belanja harian, es batu, galon, dll dari uang kasir.
				</p>
			</div>

			<form className="space-y-4" onSubmit={handleSubmit}>
				<div className="space-y-2">
					<Label>Kategori</Label>
					<Select
						onValueChange={(val) => setCategory(val || "")}
						value={category}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Bahan Baku">Bahan Baku (Pasar)</SelectItem>
							<SelectItem value="Operasional">
								Operasional (Es/Galon/Gas)
							</SelectItem>
							<SelectItem value="Konsumsi">Konsumsi Pegawai</SelectItem>
							<SelectItem value="Lainnya">Lainnya</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label>Jumlah (Rp)</Label>
					<Input
						className="text-lg"
						min={0}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				<div className="space-y-2">
					<Label>Keterangan</Label>
					<Textarea
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Rincian belanja..."
						required
						value={description}
					/>
				</div>

				<Button
					className="w-full"
					disabled={isSubmitting}
					type="submit"
					variant="destructive"
				>
					{isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					Simpan Pengeluaran
				</Button>
			</form>
		</div>
	);
}

function StokTab({
	setConfirmConfig,
}: {
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const [activeSubTab, setActiveSubTab] = useState<"update" | "beli">("update");

	const lowStockItems = useQuery(api.inventory.getLowStockItems);
	const lowStockCount = lowStockItems?.length || 0;

	const subTabs = [
		{ value: "update" as const, label: "Update Stok", icon: Package },
		{
			value: "beli" as const,
			label: "Daftar Beli",
			icon: ShoppingCart,
			badge: lowStockCount,
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex gap-1 rounded-lg bg-muted/50 p-1">
				{subTabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<button
							className={`relative flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 font-medium text-xs transition-all ${
								activeSubTab === tab.value
									? "bg-background text-foreground font-semibold shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							key={tab.value}
							onClick={() => setActiveSubTab(tab.value)}
							type="button"
						>
							<Icon className="h-3.5 w-3.5" />
							<span>{tab.label}</span>
							{tab.badge && tab.badge > 0 && (
								<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-bold text-[9px] text-destructive-foreground">
									{tab.badge > 9 ? "9+" : tab.badge}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{activeSubTab === "update" && (
				<InventoryTab setConfirmConfig={setConfirmConfig} />
			)}
			{activeSubTab === "beli" && <MarketList />}
		</div>
	);
}

function InventoryTab({
	setConfirmConfig,
}: {
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const inventory = useQuery(api.inventory.getInventory);
	const restockInventory = useMutation(api.inventory.addStock);
	const usageStock = useMutation(api.inventory.usageStock);
	const adjustStock = useMutation(api.inventory.adjustStock);
	const produceBatch = useMutation(api.inventory.produceBaseRecipeBatch);

	const [editingId, setEditingId] = useState<Id<"inventory"> | null>(null);
	const [manualQty, setManualQty] = useState<string>("");

	const handleUpdate = async (
		id: Id<"inventory">,
		type: "add" | "usage",
		currentQty: number
	) => {
		try {
			if (type === "add") {
				await restockInventory({
					inventoryId: id,
					quantity: 1,
					notes: "Quick Update via Menu",
				});
			} else {
				if (currentQty <= 0) {
					return;
				}
				await usageStock({
					inventoryId: id,
					quantity: 1,
					notes: "Quick Update via Menu",
				});
			}
			toast.success("Stok diperbarui");
		} catch (_e) {
			toast.error("Gagal update stok");
		}
	};

	const handleManualAdjust = async (
		id: Id<"inventory">,
		action: "add" | "usage" | "set"
	) => {
		const qty = Number(manualQty);
		if (Number.isNaN(qty) || qty <= 0) {
			toast.error("Masukkan jumlah yang valid");
			return;
		}

		try {
			if (action === "add") {
				await restockInventory({
					inventoryId: id,
					quantity: qty,
					notes: "Manual Adjustment",
				});
			} else if (action === "usage") {
				await usageStock({
					inventoryId: id,
					quantity: qty,
					notes: "Manual Adjustment",
				});
			} else {
				await adjustStock({
					inventoryId: id,
					quantity: qty,
					notes: "Opname/Adjustment",
				});
			}
			toast.success("Stok berhasil diperbarui");
			setEditingId(null);
			setManualQty("");
		} catch (_e) {
			toast.error("Gagal update stok");
		}
	};

	if (inventory === undefined) {
		return (
			<div className="p-4 text-center text-muted-foreground">
				Memuat data...
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="font-bold text-sm">Update Stok</h3>
				<span className="text-[10px] text-muted-foreground">
					{inventory.length} item
				</span>
			</div>
			<ScrollArea className="h-[52vh] pr-2">
				<div className="space-y-2">
					{inventory.map((item) => {
						const isEditing = editingId === item._id;
						const isLowStock = item.quantity <= item.lowStockThreshold;

						return (
							<Card
								className={`overflow-hidden ${
									isLowStock
										? "border-destructive/30 bg-destructive/5"
										: "border-border bg-card/50"
								}`}
								key={item._id}
							>
								<CardContent className="p-3">
									<div className="flex items-center justify-between">
										<div className="flex flex-col">
											<div className="flex items-center gap-1.5">
												<span className="font-bold text-sm">
													{item.ingredientName}
												</span>
												{isLowStock && (
													<AlertCircle className="h-3 w-3 text-destructive" />
												)}
											</div>
											<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
												Stok:{" "}
												<span
													className={`font-bold ${
														isLowStock ? "text-destructive" : "text-foreground"
													}`}
												>
													{item.displayUnit &&
													item.conversionFactor &&
													item.conversionFactor > 0
														? (item.quantity / item.conversionFactor).toFixed(2)
														: item.quantity}
												</span>{" "}
												{item.displayUnit || item.unit}
												{item.displayUnit && (
													<span className="text-[9px] italic opacity-70">
														({item.quantity} {item.unit})
													</span>
												)}
											</div>
										</div>

										<div className="flex items-center gap-1">
											{item.baseRecipeId && (
												<Button
													className="h-7 px-2 font-bold text-[9px]"
													onClick={() => {
														setConfirmConfig({
															isOpen: true,
															title: "Konfirmasi Produksi",
															message: `Buat 1 batch ${item.ingredientName}?`,
															onConfirm: async () => {
																try {
																	if (!item.baseRecipeId) {
																		return;
																	}
																	await produceBatch({
																		baseRecipeId: item.baseRecipeId,
																		inventoryId: item._id,
																		batchMultiplier: 1,
																	});
																	toast.success("Produksi berhasil");
																} catch (e: unknown) {
																	const error = e as Error;
																	toast.error(error.message);
																}
															},
														});
													}}
													size="sm"
													variant="outline"
												>
													<Sparkles className="mr-1 h-3 w-3 text-accent" />
													Produksi
												</Button>
											)}

											{isEditing ? (
												<Button
													className="h-7 w-7"
													onClick={() => setEditingId(null)}
													size="icon"
													variant="ghost"
												>
													<X className="h-4 w-4" />
												</Button>
											) : (
												<>
													<Button
														className="h-7 w-7 rounded-md"
														disabled={item.quantity <= 0}
														onClick={() =>
															handleUpdate(item._id, "usage", item.quantity)
														}
														size="icon"
														variant="outline"
													>
														<Minus className="h-3 w-3" />
													</Button>
													<Button
														className="h-7 w-7 rounded-md"
														onClick={() =>
															handleUpdate(item._id, "add", item.quantity)
														}
														size="icon"
														variant="outline"
													>
														<Plus className="h-3 w-3" />
													</Button>
													<Button
														className="h-7 w-7 rounded-md text-muted-foreground hover:text-primary"
														onClick={() => {
															setEditingId(item._id);
															setManualQty("");
														}}
														size="icon"
														variant="ghost"
													>
														<Pencil className="h-3 w-3" />
													</Button>
												</>
											)}
										</div>
									</div>

									{isEditing && (
										<div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
											<div className="flex items-center gap-2">
												<Input
													autoFocus
													className="h-8 font-bold text-sm"
													onChange={(e) => setManualQty(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															handleManualAdjust(item._id, "add");
														}
														if (e.key === "Escape") {
															setEditingId(null);
														}
													}}
													placeholder="Jumlah..."
													type="number"
													value={manualQty}
												/>
												<div className="flex gap-1">
													<Button
														className="h-8 px-2 font-bold text-[10px]"
														onClick={() => handleManualAdjust(item._id, "add")}
														size="sm"
														variant="outline"
													>
														+
													</Button>
													<Button
														className="h-8 px-2 font-bold text-[10px]"
														onClick={() =>
															handleManualAdjust(item._id, "usage")
														}
														size="sm"
														variant="outline"
													>
														-
													</Button>
													<Button
														className="h-8 px-2 font-bold text-[10px]"
														onClick={() => handleManualAdjust(item._id, "set")}
														size="sm"
														variant="default"
													>
														Set
													</Button>
												</div>
											</div>
											<p className="text-[9px] text-muted-foreground italic">
												* Tentukan jumlah lalu pilih aksi (+ / - / Set Total)
											</p>
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}

function MarketList() {
	const lowStockItems = useQuery(api.inventory.getLowStockItems);

	if (lowStockItems === undefined) {
		return <div className="p-4 text-center">Memuat data...</div>;
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="font-bold text-sm">Daftar Belanja</h3>
				<span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-[10px] text-destructive">
					{lowStockItems.length} item perlu dibeli
				</span>
			</div>

			{lowStockItems.length === 0 ? (
				<div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
					<Package className="mx-auto mb-2 h-10 w-10 opacity-20" />
					<p className="font-medium">Stok aman semua!</p>
					<p className="text-xs">Tidak ada item yang perlu dibeli</p>
				</div>
			) : (
				<ScrollArea className="h-[52vh] pr-2">
					<div className="space-y-2">
						{lowStockItems.map((item) => (
							<Card
								className="border-destructive/30 bg-destructive/5"
								key={item._id}
							>
								<CardContent className="flex items-start gap-3 p-3">
									<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
									<div className="flex-1">
										<div className="font-medium text-destructive text-sm">
											{item.ingredientName}
										</div>
										<div className="text-muted-foreground text-xs">
											Sisa:{" "}
											<span className="font-bold">
												{item.displayUnit &&
												item.conversionFactor &&
												item.conversionFactor > 0
													? (item.quantity / item.conversionFactor).toFixed(2)
													: item.quantity}
											</span>{" "}
											{item.displayUnit || item.unit}
											<span className="mx-1 text-muted-foreground/30">|</span>
											Min:{" "}
											<span className="font-bold">
												{item.displayUnit &&
												item.conversionFactor &&
												item.conversionFactor > 0
													? (
															item.lowStockThreshold / item.conversionFactor
														).toFixed(2)
													: item.lowStockThreshold}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}
