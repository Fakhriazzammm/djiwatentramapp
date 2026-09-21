import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
import {
	Calendar,
	Check,
	ChevronLeft,
	ChevronRight,
	Link as LinkIcon,
	List,
	Loader2,
	Save,
	Search,
	Settings2,
	Smartphone,
	Trash2,
	Users,
	X,
	Pencil,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookingTimelineSummary } from "@yumipos/web-shared/booking/timeline";
import { fetchBookingTimeline } from "@/lib/api-helper";
import { Skeleton } from "@/components/ui/skeleton";
import { 
	ArrowUpDown, 
	Calendar as CalendarIcon,
	Plus
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHybridAllProducts } from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridBookingDateCapacities,
	useHybridBookingMonthSummary,
	useHybridBookingOrdersState,
	useHybridBookingSettings,
} from "@/hooks/use-hybrid-booking-data";
import {
	useHybridCreateBookingOrder,
	useHybridDeleteBookingDateCapacity,
	useHybridDeleteBookingOrder,
	useHybridPatchBookingOrder,
	useHybridSetBookingBulkDateCapacity,
	useHybridSetBookingDateCapacity,
	useHybridUpdateBookingSettings,
	useHybridUpdateBookingStatus,
} from "@/hooks/use-hybrid-write-actions";

