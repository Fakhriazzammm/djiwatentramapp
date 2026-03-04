import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
	ClipboardList,
	History,
	Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";

type FilterType =
	| "today"
	| "yesterday"
	| "this_week"
	| "last_week"
	| "this_month"
	| "last_month";

interface FilterOption {
	value: FilterType;
	label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
	{ value: "today", label: "Hari Ini" },
	{ value: "yesterday", label: "Kemarin" },
	{ value: "this_week", label: "Minggu Ini" },
	{ value: "last_week", label: "Minggu Kemarin" },
	{ value: "this_month", label: "Bulan Ini" },
	{ value: "last_month", label: "Bulan Lalu" },
];

function getDateRange(filter: FilterType): { start: number; end: number } {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	switch (filter) {
		case "today": {
			return {
				start: today.getTime(),
				end: today.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "yesterday": {
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);
			return {
				start: yesterday.getTime(),
				end: yesterday.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "this_week": {
			const startOfWeek = new Date(today);
			startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(endOfWeek.getDate() + 6);
			return {
				start: startOfWeek.getTime(),
				end: endOfWeek.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "last_week": {
			const startOfLastWeek = new Date(today);
			startOfLastWeek.setDate(
				startOfLastWeek.getDate() - startOfLastWeek.getDay() - 7
			);
			const endOfLastWeek = new Date(startOfLastWeek);
			endOfLastWeek.setDate(endOfLastWeek.getDate() + 6);
			return {
				start: startOfLastWeek.getTime(),
				end: endOfLastWeek.getTime() + 24 * 60 * 60 * 1000 - 1,
			};
		}
		case "this_month": {
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const endOfMonth = new Date(
				now.getFullYear(),
				now.getMonth() + 1,
				0,
				23,
				59,
				59,
				999
			);
			return {
				start: startOfMonth.getTime(),
				end: endOfMonth.getTime(),
			};
		}
		case "last_month": {
			const startOfLastMonth = new Date(
				now.getFullYear(),
				now.getMonth() - 1,
				1
			);
			const endOfLastMonth = new Date(
				now.getFullYear(),
				now.getMonth(),
				0,
				23,
				59,
				59,
				999
			);
			return {
				start: startOfLastMonth.getTime(),
				end: endOfLastMonth.getTime(),
			};
		}
	}
}

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

const formatDate = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

export function TransactionHistorySidebar() {
	const [isOpen, setIsOpen] = useState(false);
	const [activeFilter, setActiveFilter] = useState<FilterType>("today");

	const orders = useQuery(api.orders.getOrders, {});

	const filteredOrders = useMemo(() => {
		if (!orders) return [];

		const { start, end } = getDateRange(activeFilter);

		return orders.filter((order) => {
			const orderTime = order.createdAt;
			return orderTime >= start && orderTime <= end;
		});
	}, [orders, activeFilter]);

	const totalAmount = useMemo(() => {
		return filteredOrders
			.filter(
				(o) => o.status === "paid" || o.status === "completed"
			)
			.reduce((acc, o) => acc + o.totalAmount, 0);
	}, [filteredOrders]);

	const paidOrdersCount = filteredOrders.filter(
		(o) => o.status === "paid" || o.status === "completed"
	).length;

	return (
		<Sheet onOpenChange={setIsOpen} open={isOpen}>
			<SheetTrigger>
				<Button
					className="shrink-0 gap-1.5 bg-background"
					onClick={() => setIsOpen(true)}
					size="sm"
					variant="outline"
				>
					<History className="h-4 w-4" />
					<span className="hidden sm:inline">Riwayat</span>
					<span className="sr-only">Riwayat Transaksi</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				className="flex w-full flex-col p-0 sm:w-[450px]"
				side="left"
			>
				<SheetHeader className="border-b p-4">
					<SheetTitle className="flex items-center gap-2">
						<ClipboardList className="h-5 w-5 text-primary" />
						Riwayat Transaksi
					</SheetTitle>
				</SheetHeader>

				{/* Filter Buttons */}
				<div className="border-b bg-muted/30 p-3">
					<div className="flex flex-wrap gap-1.5">
						{FILTER_OPTIONS.map((option) => (
							<button
								className={`rounded-full px-3 py-1.5 font-medium text-xs transition-all ${
									activeFilter === option.value
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground hover:bg-muted/80"
								}`}
								key={option.value}
								onClick={() => setActiveFilter(option.value)}
								type="button"
							>
								{option.label}
							</button>
						))}
					</div>
				</div>

				{/* Orders List */}
				<div className="flex-1 overflow-hidden">
					{orders === undefined ? (
						<div className="flex h-full items-center justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : filteredOrders.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
							<ClipboardList className="h-12 w-12 text-muted-foreground/30" />
							<p className="font-medium text-muted-foreground text-sm">
								Tidak ada transaksi
							</p>
							<p className="text-muted-foreground text-xs">
								{FILTER_OPTIONS.find((f) => f.value === activeFilter)?.label}
							</p>
						</div>
					) : (
						<ScrollArea className="h-full">
							<div className="space-y-2 p-3">
								{filteredOrders.map((order) => (
									<OrderCard key={order._id} order={order} />
								))}
							</div>
						</ScrollArea>
					)}
				</div>

				{/* Total Footer */}
				<div className="shrink-0 border-t bg-card p-4">
					<div className="mb-2 flex items-center justify-between">
						<span className="text-muted-foreground text-sm">
							{paidOrdersCount} transaksi selesai
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="font-semibold text-foreground">Total Penjualan</span>
						<span className="font-bold text-primary text-xl">
							{formatCurrency(totalAmount)}
						</span>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function OrderCard({ order }: { order: Doc<"orders"> }) {
	const statusColors: Record<string, string> = {
		pending: "bg-accent text-accent-foreground",
		paid: "bg-primary text-primary-foreground",
		completed: "bg-primary text-primary-foreground",
		cancelled: "bg-destructive text-destructive-foreground",
	};

	const statusLabels: Record<string, string> = {
		pending: "Pending",
		paid: "Lunas",
		completed: "Selesai",
		cancelled: "Batal",
	};

	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="mb-2 flex items-start justify-between">
				<div>
					<p className="font-medium text-sm">
						#{order.orderNumber}
					</p>
					<p className="text-muted-foreground text-xs">
						{formatDate(order.createdAt)} - {formatTime(order.createdAt)}
					</p>
				</div>
				<span
					className={`rounded-full px-2 py-0.5 font-medium text-[10px] ${
						statusColors[order.status] || "bg-muted"
					}`}
				>
					{statusLabels[order.status] || order.status}
				</span>
			</div>

			<div className="mb-2 space-y-1">
				{order.items.slice(0, 3).map((item, idx) => (
					<div
						className="flex items-center justify-between text-xs"
						key={`${item.productId}-${idx}`}
					>
						<span className="text-muted-foreground">
							{item.quantity}x {item.productName}
						</span>
						<span>{formatCurrency(item.price * item.quantity)}</span>
					</div>
				))}
				{order.items.length > 3 && (
					<p className="text-muted-foreground text-xs">
						+{order.items.length - 3} item lainnya
					</p>
				)}
			</div>

			<div className="flex items-center justify-between border-t pt-2">
				<span className="text-muted-foreground text-xs">
					{order.paymentMethod}
				</span>
				<span className="font-bold text-sm">
					{formatCurrency(order.totalAmount)}
				</span>
			</div>
		</div>
	);
}
