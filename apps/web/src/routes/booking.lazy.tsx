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
		<div className="flex items-center justify-center gap-0 mb-6 px-2">
			{STEP_LABELS.map((label, i) => (
				<div className="flex items-center" key={i}>
					<div className="flex flex-col items-center">
						<div
							className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
								i < current
									? "bg-primary text-primary-foreground"
									: i === current
									? "bg-primary text-primary-foreground ring-2 ring-primary/30"
									: "bg-muted text-muted-foreground"
							}`}
						>
							{i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
						</div>
						<span
							className={`mt-1 text-[9px] font-bold hidden sm:block whitespace-nowrap ${
								i === current ? "text-primary" : "text-muted-foreground"
							}`}
						>
							{label}
						</span>
					</div>
					{i < STEP_LABELS.length - 1 && (
						<div
							className={`h-0.5 w-8 sm:w-12 transition-all ${
								i < current ? "bg-primary" : "bg-muted"
							}`}
						/>
					)}
				</div>
			))}
		</div>
	);
}

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
	const [proofImage, setProofImage] = useState<string>("");
	const [isUploadingProof, setIsUploadingProof] = useState(false);

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

	if (!settings?.isActive) {
		return (
			<div className="flex h-screen items-center justify-center bg-background p-6 text-center">
				<div>
					<h1 className="font-bold text-2xl text-foreground">Halaman Tidak Aktif</h1>
					<p className="mt-2 text-muted-foreground">Maaf, halaman pemesanan sedang tidak tersedia.</p>
				</div>
			</div>
		);
	}

	const themeColor = settings.themeColor || "#1a2332";

	// ── Step 6: Finished ──
	if (step === 6) {
		const booking = confirmedBooking || completedBooking;
		return (
			<div className="min-h-screen bg-background">
				<div
					className="h-28 w-full"
					style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
				/>
				<div className="mx-auto max-w-md px-4 -mt-10 pb-16">
					<div className="rounded-2xl border border-border bg-card p-6 shadow-lg text-center">
						<div
							className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
							style={{ background: `${themeColor}20` }}
						>
							<CheckCircle2 className="h-8 w-8" style={{ color: themeColor }} />
						</div>
						<h2 className="font-bold text-foreground text-xl">Booking Berhasil!</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Terima kasih, pesanan Anda telah diterima.
						</p>

						{booking && (
							<>
								<div
									className="mt-4 rounded-xl py-3 px-4 font-mono font-bold text-lg"
									style={{ background: `${themeColor}15`, color: themeColor }}
								>
									#{booking.bookingCode || "—"}
								</div>

								<div className="mt-4 space-y-2 text-left text-sm">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Tanggal</span>
										<span className="font-medium">{formatDateLong(booking.bookingDate)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Nama</span>
										<span className="font-medium">{booking.customerName}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Total</span>
										<span className="font-bold">{fmt(booking.totalAmount)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted-foreground">Pembayaran</span>
										<span className="font-medium capitalize">
											{booking.paymentMethod?.replace("_", " ")}
										</span>
									</div>
								</div>

								{/* Payment instructions */}
								{settings.bankDetails && (
									<div className="mt-4 rounded-xl bg-muted/50 p-4 text-left text-sm">
										<p className="font-bold text-foreground text-xs uppercase tracking-widest mb-2">
											Instruksi Pembayaran
										</p>
										<pre className="whitespace-pre-wrap font-sans text-muted-foreground text-xs leading-relaxed">
											{settings.bankDetails}
										</pre>
									</div>
								)}

								<button
									className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95"
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
							</>
						)}
					</div>
				</div>
			</div>
		);
	}

	const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

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
		} finally {
			setIsUploadingProof(false);
		}
	};

	const handleFinishBooking = async () => {
		const booking = confirmedBooking || completedBooking;
		if (!booking) return;

		if (selectedPayment === "bank_transfer" && !proofImage) {
			toast.error("Wajib mengunggah bukti pembayaran");
			return;
		}

		setIsSubmitting(true);
		try {
			if (proofImage && booking._id) {
				await uploadPaymentProof({
					id: booking._id,
					storageId: proofImage,
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

	// ── Step 5: Confirmation ──
	if (step === 5) {
		const booking = confirmedBooking || completedBooking;
		const qrisUrl = settings.qrisImage || siteSettings?.qrisImage;

		return (
			<div className="min-h-screen bg-background">
				<div
					className="h-28 w-full"
					style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
				/>
				<div className="mx-auto max-w-md px-4 -mt-10 pb-16">
					<div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
						<h2 className="font-bold text-foreground text-xl text-center mb-6">Konfirmasi Pembayaran</h2>

						{selectedPayment === "qris" && (
							<div className="space-y-6">
								<div className="mx-auto h-64 w-64 overflow-hidden rounded-2xl border-2 border-primary/20 p-2 bg-white">
									{qrisUrl ? (
										<img alt="QRIS" className="h-full w-full object-contain" src={qrisUrl} />
									) : (
										<div className="flex h-full w-full items-center justify-center text-center p-4 text-muted-foreground text-sm">
											Gambar QRIS belum diatur. Silakan hubungi admin.
										</div>
									)}
								</div>
								<div className="text-center space-y-2">
									<p className="font-bold text-sm">Total: {fmt(cartTotal)}</p>
									<p className="text-xs text-muted-foreground">
										Silakan scan QRIS di atas dan selesaikan pembayaran.
									</p>
								</div>
								<button
									className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
									onClick={() => setStep(5)}
									style={{ background: themeColor }}
									type="button"
								>
									Saya Sudah Bayar
								</button>
							</div>
						)}

						{selectedPayment === "bank_transfer" && (
							<div className="space-y-6">
								<div className="rounded-xl bg-muted/50 p-4 border border-border">
									<p className="font-bold text-xs text-muted-foreground uppercase tracking-widest mb-2">
										Transfer Ke:
									</p>
									<pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
										{settings.bankDetails || "Detail rekening belum diatur."}
									</pre>
									<p className="mt-3 font-bold text-sm">Total: {fmt(cartTotal)}</p>
								</div>

								<div className="space-y-3">
									<p className="font-bold text-sm">Upload Bukti Transfer *</p>
									<div className="relative">
										{proofImage ? (
											<div className="relative h-40 w-full overflow-hidden rounded-xl border border-primary/30">
												<img
													alt="Proof"
													className="h-full w-full object-cover"
													src={proofImage.startsWith("http") ? proofImage : undefined}
												/>
												<button
													className="absolute top-2 right-2 rounded-full bg-red-500 p-1.5 text-white"
													onClick={() => setProofImage("")}
												>
													<X className="h-4 w-4" />
												</button>
											</div>
										) : (
											<label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-all">
												<Upload className="h-8 w-8 text-muted-foreground mb-2" />
												<span className="text-xs text-muted-foreground">
													{isUploadingProof ? "Mengunggah..." : "Pilih Gambar Bukti"}
												</span>
												<input
													accept="image/*"
													className="hidden"
													onChange={handleProofUpload}
													type="file"
												/>
											</label>
										)}
									</div>
								</div>

								<button
									className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
									disabled={!proofImage || isSubmitting}
									onClick={handleFinishBooking}
									style={{ background: themeColor }}
									type="button"
								>
									{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kirim Bukti & Selesaikan"}
								</button>
							</div>
						)}

						{selectedPayment === "cash" && (
							<div className="space-y-6 text-center">
								<p className="text-sm text-muted-foreground">
									Silakan lakukan pembayaran langsung di lokasi (Cash/Tunai).
								</p>
								<div className="rounded-xl bg-muted/50 p-4 font-bold" style={{ color: themeColor }}>
									Total: {fmt(cartTotal)}
								</div>
								<button
									className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98]"
									onClick={() => setStep(6)}
									style={{ background: themeColor }}
									type="button"
								>
									Selesaikan Booking
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div
				className="relative h-32 w-full"
				style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
			/>

			<div className="mx-auto max-w-lg px-4">
				{/* Brand profile */}
				<div className="relative -mt-10 mb-6 text-center">
					<div
						className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-background shadow-lg font-bold text-3xl text-white"
						style={{ background: themeColor }}
					>
						{settings.title?.charAt(0) || "D"}
					</div>
					<h1 className="mt-3 font-bold text-foreground text-xl">{settings.title}</h1>
					{settings.description && (
						<p className="mt-1 text-muted-foreground text-sm">{settings.description}</p>
					)}
				</div>

				{/* Step progress */}
				<StepBar current={step} />

				{/* ── STEP 0: Guest Count ── */}
				{step === 0 && (
					<div className="space-y-6 pb-32">
						<h2 className="font-bold text-foreground text-base flex items-center gap-2">
							<Users className="h-5 w-5" style={{ color: themeColor }} />
							Jumlah Orang
						</h2>
						<div className="rounded-2xl border border-border bg-card p-8 shadow-sm text-center space-y-6">
							<p className="text-muted-foreground text-sm">
								Berapa banyak orang yang akan hadir?
							</p>
							<div className="flex items-center justify-center gap-6">
								<button
									className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground transition-all active:scale-95 disabled:opacity-50"
									disabled={guestCount <= 1}
									onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
									type="button"
								>
									<Minus className="h-5 w-5" />
								</button>
								<span className="text-4xl font-bold w-16" style={{ color: themeColor }}>
									{guestCount}
								</span>
								<button
									className="flex h-12 w-12 items-center justify-center rounded-full text-white transition-all active:scale-95"
									onClick={() => setGuestCount(guestCount + 1)}
									style={{ background: themeColor }}
									type="button"
								>
									<Plus className="h-5 w-5" />
								</button>
							</div>
							<p className="text-xs text-muted-foreground italic">
								* Kapasitas meja akan menyesuaikan jumlah orang.
							</p>
						</div>
					</div>
				)}

				{/* ── STEP 1: Product Selection ── */}
				{step === 1 && (
					<div className="space-y-4 pb-32">
						<h2 className="font-bold text-foreground text-base flex items-center gap-2">
							<ShoppingBag className="h-5 w-5" style={{ color: themeColor }} />
							Pilih Menu / Paket
						</h2>

						<div className="space-y-3">
							{products.map((product: any) => {
								const cartItem = cart.find((i) => i.productId === product._id);
								return (
									<div
										className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm"
										key={product._id}
									>
										<div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
											{product.image ? (
												<img
													alt={product.name}
													className="h-full w-full object-cover"
													src={product.image}
												/>
											) : (
												<div
													className="flex h-full w-full items-center justify-center font-bold text-2xl"
													style={{ color: themeColor, background: `${themeColor}15` }}
												>
													{product.name.charAt(0)}
												</div>
											)}
										</div>
										<div className="flex-1 min-w-0">
											<p className="font-bold text-foreground text-sm leading-tight">
												{product.name}
											</p>
											{product.description && (
												<p className="text-muted-foreground text-xs line-clamp-1 mt-0.5">
													{product.description}
												</p>
											)}
											<p className="font-bold text-sm mt-1" style={{ color: themeColor }}>
												{fmt(product.price)}
											</p>
										</div>
										{cartItem ? (
											<div className="flex items-center gap-2 shrink-0">
												<button
													className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-all active:scale-95"
													onClick={() => updateQty(product._id, -1)}
													type="button"
												>
													<Minus className="h-3.5 w-3.5" />
												</button>
												<span className="font-bold text-sm w-5 text-center">
													{cartItem.quantity}
												</span>
												<button
													className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all active:scale-95"
													onClick={() => addToCart(product)}
													style={{ background: themeColor }}
													type="button"
												>
													<Plus className="h-3.5 w-3.5" />
												</button>
											</div>
										) : (
											<button
												className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-all hover:opacity-90 active:scale-95"
												onClick={() => addToCart(product)}
												style={{ background: themeColor }}
												type="button"
											>
												<Plus className="h-4 w-4" />
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* ── STEP 2: Date Picker ── */}
				{step === 2 && (
					<div className="space-y-5 pb-32">
						<h2 className="font-bold text-foreground text-base flex items-center gap-2">
							<Calendar className="h-5 w-5" style={{ color: themeColor }} />
							Pilih Tanggal Booking
						</h2>

						<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
								className="rounded-2xl p-4 text-sm font-medium"
								style={{ background: `${themeColor}15`, color: themeColor }}
							>
								<CheckCircle2 className="inline h-4 w-4 mr-1.5 -mt-0.5" />
								Tanggal dipilih:{" "}
								<span className="font-bold">{formatDateLong(selectedDate)}</span>
							</div>
						)}
					</div>
				)}

				{/* ── STEP 3: Customer Info ── */}
				{step === 3 && (
					<div className="space-y-4 pb-32">
						<h2 className="font-bold text-foreground text-base">Data Diri</h2>
						<div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
							{[
								{ id: "name", label: "Nama Lengkap", type: "text", placeholder: "Nama Anda", key: "name" },
								{ id: "phone", label: "No. Telepon / WhatsApp", type: "tel", placeholder: "08xx-xxxx-xxxx", key: "phone" },
								{ id: "email", label: "Alamat Email", type: "email", placeholder: "nama@email.com", key: "email" },
							].map(({ id, label, type, placeholder, key }) => (
								<div className="space-y-1.5" key={id}>
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor={id}
									>
										{label} *
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2"
										id={id}
										onChange={(e) =>
											setCustomerForm({ ...customerForm, [key]: e.target.value })
										}
										placeholder={placeholder}
										required
										style={{ "--tw-ring-color": themeColor } as any}
										type={type}
										value={(customerForm as any)[key]}
									/>
								</div>
							))}
							<div className="space-y-1.5">
								<label
									className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
									htmlFor="notes"
								>
									Catatan / Permintaan Khusus
								</label>
								<textarea
									className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all min-h-[80px] resize-none"
									id="notes"
									onChange={(e) =>
										setCustomerForm({ ...customerForm, notes: e.target.value })
									}
									placeholder="Contoh: Meja untuk 4 orang, alergi kacang..."
									value={customerForm.notes}
								/>
							</div>
						</div>
					</div>
				)}

				{/* ── STEP 4: Payment ── */}
				{step === 4 && (
					<div className="space-y-4 pb-32">
						<h2 className="font-bold text-foreground text-base">Konfirmasi & Pembayaran</h2>

						{/* Order summary */}
						<div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
							<p className="font-bold text-xs text-muted-foreground uppercase tracking-widest">Ringkasan Pesanan</p>
							<div className="space-y-2">
								{cart.map((item) => (
									<div className="flex justify-between text-sm" key={item.productId}>
										<span className="text-foreground">
											{item.name}{" "}
											<span className="text-muted-foreground">×{item.quantity}</span>
										</span>
										<span className="font-medium">
											{fmt(item.price * item.quantity)}
										</span>
									</div>
								))}
							</div>
							<div className="border-t border-border pt-2 flex justify-between font-bold">
								<span>Total</span>
								<span style={{ color: themeColor }}>{fmt(cartTotal)}</span>
							</div>
							<div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Tanggal</span>
									<span className="font-medium">{selectedDate ? formatDateLong(selectedDate) : "—"}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Nama</span>
									<span className="font-medium">{customerForm.name}</span>
								</div>
							</div>
						</div>

						{/* Payment method */}
						<div className="space-y-2">
							<p className="font-bold text-xs text-muted-foreground uppercase tracking-widest">
								Metode Pembayaran
							</p>
							<div className="space-y-2">
								{(settings.paymentMethods && settings.paymentMethods.length > 0
									? settings.paymentMethods
									: ["qris", "bank_transfer"]
								).map((pm: string) => {
									const labels: Record<string, string> = {
										qris: "QRIS",
										bank_transfer: "Transfer Bank",
										cash: "Cash / Tunai",
									};
									return (
										<button
											className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
												selectedPayment === pm
													? "ring-1 border-primary bg-primary/5 ring-primary"
													: "border-border bg-card hover:bg-muted/50"
											}`}
											key={pm}
											onClick={() => setSelectedPayment(pm)}
											type="button"
										>
											<div
												className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
													selectedPayment === pm ? "border-primary" : "border-muted-foreground/40"
												}`}
											>
												{selectedPayment === pm && (
													<div className="h-2 w-2 rounded-full bg-primary" />
												)}
											</div>
											<span className="font-medium text-sm">{labels[pm] || pm}</span>
										</button>
									);
								})}
							</div>
						</div>

						{settings.bankDetails && selectedPayment !== "cash" && (
							<div className="rounded-xl bg-muted/50 p-4">
								<p className="font-bold text-xs text-muted-foreground uppercase tracking-widest mb-2">
									Instruksi Pembayaran
								</p>
								<pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
									{settings.bankDetails}
								</pre>
							</div>
						)}
					</div>
				)}

				{/* ── Fixed Bottom Navigation ── */}
				{step < 5 && (
					<div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 pt-3 pb-6 safe-area-bottom shadow-2xl">
						{/* Cart summary for step 0 */}
						{step === 1 && cartCount > 0 && (
							<div className="mb-3 flex items-center justify-between rounded-xl bg-muted/50 px-4 py-2">
								<span className="text-muted-foreground text-sm">{cartCount} item</span>
								<span className="font-bold text-sm" style={{ color: themeColor }}>
									{fmt(cartTotal)}
								</span>
							</div>
						)}

						<div className="flex gap-3">
							{step > 0 && (
								<button
									className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all active:scale-95"
									onClick={() => setStep((s) => s - 1)}
									type="button"
								>
									<ChevronLeft className="h-5 w-5" />
								</button>
							)}
							<button
								className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 ${isSubmitting ? "cursor-not-allowed" : ""}`}
								disabled={
									(step === 1 && cartCount === 0) ||
									(step === 2 && !selectedDate) ||
									(step === 3 && (!customerForm.name || !customerForm.phone || !customerForm.email)) ||
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
								{step === 0 && "Lanjut Pilih Menu →"}
								{step === 1 && (cartCount === 0 ? "Pilih menu dulu" : "Lanjut Pilih Tanggal →")}
								{step === 2 && (selectedDate ? "Lanjut Isi Data Diri →" : "Pilih tanggal dulu")}
								{step === 3 && "Lanjut ke Pembayaran →"}
								{step === 4 && (isSubmitting ? "Memproses..." : "Konfirmasi Booking")}
								{step === 5 && "Menunggu Konfirmasi..."}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