export const Route = createLazyFileRoute("/admin/booking")({
	component: BookingSettingsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"Januari","Februari","Maret","April","Mei","Juni",
	"Juli","Agustus","September","Oktober","November","Desember",
];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function formatDate(dateStr: string) {
	const [y, m, d] = dateStr.split("-").map(Number);
	return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function toDateInput(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayStr() {
	return toDateInput(new Date());
}

function getRangeDates(range: string): { start: string; end: string } {
	const now = new Date();
	let start = new Date();
	let end = new Date();

	switch (range) {
		case "today":
			break;
		case "tomorrow":
			start.setDate(now.getDate() + 1);
			end.setDate(now.getDate() + 1);
			break;
		case "yesterday":
			start.setDate(now.getDate() - 1);
			end.setDate(now.getDate() - 1);
			break;
		case "this_week": {
			const day = now.getDay();
			const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
			start = new Date(now.setDate(diff));
			end = new Date(start);
			end.setDate(start.getDate() + 6);
			break;
		}
		case "last_week": {
			const day = now.getDay();
			const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
			start = new Date(now.setDate(diff));
			end = new Date(start);
			end.setDate(start.getDate() + 6);
			break;
		}
		case "this_month":
			start = new Date(now.getFullYear(), now.getMonth(), 1);
			end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			break;
		case "last_month":
			start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			end = new Date(now.getFullYear(), now.getMonth(), 0);
			break;
		case "this_year":
			start = new Date(now.getFullYear(), 0, 1);
			end = new Date(now.getFullYear(), 11, 31);
			break;
		case "ytd":
			start = new Date(now.getFullYear(), 0, 1);
			end = new Date();
			break;
	}

	return {
		start: start.toISOString().split("T")[0],
		end: end.toISOString().split("T")[0],
	};
}

const STATUS_LABEL: Record<string, string> = {
	pending: "Menunggu",
	confirmed: "Dikonfirmasi",
	arrived: "Tiba",
	seated: "Duduk",
	cancelled: "Dibatalkan",
	completed: "Selesai",
	no_show: "No-show",
	expired: "Expired",
};
const PAY_LABEL: Record<string, string> = {
	pending: "Belum Bayar",
	paid: "Lunas",
	cancelled: "Batal",
};
const STATUS_COLOR: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-700",
	confirmed: "bg-blue-100 text-blue-700",
	arrived: "bg-cyan-100 text-cyan-700",
	seated: "bg-indigo-100 text-indigo-700",
	cancelled: "bg-red-100 text-red-700",
	completed: "bg-green-100 text-green-700",
	no_show: "bg-slate-100 text-slate-700",
	expired: "bg-slate-100 text-slate-500",
};
const PAY_COLOR: Record<string, string> = {
	pending: "bg-orange-100 text-orange-700",
	paid: "bg-green-100 text-green-700",
	cancelled: "bg-red-100 text-red-700",
};

// ─── Mini Calendar (admin view) ───────────────────────────────────────────────

function AdminCalendar({
	year,
	month,
	summary,
	onNavigate,
	onDayClick,
	selectedDate,
	onAddBooking,
}: {
	year: number;
	month: number;
	summary: Record<string, { 
		count: number; 
		maxPeople: number; 
		maxTables: number; 
		bookedPeople: number; 
		bookedTables: number; 
		pending: number; 
		confirmed: number;
		isClosed: boolean;
	}>;
	onNavigate: (y: number, m: number) => void;
	onDayClick: (date: string) => void;
	selectedDate: string | null;
	onAddBooking: () => void;
}) {
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const firstDay = new Date(year, month, 1).getDay();
	const today = todayStr();

	const prevMonth = () => {
		if (month === 0) onNavigate(year - 1, 11);
		else onNavigate(year, month - 1);
	};
	const nextMonth = () => {
		if (month === 11) onNavigate(year + 1, 0);
		else onNavigate(year, month + 1);
	};

	return (
		<div className="rounded-[20px] border border-border bg-card shadow-sm overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-5 py-3">
				<button
					className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
					onClick={prevMonth}
					type="button"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<div className="flex items-center gap-2">
					<span className="font-bold text-foreground">{MONTH_NAMES[month]} {year}</span>
					<button className="min-h-9 rounded-lg bg-muted px-2.5 text-[11px] font-bold text-muted-foreground hover:bg-muted/80" onClick={() => { const now = new Date(); onNavigate(now.getFullYear(), now.getMonth()); onDayClick(todayStr()); }} type="button">Hari ini</button>
					<button className="flex min-h-9 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-bold text-primary-foreground" onClick={onAddBooking} type="button"><Plus className="h-3 w-3" />Tambah</button>
				</div>
				<button
					className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
					onClick={nextMonth}
					type="button"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>

			{/* Day headers */}
			<div className="grid grid-cols-7 border-b border-border">
				{DAY_NAMES.map((d) => (
					<div
						className="py-2 text-center font-bold text-muted-foreground text-[11px]"
						key={d}
					>
						{d}
					</div>
				))}
			</div>

			{/* Day cells */}
			<div className="grid grid-cols-7">
				{Array.from({ length: firstDay }).map((_, i) => (
					<div className="border-b border-r border-border/50 min-h-[64px]" key={`blank-${i}`} />
				))}
				{Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
					const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
					const info = summary[dateStr];
					const isSelected = selectedDate === dateStr;
					const isToday = dateStr === today;
					const isFull = info?.isClosed || (info && (
						(info.maxPeople > 0 && info.bookedPeople >= info.maxPeople) ||
						(info.maxTables > 0 && info.bookedTables >= info.maxTables)
					));

					return (
						<button
							className={`min-h-[64px] border-b border-r border-border/50 p-1.5 text-left transition-all hover:bg-muted/50 ${
								isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""
							} ${isToday ? "font-bold" : ""}`}
							key={day}
							onClick={() => onDayClick(dateStr)}
							type="button"
						>
							<span
								className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
									isToday
										? "bg-primary text-primary-foreground"
										: "text-foreground"
								}`}
							>
								{day}
							</span>
							{info && info.count > 0 && (
								<div className="mt-1 space-y-0.5">
									<div
										className={`rounded px-1 text-[11px] font-bold leading-tight ${
											info.maxPeople > 0 && info.bookedPeople >= info.maxPeople
												? "bg-red-100 text-red-700"
												: "bg-primary/10 text-primary"
										}`}
									>
										{info.bookedPeople}{info.maxPeople > 0 ? `/${info.maxPeople}` : ""} tamu
									</div>
									<div
										className={`rounded px-1 text-[11px] font-bold leading-tight ${
											info.maxTables > 0 && info.bookedTables >= info.maxTables
												? "bg-purple-100 text-purple-700"
												: "bg-purple-50 text-purple-600"
										}`}
									>
										{info.bookedTables}{info.maxTables > 0 ? `/${info.maxTables}` : ""} meja
									</div>
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ─── Order Row ────────────────────────────────────────────────────────────────

function OrderRow({
	order,
	onUpdateStatus,
	onEdit,
	onDelete,
}: {
	order: {
		_id: Id<"bookingOrders">;
		bookingCode: string;
		customerName: string;
		customerPhone: string;
		customerEmail: string;
		bookingDate: string;
		arrivalTime?: string | null;
		totalAmount: number;
		paymentMethod: string;
		paymentStatus: string;
		bookingStatus: string;
		notes?: string;
		items: { name: string; quantity: number; price: number }[];
		paymentProofImage?: string;
		transferredAmount?: number;
		createdAt: number;
	};
	onUpdateStatus: (
		id: Id<"bookingOrders">,
		bookingStatus?: string,
		paymentStatus?: string
	) => void;
	onEdit: (order: any) => void;
	onDelete: (id: Id<"bookingOrders">, paymentStatus?: string) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [timelineState, setTimelineState] = useState<{ loading: boolean; timeline: any[]; deliveries: any[] }>({ loading: false, timeline: [], deliveries: [] });

	useEffect(() => {
		if (!expanded || timelineState.timeline.length > 0 || timelineState.deliveries.length > 0) return;
		let active = true;
		setTimelineState((prev) => ({ ...prev, loading: true }));
		void fetchBookingTimeline<{ timeline?: any[]; deliveries?: any[] }>(String(order._id))
			.then((result) => { if (active) setTimelineState({ loading: false, timeline: result.timeline ?? [], deliveries: result.deliveries ?? [] }); })
			.catch(() => { if (active) setTimelineState((prev) => ({ ...prev, loading: false })); });
		return () => { active = false; };
	}, [expanded, order._id, timelineState.timeline.length, timelineState.deliveries.length]);

	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div
				className="flex flex-col gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors sm:flex-row sm:items-center"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-2 min-w-0">
					<span className="font-bold text-xs text-primary font-mono shrink-0">
						#{order.bookingCode}
					</span>
					<span className="truncate font-bold text-sm">{order.customerName}</span>
				</div>

				<div className="flex flex-wrap items-center gap-1.5 sm:ml-auto shrink-0">
					<span className="text-muted-foreground text-xs">{formatDate(order.bookingDate)}</span>{order.arrivalTime && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">Tiba {order.arrivalTime}</span>}
					<span
						className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[order.bookingStatus]}`}
					>
						{STATUS_LABEL[order.bookingStatus]}
					</span>
					<span
						className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PAY_COLOR[order.paymentStatus]}`}
					>
						{PAY_LABEL[order.paymentStatus]}
					</span>
					<span className="font-bold text-xs">
						Rp {Number(order.totalAmount ?? 0).toLocaleString("id-ID")}
					</span>
					
					{/* Display custom answers in the collapsed row for quick viewing */}
					{(order as any).customAnswers && (
						<div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l border-border/50">
							{Object.entries((order as any).customAnswers)
								.filter(([, answer]) => answer != null && String(answer).trim() !== "")
								.slice(0, 2)
								.map(([label, answer]: [string, any]) => (
								<span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md font-medium max-w-[100px] truncate" key={label} title={`${label}: ${String(answer)}`}>
									<span className="text-muted-foreground mr-1">{label}:</span>
									{String(answer)}
								</span>
								))}
							{Object.entries((order as any).customAnswers).filter(([, answer]) => answer != null && String(answer).trim() !== "").length > 2 && (
								<span className="text-[10px] text-muted-foreground italic">+{Object.entries((order as any).customAnswers).filter(([, answer]) => answer != null && String(answer).trim() !== "").length - 2} lagi</span>
							)}
						</div>
					)}
					
					<div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
						<button
							className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
							onClick={() => onEdit(order)}
							title="Edit Booking"
						>
							<Pencil className="h-3.5 w-3.5" />
						</button>
						<button
							className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
							onClick={() => onDelete(order._id, order.paymentStatus)}
							title={order.paymentStatus === "paid" ? "Batalkan Booking" : "Hapus Booking"}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			</div>

			{expanded && (
				<div className="border-t border-border bg-muted/20 p-4 space-y-4">
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div>
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Telepon</p>
							<p className="text-sm font-medium">{order.customerPhone}</p>
						</div>
						<div>
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</p>
							<p className="text-sm font-medium break-all">{order.customerEmail}</p>
						</div>
						<div>
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pembayaran</p>
							<p className="text-sm font-medium capitalize">{order.paymentMethod.replace("_", " ")}</p>
						</div>
						{order.notes && (
							<div className="col-span-full">
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Catatan</p>
								<p className="text-sm">{order.notes}</p>
							</div>
						)}
						{order.transferredAmount != null && (
							<div>
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Nominal Ditransfer</p>
								<p className="text-sm font-bold text-emerald-600">
									Rp {Number(order.transferredAmount ?? 0).toLocaleString("id-ID")}
								</p>
							</div>
						)}
						{(order as any).customAnswers && (
							<div className="col-span-full border-t border-border pt-3 mt-1 space-y-3">
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Informasi Tambahan</p>
								<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
									{Object.entries((order as any).customAnswers)
										.filter(([, answer]) => answer != null && String(answer).trim() !== "")
										.map(([label, answer]: [string, any]) => (
											<div key={label}>
												<p className="text-[10px] font-bold text-muted-foreground">{label}</p>
												<p className="text-sm font-medium">{String(answer)}</p>
											</div>
										))}
								</div>
							</div>
						)}
					</div>

					{order.paymentProofImage && (
						<div className="space-y-2">
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bukti Pembayaran</p>
							<div className="relative h-48 w-48 overflow-hidden rounded-xl border border-border bg-white shadow-sm hover:h-auto hover:w-full max-w-sm transition-all cursor-zoom-in">
								<img
									alt="Proof"
									className="h-full w-full object-contain"
									src={order.paymentProofImage}
								/>
							</div>
						</div>
					)}

					<div>
						<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Item Pesanan</p>
						<div className="space-y-1">
							{order.items.map((item, i) => (
								<div className="flex justify-between text-sm" key={i}>
									<span>{item.name} ×{item.quantity}</span>
									<span className="font-medium">Rp {(Number(item.price ?? 0) * Number(item.quantity ?? 0)).toLocaleString("id-ID")}</span>
								</div>
							))}
						</div>
					</div>

					<BookingTimelineSummary
						deliveries={timelineState.deliveries}
						loading={timelineState.loading}
						timeline={timelineState.timeline}
					/>

					<div className="flex flex-wrap gap-2 pt-2 border-t border-border">
						<span className="text-[10px] font-bold text-muted-foreground self-center">Ubah Status:</span>
						{order.bookingStatus === "pending" && (
							<button
								className="rounded-lg bg-blue-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "confirmed")}
								type="button"
							>
								<Check className="inline h-3 w-3 mr-1" />Konfirmasi
							</button>
						)}
						{order.bookingStatus === "confirmed" && (
							<button
								className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "arrived")}
								type="button"
							>
								Tandai Tiba
							</button>
						)}
						{order.bookingStatus === "arrived" && (
							<button
								className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "seated")}
								type="button"
							>
								Tandai Duduk
							</button>
						)}
						{order.bookingStatus === "seated" && (
							<button
								className="rounded-lg bg-green-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "completed")}
								type="button"
							>
								Selesaikan
							</button>
						)}
						{order.bookingStatus !== "cancelled" && (
							<button
								className="rounded-lg bg-red-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "cancelled")}
								type="button"
							>
								<X className="inline h-3 w-3 mr-1" />Batalkan
							</button>
						)}
						{order.paymentStatus !== "paid" && (
							<button
								className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, undefined, "paid")}
								type="button"
							>
								Tandai Lunas & Verifikasi
							</button>
						)}
					</div>

					<p className="text-muted-foreground text-[10px]">
						Dipesan: {new Date(order.createdAt).toLocaleString("id-ID")}
					</p>
				</div>
			)}
		</div>
	);
}

// ─── Main Component ────────────────────────────────────────────────────────────

function BookingSettingsPage() {
	const settings = useHybridBookingSettings("booking");
	const updateSettings = useHybridUpdateBookingSettings();
	const allProducts = useHybridAllProducts();

	const updateBookingStatus = useHybridUpdateBookingStatus();
	const patchBookingOrder = useHybridPatchBookingOrder();
	const deleteBookingOrder = useHybridDeleteBookingOrder();
	const setDateCapacity = useHybridSetBookingDateCapacity();
	const deleteDateCapacity = useHybridDeleteBookingDateCapacity();
	const setBulkDateCapacity = useHybridSetBookingBulkDateCapacity();
	const dateCapacities = useHybridBookingDateCapacities("booking");

	const capacitySectionRef = useRef<HTMLDivElement>(null);

	const today = new Date();
	const [calYear, setCalYear] = useState(today.getFullYear());
	const [calMonth, setCalMonth] = useState(today.getMonth());
	const [selectedDate, setSelectedDate] = useState<string | null>(todayStr());
	const [listFilter, setListFilter] = useState<"all" | "pending" | "confirmed" | "arrived" | "seated" | "completed" | "cancelled">("all");
	const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");

	// Edit dialog state
	const [editingOrder, setEditingOrder] = useState<any>(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isPatching, setIsPatching] = useState(false);
	const [editFormData, setEditFormData] = useState<any>({});

	// Search, Sort, Filter State
	const [searchTerm, setSearchTerm] = useState("");
	const [sortBy, setBy] = useState<"date" | "name" | "amount">("date");
	const [sortOrder, setOrder] = useState<"asc" | "desc">("desc");
	
	// Default to Today for Daftar Booking
	const [startDate, setStartDate] = useState(todayStr());
	const [endDate, setEndDate] = useState(todayStr());
	const [selectedRange, setSelectedRange] = useState("today");

	// Settings form
	const [formData, setFormData] = useState({
		slug: "booking",
		title: "",
		description: "",
		logoUrl: "",
		bannerUrl: "",
		themeColor: "#1a5dc6",
		featuredProductIds: [] as string[],
		customFields: [] as any[],
		bookingWindowDays: 90,
		defaultMaxPeople: 100,
		defaultMaxTables: 25,
		defaultPeoplePerTable: 4,
		isActive: true,
	});
	const [activeTab, setActiveTab] = useState<
		"calendar" | "orders" | "capacity" | "general" | "products" | "form"
	>(() => {
		if (typeof window !== "undefined") {
			const tab = new URLSearchParams(window.location.search).get("tab");
			if (tab === "orders" || tab === "calendar" || tab === "capacity") return tab;
		}
		return "calendar";
	});
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		const tab = new URLSearchParams(window.location.search).get("tab");
		if (tab === "orders" || tab === "calendar" || tab === "capacity") setActiveTab(tab);
	}, []);

	const handleTabChange = (tab: "calendar" | "orders" | "capacity") => {
		setActiveTab(tab);
		const url = new URL(window.location.href);
		if (tab === "calendar") url.searchParams.delete("tab");
		else url.searchParams.set("tab", tab);
		window.history.replaceState({}, "", url);
	};

	const yearMonth = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
	const summary = useHybridBookingMonthSummary("booking", yearMonth);

	const ordersState = useHybridBookingOrdersState({
		slug: "booking",
		date: selectedDate ?? undefined,
		startDate: activeTab === "orders" ? startDate : undefined,
		endDate: activeTab === "orders" ? endDate : undefined,
	});
	const allOrders = ordersState.data;


	// Capacity form
	const [capDate, setCapDate] = useState(todayStr());
	const [capEndDate, setCapEndDate] = useState(todayStr());
	const [isBulk, setIsBulk] = useState(false);
	const [capPeople, setCapPeople] = useState("0");
	const [capTables, setCapTables] = useState("0");
	const [capPeoplePerTable, setCapPeoplePerTable] = useState("4");
	const [capNotes, setCapNotes] = useState("");
	const [capIsClosed, setCapIsClosed] = useState(false);
	const [isSavingCap, setIsSavingCap] = useState(false);
	const [selectedCapacityIds, setSelectedCapacityIds] = useState<string[]>([]);
	const [isDeletingCapacity, setIsDeletingCapacity] = useState(false);



	useEffect(() => {
		if (settings) {
			setFormData({
				slug: settings.slug,
				title: settings.title,
				description: settings.description || "",
				logoUrl: settings.logoUrl || "",
				bannerUrl: settings.bannerUrl || "",
				themeColor: settings.themeColor || "#1a2332",
				featuredProductIds: settings.featuredProductIds || [],
				customFields: settings.customFields || [],
				bookingWindowDays: Number(settings.bookingWindowDays ?? 90),
				defaultMaxPeople: Number(settings.defaultMaxPeople ?? 100),
				defaultMaxTables: Number(settings.defaultMaxTables ?? 25),
				defaultPeoplePerTable: Number(settings.defaultPeoplePerTable ?? 4),
				isActive: settings.isActive,
			});
		}
	}, [settings]);

	const handleSave = async () => {
		const fields = formData.customFields ?? [];
		const labels = fields.map((field: any) => String(field.label ?? "").trim().toLowerCase()).filter(Boolean);
		const hasInvalidField = labels.length !== fields.length
			|| new Set(labels).size !== labels.length
			|| fields.some((field: any) => {
				if (field.type !== "dropdown") return false;
				const options = (field.options ?? []).map((option: string) => option.trim()).filter(Boolean);
				return options.length < 2 || new Set(options.map((option: string) => option.toLowerCase())).size !== options.length;
			});
		if (hasInvalidField) {
			toast.error("Periksa field formulir: label wajib unik dan dropdown minimal memiliki 2 opsi unik.");
			return;
		}
		try {
			setIsSaving(true);
			await updateSettings(formData);
			toast.success("Pengaturan disimpan!");
		} catch (error) {
			console.error("[booking-admin] gagal menyimpan pengaturan", error);
			const message = error instanceof Error ? error.message : "Gagal menyimpan pengaturan";
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	};

	const handleUpdateStatus = async (
		id: Id<"bookingOrders">,
		bookingStatus?: string,
		paymentStatus?: string
	) => {
		try {
			await updateBookingStatus({
				id,
				bookingStatus: bookingStatus as any,
				paymentStatus: paymentStatus as any,
			});
			toast.success("Status diperbarui"); triggerHybridRefresh();
		} catch {
			toast.error("Gagal memperbarui status");
		}
	};

	const handleDeleteBooking = async (id: Id<"bookingOrders">, paymentStatus?: string) => {
		if (paymentStatus === "paid") {
			if (!confirm("Booking sudah lunas. Booking akan dibatalkan dan tetap disimpan sebagai histori. Lanjutkan?")) return;
			const tid = toast.loading("Membatalkan booking...");
			try {
				await updateBookingStatus({ id, bookingStatus: "cancelled" as any });
				toast.success("Booking dibatalkan dan histori tetap tersimpan", { id: tid });
				triggerHybridRefresh();
			} catch {
				toast.error("Gagal membatalkan booking", { id: tid });
			}
			return;
		}
		if (!confirm("Apakah Anda yakin ingin menghapus booking ini? Tindakan ini tidak dapat dibatalkan.")) return;
		
		const tid = toast.loading("Menghapus booking...");
		try {
			await deleteBookingOrder({ id });
			toast.success("Booking berhasil dihapus", { id: tid }); triggerHybridRefresh();
		} catch {
			toast.error("Gagal menghapus booking", { id: tid });
		}
	};

	const handleEditBooking = (order: any) => {
		setEditingOrder(order);
		setEditFormData({
			customerName: order.customerName,
			customerPhone: order.customerPhone,
			customerEmail: order.customerEmail,
			bookingDate: order.bookingDate,
			arrivalTime: order.arrivalTime || "12:00",
			guestCount: order.guestCount,
			totalAmount: order.totalAmount,
			notes: order.notes || "",
		});
		setIsEditDialogOpen(true);
	};

	const handleSaveEdit = async () => {
		if (!editingOrder) return;
		
		setIsPatching(true);
		const tid = toast.loading("Menyimpan perubahan...");
		try {
			await patchBookingOrder({
				id: editingOrder._id,
				...editFormData,
				guestCount: Number(editFormData.guestCount),
				totalAmount: Number(editFormData.totalAmount),
			});
			toast.success("Booking berhasil diperbarui", { id: tid }); triggerHybridRefresh();
			setIsEditDialogOpen(false);
		} catch {
			toast.error("Gagal memperbarui booking", { id: tid });
		} finally {
			setIsPatching(false);
		}
	};

	const handleSaveCapacity = async () => {
		if (!capDate || (isBulk && !capEndDate)) {
			toast.error("Isi tanggal");
			return;
		}
		if (!isBulk) {
			const usage = summary?.[capDate];
			if (usage && Number(capPeople) > 0 && Number(usage.bookedPeople ?? 0) > Number(capPeople)) {
				toast.error(`Kapasitas tamu tidak boleh lebih kecil dari ${usage.bookedPeople} tamu yang sudah booking`);
				return;
			}
			if (usage && Number(capTables) > 0 && Number(usage.bookedTables ?? 0) > Number(capTables)) {
				toast.error(`Kapasitas meja tidak boleh lebih kecil dari ${usage.bookedTables} meja yang sudah booking`);
				return;
			}
		}
		setIsSavingCap(true);
		try {
			if (isBulk) {
				await setBulkDateCapacity({
					slug: "booking",
					startDate: capDate,
					endDate: capEndDate,
					maxPeople: Number(capPeople),
					maxTables: Number(capTables),
					peoplePerTable: Number(capPeoplePerTable),
					isClosed: capIsClosed,
					notes: capNotes || undefined,
				});
				toast.success(
					`Kapasitas periode ${formatDate(capDate)} - ${formatDate(capEndDate)} disimpan`
				);
			} else {
				await setDateCapacity({
					slug: "booking",
					date: capDate,
					maxPeople: Number(capPeople),
					maxTables: Number(capTables),
					peoplePerTable: Number(capPeoplePerTable),
					isClosed: capIsClosed,
					notes: capNotes || undefined,
				});
				toast.success(`Kapasitas untuk ${formatDate(capDate)} disimpan`);
			}
			setCapNotes("");
		} catch {
			toast.error("Gagal menyimpan kapasitas");
		} finally {
			setIsSavingCap(false);
		}
	};

	const handleBulkDeleteCapacity = async () => {
		if (selectedCapacityIds.length === 0 || isDeletingCapacity) return;
		if (!confirm(`Hapus ${selectedCapacityIds.length} pengaturan kapasitas terpilih? Tanggal akan kembali memakai kapasitas default.`)) return;
		setIsDeletingCapacity(true);
		const tid = toast.loading(`Menghapus ${selectedCapacityIds.length} kapasitas...`);
		try {
			for (const id of selectedCapacityIds) await deleteDateCapacity({ id, slug: "booking" });
			setSelectedCapacityIds([]);
			triggerHybridRefresh();
			toast.success("Kapasitas terpilih berhasil dihapus", { id: tid });
		} catch {
			toast.error("Sebagian kapasitas gagal dihapus", { id: tid });
		} finally {
			setIsDeletingCapacity(false);
		}
	};

	// Create dialog state
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const createBookingOrder = useHybridCreateBookingOrder();
	const [createFormData, setCreateFormData] = useState({
		customerName: "",
		customerPhone: "",
		customerEmail: "",
		bookingDate: todayStr(),
		arrivalTime: "12:00",
		guestCount: "2",
		itemProductId: "",
		itemQuantity: "1",
		totalAmount: "0",
		paymentMethod: "CASH",
		notes: "",
	});

	const handleCreateBooking = async () => {
		if (!createFormData.customerName || !createFormData.customerPhone) {
			toast.error("Nama dan WhatsApp wajib diisi");
			return;
		}

		setIsCreating(true);
		const selectedProduct = (allProducts ?? []).find((product: any) => String(product._id) === createFormData.itemProductId);
		const itemQuantity = Math.max(1, Number(createFormData.itemQuantity || 1));
		const selectedProductPrice = Number(selectedProduct?.price ?? 0);
		const totalAmount = selectedProduct ? selectedProductPrice * itemQuantity : Math.max(0, Number(createFormData.totalAmount || 0));
		const items = selectedProduct
			? [{ productId: String(selectedProduct._id), name: selectedProduct.name, price: selectedProductPrice, quantity: itemQuantity }]
			: [];
		const tid = toast.loading("Menambahkan booking...");
		try {
			await createBookingOrder({
				slug: "booking",
				customerName: createFormData.customerName,
				customerPhone: createFormData.customerPhone,
				customerEmail: createFormData.customerEmail,
				bookingDate: createFormData.bookingDate,
				arrivalTime: createFormData.arrivalTime,
				guestCount: Number(createFormData.guestCount),
				totalAmount,
				paymentMethod: createFormData.paymentMethod,
				notes: createFormData.notes || undefined,
				items,
				customAnswers: {
					"Jam kedatangan": createFormData.arrivalTime,
					"Tipe booking": "group_meal",
				},
			});
			toast.success("Booking berhasil ditambahkan", { id: tid }); triggerHybridRefresh();
			setIsCreateDialogOpen(false);
			setCreateFormData({
				customerName: "",
				customerPhone: "",
				customerEmail: "",
				bookingDate: todayStr(),
				arrivalTime: "12:00",
				guestCount: "2",
				itemProductId: "",
				itemQuantity: "1",
				totalAmount: "0",
				paymentMethod: "CASH",
				notes: "",
			});
		} catch (error: any) {
			toast.error(error.message || "Gagal menambahkan booking", { id: tid });
		} finally {
			setIsCreating(false);
		}
	};

	const tabs = [
		{ id: "calendar", label: "Kalender", icon: Calendar },
		{ id: "orders", label: "Booking", icon: List },
		{ id: "capacity", label: "Kapasitas", icon: Users },
	] as const;

	const filteredOrders = useMemo(() => {
		if (!allOrders) return [];
		
		return allOrders
			.filter((o: any) => {
				const matchesFilter = listFilter === "all" || o.bookingStatus === listFilter;
				const matchesPayment = paymentFilter === "all" || (paymentFilter === "paid" ? o.paymentStatus === "paid" : o.paymentStatus !== "paid");
				const matchesSearch = 
					o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
					o.bookingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
					o.customerPhone.includes(searchTerm);
				
				return matchesFilter && matchesPayment && matchesSearch;
			})
			.sort((a: any, b: any) => {
				let comparison = 0;
				if (sortBy === "date") {
					comparison = a.bookingDate.localeCompare(b.bookingDate);
				} else if (sortBy === "name") {
					comparison = a.customerName.localeCompare(b.customerName);
				} else if (sortBy === "amount") {
					comparison = a.totalAmount - b.totalAmount;
				}
				return sortOrder === "asc" ? comparison : -comparison;
			});
	}, [allOrders, listFilter, paymentFilter, searchTerm, sortBy, sortOrder]);

	const bookingStats = useMemo(() => {
		const orders = allOrders ?? [];
		return {
			total: orders.length,
			guests: orders.reduce((sum: number, order: any) => sum + Number(order.guestCount ?? 0), 0),
			pendingPayment: orders.filter((order: any) => order.paymentStatus !== "paid").length,
			paid: orders.filter((order: any) => order.paymentStatus === "paid").length,
			confirmed: orders.filter((order: any) => order.bookingStatus === "confirmed").length,
			arrived: orders.filter((order: any) => order.bookingStatus === "arrived" || order.bookingStatus === "seated").length,
			completed: orders.filter((order: any) => order.bookingStatus === "completed").length,
			cancelled: orders.filter((order: any) => order.bookingStatus === "cancelled" || order.bookingStatus === "no_show").length,
		};
	}, [allOrders]);

	const capacityRows = dateCapacities ?? [];
	const allCapacitySelected = capacityRows.length > 0 && capacityRows.every((cap: any) => selectedCapacityIds.includes(String(cap._id)));

	return (
		<div className="mx-auto max-w-6xl space-y-4 pb-8 md:space-y-5">
			{/* Header */}
			<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Workspace operasional</p>
					<h2 className="font-display text-2xl font-black tracking-tight text-foreground md:text-3xl">
						Manajemen Booking
					</h2>
					<p className="mt-1 max-w-xl text-sm text-muted-foreground">
						Kelola reservasi, kapasitas, dan status customer dari satu tempat.
					</p>
				</div>
				<div className="flex gap-2">
					<a
						className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 font-medium text-foreground text-sm hover:bg-muted transition-colors"
						href={(import.meta.env.VITE_PUBLIC_BOOKING_URL as string | undefined)?.trim() || "https://booking.yumme.id/"}
						rel="noreferrer"
						target="_blank"
					>
						<LinkIcon className="h-4 w-4" /> Lihat Halaman Publik
					</a>
					{activeTab === "capacity" && (
						<button
							className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-foreground text-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
							disabled={isSaving}
							onClick={handleSave}
							type="button"
						>
							{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
							{isSaving ? "Menyimpan..." : "Simpan"}
						</button>
					)}
				</div>
			</div>

			{/* Primary navigation */}
			<nav aria-label="Navigasi booking" className="no-scrollbar flex gap-1 overflow-x-auto rounded-[20px] border border-border/70 bg-card p-1 shadow-sm">
				{tabs.map((tab) => (
					<button
						className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-black transition-all md:flex-1 md:justify-center md:px-4 md:text-sm ${
							activeTab === tab.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
						}`}
						key={tab.id}
						onClick={() => handleTabChange(tab.id)}
						type="button"
					>
						<tab.icon className="h-4 w-4" />
						{tab.label}
					</button>
				))}
			</nav>

			{(activeTab === "calendar" || activeTab === "orders") && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
					{[
						["Booking", bookingStats.total, "text-foreground"],
						["Tamu", bookingStats.guests, "text-emerald-700"],
						["Belum lunas", bookingStats.pendingPayment, "text-amber-700"],
						["Lunas", bookingStats.paid, "text-primary"],
						["Confirmed", bookingStats.confirmed, "text-blue-700"],
						["Tiba", bookingStats.arrived, "text-cyan-700"],
						["Selesai", bookingStats.completed, "text-green-700"],
						["Batal", bookingStats.cancelled, "text-red-700"],
					].map(([label, value, tone]) => (
						<div className="rounded-[20px] border border-border/70 bg-card px-3 py-3 shadow-sm" key={label}>
							<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
							<p className={`mt-1 text-xl font-black tabular-nums ${tone}`}>{value}</p>
						</div>
					))}
				</div>
			)}

			{/* ── CALENDAR TAB ── */}
			{activeTab === "calendar" && (
				<div className="space-y-4 md:grid md:grid-cols-[1.1fr_0.9fr] md:items-start md:gap-4 md:space-y-0">
					<AdminCalendar
						month={calMonth}
						onDayClick={(date) => {
							setSelectedDate(date === selectedDate ? null : date);
						}}
						onNavigate={(y, m) => {
							setCalYear(y);
							setCalMonth(m);
						}}
						selectedDate={selectedDate}
						onAddBooking={() => setIsCreateDialogOpen(true)}
						summary={summary ?? {}}
						year={calYear}
					/>

					{selectedDate && (
						<div className="space-y-3 md:sticky md:top-4">
							<div className="flex items-center justify-between">
								<h3 className="font-bold text-foreground">
									Booking — {formatDate(selectedDate)}
								</h3>
								<button
									className="text-muted-foreground text-xs hover:text-foreground"
									onClick={() => setSelectedDate(null)}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
							{ordersState.status === "loading" ? (
								<div className="flex justify-center py-8">
									<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
								</div>
							) : ordersState.status === "error" ? (
								<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
									<p className="font-semibold">Gagal memuat booking.</p>
									<p className="mt-1">{ordersState.error?.message || "Periksa koneksi lalu coba lagi."}</p>
									<button className="mt-3 rounded-lg bg-red-600 px-3 py-2 font-semibold text-white" onClick={() => void ordersState.reload()} type="button">Coba lagi</button>
								</div>
							) : (allOrders ?? []).length === 0 ? (
								<div className="rounded-xl border border-border bg-card py-10 text-center text-muted-foreground text-sm">
									Belum ada booking pada tanggal ini.
								</div>
							) : (
								<div className="space-y-2">
									{(allOrders ?? []).map((order: any) => (
										<OrderRow
											key={order._id}
											order={order}
											onUpdateStatus={handleUpdateStatus}
											onEdit={handleEditBooking}
											onDelete={handleDeleteBooking}
										/>
									))}
								</div>
							)}
						</div>
					)}

					{!selectedDate && (
						<div className="rounded-[20px] border border-border bg-card p-4">
							<div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-foreground">Ringkasan booking</p><p className="mt-1 text-xs text-muted-foreground">Pilih tanggal untuk melihat detail operasional.</p></div><Button className="min-h-11 shrink-0 rounded-xl" onClick={() => setIsCreateDialogOpen(true)} size="sm" type="button"><Plus className="mr-1.5 h-4 w-4" />Tambah</Button></div>
							<div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Booking</p><p className="mt-1 text-lg font-black">{bookingStats.total}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Tamu</p><p className="mt-1 text-lg font-black">{bookingStats.guests}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Lunas</p><p className="mt-1 text-lg font-black">{bookingStats.paid}</p></div></div>
						</div>
					)}
				</div>
			)}

			{/* ── ORDERS TAB ── */}
			{activeTab === "orders" && (
				<div className="space-y-4">
					<div className="flex items-end justify-between gap-3">
						<div><p className="text-sm font-bold text-foreground">Daftar Booking</p><p className="text-xs text-muted-foreground">{formatDate(startDate)}{startDate !== endDate ? ` – ${formatDate(endDate)}` : ""}</p></div>
					</div>
					{/* Toolbar */}
					<div className="grid gap-3 rounded-[20px] border border-border/70 bg-card p-3 shadow-sm lg:grid-cols-[minmax(220px,1.5fr)_140px_260px_minmax(190px,auto)] lg:items-end">
						<div className="flex-1 space-y-1.5">
							<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">Pencarian</label>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<input
									className="w-full rounded-xl bg-muted/50 pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
									onChange={(e) => setSearchTerm(e.target.value)}
									placeholder="Nama, kode, WhatsApp"
									type="text"
									value={searchTerm}
								/>
							</div>
						</div>

						<div className="flex-1 lg:w-40 space-y-1.5">
								<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">Periode</label>
								<select
									className="w-full rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-bold outline-none appearance-none"
									onChange={(e) => {
										const val = e.target.value;
										if (val === "custom") return;
										setSelectedRange(val);
										const { start, end } = getRangeDates(val);
										setStartDate(start);
										setEndDate(end);
									}}
									value={selectedRange}
								>
									<option value="custom">Kustom</option>
									<option value="today">Hari Ini</option>
									<option value="tomorrow">Besok</option>
									<option value="yesterday">Kemarin</option>
									<option value="this_week">Minggu Ini</option>
									<option value="last_week">Minggu Lalu</option>
									<option value="this_month">Bulan Ini</option>
									<option value="last_month">Bulan Lalu</option>
									<option value="this_year">Tahun Ini</option>
									<option value="ytd">YTD (Berjalan)</option>
								</select>
							</div>

							<div className="grid grid-cols-2 gap-2 lg:w-auto">
								<div className="space-y-1.5">
									<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">Mulai</label>
									<input
										className="w-full rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-medium outline-none"
										onChange={(e) => setStartDate(e.target.value)}
										type="date"
										value={startDate}
									/>
								</div>
								<div className="space-y-1.5">
									<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">Selesai</label>
									<input
										className="w-full rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-medium outline-none"
										onChange={(e) => setEndDate(e.target.value)}
										type="date"
										value={endDate}
									/>
								</div>
							</div>

						<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
							<div className="min-w-0 space-y-1.5">
								<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">Urutkan</label>
								<div className="flex gap-1">
									<select
										className="flex-1 rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-bold outline-none appearance-none"
										onChange={(e) => setBy(e.target.value as any)}
										value={sortBy}
									>
										<option value="date">Tanggal</option>
										<option value="name">Nama</option>
										<option value="amount">Nominal</option>
									</select>
									<button
										className="rounded-xl bg-muted/50 px-3 py-2.5 hover:bg-muted transition-colors"
										onClick={() => setOrder(sortOrder === "asc" ? "desc" : "asc")}
										type="button"
									>
										<ArrowUpDown className="h-4 w-4 text-muted-foreground" />
									</button>
								</div>
							</div>

								<button
									className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground text-sm shadow-sm transition-all hover:opacity-90 active:scale-95"
									onClick={() => setIsCreateDialogOpen(true)}
									type="button"
								>
									<CalendarIcon className="h-4 w-4" />
									Tambah Booking
								</button>
							</div>
						</div>

					<div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
						{(["all", "pending", "confirmed", "arrived", "seated", "completed", "cancelled"] as const).map((f) => (
							<button
								className={`${["seated", "cancelled"].includes(f) ? "hidden lg:inline-flex" : "inline-flex"} min-h-9 shrink-0 rounded-full px-3 font-bold text-xs transition-all ${listFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
								key={f}
								onClick={() => setListFilter(f)}
								type="button"
							>
								{f === "all" ? "Semua" : STATUS_LABEL[f]}
							</button>
						))}
						{(["all", "pending", "paid"] as const).map((f) => (
							<button
								className={`min-h-9 shrink-0 rounded-full px-3 font-bold text-xs transition-all ${
									paymentFilter === f ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
								}`}
								key={`payment-${f}`}
								onClick={() => setPaymentFilter(f)}
								type="button"
							>
								{f === "all" ? "Semua pembayaran" : f === "paid" ? "Lunas" : "Belum lunas"}
							</button>
						))}
						{allOrders && (
							<span className="ml-auto text-muted-foreground text-xs font-bold bg-muted/30 px-3 py-1 rounded-full">
								{filteredOrders?.length ?? 0} dari {allOrders.length} booking ditemukan
							</span>
						)}
					</div>

					{ordersState.status === "loading" ? (
						<div className="space-y-3">
							{Array.from({ length: 5 }).map((_, i) => (
								<div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
									<div className="space-y-2">
										<Skeleton className="h-4 w-32" />
										<Skeleton className="h-3 w-48" />
									</div>
									<div className="flex gap-2">
										<Skeleton className="h-8 w-16 rounded-lg" />
										<Skeleton className="h-8 w-16 rounded-lg" />
									</div>
								</div>
							))}
						</div>
					) : ordersState.status === "error" ? (
						<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
							<p className="font-semibold">Gagal memuat daftar booking.</p>
							<p className="mt-1">{ordersState.error?.message || "Periksa koneksi lalu coba lagi."}</p>
							<button className="mt-3 rounded-lg bg-red-600 px-3 py-2 font-semibold text-white" onClick={() => void ordersState.reload()} type="button">Coba lagi</button>
						</div>
					) : filteredOrders?.length === 0 ? (
						<div className="rounded-[20px] border border-dashed border-border bg-card px-5 py-14 text-center">
							<p className="font-bold text-foreground">{searchTerm || listFilter !== "all" || paymentFilter !== "all" ? "Tidak ada booking yang cocok dengan filter" : "Belum ada booking pada periode ini"}</p>
							<p className="mt-1 text-xs text-muted-foreground">{searchTerm || listFilter !== "all" || paymentFilter !== "all" ? "Coba reset filter atau ubah kata pencarian." : "Buat booking manual atau buka halaman publik untuk melihat reservasi baru."}</p>
							<div className="mt-4 flex flex-wrap justify-center gap-2">
								{(searchTerm || listFilter !== "all" || paymentFilter !== "all") && <button className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold hover:bg-muted" onClick={() => { setSearchTerm(""); setListFilter("all"); setPaymentFilter("all"); }} type="button">Reset Filter</button>}
								<button className="min-h-11 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:opacity-90" onClick={() => setIsCreateDialogOpen(true)} type="button">Tambah Booking Manual</button>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							{filteredOrders?.map((order: any) => (
								<OrderRow
									key={order._id}
									order={order}
									onUpdateStatus={handleUpdateStatus}
									onEdit={handleEditBooking}
									onDelete={handleDeleteBooking}
								/>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── CAPACITY TAB ── */}
			{activeTab === "capacity" && (
				<div className="space-y-4" ref={capacitySectionRef}>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{[
							["Tamu terpakai", Number(summary?.[capDate]?.bookedPeople ?? 0), "text-emerald-700"],
							["Meja terpakai", Number(summary?.[capDate]?.bookedTables ?? 0), "text-violet-700"],
							["Booking aktif", Number(summary?.[capDate]?.count ?? 0), "text-blue-700"],
							["Status", summary?.[capDate]?.isClosed ? "Ditutup" : "Terbuka", "text-amber-700"],
						].map(([label, value, color]) => <div className="rounded-[20px] border border-border/70 bg-card p-3 shadow-sm" key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-black ${color}`}>{value}</p></div>)}
					</div>
					<section className="rounded-[20px] border border-primary/20 bg-primary/5 p-4 shadow-sm space-y-3">
						<div>
							<h3 className="font-bold">Kapasitas Default & Periode Booking</h3>
							<p className="mt-1 text-xs text-muted-foreground">Berlaku untuk tanggal tanpa pengaturan khusus.</p>
						</div>
						<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
							<label className="space-y-1.5 text-xs font-bold"><span>Booking ke depan (hari)</span><Input min={1} type="number" value={formData.bookingWindowDays} onChange={(e) => setFormData({ ...formData, bookingWindowDays: Math.max(1, Number(e.target.value)) })} /></label>
							<label className="space-y-1.5 text-xs font-bold"><span>Orang default</span><Input min={0} type="number" value={formData.defaultMaxPeople} onChange={(e) => setFormData({ ...formData, defaultMaxPeople: Math.max(0, Number(e.target.value)) })} /></label>
							<label className="space-y-1.5 text-xs font-bold"><span>Meja default</span><Input min={0} type="number" value={formData.defaultMaxTables} onChange={(e) => setFormData({ ...formData, defaultMaxTables: Math.max(0, Number(e.target.value)) })} /></label>
							<label className="space-y-1.5 text-xs font-bold"><span>Orang per meja</span><Input min={1} type="number" value={formData.defaultPeoplePerTable} onChange={(e) => setFormData({ ...formData, defaultPeoplePerTable: Math.max(1, Number(e.target.value)) })} /></label>
						</div>
						<p className="text-muted-foreground text-xs">Nilai 0 berarti tidak terbatas. Tanggal khusus tetap dapat diatur di bawah.</p>
					</section>

					{/* Add/edit capacity form */}
					<section className="rounded-[20px] border border-border/70 bg-card p-4 shadow-sm space-y-3">
						<div className="flex items-center gap-2">
							<Settings2 className="h-4 w-4 text-primary" />
							<h3 className="font-bold">Atur Kapasitas Per Tanggal</h3>
						</div>
						<p className="text-xs text-muted-foreground">
							Atur pengecualian untuk tanggal atau rentang tertentu. Nilai 0 berarti tidak terbatas.
						</p>
						<div className="flex flex-wrap gap-4 items-end">
							<div className="flex bg-muted/50 rounded-xl p-1 shrink-0">
								<button
									className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
										!isBulk
											? "bg-card text-primary shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => setIsBulk(false)}
									type="button"
								>
									Satu Tanggal
								</button>
								<button
									className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
										isBulk
											? "bg-card text-primary shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => setIsBulk(true)}
									type="button"
								>
									Rentang Tanggal
								</button>
							</div>

							<div className="flex flex-wrap gap-4 flex-1">
								<div className="space-y-1.5 flex-1 min-w-[150px]">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cap-date"
									>
										{isBulk ? "Mulai Tanggal" : "Tanggal"}
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
										id="cap-date"
										onChange={(e) => setCapDate(e.target.value)}
										type="date"
										value={capDate}
									/>
								</div>
								{isBulk && (
									<div className="space-y-1.5 flex-1 min-w-[150px]">
										<label
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="cap-end-date"
										>
											Sampai Tanggal
										</label>
										<input
											className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
											id="cap-end-date"
											min={capDate}
											onChange={(e) => setCapEndDate(e.target.value)}
											type="date"
											value={capEndDate}
										/>
									</div>
								)}
								<div className="space-y-1.5 min-w-[120px]">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cap-people"
									>
										Kapasitas Orang
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
										id="cap-people"
										min="0"
										onChange={(e) => setCapPeople(e.target.value)}
										placeholder="Contoh: 10"
										type="number"
										value={capPeople}
									/>
								</div>
								<div className="space-y-1.5 min-w-[120px]">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cap-tables"
									>
										Kapasitas Meja
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
										id="cap-tables"
										min="0"
										onChange={(e) => setCapTables(e.target.value)}
										placeholder="Contoh: 5"
										type="number"
										value={capTables}
									/>
								</div>
								<div className="space-y-1.5 min-w-[120px]">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cap-per-table"
									>
										Orang per Meja
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
										id="cap-per-table"
										min="1"
										onChange={(e) => setCapPeoplePerTable(e.target.value)}
										placeholder="Contoh: 4"
										type="number"
										value={capPeoplePerTable}
									/>
								</div>
								<div className="space-y-1.5 flex-1 min-w-[150px]">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cap-notes"
									>
										Catatan (opsional)
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
										id="cap-notes"
										onChange={(e) => setCapNotes(e.target.value)}
										placeholder="Contoh: Event khusus"
										type="text"
										value={capNotes}
									/>
									<div className="mt-2 flex items-center gap-2">
										<input checked={capIsClosed} className="h-4 w-4 rounded border-border text-primary" id="cap-closed" onChange={(e) => setCapIsClosed(e.target.checked)} type="checkbox" />
										<label className="text-xs font-bold" htmlFor="cap-closed">Tutup tanggal ini</label>
									</div>
							</div>
						</div>
						</div>
						<button
							className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground text-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
							disabled={isSavingCap}
							onClick={handleSaveCapacity}
							type="button"
						>
							{isSavingCap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
							Simpan Kapasitas
						</button>
					</section>

					{/* Existing capacities list */}
					<div className="space-y-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h3 className="font-bold text-sm">Kapasitas yang Telah Diatur</h3>
							{selectedCapacityIds.length > 0 && (
								<button className="min-h-11 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50" disabled={isDeletingCapacity} onClick={handleBulkDeleteCapacity} type="button">
									{isDeletingCapacity ? "Menghapus..." : `Hapus ${selectedCapacityIds.length} terpilih`}
								</button>
							)}
						</div>
						{!dateCapacities ? (
							<div className="flex justify-center py-6">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : dateCapacities.length === 0 ? (
							<div className="rounded-xl border border-border bg-card py-8 text-center text-muted-foreground text-sm">
								Belum ada kapasitas yang diatur.
							</div>
						) : (
							<div className="rounded-xl border border-border bg-card overflow-hidden">
								<table className="w-full text-sm">
									<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
										<tr>
											<th className="whitespace-nowrap w-12 px-3 py-3 text-center">
												<input aria-label="Pilih semua kapasitas" checked={allCapacitySelected} className="h-4 w-4 rounded border-border text-primary" onChange={(event) => setSelectedCapacityIds(event.target.checked ? capacityRows.map((cap: any) => String(cap._id)) : [])} type="checkbox" />
											</th>
											<th className="whitespace-nowrap px-4 py-3 text-left">Tanggal</th>
											<th className="whitespace-nowrap px-4 py-3 text-center">Kapasitas</th>
											<th className="whitespace-nowrap px-4 py-3 text-left">Catatan</th>
											<th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{dateCapacities
											.sort((a: any, b: any) => a.date.localeCompare(b.date))
											.map((cap: any) => (
												<tr className="hover:bg-muted/30" key={cap._id}>
													<td className="whitespace-nowrap w-12 px-3 py-3 text-center">
														<input aria-label={`Pilih kapasitas ${formatDate(cap.date)}`} checked={selectedCapacityIds.includes(String(cap._id))} className="h-4 w-4 rounded border-border text-primary" onChange={(event) => setSelectedCapacityIds((current) => event.target.checked ? [...new Set([...current, String(cap._id)])] : current.filter((id) => id !== String(cap._id)))} type="checkbox" />
													</td>
													<td className="whitespace-nowrap px-4 py-3 font-medium">{formatDate(cap.date)}</td>
													<td className="whitespace-nowrap px-4 py-3 text-center">
														<div className="flex flex-col gap-1 items-center">
															{cap.isClosed ? "Ditutup" : <><span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-0.5 font-bold text-primary text-[10px]"><Users className="h-3 w-3" />{cap.maxPeople === 0 ? "∞" : cap.maxPeople} org</span><span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-0.5 font-bold text-purple-700 text-[10px]"><Smartphone className="h-3 w-3 rotate-90" />{cap.maxTables === 0 ? "∞" : cap.maxTables} meja</span></>}
														</div>
													</td>
													<td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
														{cap.notes || "—"}
													</td>
													<td className="whitespace-nowrap px-4 py-3 text-right">
														<button
															className="text-xs text-muted-foreground hover:text-foreground"
															onClick={() => {
																setIsBulk(false);
																setCapDate(cap.date);
																setCapPeople(String(cap.maxPeople));
																setCapTables(String(cap.maxTables));
																setCapPeoplePerTable(String(cap.peoplePerTable));
																setCapIsClosed(Boolean(cap.isClosed));
																setCapNotes(cap.notes || "");
																capacitySectionRef.current?.scrollIntoView({ behavior: "smooth" });
																toast.info(`Mengedit kapasitas ${formatDate(cap.date)}`);
															}}
															type="button"
														>
															Edit
														</button>
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Edit Booking Dialog */}
			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="sm:max-w-[425px] rounded-[20px]">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold">Edit Booking</DialogTitle>
						<DialogDescription>
							Perbarui rincian reservasi untuk #{editingOrder?.bookingCode}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-name">
								Nama Pelanggan
							</Label>
							<Input
								className="rounded-xl border-border bg-muted/30 font-medium h-11"
								id="edit-name"
								onChange={(e) => setEditFormData({ ...editFormData, customerName: e.target.value })}
								value={editFormData.customerName || ""}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-phone">
									WhatsApp
								</Label>
								<Input
									className="rounded-xl border-border bg-muted/30 font-medium h-11"
									id="edit-phone"
									onChange={(e) => setEditFormData({ ...editFormData, customerPhone: e.target.value })}
									value={editFormData.customerPhone || ""}
								/>
							</div>
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-date">
									Tanggal
								</Label>
								<Input
									className="rounded-xl border-border bg-muted/30 font-medium h-11"
									id="edit-date"
									onChange={(e) => setEditFormData({ ...editFormData, bookingDate: e.target.value })}
									type="date"
									value={editFormData.bookingDate || ""}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-time">Jam Kedatangan</Label>
								<Input className="h-11 rounded-xl border-border bg-muted/30 font-medium" id="edit-time" onChange={(e) => setEditFormData({ ...editFormData, arrivalTime: e.target.value })} type="time" value={editFormData.arrivalTime || ""} />
							</div>
							<div className="flex items-end"><p className="text-[11px] text-muted-foreground">Waktu disimpan sebagai jam lokal WIB.</p></div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-guests">Jumlah Orang</Label>
								<Input className="h-11 rounded-xl border-border bg-muted/30 font-medium" id="edit-guests" min="1" onChange={(e) => setEditFormData({ ...editFormData, guestCount: e.target.value })} type="number" value={editFormData.guestCount || ""} />
							</div>
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-amount">
									Total Harga
								</Label>
								<Input
									className="rounded-xl border-border bg-muted/30 font-medium h-11"
									id="edit-amount"
									min="0"
									onChange={(e) => setEditFormData({ ...editFormData, totalAmount: e.target.value })}
									type="number"
									value={editFormData.totalAmount || ""}
								/>
							</div>
						</div>
						<div className="grid gap-2">
							<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="edit-notes">
								Catatan
							</Label>
							<Textarea
								className="rounded-xl border-border bg-muted/30 font-medium min-h-[80px]"
								id="edit-notes"
								onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
								value={editFormData.notes || ""}
							/>
						</div>
					</div>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							className="rounded-xl font-bold h-11"
							onClick={() => setIsEditDialogOpen(false)}
							variant="outline"
						>
							Batal
						</Button>
						<Button
							className="rounded-xl font-bold h-11 bg-primary px-6"
							disabled={isPatching}
							onClick={handleSaveEdit}
						>
							{isPatching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
							Simpan Perubahan
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Create Booking Dialog */}
			<Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
				<DialogContent className="sm:max-w-[425px] rounded-[20px]">
					<DialogHeader>
						<DialogTitle className="text-xl font-bold">Tambah Booking Baru</DialogTitle>
						<DialogDescription>
							Input data reservasi baru secara manual
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-name">
								Nama Pelanggan
							</Label>
							<Input
								className="rounded-xl border-border bg-muted/30 font-medium h-11"
								id="create-name"
								onChange={(e) => setCreateFormData({ ...createFormData, customerName: e.target.value })}
								placeholder="Contoh: Budi Santoso"
								value={createFormData.customerName}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-phone">
									WhatsApp
								</Label>
								<Input
									className="rounded-xl border-border bg-muted/30 font-medium h-11"
									id="create-phone"
									onChange={(e) => setCreateFormData({ ...createFormData, customerPhone: e.target.value })}
									placeholder="0812..."
									value={createFormData.customerPhone}
								/>
							</div>
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-date">
									Tanggal
								</Label>
								<Input
									className="rounded-xl border-border bg-muted/30 font-medium h-11"
									id="create-date"
									onChange={(e) => setCreateFormData({ ...createFormData, bookingDate: e.target.value })}
									type="date"
									value={createFormData.bookingDate}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-guests">Jumlah Orang</Label>
								<Input className="h-11 rounded-xl border-border bg-muted/30 font-medium" id="create-guests" min="1" onChange={(e) => setCreateFormData({ ...createFormData, guestCount: e.target.value })} type="number" value={createFormData.guestCount} />
							</div>
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-time">Jam Kedatangan</Label>
								<Input className="h-11 rounded-xl border-border bg-muted/30 font-medium" id="create-time" onChange={(e) => setCreateFormData({ ...createFormData, arrivalTime: e.target.value })} type="time" value={createFormData.arrivalTime} />
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-product">Menu (opsional)</Label>
								<select className="h-11 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm font-medium outline-none" id="create-product" onChange={(e) => setCreateFormData({ ...createFormData, itemProductId: e.target.value })} value={createFormData.itemProductId}>
									<option value="">Tanpa pesanan menu</option>
									{(allProducts ?? []).filter((product: any) => product.isActive !== false).map((product: any) => <option key={product._id} value={String(product._id)}>{product.name} — Rp {Number(product.price ?? 0).toLocaleString("id-ID")}</option>)}
								</select>
							</div>
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-quantity">Jumlah Menu</Label>
								<Input className="h-11 rounded-xl border-border bg-muted/30 font-medium" disabled={!createFormData.itemProductId} id="create-quantity" min="1" onChange={(e) => setCreateFormData({ ...createFormData, itemQuantity: e.target.value })} type="number" value={createFormData.itemQuantity} />
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-method">Metode Bayar</Label>
								<select className="h-11 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm font-medium outline-none" id="create-method" onChange={(e) => setCreateFormData({ ...createFormData, paymentMethod: e.target.value })} value={createFormData.paymentMethod}>
									<option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="QRIS">QRIS</option>
								</select>
							</div>
							<div className="grid gap-2">
								<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-amount">Total Biaya (Rp)</Label>
								<Input className="h-11 rounded-xl border-border bg-muted/30 font-bold text-primary" disabled={Boolean(createFormData.itemProductId)} id="create-amount" min="0" onChange={(e) => setCreateFormData({ ...createFormData, totalAmount: e.target.value })} type="number" value={createFormData.totalAmount} />
							</div>
						</div>
						<div className="grid gap-2">
							<Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground" htmlFor="create-notes">
								Catatan
							</Label>
							<Textarea
								className="rounded-xl border-border bg-muted/30 font-medium min-h-[80px]"
								id="create-notes"
								onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
								placeholder="Contoh: Meja pojok, alergi kacang..."
								value={createFormData.notes}
							/>
						</div>
					</div>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							className="rounded-xl font-bold h-11"
							onClick={() => setIsCreateDialogOpen(false)}
							variant="outline"
						>
							Batal
						</Button>
						<Button
							className="rounded-xl font-bold h-11 bg-primary px-6"
							disabled={isCreating}
							onClick={handleCreateBooking}
						>
							{isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
							Tambah Booking
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

