import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
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
	Wallet,
	X,
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
import { authClient } from "@/lib/auth-client";
import {
	bluetoothPrinter,
	type ReceiptPrintMode,
} from "@/lib/bluetooth-printer";

type ShiftSchedule = {
	name: string;
	openTime?: string;
	closeTime?: string;
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
			price: "18.000",
			total: "36.000",
		},
	];
	const kitchenItems = [
		{ qty: 2, name: "TENTREM KOFFIE CLASSIC", variant: "Less Sugar, Oat Milk" },
		{ qty: 1, name: "CROISSANT BUTTER", variant: "Hangat" },
	];
	const infoRows = [
		settings.receiptShowOrderNumber ? ["ID", "ORD-D-6034"] : null,
		settings.receiptShowCashierName ? ["KASIR", "AYU"] : null,
		settings.receiptShowCashierName ? ["SHIFT", "SORE"] : null,
		["WAKTU", "31/03/2026 15:09"],
		mode === "paid" ? ["BAYAR", "QRIS"] : null,
		mode === "open_bill" ? ["STATUS", "OPEN BILL"] : null,
		["TIPE", "MAKAN DI SINI"],
		["MEJA", "07"],
		settings.receiptShowCustomerName ? ["PELANGGAN", "PELANGGAN UMUM"] : null,
	].filter(Boolean) as Array<[string, string]>;
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
									<div className="flex items-start justify-between gap-3" key={label}>
										<span className="text-zinc-500">{label}</span>
										<span className="max-w-[58%] text-right font-semibold">
											{value}
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
													{item.qty} x {item.price}
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
											<span>61.000</span>
										</div>
										<div className="flex justify-between gap-3 text-zinc-700">
											<span>PROMO / HAPPY HOUR</span>
											<span>-RP 5.000</span>
										</div>
										<div className="flex justify-between gap-3 text-zinc-700">
											<span>VOUCHER MEMBER</span>
											<span>-RP 6.100</span>
										</div>
										<div className="flex justify-between gap-3">
											<span className="text-zinc-600">PAJAK</span>
											<span>RP 0</span>
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

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
	return EMAIL_REGEX.test(normalizeEmail(email));
}

function isValidHomePin(pin: string) {
	return HOME_PIN_REGEX.test(pin);
}

