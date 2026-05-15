import { createLazyFileRoute } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
import {
	Bell,
	Globe,
	CreditCard,
	Layout,
	MapPin,
	Printer,
	Clock,
	Save,
	Settings2,
	ShieldCheck,
	Calendar,
	Camera,
	Check,
	CheckCircle,
	Pencil,
	Trash2,
	Plus,
	User,
	Users,
	UserPlus,
	Wallet,
	X,
	KeyRound,
	AlertCircle,
	Utensils,
	History,
	FileBarChart,
	FileSignature,
	ClipboardList,
	ArrowUpRight,
	Eye,
	ChevronDown,
	CheckCircle2,
	Coins,
	ShoppingBag,
	Bike,
	Truck,
	Package,
} from "lucide-react";
import { FaceRecognition } from "@/components/auth/FaceRecognition";
import { Copy, Download, FileJson, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { compressFileToLimit, isOversized } from "@/lib/image-compress";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import {
	useHybridSiteSettings,
	useHybridStaffRoles,
	useHybridStaffUsers,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridMayarConfig } from "@/hooks/use-hybrid-ops-data";
import {
	useHybridAdminAttendanceLogs,
	useHybridPayrollReport,
} from "@/hooks/use-hybrid-attendance-data";
import {
	useHybridAdminBulkDeleteAttendanceLogs,
	useHybridAdminCreateAttendanceLog,
	useHybridAdminDeleteAttendanceLog,
	useHybridAdminUpdateAttendanceLog,
	useHybridBindUserProfile,
	useHybridCreateRole,
	useHybridCreateUser,
	useHybridDeleteRole,
	useHybridDeleteUser,
	useHybridGenerateSiteUploadUrl,
	useHybridUpdateRole,
	useHybridUpdateSiteSettings,
	useHybridUpdateUser,
} from "@/hooks/use-hybrid-write-actions";
import {
	bluetoothPrinter,
	type ReceiptPrintMode,
} from "@/lib/bluetooth-printer";
import {
	DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS,
	formatOnboardingCurrency,
	normalizeEmployeeOnboardingSettings,
	type EmployeeOnboardingFieldKey,
	type EmployeeOnboardingSettings,
} from "@/lib/employee-onboarding-settings";

type ShiftSchedule = {
	name: string;
	openTime?: string;
	closeTime?: string;
};

type OrderType = {
	id: string;
	name: string;
	label: string;
	icon?: string;
	requiresTableNumber: boolean;
	isActive: boolean;
	sortOrder: number;
};

type Platform = {
	id: string;
	name: string;
	icon?: string;
	commissionRate: number;
	isActive: boolean;
	sortOrder: number;
};

function buildShiftSchedules(
	predefinedShifts: string[],
	existingSchedules: ShiftSchedule[] = []
): ShiftSchedule[] {
	return predefinedShifts.map((name, index) => {
		const existing = existingSchedules.find((schedule) => schedule.name === name);
		return {
			name,
			openTime: existing?.openTime ?? (index === 0 ? "07:00" : ""),
			closeTime: existing?.closeTime ?? (index === 0 ? "15:00" : ""),
		};
	});
}

function ReceiptPreview({
	settings,
	storeName,
	storeAddress,
	storePhone,
	logoSrc,
	mode,
}: {
	settings: {
		receiptFooter: string;
		receiptLogo: string;
		receiptHeader: string;
		receiptShowLogo: boolean;
		receiptShowAddress: boolean;
		receiptShowPhone: boolean;
		receiptShowOrderNumber: boolean;
		receiptShowCustomerName: boolean;
		receiptShowCashierName: boolean;
		receiptShowNotes: boolean;
		receiptFontSize: string;
	};
	storeName: string;
	storeAddress: string;
	storePhone: string;
	logoSrc?: string;
	mode: ReceiptPrintMode;
}) {
	const fontClass = useMemo(() => {
		if (settings.receiptFontSize === "small") return "text-[10px]";
		if (settings.receiptFontSize === "large") return "text-[12px]";
		return "text-[11px]";
	}, [settings.receiptFontSize]);

	const headerText = settings.receiptHeader || storeName || "YUMI POS";
	const paidItems = [
		{
			qty: 1,
			name: "TENTREM KOFFIE CLASSIC",
			variant: "Size Large, Less Sugar, Oat Milk",
			price: "25.000",
			total: "25.000",
		},
		{
			qty: 2,
			name: "CROISSANT BUTTER",
			variant: "Hangat",
			price: "9.000",
			total: "18.000",
			discounted: true,
			originalTotal: "36.000",
		},
	];
	const kitchenItems = [
		{ qty: 2, name: "TENTREM KOFFIE CLASSIC", variant: "Less Sugar, Oat Milk" },
		{ qty: 1, name: "CROISSANT BUTTER", variant: "Hangat" },
	];
	const infoRows = [
		settings.receiptShowOrderNumber ? ["ORDER", "ORD-D-6034"] : null,
		[null, "#001 / DINE IN"],
		settings.receiptShowCashierName ? ["KASIR", "AYU"] : null,
		settings.receiptShowCashierName ? ["SHIFT", "SORE"] : null,
		["WAKTU", "31/03/2026 15:09"],
		mode === "paid" ? ["BAYAR", "QRIS"] : null,
		mode === "open_bill" ? ["STATUS", "OPEN BILL"] : null,
		["TIPE", "MAKAN DI SINI"],
		["MEJA", "07"],
		settings.receiptShowCustomerName ? ["PELANGGAN", "PELANGGAN UMUM"] : null,
	].filter(Boolean) as Array<[string | null, string]>;
	const receiptKindLabel = " / DINE IN";
	const statusLabel =
		mode === "kitchen"
			? "TIKET KITCHEN"
			: mode === "open_bill"
				? "OPEN BILL"
				: "LUNAS";
	const statusTone =
		mode === "kitchen"
			? "bg-amber-100 text-amber-700"
			: mode === "open_bill"
				? "bg-orange-100 text-orange-700"
				: "bg-emerald-100 text-emerald-700";
	const promotionLabels =
		mode === "kitchen"
			? []
			: ["HAPPY HOUR - KOPI SORE", "VOUCHER - MEMBER 10%"];

	return (
		<div className="space-y-4 rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,244,245,0.92))] p-4 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
						Preview Struk
					</h4>
					<p className="text-muted-foreground text-xs">
						Tampilan {mode === "kitchen" ? "tiket kitchen" : "struk"} berubah real-time sesuai pengaturan saat ini.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<span className={`rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-widest ${statusTone}`}>
						{statusLabel}
					</span>
					<span className="rounded-full bg-primary/10 px-3 py-1 font-bold text-[10px] uppercase tracking-widest text-primary">
						Realtime
					</span>
				</div>
			</div>

			<div className="flex justify-center">
				<div className="w-full max-w-[330px] rounded-[30px] bg-[radial-gradient(circle_at_top,#3f3f46,#18181b_68%)] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
					<div className="rounded-[22px] bg-white px-4 py-5 shadow-inner">
						<div className={`font-mono text-zinc-900 leading-relaxed ${fontClass}`}>
							<div className="space-y-1.5 text-center">
								{settings.receiptShowLogo && logoSrc ? (
									<div className="flex justify-center pb-1">
										<img
											alt="Preview logo struk"
											className="max-h-14 max-w-[92px] object-contain grayscale contrast-125"
											src={logoSrc}
										/>
									</div>
								) : null}
								<p className="font-bold text-[13px] uppercase tracking-[0.22em]">
									{headerText}
								</p>
								{settings.receiptShowAddress && storeAddress ? (
									<p className="text-[10px] leading-snug text-zinc-600">
										{storeAddress}
									</p>
								) : null}
								{settings.receiptShowPhone && storePhone ? (
									<p className="text-[10px] text-zinc-600">{storePhone}</p>
								) : null}
							</div>

							<div className="my-3 border-zinc-300 border-t border-dashed" />

							<div className="space-y-1">
								{infoRows.map(([label, value]) => (
									<div className="flex items-start justify-between gap-3" key={value}>
										<span className="text-zinc-500">{label ?? "STRUK"}</span>
										<span className="max-w-[58%] text-right font-semibold">
											{label === null && mode !== "kitchen" ? receiptKindLabel : value}
										</span>
									</div>
								))}
							</div>

							<div className="my-3 border-zinc-300 border-t border-dashed" />

							{promotionLabels.length > 0 ? (
								<>
									<div className="space-y-1.5 text-center">
										{promotionLabels.map((label) => (
											<p className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-700" key={label}>
												{label}
											</p>
										))}
									</div>
									<div className="my-3 border-zinc-300 border-t border-dashed" />
								</>
							) : null}

							{mode === "kitchen" ? (
								<div className="space-y-2">
									<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
										Item Yang Dibuat
									</p>
									<div className="border-zinc-300 border-t border-dashed" />
									{kitchenItems.map((item) => (
										<div className="space-y-1.5" key={item.name}>
											<p className="font-bold uppercase leading-snug">
												{item.qty}x {item.name}
											</p>
											<p className="pl-3 text-[10px] leading-snug text-zinc-500">
												- {item.variant}
											</p>
										</div>
									))}
								</div>
							) : (
								<>
									<div className="space-y-1.5">
										<div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
											<span>Item</span>
											<span>Total</span>
										</div>
										<div className="border-zinc-300 border-t border-dashed" />
										{paidItems.map((item) => (
											<div className="space-y-1.5" key={item.name}>
												<div className="flex items-start justify-between gap-3">
													<span className="max-w-[72%] font-bold uppercase leading-snug">
														{item.name}
													</span>
													<span className="shrink-0 font-bold">{item.total}</span>
												</div>
										<p className="text-zinc-500">
											{item.qty} x {item.price}{item.discounted ? ` ~~${item.originalTotal}~~` : ""}
										</p>
												{item.variant ? (
													<p className="pl-3 text-[10px] leading-snug text-zinc-500">
														+ {item.variant}
													</p>
												) : null}
											</div>
										))}
									</div>

									<div className="my-3 border-zinc-300 border-t border-dashed" />

									<div className="space-y-1">
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">SUBTOTAL</span>
											<span>RP 61.000</span>
										</div>
										<div className="flex justify-between gap-3 text-zinc-700">
											<span>PROMO / HAPPY HOUR</span>
											<span>-RP 6.000</span>
										</div>
										<div className="flex justify-between gap-3 text-zinc-700">
											<span>VOUCHER / DISKON</span>
											<span>-RP 6.100</span>
										</div>
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">PAJAK</span>
											<span>RP 0</span>
										</div>
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">SERVICE CHARGE</span>
											<span>RP 3.000</span>
										</div>
										<div className="border-zinc-300 border-t border-dashed pt-1" />
										<div className="flex justify-between gap-3 font-bold text-[13px]">
											<span>TOTAL</span>
											<span>{mode === "open_bill" ? "RP 49.900" : "RP 49.900"}</span>
										</div>
									</div>
								</>
							)}

							{settings.receiptShowNotes ? (
								<>
									<div className="my-3 border-zinc-300 border-t border-dashed" />
									<div className="space-y-1">
										<p className="font-bold uppercase tracking-[0.2em]">
											Catatan
										</p>
										<p className="leading-snug text-zinc-600">
											Pastikan less sugar dan tanpa sedotan.
										</p>
									</div>
								</>
							) : null}

							<div className="my-3 border-zinc-300 border-t border-dashed" />

							<div className="space-y-1.5 text-center">
								<p className="font-bold uppercase tracking-[0.22em]">
									{settings.receiptFooter || "Terima kasih atas kunjungan Anda!"}
								</p>
								{mode === "kitchen" ? (
									<p className="font-bold text-[10px] uppercase tracking-[0.18em] text-zinc-500">
										TANPA HARGA - UNTUK PRODUKSI
									</p>
								) : null}
								<p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400">
									{mode === "kitchen" ? "tiket produksi 58mm" : "preview thermal 58mm"}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

const AVAILABLE_PERMISSIONS = [
	{ id: "orders:view", label: "Lihat Pesanan" },
	{ id: "orders:create", label: "Buat Pesanan" },
	{ id: "orders:edit", label: "Edit Pesanan" },
	{ id: "pos:access", label: "Akses Kasir & Pembayaran" },
	{ id: "kitchen:view", label: "Lihat Antrean Dapur/Barista" },
	{ id: "kitchen:manage", label: "Kelola Status Pesanan Dapur" },
	{ id: "products:manage", label: "Kelola Produk & Kategori" },
	{ id: "inventory:manage", label: "Kelola Stok & Resep" },
	{ id: "purchasing:manage", label: "Kelola Pembelian & Supplier" },
	{ id: "attendance:view", label: "Lihat Laporan Absensi" },
	{ id: "attendance:manage", label: "Kelola Data Absensi & Geofencing" },
	{ id: "customers:manage", label: "Kelola Data Pelanggan & Member" },
	{ id: "analytics:view", label: "Lihat Analitik & Performa" },
	{ id: "finance:view", label: "Lihat Laporan Keuangan" },
	{ id: "settings:manage", label: "Kelola Pengaturan Sistem" },
	{ id: "users:manage", label: "Kelola User & Role" },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOME_PIN_REGEX = /^\d{6}$/;
type SettingsPageMode = "settings" | "operational-team";
type OperationalTeamTab =
	| "users"
	| "attendance-report"
	| "attendance-logs"
	| "payroll"
	| "register";
type BonusTargetBasis = "shift" | "daily" | "monthly";
type BonusTierConfig = { thresholdPct: number; bonusAmount: number };
type RoleBonusTargetConfig = {
	basis: BonusTargetBasis;
	tiers: BonusTierConfig[];
};

const DEFAULT_BONUS_THRESHOLDS = [100, 150, 200] as const;

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
	return EMAIL_REGEX.test(normalizeEmail(email));
}

function isValidHomePin(pin: string) {
	return HOME_PIN_REGEX.test(pin);
}

function createDefaultRoleBonusTargetConfig(): RoleBonusTargetConfig {
	return {
		basis: "shift",
		tiers: DEFAULT_BONUS_THRESHOLDS.map((thresholdPct) => ({
			thresholdPct,
			bonusAmount: 0,
		})),
	};
}

function normalizeRoleBonusTargetConfig(config?: Partial<RoleBonusTargetConfig>): RoleBonusTargetConfig {
	const fallback = createDefaultRoleBonusTargetConfig();
	const basis: BonusTargetBasis =
		config?.basis === "daily" || config?.basis === "monthly" || config?.basis === "shift"
			? config.basis
			: fallback.basis;
	const tiersSource =
		config?.tiers && config.tiers.length > 0 ? config.tiers : fallback.tiers;
	const tiers = [...tiersSource]
		.map((tier) => ({
			thresholdPct: Number(tier.thresholdPct) || 0,
			bonusAmount: Number(tier.bonusAmount) || 0,
		}))
		.filter((tier) => tier.thresholdPct > 0)
		.sort((a, b) => a.thresholdPct - b.thresholdPct);

	return {
		basis,
		tiers:
			tiers.length > 0
				? tiers
				: DEFAULT_BONUS_THRESHOLDS.map((thresholdPct) => ({
						thresholdPct,
						bonusAmount: 0,
					})),
	};
}

function getBonusBasisLabel(basis: BonusTargetBasis) {
	if (basis === "daily") return "Per Hari";
	if (basis === "monthly") return "Per Bulan";
	return "Per Shift";
}

function formatRoleBonusSummary(config?: Partial<RoleBonusTargetConfig>) {
	const normalized = normalizeRoleBonusTargetConfig(config);
	const tiersSummary = normalized.tiers
		.map((tier) => `${Math.round(tier.thresholdPct)}%: Rp${tier.bonusAmount.toLocaleString("id-ID")}`)
		.join(" | ");
	return `${getBonusBasisLabel(normalized.basis)} - ${tiersSummary}`;
}

type AiModelConfig = {
	ocrVisionModel: string;
	chatTextModel: string;
	synthesisModel: string;
	analyticsModel: string;
	fallbackModel: string;
};

function normalizeAiModelId(model?: string) {
	const raw = (model || "").trim();
	if (!raw) return "";
	if (raw.startsWith("gemini/")) return raw;
	if (raw.startsWith("gemini-")) return `gemini/${raw}`;
	return raw;
}

function normalizeAiModelConfig(config?: Partial<AiModelConfig>): AiModelConfig {
	return {
		ocrVisionModel:
			normalizeAiModelId(config?.ocrVisionModel) ||
			DEFAULT_AI_MODEL_CONFIG.ocrVisionModel,
		chatTextModel:
			normalizeAiModelId(config?.chatTextModel) ||
			DEFAULT_AI_MODEL_CONFIG.chatTextModel,
		synthesisModel:
			normalizeAiModelId(config?.synthesisModel) ||
			DEFAULT_AI_MODEL_CONFIG.synthesisModel,
		analyticsModel:
			normalizeAiModelId(config?.analyticsModel) ||
			DEFAULT_AI_MODEL_CONFIG.analyticsModel,
		fallbackModel:
			normalizeAiModelId(config?.fallbackModel) ||
			DEFAULT_AI_MODEL_CONFIG.fallbackModel,
	};
}

const AI_MODEL_OPTIONS = [
	"claude-haiku-4-5",
	"deepseek-v3-2",
	"glm-4-7",
	"kimi-k2-5-260127",
	"seed-2-0-lite",
	"seed-2-0-mini",
	"seed-2-0-pro",
	"gemini/gemini-2.0-flash",
	"gemini/gemini-2.0-flash-lite",
	"gemini/gemini-2.5-flash",
	"gemini/gemini-2.5-flash-lite",
	"gemini/gemini-2.5-pro",
	"gemini/gemini-3-flash-preview",
	"gemini/gemini-3-pro-preview",
	"MiniMax-M2.7-highspeed",
	"minimax/speech-2.8-hd",
	"gpt-4.1",
	"gpt-4.1-mini",
	"gpt-4.1-nano",
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-5",
	"gpt-5-mini",
	"gpt-5-nano",
	"gpt-5.1",
	"gpt-5.1-codex",
	"gpt-5.1-codex-mini",
	"gpt-5.2",
	"gpt-5.2-codex",
	"text-embedding-3-large",
	"text-embedding-3-small",
	"glm-5",
	"glm-5-turbo",
	"glm-5.1",
] as const;

const DEFAULT_AI_MODEL_CONFIG: AiModelConfig = {
	ocrVisionModel: "gemini/gemini-2.0-flash-lite",
	chatTextModel: "gpt-4.1-mini",
	synthesisModel: "gpt-4.1-mini",
	analyticsModel: "gpt-4.1-mini",
	fallbackModel: "gpt-4.1-mini",
};

export function SettingsPage({
	mode = "settings",
	initialOperationalTab,
}: {
	mode?: SettingsPageMode;
	initialOperationalTab?: OperationalTeamTab;
}) {
	// Site Settings
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const siteSettings = useHybridSiteSettings();
	const users = useHybridStaffUsers(refreshTrigger);
	const roles = useHybridStaffRoles(refreshTrigger);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _createUser = useHybridCreateUser();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _updateUser = useHybridUpdateUser();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const deleteUser = useHybridDeleteUser();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const createRole = useHybridCreateRole();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const updateRole = useHybridUpdateRole();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const deleteRole = useHybridDeleteRole();

	const mayarConfig = useHybridMayarConfig();
	const updateSiteSettings = useHybridUpdateSiteSettings();
	const generateUploadUrl = useHybridGenerateSiteUploadUrl();

	const [settings, setSettings] = useState({
		storeName: "Coffee Shop",
		storeAddress: "",
		storePhone: "",
		resendFromEmail: "",
		receiptFooter: "Terima kasih!",
		autoPrint: true,
		autoPrintKitchenReceipt: true,
		allowOpenBillPrint: true,
		taxRate: 0,
		serviceChargeRate: 0,
		currency: "IDR",
		timezone: "UTC+7 (Jakarta)",
		lowStockAlert: 10,
		// App Branding
		appName: "Yumi POS",
		appVersion: "1.0.0",
		developerName: "Zantara Technology",
		headerLogoUrl: "",
		faviconUrl: "",
		pwaIcon192Url: "",
		pwaIcon512Url: "",
		pwaMaskableIconUrl: "",
		seoMetaTitle: "",
		seoMetaDescription: "",
		seoMetaKeywords: "",
		seoShareTitle: "",
		seoShareDescription: "",
		seoShareImageUrl: "",
		seoCanonicalUrl: "",
		// Receipt Customization
		receiptLogo: "",
		receiptHeader: "",
		receiptShowLogo: true,
		receiptShowAddress: true,
		receiptShowPhone: true,
		receiptShowOrderNumber: true,
		receiptShowCustomerName: true,
		receiptShowCashierName: true,
		receiptShowNotes: true,
		receiptFontSize: "normal",
		attendanceLat: -6.200000,
		attendanceLng: 106.816666,
		attendanceRadius: 50,
		// Order Types
		orderTypes: [] as OrderType[],
		platforms: [] as Platform[],
	});

	const [isConnected, setIsConnected] = useState(false);
	const [printerName, setPrinterName] = useState<string | null>(null);
	const [receiptPreviewMode, setReceiptPreviewMode] =
		useState<ReceiptPrintMode>("paid");

	const [landingSettings, setLandingSettings] = useState({
		landingIcon: "Coffee",
		landingTitle: "COFFEE SHOP",
		landingDescription: "Pengalaman Kopi Premium",
		landingButtonText: "Pesan Disini",
		logoUrl: "",
		paymentPopupImage: "",
		qrisImage: "",
	});

	const [paymentSettings, setPaymentSettings] = useState({
		mayarEnabled: false,
		mayarTestMode: true,
		manualMethods: {
			cash: true,
			qris: true,
			transfer: false,
		},
	});

	const [shiftSettings, setShiftSettings] = useState({
		predefinedShifts: [] as string[],
		defaultStartingCash: 0,
		reminderMinutesBeforeClose: 15,
		autoSendShiftReportEmail: false,
		shiftSchedules: [] as ShiftSchedule[],
	});

	const [payrollGlobalConfig, setPayrollGlobalConfig] = useState({
		lateToleranceMinutes: 5,
		latePenaltyPerMinute: 1000,
		overtimeBonusPerHour: 10000,
	});

	const [reportFilter, setReportFilter] = useState({
		month: new Date().getMonth() + 1,
		year: new Date().getFullYear(),
	});

	const payrollReport = useHybridPayrollReport({
		month: reportFilter.month,
		year: reportFilter.year,
	});

	const [selectedPayrollStaff, setSelectedPayrollStaff] = useState<any | null>(null);

	const attendanceLogs = useHybridAdminAttendanceLogs(100);

	const adminCreateLog = useHybridAdminCreateAttendanceLog();
	const adminUpdateLog = useHybridAdminUpdateAttendanceLog();
	const adminDeleteLog = useHybridAdminDeleteAttendanceLog();
	const adminBulkDeleteLogs = useHybridAdminBulkDeleteAttendanceLogs();

	const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
	const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
	const [showCreateLog, setShowCreateLog] = useState(false);
	const [editingLog, setEditingLog] = useState<any>(null);
	const [newLog, setNewLog] = useState({
		userId: "" as string,
		type: "check_in" as "check_in" | "check_out",
		date: new Date().toISOString().slice(0, 10),
		time: new Date().toTimeString().slice(0, 5),
		notes: "",
		shiftName: "",
	});

	const toggleSelectLog = (id: string) => {
		setSelectedLogIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			return next;
		});
	};
	const toggleSelectAll = () => {
		if (!attendanceLogs) return;
		if (selectedLogIds.size === attendanceLogs.length) {
			setSelectedLogIds(new Set());
		} else {
			setSelectedLogIds(new Set(attendanceLogs.map((l: any) => l._id)));
		}
	};

	const handleBulkDelete = async () => {
		if (selectedLogIds.size === 0) return;
		setConfirmConfig({
			isOpen: true,
			title: `Hapus ${selectedLogIds.size} Log?`,
			message: "Data absensi yang dihapus tidak dapat dikembalikan.",
			variant: "danger",
			onConfirm: async () => {
				try {
					await adminBulkDeleteLogs({ ids: Array.from(selectedLogIds) as any });
					toast.success(`${selectedLogIds.size} log dihapus`);
					setSelectedLogIds(new Set());
				} catch (e) { toast.error("Gagal menghapus"); }
			},
		});
	};

	const handleCreateLogSubmit = async () => {
		if (!newLog.userId) { toast.error("Pilih staff"); return; }
		const [y, m, d] = newLog.date.split("-").map(Number);
		const [h, mi] = newLog.time.split(":").map(Number);
		const ts = new Date(y, m - 1, d, h, mi).getTime();
		try {
			await adminCreateLog({
				userId: newLog.userId as any,
				type: newLog.type,
				timestamp: ts,
				notes: newLog.notes || undefined,
				shiftName: newLog.shiftName || undefined,
			});
			toast.success("Log berhasil ditambahkan");
			setShowCreateLog(false);
			setNewLog({ userId: "", type: "check_in", date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5), notes: "", shiftName: "" });
		} catch (e) { toast.error("Gagal menambah log"); }
	};

	const handleSaveEditLog = async () => {
		if (!editingLog) return;
		const [y, m, d] = editingLog.date.split("-").map(Number);
		const [h, mi] = editingLog.time.split(":").map(Number);
		const ts = new Date(y, m - 1, d, h, mi).getTime();
		try {
			await adminUpdateLog({
				id: editingLog._id,
				type: editingLog.type,
				timestamp: ts,
				notes: editingLog.notes || undefined,
				shiftName: editingLog.shiftName || undefined,
			});
			toast.success("Log diperbarui");
			setEditingLog(null);
		} catch (e) { toast.error("Gagal memperbarui log"); }
	};

	const exportPayrollCSV = () => {
		if (!payrollReport?.rows) return;
		const headers = ["Staff","Role","Shift","Telat (m)","Gaji Tetap","Gaji Shift","Tunjangan","Lembur","Bonus Target","Denda","Total"];
		const rows = payrollReport.rows.map((s: any) => [
			s.name, s.roleName, s.sessionCount||0, s.totalLateMinutes||0,
			s.monthlyFixedSalary||0, s.totalShiftSalary||0, s.totalAllowance||0,
			s.totalOvertimeBonus||0, s.totalTargetBonus||0, s.totalPenalty||0, s.netSalary||0,
		]);
		const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url; a.download = `laporan-absensi-${reportFilter.month}-${reportFilter.year}.csv`;
		a.click(); URL.revokeObjectURL(url);
		toast.success("CSV berhasil diunduh");
	};


	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			minimumFractionDigits: 0,
		}).format(amount);
	};

	const [employeeOnboardingSettings, setEmployeeOnboardingSettings] = useState<EmployeeOnboardingSettings>(() =>
		normalizeEmployeeOnboardingSettings(DEFAULT_EMPLOYEE_ONBOARDING_SETTINGS)
	);

	const [customerOrderingSettings, setCustomerOrderingSettings] = useState({
		enabled: true,
		welcomeTitle: "Welcome",
		welcomeSubtitle: "Pesan menu favoritmu langsung dari meja.",
		welcomeButtonLabel: "Mulai pesan",
		enablePartySizeSelection: true,
		enableFreeRefillPrompt: true,
		enableBarcodeScan: true,
		enableMenuNumberEntry: true,
		enableCatalogBrowsing: true,
		enableStaffCall: true,
		enableDessertLater: true,
		requireTableNumber: false,
		cashPaymentLabel: "Bayar di kasir",
		mayarPaymentLabel: "QRIS",
	});
	const [aiModelConfig, setAiModelConfig] =
		useState<AiModelConfig>(DEFAULT_AI_MODEL_CONFIG);

	const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});

	const [activeTab, setActiveTab] = useState<
		| "landing"
		| "pos"
		| "store"
		| "branding"
		| "system"
		| "users"
		| "yumiAI"
		| "payroll"
		| "attendance-report"
		| "attendance-logs"
		| "register"
	>(mode === "operational-team" ? (initialOperationalTab ?? "users") : "landing");

	useEffect(() => {
		setActiveTab(mode === "operational-team" ? (initialOperationalTab ?? "users") : "landing");
	}, [mode, initialOperationalTab]);

	// User/Role Form States
	const [newUser, setNewUser] = useState({
		username: "",
		password: "",
		name: "",
		roleId: "",
		homePin: "",
		slug: "",
	});
	const [newRole, setNewRole] = useState({
		name: "",
		permissions: [] as string[],
		baseHourlyRate: 0,
		baseShiftRate: 0,
		monthlyFixedSalary: 0,
		dailyAllowance: 0,
		bonusTargetConfig: createDefaultRoleBonusTargetConfig(),
		customAllowances: [] as { name: string; amount: number }[],
		_show: false,
	});
	const [editingUser, setEditingUser] = useState<{
		_id: Id<"users">;
		name: string;
		username: string;
		roleId: Id<"roles"> | "";
		isActive: boolean;
		receiveReportEmails: boolean;
		homePin: string;
		slug: string;
	} | null>(null);
	const [editingRole, setEditingRole] = useState<{
		_id: Id<"roles">;
		name: string;
		permissions: string[];
		baseHourlyRate: number;
		baseShiftRate: number;
		monthlyFixedSalary: number;
		dailyAllowance: number;
		bonusTargetConfig: RoleBonusTargetConfig;
		customAllowances: { name: string; amount: number }[];
	} | null>(null);
	const [newRolePermOpen, setNewRolePermOpen] = useState(false);
	const [editRolePermOpen, setEditRolePermOpen] = useState(false);
	const [newRoleBonusOpen, setNewRoleBonusOpen] = useState(false);
	const [editRoleBonusOpen, setEditRoleBonusOpen] = useState(false);
	const [newRoleCustomAllowOpen, setNewRoleCustomAllowOpen] = useState(false);
	const [editRoleCustomAllowOpen, setEditRoleCustomAllowOpen] = useState(false);
	const [editRolePermTarget, setEditRolePermTarget] = useState<any>(null);
	const [editRoleBonusTarget, setEditRoleBonusTarget] = useState<any>(null);
	const [editRoleCustomAllowTarget, setEditRoleCustomAllowTarget] = useState<any>(null);
	const [showFaceEnrollment, setShowFaceEnrollment] = useState(false);
	const [savingUser, setSavingUser] = useState(false);
	const [confirmConfig, setConfirmConfig] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		onConfirm: () => void;
		variant?: "danger" | "warning" | "info";
	}>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	const reportRecipients = useMemo(() => {
		if (!users) return [];
		return users
			.filter(
				(user: any) =>
					user.isActive &&
					user.receiveReportEmails === true &&
					isValidEmail(normalizeEmail(user.username || user.email || ""))
			)
			.map((user: any) => normalizeEmail(user.username || user.email || ""))
			.filter((email: string) => isValidEmail(email));
	}, [users]);

	useEffect(() => {
		if (siteSettings) {
			setLandingSettings({
				landingIcon: siteSettings.landingIcon ?? "Coffee",
				landingTitle: siteSettings.landingTitle ?? "COFFEE SHOP",
				landingDescription:
					siteSettings.landingDescription ?? "Pengalaman Kopi Premium",
				landingButtonText: siteSettings.landingButtonText ?? "Pesan Disini",
				logoUrl: siteSettings.logoUrl ?? "",
				paymentPopupImage: siteSettings.paymentPopupImage ?? "",
				qrisImage: siteSettings.qrisImage ?? "",
			});
			setSettings((prev) => ({
				...prev,
				storeName: siteSettings.storeName ?? "Coffee Shop",
				storeAddress: siteSettings.storeAddress ?? "",
				storePhone: siteSettings.storePhone ?? "",
				resendFromEmail: siteSettings.resendFromEmail ?? "",
				receiptFooter: siteSettings.receiptFooter ?? "Terima kasih!",
				autoPrint: siteSettings.autoPrint ?? true,
				autoPrintKitchenReceipt: siteSettings.autoPrintKitchenReceipt ?? true,
				allowOpenBillPrint: siteSettings.allowOpenBillPrint ?? true,
				taxRate: siteSettings.taxRate ?? 0,
				serviceChargeRate: siteSettings.serviceChargeRate ?? 0,
				appName: siteSettings.appName ?? "Yumi POS",
				appVersion: siteSettings.appVersion ?? "1.0.0",
				developerName: siteSettings.developerName ?? "Zantara Technology",
				headerLogoUrl: siteSettings.headerLogoUrl ?? "",
				faviconUrl: siteSettings.faviconUrl ?? "",
				pwaIcon192Url: siteSettings.pwaIcon192Url ?? "",
				pwaIcon512Url: siteSettings.pwaIcon512Url ?? "",
				pwaMaskableIconUrl: siteSettings.pwaMaskableIconUrl ?? "",
				seoMetaTitle: siteSettings.seoMetaTitle ?? "",
				seoMetaDescription: siteSettings.seoMetaDescription ?? "",
				seoMetaKeywords: siteSettings.seoMetaKeywords ?? "",
				seoShareTitle: siteSettings.seoShareTitle ?? "",
				seoShareDescription: siteSettings.seoShareDescription ?? "",
				seoShareImageUrl: siteSettings.seoShareImageUrl ?? "",
				seoCanonicalUrl: siteSettings.seoCanonicalUrl ?? "",
				// Receipt Customization
				receiptLogo: siteSettings.receiptLogo ?? "",
				receiptHeader: siteSettings.receiptHeader ?? "",
				receiptShowLogo: siteSettings.receiptShowLogo ?? true,
				receiptShowAddress: siteSettings.receiptShowAddress ?? true,
				receiptShowPhone: siteSettings.receiptShowPhone ?? true,
				receiptShowOrderNumber: siteSettings.receiptShowOrderNumber ?? true,
				receiptShowCustomerName: siteSettings.receiptShowCustomerName ?? true,
				receiptShowCashierName: siteSettings.receiptShowCashierName ?? true,
				receiptShowNotes: siteSettings.receiptShowNotes ?? true,
				receiptFontSize: siteSettings.receiptFontSize ?? "normal",
				attendanceLat: siteSettings.attendanceLat ?? -6.200000,
				attendanceLng: siteSettings.attendanceLng ?? 106.816666,
				attendanceRadius: siteSettings.attendanceRadius ?? 50,
				orderTypes: siteSettings.orderTypes ?? [],
				platforms: siteSettings.platforms ?? [],
			}));
			setPaymentSettings({
				mayarEnabled: siteSettings.mayarEnabled ?? false,
				mayarTestMode: siteSettings.mayarTestMode ?? true,
				manualMethods: siteSettings.paymentMethodsManual ?? {
					cash: true,
					qris: true,
					transfer: false,
				},
			});
			setShiftSettings({
				predefinedShifts: siteSettings.shiftSettings?.predefinedShifts ?? [],
				defaultStartingCash: siteSettings.shiftSettings?.defaultStartingCash ?? 0,
				reminderMinutesBeforeClose:
					siteSettings.shiftSettings?.reminderMinutesBeforeClose ?? 15,
				autoSendShiftReportEmail:
					siteSettings.shiftSettings?.autoSendShiftReportEmail ?? false,
			shiftSchedules: buildShiftSchedules(
					siteSettings.shiftSettings?.predefinedShifts ?? [],
					siteSettings.shiftSettings?.shiftSchedules ?? []
				),
			});
			setPayrollGlobalConfig({
				lateToleranceMinutes: siteSettings.payrollGlobalConfig?.lateToleranceMinutes ?? 5,
				latePenaltyPerMinute: siteSettings.payrollGlobalConfig?.latePenaltyPerMinute ?? 1000,
				overtimeBonusPerHour: siteSettings.payrollGlobalConfig?.overtimeBonusPerHour ?? 10000,
			});
			setCustomerOrderingSettings({
				enabled: siteSettings.customerOrdering?.enabled ?? true,
				welcomeTitle: siteSettings.customerOrdering?.welcomeTitle ?? "Welcome",
				welcomeSubtitle:
					siteSettings.customerOrdering?.welcomeSubtitle ??
					"Pesan menu favoritmu langsung dari meja.",
				welcomeButtonLabel:
					siteSettings.customerOrdering?.welcomeButtonLabel ?? "Mulai pesan",
				enablePartySizeSelection:
					siteSettings.customerOrdering?.enablePartySizeSelection ?? true,
				enableFreeRefillPrompt:
					siteSettings.customerOrdering?.enableFreeRefillPrompt ?? true,
				enableBarcodeScan:
					siteSettings.customerOrdering?.enableBarcodeScan ?? true,
				enableMenuNumberEntry:
					siteSettings.customerOrdering?.enableMenuNumberEntry ?? true,
				enableCatalogBrowsing:
					siteSettings.customerOrdering?.enableCatalogBrowsing ?? true,
				enableStaffCall:
					siteSettings.customerOrdering?.enableStaffCall ?? true,
				enableDessertLater:
					siteSettings.customerOrdering?.enableDessertLater ?? true,
				requireTableNumber:
					siteSettings.customerOrdering?.requireTableNumber ?? false,
				cashPaymentLabel:
					siteSettings.customerOrdering?.cashPaymentLabel ??
					"Bayar di kasir",
				mayarPaymentLabel:
					siteSettings.customerOrdering?.mayarPaymentLabel ??
					"QRIS",
			});
			setAiModelConfig(normalizeAiModelConfig(siteSettings.aiModelConfig ?? {}));
			setEmployeeOnboardingSettings(normalizeEmployeeOnboardingSettings(siteSettings.employeeOnboarding));
		}
		setIsConnected(bluetoothPrinter.isConnected());
		setPrinterName(bluetoothPrinter.getDeviceName());
	}, [siteSettings]);

	const mayarApiConfigured = mayarConfig?.configured ?? false;

	const handleConnectPrinter = async () => {
		try {
			if (!navigator.bluetooth) {
				toast.error("Browser ini tidak mendukung Web Bluetooth (gunakan Chrome/Edge).", { id: "printing" });
				return;
			}
			const name = await bluetoothPrinter.connect();
			setPrinterName(name);
			setIsConnected(true);
			toast.success(`Terhubung ke ${name}`);
		} catch (error) {
			toast.error((error as Error).message || "Gagal menghubungkan printer");
		}
	};

	const handleSave = async () => {
		if (settings.resendFromEmail && !isValidEmail(settings.resendFromEmail)) {
			toast.error("RESEND_FROM_EMAIL harus berupa alamat email yang valid");
			return;
		}

		try {
			const payload = {
				...landingSettings,
				storeName: settings.storeName,
				storeAddress: settings.storeAddress,
				storePhone: settings.storePhone,
				resendFromEmail: normalizeEmail(settings.resendFromEmail),
				receiptFooter: settings.receiptFooter,
				autoPrint: settings.autoPrint,
				autoPrintKitchenReceipt: settings.autoPrintKitchenReceipt,
				allowOpenBillPrint: settings.allowOpenBillPrint,
				// App Branding
				appName: settings.appName,
				appVersion: settings.appVersion,
				developerName: settings.developerName,
				headerLogoUrl: settings.headerLogoUrl,
				faviconUrl: settings.faviconUrl,
				pwaIcon192Url: settings.pwaIcon192Url,
				pwaIcon512Url: settings.pwaIcon512Url,
				pwaMaskableIconUrl: settings.pwaMaskableIconUrl,
				seoMetaTitle: settings.seoMetaTitle,
				seoMetaDescription: settings.seoMetaDescription,
				seoMetaKeywords: settings.seoMetaKeywords,
				seoShareTitle: settings.seoShareTitle,
				seoShareDescription: settings.seoShareDescription,
				seoShareImageUrl: settings.seoShareImageUrl,
				seoCanonicalUrl: settings.seoCanonicalUrl,
				// Mayar Payment Gateway
				mayarEnabled: paymentSettings.mayarEnabled,
				mayarTestMode: paymentSettings.mayarTestMode,
				// Manual Payment
				paymentMethodsManual: paymentSettings.manualMethods,
				taxRate: settings.taxRate,
				serviceChargeRate: settings.serviceChargeRate,
				// Order Types
				orderTypes: settings.orderTypes,
				// Platforms
				platforms: settings.platforms,
				// Receipt Customization
				receiptLogo: settings.receiptLogo,
				receiptHeader: settings.receiptHeader,
				receiptShowLogo: settings.receiptShowLogo,
				receiptShowAddress: settings.receiptShowAddress,
				receiptShowPhone: settings.receiptShowPhone,
				receiptShowOrderNumber: settings.receiptShowOrderNumber,
				receiptShowCustomerName: settings.receiptShowCustomerName,
				receiptShowCashierName: settings.receiptShowCashierName,
				receiptShowNotes: settings.receiptShowNotes,
				receiptFontSize: settings.receiptFontSize,
				attendanceLat: settings.attendanceLat,
				attendanceLng: settings.attendanceLng,
				attendanceRadius: settings.attendanceRadius,
				shiftSettings: {
					...shiftSettings,
					shiftSchedules: buildShiftSchedules(
						shiftSettings.predefinedShifts,
						shiftSettings.shiftSchedules
					),
				},
				payrollGlobalConfig,
				customerOrdering: customerOrderingSettings,
				aiModelConfig: normalizeAiModelConfig(aiModelConfig),
				employeeOnboarding: normalizeEmployeeOnboardingSettings(employeeOnboardingSettings),
			};
			console.log("Saving settings:", payload);
			await updateSiteSettings(payload);
			toast.success("Pengaturan berhasil disimpan!");
		} catch (error) {
			console.error("Save settings error:", error);
			toast.error(`Gagal menyimpan pengaturan: ${(error as Error).message}`);
		}
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const bindProfile = useHybridBindUserProfile();

	const handleCreateUser = async () => {
		const normalizedEmail = normalizeEmail(newUser.username);
		const normalizedHomePin = newUser.homePin.trim();
		if (
			!(normalizedEmail && newUser.password && newUser.name && newUser.roleId)
		) {
			toast.error("Mohon lengkapi data user");
			return;
		}
		if (!isValidEmail(normalizedEmail)) {
			toast.error("Username harus berupa email yang valid");
			return;
		}
		if (normalizedHomePin && !isValidHomePin(normalizedHomePin)) {
			toast.error("PIN akses home harus 6 digit angka");
			return;
		}
		setSavingUser(true);
		try {
			// Primary source of truth: always persist user profile to primary backend.
			const createdUserId = await _createUser({
				username: normalizedEmail,
				password: newUser.password,
				name: newUser.name,
				roleId: newUser.roleId as Id<"roles">,
				homePin: normalizedHomePin || undefined,
				slug: newUser.slug || undefined,
			});

			// Best effort sync to external auth provider.
			try {
				const result = await authClient.signUp.email({
					email: normalizedEmail,
					password: newUser.password,
					name: newUser.name,
				});
				const authUserId = result?.data?.user?.id;
				// Ignore known local stub id to prevent all users binding to the same auth id.
				if (authUserId && authUserId !== "test-id") {
					await bindProfile({
						authUserId,
						name: newUser.name,
						email: normalizedEmail,
						roleId: newUser.roleId as Id<"roles">,
					});
				}
			} catch (_authError) {
				// Do not fail the whole flow: profile is already created and can be managed from admin.
			}

			if (createdUserId) {
				setNewUser({
					username: "",
					password: "",
					name: "",
					roleId: "",
					homePin: "",
					slug: "",
				});
				toast.success("User berhasil dibuat!");
				setRefreshTrigger(n => n + 1);
			}
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal membuat user");
		} finally {
			setSavingUser(false);
		}
	};

	const handleStartEditUser = (user: any) => {
		setEditingUser({
			_id: user._id,
			name: user.name || "",
			username: user.username || "",
			roleId: user.roleId || "",
			isActive: user.isActive ?? true,
			receiveReportEmails: user.receiveReportEmails ?? false,
			homePin: "",
			slug: user.slug || "",
		});
	};

	const handleSaveEditUser = async () => {
		if (!editingUser) return;
		const normalizedEmail = normalizeEmail(editingUser.username);

		if (!editingUser.name.trim()) {
			toast.error("Nama pengguna wajib diisi");
			return;
		}

		if (!isValidEmail(normalizedEmail)) {
			toast.error("Email pengguna tidak valid");
			return;
		}

		if (!editingUser.roleId) {
			toast.error("Role pengguna wajib dipilih");
			return;
		}
		if (editingUser.homePin.trim() && !isValidHomePin(editingUser.homePin.trim())) {
			toast.error("PIN akses home harus 6 digit angka");
			return;
		}

		setSavingUser(true);
		try {
			await _updateUser({
				id: editingUser._id,
				name: editingUser.name.trim(),
				username: normalizedEmail,
				roleId: editingUser.roleId as Id<"roles">,
				isActive: editingUser.isActive,
				receiveReportEmails: editingUser.receiveReportEmails,
				homePin: editingUser.homePin.trim() || undefined,
				slug: editingUser.slug,
				faceDescriptor: (editingUser as any).faceDescriptor,
			});
			toast.success("Pengguna berhasil diperbarui");
			setRefreshTrigger(n => n + 1);
			setEditingUser(null);
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal memperbarui pengguna");
		} finally {
			setSavingUser(false);
		}
	};

	const handleStartEditRole = (role: any) => {
		setEditingRole({
			_id: role._id,
			name: role.name,
			permissions: role.permissions,
			baseHourlyRate: role.baseHourlyRate ?? 0,
			baseShiftRate: role.baseShiftRate ?? 0,
			monthlyFixedSalary: role.monthlyFixedSalary ?? 0,
			dailyAllowance: role.dailyAllowance ?? 0,
			bonusTargetConfig: normalizeRoleBonusTargetConfig(role.bonusTargetConfig),
			customAllowances: role.customAllowances ?? [],
		});
	};

	// Bonus target helpers for edit-role dialog (uses editRoleBonusTarget)
	const updateEditRoleBonusTier = (index: number, field: keyof BonusTierConfig, value: number) => {
		setEditRoleBonusTarget((prev: any) => {
			if (!prev) return prev;
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers: prev.bonusTargetConfig.tiers.map((tier: any, tierIndex: number) =>
						tierIndex === index ? { ...tier, [field]: value } : tier
					),
				},
			};
		});
	};
	const addEditRoleBonusTier = () => {
		setEditRoleBonusTarget((prev: any) => {
			if (!prev) return prev;
			const tiers = [...prev.bonusTargetConfig.tiers];
			const lastThreshold = tiers.length > 0 ? tiers[tiers.length - 1].thresholdPct : 50;
			tiers.push({ thresholdPct: lastThreshold + 50, bonusAmount: 0 });
			return { ...prev, bonusTargetConfig: { ...prev.bonusTargetConfig, tiers } };
		});
	};
	const removeEditRoleBonusTier = (index: number) => {
		setEditRoleBonusTarget((prev: any) => {
			if (!prev || prev.bonusTargetConfig.tiers.length <= 1) return prev;
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers: prev.bonusTargetConfig.tiers.filter((_: any, i: number) => i !== index),
				},
			};
		});
	};

	const handleEditRoleBonusSave = async () => {
		if (!editingRole) return;
		if (!editingRole.name.trim()) {
			toast.error("Nama role wajib diisi");
			return;
		}

		try {
			await updateRole({
				id: editingRole._id,
				name: editingRole.name,
				permissions: editingRole.permissions,
				baseHourlyRate: editingRole.baseHourlyRate,
				baseShiftRate: editingRole.baseShiftRate,
				monthlyFixedSalary: editingRole.monthlyFixedSalary,
				dailyAllowance: editingRole.dailyAllowance,
				bonusTargetConfig: normalizeRoleBonusTargetConfig(
					editingRole.bonusTargetConfig
				),
				customAllowances: editingRole.customAllowances,
			});
			toast.success("Role berhasil diperbarui");
			setRefreshTrigger(n => n + 1);
			setEditingRole(null);
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal memperbarui role");
		}
	};

	const handleAutoSaveRole = async () => {
		if (!editingRole) return;
		if (!editingRole.name.trim()) return; // silent skip, jangan tutup edit mode
		try {
			await updateRole({
				id: editingRole._id,
				name: editingRole.name,
				permissions: editingRole.permissions,
				baseHourlyRate: editingRole.baseHourlyRate,
				baseShiftRate: editingRole.baseShiftRate,
				monthlyFixedSalary: editingRole.monthlyFixedSalary,
				dailyAllowance: editingRole.dailyAllowance,
				bonusTargetConfig: normalizeRoleBonusTargetConfig(
					editingRole.bonusTargetConfig
				),
				customAllowances: editingRole.customAllowances,
			});
			setRefreshTrigger(n => n + 1);
		} catch (error) {
			console.error(error);
		}
	};

	const handleDeleteUser = (id: Id<"users">) => {
		setConfirmConfig({
			isOpen: true,
			title: "Hapus Pengguna?",
			message: "Akun ini tidak akan bisa login lagi ke sistem.",
			variant: "danger",
			onConfirm: async () => {
				setSavingUser(true);
				try {
					await deleteUser({ id });
					toast.success("User dihapus");
					setRefreshTrigger(n => n + 1);
				} catch (_error) {
					toast.error("Gagal menghapus user");
				} finally {
					setSavingUser(false);
				}
			},
		});
	};

	const toggleSelectUser = (id: string) => {
		setSelectedUserIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleSelectAllUsers = () => {
		if (!users) return;
		if (selectedUserIds.size === users.length) {
			setSelectedUserIds(new Set());
		} else {
			setSelectedUserIds(new Set(users.map((u: any) => u._id)));
		}
	};

	const handleBulkDeleteUsers = async () => {
		if (selectedUserIds.size === 0) return;
		setConfirmConfig({
			isOpen: true,
			title: `Hapus ${selectedUserIds.size} Pengguna?`,
			message: "Akun-akun ini tidak akan bisa login lagi ke sistem.",
			variant: "danger",
			onConfirm: async () => {
				setSavingUser(true);
				try {
					await Promise.all(Array.from(selectedUserIds).map((id) => deleteUser({ id })));
					toast.success(`${selectedUserIds.size} pengguna dihapus`);
					setSelectedUserIds(new Set());
					setRefreshTrigger(n => n + 1);
				} catch (_error) {
					toast.error("Gagal menghapus beberapa pengguna");
				} finally {
					setSavingUser(false);
				}
			},
		});
	};

	const handleCreateRole = async () => {
		if (!newRole.name) {
			toast.error("Nama role harus diisi");
			return;
		}
		try {
			await createRole({
				name: newRole.name,
				permissions: newRole.permissions,
				baseHourlyRate: newRole.baseHourlyRate,
				baseShiftRate: newRole.baseShiftRate,
				monthlyFixedSalary: newRole.monthlyFixedSalary,
				dailyAllowance: newRole.dailyAllowance,
				bonusTargetConfig: normalizeRoleBonusTargetConfig(
					newRole.bonusTargetConfig
				),
				customAllowances: newRole.customAllowances,
			});
			toast.success("Role baru berhasil dibuat");
			setRefreshTrigger(n => n + 1);
			setNewRole({
				name: "",
				permissions: [],
				baseHourlyRate: 0,
				baseShiftRate: 0,
				monthlyFixedSalary: 0,
				dailyAllowance: 0,
				bonusTargetConfig: createDefaultRoleBonusTargetConfig(),
				customAllowances: [],
				_show: false,
			});
		} catch (error) {
			console.error(error);
			toast.error("Gagal membuat role");
		}
	};

	const handleDeleteRole = (id: Id<"roles">) => {
		setConfirmConfig({
			isOpen: true,
			title: "Hapus Role?",
			message: "User dengan role ini mungkin akan mengalami error saat login.",
			variant: "danger",
			onConfirm: async () => {
				try {
					await deleteRole({ id });
					toast.success("Role dihapus");
					setRefreshTrigger(n => n + 1);
				} catch (error) {
					toast.error((error as Error).message);
				}
			},
		});
	};

	const updateNewRoleBonusTier = (
		index: number,
		field: keyof BonusTierConfig,
		value: number
	) => {
		setNewRole((prev) => ({
			...prev,
			bonusTargetConfig: {
				...prev.bonusTargetConfig,
				tiers: prev.bonusTargetConfig.tiers.map((tier, tierIndex) =>
					tierIndex === index ? { ...tier, [field]: value } : tier
				),
			},
		}));
	};

	const addNewRoleBonusTier = () => {
		setNewRole((prev) => {
			const tiers = [...prev.bonusTargetConfig.tiers];
			const lastThreshold = tiers.length > 0 ? tiers[tiers.length - 1].thresholdPct : 50;
			tiers.push({ thresholdPct: lastThreshold + 50, bonusAmount: 0 });
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers,
				},
			};
		});
	};

	const removeNewRoleBonusTier = (index: number) => {
		setNewRole((prev) => {
			if (prev.bonusTargetConfig.tiers.length <= 1) return prev;
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers: prev.bonusTargetConfig.tiers.filter((_, tierIndex) => tierIndex !== index),
				},
			};
		});
	};

	const updateEditingRoleBonusTier = (
		index: number,
		field: keyof BonusTierConfig,
		value: number
	) => {
		setEditingRole((prev) => {
			if (!prev) return prev;
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers: prev.bonusTargetConfig.tiers.map((tier, tierIndex) =>
						tierIndex === index ? { ...tier, [field]: value } : tier
					),
				},
			};
		});
	};

	const addEditingRoleBonusTier = () => {
		setEditingRole((prev) => {
			if (!prev) return prev;
			const tiers = [...prev.bonusTargetConfig.tiers];
			const lastThreshold = tiers.length > 0 ? tiers[tiers.length - 1].thresholdPct : 50;
			tiers.push({ thresholdPct: lastThreshold + 50, bonusAmount: 0 });
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers,
				},
			};
		});
	};

	const removeEditingRoleBonusTier = (index: number) => {
		setEditingRole((prev) => {
			if (!prev || prev.bonusTargetConfig.tiers.length <= 1) return prev;
			return {
				...prev,
				bonusTargetConfig: {
					...prev.bonusTargetConfig,
					tiers: prev.bonusTargetConfig.tiers.filter((_, tierIndex) => tierIndex !== index),
				},
			};
		});
	};

	const syncShiftSettings = (predefinedShifts: string[], schedules?: ShiftSchedule[]) => {
		setShiftSettings((prev) => ({
			...prev,
			predefinedShifts,
			shiftSchedules: buildShiftSchedules(predefinedShifts, schedules ?? prev.shiftSchedules),
		}));
	};

	const uploadImageSetting = async (file: File, previewKey: string) => {
		let uploadBlob: Blob = file;
		let contentType = file.type || "image/jpeg";
		if (isOversized(file)) {
			toast.loading("Mengompresi gambar...", { id: `compress-${previewKey}` });
			const compressed = await compressFileToLimit(file);
			toast.dismiss(`compress-${previewKey}`);
			uploadBlob = await fetch(compressed).then((r) => r.blob());
			contentType = "image/jpeg";
		}

		const storageId = await generateUploadUrl({
			file: uploadBlob,
			contentType,
			fileName: file.name,
			folder: "site-settings",
		});
		const previewUrl = URL.createObjectURL(uploadBlob);
		setLocalPreviews((prev) => ({ ...prev, [previewKey]: previewUrl }));
		return storageId as string;
	};

	const tabs =
		mode === "operational-team"
			? ([
					{ id: "users", label: "Pengguna", icon: Users },
					{ id: "attendance-report", label: "Data Absensi", icon: FileBarChart },
					{ id: "attendance-logs", label: "Log Absensi", icon: ClipboardList },
					{ id: "payroll", label: "Gaji & Role", icon: Wallet },
					{ id: "register", label: "Register Karyawan", icon: UserPlus },
				] as const)
			: ([
					{ id: "landing", label: "Halaman Utama", icon: Layout },
					{ id: "pos", label: "Konfigurasi Pembayaran", icon: CreditCard },
					{ id: "store", label: "Informasi Toko", icon: MapPin },
					{ id: "branding", label: "Branding & SEO", icon: Globe },
					{ id: "yumiAI", label: "Yumi AI", icon: ShieldCheck },
					{ id: "system", label: "Sistem & Perangkat", icon: Settings2 },
				] as const);
	const pageContainerClass =
		mode === "operational-team"
			? "mx-auto w-full max-w-7xl space-y-4 md:space-y-8"
			: "mx-auto max-w-5xl space-y-4 md:space-y-8";
	const teamUsersGridClass =
		mode === "operational-team"
			? "grid grid-cols-1 gap-4 md:gap-8 xl:grid-cols-2"
			: "grid grid-cols-1 gap-4 md:gap-8 lg:grid-cols-2";
	const teamShiftsGridClass =
		mode === "operational-team"
			? "grid grid-cols-1 gap-3 xl:grid-cols-2"
			: "grid grid-cols-1 gap-3 lg:grid-cols-2";

	return (
		<div className={pageContainerClass}>
			{/* Header */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-bold text-foreground text-xl tracking-tight md:text-3xl">
						{mode === "operational-team" ? "Tim Operasional" : "Pengaturan Sistem"}
					</h2>
					<p className="mt-0.5 text-muted-foreground text-xs md:mt-1 md:text-sm">
						{mode === "operational-team"
							? "Kelola Staf, Kompensasi, dan Manajemen Shift"
							: "Konfigurasi & Personalisasi Toko"}
					</p>
				</div>
				<Button
					className="gap-2 px-6 py-3 md:gap-3 md:px-8 md:py-3.5"
					onClick={handleSave}
					size="lg"
					type="button"
				>
					<Save className="h-4 w-4" /> Simpan
				</Button>
			</div>

			{/* Tab Switcher - horizontal scroll on mobile */}
			{mode !== "operational-team" && (
				<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xllll bg-muted p-1 md:p-1.5">
					<Tabs
						className="w-full"
						onValueChange={(value) =>
							setActiveTab(value as (typeof tabs)[number]["id"])
						}
						value={activeTab}
					>
						<TabsList className="w-full justify-start md:justify-stretch" variant="default">
							{tabs.map((tab: any) => (
								<TabsTrigger className="shrink-0 md:flex-1" key={tab.id} value={tab.id}>
									<tab.icon className="h-4 w-4" />
									<span className="text-xs md:text-sm">{tab.label}</span>
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>
			)}

			{/* Tab Content */}
			<div className="space-y-6">
				{activeTab === "landing" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
									<Layout className="h-5 w-5" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Kustomisasi Halaman Utama
									</h3>
									<p className="text-muted-foreground text-sm">
										Tampilan Depan Pelanggan
									</p>
								</div>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-title"
									>
										Judul Utama
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-title"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingTitle: e.target.value,
											})
										}
										type="text"
										value={landingSettings.landingTitle}
									/>
								</div>
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-btn-text"
									>
										Teks Tombol
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-btn-text"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingButtonText: e.target.value,
											})
										}
										type="text"
										value={landingSettings.landingButtonText}
									/>
								</div>
								<div className="space-y-2 md:col-span-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-desc"
									>
										Deskripsi Singkat
									</label>
									<textarea
										className="min-h-[120px] w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-desc"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingDescription: e.target.value,
											})
										}
										value={landingSettings.landingDescription}
									/>
								</div>
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-icon"
									>
										Icon (Lucide Name)
									</label>
									<select
										className="w-full appearance-none rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="landing-icon"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingIcon: e.target.value,
											})
										}
										value={landingSettings.landingIcon}
									>
										<option value="Coffee">Coffee</option>
										<option value="Utensils">Utensils</option>
										<option value="Pizza">Pizza</option>
										<option value="Beer">Beer</option>
										<option value="Cake">Cake</option>
										<option value="IceCream">Ice Cream</option>
									</select>
								</div>
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-logo"
									>
										URL Gambar Logo (Opsional)
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-logo"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												logoUrl: e.target.value,
											})
										}
										placeholder="https://example.com/logo.png"
										type="text"
										value={landingSettings.logoUrl}
									/>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "attendance-report" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<FileBarChart className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Laporan Data Absensi
										</h3>
										<p className="text-muted-foreground text-sm">
											Rekapitulasi jam kerja, keterlambatan, dan gaji staff
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2">
									<Select
										onValueChange={(v) => setReportFilter({ ...reportFilter, month: Number(v) })}
										value={reportFilter.month.toString()}
									>
										<SelectTrigger className="w-[140px] bg-muted/50">
											<SelectValue placeholder="Bulan" />
										</SelectTrigger>
										<SelectContent>
											{Array.from({ length: 12 }).map((_, i) => (
												<SelectItem key={i + 1} value={(i + 1).toString()}>
													{new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(2024, i, 1))}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										onValueChange={(v) => setReportFilter({ ...reportFilter, year: Number(v) })}
										value={reportFilter.year.toString()}
									>
										<SelectTrigger className="w-[100px] bg-muted/50">
											<SelectValue placeholder="Tahun" />
										</SelectTrigger>
										<SelectContent>
											{Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => 2023 + i).map((y) => (
												<SelectItem key={y} value={y.toString()}>
													{y}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="outline" size="sm" onClick={exportPayrollCSV} className="text-xs h-8"><Download className="h-3.5 w-3.5 mr-1.5" /> CSV</Button>
								</div>
							</div>

							<div id="payroll-report-table" className="overflow-hidden rounded-xllll border border-border bg-background shadow-sm">
								<div className="overflow-x-auto">
									<table className="w-full text-left text-sm">
										<thead className="bg-muted/50 font-bold text-muted-foreground text-xs uppercase tracking-widest">
											<tr className="border-b border-border/50">
												<th className="px-3 py-2.5 text-[11px]">Staff</th>
												<th className="px-3 py-2.5 text-[11px]">Role</th>
												<th className="px-3 py-2.5 text-center text-[11px]">Shift</th>
												<th className="px-3 py-2.5 text-center text-[11px]">Telat</th>
												<th className="px-3 py-2.5 text-right text-[11px]">Gaji Tetap</th>
												<th className="px-3 py-2.5 text-right text-[11px]">Gaji Shift</th>
												<th className="px-3 py-2.5 text-right text-[11px]">Tunj.</th>
												<th className="px-3 py-2.5 text-right text-[11px]">Lembur</th>
												<th className="px-3 py-2.5 text-right text-emerald-700 text-[11px]">Bonus Target</th>
												<th className="px-3 py-2.5 text-right text-destructive text-[11px]">Denda</th>
												<th className="px-3 py-2.5 text-right font-bold text-primary text-[11px]">Total</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border/50">
											{!payrollReport ? (
												Array.from({ length: 5 }).map((_, i) => (
													<tr key={i}>
														<td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
														<td className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
														<td colSpan={9} className="px-4 py-4">
															<Skeleton className="h-4 w-full" />
														</td>
													</tr>
												))
											) : !payrollReport.rows || payrollReport.rows.length === 0 ? (
												<tr>
													<td colSpan={11} className="py-12 text-center text-muted-foreground italic">
														{!payrollReport.rows ? "Gagal memuat data." : "Tidak ada data absensi untuk periode ini."}
													</td>
												</tr>
											) : (
												payrollReport.rows.map((staff: any, idx: number) => (
													<tr
														className="hover:bg-muted/30 transition-colors cursor-pointer"
														key={idx}
														onClick={() => setSelectedPayrollStaff(staff)}
													>
														<td className="px-3 py-2.5 text-xs">
															<div className="flex items-center gap-1.5">
																<span className="font-bold text-foreground">{staff.name}</span>
																{!staff.isActive && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground uppercase tracking-wide">Tidak Aktif</span>}
															</div>
														</td>
														<td className="px-3 py-2.5 text-[10px] font-medium text-muted-foreground">{staff.roleName}</td>
														<td className="px-3 py-2.5 text-center font-medium text-xs">{(staff.sessionCount || 0)}x</td>
														<td className="px-3 py-2.5 text-center">
															<span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${(staff.totalLateMinutes || 0) > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
																{(staff.totalLateMinutes || 0)}m
															</span>
														</td>
														<td className="px-3 py-2.5 text-right font-medium text-xs">{formatCurrency(staff.monthlyFixedSalary || 0)}</td>
														<td className="px-3 py-2.5 text-right font-medium text-xs">{formatCurrency(staff.totalShiftSalary || 0)}</td>
														<td className="px-3 py-2.5 text-right text-xs">{formatCurrency(staff.totalAllowance || 0)}</td>
														<td className="px-3 py-2.5 text-right text-[10px] text-emerald-600">+{formatCurrency(staff.totalOvertimeBonus || 0)}</td>
														<td className="px-3 py-2.5 text-right text-[10px] text-emerald-700">
															+{formatCurrency(staff.totalTargetBonus || 0)}
															{staff.bonusTargetBasis ? (
																<div className="text-[9px] text-muted-foreground">
																	{staff.bonusTargetBasis === "shift"
																		? "Per Shift"
																		: staff.bonusTargetBasis === "daily"
																			? "Per Hari"
																			: "Per Bulan"}
																</div>
															) : null}
														</td>
														<td className="px-3 py-2.5 text-right text-[10px] text-destructive">-{formatCurrency(staff.totalPenalty || 0)}</td>
														<td className="px-3 py-2.5 text-right font-bold text-primary bg-primary/5 text-xs">{formatCurrency(staff.netSalary || 0)}</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</div>

							<div className="flex items-center gap-2 rounded-xllll border border-amber-200 bg-amber-50 p-4 text-[10px] text-amber-800 leading-relaxed dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-300">
								<AlertCircle className="h-4 w-4 shrink-0" />
								<p>
									Laporan ini dihitung secara real-time berdasarkan log check-in/out staff dan aturan yang berlaku saat ini.
									Pastikan data shift dan geofencing sudah dikonfigurasi dengan benar untuk akurasi data.
								</p>
							</div>
						</section>
					</div>
				)}

				{/* Salary Slip Dialog */}
				<Dialog open={!!selectedPayrollStaff} onOpenChange={(open) => { if (!open) setSelectedPayrollStaff(null); }}>
					<DialogContent className="max-w-md w-full max-h-[85vh] overflow-y-auto">
						<DialogTitle className="sr-only">Slip Gaji</DialogTitle>
						<DialogDescription className="sr-only">Detail slip gaji staff</DialogDescription>
						{selectedPayrollStaff && (() => {
							const staff = selectedPayrollStaff;
							const monthName = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(reportFilter.year, reportFilter.month - 1, 1));
							const targets = payrollReport?.targets;
							return (
								<div className="space-y-4 text-sm">
									{/* Header */}
									<div className="text-center border-b pb-3">
										<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Slip Gaji</p>
										<div className="flex items-center justify-center gap-2 mt-0.5">
											<h2 className="text-lg font-black text-foreground">{staff.name}</h2>
											{!staff.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Tidak Aktif</span>}
										</div>
										<p className="text-xs text-muted-foreground">{staff.roleName}</p>
										<p className="text-xs font-semibold text-primary mt-1">{monthName} {reportFilter.year}</p>
									</div>

									{/* Attendance summary */}
									<div className="rounded-xllll border bg-muted/20 p-3 space-y-1 text-xs">
										<div className="flex justify-between"><span className="text-muted-foreground">Hari Kerja</span><span className="font-semibold">{staff.daysWorked || 0} hari</span></div>
										<div className="flex justify-between"><span className="text-muted-foreground">Jumlah Shift</span><span className="font-semibold">{staff.sessionCount || 0} shift</span></div>
										<div className="flex justify-between"><span className="text-muted-foreground">Total Jam</span><span className="font-semibold">{((staff.totalHours || 0)).toFixed(1)} jam</span></div>
										<div className="flex justify-between"><span className="text-muted-foreground">Keterlambatan</span>
											<span className={`font-semibold ${(staff.totalLateMinutes || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
												{staff.totalLateMinutes || 0} menit
											</span>
										</div>
									</div>

									{/* Earnings */}
									<div className="space-y-1">
										<p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Komponen Gaji</p>
										<div className="rounded-xllll border bg-card divide-y text-xs">
											{(staff.monthlyFixedSalary || 0) > 0 && (
												<div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Gaji Tetap</span><span className="font-semibold">{formatCurrency(staff.monthlyFixedSalary)}</span></div>
											)}
											{(staff.totalShiftSalary || 0) > 0 && (
												<div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Gaji Shift ({staff.sessionCount}x)</span><span className="font-semibold">{formatCurrency(staff.totalShiftSalary)}</span></div>
											)}
											{(staff.totalAllowance || 0) > 0 && (
												<div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Tunjangan Transportasi</span><span className="font-semibold">{formatCurrency(staff.totalAllowance)}</span></div>
											)}
											{(staff.totalOvertimeBonus || 0) > 0 && (
												<div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Bonus Lembur</span><span className="font-semibold text-emerald-600">+{formatCurrency(staff.totalOvertimeBonus)}</span></div>
											)}
											{(staff.totalPenalty || 0) > 0 && (
												<div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Denda Keterlambatan</span><span className="font-semibold text-red-600">-{formatCurrency(staff.totalPenalty)}</span></div>
											)}
										</div>
									</div>

									{/* Target Bonus section */}
									{staff.bonusTargetBasis && (
										<div className="space-y-1">
											<p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
												Bonus Target ({staff.bonusTargetBasis === "shift" ? "Per Shift" : staff.bonusTargetBasis === "daily" ? "Per Hari" : "Per Bulan"})
											</p>
											<div className="rounded-xllll border border-emerald-200/60 bg-emerald-50/60 dark:bg-emerald-500/10 dark:border-emerald-400/20 p-3 space-y-2">
												{/* Show per-session bonus if shift basis */}
												{staff.bonusTargetBasis === "shift" && Array.isArray(staff.sessions) && staff.sessions.length > 0 && (
													<div className="space-y-1.5">
														{staff.sessions.map((s: any, i: number) => (
															<div key={i} className="rounded-lg bg-emerald-100/50 dark:bg-emerald-500/15 px-2 py-1.5 text-[10px]">
																<div className="flex justify-between mb-0.5">
																	<span className="font-bold text-emerald-800 dark:text-emerald-200">{s.date} — {s.shiftName}</span>
																	<span className="font-semibold text-emerald-700 dark:text-emerald-300">{Math.round(s.shiftAchievementPct || 0)}%</span>
																</div>
																{targets && targets.shiftTargetRevenue > 0 && (
																	<div className="flex flex-wrap gap-1 mt-0.5">
																		{[100, 150, 200].map((pct) => {
																			const achieved = (s.shiftAchievementPct || 0) >= pct;
																			return (
																				<span key={pct} className={`rounded px-1 py-0.5 font-bold border text-[9px] ${achieved ? "bg-emerald-600 text-white border-emerald-600" : "bg-white/60 text-muted-foreground/50 border-border/30 dark:bg-muted/30"}`}>
																					{achieved ? "✓" : "○"} {pct}%
																				</span>
																			);
																		})}
																	</div>
																)}
															</div>
														))}
													</div>
												)}
												<div className="flex justify-between items-center pt-1 border-t border-emerald-200/60 dark:border-emerald-400/20">
													<span className="text-xs font-black text-emerald-700 dark:text-emerald-300">Total Bonus Target</span>
													<span className="text-sm font-black text-emerald-700 dark:text-emerald-300">+{formatCurrency(staff.totalTargetBonus || 0)}</span>
												</div>
											</div>
										</div>
									)}

									{/* Total */}
									<div className="rounded-xllll border-2 border-primary/30 bg-primary/5 px-4 py-3 flex justify-between items-center">
										<span className="text-sm font-black text-foreground uppercase tracking-wide">Total Gaji Bersih</span>
										<span className="text-lg font-black text-primary">{formatCurrency(staff.netSalary || 0)}</span>
									</div>
								</div>
							);
						})()}
					</DialogContent>
				</Dialog>

				{activeTab === "attendance-logs" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<ClipboardList className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Log Absensi Real-time
										</h3>
										<p className="text-muted-foreground text-sm">
											Kelola data aktivitas check-in dan check-out staff
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									{selectedLogIds.size > 0 && (
										<Button variant="destructive" size="sm" onClick={handleBulkDelete} className="text-xs h-8"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus {selectedLogIds.size}</Button>
									)}
									<Button variant="default" size="sm" onClick={() => setShowCreateLog(!showCreateLog)} className="text-xs h-8"><Plus className="h-3.5 w-3.5 mr-1.5" /> Tambah Manual</Button>
								</div>
							</div>

							{/* Create Form */}
							{showCreateLog && (
								<div className="space-y-3 rounded-xllll border border-primary/20 bg-primary/5 p-4">
									<p className="font-bold text-sm text-foreground">Tambah Log Manual</p>
									<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
										<select className="rounded-lg border border-border bg-background p-2 text-xs" value={newLog.userId} onChange={(e) => setNewLog({ ...newLog, userId: e.target.value })}>
											<option value="">Pilih Staff</option>
											{users?.map((u: any) => <option key={u._id} value={u._id}>{u.name}</option>)}
										</select>
										<select className="rounded-lg border border-border bg-background p-2 text-xs" value={newLog.type} onChange={(e) => setNewLog({ ...newLog, type: e.target.value as any })}>
											<option value="check_in">Check-In</option>
											<option value="check_out">Check-Out</option>
										</select>
										<input type="date" className="rounded-lg border border-border bg-background p-2 text-xs" value={newLog.date} onChange={(e) => setNewLog({ ...newLog, date: e.target.value })} />
										<input type="time" className="rounded-lg border border-border bg-background p-2 text-xs" value={newLog.time} onChange={(e) => setNewLog({ ...newLog, time: e.target.value })} />
										<input type="text" placeholder="Shift" className="rounded-lg border border-border bg-background p-2 text-xs" value={newLog.shiftName} onChange={(e) => setNewLog({ ...newLog, shiftName: e.target.value })} />
										<input type="text" placeholder="Catatan" className="rounded-lg border border-border bg-background p-2 text-xs" value={newLog.notes} onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })} />
									</div>
									<div className="flex gap-2">
										<button onClick={handleCreateLogSubmit} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground" type="button">Simpan</button>
										<button onClick={() => setShowCreateLog(false)} className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground" type="button">Batal</button>
									</div>
								</div>
							)}

							{/* Edit Form */}
							{editingLog && (
								<div className="space-y-3 rounded-xllll border border-amber-300/30 bg-amber-50 p-4 dark:bg-amber-900/10">
									<p className="font-bold text-sm text-foreground">Edit Log — {editingLog.userName}</p>
									<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
										<select className="rounded-lg border border-border bg-background p-2 text-xs" value={editingLog.type} onChange={(e) => setEditingLog({ ...editingLog, type: e.target.value })}>
											<option value="check_in">Check-In</option>
											<option value="check_out">Check-Out</option>
										</select>
										<input type="date" className="rounded-lg border border-border bg-background p-2 text-xs" value={editingLog.date} onChange={(e) => setEditingLog({ ...editingLog, date: e.target.value })} />
										<input type="time" className="rounded-lg border border-border bg-background p-2 text-xs" value={editingLog.time} onChange={(e) => setEditingLog({ ...editingLog, time: e.target.value })} />
										<input type="text" placeholder="Catatan" className="rounded-lg border border-border bg-background p-2 text-xs" value={editingLog.notes || ""} onChange={(e) => setEditingLog({ ...editingLog, notes: e.target.value })} />
									</div>
									<div className="flex gap-2">
										<button onClick={handleSaveEditLog} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground" type="button">Simpan</button>
										<button onClick={() => setEditingLog(null)} className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground" type="button">Batal</button>
									</div>
								</div>
							)}

							<div className="overflow-hidden rounded-xllll border border-border bg-background shadow-sm">
								<div className="overflow-x-auto">
									<table className="w-full text-left text-sm">
										<thead className="bg-muted/50 font-bold text-muted-foreground text-xs uppercase tracking-widest">
											<tr className="border-b border-border/50">
												<th className="px-2 py-2.5 w-8">
													<input type="checkbox" className="h-3.5 w-3.5 rounded" checked={attendanceLogs ? selectedLogIds.size === attendanceLogs.length && attendanceLogs.length > 0 : false} onChange={toggleSelectAll} />
												</th>
												<th className="px-3 py-2.5 text-[11px]">Waktu</th>
												<th className="px-3 py-2.5 text-[11px]">Staff</th>
												<th className="px-3 py-2.5 text-[11px]">Aksi</th>
												<th className="px-3 py-2.5 text-[11px]">Shift</th>
												<th className="px-3 py-2.5 text-[11px]">Catatan</th>
												<th className="px-3 py-2.5 text-[11px] text-right">Aksi</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border/50">
											{!attendanceLogs ? (
												Array.from({ length: 5 }).map((_, i) => (
													<tr key={i}><td className="px-3 py-4" colSpan={7}><Skeleton className="h-4 w-full" /></td></tr>
												))
											) : attendanceLogs.length === 0 ? (
												<tr><td colSpan={7} className="py-12 text-center text-muted-foreground italic">Belum ada log absensi tercatat.</td></tr>
											) : (
												attendanceLogs.map((log: any) => (
													<tr className="hover:bg-muted/30 transition-colors" key={log._id}>
														<td className="px-2 py-2.5">
															<input type="checkbox" className="h-3.5 w-3.5 rounded" checked={selectedLogIds.has(log._id)} onChange={() => toggleSelectLog(log._id)} />
														</td>
														<td className="px-3 py-2.5 text-xs">
															<div className="font-bold text-foreground">{new Date(log.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
															<div className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</div>
														</td>
														<td className="px-3 py-2.5">
															<div className="font-bold text-foreground text-xs">{log.userName}</div>
															<div className="text-[10px] text-muted-foreground">{log.roleName}</div>
														</td>
														<td className="px-3 py-2.5">
															<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${log.type === "check_in" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
																{log.type === "check_in" ? "IN" : "OUT"}
															</span>
														</td>
														<td className="px-3 py-2.5 text-xs">{log.shiftName || "-"}</td>
														<td className="px-3 py-2.5 text-[11px] text-muted-foreground italic">{log.notes || "-"}</td>
														<td className="px-3 py-2.5 text-right">
															<div className="flex items-center justify-end gap-1">
																<button type="button" className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10" onClick={() => {
																	const d = new Date(log.timestamp);
																	setEditingLog({
																		_id: log._id,
																		userName: log.userName,
																		type: log.type,
																		date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
																		time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
																		notes: log.notes || "",
																		shiftName: log.shiftName || "",
																	});
																}}>
																	<Pencil className="h-3.5 w-3.5" />
																</button>
																<button type="button" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={() => {
																	setConfirmConfig({
																		isOpen: true,
																		title: "Hapus Log?",
																		message: `Log ${log.type === "check_in" ? "Check-In" : "Check-Out"} ${log.userName} akan dihapus permanen.`,
																		variant: "danger",
																		onConfirm: async () => {
																			try { await adminDeleteLog({ id: log._id }); toast.success("Log dihapus"); } catch { toast.error("Gagal menghapus"); }
																		},
																	});
																}}>
																	<Trash2 className="h-3.5 w-3.5" />
																</button>
															</div>
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "payroll" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
									<Wallet className="h-5 w-5" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Gaji & Manajemen Role
									</h3>
									<p className="text-muted-foreground text-sm">
										Atur kompensasi, izin akses, dan aturan denda/bonus
									</p>
								</div>
							</div>

							{/* Role Table - Inline Editable */}
							<div className="space-y-4 pt-4">
								<div className="flex items-center justify-between">
									<h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
										Daftar Role & Akses
									</h4>
									<Button
										size="sm"
										variant="outline"
										className="gap-1.5"
										onClick={() =>
											setNewRole((prev) => ({
												...prev,
												_show: !prev._show,
											}))
										}
									>
										<Plus className="h-3.5 w-3.5" />
										{newRole._show ? "Batal" : "Tambah Role"}
									</Button>
								</div>

								<div className="overflow-hidden rounded-xllll border border-border bg-background shadow-sm">
									<div className="overflow-x-auto">
										<table className="w-full text-left text-sm">
											<thead className="bg-muted/50 font-bold text-muted-foreground text-[10px] uppercase tracking-widest border-b border-border">
												<tr>
													<th className="px-4 py-3">Nama Role</th>
													<th className="px-4 py-3 text-right">Gaji/Shift (Rp)</th>
													<th className="px-4 py-3 text-right">Gaji Tetap (Rp)</th>
													<th className="px-4 py-3 text-right">Tunj. Transportasi (Rp)</th>
													<th className="px-4 py-3">Bonus Target</th>
													<th className="px-4 py-3">Tunj. Lain</th>
													<th className="px-4 py-3 text-center">Akses</th>
													<th className="px-4 py-3 text-right">Aksi</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border/50">
												{!roles ? (
													Array.from({ length: 3 }).map((_, i) => (
														<tr key={i}>
															<td colSpan={8} className="px-4 py-4">
																<Skeleton className="h-8 w-full" />
															</td>
														</tr>
													))
												) : (
													<>
														{newRole._show && (
															<tr className="bg-primary/5 border-b border-primary/20">
																<td className="px-3 py-2">
																	<input
																		className="w-full rounded-lg border border-primary/30 bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-primary/20"
																		placeholder="Nama role baru..."
																		type="text"
																		value={newRole.name}
																		onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
																	/>
																</td>
																<td className="px-3 py-2">
																	<input
																		className="w-full rounded-lg border border-border bg-background p-2 text-xs text-right outline-none focus:ring-2 focus:ring-primary/20"
																		type="number"
																		value={newRole.baseShiftRate || ""}
																		onChange={(e) => setNewRole({ ...newRole, baseShiftRate: Number(e.target.value) })}
																	/>
																</td>
																<td className="px-3 py-2">
																	<input
																		className="w-full rounded-lg border border-border bg-background p-2 text-xs text-right outline-none focus:ring-2 focus:ring-primary/20"
																		type="number"
																		value={newRole.monthlyFixedSalary || ""}
																		onChange={(e) => setNewRole({ ...newRole, monthlyFixedSalary: Number(e.target.value) })}
																	/>
																</td>
																<td className="px-3 py-2">
																	<input
																		className="w-full rounded-lg border border-border bg-background p-2 text-xs text-right outline-none focus:ring-2 focus:ring-primary/20"
																		type="number"
																		value={newRole.dailyAllowance || ""}
																		onChange={(e) => setNewRole({ ...newRole, dailyAllowance: Number(e.target.value) })}
																	/>
																</td>
																<td className="px-3 py-2">
																	<button
																		className="w-full rounded-lg border border-border px-2 py-1 text-left text-[10px] font-semibold text-foreground hover:bg-muted/40"
																		onClick={() => setNewRoleBonusOpen(true)}
																		type="button"
																	>
																	{formatRoleBonusSummary(newRole.bonusTargetConfig)}
																	</button>
															</td>
															<td className="px-3 py-2">
																	<button
																		className="w-full rounded-lg border border-border px-2 py-1 text-left text-[10px] font-semibold text-foreground hover:bg-muted/40"
																		onClick={() => setNewRoleCustomAllowOpen(true)}
																		type="button"
																	>
																		{newRole.customAllowances.length > 0 ? `${newRole.customAllowances.length} item` : "+ Atur"}
																	</button>
															</td>
															<td className="px-3 py-2">
																	<button
																		className="mx-auto flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
																		onClick={() => setNewRolePermOpen(true)}
																		type="button"
																	>
																		<ShieldCheck className="h-3 w-3" />
																		{newRole.permissions.length}
																	</button>
																</td>
																<td className="px-3 py-2 text-right">
																	<button
																		className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
																		onClick={handleCreateRole}
																		type="button"
																	>
																		Simpan
																	</button>
																</td>
															</tr>
														)}
														{roles?.map((role: any) => {
															return (
																<tr key={role._id} className="transition-colors hover:bg-muted/30">
																	<td className="px-3 py-2">
																		<input
																			className="w-full rounded-lg border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-primary/20"
																			type="text"
																			defaultValue={role.name}
																			onBlur={(e) => {
																				const val = e.target.value.trim();
																				if (val && val !== role.name) {
																					updateRole({
																						id: role._id,
																						name: val,
																						permissions: role.permissions,
																						baseHourlyRate: role.baseHourlyRate ?? 0,
																						baseShiftRate: role.baseShiftRate ?? 0,
																						monthlyFixedSalary: role.monthlyFixedSalary ?? 0,
																						dailyAllowance: role.dailyAllowance ?? 0,
																						bonusTargetConfig: normalizeRoleBonusTargetConfig(role.bonusTargetConfig),
																					customAllowances: role.customAllowances ?? [],
																					}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
																				}
																			}}
																		/>
																	</td>
																	<td className="px-3 py-2 text-right">
																		<input
																			className="w-24 ml-auto block rounded-lg border border-border bg-background p-2 text-xs text-right outline-none focus:ring-2 focus:ring-primary/20"
																			type="number"
																			defaultValue={role.baseShiftRate ?? 0}
																			onBlur={(e) => {
																				const val = Number(e.target.value);
																				if (val !== (role.baseShiftRate ?? 0)) {
																					updateRole({
																						id: role._id,
																						name: role.name,
																						permissions: role.permissions,
																						baseHourlyRate: role.baseHourlyRate ?? 0,
																						baseShiftRate: val,
																						monthlyFixedSalary: role.monthlyFixedSalary ?? 0,
																						dailyAllowance: role.dailyAllowance ?? 0,
																						bonusTargetConfig: normalizeRoleBonusTargetConfig(role.bonusTargetConfig),
																					customAllowances: role.customAllowances ?? [],
																					}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
																				}
																			}}
																		/>
																	</td>
																	<td className="px-3 py-2 text-right">
																		<input
																			className="w-24 ml-auto block rounded-lg border border-border bg-background p-2 text-xs text-right outline-none focus:ring-2 focus:ring-primary/20"
																			type="number"
																			defaultValue={role.monthlyFixedSalary ?? 0}
																			onBlur={(e) => {
																				const val = Number(e.target.value);
																				if (val !== (role.monthlyFixedSalary ?? 0)) {
																					updateRole({
																						id: role._id,
																						name: role.name,
																						permissions: role.permissions,
																						baseHourlyRate: role.baseHourlyRate ?? 0,
																						baseShiftRate: role.baseShiftRate ?? 0,
																						monthlyFixedSalary: val,
																						dailyAllowance: role.dailyAllowance ?? 0,
																						bonusTargetConfig: normalizeRoleBonusTargetConfig(role.bonusTargetConfig),
																					customAllowances: role.customAllowances ?? [],
																					}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
																				}
																			}}
																		/>
																	</td>
																	<td className="px-3 py-2 text-right">
																		<input
																			className="w-24 ml-auto block rounded-lg border border-border bg-background p-2 text-xs text-right outline-none focus:ring-2 focus:ring-primary/20"
																			type="number"
																			defaultValue={role.dailyAllowance ?? 0}
																			onBlur={(e) => {
																				const val = Number(e.target.value);
																				if (val !== (role.dailyAllowance ?? 0)) {
																					updateRole({
																						id: role._id,
																						name: role.name,
																						permissions: role.permissions,
																						baseHourlyRate: role.baseHourlyRate ?? 0,
																						baseShiftRate: role.baseShiftRate ?? 0,
																						monthlyFixedSalary: role.monthlyFixedSalary ?? 0,
																						dailyAllowance: val,
																						bonusTargetConfig: normalizeRoleBonusTargetConfig(role.bonusTargetConfig),
																					customAllowances: role.customAllowances ?? [],
																					}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
																				}
																			}}
																		/>
																	</td>
																	<td className="px-3 py-2">
																		<button
																			className="w-full rounded-lg border border-border px-2 py-1 text-left text-[10px] font-semibold text-foreground hover:bg-muted/40"
																	onClick={() => {
																		setEditRoleBonusTarget(role);
																		setEditRoleBonusOpen(true);
																	}}
																			type="button"
																		>
																				{formatRoleBonusSummary(role.bonusTargetConfig)}
																		</button>
																	</td>
																	<td className="px-3 py-2">
																		<button
																			className="w-full rounded-lg border border-border px-2 py-1 text-left text-[10px] font-semibold text-foreground hover:bg-muted/40"
																		onClick={() => {
																			setEditRoleCustomAllowTarget(role);
																			setEditRoleCustomAllowOpen(true);
																		}}
																			type="button"
																		>
																			{Array.isArray(role.customAllowances) && role.customAllowances.length > 0 ? `${role.customAllowances.length} item` : "+ Atur"}
																		</button>
																	</td>
																	<td className="px-3 py-2">
																		<button
																			className="mx-auto flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
																		onClick={() => {
																			setEditRolePermTarget(role);
																			setEditRolePermOpen(true);
																	}}
																			type="button"
																		>
																			<ShieldCheck className="h-3 w-3" />
																			{role.permissions.length}
																		</button>
																	</td>
																	<td className="px-3 py-2">
																		<div className="flex items-center justify-end gap-1">
																			<button
																				title="Hapus Role"
																				className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
																				onClick={() => handleDeleteRole(role._id)}
																			>
																				<Trash2 className="h-3.5 w-3.5" />
																			</button>
																		</div>
																	</td>
																</tr>
															);
														})}
														{roles?.length === 0 && !newRole._show && (
															<tr>
																<td colSpan={8} className="py-8 text-center text-muted-foreground text-xs italic">
																	Belum ada role. Klik "Tambah Role" untuk membuat baru.
																</td>
															</tr>
														)}
													</>
												)}
											</tbody>
										</table>
									</div>
								</div>
							</div>

							<Dialog open={newRolePermOpen} onOpenChange={setNewRolePermOpen}>
								<DialogContent className="sm:max-w-sm">
									<DialogTitle>Izin Akses - Role Baru</DialogTitle>
									<DialogDescription>Pilih izin akses untuk role baru.</DialogDescription>
									<div className="max-h-72 space-y-1 overflow-y-auto">
										{AVAILABLE_PERMISSIONS.map((perm) => (
											<label key={perm.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50">
												<input
													type="checkbox"
													className="h-3.5 w-3.5 rounded border-border"
													checked={newRole.permissions.includes(perm.id)}
													onChange={(e) => {
														const perms = e.target.checked
															? [...newRole.permissions, perm.id]
															: newRole.permissions.filter((p) => p !== perm.id);
														setNewRole({ ...newRole, permissions: perms });
													}}
												/>
												<span>{perm.label}</span>
											</label>
										))}
									</div>
								</DialogContent>
							</Dialog>

							<Dialog open={editRolePermOpen} onOpenChange={(open) => {
								if (!open && editRolePermTarget) {
									updateRole({
										id: editRolePermTarget._id,
										name: editRolePermTarget.name,
										permissions: editRolePermTarget.permissions,
										baseHourlyRate: editRolePermTarget.baseHourlyRate ?? 0,
										baseShiftRate: editRolePermTarget.baseShiftRate ?? 0,
										monthlyFixedSalary: editRolePermTarget.monthlyFixedSalary ?? 0,
										dailyAllowance: editRolePermTarget.dailyAllowance ?? 0,
										bonusTargetConfig: normalizeRoleBonusTargetConfig(editRolePermTarget.bonusTargetConfig),
										customAllowances: editRolePermTarget.customAllowances ?? [],
									}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
								}
								setEditRolePermOpen(open);
							}}>
								<DialogContent className="sm:max-w-sm">
									<DialogTitle>Izin Akses - {editRolePermTarget?.name}</DialogTitle>
									<DialogDescription>Pilih izin akses untuk role ini.</DialogDescription>
									{editRolePermTarget && (
										<div className="max-h-72 space-y-1 overflow-y-auto">
											{AVAILABLE_PERMISSIONS.map((perm) => (
												<label key={perm.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50">
													<input
														type="checkbox"
														className="h-3.5 w-3.5 rounded border-border"
														checked={editRolePermTarget.permissions.includes(perm.id)}
														onChange={(e) => {
															const nextPermissions = e.target.checked
																? [...editRolePermTarget.permissions, perm.id]
																: editRolePermTarget.permissions.filter((id: string) => id !== perm.id);
															setEditRolePermTarget((prev: any) =>
																prev ? { ...prev, permissions: nextPermissions } : prev
															);
														}}
													/>
													<span>{perm.label}</span>
												</label>
											))}
										</div>
									)}
								</DialogContent>
							</Dialog>

							<Dialog open={newRoleBonusOpen} onOpenChange={setNewRoleBonusOpen}>
								<DialogContent className="sm:max-w-lg">
									<DialogTitle>Bonus Target - Role Baru</DialogTitle>
									<DialogDescription>
										Atur bonus bertingkat saat target 100%, 150%, 200%, dan seterusnya tercapai.
									</DialogDescription>
									<div className="space-y-4">
										<div className="space-y-2">
											<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
												Dasar Perhitungan
											</label>
											<select
												className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
												value={newRole.bonusTargetConfig.basis}
												onChange={(e) =>
													setNewRole((prev) => ({
														...prev,
														bonusTargetConfig: {
															...prev.bonusTargetConfig,
															basis: e.target.value as BonusTargetBasis,
														},
													}))
												}
											>
												<option value="shift">Per Shift</option>
												<option value="daily">Per Hari</option>
												<option value="monthly">Per Bulan</option>
											</select>
										</div>
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
													Level Bonus
												</label>
												<Button size="sm" type="button" variant="outline" onClick={addNewRoleBonusTier}>
													<Plus className="h-3 w-3" />
													Tambah Level
												</Button>
											</div>
											<div className="space-y-2">
												{newRole.bonusTargetConfig.tiers.map((tier, index) => (
													<div key={`${tier.thresholdPct}-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
														<input
															type="number"
															className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
															value={tier.thresholdPct}
															onChange={(e) =>
																updateNewRoleBonusTier(
																	index,
																	"thresholdPct",
																	Number(e.target.value)
																)
															}
														/>
														<input
															type="number"
															className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
															value={tier.bonusAmount}
															onChange={(e) =>
																updateNewRoleBonusTier(
																	index,
																	"bonusAmount",
																	Number(e.target.value)
																)
															}
														/>
														<Button
															size="icon"
															type="button"
															variant="ghost"
															onClick={() => removeNewRoleBonusTier(index)}
														>
															<Trash2 className="h-3.5 w-3.5" />
														</Button>
													</div>
												))}
											</div>
										</div>
									</div>
								</DialogContent>
							</Dialog>

							<Dialog open={editRoleBonusOpen} onOpenChange={(open) => {
								if (!open && editRoleBonusTarget) {
									updateRole({
										id: editRoleBonusTarget._id,
										name: editRoleBonusTarget.name,
										permissions: editRoleBonusTarget.permissions,
										baseHourlyRate: editRoleBonusTarget.baseHourlyRate ?? 0,
										baseShiftRate: editRoleBonusTarget.baseShiftRate ?? 0,
										monthlyFixedSalary: editRoleBonusTarget.monthlyFixedSalary ?? 0,
										dailyAllowance: editRoleBonusTarget.dailyAllowance ?? 0,
										bonusTargetConfig: normalizeRoleBonusTargetConfig(editRoleBonusTarget.bonusTargetConfig),
										customAllowances: editRoleBonusTarget.customAllowances ?? [],
									}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
								}
								setEditRoleBonusOpen(open);
							}}>
								<DialogContent className="sm:max-w-lg">
									<DialogTitle>Bonus Target - {editRoleBonusTarget?.name}</DialogTitle>
									<DialogDescription>
										Bonus bersifat akumulatif setiap level target yang tercapai.
									</DialogDescription>
									{editRoleBonusTarget && (
										<div className="space-y-4">
											<div className="space-y-2">
												<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
													Dasar Perhitungan
												</label>
												<select
													className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
													value={editRoleBonusTarget.bonusTargetConfig.basis}
													onChange={(e) =>
														setEditRoleBonusTarget((prev: any) =>
															prev
																? {
																	...prev,
																	bonusTargetConfig: {
																		...prev.bonusTargetConfig,
																		basis: e.target.value as BonusTargetBasis,
																	},
																}
																: prev
														)
													}
												>
													<option value="shift">Per Shift</option>
													<option value="daily">Per Hari</option>
													<option value="monthly">Per Bulan</option>
												</select>
											</div>
											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														Level Bonus
													</label>
													<Button size="sm" type="button" variant="outline" onClick={addEditRoleBonusTier}>
														<Plus className="h-3 w-3" />
														Tambah Level
													</Button>
												</div>
												<div className="space-y-2">
													{editRoleBonusTarget.bonusTargetConfig.tiers.map((tier: any, index: number) => (
														<div key={`${tier.thresholdPct}-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
															<input
																type="number"
																className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
																value={tier.thresholdPct}
																onChange={(e) =>
																	updateEditRoleBonusTier(
																		index,
																		"thresholdPct",
																		Number(e.target.value)
																	)
																}
															/>
															<input
																type="number"
																className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
																value={tier.bonusAmount}
																onChange={(e) =>
																	updateEditRoleBonusTier(
																		index,
																		"bonusAmount",
																		Number(e.target.value)
																	)
																}
															/>
															<Button
																size="icon"
																type="button"
																variant="ghost"
																onClick={() => removeEditRoleBonusTier(index)}
															>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														</div>
													))}
												</div>
											</div>
										</div>
									)}
								</DialogContent>
							</Dialog>

							<Dialog open={newRoleCustomAllowOpen} onOpenChange={setNewRoleCustomAllowOpen}>
								<DialogContent className="sm:max-w-lg">
									<DialogTitle>Tunjangan Lain - Role Baru</DialogTitle>
									<DialogDescription>Kelola tunjangan tambahan untuk role ini.</DialogDescription>
									<div className="space-y-4">
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
													Daftar Tunjangan
												</label>
												<Button
													size="sm"
													type="button"
													variant="outline"
													onClick={() =>
														setNewRole((prev) => ({
															...prev,
															customAllowances: [...prev.customAllowances, { name: "", amount: 0 }],
														}))
													}
												>
													<Plus className="h-3 w-3" />
													Tambah Tunjangan
												</Button>
											</div>
											<div className="space-y-2">
												{newRole.customAllowances.map((allowance, index) => (
													<div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
														<input
															type="text"
															placeholder="Nama tunjangan"
															className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
															value={allowance.name}
															onChange={(e) =>
																setNewRole((prev) => {
																	const next = [...prev.customAllowances];
																	next[index] = { ...next[index], name: e.target.value };
																	return { ...prev, customAllowances: next };
																})
																}
														/>
															<input
															type="number"
															placeholder="Jumlah (Rp)"
															className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
															value={allowance.amount}
															onChange={(e) =>
																setNewRole((prev) => {
																	const next = [...prev.customAllowances];
																	next[index] = { ...next[index], amount: Number(e.target.value) };
																	return { ...prev, customAllowances: next };
																})
																}
														/>
															<Button
																size="icon"
																type="button"
																variant="ghost"
																onClick={() =>
																	setNewRole((prev) => ({
																		...prev,
																		customAllowances: prev.customAllowances.filter((_, i) => i !== index),
																	}))
																}
														>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
													</div>
												))}
											</div>
										</div>
										<Button size="sm" type="button" onClick={() => setNewRoleCustomAllowOpen(false)}>
											Simpan
										</Button>
									</div>
								</DialogContent>
							</Dialog>

							<Dialog open={editRoleCustomAllowOpen} onOpenChange={(open) => {
								if (!open && editRoleCustomAllowTarget) {
									updateRole({
										id: editRoleCustomAllowTarget._id,
										name: editRoleCustomAllowTarget.name,
										permissions: editRoleCustomAllowTarget.permissions,
										baseHourlyRate: editRoleCustomAllowTarget.baseHourlyRate ?? 0,
										baseShiftRate: editRoleCustomAllowTarget.baseShiftRate ?? 0,
										monthlyFixedSalary: editRoleCustomAllowTarget.monthlyFixedSalary ?? 0,
										dailyAllowance: editRoleCustomAllowTarget.dailyAllowance ?? 0,
										bonusTargetConfig: normalizeRoleBonusTargetConfig(editRoleCustomAllowTarget.bonusTargetConfig),
										customAllowances: editRoleCustomAllowTarget.customAllowances ?? [],
									}).then(() => setRefreshTrigger(n => n + 1)).catch(console.error);
								}
								setEditRoleCustomAllowOpen(open);
							}}>
								<DialogContent className="sm:max-w-lg">
									<DialogTitle>Tunjangan Lain - {editRoleCustomAllowTarget?.name}</DialogTitle>
									<DialogDescription>Kelola tunjangan tambahan untuk role ini.</DialogDescription>
									{editRoleCustomAllowTarget && (
										<div className="space-y-4">
											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
														Daftar Tunjangan
													</label>
													<Button
														size="sm"
														type="button"
														variant="outline"
														onClick={() =>
															setEditRoleCustomAllowTarget((prev: any) =>
																prev
																	? {
																			...prev,
																			customAllowances: [...prev.customAllowances, { name: "", amount: 0 }],
																		}
																	: prev
															)
														}
													>
														<Plus className="h-3 w-3" />
														Tambah Tunjangan
													</Button>
												</div>
												<div className="space-y-2">
													{editRoleCustomAllowTarget.customAllowances.map((allowance: any, index: number) => (
														<div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
															<input
																type="text"
																placeholder="Nama tunjangan"
																className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
																value={allowance.name}
																onChange={(e) =>
																	setEditRoleCustomAllowTarget((prev: any) => {
																		if (!prev) return prev;
																		const next = [...prev.customAllowances];
																		next[index] = { ...next[index], name: e.target.value };
																		return { ...prev, customAllowances: next };
																	})
																	}
															/>
															<input
																type="number"
																placeholder="Jumlah (Rp)"
																className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
																value={allowance.amount}
																onChange={(e) =>
																	setEditRoleCustomAllowTarget((prev: any) => {
																		if (!prev) return prev;
																		const next = [...prev.customAllowances];
																		next[index] = { ...next[index], amount: Number(e.target.value) };
																		return { ...prev, customAllowances: next };
																	})
																	}
															/>
															<Button
																size="icon"
																type="button"
																variant="ghost"
																onClick={() =>
																	setEditRoleCustomAllowTarget((prev: any) =>
																		prev
																			? {
																					...prev,
																					customAllowances: prev.customAllowances.filter((_: any, i: number) => i !== index),
																				}
																			: prev
																		)
																	}
															>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														</div>
													))}
												</div>
											</div>
											<Button size="sm" type="button" onClick={() => setEditRoleCustomAllowOpen(false)}>
												Simpan
											</Button>
										</div>
									)}
								</DialogContent>
							</Dialog>

								<div className="border-t border-border pt-6">
									<h4 className="px-2 mb-4 font-bold text-sm text-foreground uppercase tracking-wider">
										Konfigurasi Payroll & Laporan Global
									</h4>
									<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
										<div className="space-y-2">
											<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
												Masa Toleransi Keterlambatan (Menit)
											</label>
											<div className="relative">
												<Input className="h-11 w-full bg-muted/50 font-medium" type="number" onChange={(e) => setPayrollGlobalConfig({ ...payrollGlobalConfig, lateToleranceMinutes: Number(e.target.value) })} value={payrollGlobalConfig.lateToleranceMinutes} />
												<span className="absolute top-1/2 right-4 -translate-y-1/2 font-bold text-muted-foreground text-sm">menit</span>
											</div>
										</div>

										<div className="space-y-2">
											<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
												Denda per Menit (Rp)
											</label>
											<div className="relative">
												<span className="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted-foreground text-sm">Rp</span>
												<Input className="h-11 w-full bg-muted/50 pl-11 font-medium" type="number" onChange={(e) => setPayrollGlobalConfig({ ...payrollGlobalConfig, latePenaltyPerMinute: Number(e.target.value) })} value={payrollGlobalConfig.latePenaltyPerMinute} />
											</div>
										</div>

										<div className="space-y-2">
											<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
												Bonus Lembur per Jam (Rp)
											</label>
											<div className="relative">
												<span className="absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted-foreground text-sm">Rp</span>
												<Input className="h-11 w-full bg-muted/50 pl-11 font-medium" type="number" onChange={(e) => setPayrollGlobalConfig({ ...payrollGlobalConfig, overtimeBonusPerHour: Number(e.target.value) })} value={payrollGlobalConfig.overtimeBonusPerHour} />
											</div>
										</div>

										<div className="space-y-2">
											<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
												Email Pengirim Laporan (Resend)
											</label>
											<Input className="h-11 w-full bg-muted/50 font-medium" type="email" placeholder="reports@domain.com" onChange={(e) => setSettings({ ...settings, resendFromEmail: normalizeEmail(e.target.value) })} value={settings.resendFromEmail} />
										</div>

										<div className="md:col-span-2 rounded-xllll bg-blue-50/50 p-4 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
											<label className="flex cursor-pointer items-start gap-3">
												<input
													type="checkbox"
													className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-400"
													checked={shiftSettings.autoSendShiftReportEmail}
													onChange={(e) => setShiftSettings({ ...shiftSettings, autoSendShiftReportEmail: e.target.checked })}
												/>
												<div className="space-y-1">
													<span className="block font-bold text-[11px] text-blue-800 dark:text-blue-200 uppercase tracking-wider">
														Kirim Otomatis Laporan Shift via Email
													</span>
													<p className="text-[10px] text-blue-700/70 dark:text-blue-300/60 leading-relaxed">
														Jika aktif, setiap proses tutup shift akan otomatis mengirim laporan ke daftar pengguna yang memiliki akses "Terima laporan email".
														Penerima saat ini: <span className="font-semibold">{reportRecipients.length > 0 ? reportRecipients.join(", ") : "Tidak ada"}</span>
													</p>
												</div>
											</label>
										</div>
									</div>
								</div>

							<div className="rounded-xllll border border-blue-200 bg-blue-50 p-4 text-xs text-blue-700 leading-relaxed dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
								<p className="font-bold">Tips Penggajian:</p>
								<ul className="mt-2 list-inside list-disc space-y-1">
									<li>Gaji tetap bulanan diberikan sebagai kompensasi dasar staff per bulan.</li>
									<li>Gaji Shift dihitung dari jumlah check-in/out harian yang berhasil dilakukan oleh staff.</li>
									<li>Tunjangan Transportasi diberikan otomatis setiap kali staff melakukan Check-in di hari tersebut.</li>
									<li>Bonus Target dapat dihitung per shift, per hari, atau per bulan sesuai role dan level target.</li>
									<li>Denda keterlambatan hanya dihitung terhadap menit yang melebihi masa toleransi.</li>
								</ul>
							</div>
						</section>
					</div>
				)}

				{activeTab === "register" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500 space-y-4">
						{/* ── Header ── */}
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xllll bg-primary/10 text-primary"><UserPlus className="h-5 w-5" /></div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight">Pendaftaran Karyawan</h3>
									<p className="text-muted-foreground text-xs">Konfigurasi halaman pendaftaran publik /register</p>
								</div>
							</div>
							<div className="flex gap-2">
								<Button size="sm" variant="outline" onClick={() => window.open("/register?preview=admin", "_blank")} type="button"><Eye className="mr-1.5 h-3.5 w-3.5" />Lihat Pratinjau</Button>
								<Button size="sm" variant="outline" onClick={() => window.location.href = "/admin/operational-team/register/onboarding"} type="button"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Daftar Pendaftar</Button>
							</div>
						</div>

						{/* ── Register Command Center ── */}
						<div className="overflow-hidden rounded-xllxl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:via-card dark:to-emerald-950/20 md:p-5">
							<div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-center">
								<div className="space-y-3">
									<div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-700 shadow-sm dark:bg-background/60 dark:text-sky-300">
										<span className={`h-2 w-2 rounded-full ${employeeOnboardingSettings.registrationEnabled ? "bg-emerald-500" : "bg-amber-500"}`} />
										{employeeOnboardingSettings.registrationEnabled ? "Pendaftaran Aktif" : "Pendaftaran Ditutup"}
									</div>
									<div>
										<h4 className="text-lg font-black tracking-tight text-foreground md:text-2xl">Register Center</h4>
										<p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground md:text-sm">Satu tempat untuk mengatur form kandidat, kontrak kerja, tanda tangan, dan review onboarding. Urutan aman: aktifkan form, cek kontrak, preview, lalu review pendaftar.</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Button size="sm" onClick={() => window.open("/register?preview=admin", "_blank")} type="button"><Eye className="mr-1.5 h-3.5 w-3.5" />Preview Form</Button>
										<Button size="sm" variant="outline" onClick={() => window.location.href = "/admin/operational-team/register/contract"} type="button"><FileSignature className="mr-1.5 h-3.5 w-3.5" />Template Kontrak</Button>
										<Button size="sm" variant="outline" onClick={() => window.location.href = "/admin/operational-team/register/riwayat"} type="button"><FileText className="mr-1.5 h-3.5 w-3.5" />Riwayat Kontrak</Button>
										<Button size="sm" variant="outline" onClick={() => window.location.href = "/admin/operational-team/register/approval"} type="button"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Persetujuan</Button>
										<Button size="sm" variant="outline" onClick={() => window.location.href = "/admin/operational-team/register/onboarding"} type="button"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Review Kandidat</Button>
									</div>
								</div>
								<div className="grid grid-cols-3 gap-2 text-center">
									<div className="rounded-xllll border bg-background p-3"><p className="text-lg font-black">{Object.keys(employeeOnboardingSettings.contractTemplatesByRoleId || {}).length}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Template</p></div>
									<div className="rounded-xllll border bg-background p-3"><p className="text-lg font-black">{Object.values(employeeOnboardingSettings.fields || {}).filter((field: any) => field?.required).length}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wajib</p></div>
									<div className="rounded-xllll border bg-background p-3"><p className="text-lg font-black">{employeeOnboardingSettings.documentChecklist?.filter((item: any) => item?.required).length || 0}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dokumen</p></div>
								</div>
							</div>
						</div>

						{/* ── Kontrak Card ── */}
						<div className="rounded-xllll border border-border bg-card p-4 md:p-5">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-3">
									<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><FileSignature className="h-4 w-4" /></div>
									<div>
										<p className="text-sm font-semibold">Template Kontrak Kerja</p>
										<p className="text-muted-foreground text-xs">Atur isi kontrak per jabatan yang dibaca kandidat</p>
									</div>
								</div>
								<Button size="sm" onClick={() => window.location.href = "/admin/operational-team/register/contract"} type="button"><FileSignature className="mr-1.5 h-3.5 w-3.5" />Kelola Kontrak</Button>
							</div>
						</div>

						{/* ── Status Pendaftaran ── */}
						<section className="space-y-4 rounded-xlllxl border border-border bg-card p-4 shadow-sm md:p-6">
							<div className="rounded-xllll border bg-background/50 p-4">
								<div className="flex items-center justify-between mb-3">
									<div>
										<p className="font-semibold text-sm">Status Pendaftaran</p>
										<p className="text-muted-foreground text-xs">Aktifkan halaman /register agar kandidat bisa mendaftar</p>
									</div>
									<button
										className={`relative h-6 w-11 rounded-full transition-all ${employeeOnboardingSettings.registrationEnabled ? "bg-primary" : "bg-input"}`}
										onClick={() => setEmployeeOnboardingSettings((prev) => ({ ...prev, registrationEnabled: !prev.registrationEnabled }))}
										type="button"
									>
										<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${employeeOnboardingSettings.registrationEnabled ? "right-0.5" : "left-0.5"}`} />
									</button>
								</div>
								<div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
									<div>
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Mode Pendaftaran</label>
										<Select value={employeeOnboardingSettings.registrationMode} onValueChange={(value) => setEmployeeOnboardingSettings((prev) => ({ ...prev, registrationMode: value as EmployeeOnboardingSettings["registrationMode"] }))}>
											<SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
											<SelectContent>
												<SelectItem value="public">Publik</SelectItem>
												<SelectItem value="internal">Internal</SelectItem>
												<SelectItem value="invite_only">Invite Only</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div>
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Kode Undangan</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.inviteCode} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, inviteCode: e.target.value }))} placeholder="Kode undangan" />
									</div>
									<div>
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Password Default</label>
										<Input className="h-9 text-xs" type="password" value={employeeOnboardingSettings.defaultPassword} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, defaultPassword: e.target.value }))} placeholder="Password default" />
									</div>
									<div className="sm:col-span-2">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Nama Perusahaan di Kontrak</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.signatoryName} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, signatoryName: e.target.value }))} placeholder="Nama perusahaan/bisnis" />
										<p className="mt-1 text-[10px] text-muted-foreground">Dipakai sebagai nama perusahaan pada header dan pihak perusahaan.</p>
									</div>
									<div className="sm:col-span-2">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Nama Orang Penandatangan</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.signatoryPersonName} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, signatoryPersonName: e.target.value }))} placeholder="Nama orang yang menandatangani" />
										<p className="mt-1 text-[10px] text-muted-foreground">Dipakai di area tanda tangan perusahaan.</p>
									</div>
									<div className="sm:col-span-2">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Jabatan Penandatangan</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.signatoryPersonTitle} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, signatoryPersonTitle: e.target.value }))} placeholder="Direktur / HR Manager / Owner" />
										<p className="mt-1 text-[10px] text-muted-foreground">Dicetak di kontrak setelah nama penandatangan.</p>
									</div>
									<div className="sm:col-span-2">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Alamat Perusahaan</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.signatoryCompanyAddress} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, signatoryCompanyAddress: e.target.value }))} placeholder="Jl. Contoh No. 123, Kota" />
										<p className="mt-1 text-[10px] text-muted-foreground">Alamat lengkap untuk identitas Pihak Pertama di kontrak.</p>
									</div>
									<div className="sm:col-span-1">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">NIB / NPWP</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.signatoryCompanyNIB} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, signatoryCompanyNIB: e.target.value }))} placeholder="912000xxx" />
										<p className="mt-1 text-[10px] text-muted-foreground">Nomor induk berusaha perusahaan.</p>
									</div>
									<div className="sm:col-span-1">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Kota Penandatanganan</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.signatoryLocation} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, signatoryLocation: e.target.value }))} placeholder="Tangerang" />
										<p className="mt-1 text-[10px] text-muted-foreground">Kota untuk tanggal penandatanganan kontrak.</p>
									</div>
									<div className="sm:col-span-2 lg:col-span-4">
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Pesan Saat Pendaftaran Ditutup</label>
										<Textarea className="text-xs" rows={2} value={employeeOnboardingSettings.closedMessage} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, closedMessage: e.target.value }))} />
									</div>
								</div>
							</div>

							{/* ── Default Akun Baru ── */}
							<div className="rounded-xllll border bg-background/50 p-4">
								<p className="font-semibold text-sm mb-3">Default Akun Baru</p>
								<div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
									<div>
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
										<Select value={employeeOnboardingSettings.defaultRoleId || "none"} onValueChange={(value) => setEmployeeOnboardingSettings((prev) => ({ ...prev, defaultRoleId: value === "none" ? "" : (value || "") }))}>
											<SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih role" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="none">Tidak ada</SelectItem>
												{roles?.map((role: any) => <SelectItem key={role._id} value={role._id}>{role.name}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>
									<div>
										<label className="mb-1 block text-xs font-medium text-muted-foreground">Lokasi</label>
										<Input className="h-9 text-xs" value={employeeOnboardingSettings.defaultLocation} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, defaultLocation: e.target.value }))} placeholder="Djiwa Tentram" />
									</div>
									<div className="flex items-end pb-0.5">
										<label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs transition-colors hover:bg-muted/50">
											<input checked={employeeOnboardingSettings.prefillSalaryFromRole} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, prefillSalaryFromRole: e.target.checked }))} type="checkbox" className="h-3.5 w-3.5 rounded accent-primary" />
											Isi gaji dari role
										</label>
									</div>
								</div>
							</div>

							{/* ── Pengaturan Lanjutan (collapsible) ── */}
							<details className="group rounded-xllll border bg-background/50">
								<summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold text-sm select-none">
									Pengaturan Lanjutan
									<ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
								</summary>
								<div className="space-y-4 px-4 pb-4">
									{/* Fields */}
									<div className="space-y-2">
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kolom Formulir</p>
										<div className="grid gap-1 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
											{(Object.keys(employeeOnboardingSettings.fields) as EmployeeOnboardingFieldKey[]).map((key) => (
												<div key={key} className="flex items-center justify-between gap-1 rounded-md bg-background px-2 py-1.5 text-xs border">
													<span className="truncate text-muted-foreground">{key}</span>
													<span className="flex items-center gap-1.5 shrink-0">
														<label className="flex items-center gap-0.5 cursor-pointer"><input checked={employeeOnboardingSettings.fields[key].visible} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, fields: { ...prev.fields, [key]: { ...prev.fields[key], visible: e.target.checked } } }))} type="checkbox" className="h-3 w-3 rounded accent-primary" /><span className="text-[10px]">T</span></label>
														<label className="flex items-center gap-0.5 cursor-pointer"><input checked={employeeOnboardingSettings.fields[key].required} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, fields: { ...prev.fields, [key]: { ...prev.fields[key], required: e.target.checked } } }))} type="checkbox" className="h-3 w-3 rounded accent-primary" /><span className="text-[10px]">W</span></label>
													</span>
												</div>
											))}
										</div>
										<p className="text-[10px] text-muted-foreground">T = Tampil, W = Wajib</p>
									</div>

									{/* Steps */}
									<div className="space-y-2">
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tahapan Formulir</p>
										<div className="flex flex-wrap gap-1.5">
											{employeeOnboardingSettings.steps.map((step) => (
												<label
													key={step.id}
													className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${step.enabled ? "border-primary/30 bg-primary/5 text-primary" : "border-transparent bg-muted text-muted-foreground"}`}
												>
													<input checked={step.enabled} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, steps: prev.steps.map((item) => item.id === step.id ? { ...item, enabled: e.target.checked } : item) }))} type="checkbox" className="sr-only" />
													{step.title}
												</label>
											))}
										</div>
									</div>

									{/* Pipeline & Approval */}
									<div className="grid gap-2.5 sm:grid-cols-2">
										<div>
											<label className="mb-1 block text-xs font-medium text-muted-foreground">Pipeline Status</label>
											<Input className="h-8 text-xs" value={employeeOnboardingSettings.pipeline.statuses.join(", ")} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, pipeline: { ...prev.pipeline, statuses: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } }))} placeholder="submitted, screening, interview, ..." />
										</div>
										<div className="flex flex-col gap-2 justify-end pb-0.5">
											<label className="flex cursor-pointer items-center gap-2 text-xs">
												<input checked={employeeOnboardingSettings.approvalPreview.enabled} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, approvalPreview: { ...prev.approvalPreview, enabled: e.target.checked } }))} type="checkbox" className="h-3.5 w-3.5 rounded accent-primary" />
												Pratinjau akun sebelum disetujui
											</label>
											<label className="flex cursor-pointer items-center gap-2 text-xs">
												<input checked={employeeOnboardingSettings.approvalPreview.requireConfirmation} onChange={(e) => setEmployeeOnboardingSettings((prev) => ({ ...prev, approvalPreview: { ...prev.approvalPreview, requireConfirmation: e.target.checked } }))} type="checkbox" className="h-3.5 w-3.5 rounded accent-primary" />
												Konfirmasi sebelum menyetujui
											</label>
										</div>
									</div>
								</div>
							</details>
						</section>
					</div>
				)}

				{activeTab === "pos" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
									<CreditCard className="h-5 w-5" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Konfigurasi Pembayaran
									</h3>
									<p className="text-muted-foreground text-sm">
										Pengaturan Alur Transaksi
									</p>
								</div>
							</div>

							<div className="space-y-6">
								<div className="space-y-4 rounded-xllll border border-border bg-card p-5">
									<p className="font-bold text-foreground text-sm">
										Metode Pembayaran Kasir (Manual)
									</p>
									<p className="-mt-3 text-muted-foreground text-xs leading-relaxed">
										Pilih metode pembayaran yang dapat diterima oleh kasir.
									</p>
									<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
										{/* Cash Toggle */}
										<div className="flex items-center justify-between rounded-lg border border-border/50 bg-background p-3 shadow-sm">
											<span className="font-medium text-foreground text-sm">Tunai</span>
											<button
												className={`relative h-6 w-11 rounded-full transition-all duration-300 rounded-full ${paymentSettings.manualMethods.cash ? "bg-primary" : "bg-input"}`}
												onClick={() =>
													setPaymentSettings({
														...paymentSettings,
														manualMethods: {
															...paymentSettings.manualMethods,
															cash: !paymentSettings.manualMethods.cash,
														},
													})
												}
												type="button"
											>
												<div
													className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.manualMethods.cash ? "right-1" : "left-1"}`}
												/>
											</button>
										</div>
										{/* QRIS Toggle */}
										<div className="flex items-center justify-between rounded-lg border border-border/50 bg-background p-3 shadow-sm">
											<span className="font-medium text-foreground text-sm">QRIS (Statis)</span>
											<button
												className={`relative h-6 w-11 rounded-full transition-all duration-300 ${paymentSettings.manualMethods.qris ? "bg-primary" : "bg-input"}`}
												onClick={() =>
													setPaymentSettings({
														...paymentSettings,
														manualMethods: {
															...paymentSettings.manualMethods,
															qris: !paymentSettings.manualMethods.qris,
														},
													})
												}
												type="button"
											>
												<div
													className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.manualMethods.qris ? "right-1" : "left-1"}`}
												/>
											</button>
										</div>
										{/* Transfer Toggle */}
										<div className="flex items-center justify-between rounded-lg border border-border/50 bg-background p-3 shadow-sm">
											<span className="font-medium text-foreground text-sm">Transfer Bank</span>
											<button
												className={`relative h-6 w-11 rounded-full transition-all duration-300 ${paymentSettings.manualMethods.transfer ? "bg-primary" : "bg-input"}`}
												onClick={() =>
													setPaymentSettings({
														...paymentSettings,
														manualMethods: {
															...paymentSettings.manualMethods,
															transfer: !paymentSettings.manualMethods.transfer,
														},
													})
												}
												type="button"
											>
												<div
													className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.manualMethods.transfer ? "right-1" : "left-1"}`}
												/>
											</button>
										</div>
									</div>
								</div>

								{/* Tax and Service Charge Fields */}
								<div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-2 border-t border-border/50">
									<div className="space-y-2">
										<label
											className="font-medium text-muted-foreground text-xs uppercase tracking-widest"
											htmlFor="tax-rate"
										>
											Pajak (%)
										</label>
										<div className="relative">
											<input
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="tax-rate"
												onChange={(e) =>
													setSettings({
														...settings,
														taxRate: Number(e.target.value),
													})
												}
												type="number"
												value={settings.taxRate}
											/>
											<span className="absolute top-1/2 right-5 -translate-y-1/2 font-bold text-muted-foreground/40">
												%
											</span>
										</div>
										<p className="text-[10px] text-muted-foreground">Pajak Pertambahan Nilai (PPN / PB1)</p>
									</div>

									<div className="space-y-2">
										<label
											className="font-medium text-muted-foreground text-xs uppercase tracking-widest"
											htmlFor="service-charge"
										>
											Service Charge (%)
										</label>
										<div className="relative">
											<input
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="service-charge"
												onChange={(e) =>
													setSettings({
														...settings,
														serviceChargeRate: Number(e.target.value),
													})
												}
												type="number"
												value={settings.serviceChargeRate}
											/>
											<span className="absolute top-1/2 right-5 -translate-y-1/2 font-bold text-muted-foreground/40">
												%
											</span>
										</div>
										<p className="text-[10px] text-muted-foreground">Biaya layanan operasional restoran</p>
									</div>
								</div>

								{/* Order Types Configuration */}
								<div className="space-y-4 pt-4 border-t border-border/50">
									<div className="space-y-1.5">
										<label className="block font-medium text-muted-foreground text-xs uppercase tracking-widest">
											Tipe Pesanan (Order Types)
										</label>
										<p className="text-muted-foreground text-xs">
											Konfigurasi tipe pesanan yang tersedia (Dine In, Takeaway, Ojol, dll).
										</p>
									</div>

									<div className="space-y-3">
										{settings.orderTypes?.map((orderType, index) => (
											<div
												key={orderType.id}
												className="flex items-center gap-3 rounded-lg border border-border/50 bg-background p-3 shadow-sm"
											>
												<div className="flex items-center gap-2 flex-1">
													<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
														{orderType.icon === "Utensils" && <Utensils className="h-4 w-4" />}
														{orderType.icon === "ShoppingBag" && <ShoppingBag className="h-4 w-4" />}
														{orderType.icon === "Bike" && <Bike className="h-4 w-4" />}
														{orderType.icon === "Truck" && <Truck className="h-4 w-4" />}
														{(!orderType.icon || !["Utensils", "ShoppingBag", "Bike", "Truck"].includes(orderType.icon)) && (
															<Package className="h-4 w-4" />
														)}
													</div>
													<div className="flex-1">
														<input
															className="w-full bg-transparent font-bold text-foreground text-sm outline-none focus:ring-1 focus:ring-primary/20"
															onChange={(e) => {
																const newOrderTypes = [...(settings.orderTypes || [])];
																newOrderTypes[index] = { ...newOrderTypes[index], label: e.target.value };
																setSettings({ ...settings, orderTypes: newOrderTypes });
															}}
															value={orderType.label}
														/>
													</div>
												</div>

												<div className="flex items-center gap-2">
													<button
														className={`relative h-5 w-9 rounded-full transition-all duration-300 ${orderType.isActive ? "bg-primary" : "bg-input"}`}
														onClick={() => {
															const newOrderTypes = [...(settings.orderTypes || [])];
															newOrderTypes[index] = { ...newOrderTypes[index], isActive: !newOrderTypes[index].isActive };
															setSettings({ ...settings, orderTypes: newOrderTypes });
														}}
														title="Aktifkan/Nonaktifkan"
														type="button"
													>
														<div
															className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${orderType.isActive ? "right-0.5" : "left-0.5"}`}
														/>
													</button>
													<button
														className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
														onClick={() => {
															if (settings.orderTypes && settings.orderTypes.length > 1) {
																const newOrderTypes = settings.orderTypes.filter((_, i) => i !== index);
																setSettings({ ...settings, orderTypes: newOrderTypes });
															} else {
																toast.error("Minimal harus ada satu tipe pesanan");
															}
														}}
														title="Hapus"
														type="button"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>
											</div>
										))}

										<Button
											className="w-full border-dashed border-2"
											onClick={() => {
												const newOrderType = {
													id: `order_type_${Date.now()}`,
													name: `order_type_${Date.now()}`,
													label: "Tipe Pesanan Baru",
													icon: "Package",
													requiresTableNumber: false,
													isActive: true,
													sortOrder: (settings.orderTypes?.length || 0) + 1,
												};
												setSettings({
													...settings,
													orderTypes: [...(settings.orderTypes || []), newOrderType],
												});
											}}
											variant="outline"
										>
											<Plus className="mr-2 h-4 w-4" />
											Tambah Tipe Pesanan
										</Button>
								</div>
							</div>

							{/* Platforms Configuration */}
							<div className="space-y-4 pt-4 border-t border-border/50">
								<div className="space-y-1.5">
									<label className="block font-medium text-muted-foreground text-xs uppercase tracking-widest">
										Platform Online
									</label>
									<p className="text-muted-foreground text-xs">
										Platform ojol yang tersedia untuk tipe Online (GoFood, GrabFood, dll).
									</p>
								</div>

								<div className="space-y-3">
									{settings.platforms?.map((platform, index) => (
										<div
											key={platform.id}
											className="flex items-center gap-3 rounded-lg border border-border/50 bg-background p-3 shadow-sm"
										>
											<div className="flex items-center gap-2 flex-1">
												<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
													<Bike className="h-4 w-4" />
												</div>
												<div className="flex-1">
													<input
														className="w-full bg-transparent font-bold text-foreground text-sm outline-none focus:ring-1 focus:ring-primary/20"
														onChange={(e) => {
															const newPlatforms = [...(settings.platforms || [])];
															newPlatforms[index] = { ...newPlatforms[index], name: e.target.value };
															setSettings({ ...settings, platforms: newPlatforms });
														}}
														value={platform.name}
													/>
												</div>
											</div>

											<div className="flex items-center gap-2">
												<input
													className="w-20 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-bold text-foreground text-right outline-none transition-all focus:border-primary/50"
													onChange={(e) => {
														const val = Number(e.target.value);
														const newPlatforms = [...(settings.platforms || [])];
														newPlatforms[index] = { ...newPlatforms[index], commissionRate: isNaN(val) ? 0 : val / 100 };
														setSettings({ ...settings, platforms: newPlatforms });
													}}
													placeholder="20"
													type="number"
													value={Math.round(platform.commissionRate * 100)}
												/>
												<span className="text-[10px] font-bold text-muted-foreground">%</span>
												<button
													className={`relative h-5 w-9 rounded-full transition-all duration-300 ${platform.isActive ? "bg-primary" : "bg-input"}`}
													onClick={() => {
														const newPlatforms = [...(settings.platforms || [])];
														newPlatforms[index] = { ...newPlatforms[index], isActive: !newPlatforms[index].isActive };
														setSettings({ ...settings, platforms: newPlatforms });
													}}
													title="Aktifkan/Nonaktifkan"
													type="button"
												>
													<div
														className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${platform.isActive ? "right-0.5" : "left-0.5"}`}
													/>
												</button>
												<button
													className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
													onClick={() => {
														if (settings.platforms && settings.platforms.length > 1) {
															const newPlatforms = settings.platforms.filter((_, i) => i !== index);
															setSettings({ ...settings, platforms: newPlatforms });
														} else {
															toast.error("Minimal harus ada satu platform");
														}
													}}
													title="Hapus"
													type="button"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											</div>
										</div>
									))}

									<Button
										className="w-full border-dashed border-2"
										onClick={() => {
											const newPlatform = {
												id: `platform_${Date.now()}`,
												name: "Platform Baru",
												icon: "Bike",
												commissionRate: 0,
												isActive: true,
												sortOrder: (settings.platforms?.length || 0) + 1,
											};
											setSettings({
												...settings,
												platforms: [...(settings.platforms || []), newPlatform],
											});
										}}
										variant="outline"
									>
										<Plus className="mr-2 h-4 w-4" />
										Tambah Platform
									</Button>
								</div>
							</div>

							{/* QRIS Statis Image Upload */}
								<div className="space-y-4 pt-4 border-t border-border/50">
									<div className="space-y-1.5">
										<label
											className="block font-medium text-muted-foreground text-xs uppercase tracking-widest"
											htmlFor="qris-image"
										>
											Kode QR QRIS Statis
										</label>
										<p className="text-muted-foreground text-xs">
											Upload gambar QR Code toko Anda untuk pembayaran QRIS Statis.
										</p>
									</div>
									<div className="flex flex-col gap-6 sm:flex-row sm:items-center">
										{ (localPreviews.qrisImage || landingSettings.qrisImage) && (
											<div className="relative h-48 w-48 overflow-hidden rounded-xllll border-4 border-muted bg-white shadow-inner flex items-center justify-center p-2">
												<img
													alt="QRIS Preview"
													className="max-h-full max-w-full object-contain"
													src={localPreviews.qrisImage || landingSettings.qrisImage}
												/>
											</div>
										)}
										<div className="flex flex-1 flex-col gap-3">
											<input
												accept="image/*"
												className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xllll file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
												id="qris-image"
												onChange={async (e) => {
													const file = e.target.files?.[0];
													if (!file) {
														return;
													}
													try {
														let uploadBlob: Blob = file;
														let contentType = file.type || "image/jpeg";
														if (isOversized(file)) {
															toast.loading("Mengompresi gambar...", { id: "compress-qris" });
															const compressed = await compressFileToLimit(file);
															toast.dismiss("compress-qris");
															uploadBlob = await fetch(compressed).then((r) => r.blob());
															contentType = "image/jpeg";
														}
														const storageId = await generateUploadUrl({
															file: uploadBlob,
															contentType,
															fileName: file.name,
															folder: "site-settings",
														});
														const previewUrl = URL.createObjectURL(uploadBlob);
														setLocalPreviews(prev => ({ ...prev, qrisImage: previewUrl }));
														setLandingSettings({
															...landingSettings,
															qrisImage: storageId,
														});
														toast.success(
															"QRIS berhasil diunggah! Klik Simpan untuk mengaktifkan."
														);
													} catch (error) {
														toast.dismiss("compress-qris");
														console.error(error);
														toast.error("Gagal mengupload gambar QRIS");
													}
												}}
												type="file"
											/>
											<p className="text-muted-foreground/60 text-xs">
												Pastikan gambar QR Code terlihat jelas.
											</p>
										</div>
									</div>
								</div>

								<div className="space-y-4 pt-4">
									<div className="space-y-1.5">
										<label
											className="block font-medium text-muted-foreground text-xs uppercase tracking-widest"
											htmlFor="payment-popup-image"
										>
											Banner Promosi / Branding (Opsional)
										</label>
										<p className="text-muted-foreground text-xs">
											Akan muncul di modal pembayaran POS sebagai latar belakang atau banner promosi.
										</p>
									</div>
									<div className="flex flex-col gap-6 sm:flex-row sm:items-center">
										{ (localPreviews.paymentPopupImage || landingSettings.paymentPopupImage) && (
											<div className="relative h-48 w-48 overflow-hidden rounded-xllll border-4 border-muted bg-muted shadow-inner">
												<img
													alt="Popup Preview"
													className="h-full w-full object-cover"
													height={192}
													src={localPreviews.paymentPopupImage || landingSettings.paymentPopupImage}
													width={192}
												/>
											</div>
										)}
										<div className="flex flex-1 flex-col gap-3">
											<input
												accept="image/*"
												className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xllll file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
												id="payment-popup-image"
												onChange={async (e) => {
													const file = e.target.files?.[0];
													if (!file) {
														return;
													}
													try {
														let uploadBlob: Blob = file;
														let contentType = file.type || "image/jpeg";
														if (isOversized(file)) {
															toast.loading("Mengompresi gambar...", { id: "compress-popup" });
															const compressed = await compressFileToLimit(file);
															toast.dismiss("compress-popup");
															uploadBlob = await fetch(compressed).then((r) => r.blob());
															contentType = "image/jpeg";
														}
														const storageId = await generateUploadUrl({
															file: uploadBlob,
															contentType,
															fileName: file.name,
															folder: "site-settings",
														});
														const previewUrl = URL.createObjectURL(uploadBlob);
														setLocalPreviews(prev => ({ ...prev, paymentPopupImage: previewUrl }));
														setLandingSettings({
															...landingSettings,
															paymentPopupImage: storageId,
															logoUrl: landingSettings.logoUrl,
														});
														toast.success(
															"Selesai! Klik Simpan untuk memperbarui."
														);
													} catch (error) {
														toast.dismiss("compress-popup");
														console.error(error);
														toast.error("Gagal mengupload gambar");
													}
												}}
												type="file"
											/>
											<p className="text-muted-foreground/60 text-xs">
												Rekomendasi ukuran: 800x800px (Max 1MB).
											</p>
										</div>
									</div>
								</div>

								{/* Mayar Payment Gateway Section */}
								<div className="space-y-4 rounded-xlllxl border border-border/50 bg-muted/30 p-4 md:p-6">
									<div className="flex items-center gap-3 border-border/50 border-b pb-4">
										<Wallet className="h-5 w-5 text-primary" />
										<div>
											<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
												Payment Gateway Mayar.id
											</h4>
											<p className="text-muted-foreground text-xs">
												Integrasi pembayaran QRIS otomatis
											</p>
										</div>
									</div>

									{!mayarApiConfigured && (
										<div className="flex items-center gap-3 rounded-xllll border border-amber-500/20 bg-amber-500/10 p-4">
											<ShieldCheck className="h-5 w-5 text-amber-600" />
											<p className="text-amber-700 text-xs">
												API Key Mayar belum dikonfigurasi di environment. Hubungi administrator untuk mengaktifkan fitur ini.
											</p>
										</div>
									)}

									{mayarApiConfigured && (
										<>
											<div className="flex items-center justify-between rounded-xllll border border-border bg-card p-4">
												<div>
													<span className="block font-bold text-foreground text-sm tracking-tight">
														Aktifkan Mayar Payment Gateway
													</span>
													<span className="text-muted-foreground text-xs">
														Izinkan pembayaran melalui invoice QRIS Mayar.id
													</span>
												</div>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${paymentSettings.mayarEnabled ? "bg-primary" : "bg-input"}`}
													onClick={() =>
														setPaymentSettings({
															...paymentSettings,
															mayarEnabled: !paymentSettings.mayarEnabled,
														})
													}
													type="button"
												>
													<div
														className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.mayarEnabled ? "right-1" : "left-1"}`}
													/>
												</button>
											</div>

											{paymentSettings.mayarEnabled && (
												<div className="flex items-center justify-between rounded-xllll border border-border bg-card p-4">
													<div>
														<span className="block font-bold text-foreground text-sm tracking-tight">
															Mode Testing (Sandbox)
														</span>
														<span className="text-muted-foreground text-xs">
															Gunakan environment sandbox untuk pengujian
														</span>
													</div>
													<button
														className={`relative h-6 w-11 rounded-full transition-all duration-300 ${paymentSettings.mayarTestMode ? "bg-amber-500" : "bg-input"}`}
														onClick={() =>
															setPaymentSettings({
																...paymentSettings,
																mayarTestMode: !paymentSettings.mayarTestMode,
															})
														}
														type="button"
													>
														<div
															className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.mayarTestMode ? "right-1" : "left-1"}`}
														/>
													</button>
												</div>
											)}

											{paymentSettings.mayarEnabled && paymentSettings.mayarTestMode && (
												<div className="rounded-xllll border border-amber-500/20 bg-amber-500/5 p-4">
													<p className="text-amber-700 text-xs">
														<strong>Mode Sandbox Aktif:</strong> Transaksi tidak akan diproses secara nyata. Pastikan untuk menonaktifkan mode ini saat production.
													</p>
												</div>
											)}

											{paymentSettings.mayarEnabled && !paymentSettings.mayarTestMode && (
												<div className="rounded-xllll border border-green-500/20 bg-green-500/5 p-4">
													<p className="text-green-700 text-xs">
														<strong>Mode Production Aktif:</strong> Semua transaksi akan diproses secara nyata melalui Mayar.id
													</p>
												</div>
											)}
										</>
									)}
								</div>

								<div className="space-y-5 rounded-xllll border border-border bg-card p-4 md:p-6">
									<div className="flex items-center gap-3 border-b border-border/50 pb-4">
										<Users className="h-5 w-5 text-primary" />
										<div>
											<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
												Customer Self-Service
											</h4>
											<p className="text-muted-foreground text-xs">
												Atur flow pemesanan customer di halaman brand.
											</p>
										</div>
									</div>

									<div className="grid gap-3 md:grid-cols-2">
										{([
											{
												key: "enabled",
												label: "Aktifkan halaman ordering customer",
												description: "Izinkan flow self-service aktif di halaman brand.",
											},
											{
												key: "enablePartySizeSelection",
												label: "Pilih jumlah orang",
												description: "Tampilkan step jumlah tamu sebelum mulai pesan.",
											},
											{
												key: "enableFreeRefillPrompt",
												label: "Prompt free refill",
												description: "Tawarkan add-on free refill sebelum customer memilih menu.",
											},
											{
												key: "enableBarcodeScan",
												label: "Scan barcode / kamera",
												description: "Aktifkan scanner barcode menu dari kamera perangkat.",
											},
											{
												key: "enableMenuNumberEntry",
												label: "Input nomor produk",
												description: "Nomor menu lengkap akan langsung menambah item ke cart.",
											},
											{
												key: "enableCatalogBrowsing",
												label: "Mode katalog produk",
												description: "Izinkan customer browsing produk lewat katalog kategori.",
											},
											{
												key: "enableStaffCall",
												label: "Tombol panggil staff",
												description: "Customer bisa kirim request call staff ke admin.",
											},
											{
												key: "enableDessertLater",
												label: "Dessert nanti",
												description: "Tampilkan opsi dessert dibawakan nanti dan request follow-up.",
											},
											{
												key: "requireTableNumber",
												label: "Wajib nomor meja",
												description: "Minta nomor meja sebelum checkout untuk memudahkan layanan.",
											},
										] as const).map((item) => (
											<div
												className="flex items-center justify-between rounded-xllll border border-border bg-card p-4"
												key={item.key}
											>
												<div className="pr-4">
													<span className="block font-bold text-foreground text-sm">
														{item.label}
													</span>
													<span className="text-muted-foreground text-xs">
														{item.description}
													</span>
												</div>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${
														customerOrderingSettings[item.key]
															? "bg-primary"
															: "bg-input"
													}`}
													onClick={() =>
														setCustomerOrderingSettings((prev) => ({
															...prev,
															[item.key]: !prev[item.key],
														}))
													}
													type="button"
												>
													<div
														className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
															customerOrderingSettings[item.key]
																? "right-1"
																: "left-1"
														}`}
													/>
												</button>
											</div>
										))}
									</div>

									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2 md:col-span-2">
											<label className="font-medium text-muted-foreground text-xs" htmlFor="customer-ordering-welcome-title">
												Judul Welcome
											</label>
											<input
												id="customer-ordering-welcome-title"
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												onChange={(e) =>
													setCustomerOrderingSettings((prev) => ({
														...prev,
														welcomeTitle: e.target.value,
													}))
												}
												type="text"
												value={customerOrderingSettings.welcomeTitle}
											/>
										</div>
										<div className="space-y-2 md:col-span-2">
											<label className="font-medium text-muted-foreground text-xs" htmlFor="customer-ordering-welcome-subtitle">
												Subjudul Welcome
											</label>
											<textarea
												id="customer-ordering-welcome-subtitle"
												className="min-h-[90px] w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												onChange={(e) =>
													setCustomerOrderingSettings((prev) => ({
														...prev,
														welcomeSubtitle: e.target.value,
													}))
												}
												value={customerOrderingSettings.welcomeSubtitle}
											/>
										</div>
										<div className="space-y-2">
											<label className="font-medium text-muted-foreground text-xs" htmlFor="customer-ordering-welcome-button">
												Label tombol mulai
											</label>
											<input
												id="customer-ordering-welcome-button"
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												onChange={(e) =>
													setCustomerOrderingSettings((prev) => ({
														...prev,
														welcomeButtonLabel: e.target.value,
													}))
												}
												type="text"
												value={customerOrderingSettings.welcomeButtonLabel}
											/>
										</div>
										<div className="space-y-2">
											<label className="font-medium text-muted-foreground text-xs" htmlFor="customer-ordering-cash-label">
												Label pembayaran kasir
											</label>
											<input
												id="customer-ordering-cash-label"
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												onChange={(e) =>
													setCustomerOrderingSettings((prev) => ({
														...prev,
														cashPaymentLabel: e.target.value,
													}))
												}
												type="text"
												value={customerOrderingSettings.cashPaymentLabel}
											/>
										</div>
										<div className="space-y-2 md:col-span-2">
											<label className="font-medium text-muted-foreground text-xs" htmlFor="customer-ordering-mayar-label">
												Label pembayaran online
											</label>
											<input
												id="customer-ordering-mayar-label"
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												onChange={(e) =>
													setCustomerOrderingSettings((prev) => ({
														...prev,
														mayarPaymentLabel: e.target.value,
													}))
												}
												type="text"
												value={customerOrderingSettings.mayarPaymentLabel}
											/>
										</div>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "store" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
									<MapPin className="h-5 w-5" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Informasi & Biaya Toko
									</h3>
									<p className="text-muted-foreground text-sm">
										Profil Bisnis & Kebijakan Pajak
									</p>
								</div>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div className="space-y-2 md:col-span-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="store-name"
									>
										Nama Toko
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="store-name"
										onChange={(e) =>
											setSettings({ ...settings, storeName: e.target.value })
										}
										type="text"
										value={settings.storeName}
									/>
								</div>

								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="store-address"
									>
										Alamat Toko
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="store-address"
										onChange={(e) =>
											setSettings({ ...settings, storeAddress: e.target.value })
										}
										placeholder="Jl. Contoh No. 123"
										type="text"
										value={settings.storeAddress}
									/>
								</div>

								<div className="space-y-2 md:col-span-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="store-phone"
									>
										Nomor Telepon
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="store-phone"
										onChange={(e) =>
											setSettings({ ...settings, storePhone: e.target.value })
										}
										placeholder="08123456789"
										type="text"
										value={settings.storePhone}
									/>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "branding" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<div className="space-y-6">
							<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<Globe className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Branding Aplikasi
										</h3>
										<p className="text-muted-foreground text-sm">
											Logo header, favicon, dan icon PWA
										</p>
									</div>
								</div>

								<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
									<div className="space-y-2 md:col-span-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="appName">
											Nama Aplikasi
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="appName"
											onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
											type="text"
											value={settings.appName}
										/>
									</div>

									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="appVersion">
											Versi Aplikasi
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="appVersion"
											onChange={(e) => setSettings({ ...settings, appVersion: e.target.value })}
											type="text"
											value={settings.appVersion}
										/>
									</div>

									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="developerName">
											Nama Developer
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="developerName"
											onChange={(e) => setSettings({ ...settings, developerName: e.target.value })}
											type="text"
											value={settings.developerName}
										/>
									</div>
								</div>

								<div className="space-y-5 border-border/50 border-t pt-5">
									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="header-logo-url">
											Logo Header
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="header-logo-url"
											onChange={(e) => setSettings({ ...settings, headerLogoUrl: e.target.value })}
											placeholder="https://example.com/logo-header.png"
											type="text"
											value={settings.headerLogoUrl}
										/>
									</div>

									<div className="flex flex-col gap-4 md:flex-row md:items-center">
										{(localPreviews.headerLogoUrl || settings.headerLogoUrl) && (
											<div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xllll border bg-background p-2">
												<img
													alt="Preview logo header"
													className="max-h-full max-w-full object-contain"
													src={localPreviews.headerLogoUrl || settings.headerLogoUrl}
												/>
											</div>
										)}
										<input
											accept="image/*"
											className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xllll file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
											onChange={async (e) => {
												const file = e.target.files?.[0];
												if (!file) return;
												try {
													const storageId = await uploadImageSetting(file, "headerLogoUrl");
													setSettings((prev) => ({ ...prev, headerLogoUrl: storageId }));
													toast.success("Logo header berhasil diunggah");
												} catch (error) {
													toast.dismiss("compress-headerLogoUrl");
													console.error(error);
													toast.error("Gagal mengunggah logo header");
												}
											}}
											type="file"
										/>
									</div>
								</div>

								<div className="grid grid-cols-1 gap-6 border-border/50 border-t pt-5 md:grid-cols-3">
									{[
										{
											id: "faviconUrl",
											label: "Favicon",
											placeholder: "https://example.com/favicon.png",
											hint: "Akan dipakai untuk tab browser.",
										},
										{
											id: "pwaIcon192Url",
											label: "Icon PWA 192x192",
											placeholder: "https://example.com/pwa-192.png",
											hint: "Dipakai untuk install shortcut.",
										},
										{
											id: "pwaIcon512Url",
											label: "Icon PWA 512x512",
											placeholder: "https://example.com/pwa-512.png",
											hint: "Dipakai untuk splash screen.",
										},
									].map((item) => (
										<div className="space-y-3" key={item.id}>
											<label className="font-medium text-muted-foreground text-xs" htmlFor={item.id}>
												{item.label}
											</label>
											<input
												className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id={item.id}
												onChange={(e) =>
													setSettings({ ...settings, [item.id]: e.target.value })
												}
												placeholder={item.placeholder}
												type="text"
												value={(settings as any)[item.id]}
											/>
											<input
												accept="image/*"
												className="block w-full text-muted-foreground text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground"
												onChange={async (e) => {
													const file = e.target.files?.[0];
													if (!file) return;
													try {
														const storageId = await uploadImageSetting(file, item.id);
														setSettings((prev) => ({ ...prev, [item.id]: storageId }));
														toast.success(`${item.label} berhasil diunggah`);
													} catch (error) {
														toast.dismiss(`compress-${item.id}`);
														console.error(error);
														toast.error(`Gagal mengunggah ${item.label}`);
													}
												}}
												type="file"
											/>
											<p className="text-[10px] text-muted-foreground">{item.hint}</p>
										</div>
									))}
								</div>

								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs" htmlFor="pwaMaskableIconUrl">
										Icon PWA Maskable 512x512
									</label>
									<input
										className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="pwaMaskableIconUrl"
										onChange={(e) => setSettings({ ...settings, pwaMaskableIconUrl: e.target.value })}
										placeholder="https://example.com/pwa-maskable-512.png"
										type="text"
										value={settings.pwaMaskableIconUrl}
									/>
									<input
										accept="image/*"
										className="block w-full text-muted-foreground text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											if (!file) return;
											try {
												const storageId = await uploadImageSetting(file, "pwaMaskableIconUrl");
												setSettings((prev) => ({ ...prev, pwaMaskableIconUrl: storageId }));
												toast.success("Icon maskable berhasil diunggah");
											} catch (error) {
												toast.dismiss("compress-pwaMaskableIconUrl");
												console.error(error);
												toast.error("Gagal mengunggah icon maskable");
											}
										}}
										type="file"
									/>
								</div>
							</section>

							<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<Globe className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Share Link & SEO
										</h3>
										<p className="text-muted-foreground text-sm">
											Meta title, description, Open Graph, dan Twitter Card
										</p>
									</div>
								</div>

								<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
									<div className="space-y-2 md:col-span-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoMetaTitle">
											SEO Meta Title
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoMetaTitle"
											onChange={(e) => setSettings({ ...settings, seoMetaTitle: e.target.value })}
											placeholder="Judul halaman untuk Google"
											type="text"
											value={settings.seoMetaTitle}
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoMetaDescription">
											SEO Meta Description
										</label>
										<textarea
											className="min-h-[100px] w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoMetaDescription"
											onChange={(e) => setSettings({ ...settings, seoMetaDescription: e.target.value })}
											placeholder="Deskripsi singkat untuk mesin pencari"
											value={settings.seoMetaDescription}
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoMetaKeywords">
											SEO Keywords
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoMetaKeywords"
											onChange={(e) => setSettings({ ...settings, seoMetaKeywords: e.target.value })}
											placeholder="pos, kasir, coffee shop, restoran"
											type="text"
											value={settings.seoMetaKeywords}
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoCanonicalUrl">
											Canonical URL
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoCanonicalUrl"
											onChange={(e) => setSettings({ ...settings, seoCanonicalUrl: e.target.value })}
											placeholder="https://domainbisnis.com/"
											type="url"
											value={settings.seoCanonicalUrl}
										/>
									</div>

									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoShareTitle">
											Share Title (OG/Twitter)
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoShareTitle"
											onChange={(e) => setSettings({ ...settings, seoShareTitle: e.target.value })}
											placeholder="Judul saat link dibagikan"
											type="text"
											value={settings.seoShareTitle}
										/>
									</div>

									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoShareImageUrl">
											Share Image (OG/Twitter)
										</label>
										<input
											className="w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoShareImageUrl"
											onChange={(e) => setSettings({ ...settings, seoShareImageUrl: e.target.value })}
											placeholder="https://domain.com/share-image.png"
											type="text"
											value={settings.seoShareImageUrl}
										/>
										<input
											accept="image/*"
											className="block w-full text-muted-foreground text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground"
											onChange={async (e) => {
												const file = e.target.files?.[0];
												if (!file) return;
												try {
													const storageId = await uploadImageSetting(file, "seoShareImageUrl");
													setSettings((prev) => ({ ...prev, seoShareImageUrl: storageId }));
													toast.success("Share image berhasil diunggah");
												} catch (error) {
													toast.dismiss("compress-seoShareImageUrl");
													console.error(error);
													toast.error("Gagal mengunggah share image");
												}
											}}
											type="file"
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<label className="font-medium text-muted-foreground text-xs" htmlFor="seoShareDescription">
											Share Description (OG/Twitter)
										</label>
										<textarea
											className="min-h-[100px] w-full rounded-xllll bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="seoShareDescription"
											onChange={(e) => setSettings({ ...settings, seoShareDescription: e.target.value })}
											placeholder="Deskripsi saat link dibagikan ke WhatsApp, Telegram, dll."
											value={settings.seoShareDescription}
										/>
									</div>
								</div>
							</section>
						</div>
					</div>
				)}

				{activeTab === "yumiAI" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
									<ShieldCheck className="h-5 w-5" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Konfigurasi Yumi AI
									</h3>
									<p className="text-muted-foreground text-sm">
										Pilih model AI untuk OCR/Vision, Chat/Teks, Ringkas/Sintesis, Analitik, dan fallback.
									</p>
								</div>
							</div>

							<div className="rounded-xllll border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground leading-relaxed">
								Perubahan model akan tersimpan di settings dan langsung dipakai di Yumi AI Chat admin, Yumi AI Chat POS, OCR scan struk, serta fitur ringkasan/sintesis.
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Model OCR / Vision
									</label>
									<Select
										onValueChange={(value) =>
											setAiModelConfig((prev) => ({ ...prev, ocrVisionModel: value as string }))
										}
										value={aiModelConfig.ocrVisionModel}
									>
										<SelectTrigger className="bg-muted/50" size="default">
											<SelectValue placeholder="Pilih model OCR/Vision" />
										</SelectTrigger>
										<SelectContent>
											{AI_MODEL_OPTIONS.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{modelId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Model Chat / Teks
									</label>
									<Select
										onValueChange={(value) =>
											setAiModelConfig((prev) => ({ ...prev, chatTextModel: value as string }))
										}
										value={aiModelConfig.chatTextModel}
									>
										<SelectTrigger className="bg-muted/50" size="default">
											<SelectValue placeholder="Pilih model chat" />
										</SelectTrigger>
										<SelectContent>
											{AI_MODEL_OPTIONS.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{modelId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Model Ringkas / Sintesis
									</label>
									<Select
										onValueChange={(value) =>
											setAiModelConfig((prev) => ({ ...prev, synthesisModel: value as string }))
										}
										value={aiModelConfig.synthesisModel}
									>
										<SelectTrigger className="bg-muted/50" size="default">
											<SelectValue placeholder="Pilih model sintesis" />
										</SelectTrigger>
										<SelectContent>
											{AI_MODEL_OPTIONS.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{modelId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Model Analitik
									</label>
									<Select
										onValueChange={(value) =>
											setAiModelConfig((prev) => ({ ...prev, analyticsModel: value as string }))
										}
										value={aiModelConfig.analyticsModel}
									>
										<SelectTrigger className="bg-muted/50" size="default">
											<SelectValue placeholder="Pilih model analitik" />
										</SelectTrigger>
										<SelectContent>
											{AI_MODEL_OPTIONS.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{modelId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2 md:col-span-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
										Model Lainnya (Fallback)
									</label>
									<Select
										onValueChange={(value) =>
											setAiModelConfig((prev) => ({ ...prev, fallbackModel: value as string }))
										}
										value={aiModelConfig.fallbackModel}
									>
										<SelectTrigger className="bg-muted/50" size="default">
											<SelectValue placeholder="Pilih model fallback" />
										</SelectTrigger>
										<SelectContent>
											{AI_MODEL_OPTIONS.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{modelId}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</section>
					</div>
				)}

			{activeTab === "users" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<Users className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Manajemen Pengguna
										</h3>
										<p className="text-muted-foreground text-sm">
											Kelola akun staf dan profil akses mereka
										</p>
									</div>
								</div>
								<Button onClick={() => setShowFaceEnrollment(!showFaceEnrollment)} variant="outline" size="sm" className="gap-2">
									<UserPlus className="h-4 w-4" /> Tambah Staf
								</Button>
							</div>

							{/* User Table Implementation */}
							<div className="space-y-6">
								{/* Create/Edit Form (Moved to a conditional area or modal for cleaner look) */}
								{(newUser.name || editingUser) && (
									<div className="rounded-xlllxl border border-primary/20 bg-primary/5 p-4 md:p-6 space-y-4">
										<div className="flex items-center justify-between border-b border-primary/10 pb-3">
											<h4 className="font-bold text-sm text-foreground uppercase tracking-wider">
												{editingUser ? "Edit Pengguna" : "Tambah User Baru"}
											</h4>
											<button onClick={() => { setEditingUser(null); setNewUser({ username: "", password: "", name: "", roleId: "", homePin: "", slug: "" }); }} className="text-muted-foreground hover:text-foreground">
												<X className="h-4 w-4" />
											</button>
										</div>
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
											<div className="space-y-1.5">
												<label className="text-[10px] font-bold uppercase text-muted-foreground">Nama Lengkap</label>
												<Input className="h-10 text-xs" value={editingUser ? editingUser.name : newUser.name} onChange={(e) => editingUser ? setEditingUser({ ...editingUser, name: e.target.value }) : setNewUser({ ...newUser, name: e.target.value })} placeholder="Budi Santoso" />
											</div>
											<div className="space-y-1.5">
												<label className="text-[10px] font-bold uppercase text-muted-foreground">Email / Username</label>
												<Input className="h-10 text-xs" value={editingUser ? editingUser.username : newUser.username} onChange={(e) => editingUser ? setEditingUser({ ...editingUser, username: normalizeEmail(e.target.value) }) : setNewUser({ ...newUser, username: normalizeEmail(e.target.value) })} placeholder="budi@example.com" />
											</div>
											{!editingUser && (
												<div className="space-y-1.5">
													<label className="text-[10px] font-bold uppercase text-muted-foreground">Password</label>
													<Input className="h-10 text-xs" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="••••••••" />
												</div>
											)}
											<div className="space-y-1.5">
												<label className="text-[10px] font-bold uppercase text-muted-foreground">Role</label>
												<select className="w-full rounded-lg border border-border bg-background p-2.5 text-xs" value={editingUser ? editingUser.roleId : newUser.roleId} onChange={(e) => editingUser ? setEditingUser({ ...editingUser, roleId: e.target.value as any }) : setNewUser({ ...newUser, roleId: e.target.value })}>
													<option value="">Pilih Role</option>
													{roles?.map((r: any) => <option key={r._id} value={r._id}>{r.name}</option>)}
												</select>
											</div>
											<div className="space-y-1.5">
												<label className="text-[10px] font-bold uppercase text-muted-foreground">PIN Akses (6 digit)</label>
												<Input className="h-10 text-xs" type="password" maxLength={6} value={editingUser ? editingUser.homePin : newUser.homePin} onChange={(e) => editingUser ? setEditingUser({ ...editingUser, homePin: e.target.value.replace(/\D/g, "") }) : setNewUser({ ...newUser, homePin: e.target.value.replace(/\D/g, "") })} placeholder="123456" />
											</div>
											<div className="space-y-1.5">
												<label className="text-[10px] font-bold uppercase text-muted-foreground">Slug URL</label>
												<Input className="h-10 text-xs" value={editingUser ? editingUser.slug : newUser.slug} onChange={(e) => editingUser ? setEditingUser({ ...editingUser, slug: e.target.value.toLowerCase() }) : setNewUser({ ...newUser, slug: e.target.value.toLowerCase() })} placeholder="budi-barista" />
											</div>
										</div>
										{editingUser && (
											<div className="flex flex-wrap gap-4 pt-2">
												<label className="flex items-center gap-2 cursor-pointer">
													<input type="checkbox" checked={editingUser.isActive} onChange={() => setEditingUser({ ...editingUser, isActive: !editingUser.isActive })} className="h-4 w-4 rounded" />
													<span className="text-xs font-bold text-foreground">Akun Aktif</span>
												</label>
												<label className="flex items-center gap-2 cursor-pointer">
													<input type="checkbox" checked={editingUser.receiveReportEmails} onChange={() => setEditingUser({ ...editingUser, receiveReportEmails: !editingUser.receiveReportEmails })} className="h-4 w-4 rounded" />
													<span className="text-xs font-bold text-foreground">Terima Laporan Email</span>
												</label>
											</div>
										)}
										<div className="flex justify-end gap-2 pt-2">
										<Button onClick={editingUser ? handleSaveEditUser : handleCreateUser} size="sm" loading={savingUser}>
											{editingUser ? "Simpan Perubahan" : "Simpan Pengguna"}
										</Button>
										</div>
									</div>
								)}

								{selectedUserIds.size > 0 && (
									<div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-xllll px-4 py-2.5">
										<span className="text-xs font-medium text-muted-foreground">{selectedUserIds.size} pengguna dipilih</span>
										<Button variant="destructive" size="sm" onClick={handleBulkDeleteUsers} className="text-xs h-8 ml-auto"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus {selectedUserIds.size}</Button>
									</div>
								)}
								<div className="overflow-hidden rounded-xllll border border-border bg-background shadow-sm">
									<div className="overflow-x-auto">
										<table className="w-full text-left text-sm">
											<thead className="bg-muted/50 font-bold text-muted-foreground text-[10px] uppercase tracking-widest border-b border-border">
												<tr>
													<th className="px-4 py-3 w-10">
														<input type="checkbox" className="h-3.5 w-3.5 rounded" checked={users ? selectedUserIds.size === users.length && users.length > 0 : false} onChange={toggleSelectAllUsers} />
													</th>
													<th className="px-4 py-3">Staf</th>
													<th className="px-4 py-3">Role</th>
													<th className="px-4 py-3">Status</th>
													<th className="px-4 py-3">Keamanan</th>
													<th className="px-4 py-3 text-right">Aksi</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border/50">
												{!users ? (
													Array.from({ length: 5 }).map((_, i) => (
														<tr key={i}><td colSpan={6} className="px-4 py-4"><Skeleton className="h-10 w-full" /></td></tr>
													))
												) : users.length === 0 ? (
													<tr><td colSpan={6} className="py-12 text-center text-muted-foreground italic">Belum ada staf terdaftar.</td></tr>
												) : (
													users.map((user: any) => (
														<tr key={user._id} className="hover:bg-muted/30 transition-colors group">
															<td className="px-4 py-3 w-10">
																<input type="checkbox" className="h-3.5 w-3.5 rounded" checked={selectedUserIds.has(user._id)} onChange={() => toggleSelectUser(user._id)} />
															</td>
																<td className="px-4 py-3">
																	<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-[10px]">
																		{user.name.charAt(0)}
																	</div>
																	<div>
																		<p className="font-bold text-foreground text-xs">{user.name}</p>
																		<p className="text-[10px] text-muted-foreground">{user.username}</p>
																	</div>
																</td>
															<td className="px-4 py-3">
																<span className="text-[11px] font-medium text-muted-foreground">{user.roleName || "Tanpa Role"}</span>
															</td>
															<td className="px-4 py-3">
																<span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
																	{user.isActive ? "AKTIF" : "NONAKTIF"}
																</span>
															</td>
															<td className="px-4 py-3">
																<div className="flex gap-1.5 flex-wrap">
																	{user.faceDescriptor && <span title="Wajah terdaftar" className="p-1 rounded bg-emerald-100 text-emerald-700"><Camera className="h-3 w-3" /></span>}
																	{user.homePin && <span title="PIN Aktif" className="p-1 rounded bg-blue-100 text-blue-700"><ShieldCheck className="h-3 w-3" /></span>}
																	{user.receiveReportEmails && <span title="Laporan Email" className="p-1 rounded bg-amber-100 text-amber-700"><Bell className="h-3 w-3" /></span>}
																</div>
															</td>
															<td className="px-4 py-3 text-right">
																<div className="flex items-center justify-end gap-1 transition-all">
																	<button title="Edit Staf" className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors" onClick={() => handleStartEditUser(user)}><Pencil className="h-3.5 w-3.5" /></button>
																	<button title="Hapus Staf" className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" onClick={() => handleDeleteUser(user._id)} disabled={savingUser}><Trash2 className="h-3.5 w-3.5" /></button>
																</div>
															</td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "system" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
							{/* Branding Section (Hidden to prevent confusion with Store Name for general admin) */}
							<section className="hidden space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<Settings2 className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Branding Aplikasi
										</h3>
										<p className="text-muted-foreground text-sm">
											Nama & Info Aplikasi
										</p>
									</div>
								</div>

								<div className="space-y-6">
									<div className="space-y-2">
										<label
											className="font-bold text-foreground text-xs uppercase tracking-widest"
											htmlFor="appName"
										>
											Nama Aplikasi
										</label>
										<input
											className="w-full rounded-xllll border border-border bg-muted/30 px-4 py-3 font-medium text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:bg-muted/50"
											id="appName"
											onChange={(e) =>
												setSettings({ ...settings, appName: e.target.value })
											}
											type="text"
											value={settings.appName}
										/>
									</div>

									<div className="space-y-2">
										<label
											className="font-bold text-foreground text-xs uppercase tracking-widest"
											htmlFor="appVersion"
										>
											Versi Aplikasi
										</label>
										<input
											className="w-full rounded-xllll border border-border bg-muted/30 px-4 py-3 font-medium text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:bg-muted/50"
											id="appVersion"
											onChange={(e) =>
												setSettings({ ...settings, appVersion: e.target.value })
											}
											type="text"
											value={settings.appVersion}
										/>
									</div>

									<div className="space-y-2">
										<label
											className="font-bold text-foreground text-xs uppercase tracking-widest"
											htmlFor="developerName"
										>
											Nama Developer
										</label>
										<input
											className="w-full rounded-xllll border border-border bg-muted/30 px-4 py-3 font-medium text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:bg-muted/50"
											id="developerName"
											onChange={(e) =>
												setSettings({
													...settings,
													developerName: e.target.value,
												})
											}
											type="text"
											value={settings.developerName}
										/>
									</div>
								</div>
							</section>

							<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<Printer className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Printer & Struk
										</h3>
										<p className="text-muted-foreground text-sm">
											Hardware & Output
										</p>
									</div>
								</div>

								<div className="space-y-6">
									<div className="flex items-center justify-between rounded-xllll border border-border bg-card p-4">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Cetak Struk Lunas Otomatis
											</span>
											<span className="text-muted-foreground text-xs">
												Struk reguler langsung tercetak setelah pembayaran
											</span>
										</div>
										<button
											className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.autoPrint ? "bg-primary" : "bg-input"}`}
											onClick={() =>
												setSettings({
													...settings,
													autoPrint: !settings.autoPrint,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoPrint ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="flex items-center justify-between rounded-xllll border border-border bg-card p-4">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Cetak Tiket Kitchen Otomatis
											</span>
											<span className="text-muted-foreground text-xs">
												Setelah checkout, cetak tiket produksi tanpa harga
											</span>
										</div>
										<button
											className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.autoPrintKitchenReceipt ? "bg-primary" : "bg-input"}`}
											onClick={() =>
												setSettings({
													...settings,
													autoPrintKitchenReceipt: !settings.autoPrintKitchenReceipt,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoPrintKitchenReceipt ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="flex items-center justify-between rounded-xllll border border-border bg-card p-4">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Izinkan Print Open Bill
											</span>
											<span className="text-muted-foreground text-xs">
												Tampilkan tombol print di step menu dan Simpan Orderan
											</span>
										</div>
										<button
											className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.allowOpenBillPrint ? "bg-primary" : "bg-input"}`}
											onClick={() =>
												setSettings({
													...settings,
													allowOpenBillPrint: !settings.allowOpenBillPrint,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.allowOpenBillPrint ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="space-y-3">
										<button
											className={`w-full rounded-xllll border-2 py-4 font-bold text-sm transition-all active:scale-95 ${
												isConnected
													? "border-green-500/20 bg-green-500/10 text-green-600"
													: "border-border border-dashed bg-muted/30 text-muted-foreground hover:bg-muted/50"
											}`}
											onClick={handleConnectPrinter}
											type="button"
										>
											{isConnected
												? `TERHUBUNG: ${printerName || "PRINTER"}`
												: "HUBUNGKAN PRINTER BLUETOOTH"}
										</button>
										{isConnected && (
											<button
												className="w-full text-center font-bold text-destructive text-xs hover:underline"
												onClick={() => {
													bluetoothPrinter.disconnect();
													setIsConnected(false);
													setPrinterName(null);
												}}
												type="button"
											>
												Putuskan Koneksi
											</button>
										)}
									</div>
								</div>
							</section>

							{/* Receipt Design Customization Section */}
							<section className="space-y-5 rounded-xllll border border-border bg-card p-4 md:space-y-6 md:p-6">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
										<Layout className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
											Desain & Layout Struk
										</h3>
										<p className="text-muted-foreground text-sm">
											Kustomisasi Tampilan Struk Fisik
										</p>
									</div>
								</div>

								<div className="space-y-6">
									<div className="grid grid-cols-3 gap-2">
										{[
											{ id: "paid", label: "Lunas" },
											{ id: "open_bill", label: "Open Bill" },
											{ id: "kitchen", label: "Kitchen" },
										].map((option) => (
											<Button
												key={option.id}
												type="button"
												onClick={() =>
													setReceiptPreviewMode(option.id as ReceiptPrintMode)
												}
												className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${
													receiptPreviewMode === option.id
														? ""
														: "text-muted-foreground"
												}`}
												size="sm"
												variant={
													receiptPreviewMode === option.id ? "default" : "outline"
												}
											>
												{option.label}
											</Button>
										))}
									</div>

									<ReceiptPreview
										settings={{
											receiptFooter: settings.receiptFooter,
											receiptLogo: settings.receiptLogo,
											receiptHeader: settings.receiptHeader,
											receiptShowLogo: settings.receiptShowLogo,
											receiptShowAddress: settings.receiptShowAddress,
											receiptShowPhone: settings.receiptShowPhone,
											receiptShowOrderNumber: settings.receiptShowOrderNumber,
											receiptShowCustomerName: settings.receiptShowCustomerName,
											receiptShowCashierName: settings.receiptShowCashierName,
											receiptShowNotes: settings.receiptShowNotes,
											receiptFontSize: settings.receiptFontSize,
										}}
										storeName={settings.storeName}
										storeAddress={settings.storeAddress}
										storePhone={settings.storePhone}
										logoSrc={localPreviews.receiptLogo || settings.receiptLogo}
										mode={receiptPreviewMode}
									/>

									{/* Header Text */}
									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
											Teks Header Kustom (Opsional)
										</label>
										<Input
											className="h-11 w-full bg-muted/50 font-medium"
											onChange={(e) => setSettings({ ...settings, receiptHeader: e.target.value })}
											placeholder="Kosongkan untuk menggunakan Nama Toko"
											value={settings.receiptHeader}
										/>
										<p className="text-[10px] text-muted-foreground">Jika diisi, teks ini akan menggantikan Nama Toko di bagian paling atas struk.</p>
									</div>

									{/* Footer Text */}
									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
											Teks Footer Kustom
										</label>
										<Textarea
											className="min-h-[80px] w-full bg-muted/50 font-medium"
											onChange={(e) =>
												setSettings({
													...settings,
													receiptFooter: e.target.value,
												})
											}
											placeholder="Terima kasih atas kunjungan Anda!"
											value={settings.receiptFooter}
										/>
										<p className="text-[10px] text-muted-foreground leading-relaxed">Pesan ini akan tercetak di bagian bawah setiap struk kasir dan kitchen.</p>
									</div>

									{/* Font Size */}
									<div className="space-y-2">
										<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
											Ukuran Font
										</label>
										<Select
											onValueChange={(value: string | null) =>
												value &&
												setSettings({ ...settings, receiptFontSize: value })
											}
											value={settings.receiptFontSize}
										>
											<SelectTrigger className="bg-muted/50" size="default">
												<SelectValue placeholder="Pilih ukuran font" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="small">Kecil</SelectItem>
												<SelectItem value="normal">Normal</SelectItem>
												<SelectItem value="large">Besar</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{/* Visibility Toggles */}
									<div className="space-y-3 pt-4 border-t border-border/50">
										<p className="font-bold text-foreground text-xs uppercase tracking-widest">Tampilkan Informasi</p>
										
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											{/* Show Logo */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowLogo: !settings.receiptShowLogo })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Logo Toko</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowLogo ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowLogo ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Address */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowAddress: !settings.receiptShowAddress })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Alamat Toko</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowAddress ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowAddress ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Phone */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowPhone: !settings.receiptShowPhone })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Nomor Telepon</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowPhone ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowPhone ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Order Number */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowOrderNumber: !settings.receiptShowOrderNumber })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Nomor Antrian</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowOrderNumber ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowOrderNumber ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Customer Name */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowCustomerName: !settings.receiptShowCustomerName })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Nama Pelanggan</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowCustomerName ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowCustomerName ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Cashier & Shift Info */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowCashierName: !settings.receiptShowCashierName })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Info Kasir & Shift</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowCashierName ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowCashierName ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Notes */}
											<div 
												className="flex items-center justify-between rounded-xllll border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowNotes: !settings.receiptShowNotes })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Catatan Pesanan</span>
												<button
													className={`relative h-6 w-11 rounded-full transition-all duration-300 ${settings.receiptShowNotes ? "bg-primary" : "bg-input"}`}
													type="button"
												>
													<div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowNotes ? "right-1" : "left-1"}`} />
												</button>
											</div>
										</div>
									</div>

									{/* Logo Upload specifically for Receipt (if different from landing) */}
									<div className="space-y-4 pt-4 border-t border-border/50">
										<div className="space-y-1.5">
											<label className="block font-medium text-muted-foreground text-xs uppercase tracking-widest">
												Logo Khusus Struk (Hitam Putih / 1-bit)
											</label>
											<p className="text-muted-foreground text-xs">
												Gunakan gambar logo dengan kontras tinggi untuk hasil terbaik pada printer termal.
											</p>
										</div>
										<div className="flex flex-col gap-6 sm:flex-row sm:items-center">
											{ (localPreviews.receiptLogo || settings.receiptLogo) && (
												<div className="relative h-32 w-32 overflow-hidden rounded-xllll border-4 border-muted bg-white shadow-inner flex items-center justify-center p-2">
													<img
														alt="Receipt Logo Preview"
														className="max-h-full max-w-full object-contain grayscale"
														src={localPreviews.receiptLogo || settings.receiptLogo}
													/>
												</div>
											)}
											<div className="flex flex-1 flex-col gap-3">
												<input
													accept="image/*"
													className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xllll file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
													onChange={async (e) => {
														const file = e.target.files?.[0];
														if (!file) return;
														try {
															let uploadBlob: Blob = file;
															let contentType = file.type || "image/jpeg";
															if (isOversized(file)) {
																toast.loading("Mengompresi gambar...", { id: "compress-receipt-logo" });
																const compressed = await compressFileToLimit(file);
																toast.dismiss("compress-receipt-logo");
																uploadBlob = await fetch(compressed).then((r) => r.blob());
																contentType = "image/jpeg";
															}
															const storageId = await generateUploadUrl({
																file: uploadBlob,
																contentType,
																fileName: file.name,
																folder: "site-settings",
															});
															const previewUrl = URL.createObjectURL(uploadBlob);
															setLocalPreviews(prev => ({ ...prev, receiptLogo: previewUrl }));
															setSettings({ ...settings, receiptLogo: storageId });
															toast.success("Logo struk berhasil diunggah!");
														} catch (error) {
															toast.dismiss("compress-receipt-logo");
															console.error(error);
															toast.error("Gagal mengupload logo struk");
														}
													}}
													type="file"
												/>
											</div>
										</div>
									</div>
								</div>
							</section>

							<section className="space-y-5 rounded-xlllxl border border-destructive/10 bg-destructive/5 p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-destructive/10 text-destructive">
										<Bell className="h-5 w-5" />
									</div>
									<div>
										<h3 className="font-bold text-destructive text-xl tracking-tight">
											Zona Bahaya
										</h3>
										<p className="text-destructive/60 text-sm">
											Reset & Pembersihan Data
										</p>
									</div>
								</div>

								<div className="space-y-6">
									<p className="text-muted-foreground text-sm leading-relaxed">
										Tindakan ini akan menghapus seluruh data transaksi sistem.
										Pastikan Anda telah melakukan backup sebelum melanjutkan.
									</p>
									<button
										className="w-full rounded-xllll bg-destructive py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95"
										type="button"
									>
										RESET SEMUA DATA
									</button>
								</div>
							</section>
						</div>
					</div>
				)}
			</div>

			<ConfirmationModal
				isOpen={confirmConfig.isOpen}
				message={confirmConfig.message}
				onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
				onConfirm={() => {
					confirmConfig.onConfirm();
					setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
				}}
				title={confirmConfig.title}
				variant={confirmConfig.variant}
			/>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/settings")({
	component: SettingsPage,
});


