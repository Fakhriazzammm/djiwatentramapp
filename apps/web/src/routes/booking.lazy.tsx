import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
	Calendar,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Download,
	Loader2,
	Minus,
	Plus,
	ShoppingBag,
	Upload,
	Users,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/booking")({
	component: BookingPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
	productId: string;
	name: string;
	price: number;
	quantity: number;
	image?: string;
}

interface CustomerForm {
	name: string;
	phone: string;
	email: string;
	notes: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"Januari","Februari","Maret","April","Mei","Juni",
	"Juli","Agustus","September","Oktober","November","Desember",
];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const STEP_LABELS = ["Jumlah Orang", "Pilih Menu", "Pilih Tanggal", "Data Diri", "Pembayaran", "Konfirmasi", "Selesai"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(n);
}

function formatDateLong(dateStr: string) {
	const [y, m, d] = dateStr.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	return date.toLocaleDateString("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function todayStr() {
	return new Date().toISOString().split("T")[0];
}

// ─── Canvas Receipt Generator ─────────────────────────────────────────────────

function downloadReceiptJpg(
	booking: {
		bookingCode: string;
		customerName: string;
		customerPhone: string;
		customerEmail: string;
		notes?: string;
		bookingDate: string;
		items: { name: string; price: number; quantity: number }[];
		totalAmount: number;
		paymentMethod: string;
		paymentStatus: string;
		createdAt: number;
	},
	settings: { title?: string; description?: string; themeColor?: string } | null,
	siteSettings: { storeName?: string; storeAddress?: string; storePhone?: string } | null
) {
	const W = 640;
	const PAD = 40;
	const LINE = 1;
	const themeColor = settings?.themeColor || "#1a2332";
	const storeName = settings?.title || siteSettings?.storeName || "Djiwa Tentram";
	const storeAddress = siteSettings?.storeAddress || "";
	const storePhone = siteSettings?.storePhone || "";

	// Helpers
	const roundRect = (
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	) => {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	};

	// Estimate canvas height
	const HEADER_H = 140;
	const TITLE_H = 60;
	const CODE_H = 70;
	const INFO_H = 45 * (4 + (booking.notes ? 1 : 0));
	const ITEMS_H = 36 * booking.items.length + 60;
	const FOOTER_H = 100;
	const H = HEADER_H + TITLE_H + CODE_H + INFO_H + ITEMS_H + FOOTER_H + 60;

	const canvas = document.createElement("canvas");
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	// Background
	ctx.fillStyle = "#f9fafb";
	ctx.fillRect(0, 0, W, H);

	ctx.fillStyle = "#ffffff";
	roundRect(ctx, 12, 12, W - 24, H - 24, 16);
	ctx.fill();

	let y = 0;

	// ── Header bar ──
	ctx.fillStyle = themeColor;
	roundRect(ctx, 12, 12, W - 24, HEADER_H, 16);
	ctx.fill();
	// Bottom corners square
	ctx.fillRect(12, 12 + HEADER_H - 16, W - 24, 16);

	// Store name
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 26px Arial, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(storeName, W / 2, 70);

	// Sub info
	ctx.font = "13px Arial, sans-serif";
	ctx.fillStyle = "rgba(255,255,255,0.75)";
	if (storeAddress) ctx.fillText(storeAddress, W / 2, 92);
	if (storePhone) ctx.fillText(storePhone, W / 2, 110);

	y = HEADER_H + 30;

	// ── "BUKTI PEMESANAN" ──
	ctx.textAlign = "center";
	ctx.fillStyle = themeColor;
	ctx.font = "bold 16px Arial, sans-serif";
	ctx.fillText("BUKTI PEMESANAN", W / 2, y);

	// Dashes
	ctx.strokeStyle = "#e5e7eb";
	ctx.lineWidth = LINE;
	ctx.setLineDash([6, 4]);
	ctx.beginPath();
	ctx.moveTo(PAD, y + 14);
	ctx.lineTo(W - PAD, y + 14);
	ctx.stroke();
	ctx.setLineDash([]);

	y += 35;

	// ── Booking code ──
	ctx.fillStyle = themeColor;
	ctx.font = "bold 28px Arial, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(`#${booking.bookingCode}`, W / 2, y + 20);

	// Status badge
	const payStatus = booking.paymentStatus === "paid" ? "Lunas" : "Menunggu Pembayaran";
	const statusColor = booking.paymentStatus === "paid" ? "#22c55e" : "#f59e0b";
	ctx.fillStyle = statusColor + "22";
	roundRect(ctx, W / 2 - 80, y + 30, 160, 26, 13);
	ctx.fill();
	ctx.fillStyle = statusColor;
	ctx.font = "bold 12px Arial, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(payStatus, W / 2, y + 48);

	y += CODE_H + 10;

	// ── Separator ──
	ctx.strokeStyle = "#e5e7eb";
	ctx.lineWidth = LINE;
	ctx.beginPath();
	ctx.moveTo(PAD, y);
	ctx.lineTo(W - PAD, y);
	ctx.stroke();
	y += 16;

	// ── Info rows ──
	const drawInfoRow = (label: string, value: string) => {
		ctx.textAlign = "left";
		ctx.fillStyle = "#9ca3af";
		ctx.font = "11px Arial, sans-serif";
		ctx.fillText(label.toUpperCase(), PAD, y);
		ctx.fillStyle = "#111827";
		ctx.font = "bold 14px Arial, sans-serif";
		ctx.fillText(value, PAD, y + 18);
		y += 45;
	};

	drawInfoRow("Tanggal Booking", formatDateLong(booking.bookingDate));
	drawInfoRow("Nama Pemesan", booking.customerName);
	drawInfoRow("No. Telepon", booking.customerPhone);
	drawInfoRow("Email", booking.customerEmail);
	if (booking.notes) drawInfoRow("Catatan", booking.notes);

	// ── Separator ──
	ctx.strokeStyle = "#e5e7eb";
	ctx.lineWidth = LINE;
	ctx.setLineDash([6, 4]);
	ctx.beginPath();
	ctx.moveTo(PAD, y);
	ctx.lineTo(W - PAD, y);
	ctx.stroke();
	ctx.setLineDash([]);
	y += 16;

	// ── Items header ──
	ctx.textAlign = "left";
	ctx.fillStyle = "#6b7280";
	ctx.font = "bold 11px Arial, sans-serif";
	ctx.fillText("PESANAN", PAD, y);
	ctx.textAlign = "right";
	ctx.fillText("SUBTOTAL", W - PAD, y);
	y += 22;

	// ── Items ──
	booking.items.forEach((item) => {
		const sub = item.price * item.quantity;
		ctx.textAlign = "left";
		ctx.fillStyle = "#111827";
		ctx.font = "14px Arial, sans-serif";
		ctx.fillText(`${item.name} ×${item.quantity}`, PAD, y);
		ctx.textAlign = "right";
		ctx.fillStyle = "#374151";
		ctx.font = "bold 14px Arial, sans-serif";
		ctx.fillText(fmt(sub), W - PAD, y);
		y += 34;
	});

	y += 8;

	// ── Separator ──
	ctx.strokeStyle = "#d1d5db";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(PAD, y);
	ctx.lineTo(W - PAD, y);
	ctx.stroke();
	y += 16;

	// ── Total ──
	ctx.textAlign = "left";
	ctx.fillStyle = themeColor;
	ctx.font = "bold 18px Arial, sans-serif";
	ctx.fillText("TOTAL", PAD, y);
	ctx.textAlign = "right";
	ctx.fillText(fmt(booking.totalAmount), W - PAD, y);
	y += 30;

	// Payment method
	const pmLabel =
		booking.paymentMethod === "qris"
			? "QRIS"
			: booking.paymentMethod === "bank_transfer"
			? "Transfer Bank"
			: booking.paymentMethod === "cash"
			? "Cash / Tunai"
			: booking.paymentMethod;
	ctx.textAlign = "left";
	ctx.fillStyle = "#6b7280";
	ctx.font = "12px Arial, sans-serif";
	ctx.fillText(`Metode Bayar: ${pmLabel}`, PAD, y + 4);
	y += 30;

	// ── Separator ──
	ctx.strokeStyle = "#e5e7eb";
	ctx.lineWidth = LINE;
	ctx.setLineDash([6, 4]);
	ctx.beginPath();
	ctx.moveTo(PAD, y);
	ctx.lineTo(W - PAD, y);
	ctx.stroke();
	ctx.setLineDash([]);
	y += 20;

	// ── Footer ──
	const orderedAt = new Date(booking.createdAt).toLocaleString("id-ID");
	ctx.textAlign = "center";
	ctx.fillStyle = "#9ca3af";
	ctx.font = "11px Arial, sans-serif";
	ctx.fillText(`Dipesan pada: ${orderedAt}`, W / 2, y);
	y += 18;
	ctx.fillText("Harap simpan bukti ini sebagai konfirmasi pemesanan Anda.", W / 2, y);
	y += 22;
	ctx.fillStyle = themeColor;
	ctx.font = "bold 13px Arial, sans-serif";
	ctx.fillText(`— ${storeName} —`, W / 2, y);

	// Download
	canvas.toBlob(
		(blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `booking-${booking.bookingCode}.jpg`;
			a.click();
			URL.revokeObjectURL(url);
		},
		"image/jpeg",
		0.95
	);
}

// ─── Date Picker Calendar ──────────────────────────────────────────────────────

function DatePickerCalendar({
	year,
	month,
	selectedDate,
	onSelect,
	onNavigate,
	summary,
	guestCount,
}: {
	year: number;
	month: number;
	selectedDate: string | null;
	onSelect: (d: string) => void;
	onNavigate: (y: number, m: number) => void;
	summary: Record<string, { 
		count: number; 
		maxPeople: number;
		maxTables: number;
		peoplePerTable: number;
		bookedPeople: number;
		bookedTables: number;
	}>;
	guestCount: number;
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
		<div className="w-full max-w-sm mx-auto">
			{/* Navigation */}
			<div className="flex items-center justify-between mb-4">
				<button
					className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
					disabled={`${year}-${String(month + 1).padStart(2, "0")}` <= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
					onClick={prevMonth}
					type="button"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<span className="font-bold text-foreground">
					{MONTH_NAMES[month]} {year}
				</span>
				<button
					className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors"
					onClick={nextMonth}
					type="button"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>

			{/* Day headers */}
			<div className="grid grid-cols-7 mb-1">
				{DAY_NAMES.map((d) => (
					<div className="py-1 text-center font-bold text-muted-foreground text-[11px]" key={d}>
						{d}
					</div>
				))}
			</div>

			{/* Cells */}
			<div className="grid grid-cols-7 gap-1">
				{Array.from({ length: firstDay }).map((_, i) => (
					<div key={`b-${i}`} />
				))}
				{Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
					const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
					const info = summary[dateStr];
					const isPast = dateStr < today;
					
					const requiredTables = Math.ceil(guestCount / (info?.peoplePerTable || 4));
					const isFull = info && (
						(info.maxPeople > 0 && info.bookedPeople + guestCount > info.maxPeople) ||
						(info.maxTables > 0 && info.bookedTables + requiredTables > info.maxTables)
					);

					const isSelected = selectedDate === dateStr;
					const isAvailable = !isPast && !isFull;

					return (
						<button
							className={`flex flex-col items-center justify-center rounded-xl p-1.5 min-h-[52px] text-xs font-medium transition-all ${
								isSelected
									? "bg-primary text-primary-foreground shadow-md"
									: isPast
									? "text-muted-foreground/40 cursor-not-allowed"
									: isFull
									? "bg-red-50 text-red-400 cursor-not-allowed"
									: "hover:bg-primary/10 hover:text-primary text-foreground cursor-pointer"
							}`}
							disabled={isPast || isFull}
							key={day}
							onClick={() => onSelect(dateStr)}
							type="button"
						>
							<span className="font-bold">{day}</span>
							{!isPast && (
								<span
									className={`text-[9px] leading-tight ${
										isSelected
											? "text-primary-foreground/80"
											: isFull
											? "text-red-400"
											: info && info.count > 0
											? "text-orange-500"
											: "text-emerald-500"
									}`}
								>
									{isFull
										? "Penuh"
										: info && (info.maxPeople > 0 || info.maxTables > 0)
										? "Tersedia"
										: "Tersedia"}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{/* Legend */}
			<div className="flex items-center gap-4 mt-3 justify-center text-[10px] text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Tersedia
				</span>
				<span className="flex items-center gap-1">
					<span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Hampir penuh
				</span>
				<span className="flex items-center gap-1">
					<span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Penuh
				</span>
			</div>
		</div>
	);
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
	return (
		<div className="flex items-center justify-between gap-1 mb-8 px-2 max-w-sm mx-auto">
			{STEP_LABELS.map((label, i) => (
				<div className="flex flex-1 items-center" key={i}>
					<div className="flex flex-col items-center flex-1 relative">
						<div
							className={`z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
								i < current
									? "bg-primary text-primary-foreground"
									: i === current
									? "bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{i < current ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
						</div>
						
						{/* Progress Line */}
						{i < STEP_LABELS.length - 1 && (
							<div 
								className={`absolute left-1/2 top-3 -z-0 h-[2px] w-full transition-all ${
									i < current ? "bg-primary" : "bg-muted"
								}`}
								style={{ width: "calc(100% + 4px)" }}
							/>
						)}
						
						<span
							className={`mt-2 text-[8px] font-bold uppercase tracking-tighter text-center line-clamp-1 transition-all ${
								i === current ? "text-primary opacity-100" : "text-muted-foreground opacity-60"
							}`}
							style={{ width: '40px' }}
						>
							{label.split(' ')[0]}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Wrapper Component for Mobile Look ──
const MobileWrapper = ({
	children,
	title,
	showHeader = true,
	step,
	setStep,
	themeColor,
	settings,
}: {
	children: React.ReactNode;
	title?: string;
	showHeader?: boolean;
	step: number;
	setStep: React.Dispatch<React.SetStateAction<number>>;
	themeColor: string;
	settings: any;
}) => (
	<div className="min-h-screen bg-background flex flex-col items-center">
		<div className="w-full max-w-md bg-card min-h-screen shadow-2xl flex flex-col relative overflow-x-hidden">
			{showHeader && (
				<header className="sticky top-0 z-30 w-full px-4 py-4 flex items-center justify-between bg-background/80 backdrop-blur-md border-b border-border">
					<div className="flex items-center gap-3">
						{step > 0 && step < 6 && (
							<button
								onClick={() => setStep((s) => s - 1)}
								className="p-2 hover:bg-muted rounded-full transition-colors"
							>
								<ChevronLeft className="h-5 w-5" />
							</button>
						)}
						<div
							className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
							style={{ background: themeColor }}
						>
							{settings.title?.charAt(0) || "D"}
						</div>
						<h1 className="font-bold text-sm tracking-tight line-clamp-1">{settings.title}</h1>
					</div>
					{step < 5 && (
						<div className="flex flex-col items-end">
							<span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
								Step
							</span>
							<span className="text-xs font-bold" style={{ color: themeColor }}>
								{step + 1} of 5
							</span>
						</div>
					)}
				</header>
			)}
			<main className="flex-1 px-4 py-6 overflow-y-auto">{children}</main>
		</div>
	</div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

function BookingPage() {
	const settings = useQuery(api.booking.getSettings, { slug: "booking" });
	const products = useQuery(api.booking.getBookingProducts, { slug: "booking" });
	const siteSettings = useQuery(api.site_settings.getSettings);
	const createBookingOrder = useMutation(api.booking.createBookingOrder);
	const uploadPaymentProof = useMutation(api.booking.uploadPaymentProof);
	const generateUploadUrl = useMutation(api.booking.generateUploadUrl);

	const today = new Date();
	const [calYear, setCalYear] = useState(today.getFullYear());
	const [calMonth, setCalMonth] = useState(today.getMonth());

	const yearMonth = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
	const monthSummary = useQuery(api.booking.getMonthBookingSummary, {
		slug: "booking",
		yearMonth,
	});

	const [step, setStep] = useState(0);
	const [guestCount, setGuestCount] = useState(1);
	const [cart, setCart] = useState<CartItem[]>([]);
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [customerForm, setCustomerForm] = useState<CustomerForm>({
		name: "",
		phone: "",
		email: "",
		notes: "",
	});
	const [selectedPayment, setSelectedPayment] = useState<string>("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [completedBooking, setCompletedBooking] = useState<any>(null);
	const [transferredAmount, setTransferredAmount] = useState<string>("");
	const [proofImage, setProofImage] = useState<string>("");
	const [proofPreview, setProofPreview] = useState<string>("");
	const [isUploadingProof, setIsUploadingProof] = useState(false);
	const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({});

	const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
	const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

	const addToCart = useCallback(
		(product: { _id: string; name: string; price: number; image?: string }) => {
			setCart((prev) => {
				const existing = prev.find((i) => i.productId === product._id);
				if (existing) {
					return prev.map((i) =>
						i.productId === product._id
							? { ...i, quantity: i.quantity + 1 }
							: i
					);
				}
				return [
					...prev,
					{
						productId: product._id,
						name: product.name,
						price: product.price,
						quantity: 1,
						image: product.image,
					},
				];
			});
		},
		[]
	);

	const updateQty = useCallback((productId: string, delta: number) => {
		setCart((prev) =>
			prev
				.map((i) =>
					i.productId === productId
						? { ...i, quantity: Math.max(0, i.quantity + delta) }
						: i
				)
				.filter((i) => i.quantity > 0)
		);
	}, []);

	const handleSubmitBooking = async () => {
		if (!selectedDate || !selectedPayment || cart.length === 0) return;
		setIsSubmitting(true);
		try {
			const id = await createBookingOrder({
				slug: "booking",
				customerName: customerForm.name,
				customerPhone: customerForm.phone,
				customerEmail: customerForm.email,
				notes: customerForm.notes || undefined,
				bookingDate: selectedDate,
				guestCount,
				items: cart.map((i) => ({
					productId: i.productId,
					name: i.name,
					price: i.price,
					quantity: i.quantity,
				})),
				totalAmount: cartTotal,
				paymentMethod: selectedPayment,
				customAnswers: Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
			});

			setCompletedBooking({
				_id: id,
				bookingCode: "", // will be fetched or shown from result — we'll reconstruct
				customerName: customerForm.name,
				customerPhone: customerForm.phone,
				customerEmail: customerForm.email,
				notes: customerForm.notes,
				bookingDate: selectedDate,
				guestCount,
				items: cart.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
				totalAmount: cartTotal,
				paymentMethod: selectedPayment,
				paymentStatus: "pending",
				createdAt: Date.now(),
			});

			setStep(5);
			// toast.success("Booking berhasil dibuat!");
		} catch (e: any) {
			toast.error(e?.message || "Gagal membuat booking");
		} finally {
			setIsSubmitting(false);
		}
	};

	// ── Fetch the completed booking code ──
	const latestBooking = useQuery(
		api.booking.getBookingOrders,
		step >= 5 ? { slug: "booking" } : "skip"
	);

	const confirmedBooking =
		latestBooking && latestBooking.length > 0 ? latestBooking[0] : null;

	// Loading
	if (settings === undefined || products === undefined) {
		return (
			<div className="flex h-screen items-center justify-center bg-background">
				<div className="text-center">
					<Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
					<p className="mt-3 font-medium text-muted-foreground text-sm">Memuat halaman booking...</p>
				</div>
			</div>
		);
	}

	const themeColor = settings.themeColor || "#1a2332";

	if (!settings?.isActive) {
		return (
			<div className="flex h-screen items-center justify-center bg-background p-6 text-center">
				<div className="max-w-xs">
					<div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
						<X className="h-8 w-8 text-muted-foreground" />
					</div>
					<h1 className="font-bold text-2xl text-foreground">Halaman Tidak Aktif</h1>
					<p className="mt-2 text-muted-foreground">Maaf, halaman pemesanan sedang tidak tersedia.</p>
				</div>
			</div>
		);
	}

	// ── Step 6: Finished ──
	if (step === 6) {
		const booking = confirmedBooking || completedBooking;
		return (
			<MobileWrapper settings={settings} setStep={setStep} showHeader={false} step={step} themeColor={themeColor}>
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<div
						className="mb-6 flex h-20 w-20 items-center justify-center rounded-full shadow-lg animate-in zoom-in duration-500"
						style={{ background: `${themeColor}20` }}
					>
						<CheckCircle2 className="h-10 w-10" style={{ color: themeColor }} />
					</div>
					<h2 className="font-extrabold text-foreground text-2xl tracking-tight">Booking Berhasil!</h2>
					<p className="mt-2 text-muted-foreground text-sm max-w-[240px] mx-auto">
						Terima kasih, pesanan Anda telah kami terima dan sedang diproses.
					</p>

					{booking && (
						<div className="w-full mt-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
							<div
								className="rounded-2xl py-4 px-6 font-mono font-bold text-2xl shadow-sm border border-border"
								style={{ background: `${themeColor}08`, color: themeColor }}
							>
								#{booking.bookingCode || "—"}
							</div>

							<div className="space-y-3 text-left bg-muted/30 p-5 rounded-2xl border border-border/50">
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">TANGGAL</span>
									<span className="font-bold text-foreground">{formatDateLong(booking.bookingDate)}</span>
								</div>
								<div className="h-px bg-border/50" />
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">NAMA</span>
									<span className="font-bold text-foreground">{booking.customerName}</span>
								</div>
								<div className="h-px bg-border/50" />
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">TOTAL</span>
									<span className="font-extrabold text-lg" style={{ color: themeColor }}>{fmt(booking.totalAmount)}</span>
								</div>
								<div className="h-px bg-border/50" />
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">METODE BAYAR</span>
									<span className="font-bold text-foreground capitalize">
										{booking.paymentMethod?.replace("_", " ")}
									</span>
								</div>
							</div>

							{settings.bankDetails && (
								<div className="rounded-2xl bg-amber-50/50 border border-amber-100 p-5 text-left">
									<p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider mb-2">
										Instruksi Pembayaran
									</p>
									<p className="whitespace-pre-wrap font-medium text-amber-900/80 text-xs leading-relaxed">
										{settings.bankDetails}
									</p>
								</div>
							)}

							<button
								className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold text-sm text-white shadow-lg transition-all hover:opacity-90 active:scale-95 active:shadow-sm"
								onClick={() => {
									if (booking) {
										downloadReceiptJpg(booking, settings, siteSettings ?? null);
									}
								}}
								style={{ background: themeColor }}
								type="button"
							>
								<Download className="h-4 w-4" />
								Download Bukti Booking (JPG)
							</button>
							
							<button 
								className="w-full py-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => window.location.reload()}
							>
								Buat Pesanan Baru
							</button>
						</div>
					)}
				</div>
			</MobileWrapper>
		);
	}

	const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Create local preview immediately
		const previewUrl = URL.createObjectURL(file);
		setProofPreview(previewUrl);

		setIsUploadingProof(true);
		try {
			const postUrl = await generateUploadUrl();
			const result = await fetch(postUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			const { storageId } = await result.json();
			setProofImage(storageId);
			toast.success("Bukti pembayaran terpilih!");
		} catch (error) {
			toast.error("Gagal mengunggah bukti");
			setProofPreview(""); // Clear preview on error
		} finally {
			setIsUploadingProof(false);
		}
	};

	const handleFinishBooking = async () => {
		const booking = confirmedBooking || completedBooking;
		if (!booking) return;

		if ((selectedPayment === "bank_transfer" || selectedPayment === "qris") && !proofImage) {
			toast.error("Wajib mengunggah bukti pembayaran");
			return;
		}

		if (selectedPayment === "qris" && !transferredAmount) {
			toast.error("Wajib mengisi nominal transfer");
			return;
		}

		setIsSubmitting(true);
		try {
			if (proofImage && booking._id) {
				await uploadPaymentProof({
					id: booking._id,
					storageId: proofImage,
					transferredAmount: transferredAmount ? Number(transferredAmount) : undefined,
				});
			}
			setStep(6);
			toast.success("Konfirmasi berhasil!");
		} catch (error) {
			toast.error("Gagal menyimpan konfirmasi");
		} finally {
			setIsSubmitting(false);
		}
	};

	if (step === 6) {
		const booking = confirmedBooking || completedBooking;
		return (
			<MobileWrapper settings={settings} setStep={setStep} showHeader={false} step={step} themeColor={themeColor}>
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<div
						className="mb-6 flex h-20 w-20 items-center justify-center rounded-full shadow-lg animate-in zoom-in duration-500"
						style={{ background: `${themeColor}20` }}
					>
						<CheckCircle2 className="h-10 w-10" style={{ color: themeColor }} />
					</div>
					<h2 className="font-extrabold text-foreground text-2xl tracking-tight">Booking Berhasil!</h2>
					<p className="mt-2 text-muted-foreground text-sm max-w-[240px] mx-auto">
						Terima kasih, pesanan Anda telah kami terima dan sedang diproses.
					</p>

					{booking && (
						<div className="w-full mt-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
							<div
								className="rounded-2xl py-4 px-6 font-mono font-bold text-2xl shadow-sm border border-border"
								style={{ background: `${themeColor}08`, color: themeColor }}
							>
								#{booking.bookingCode || "—"}
							</div>

							<div className="space-y-3 text-left bg-muted/30 p-5 rounded-2xl border border-border/50">
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">TANGGAL</span>
									<span className="font-bold text-foreground">{formatDateLong(booking.bookingDate)}</span>
								</div>
								<div className="h-px bg-border/50" />
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">NAMA</span>
									<span className="font-bold text-foreground">{booking.customerName}</span>
								</div>
								<div className="h-px bg-border/50" />
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">TOTAL</span>
									<span className="font-extrabold text-lg" style={{ color: themeColor }}>{fmt(booking.totalAmount)}</span>
								</div>
								<div className="h-px bg-border/50" />
								<div className="flex justify-between items-center text-xs">
									<span className="text-muted-foreground font-medium">METODE BAYAR</span>
									<span className="font-bold text-foreground capitalize">
										{booking.paymentMethod?.replace("_", " ")}
									</span>
								</div>
							</div>

							{settings.bankDetails && (
								<div className="rounded-2xl bg-amber-50/50 border border-amber-100 p-5 text-left">
									<p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider mb-2">
										Instruksi Pembayaran
									</p>
									<p className="whitespace-pre-wrap font-medium text-amber-900/80 text-xs leading-relaxed">
										{settings.bankDetails}
									</p>
								</div>
							)}

							<button
								className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold text-sm text-white shadow-lg transition-all hover:opacity-90 active:scale-95 active:shadow-sm"
								onClick={() => {
									if (booking) {
										downloadReceiptJpg(booking, settings, siteSettings ?? null);
									}
								}}
								style={{ background: themeColor }}
								type="button"
							>
								<Download className="h-4 w-4" />
								Download Bukti Booking (JPG)
							</button>
							
							<button 
								className="w-full py-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => window.location.reload()}
							>
								Buat Pesanan Baru
							</button>
						</div>
					)}
				</div>
			</MobileWrapper>
		);
	}

	if (step === 5) {
		const booking = confirmedBooking || completedBooking;
		const qrisUrl = settings.qrisImage || siteSettings?.qrisImage;

		return (
			<MobileWrapper settings={settings} setStep={setStep} step={step} themeColor={themeColor} title="Konfirmasi Bayar">
				<div className="flex flex-col gap-6 pb-20">
					<div className="text-center">
						<h2 className="font-extrabold text-foreground text-xl tracking-tight">Konfirmasi Pembayaran</h2>
						<p className="text-muted-foreground text-xs mt-1">Selesaikan pembayaran untuk memvalidasi pesanan Anda</p>
					</div>

					{selectedPayment === "qris" && (
						<div className="space-y-6 animate-in fade-in duration-500">
							<div className="mx-auto h-72 w-72 overflow-hidden rounded-3xl border-4 border-muted p-3 bg-white shadow-inner flex flex-col items-center justify-center">
								{qrisUrl ? (
									<>
										<img alt="QRIS" className="h-48 w-48 object-contain mb-4" src={qrisUrl} />
										<button
											className="flex items-center gap-2 rounded-xl px-4 py-2 font-bold text-[11px] text-white shadow-md transition-all hover:opacity-90 active:scale-95"
											onClick={async () => {
												try {
													const response = await fetch(qrisUrl);
													const blob = await response.blob();
													const url = window.URL.createObjectURL(blob);
													const link = document.createElement("a");
													link.href = url;
													link.download = `QRIS-${settings.title || "Payment"}.png`;
													document.body.appendChild(link);
													link.click();
													document.body.removeChild(link);
													window.URL.revokeObjectURL(url);
													toast.success("QRIS berhasil diunduh");
												} catch (err) {
													toast.error("Gagal mengunduh QRIS");
												}
											}}
											style={{ background: themeColor }}
											type="button"
										>
											<Download className="h-3.5 w-3.5" />
											Simpan QRIS
										</button>
									</>
								) : (
									<div className="flex h-full w-full items-center justify-center text-center p-6 text-muted-foreground text-xs italic">
										QRIS belum tersedia.
									</div>
								)}
							</div>
							
							<div className="rounded-2xl bg-primary/5 border border-primary/10 p-4 text-center">
								<p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">TOTAL TAGIHAN</p>
								<p className="font-extrabold text-2xl" style={{ color: themeColor }}>{fmt(cartTotal)}</p>
							</div>

							<div className="space-y-4 pt-2">
								<div className="space-y-2">
									<label className="font-bold text-foreground text-xs">Nominal Transfer *</label>
									<div className="relative">
										<span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">Rp</span>
										<input
											className="w-full rounded-2xl bg-muted/50 pl-11 pr-4 py-4 font-extrabold text-lg text-foreground outline-none border-2 border-transparent focus:border-primary/20 transition-all"
											onChange={(e) => setTransferredAmount(e.target.value)}
											placeholder="0"
											type="number"
											value={transferredAmount}
										/>
									</div>
									<p className="text-[10px] text-muted-foreground px-1 italic">* Pastikan nominal sesuai dengan total tagihan</p>
								</div>

								<div className="space-y-2">
									<label className="font-bold text-foreground text-xs">Bukti Pembayaran *</label>
									{proofImage || proofPreview ? (
										<div className="relative group h-48 w-full overflow-hidden rounded-3xl border-2 border-primary/20 bg-muted">
											<img alt="Proof" className="h-full w-full object-cover" src={proofPreview || (proofImage.startsWith("http") ? proofImage : undefined)} />
											<div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
												<button
													className="rounded-full bg-red-500 p-3 text-white shadow-lg active:scale-90 transition-transform"
													onClick={() => {
														setProofImage("");
														setProofPreview("");
													}}
													type="button"
												>
													<X className="h-5 w-5" />
												</button>
											</div>
										</div>
									) : (
										<label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-muted bg-muted/20 hover:bg-muted/40 hover:border-primary/20 transition-all active:scale-[0.98]">
											<div className="h-12 w-12 rounded-full bg-background flex items-center justify-center shadow-sm mb-2 border border-border">
												<Upload className="h-5 w-5 text-primary" />
											</div>
											<span className="font-bold text-[11px] text-foreground">
												{isUploadingProof ? "Mengunggah..." : "Ambil Foto / Pilih File"}
											</span>
											<input accept="image/*" className="hidden" onChange={handleProofUpload} type="file" />
										</label>
									)}
								</div>
							</div>

							<button
								className="flex w-full items-center justify-center gap-2 rounded-2xl py-4.5 font-extrabold text-sm text-white shadow-xl transition-all hover:opacity-95 active:scale-95 disabled:opacity-50 disabled:shadow-none mt-4"
								disabled={!proofImage || !transferredAmount || isSubmitting}
								onClick={handleFinishBooking}
								style={{ background: themeColor }}
								type="button"
							>
								{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Kirim Konfirmasi Berhasil"}
							</button>
						</div>
					)}

					{selectedPayment === "bank_transfer" && (
						<div className="space-y-6 animate-in fade-in duration-500">
							<div className="rounded-3xl bg-muted/30 p-6 border border-border shadow-sm">
								<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest mb-3">Tujuan Transfer</p>
								<div className="bg-background rounded-2xl p-4 border border-border/50">
									<pre className="whitespace-pre-wrap font-sans text-xs font-bold text-foreground leading-relaxed">
										{settings.bankDetails || "Detail rekening belum diatur."}
									</pre>
								</div>
								<div className="mt-4 flex justify-between items-center bg-primary/5 rounded-2xl p-4 border border-primary/10">
									<span className="text-xs font-bold text-muted-foreground">TOTAL:</span>
									<span className="font-extrabold text-lg" style={{ color: themeColor }}>{fmt(cartTotal)}</span>
								</div>
							</div>

							<div className="space-y-2">
								<label className="font-bold text-foreground text-xs">Upload Bukti Transfer *</label>
								{proofImage || proofPreview ? (
									<div className="relative group h-48 w-full overflow-hidden rounded-3xl border-2 border-primary/20 bg-muted">
										<img alt="Proof" className="h-full w-full object-cover" src={proofPreview || (proofImage.startsWith("http") ? proofImage : undefined)} />
										<button
											className="absolute top-3 right-3 rounded-full bg-red-500 p-2 text-white shadow-lg active:scale-90"
											onClick={() => {
												setProofImage("");
												setProofPreview("");
											}}
											type="button"
										>
											<X className="h-4 w-4" />
										</button>
									</div>
								) : (
									<label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-muted bg-muted/20 hover:bg-muted/40 transition-all active:scale-[0.98]">
										<Upload className="h-6 w-6 text-primary mb-2" />
										<span className="font-bold text-[11px] text-foreground">
											{isUploadingProof ? "Mengunggah..." : "Pilih Bukti Transfer"}
										</span>
										<input accept="image/*" className="hidden" onChange={handleProofUpload} type="file" />
									</label>
								)}
							</div>

							<button
								className="flex w-full items-center justify-center gap-2 rounded-2xl py-4.5 font-extrabold text-sm text-white shadow-xl transition-all hover:opacity-95 active:scale-95 disabled:opacity-50 mt-4"
								disabled={!proofImage || isSubmitting}
								onClick={handleFinishBooking}
								style={{ background: themeColor }}
								type="button"
							>
								{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Selesaikan & Kirim Bukti"}
							</button>
						</div>
					)}

					{selectedPayment === "cash" && (
						<div className="space-y-6 text-center animate-in fade-in duration-500 py-4">
							<div className="mx-auto h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
								<ShoppingBag className="h-10 w-10 text-emerald-500" />
							</div>
							<div className="space-y-2">
								<p className="font-bold text-foreground">Bayar di Tempat</p>
								<p className="text-xs text-muted-foreground px-4">
									Silakan lakukan pembayaran langsung di lokasi saat kedatangan.
								</p>
							</div>
							<div className="rounded-2xl bg-muted/30 p-5 font-extrabold text-xl shadow-inner border border-border" style={{ color: themeColor }}>
								Total: {fmt(cartTotal)}
							</div>
							<button
								className="flex w-full items-center justify-center gap-2 rounded-2xl py-4.5 font-extrabold text-sm text-white shadow-xl transition-all hover:opacity-95 active:scale-95 mt-4"
								onClick={() => setStep(6)}
								style={{ background: themeColor }}
								type="button"
							>
								Konfirmasi Selesai
							</button>
						</div>
					)}
				</div>
			</MobileWrapper>
		);
	}

	return (
		<MobileWrapper settings={settings} setStep={setStep} step={step} themeColor={themeColor} title={STEP_LABELS[step]}>
			<div className="flex flex-col h-full pt-2">
				<StepBar current={step} />

				{/* ── STEP 0: Guest Count ── */}
				{step === 0 && (
					<div className="flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
						<div className="mb-8 p-4 rounded-3xl bg-primary/5 border border-primary/10">
							<Users className="h-10 w-10" style={{ color: themeColor }} />
						</div>
						<div className="text-center mb-10">
							<h2 className="font-extrabold text-foreground text-2xl tracking-tight mb-2">Berapa orang?</h2>
							<p className="text-muted-foreground text-sm">Pilih jumlah tamu yang akan berkunjung</p>
						</div>

						<div className="flex items-center justify-center gap-8 mb-12 scale-110">
							<button
								className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-all hover:border-primary/30 active:scale-90 disabled:opacity-30 shadow-sm"
								disabled={guestCount <= 1}
								onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
								type="button"
							>
								<Minus className="h-6 w-6" />
							</button>
							<div className="flex flex-col items-center min-w-[3rem]">
								<span className="text-6xl font-black tabular-nums tracking-tighter" style={{ color: themeColor }}>
									{guestCount}
								</span>
								<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Tamu</span>
							</div>
							<button
								className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-primary/20 transition-all hover:opacity-90 active:scale-95 mx-auto"
								onClick={() => setGuestCount(guestCount + 1)}
								style={{ background: themeColor }}
								type="button"
							>
								<Plus className="h-6 w-6" />
							</button>
						</div>
						
						<div className="w-full rounded-2xl bg-muted/30 p-4 text-center border border-border/50">
							<p className="text-[11px] text-muted-foreground leading-relaxed italic">
								* Kapasitas meja kami akan disesuaikan secara otomatis berdasarkan jumlah tamu yang Anda pilih.
							</p>
						</div>
					</div>
				)}

				{/* ── STEP 1: Product Selection ── */}
				{step === 1 && (
					<div className="space-y-4 pb-24 animate-in fade-in duration-500">
						<div className="flex items-center justify-between mb-2">
							<h2 className="font-extrabold text-foreground text-lg tracking-tight">Pilih Menu</h2>
							<div className="flex items-center gap-1.5 px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
								<ShoppingBag className="h-3 w-3 text-primary" />
								<span className="text-[10px] font-bold text-primary">{cartCount} Item dipilih</span>
							</div>
						</div>

						<div className="grid gap-3">
							{products.map((product: any) => {
								const cartItem = cart.find((i) => i.productId === product._id);
								return (
									<div
										className={`flex items-center gap-4 rounded-3xl border p-3.5 transition-all ${
											cartItem ? 'border-primary/30 bg-primary/[0.02] ring-1 ring-primary/5 shadow-sm' : 'border-border bg-card'
										}`}
										key={product._id}
									>
										<div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-primary/5 border border-border/50 shadow-inner">
											{product.image ? (
												<img
													alt={product.name}
													className="h-full w-full object-cover transition-transform hover:scale-110"
													src={product.image}
												/>
											) : (
												<div
													className="flex h-full w-full items-center justify-center font-black text-3xl opacity-20"
													style={{ color: themeColor }}
												>
													{product.name.charAt(0)}
												</div>
											)}
										</div>
										<div className="flex-1 min-w-0 pr-2">
											<p className="font-bold text-foreground text-[15px] leading-tight mb-0.5">
												{product.name}
											</p>
											<p className="text-muted-foreground text-[11px] line-clamp-1 mb-2 font-medium">
												{product.description || "Menu spesial favorit kami"}
											</p>
											<p className="font-black text-sm tracking-tight" style={{ color: themeColor }}>
												{fmt(product.price)}
											</p>
										</div>
										<div className="shrink-0 flex flex-col items-center gap-1">
											{cartItem ? (
												<div className="flex flex-col items-center gap-1.5 p-1 bg-muted/40 rounded-full border border-border/50">
													<button
														className="flex h-7 w-7 items-center justify-center rounded-full bg-background border border-border text-foreground transition-all active:scale-95 shadow-sm"
														onClick={() => updateQty(product._id, -1)}
														type="button"
													>
														<Minus className="h-3.5 w-3.5" />
													</button>
													<span className="font-black text-sm w-5 text-center">
														{cartItem.quantity}
													</span>
													<button
														className="flex h-7 w-7 items-center justify-center rounded-full text-white transition-all active:scale-90 shadow-sm"
														onClick={() => addToCart(product)}
														style={{ background: themeColor }}
														type="button"
													>
														<Plus className="h-3.5 w-3.5" />
													</button>
												</div>
											) : (
												<button
													className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/10 transition-all hover:opacity-90 active:scale-90"
													onClick={() => addToCart(product)}
													style={{ background: themeColor }}
													type="button"
												>
													<Plus className="h-5 w-5" />
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* ── STEP 2: Date Picker ── */}
				{step === 2 && (
					<div className="space-y-6 pb-24 animate-in fade-in duration-500">
						<div className="text-center py-2">
							<h2 className="font-extrabold text-foreground text-xl tracking-tight mb-1">Pilih Tanggal</h2>
							<p className="text-muted-foreground text-xs font-medium italic">Ketersediaan meja diperbarui secara realtime</p>
						</div>

						<div className="rounded-[32px] border-2 border-muted bg-card px-4 py-8 shadow-inner-sm">
							<DatePickerCalendar
								guestCount={guestCount}
								month={calMonth}
								onNavigate={(y, m) => {
									setCalYear(y);
									setCalMonth(m);
								}}
								onSelect={(d) => setSelectedDate(d === selectedDate ? null : d)}
								selectedDate={selectedDate}
								summary={monthSummary ?? {}}
								year={calYear}
							/>
						</div>

						{selectedDate && (
							<div
								className="rounded-3xl p-5 border border-primary/10 flex items-center justify-between shadow-sm animate-in zoom-in-95 duration-300"
								style={{ background: `${themeColor}05` }}
							>
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-white shadow-sm border border-border/50">
										<Calendar className="h-5 w-5" style={{ color: themeColor }} />
									</div>
									<div className="flex flex-col">
										<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TANGGAL DIPILIH</span>
										<span className="font-black text-sm" style={{ color: themeColor }}>{formatDateLong(selectedDate)}</span>
									</div>
								</div>
								<CheckCircle2 className="h-6 w-6 text-emerald-500" />
							</div>
						)}
					</div>
				)}

				{/* ── STEP 3: Customer Info ── */}
				{step === 3 && (
					<div className="space-y-6 pb-32 animate-in fade-in duration-500">
						<div className="text-center pt-2">
							<h2 className="font-extrabold text-foreground text-xl tracking-tight mb-1">Data Diri</h2>
							<p className="text-muted-foreground text-xs font-medium">Lengkapi informasi untuk pesanan Anda</p>
						</div>
						
						<div className="space-y-5">
							{/* Dynamic Custom Fields */}
							{settings.customFields?.map((field: any) => (
								<div className="space-y-2 group" key={field.id}>
									<label
										className="font-black text-muted-foreground text-[10px] uppercase tracking-widest px-1 transition-colors group-focus-within:text-primary"
										htmlFor={field.id}
									>
										{field.label} {field.required ? "*" : "(OPSIONAL)"}
									</label>
									
									{field.type === "text" && (
										<input
											className="w-full rounded-2xl bg-muted/30 p-4 font-bold text-[15px] text-foreground outline-none border-2 border-transparent focus:border-primary/20 focus:bg-background transition-all shadow-sm"
											id={field.id}
											onChange={(e) => setCustomAnswers({ ...customAnswers, [field.label]: e.target.value })}
											placeholder={field.placeholder}
											required={field.required}
											type="text"
											value={customAnswers[field.label] || ""}
										/>
									)}

									{field.type === "number" && (
										<input
											className="w-full rounded-2xl bg-muted/30 p-4 font-bold text-[15px] text-foreground outline-none border-2 border-transparent focus:border-primary/20 focus:bg-background transition-all shadow-sm"
											id={field.id}
											onChange={(e) => setCustomAnswers({ ...customAnswers, [field.label]: e.target.value })}
											placeholder={field.placeholder}
											required={field.required}
											type="number"
											value={customAnswers[field.label] || ""}
										/>
									)}

									{field.type === "dropdown" && (
										<select
											className="w-full rounded-2xl border-2 border-transparent bg-muted/30 p-4 font-bold text-[15px] text-foreground outline-none focus:border-primary/20 focus:bg-background transition-all shadow-sm appearance-none"
											id={field.id}
											onChange={(e) => setCustomAnswers({ ...customAnswers, [field.label]: e.target.value })}
											required={field.required}
											value={customAnswers[field.label] || ""}
										>
											<option value="">{field.placeholder || "-- Pilih --"}</option>
											{field.options?.map((opt: string) => (
												<option key={opt} value={opt}>{opt}</option>
											))}
										</select>
									)}

									{field.type === "checkbox" && (
										<label className="flex items-center gap-3 p-4 rounded-2xl bg-muted/30 border-2 border-transparent hover:border-primary/10 transition-all cursor-pointer">
											<input
												checked={!!customAnswers[field.label]}
												className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
												onChange={(e) => setCustomAnswers({ ...customAnswers, [field.label]: e.target.checked })}
												type="checkbox"
											/>
											<span className="font-bold text-sm text-foreground">Ya, saya setuju</span>
										</label>
									)}
								</div>
							))}

							<div className="h-px bg-border/50 my-2" />

							{[
								{ id: "name", label: "NAMA LENGKAP", type: "text", placeholder: "Contoh: John Doe", key: "name" },
								{ id: "phone", label: "WHATSAPP / TELEPON", type: "tel", placeholder: "0812...", key: "phone" },
								{ id: "email", label: "ALAMAT EMAIL", type: "email", placeholder: "nama@email.com", key: "email" },
							].map(({ id, label, type, placeholder, key }) => (
								<div className="space-y-2 group" key={id}>
									<label
										className="font-black text-muted-foreground text-[10px] uppercase tracking-widest px-1 transition-colors group-focus-within:text-primary"
										htmlFor={id}
									>
										{label} *
									</label>
									<input
										className="w-full rounded-2xl bg-muted/30 p-4 font-bold text-[15px] text-foreground outline-none border-2 border-transparent focus:border-primary/20 focus:bg-background transition-all shadow-sm"
										id={id}
										onChange={(e) =>
											setCustomerForm({ ...customerForm, [key]: e.target.value })
										}
										placeholder={placeholder}
										required
										type={type}
										value={(customerForm as any)[key]}
									/>
								</div>
							))}
							<div className="space-y-2 group">
								<label
									className="font-black text-muted-foreground text-[10px] uppercase tracking-widest px-1 transition-colors group-focus-within:text-primary"
									htmlFor="notes"
								>
									CATATAN KHUSUS (OPSIONAL)
								</label>
								<textarea
									className="w-full rounded-2xl bg-muted/30 p-4 font-bold text-[15px] text-foreground outline-none border-2 border-transparent focus:border-primary/20 focus:bg-background transition-all min-h-[100px] resize-none shadow-sm"
									id="notes"
									onChange={(e) =>
										setCustomerForm({ ...customerForm, notes: e.target.value })
									}
									placeholder="Contoh: Meja pojok, kursi bayi, dll..."
									value={customerForm.notes}
								/>
							</div>
						</div>
					</div>
				)}

				{/* ── STEP 4: Payment Selection & Summary ── */}
				{step === 4 && (
					<div className="space-y-6 pb-40 animate-in fade-in duration-500">
						<div className="text-center pt-2">
							<h2 className="font-extrabold text-foreground text-xl tracking-tight mb-1">Review & Bayar</h2>
							<p className="text-muted-foreground text-xs font-medium">Periksa kembali pesanan Anda</p>
						</div>

						{/* Order summary card */}
						<div className="rounded-[32px] border-2 border-muted bg-card p-6 shadow-sm space-y-5">
							<div className="flex items-center justify-between border-b border-dashed border-border pb-4">
								<h3 className="font-black text-xs uppercase tracking-wider text-muted-foreground">Order Kami</h3>
								<div className="px-3 py-1 bg-muted rounded-full text-[10px] font-bold">{cartCount} Item</div>
							</div>
							
							<div className="space-y-4">
								{cart.map((item) => (
									<div className="flex justify-between items-start gap-4" key={item.productId}>
										<div className="flex flex-col">
											<span className="font-bold text-sm text-foreground line-clamp-1">{item.name}</span>
											<span className="text-[10px] font-bold text-muted-foreground uppercase">{item.quantity} x {fmt(item.price)}</span>
										</div>
										<span className="font-black text-sm tabular-nums">{fmt(item.price * item.quantity)}</span>
									</div>
								))}
							</div>

							<div className="pt-4 border-t-2 border-dashed border-muted flex justify-between items-center">
								<span className="font-black text-xs text-muted-foreground uppercase">TOTAL TAGIHAN</span>
								<span className="font-black text-2xl tracking-tighter" style={{ color: themeColor }}>{fmt(cartTotal)}</span>
							</div>
							
							<div className="bg-primary/[0.03] border border-primary/5 rounded-2xl p-4 space-y-1.5 shadow-inner-sm">
								<div className="flex justify-between items-center text-[11px] font-bold">
									<span className="text-muted-foreground">TANGGAL:</span>
									<span className="text-foreground">{selectedDate ? formatDateLong(selectedDate) : "—"}</span>
								</div>
								<div className="flex justify-between items-center text-[11px] font-bold">
									<span className="text-muted-foreground">TAMU:</span>
									<span className="text-foreground">{guestCount} Orang</span>
								</div>
							</div>
						</div>

						{/* Payment method */}
						<div className="space-y-3 pt-2">
							<h3 className="font-black text-[10px] text-muted-foreground tracking-widest uppercase px-1">PIlih METODE BAYAR</h3>
							<div className="grid gap-3">
								{(settings.paymentMethods && settings.paymentMethods.length > 0
									? settings.paymentMethods
									: ["qris", "bank_transfer"]
								).map((pm: string) => {
									const labels: Record<string, string> = {
										qris: "QRIS STATIS / DYNAMIC",
										bank_transfer: "TRANSFER BANK (MANUAL)",
										cash: "CASH / BAYAR DI TEMPAT",
									};
									const isSeld = selectedPayment === pm;
									return (
										<button
											className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all ${
												isSeld
													? "border-primary/40 bg-primary/[0.03] shadow-sm scale-[1.02]"
													: "border-muted bg-card hover:bg-muted/30"
											}`}
											key={pm}
											onClick={() => setSelectedPayment(pm)}
											type="button"
										>
											<div
												className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
													isSeld ? "border-primary" : "border-muted-foreground/30"
												}`}
											>
												{isSeld && (
													<div className="h-2.5 w-2.5 rounded-full bg-primary animate-in zoom-in-50" />
												)}
											</div>
											<div className="flex-1">
												<span className="font-black text-[11px] tracking-tight text-foreground uppercase">{labels[pm] || pm}</span>
											</div>
										</button>
									);
								})}
							</div>
						</div>
					</div>
				)}

				{/* ── Fixed Bottom Navigation ── */}
				{step < 5 && (
					<div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md px-4 pt-4 pb-10 safe-area-bottom shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.15)] border-t border-border/50 z-40 max-w-md mx-auto">
						<div className="flex gap-4">
							<button
								className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4.5 font-black text-sm text-white shadow-xl shadow-primary/20 transition-all hover:opacity-95 active:scale-95 disabled:opacity-40 disabled:shadow-none ${isSubmitting ? "cursor-not-allowed" : ""}`}
								disabled={
									(step === 1 && cartCount === 0) ||
									(step === 2 && !selectedDate) ||
									(step === 3 && (
										!customerForm.name || 
										!customerForm.phone || 
										!customerForm.email ||
										(settings.customFields || []).some((f: any) => f.required && !customAnswers[f.label])
									)) ||
									(step === 4 && (!selectedPayment || isSubmitting))
								}
								onClick={() => {
									if (step === 4) {
										handleSubmitBooking();
									} else {
										setStep((s) => s + 1);
									}
								}}
								style={{ background: themeColor }}
								type="button"
							>
								{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
								{step === 0 && "LANJUT PILIH MENU"}
								{step === 1 && (cartCount === 0 ? "Pilih Menu Dulu" : "PILIH TANGGAL DATANG")}
								{step === 2 && (selectedDate ? "ISI DATA PENERIMA" : "PILIH TANGGAL DULU")}
								{step === 3 && "LANJUT KE PEMBAYARAN"}
								{step === 4 && (isSubmitting ? "DIPROSES..." : "KONFIRMASI BOOKING")}
								<ChevronRight className={`h-4 w-4 ${isSubmitting ? 'hidden' : 'block'}`} />
							</button>
						</div>
					</div>
				)}
			</div>
		</MobileWrapper>
	);
}