type AiModelConfig = {
	ocrVisionModel: string;
	chatTextModel: string;
	synthesisModel: string;
	analyticsModel: string;
	fallbackModel: string;
};

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
}: {
	mode?: SettingsPageMode;
}) {
	// Site Settings
	const siteSettings = useQuery(api.site_settings.getSettings);
	const users = useQuery((api as any).users.getUsers);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const roles = useQuery((api as any).roles.getRoles);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _createUser = useMutation((api as any).users.createUser);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const _updateUser = useMutation((api as any).users.updateUser);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const deleteUser = useMutation((api as any).users.deleteUser);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const createRole = useMutation((api as any).roles.createRole);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const updateRole = useMutation((api as any).roles.updateRole);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const deleteRole = useMutation((api as any).roles.deleteRole);

	const mayarConfig = useQuery(api.mayar.isConfigured);
	const updateSiteSettings = useMutation(api.site_settings.updateSettings);
	const generateUploadUrl = useMutation(api.site_settings.generateUploadUrl);

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
		| "shifts"
		| "yumiAI"
		| "attendance"
	>(mode === "operational-team" ? "users" : "landing");

	useEffect(() => {
		setActiveTab(mode === "operational-team" ? "users" : "landing");
	}, [mode]);

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
		_id: string;
		name: string;
		permissions: string[];
	} | null>(null);
	const [showFaceEnrollment, setShowFaceEnrollment] = useState(false);
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
			setAiModelConfig({
				...DEFAULT_AI_MODEL_CONFIG,
				...(siteSettings.aiModelConfig ?? {}),
			});
		}
		setIsConnected(bluetoothPrinter.isConnected());
		setPrinterName(bluetoothPrinter.getDeviceName());
	}, [siteSettings]);

	const mayarApiConfigured = mayarConfig?.configured ?? false;

	const handleConnectPrinter = async () => {
		try {
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
				customerOrdering: customerOrderingSettings,
				aiModelConfig,
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
	const bindProfile = useMutation((api as any).users.bindProfile);

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
		try {
			// Primary source of truth: always persist user profile to Convex first.
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
			}
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal membuat user");
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
			setEditingUser(null);
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal memperbarui pengguna");
		}
	};

	const handleStartEditRole = (role: any) => {
		setEditingRole({
			_id: role._id,
			name: role.name || "",
			permissions: role.permissions || [],
		});
	};

	const handleSaveEditRole = async () => {
		if (!editingRole) return;
		if (!editingRole.name.trim()) {
			toast.error("Nama role wajib diisi");
			return;
		}

		try {
			await updateRole({
				id: editingRole._id,
				name: editingRole.name.trim(),
				permissions: editingRole.permissions,
			});
			toast.success("Role berhasil diperbarui");
			setEditingRole(null);
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal memperbarui role");
		}
	};

	const handleDeleteUser = (id: Id<"users">) => {
		setConfirmConfig({
			isOpen: true,
			title: "Hapus Pengguna?",
			message: "Akun ini tidak akan bisa login lagi ke sistem.",
			variant: "danger",
			onConfirm: async () => {
				try {
					await deleteUser({ id });
					toast.success("User dihapus");
				} catch (_error) {
					toast.error("Gagal menghapus user");
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
			});
			toast.success("Role berhasil dibuat");
			setNewRole({ name: "", permissions: [] });
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
				} catch (error) {
					toast.error((error as Error).message);
				}
			},
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

		const postUrl = await generateUploadUrl();
		const result = await fetch(postUrl, {
			method: "POST",
			headers: { "Content-Type": contentType },
			body: uploadBlob,
		});
		if (!result.ok) {
			throw new Error("Upload failed");
		}

		const { storageId } = await result.json();
		const previewUrl = URL.createObjectURL(uploadBlob);
		setLocalPreviews((prev) => ({ ...prev, [previewKey]: previewUrl }));
		return storageId as string;
	};

	const tabs =
		mode === "operational-team"
			? ([
					{ id: "users", label: "Pengguna & Akses", icon: Users },
					{ id: "shifts", label: "Manajemen Shift", icon: Clock },
					{ id: "attendance", label: "Pengaturan Absensi", icon: MapPin },
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
							? "Kelola Pengguna, Akses, dan Manajemen Shift"
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
			<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1 shadow-inner md:p-1.5">
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

			{/* Tab Content */}
			<div className="space-y-6">
				{activeTab === "landing" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<Layout className="h-6 w-6" />
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
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
										className="min-h-[120px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
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
										className="w-full appearance-none rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
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

				{activeTab === "pos" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<CreditCard className="h-6 w-6" />
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
								<div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-5">
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
												className={`relative h-6 w-10 file:rounded-full transition-all duration-300 rounded-full ${paymentSettings.manualMethods.cash ? "bg-primary" : "bg-muted-foreground/20"}`}
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
												className={`relative h-6 w-10 rounded-full transition-all duration-300 ${paymentSettings.manualMethods.qris ? "bg-primary" : "bg-muted-foreground/20"}`}
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
												className={`relative h-6 w-10 rounded-full transition-all duration-300 ${paymentSettings.manualMethods.transfer ? "bg-primary" : "bg-muted-foreground/20"}`}
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											<div className="relative h-48 w-48 overflow-hidden rounded-xl border-4 border-muted bg-white shadow-inner flex items-center justify-center p-2">
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
												className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
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
														const postUrl = await generateUploadUrl();
														const result = await fetch(postUrl, {
															method: "POST",
															headers: { "Content-Type": contentType },
															body: uploadBlob,
														});
														if (!result.ok) {
															throw new Error("Upload failed");
														}
														const { storageId } = await result.json();
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
											<div className="relative h-48 w-48 overflow-hidden rounded-xl border-4 border-muted bg-muted shadow-inner">
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
												className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
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
														const postUrl = await generateUploadUrl();
														const result = await fetch(postUrl, {
															method: "POST",
															headers: { "Content-Type": contentType },
															body: uploadBlob,
														});
														if (!result.ok) {
															throw new Error("Upload failed");
														}
														const { storageId } = await result.json();
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
								<div className="space-y-4 rounded-2xl border border-border/50 bg-muted/30 p-4 md:p-6">
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
										<div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
											<ShieldCheck className="h-5 w-5 text-amber-600" />
											<p className="text-amber-700 text-xs">
												API Key Mayar belum dikonfigurasi di environment. Hubungi administrator untuk mengaktifkan fitur ini.
											</p>
										</div>
									)}

									{mayarApiConfigured && (
										<>
											<div className="flex items-center justify-between rounded-xl bg-muted/40 p-5 shadow-inner">
												<div>
													<span className="block font-bold text-foreground text-sm tracking-tight">
														Aktifkan Mayar Payment Gateway
													</span>
													<span className="text-muted-foreground text-xs">
														Izinkan pembayaran melalui invoice QRIS Mayar.id
													</span>
												</div>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${paymentSettings.mayarEnabled ? "bg-primary" : "bg-muted-foreground/20"}`}
													onClick={() =>
														setPaymentSettings({
															...paymentSettings,
															mayarEnabled: !paymentSettings.mayarEnabled,
														})
													}
													type="button"
												>
													<div
														className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.mayarEnabled ? "right-1" : "left-1"}`}
													/>
												</button>
											</div>

											{paymentSettings.mayarEnabled && (
												<div className="flex items-center justify-between rounded-xl bg-muted/40 p-5 shadow-inner">
													<div>
														<span className="block font-bold text-foreground text-sm tracking-tight">
															Mode Testing (Sandbox)
														</span>
														<span className="text-muted-foreground text-xs">
															Gunakan environment sandbox untuk pengujian
														</span>
													</div>
													<button
														className={`relative h-7 w-12 rounded-full transition-all duration-300 ${paymentSettings.mayarTestMode ? "bg-amber-500" : "bg-muted-foreground/20"}`}
														onClick={() =>
															setPaymentSettings({
																...paymentSettings,
																mayarTestMode: !paymentSettings.mayarTestMode,
															})
														}
														type="button"
													>
														<div
															className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${paymentSettings.mayarTestMode ? "right-1" : "left-1"}`}
														/>
													</button>
												</div>
											)}

											{paymentSettings.mayarEnabled && paymentSettings.mayarTestMode && (
												<div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
													<p className="text-amber-700 text-xs">
														<strong>Mode Sandbox Aktif:</strong> Transaksi tidak akan diproses secara nyata. Pastikan untuk menonaktifkan mode ini saat production.
													</p>
												</div>
											)}

											{paymentSettings.mayarEnabled && !paymentSettings.mayarTestMode && (
												<div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
													<p className="text-green-700 text-xs">
														<strong>Mode Production Aktif:</strong> Semua transaksi akan diproses secara nyata melalui Mayar.id
													</p>
												</div>
											)}
										</>
									)}
								</div>

								<div className="space-y-5 rounded-2xl border border-border/50 bg-card p-4 md:p-6">
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
												className="flex items-center justify-between rounded-xl bg-muted/40 p-4 shadow-inner"
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
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${
														customerOrderingSettings[item.key]
															? "bg-primary"
															: "bg-muted-foreground/20"
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
														className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
												className="min-h-[90px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
						<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<MapPin className="h-6 w-6" />
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
							<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Globe className="h-6 w-6" />
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="header-logo-url"
											onChange={(e) => setSettings({ ...settings, headerLogoUrl: e.target.value })}
											placeholder="https://example.com/logo-header.png"
											type="text"
											value={settings.headerLogoUrl}
										/>
									</div>

									<div className="flex flex-col gap-4 md:flex-row md:items-center">
										{(localPreviews.headerLogoUrl || settings.headerLogoUrl) && (
											<div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border bg-background p-2">
												<img
													alt="Preview logo header"
													className="max-h-full max-w-full object-contain"
													src={localPreviews.headerLogoUrl || settings.headerLogoUrl}
												/>
											</div>
										)}
										<input
											accept="image/*"
											className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
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
												className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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

							<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Globe className="h-6 w-6" />
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="min-h-[100px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
											className="min-h-[100px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
						<section className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<ShieldCheck className="h-6 w-6" />
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

							<div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground leading-relaxed">
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

				{activeTab === "shifts" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<Clock className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Manajemen Shift
									</h3>
									<p className="text-muted-foreground text-sm">
										Atur shift kerja, jam operasional, dan popup pengingat kasir
									</p>
								</div>
							</div>

							<div className="space-y-8">
								{/* Predefined Shifts */}
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-1">
											<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
												Daftar Shift
											</h4>
											<p className="text-muted-foreground text-xs">
												Shift yang dapat dipilih oleh kasir saat mulai bertugas.
											</p>
										</div>
										<button
											onClick={() => {
												const rawName = window.prompt("Masukkan nama shift baru:");
												const name = rawName?.trim();
												if (name) {
													const nextShifts = [...shiftSettings.predefinedShifts, name];
													syncShiftSettings(nextShifts, [
														...shiftSettings.shiftSchedules,
														{ name, openTime: "", closeTime: "" },
													]);
												}
											}}
											className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary text-xs transition-all hover:bg-primary/20"
											type="button"
										>
											<Plus className="h-3 w-3" /> Tambah Shift
										</button>
									</div>

									<div className={teamShiftsGridClass}>
										{shiftSettings.predefinedShifts.map((shift, index) => {
											const schedule =
												shiftSettings.shiftSchedules.find(
													(item) => item.name === shift
												) ?? {
													name: shift,
													openTime: "",
													closeTime: "",
												};
											return (
											<div
												key={index}
												className="space-y-4 rounded-xl border border-border bg-muted/30 px-4 py-4"
											>
												<div className="flex items-start justify-between gap-3">
													<div>
														<p className="font-bold text-foreground text-sm">
															{shift}
														</p>
														<p className="text-[11px] text-muted-foreground">
															Pilih jam buka dan tutup shift ini.
														</p>
													</div>
													<button
														onClick={() => {
															const newShifts = [...shiftSettings.predefinedShifts];
															newShifts.splice(index, 1);
															syncShiftSettings(
																newShifts,
																shiftSettings.shiftSchedules.filter(
																	(item) => item.name !== shift
																)
															);
														}}
														className="text-muted-foreground hover:text-destructive transition-colors"
														type="button"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												</div>
												<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
													<div className="space-y-1.5">
														<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
															Jam Buka
														</label>
														<input
															className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
															type="time"
															value={schedule.openTime ?? ""}
															onChange={(e) =>
																setShiftSettings((prev) => ({
																	...prev,
																	shiftSchedules: buildShiftSchedules(
																		prev.predefinedShifts,
																		prev.shiftSchedules.map((item) =>
																			item.name === shift
																				? { ...item, openTime: e.target.value }
																				: item
																		)
																	),
																}))
															}
														/>
													</div>
													<div className="space-y-1.5">
														<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
															Jam Tutup
														</label>
														<input
															className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
															type="time"
															value={schedule.closeTime ?? ""}
															onChange={(e) =>
																setShiftSettings((prev) => ({
																	...prev,
																	shiftSchedules: buildShiftSchedules(
																		prev.predefinedShifts,
																		prev.shiftSchedules.map((item) =>
																			item.name === shift
																				? { ...item, closeTime: e.target.value }
																				: item
																		)
																	),
																}))
															}
														/>
													</div>
												</div>
											</div>
											);
										})}
										{shiftSettings.predefinedShifts.length === 0 && (
											<div className="col-span-full py-8 text-center border-2 border-dashed border-border rounded-xl">
												<p className="text-muted-foreground text-sm">
													Belum ada shift yang terdaftar.
												</p>
											</div>
										)}
									</div>
								</div>

								<div className="space-y-4 pt-6 border-t border-border">
									<div className="space-y-1">
										<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
											Popup Pengingat Tutup Shift
										</h4>
										<p className="text-muted-foreground text-xs">
											Kasir di halaman menu akan mendapat popup beberapa menit sebelum jam tutup.
										</p>
									</div>
									<div className="max-w-xs">
										<div className="relative">
											<input
												className="w-full rounded-xl bg-muted/50 py-3.5 pl-4 pr-20 font-black text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												min={1}
												onChange={(e) =>
													setShiftSettings({
														...shiftSettings,
														reminderMinutesBeforeClose: Number(e.target.value),
													})
												}
												type="number"
												value={shiftSettings.reminderMinutesBeforeClose}
											/>
											<span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">
												menit
											</span>
										</div>
									</div>
								</div>

								{/* Default Starting Cash */}
								<div className="space-y-4 pt-6 border-t border-border">
									<div className="space-y-1">
										<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
											Modal Awal Default
										</h4>
										<p className="text-muted-foreground text-xs">
											Jumlah modal awal otomatis yang terisi saat kasir membuka shift baru.
										</p>
									</div>
									<div className="max-w-xs">
										<div className="relative">
											<span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">
												Rp
											</span>
											<input
												className="w-full rounded-xl bg-muted/50 py-3.5 pl-11 pr-4 font-black text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
												onChange={(e) =>
													setShiftSettings({
														...shiftSettings,
														defaultStartingCash: Number(e.target.value),
													})
												}
												type="number"
												value={shiftSettings.defaultStartingCash}
											/>
										</div>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "attendance" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<MapPin className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Pengaturan Absensi & Geofencing
									</h3>
									<p className="text-muted-foreground text-sm">
										Konfigurasi Lokasi & Radius Kehadiran Tim
									</p>
								</div>
							</div>

							<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700 leading-relaxed dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-300">
								<p className="font-bold">Penting:</p>
								<p className="mt-1">
									Sistem absensi akan memvalidasi lokasi GPS staff saat melakukan Clock In/Out. 
									Pastikan koordinat di bawah sesuai dengan lokasi fisik kafe Anda.
								</p>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
										Latitude (Garis Lintang)
									</label>
									<Input
										className="h-11 w-full bg-muted/50 font-medium"
										type="number"
										step="any"
										onChange={(e) => setSettings({ ...settings, attendanceLat: Number(e.target.value) })}
										placeholder="-6.123456"
										value={settings.attendanceLat}
									/>
								</div>

								<div className="space-y-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
										Longitude (Garis Bujur)
									</label>
									<Input
										className="h-11 w-full bg-muted/50 font-medium"
										type="number"
										step="any"
										onChange={(e) => setSettings({ ...settings, attendanceLng: Number(e.target.value) })}
										placeholder="106.123456"
										value={settings.attendanceLng}
									/>
								</div>

								<div className="space-y-2 md:col-span-2">
									<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
										Radius Toleransi (Meter)
									</label>
									<div className="relative">
										<Input
											className="h-11 w-full bg-muted/50 font-medium"
											type="number"
											onChange={(e) => setSettings({ ...settings, attendanceRadius: Number(e.target.value) })}
											placeholder="50"
											value={settings.attendanceRadius}
										/>
										<span className="absolute top-1/2 right-4 -translate-y-1/2 font-bold text-muted-foreground text-sm">
											meter
										</span>
									</div>
									<p className="text-[10px] text-muted-foreground">
										Jarak maksimal staff diperbolehkan absen dari titik koordinat (Rekomendasi: 50-100m).
									</p>
								</div>

								<div className="md:col-span-2 pt-2">
									<Button 
										variant="outline" 
										className="w-full h-11 border-dashed"
										onClick={() => {
											if (navigator.geolocation) {
												toast.loading("Mendapatkan lokasi saat ini...");
												navigator.geolocation.getCurrentPosition(
													(pos) => {
														setSettings({
															...settings,
															attendanceLat: pos.coords.latitude,
															attendanceLng: pos.coords.longitude
														});
														toast.dismiss();
														toast.success("Lokasi berhasil didapatkan!");
													},
													(err) => {
														toast.dismiss();
														toast.error("Gagal mendapatkan lokasi. Pastikan izin GPS aktif.");
													}
												);
											} else {
												toast.error("Browser tidak mendukung geolokasi.");
											}
										}}
									>
										<MapPin className="mr-2 h-4 w-4" /> Gunakan Lokasi Saya Saat Ini
									</Button>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "users" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<Users className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
										Manajemen Pengguna & Akses
									</h3>
									<p className="text-muted-foreground text-sm">
										Kelola akun staf dan hak akses
									</p>
								</div>
							</div>

							<div className={teamUsersGridClass}>
								{/* Create User Form */}
								<div className="space-y-4 rounded-2xl border border-border/50 bg-muted/30 p-4 md:space-y-6 md:p-6">
									<div className="flex items-center gap-2 border-border/50 border-b pb-4">
										<User className="h-4 w-4 text-primary" />
										<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
											Tambah User Baru
										</h4>
									</div>
									<div className="space-y-4">
										<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
											<p className="font-semibold">Integrasi Resend</p>
											<p className="mt-1">
												Pilih penerima laporan email dari <strong>edit pengguna</strong> dengan mengaktifkan opsi <strong>Terima laporan email</strong>.
											</p>
											<p className="mt-1">
												Penerima saat ini:{" "}
												{reportRecipients.length > 0
													? reportRecipients.join(", ")
													: "Belum ada penerima khusus yang aktif dengan email valid."}
											</p>
											<p className="mt-1">
												Jika belum ada penerima khusus dipilih, sistem akan tetap fallback ke admin aktif yang memiliki email valid agar data lama tetap aman.
											</p>
											<div className="mt-3 rounded-lg border border-blue-200 bg-white/80 p-3 dark:border-blue-800 dark:bg-slate-900/40">
												<label className="flex cursor-pointer items-start gap-3">
													<input
														type="checkbox"
														className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-400"
														checked={shiftSettings.autoSendShiftReportEmail}
														onChange={(e) =>
															setShiftSettings({
																...shiftSettings,
																autoSendShiftReportEmail: e.target.checked,
															})
														}
													/>
													<span className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-200">
														<span className="block font-semibold">
															Kirim otomatis laporan shift saat shift diakhiri
														</span>
														Jika aktif, setiap proses akhiri shift akan langsung
														mengirim email laporan ke daftar pengguna aktif yang
														ditandai menerima laporan email.
													</span>
												</label>
											</div>
											<div className="mt-3 space-y-1.5">
												<label
													className="block font-medium text-[11px]"
													htmlFor="resend-from-email"
												>
													RESEND_FROM_EMAIL (Pengirim)
												</label>
												<input
													className="w-full rounded-lg border border-blue-200 bg-white/90 p-2 text-xs outline-none transition-all focus:ring-2 focus:ring-blue-300 dark:border-blue-800 dark:bg-slate-900/40"
													id="resend-from-email"
													onChange={(e) =>
														setSettings({
															...settings,
															resendFromEmail: normalizeEmail(e.target.value),
														})
													}
													placeholder="reports@domainkamu.com"
													type="email"
													value={settings.resendFromEmail}
												/>
												<p className="text-[11px] opacity-80">
													Wajib gunakan email/domain yang sudah verified di Resend.
												</p>
												{settings.resendFromEmail &&
												!isValidEmail(settings.resendFromEmail) ? (
													<p className="text-[11px] text-red-600 dark:text-red-400">
														Format email pengirim belum valid.
													</p>
												) : null}
											</div>
										</div>
										<div className="space-y-1.5">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-name"
											>
												Nama Lengkap
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-name"
												onChange={(e) =>
													setNewUser({ ...newUser, name: e.target.value })
												}
												placeholder="Contoh: Budi Santoso"
												type="text"
												value={newUser.name}
											/>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-username"
											>
												Username (Email)
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-username"
												onChange={(e) =>
													setNewUser({
														...newUser,
														username: normalizeEmail(e.target.value),
													})
												}
												placeholder="budi@example.com"
												type="email"
												value={newUser.username}
											/>
											{newUser.username && !isValidEmail(newUser.username) ? (
												<p className="text-[11px] text-destructive">
													Format email belum valid.
												</p>
											) : null}
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-password"
											>
												Password
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-password"
												onChange={(e) =>
													setNewUser({ ...newUser, password: e.target.value })
												}
												placeholder="••••••••"
												type="password"
												value={newUser.password}
											/>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-home-pin"
											>
												PIN Akses /home (6 digit)
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-home-pin"
												inputMode="numeric"
												maxLength={6}
												onChange={(e) =>
													setNewUser({
														...newUser,
														homePin: e.target.value.replace(/\D/g, "").slice(0, 6),
													})
												}
												placeholder="Contoh: 123456"
												type="password"
												value={newUser.homePin}
											/>
											{newUser.homePin && !isValidHomePin(newUser.homePin) ? (
												<p className="text-[11px] text-destructive">
													PIN harus terdiri dari 6 digit angka.
												</p>
											) : (
												<p className="text-[11px] text-muted-foreground">
													Kosongkan jika PIN belum ingin diatur.
												</p>
											)}
											<div className="space-y-2">
												<label className="font-medium text-muted-foreground text-xs">
													Username Profil (Slug URL)
												</label>
												<div className="relative">
													<span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-xs">/at/</span>
													<input
														className="w-full rounded-xl bg-background py-3 pr-3 pl-10 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 lowercase"
														onChange={(e) =>
															setNewUser({ ...newUser, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
														}
														placeholder="contoh-nama"
														type="text"
														value={newUser.slug}
													/>
												</div>
												<p className="px-1 text-[10px] text-muted-foreground italic">
													Default: bagian depan email.
												</p>
											</div>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-role"
											>
												Pilih Role
											</label>
											<select
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-role"
												onChange={(e) =>
													setNewUser({ ...newUser, roleId: e.target.value })
												}
												value={newUser.roleId}
											>
												<option disabled value="">
													Pilih Role
												</option>
												{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
												{roles?.map((role: any) => (
													<option key={role._id} value={role._id}>
														{role.name}
													</option>
												))}
											</select>
										</div>
										<button
											className="mt-2 w-full rounded-xl bg-primary py-3.5 font-bold text-primary-foreground text-sm transition-all hover:opacity-90 active:scale-95"
											onClick={handleCreateUser}
											type="button"
										>
											Buat Akun Pengguna
										</button>
									</div>
								</div>
								<div className="space-y-4 rounded-2xl border border-border/50 bg-muted/30 p-4 md:space-y-6 md:p-6">
									<div className="flex items-center gap-2 border-border/50 border-b pb-4">
										<Settings2 className="h-4 w-4 text-primary" />
										<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
											Tambah Role Baru
										</h4>
									</div>
									<div className="space-y-5">
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="role-name"
											>
												Nama Role
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="role-name"
												onChange={(e) =>
													setNewRole({ ...newRole, name: e.target.value })
												}
												placeholder="Contoh: Kasir, Admin Stok"
												type="text"
												value={newRole.name}
											/>
										</div>

										<div className="space-y-3">
											<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
												Izin Akses (Permissions)
											</p>
											<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
												{AVAILABLE_PERMISSIONS.map((perm: any) => (
													<label
														className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
															newRole.permissions.includes(perm.id)
																? "border-primary/30 bg-primary/5 text-primary"
																: "border-border/50 bg-background text-muted-foreground hover:border-border"
														}`}
														key={perm.id}
													>
														<input
															checked={newRole.permissions.includes(perm.id)}
															className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
															onChange={(e) => {
																const perms = e.target.checked
																	? [...newRole.permissions, perm.id]
																	: newRole.permissions.filter(
																			(p) => p !== perm.id
																		);
																setNewRole({ ...newRole, permissions: perms });
															}}
															type="checkbox"
														/>
														<span className="font-medium text-xs">
															{perm.label}
														</span>
													</label>
												))}
											</div>
										</div>

										<button
											className="mt-2 w-full rounded-xl bg-primary/10 py-3.5 font-bold text-primary text-sm transition-all hover:bg-primary/20 active:scale-95"
											onClick={handleCreateRole}
											type="button"
										>
											Buat Role Baru
										</button>
									</div>
								</div>

								{/* Lists: Users & Roles */}
								<div className="pt-8 lg:col-span-2">
									<div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
										<div className="space-y-4">
											<h4 className="px-2 font-bold text-base text-foreground">
												Daftar Pengguna
											</h4>
											{editingUser && (
												<div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
													<div className="flex items-center justify-between gap-3">
														<div className="space-y-1">
															<p className="font-bold text-sm text-foreground">Edit Pengguna</p>
															<p className="text-xs text-muted-foreground">
																Perbarui data akun pengguna yang dipilih.
															</p>
														</div>
														<button
															className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
															onClick={() => setEditingUser(null)}
															type="button"
														>
															<X className="h-4 w-4" />
														</button>
													</div>
													<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
														<div className="space-y-1.5">
															<label className="font-medium text-muted-foreground text-xs">
																Nama Lengkap
															</label>
															<input
																className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
																onChange={(e) =>
																	setEditingUser({
																		...editingUser,
																		name: e.target.value,
																	})
																}
																type="text"
																value={editingUser.name}
															/>
														</div>
														<div className="space-y-1.5">
															<label className="font-medium text-muted-foreground text-xs">
																Email / Username Login
															</label>
															<input
																className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
																onChange={(e) =>
																	setEditingUser({
																		...editingUser,
																		username: e.target.value,
																	})
																}
																type="email"
																value={editingUser.username}
															/>
														</div>
														<div className="space-y-1.5">
															<label className="font-medium text-muted-foreground text-xs">
																Username Profil (Slug URL)
															</label>
															<div className="relative">
																<span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-xs">/at/</span>
																<input
																	className="w-full rounded-xl border border-border bg-background py-3 pr-3 pl-10 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 lowercase"
																	onChange={(e) =>
																		setEditingUser({
																			...editingUser,
																			slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
																		})
																	}
																	placeholder="fakhri-barista"
																	type="text"
																	value={editingUser.slug}
																/>
															</div>
														</div>
														<div className="space-y-1.5">
															<label className="font-medium text-muted-foreground text-xs">
																Role
															</label>
															<select
																className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
																onChange={(e) =>
																	setEditingUser({
																		...editingUser,
																		roleId: e.target.value as Id<"roles">,
																	})
																}
																value={editingUser.roleId}
															>
																<option value="">Pilih role</option>
																{roles?.map((role: any) => (
																	<option key={role._id} value={role._id}>
																		{role.name}
																	</option>
																))}
															</select>
														</div>
														<div className="space-y-1.5">
															<label className="font-medium text-muted-foreground text-xs">
																PIN Akses /home (6 digit)
															</label>
															<input
																className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
																inputMode="numeric"
																maxLength={6}
																onChange={(e) =>
																	setEditingUser({
																		...editingUser,
																		homePin: e.target.value.replace(/\D/g, "").slice(0, 6),
																	})
																}
																placeholder="Isi 6 digit untuk ganti PIN"
																type="password"
																value={editingUser.homePin}
															/>
															<p className="text-[11px] text-muted-foreground">
																Kosongkan jika tidak ingin mengubah PIN saat ini.
															</p>
														</div>
														<div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
															<div>
																<p className="font-medium text-sm text-foreground">
																	Status Aktif
																</p>
																<p className="text-xs text-muted-foreground">
																	Pengguna nonaktif tidak bisa login.
																</p>
															</div>
															<button
																className={`relative h-6 w-10 rounded-full transition-all duration-300 ${
																	editingUser.isActive
																		? "bg-primary"
																		: "bg-muted-foreground/20"
																}`}
																onClick={() =>
																	setEditingUser({
																		...editingUser,
																		isActive: !editingUser.isActive,
																	})
																}
																type="button"
															>
																<div
																	className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${
																		editingUser.isActive ? "right-1" : "left-1"
																	}`}
																/>
															</button>
														</div>
														<div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
															<div>
																<p className="font-medium text-sm text-foreground">
																	Terima Laporan Email
																</p>
																<p className="text-xs text-muted-foreground">
																	Jika aktif, user ini akan menerima laporan shift dari Resend.
																</p>
															</div>
															<button
																className={`relative h-6 w-10 rounded-full transition-all duration-300 ${
																	editingUser.receiveReportEmails
																		? "bg-primary"
																		: "bg-muted-foreground/20"
																}`}
																onClick={() =>
																	setEditingUser({
																		...editingUser,
																		receiveReportEmails: !editingUser.receiveReportEmails,
																	})
																}
																type="button"
															>
																<div
																	className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${
																		editingUser.receiveReportEmails ? "right-1" : "left-1"
																	}`}
																/>
															</button>
														</div>

														<div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:col-span-2">
															<div className="flex items-center justify-between">
																<div>
																	<p className="font-bold text-sm text-foreground">Biometrik Wajah</p>
																	<p className="text-xs text-muted-foreground">
																		{(editingUser as any).faceDescriptor 
																			? "Wajah sudah terdaftar." 
																			: "Pendaftaran wajah diperlukan untuk absensi."}
																	</p>
																</div>
																<Button 
																	variant={(editingUser as any).faceDescriptor ? "outline" : "default"}
																	size="sm"
																	onClick={() => setShowFaceEnrollment(true)}
																	type="button"
																>
																	<Camera className="mr-2 h-4 w-4" />
																	{(editingUser as any).faceDescriptor ? "Daftar Ulang" : "Daftarkan Wajah"}
																</Button>
															</div>

															{showFaceEnrollment && (
																<div className="mt-4 rounded-2xl border bg-background p-4 shadow-xl">
																	<div className="mb-4 flex items-center justify-between">
																		<p className="font-bold text-sm">Pendaftaran Wajah</p>
																		<Button variant="ghost" size="sm" onClick={() => setShowFaceEnrollment(false)} type="button">
																			<X className="h-4 w-4" />
																		</Button>
																	</div>
																	<FaceRecognition 
																		mode="enroll"
																		onCapture={async (descriptor) => {
																			setEditingUser({ ...editingUser, faceDescriptor: descriptor } as any);
																			toast.success("Wajah berhasil diproses. Jangan lupa simpan perubahan!");
																			setShowFaceEnrollment(false);
																		}}
																	/>
																</div>
															)}
														</div>
													</div>
													<div className="flex justify-end gap-2">
														<button
															className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-background"
															onClick={() => setEditingUser(null)}
															type="button"
														>
															Batal
														</button>
														<button
															className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm transition-all hover:opacity-90"
															onClick={handleSaveEditUser}
															type="button"
														>
															Simpan Perubahan
														</button>
													</div>
												</div>
											)}
											<div className="space-y-2">
												{!users ? (
													Array.from({ length: 3 }).map((_, i) => (
														<div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 shadow-sm" key={i}>
															<div className="flex items-center gap-3">
																<Skeleton className="h-10 w-10 rounded-full" />
																<div className="space-y-2">
																	<Skeleton className="h-4 w-24" />
																	<Skeleton className="h-3 w-32" />
																</div>
															</div>
															<Skeleton className="h-8 w-8 rounded-lg" />
														</div>
													))
												) : users.map((user: any) => (
													<div
														className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 shadow-sm"
														key={user._id}
													>
														<div className="flex items-center gap-3">
															<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold text-primary text-sm">
																{user.name.charAt(0)}
															</div>
															<div>
																<p className="font-bold text-sm tracking-tight">
																	{user.name}
																</p>
																<p className="text-muted-foreground text-xs">
																	{user.username}
																</p>
																{user.homePin ? (
																	<p className="mt-1 text-[11px] font-medium text-emerald-600">
																		PIN /home aktif
																	</p>
																) : null}
																{user.receiveReportEmails ? (
																	<p className="mt-1 text-[11px] font-medium text-primary">
																		Penerima laporan email
																	</p>
																) : null}
															</div>
														</div>
														<div className="flex items-center gap-1">
															<button
																className="rounded-xl p-2.5 text-primary transition-colors hover:bg-primary/10"
																onClick={() => handleStartEditUser(user)}
																type="button"
															>
																<Pencil className="h-4 w-4" />
															</button>
															<button
																className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
																onClick={() => handleDeleteUser(user._id)}
																type="button"
															>
																<Trash2 className="h-4 w-4" />
															</button>
														</div>
													</div>
												))}
												{!users?.length && (
													<p className="py-8 text-center text-muted-foreground text-sm italic">
														Belum ada user.
													</p>
												)}
											</div>
										</div>
										<div className="space-y-4">
											<h4 className="px-2 font-bold text-base text-foreground">
												Daftar Role
											</h4>
											{editingRole && (
												<div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
													<div className="flex items-center justify-between gap-3">
														<div className="space-y-1">
															<p className="font-bold text-sm text-foreground">Edit Role</p>
															<p className="text-xs text-muted-foreground">
																Perbarui nama role dan hak akses yang dimiliki.
															</p>
														</div>
														<button
															className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
															onClick={() => setEditingRole(null)}
															type="button"
														>
															<X className="h-4 w-4" />
														</button>
													</div>
													<div className="space-y-2">
														<label className="font-medium text-muted-foreground text-xs">
															Nama Role
														</label>
														<input
															className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
															onChange={(e) =>
																setEditingRole({
																	...editingRole,
																	name: e.target.value,
																})
															}
															type="text"
															value={editingRole.name}
														/>
													</div>
													<div className="space-y-3">
														<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
															Izin Akses
														</p>
														<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
															{AVAILABLE_PERMISSIONS.map((perm: any) => (
																<label
																	className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
																		editingRole.permissions.includes(perm.id)
																			? "border-primary/30 bg-primary/5 text-primary"
																			: "border-border/50 bg-background text-muted-foreground hover:border-border"
																	}`}
																	key={perm.id}
																>
																	<input
																		checked={editingRole.permissions.includes(perm.id)}
																		className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
																		onChange={(e) => {
																			const nextPermissions = e.target.checked
																				? [...editingRole.permissions, perm.id]
																				: editingRole.permissions.filter(
																						(id) => id !== perm.id,
																				  );
																			setEditingRole({
																				...editingRole,
																				permissions: nextPermissions,
																			});
																		}}
																		type="checkbox"
																	/>
																	<span className="font-medium text-xs">
																		{perm.label}
																	</span>
																</label>
															))}
														</div>
													</div>
													<div className="flex justify-end gap-2">
														<button
															className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-background"
															onClick={() => setEditingRole(null)}
															type="button"
														>
															Batal
														</button>
														<button
															className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm transition-all hover:opacity-90"
															onClick={handleSaveEditRole}
															type="button"
														>
															Simpan Perubahan
														</button>
													</div>
												</div>
											)}
											<div className="space-y-2">
												{!roles ? (
													Array.from({ length: 3 }).map((_, i) => (
														<div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 shadow-sm" key={i}>
															<div className="space-y-2">
																<Skeleton className="h-4 w-24" />
																<Skeleton className="h-3 w-48" />
															</div>
															<Skeleton className="h-8 w-8 rounded-lg" />
														</div>
													))
												) : roles.map((role: any) => (
													<div
														className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 shadow-sm"
														key={role._id}
													>
														<div>
															<p className="font-bold text-sm tracking-tight">
																{role.name}
															</p>
															<p className="text-[10px] text-muted-foreground">
																{role.permissions.length} Hak Akses
															</p>
														</div>
														<div className="flex items-center gap-1">
															<button
																className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10"
																onClick={() => handleStartEditRole(role)}
																type="button"
															>
																<Pencil className="h-4 w-4" />
															</button>
															<button
																className="rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10"
																onClick={() => handleDeleteRole(role._id)}
																type="button"
															>
																<Trash2 className="h-4 w-4" />
															</button>
														</div>
													</div>
												))}
											</div>
											{!roles?.length && (
													<p className="w-full py-8 text-center text-muted-foreground text-sm italic">
														Belum ada role.
													</p>
												)}
										</div>
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
							<section className="hidden space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Settings2 className="h-6 w-6" />
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
											className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 font-medium text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:bg-muted/50"
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
											className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 font-medium text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:bg-muted/50"
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
											className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 font-medium text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:bg-muted/50"
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

							<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Printer className="h-6 w-6" />
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
									<div className="flex items-center justify-between rounded-xl bg-muted/40 p-5 shadow-inner">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Cetak Struk Lunas Otomatis
											</span>
											<span className="text-muted-foreground text-xs">
												Struk reguler langsung tercetak setelah pembayaran
											</span>
										</div>
										<button
											className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.autoPrint ? "bg-primary" : "bg-muted-foreground/20"}`}
											onClick={() =>
												setSettings({
													...settings,
													autoPrint: !settings.autoPrint,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoPrint ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="flex items-center justify-between rounded-xl bg-muted/40 p-5 shadow-inner">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Cetak Tiket Kitchen Otomatis
											</span>
											<span className="text-muted-foreground text-xs">
												Setelah checkout, cetak tiket produksi tanpa harga
											</span>
										</div>
										<button
											className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.autoPrintKitchenReceipt ? "bg-primary" : "bg-muted-foreground/20"}`}
											onClick={() =>
												setSettings({
													...settings,
													autoPrintKitchenReceipt: !settings.autoPrintKitchenReceipt,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoPrintKitchenReceipt ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="flex items-center justify-between rounded-xl bg-muted/40 p-5 shadow-inner">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Izinkan Print Open Bill
											</span>
											<span className="text-muted-foreground text-xs">
												Tampilkan tombol print di step menu dan Simpan Orderan
											</span>
										</div>
										<button
											className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.allowOpenBillPrint ? "bg-primary" : "bg-muted-foreground/20"}`}
											onClick={() =>
												setSettings({
													...settings,
													allowOpenBillPrint: !settings.allowOpenBillPrint,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.allowOpenBillPrint ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="space-y-3">
										<button
											className={`w-full rounded-xl border-2 py-4 font-bold text-sm transition-all active:scale-95 ${
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
							<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Layout className="h-6 w-6" />
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
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowLogo: !settings.receiptShowLogo })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Logo Toko</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowLogo ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowLogo ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Address */}
											<div 
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowAddress: !settings.receiptShowAddress })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Alamat Toko</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowAddress ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowAddress ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Phone */}
											<div 
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowPhone: !settings.receiptShowPhone })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Nomor Telepon</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowPhone ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowPhone ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Order Number */}
											<div 
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowOrderNumber: !settings.receiptShowOrderNumber })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Nomor Antrian</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowOrderNumber ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowOrderNumber ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Customer Name */}
											<div 
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowCustomerName: !settings.receiptShowCustomerName })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Nama Pelanggan</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowCustomerName ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowCustomerName ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Cashier & Shift Info */}
											<div 
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowCashierName: !settings.receiptShowCashierName })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Info Kasir & Shift</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowCashierName ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowCashierName ? "right-1" : "left-1"}`} />
												</button>
											</div>

											{/* Show Notes */}
											<div 
												className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4 shadow-sm cursor-pointer active:bg-muted/30 transition-colors"
												onClick={() => setSettings({ ...settings, receiptShowNotes: !settings.receiptShowNotes })}
											>
												<span className="font-bold text-foreground text-sm uppercase tracking-tight">Catatan Pesanan</span>
												<button
													className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.receiptShowNotes ? "bg-primary" : "bg-muted-foreground/20"}`}
													type="button"
												>
													<div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.receiptShowNotes ? "right-1" : "left-1"}`} />
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
												<div className="relative h-32 w-32 overflow-hidden rounded-xl border-4 border-muted bg-white shadow-inner flex items-center justify-center p-2">
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
													className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
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
															const postUrl = await generateUploadUrl();
															const result = await fetch(postUrl, {
																method: "POST",
																headers: { "Content-Type": contentType },
																body: uploadBlob,
															});
															if (!result.ok) throw new Error("Upload failed");
															const { storageId } = await result.json();
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

							<section className="space-y-5 rounded-2xl border border-destructive/10 bg-destructive/5 p-4 shadow-sm md:space-y-8 md:p-8">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
										<Bell className="h-6 w-6" />
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
										className="w-full rounded-xl bg-destructive py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95"
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
