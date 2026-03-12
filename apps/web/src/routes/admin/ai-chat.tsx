import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowRight,
	Bell,
	Bot,
	Zap,
	Calendar,
	Camera,
	Check,
	CheckCircle2,
	Copy,
	FileText,
	Lightbulb,
	Loader2,
	PlusCircle,
	Receipt,
	ScanLine,
	Send,
	Settings,
	Shield,
	Sparkles,
	Target,
	History,
	Trash2,
	TrendingDown,
	TrendingUp,
	Wallet,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageScanner } from "@/components/ai/image-scanner";
import { ScanEditModal, type ScanEditParams } from "@/components/scan/scan-edit-modal";
import { ScanSplitModal } from "@/components/scan/scan-split-modal";
import { ScanHistoryPanel, useScanHistory } from "@/components/scan/scan-history-panel";

export const Route = createFileRoute("/admin/ai-chat")({
	component: AIChatPage,
});

interface ScanResultData {
	type: string;
	name: string; // Merchant Name
	category: string;
	merchant?: string; // Optional alias for name
	transactionType: "expense" | "income" | "unknown";
	total: number;
	subtotal?: number;
	tax?: number;
	discount?: number;
	items: Array<{ name: string; qty: number; price: number; subtotal: number }>;
	date?: string | null;
	paymentMethod: string;
	notes?: string;
	confidence: number;
	rawText?: string;
}

interface QuickActionButton {
	id: string;
	label: string;
	icon: string;
	variant: "navigate" | "finance" | "order" | "product" | "stock" | "discount" | "misc";
	actionType: "navigate" | "sendPrompt";
	href?: string;
	prompt?: string;
}

interface ScanActionButton {
	id: string;
	label: string;
	icon: string;
	variant: "expense" | "income" | "stock" | "order";
	params: {
		type: "income" | "expense";
		amount: number;
		category: string;
		merchant?: string;
		description?: string;
		date: number;
		paymentMethod?: string;
		status: "completed";
	};
	done?: boolean;
}

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	image?: string;
	scanData?: ScanResultData;
	suggestions?: Array<{ label: string; prompt: string }>;
	actionButtons?: ScanActionButton[];
	quickActions?: QuickActionButton[];
	/** Stable ID for AnimatePresence keys — generated at creation time */
	_msgId?: string;
}

interface ToolCall {
	name: string;
	args: Record<string, unknown>;
	status: "pending" | "executing" | "success" | "error";
	result?: string;
	error?: string;
}

interface Suggestion {
	id: string;
	type: string;
	title: string;
	description: string;
	priority: "high" | "medium" | "low";
	action?: any;
	createdAt: number;
}

type TabType = "chat" | "suggestions" | "predictions" | "tasks";

interface ChatSession {
	sessionId: string;
	title: string;
	createdAt: number;
	messageCount: number;
}

// Templates with icons
const TEMPLATES: Array<{
	label: string;
	message: string;
	icon: React.ReactNode;
}> = [
	{
		label: "Rekap Hari Ini",
		message: "Berikan rekap lengkap bisnis hari ini",
		icon: <TrendingUp className="h-3.5 w-3.5" />,
	},
	{
		label: "Stok Rendah",
		message: "Produk apa saja yang stoknya rendah?",
		icon: <AlertTriangle className="h-3.5 w-3.5" />,
	},
	{
		label: "Top Produk",
		message: "Apa produk terlaris saat ini?",
		icon: <Sparkles className="h-3.5 w-3.5" />,
	},
	{
		label: "Keuangan",
		message: "Ringkas kondisi keuangan saat ini",
		icon: <Settings className="h-3.5 w-3.5" />,
	},
	{
		label: "Tertunda",
		message: "Ada berapa pesanan yang masih tertunda?",
		icon: <AlertTriangle className="h-3.5 w-3.5" />,
	},
	{
		label: "Saran",
		message: "Berikan saran bisnis berdasarkan data saat ini",
		icon: <Lightbulb className="h-3.5 w-3.5" />,
	},
	{
		label: "Prediksi Stok",
		message: "Analisis prediksi stok yang akan habis dalam 7 hari ke depan dan rekomendasikan tindakan",
		icon: <TrendingUp className="h-3.5 w-3.5" />,
	},
	{
		label: "Analisis Diskon",
		message: "Analisis efektivitas semua diskon yang aktif dan rekomendasikan strategi promo yang lebih baik",
		icon: <Sparkles className="h-3.5 w-3.5" />,
	},
	{
		label: "Rekonsiliasi",
		message: "Lakukan rekonsiliasi keuangan: bandingkan total pesanan selesai dengan pencatatan pemasukan, dan identifikasi selisih jika ada",
		icon: <Shield className="h-3.5 w-3.5" />,
	},
	{
		label: "Laba Rugi",
		message: "Buatkan laporan laba rugi bulan ini: total pendapatan, total HPP, beban operasional per kategori, laba kotor, dan laba bersih",
		icon: <TrendingUp className="h-3.5 w-3.5" />,
	},
	{
		label: "Arus Kas",
		message: "Analisis arus kas bulan ini: total pemasukan vs pengeluaran per hari dan per metode pembayaran",
		icon: <Wallet className="h-3.5 w-3.5" />,
	},
	{
		label: "Hitung HPP",
		message: "Tampilkan ringkasan kalkulasi HPP semua produk, mana yang margin-nya rendah dan perlu dioptimalkan?",
		icon: <Target className="h-3.5 w-3.5" />,
	},
];

const TOOL_LABELS: Record<string, string> = {
	createProduct: "Buat Produk",
	updateProduct: "Update Produk",
	deleteProduct: "Hapus Produk",
	createCategory: "Buat Kategori",
	deleteCategory: "Hapus Kategori",
	createInventoryItem: "Buat Item Inventaris",
	addStock: "Tambah Stok",
	usageStock: "Kurangi Stok",
	adjustStock: "Atur Stok",
	deleteInventoryItem: "Hapus Item Inventaris",
	createOrder: "Buat Pesanan",
	updateOrderStatus: "Update Status Pesanan",
	createTransaction: "Catat Transaksi",
	deleteTransaction: "Hapus Transaksi",
	createDiscount: "Buat Diskon",
	updateDiscount: "Update Diskon",
	toggleDiscount: "Aktif/Nonaktifkan Diskon",
	deleteDiscount: "Hapus Diskon",
	createHppCalculation: "Buat Kalkulasi HPP",
	updateHppCalculation: "Update Kalkulasi HPP",
	deleteHppCalculation: "Hapus Kalkulasi HPP",
	syncHppWithInventoryPrices: "Sinkronkan Harga HPP",
	updateStoreSettings: "Update Pengaturan Toko",
	analyzeDiscountEffectiveness: "Analisis Efektivitas Diskon",
	createReconciliationTransaction: "Rekonsiliasi Keuangan",
};

// Keyword-driven contextual quick action button generator
/** Generate a lightweight stable ID for ChatMessage keys */
const mkMsgId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// Priority-weighted keyword matching: each matched keyword adds to the rule's score.
// Rules with higher scores are ranked first → prevents cross-context collisions.
function generateQuickActions(userMsg: string, aiResponse: string): QuickActionButton[] {
	// Weight the user's message more (2×) than the AI response so intent is primary
	const userText = userMsg.toLowerCase();
	const aiText = aiResponse.toLowerCase();
	let id = 0;

	type Rule = {
		keys: Array<{ word: string; weight: number }>;
		buttons: Omit<QuickActionButton, "id">[];
	};

	const rules: Rule[] = [
		{
			// Finance context: unique domain terms get extra weight to beat generic "harga"
			keys: [
				{ word: "keuangan", weight: 3 },
				{ word: "pendapatan", weight: 3 },
				{ word: "pengeluaran", weight: 3 },
				{ word: "pemasukan", weight: 3 },
				{ word: "saldo", weight: 2 },
				{ word: "laporan keuangan", weight: 4 },
				{ word: "catat transaksi", weight: 4 },
				{ word: "rekonsiliasi", weight: 4 },
				{ word: "laba", weight: 2 },
				{ word: "omset", weight: 3 },
				{ word: "untung", weight: 2 },
				{ word: "rugi", weight: 2 },
				{ word: "laba rugi", weight: 5 },
				{ word: "arus kas", weight: 5 },
				{ word: "laporan", weight: 2 },
				{ word: "export", weight: 2 },
				{ word: "pdf", weight: 2 },
				{ word: "excel", weight: 2 },
			],
			buttons: [
				{ label: "Laporan Keuangan", icon: "📊", variant: "finance", actionType: "navigate", href: "/admin/finance/reports" },
				{ label: "Lihat Keuangan", icon: "💰", variant: "finance", actionType: "navigate", href: "/admin/finance" },
				{ label: "Catat Transaksi", icon: "📝", variant: "finance", actionType: "sendPrompt", prompt: "Bantu saya mencatat transaksi keuangan baru" },
			],
		},
		{
			keys: [
				{ word: "produk", weight: 2 },
				{ word: "menu", weight: 2 },
				{ word: "makanan", weight: 2 },
				{ word: "minuman", weight: 2 },
				{ word: "item", weight: 1 },
				{ word: "katalog", weight: 3 },
				{ word: "tambah produk", weight: 4 },
				{ word: "hapus produk", weight: 4 },
				{ word: "edit produk", weight: 4 },
				{ word: "harga jual", weight: 2 },
				{ word: "kategori produk", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Produk", icon: "🛍️", variant: "product", actionType: "navigate", href: "/admin/products" },
				{ label: "Tambah Produk", icon: "➕", variant: "product", actionType: "sendPrompt", prompt: "Bantu saya menambahkan produk baru ke katalog" },
			],
		},
		{
			keys: [
				{ word: "pesanan", weight: 3 },
				{ word: "order", weight: 2 },
				{ word: "pelanggan", weight: 2 },
				{ word: "buat pesanan", weight: 4 },
				{ word: "transaksi penjualan", weight: 3 },
				{ word: "checkout", weight: 3 },
				{ word: "pembeli", weight: 2 },
				{ word: "penjualan", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Pesanan", icon: "📋", variant: "order", actionType: "navigate", href: "/admin/orders" },
				{ label: "Buat Pesanan", icon: "🛒", variant: "order", actionType: "sendPrompt", prompt: "Bantu saya membuat pesanan baru untuk pelanggan" },
			],
		},
		{
			keys: [
				{ word: "stok", weight: 3 },
				{ word: "inventaris", weight: 3 },
				{ word: "bahan baku", weight: 3 },
				{ word: "bahan", weight: 1 },
				{ word: "persediaan", weight: 3 },
				{ word: "restock", weight: 4 },
				{ word: "stok habis", weight: 4 },
				{ word: "stok rendah", weight: 4 },
				{ word: "kehabisan", weight: 3 },
				{ word: "supplier", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Inventaris", icon: "📦", variant: "stock", actionType: "navigate", href: "/admin/inventory" },
				{ label: "Tambah Stok", icon: "⬆️", variant: "stock", actionType: "sendPrompt", prompt: "Bantu saya menambahkan stok inventaris bahan baku" },
			],
		},
		{
			keys: [
				{ word: "diskon", weight: 3 },
				{ word: "promo", weight: 3 },
				{ word: "voucher", weight: 3 },
				{ word: "potongan harga", weight: 4 },
				{ word: "kupon", weight: 3 },
				{ word: "cashback", weight: 3 },
				{ word: "promosi", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Diskon", icon: "🏷️", variant: "discount", actionType: "navigate", href: "/admin/discounts" },
				{ label: "Buat Diskon", icon: "✨", variant: "discount", actionType: "sendPrompt", prompt: "Bantu saya membuat diskon atau promo baru" },
			],
		},
		{
			keys: [
				{ word: "hpp", weight: 4 },
				{ word: "harga pokok", weight: 4 },
				{ word: "biaya produksi", weight: 4 },
				{ word: "modal", weight: 2 },
				{ word: "margin", weight: 3 },
				{ word: "break even", weight: 4 },
			],
			buttons: [
				{ label: "HPP Kalkulator", icon: "🧮", variant: "misc", actionType: "navigate", href: "/admin/hpp-calculator" },
			],
		},
		{
			keys: [
				{ word: "prediksi", weight: 4 },
				{ word: "forecast", weight: 4 },
				{ word: "perkiraan", weight: 3 },
				{ word: "tren penjualan", weight: 4 },
				{ word: "proyeksi", weight: 4 },
				{ word: "ramalan", weight: 3 },
			],
			buttons: [
				{ label: "Lihat Forecast", icon: "📈", variant: "misc", actionType: "navigate", href: "/admin/forecasting" },
			],
		},
		{
			keys: [
				{ word: "booking", weight: 4 },
				{ word: "reservasi", weight: 4 },
				{ word: "jadwal", weight: 2 },
				{ word: "meja", weight: 2 },
				{ word: "tempat duduk", weight: 3 },
				{ word: "kapasitas", weight: 2 },
			],
			buttons: [
				{ label: "Lihat Booking", icon: "📅", variant: "misc", actionType: "navigate", href: "/admin/booking" },
			],
		},
		{
			keys: [
				{ word: "pengaturan", weight: 3 },
				{ word: "setting", weight: 3 },
				{ word: "profil toko", weight: 4 },
				{ word: "nama toko", weight: 4 },
				{ word: "jam buka", weight: 4 },
				{ word: "alamat", weight: 2 },
				{ word: "konfigurasi", weight: 3 },
			],
			buttons: [
				{ label: "Pengaturan Toko", icon: "⚙️", variant: "misc", actionType: "navigate", href: "/admin/settings" },
			],
		},
	];

	// Score each rule: user text keywords weighted 2×, AI text weighted 1×
	const scored = rules.map((rule) => {
		let score = 0;
		for (const { word, weight } of rule.keys) {
			if (userText.includes(word)) score += weight * 2;
			else if (aiText.includes(word)) score += weight;
		}
		return { rule, score };
	});

	// Sort by score descending, only include rules with at least 1 match
	const sorted = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

	const seen = new Set<string>();
	const result: QuickActionButton[] = [];

	for (const { rule } of sorted) {
		for (const btn of rule.buttons) {
			const key = btn.href ?? btn.prompt ?? btn.label;
			if (!seen.has(key)) {
				seen.add(key);
				result.push({ ...btn, id: `qa-${id++}` });
			}
		}
		if (result.length >= 4) break;
	}

	// Fallback: smart defaults if nothing matched
	if (result.length === 0) {
		return [
			{ id: `qa-${id++}`, label: "Rekap Hari Ini", icon: "📊", variant: "misc", actionType: "sendPrompt", prompt: "Berikan rekap lengkap bisnis hari ini" },
			{ id: `qa-${id++}`, label: "Stok Rendah", icon: "⚠️", variant: "stock", actionType: "sendPrompt", prompt: "Tampilkan produk yang stoknya rendah atau habis" },
			{ id: `qa-${id++}`, label: "Laporan Keuangan", icon: "📊", variant: "finance", actionType: "navigate", href: "/admin/finance/reports" },
			{ id: `qa-${id++}`, label: "Lihat Keuangan", icon: "💰", variant: "finance", actionType: "navigate", href: "/admin/finance" },
		];
	}

	return result.slice(0, 4);
}

function AIChatPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			role: "assistant",
			_msgId: mkMsgId(),
			content:
				"Halo! Saya Yumi, asisten AI kamu untuk YUMI POS. Saya bisa membantu merekap data, menganalisis bisnis, MELAKUKAN AKSI seperti tambah produk, update stok, buat pesanan, dan bahkan MULTI-STEP ACTIONS dalam satu permintaan. Sekarang saya dilengkapi dengan Forecasting, Analisis HPP, Efektivitas Diskon, dan Rekonsiliasi Keuangan!",
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const streamingActiveRef = useRef(false);
	const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** Incremented each time sendMessage fires; stale responses are discarded */
	const requestIdRef = useRef(0);
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
	const [isImageScannerOpen, setIsImageScannerOpen] = useState(false);
	const [selectedImages, setSelectedImages] = useState<string[]>([]);
	const [activeTab, setActiveTab] = useState<TabType>("chat");
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [showSessionHistory, setShowSessionHistory] = useState(false);

	const [showScanPanel, setShowScanPanel] = useState(false);
	const [scanImages, setScanImages] = useState<string[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

	// Edit / Split / History modals
	const [editModal, setEditModal] = useState<{ params: ScanEditParams; btnKey: string; messageIdx: number } | null>(null);
	const [splitModal, setSplitModal] = useState<{ params: ScanEditParams; btnKey: string } | null>(null);
	const [showScanHistory, setShowScanHistory] = useState(false);
	const { history: scanHistory, addEntry: addScanHistory, markSaved: markScanSaved, removeEntry: removeScanHistory, clearAll: clearScanHistory } = useScanHistory();

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const scanFileInputRef = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();
	const yumiChat = useAction(api.ai.yumiChat);
	const scanImageDataAction = useAction(api.ai.scanImageData);
	const bulkScanImageDataAction = useAction(api.ai.bulkScanImageData);
	const createTransactionMutation = useMutation(api.finance.createTransaction);
	const [actionButtonDone, setActionButtonDone] = useState<Set<string>>(new Set());
	const [actionButtonLoading, setActionButtonLoading] = useState<Set<string>>(new Set());

	const handleCopy = useCallback(async (text: string, index: number) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedIndex(index);
			setTimeout(() => setCopiedIndex(null), 2000);
		} catch {
			toast.error("Gagal menyalin pesan");
		}
	}, []);

	// Open edit modal instead of saving directly
	const handleScanActionButton = useCallback((btn: ScanActionButton, messageIdx: number) => {
		const key = `${messageIdx}-${btn.id}`;
		if (actionButtonDone.has(key)) return;
		setEditModal({ params: btn.params, btnKey: key, messageIdx });
	}, [actionButtonDone]);

	// Called from ScanEditModal — save a single (possibly edited) transaction
	const handleSaveFromEditModal = useCallback(async (params: ScanEditParams) => {
		if (!editModal) return;
		const { btnKey } = editModal;
		setActionButtonLoading(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
		try {
			await createTransactionMutation(params);
			toast.success("Transaksi berhasil disimpan!");
			setActionButtonDone(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
			markScanSaved(btnKey);
			setEditModal(null);
		} catch (error) {
			toast.error(`Gagal: ${error instanceof Error ? error.message : "Terjadi kesalahan"}`);
		} finally {
			setActionButtonLoading(prev => {
				const s = new Set<string>(prev);
				s.delete(btnKey);
				return s;
			});
		}
	}, [editModal, createTransactionMutation, markScanSaved]);

	// Called from ScanSplitModal — save multiple split transactions
	const handleSaveFromSplitModal = useCallback(async (splits: ScanEditParams[]) => {
		if (!splitModal) return;
		const { btnKey } = splitModal;
		try {
			await Promise.all(splits.map((p) => createTransactionMutation(p)));
			toast.success(`${splits.length} transaksi berhasil disimpan!`);
			setActionButtonDone(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
			markScanSaved(btnKey);
			setSplitModal(null);
			setEditModal(null);
		} catch (error) {
			toast.error(`Gagal: ${error instanceof Error ? error.message : "Terjadi kesalahan"}`);
		}
	}, [splitModal, createTransactionMutation, markScanSaved]);

	const handleQuickAction = useCallback((action: QuickActionButton) => {
		try {
			if (action.actionType === "navigate") {
				if (!action.href) return;
				navigate({ to: action.href as Parameters<typeof navigate>[0]["to"] });
			} else if (action.actionType === "sendPrompt") {
				if (!action.prompt) return;
				sendMessageRef.current(action.prompt);
			}
		} catch {
			toast.error("Gagal menjalankan aksi. Silakan coba lagi.");
		}
	}, [navigate]);

	// Fetch data for AI
	const products = useQuery(api.products.getAllProductsAdmin, {});
	const inventory = useQuery(api.inventory.getInventory, {});
	const orders = useQuery(api.orders.getOrders, {});

	// Chat Sessions
	const chatSessions = useQuery(api.aiMemory.getChatSessions, {});
	const createSessionMutation = useMutation(api.aiMemory.createChatSession);
	const deleteSessionMutation = useMutation(api.aiMemory.deleteChatSession);
	const saveConversationMutation = useMutation(api.aiMemory.saveConversationContext);
	const loadConversationQuery = useQuery(
		api.aiMemory.getConversationContext,
		currentSessionId ? { sessionId: currentSessionId } : "skip"
	);

	// AI Proactive Suggestions
	const proactiveSuggestions = useQuery(api.ai.getProactiveSuggestions, {});

	// Predictive Analytics
	const stockPredictions = useQuery(api.ai.predictStockOut, { daysAhead: 7 });
	const busyHoursPrediction = useQuery(api.ai.predictBusyHours, {});
	const revenuePrediction = useQuery(api.ai.predictDailyRevenue, { daysAhead: 7 });
	const trendingProducts = useQuery(api.ai.predictTrendingProducts, { daysAhead: 7 });
	const bestPromoTime = useQuery(api.ai.predictBestPromoTime, {});

	// Follow-up Tasks
	const pendingTasks = useQuery(api.aiMemory.getPendingTasks, {});
	const completeTaskMutation = useMutation(api.aiMemory.completeTask);
	const dismissTaskMutation = useMutation(api.aiMemory.dismissTask);
	const autoGenerateTasksMutation = useMutation(api.ai.autoGenerateTasks);

	// Financial Summary for reports
	const _financialSummary = useQuery(api.finance.getFinancialSummary, {});

	// Generate smart insights
	const smartInsights: Array<{
		icon: React.ReactNode;
		text: string;
		type: "success" | "warning" | "info";
	}> = [];

	const lowStockItems =
		inventory?.filter((i: { quantity: number; lowStockThreshold: number }) => i.quantity <= i.lowStockThreshold) ?? [];
	if (lowStockItems.length > 0) {
		smartInsights.push({
			icon: <AlertTriangle className="h-3.5 w-3.5 text-accent" />,
			text: `${lowStockItems.length} stok rendah`,
			type: "warning",
		});
	}

	const pendingOrders = orders?.filter((o: { status: string }) => o.status === "pending") ?? [];
	if (pendingOrders.length > 0) {
		smartInsights.push({
			icon: <Bell className="h-3.5 w-3.5 text-primary" />,
			text: `${pendingOrders.length} perlu diproses`,
			type: "info",
		});
	}

	const availableProducts = products?.filter((p: { isAvailable: boolean }) => p.isAvailable).length ?? 0;
	if (availableProducts > 0) {
		smartInsights.push({
			icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
			text: `${availableProducts} produk aktif`,
			type: "success",
		});
	}

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// Auto-scroll while streaming — throttled to 120ms to reduce scroll jank
	useEffect(() => {
		if (!isStreaming) return;
		if (scrollThrottleRef.current) return;
		scrollThrottleRef.current = setTimeout(() => {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
			scrollThrottleRef.current = null;
		}, 120);
	}, [streamingContent, isStreaming]);

	// Sanitize AI response - remove markdown formatting and suggestion tags
	const sanitizeResponse = (text: string): string => {
		if (!text) return "";
		return text
			// Remove suggestions [SUGGEST: Label | Prompt] - will be parsed separately
			.replace(/\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
			// Remove bold markdown
			.replace(/\*\*(.*?)\*\*/g, "$1")
			// Remove italic markdown
			.replace(/\*(.*?)\*/g, "$1")
			// Remove heading markdown
			.replace(/^#+\s+/gm, "")
			// Remove bullet points - strip markers
			.replace(/^\*\s+/gm, "- ")
			.replace(/^\-\s+/gm, "- ")
			// Remove code blocks
			.replace(/```[\s\S]*?```/g, "")
			// Remove inline code
			.replace(/`(.*?)`/g, "$1")
			// Remove numbered list markdown
			.replace(/^\d+\.\s+/gm, "")
			// Clean up extra whitespace
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	};

	// Extract suggestions from raw AI response
	const extractSuggestions = (text: string): Array<{ label: string; prompt: string }> => {
		const suggestions: Array<{ label: string; prompt: string }> = [];
		const regex = /\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g;
		let match;
		while ((match = regex.exec(text)) !== null) {
			suggestions.push({
				label: match[1].trim(),
				prompt: match[2].trim(),
			});
		}
		return suggestions;
	};

	// Generate direct action buttons based on scan result context
	const generateScanActionButtons = (scanData: ScanResultData): ScanActionButton[] => {
		const categoryMap: Record<string, string> = {
			makanan_minuman: "Makanan & Minuman",
			belanja_stok: "Pembelian Stok",
			peralatan_kantor: "Peralatan Kantor",
			transportasi: "Transportasi",
			utilitas_listrik_air: "Utilitas",
			gaji_karyawan: "Gaji Karyawan",
			sewa_tempat: "Sewa Tempat",
			pemasaran: "Pemasaran",
			pajak: "Pajak",
			hiburan: "Hiburan",
			kesehatan: "Kesehatan",
			pembangunan_renovasi: "Renovasi",
			lainnya: "Lainnya",
		};
		const paymentMap: Record<string, string> = {
			cash: "cash", qris: "qris", card: "card", transfer: "transfer", unknown: "cash",
		};
		const category = categoryMap[scanData.category] ?? scanData.category.replace(/_/g, " ");
		const paymentMethod = paymentMap[scanData.paymentMethod] ?? "cash";
		const rawDate = scanData.date ? new Date(scanData.date).getTime() : NaN;
		const dateTs = Number.isNaN(rawDate) ? Date.now() : rawDate;
		const baseParams = {
			amount: scanData.total,
			category,
			merchant: scanData.name || undefined,
			description: scanData.notes ? scanData.notes.slice(0, 200) : undefined,
			date: dateTs,
			paymentMethod,
			status: "completed" as const,
		};
		const buttons: ScanActionButton[] = [];
		const ts = Date.now();
		if (scanData.transactionType === "expense" || scanData.transactionType === "unknown") {
			buttons.push({
				id: `expense-${ts}`,
				label: "Catat Pengeluaran",
				icon: "💸",
				variant: "expense",
				params: { type: "expense", ...baseParams },
			});
		}
		if (scanData.transactionType === "income" || scanData.transactionType === "unknown") {
			buttons.push({
				id: `income-${ts + 1}`,
				label: "Catat Pemasukan",
				icon: "💰",
				variant: "income",
				params: { type: "income", ...baseParams },
			});
		}
		// If scan contains stock/inventory items
		if (
			scanData.type === "product" ||
			["belanja_stok", "peralatan_kantor"].includes(scanData.category)
		) {
			buttons.push({
				id: `stock-${ts + 2}`,
				label: "Catat ke Stok",
				icon: "📦",
				variant: "stock",
				params: { type: "expense", ...baseParams, category: "Pembelian Stok" },
			});
		}
		return buttons;
	};


	// Stream text word by word for realistic streaming effect
	const streamText = useCallback(
		(text: string, onComplete: () => void) => {
			const tokens = text.split(/(\s+)/);
			let i = 0;
			streamingActiveRef.current = true;
			setIsStreaming(true);
			setStreamingContent("");

			const next = () => {
				if (!streamingActiveRef.current) return;
				if (i < tokens.length) {
					const chunk = tokens[i];
					setStreamingContent((prev) => prev + chunk);
					i++;
					// 20ms for words, 3ms for whitespace → ~50 chars/sec
					const delay = chunk.trim().length > 0 ? 20 : 3;
					setTimeout(next, delay);
				} else {
					streamingActiveRef.current = false;
					setIsStreaming(false);
					setStreamingContent("");
					onComplete();
				}
			};
			next();
		},
		[]
	);

	// Helper: compress image for AI scan - optimized for OCR readability
	const compressImage = useCallback(
		(dataUrl: string): Promise<string> => {
			return new Promise((resolve) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement("canvas");
					const ctx = canvas.getContext("2d");
					if (!ctx) {
						resolve(dataUrl);
						return;
					}
					// Max 1024px for better OCR readability while keeping size manageable
					const maxDimension = 1024;
					let { width, height } = img;
					if (width > maxDimension || height > maxDimension) {
						if (width > height) {
							height = Math.round((height * maxDimension) / width);
							width = maxDimension;
						} else {
							width = Math.round((width * maxDimension) / height);
							height = maxDimension;
						}
					}
					canvas.width = width;
					canvas.height = height;
					ctx.drawImage(img, 0, 0, width, height);
					// Use quality 0.8 for better OCR, then check size
					let quality = 0.8;
					let result = canvas.toDataURL("image/jpeg", quality);
					// If still too large (>500KB base64), reduce quality
					while (result.length > 500_000 && quality > 0.3) {
						quality -= 0.1;
						result = canvas.toDataURL("image/jpeg", quality);
					}
					resolve(result);
				};
				img.onerror = () => resolve(dataUrl);
				img.src = dataUrl;
			});
		},
		[]
	);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files || []);
			if (files.length === 0) return;

			const validFiles = files.filter(file => {
				if (!file.type.startsWith("image/")) {
					toast.error(`${file.name} bukan file gambar`);
					return false;
				}
				if (file.size > 5 * 1024 * 1024) {
					toast.error(`${file.name} terlalu besar (maks 5MB)`);
					return false;
				}
				return true;
			});

			validFiles.forEach(file => {
				const reader = new FileReader();
				reader.onload = async (event) => {
					const raw = event.target?.result as string;
					try {
						const compressed = await compressImage(raw);
						setSelectedImages(prev => [...prev, compressed]);
					} catch {
						setSelectedImages(prev => [...prev, raw]);
					}
				};
				reader.readAsDataURL(file);
			});
			// Clear the input value to allow selecting the same file(s) again
			e.target.value = '';
		},
		[compressImage]
	);

	// Scan panel: file select handler
	const handleScanFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files || []);
			if (files.length === 0) return;

			const validFiles = files.filter(file => {
				if (!file.type.startsWith("image/")) {
					toast.error(`${file.name} bukan file gambar`);
					return false;
				}
				if (file.size > 5 * 1024 * 1024) {
					toast.error(`${file.name} terlalu besar (maks 5MB)`);
					return false;
				}
				return true;
			});

			validFiles.forEach(file => {
				const reader = new FileReader();
				reader.onload = async (event) => {
					const raw = event.target?.result as string;
					try {
						const compressed = await compressImage(raw);
						setScanImages(prev => [...prev, compressed]);
					} catch {
						setScanImages(prev => [...prev, raw]);
					}
				};
				reader.readAsDataURL(file);
			});
			// Clear the input value to allow selecting the same file(s) again
			e.target.value = '';
		},
		[compressImage]
	);

	// Execute AI image scan and add result to chat
	const handleRunScan = useCallback(async () => {
		if (scanImages.length === 0 || isScanning) return;
		setIsScanning(true);
		try {
			const bulkResults = await bulkScanImageDataAction({ images: scanImages });
			
			const newMessages: ChatMessage[] = [];
			
			for (let i = 0; i < bulkResults.length; i++) {
				const res = bulkResults[i];
				const currentImg = scanImages[i];
				
				if (!res.success) {
					newMessages.push({
						role: "user",
						content: bulkResults.length > 1 ? `Scan gambar ke-${i+1}` : "Scan gambar ini",
						image: currentImg,
					});
					newMessages.push({
						role: "assistant",
						content: `Gagal menganalisis gambar ke-${i+1}: ${res.error || "Terjadi kesalahan."}`,
					});
					continue;
				}

				const result = res.data;
				const userMsg: ChatMessage = {
					role: "user",
					content: bulkResults.length > 1 ? `Hasil scan gambar ke-${i+1}:` : "Scan gambar ini dan analisis datanya.",
					image: currentImg,
				};

				const items = result.items as Array<{ name: string; qty: number; price: number; subtotal: number }> | undefined;
				let summaryText = "";
				if (result.name) summaryText += `🏪 Merchant: ${result.name}\n`;
				if (items && items.length > 0) {
					summaryText += `\n📋 Detail Item (${items.length} item):\n`;
					items.forEach((item: { name: string; qty: number; price: number; subtotal: number }, i: number) => {
						summaryText += `${i + 1}. ${item.name} x${item.qty} = Rp ${item.subtotal.toLocaleString("id-ID")}\n`;
					});
				}
				if (result.subtotal) summaryText += `\nSubtotal: Rp ${Number(result.subtotal).toLocaleString("id-ID")}`;
				if (result.tax) summaryText += `\nPajak: Rp ${Number(result.tax).toLocaleString("id-ID")}`;
				if (result.discount) summaryText += `\nDiskon: -Rp ${Number(result.discount).toLocaleString("id-ID")}`;
				summaryText += `\n\n💰 Total: Rp ${Number(result.total).toLocaleString("id-ID")}`;
				summaryText += `\n\n📊 Keyakinan: ${result.confidence}% | Kategori: ${result.category.replace(/_/g, " ")} | Bayar: ${result.paymentMethod}`;
				if (result.date) summaryText += ` | Tanggal: ${result.date}`;

				const suggestions = extractSuggestions(summaryText);
				const sanitized = sanitizeResponse(summaryText);
				const actionButtons = generateScanActionButtons(result as ScanResultData);

				const assistantMsg: ChatMessage = {
					role: "assistant",
					content: sanitized || result.notes || `Analisis selesai dengan tingkat keyakinan ${result.confidence}%.`,
					scanData: result as ScanResultData,
					suggestions: suggestions,
					actionButtons,
				};
				
				// Save to scan history
				addScanHistory({
					thumbnail: currentImg,
					merchant: result.name || "Tidak diketahui",
					total: Number(result.total) || 0,
					date: Date.now(),
					category: result.category?.replace(/_/g, " ") || "Lainnya",
					transactionType: (result.transactionType as "expense" | "income" | "unknown") || "unknown",
					saved: false,
				});

				newMessages.push(userMsg, assistantMsg);
			}

			setMessages((prev) => [...prev, ...newMessages]);
			setScanImages([]);
			setShowScanPanel(false);
			if (scanFileInputRef.current) scanFileInputRef.current.value = "";
			toast.success(`${bulkResults.length} gambar berhasil dianalisis!`);
		} catch (error: unknown) {
			let msg = "Gagal menganalisis gambar. Coba lagi.";
			if (error && typeof error === "object" && "data" in error) {
				const convexErr = error as { data: string | { message?: string } };
				msg = typeof convexErr.data === "string" ? convexErr.data : convexErr.data?.message || msg;
			} else if (error instanceof Error) {
				msg = error.message;
			}
			toast.error(msg);
			console.error("Scan error:", error);
		} finally {
			setIsScanning(false);
		}
	}, [scanImages, isScanning, bulkScanImageDataAction, extractSuggestions, sanitizeResponse, generateScanActionButtons, addScanHistory]);

	const handleRemoveImage = useCallback(() => {
		setSelectedImages([]); // Clear all selected images
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}, []);

	const handleCompleteTask = async (taskId: string) => {
		try {
			await completeTaskMutation({ taskId });
			toast.success("Tugas berhasil diselesaikan!");
		} catch {
			toast.error("Gagal menyelesaikan tugas.");
		}
	};

	const handleDismissTask = async (taskId: string) => {
		try {
			await dismissTaskMutation({ taskId });
			toast.success("Tugas berhasil diabaikan.");
		} catch {
			toast.error("Gagal mengabaikan tugas.");
		}
	};

	const handleExecuteSuggestion = async (suggestion: Suggestion) => {
		if (!suggestion.action) {
			toast.info("Tindakan ini memerlukan konfirmasi manual.");
			return;
		}

		setIsLoading(true);
		try {
			// Execute the suggested action via yumi chat
			const prompt = `Lakukan tindakan berikut: ${suggestion.title} - ${suggestion.description}`;
			const response = await yumiChat({
				message: prompt,
				history: [],
			});

			setMessages((prev) => [
				...prev,
				{
					role: "user",
					content: prompt,
				},
				{
					role: "assistant",
					content: sanitizeResponse(response) || "Tindakan berhasil diproses.",
				},
			]);
			toast.success("Tindakan berhasil dieksekusi!");
		} catch (_error) {
			toast.error("Gagal mengeksekusi tindakan.");
		} finally {
			setIsLoading(false);
		}
	};

	// Session management
	const loadSession = async (sessionId: string) => {
		setCurrentSessionId(sessionId);
		setShowSessionHistory(false);
		// Messages will be loaded via loadConversationQuery
	};

	const deleteSession = async (sessionId: string) => {
		try {
			await deleteSessionMutation({ sessionId });
			if (currentSessionId === sessionId) {
				setCurrentSessionId(null);
				setMessages([
					{
						role: "assistant",
						content:
							"Halo! Saya Yumi, asisten AI kamu. Ada yang bisa saya bantu hari ini?",
					},
				]);
			}
			toast.success("Sesi berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus sesi");
		}
	};

	const clearCurrentChat = async () => {
		if (currentSessionId) {
			try {
				await deleteSessionMutation({ sessionId: currentSessionId });
			} catch {
				// ignore error, still clear UI
			}
		}
		setCurrentSessionId(null);
		setMessages([
			{
				role: "assistant",
				content:
					"Halo! Saya Yumi, asisten AI kamu untuk YUMI POS. Saya bisa membantu merekap data, menganalisis bisnis, MELAKUKAN AKSI seperti tambah produk, update stok, buat pesanan, dan bahkan MULTI-STEP ACTIONS dalam satu permintaan. Sekarang saya dilengkapi dengan Forecasting, Analisis HPP, Efektivitas Diskon, dan Rekonsiliasi Keuangan!",
			},
		]);
		toast.success("Chat berhasil dihapus");
	};

	const startNewSession = () => {
		setCurrentSessionId(null);
		setMessages([
			{
				role: "assistant",
				_msgId: mkMsgId(),
				content:
					"Halo! Saya Yumi, asisten AI kamu untuk YUMI POS. Saya bisa membantu merekap data, menganalisis bisnis, MELAKUKAN AKSI seperti tambah produk, update stok, buat pesanan, dan bahkan MULTI-STEP ACTIONS dalam satu permintaan. Sekarang saya dilengkapi dengan Forecasting, Analisis HPP, Efektivitas Diskon, dan Rekonsiliasi Keuangan!",
			},
		]);
		setShowSessionHistory(false);
	};

	// sendMessage function — sends user message to Yumi AI
	const sendMessage = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (!trimmed && selectedImages.length === 0) return;
		if (isLoading || isStreaming) return;

		const requestId = ++requestIdRef.current;

		// Create user message
		const userMessage: ChatMessage = {
			role: "user",
			content: trimmed || "(gambar)",
			image: selectedImages.length > 0 ? selectedImages[0] : undefined,
			_msgId: mkMsgId(),
		};

		setMessages(prev => [...prev, userMessage]);
		setInput("");
		setSelectedImages([]);
		setIsLoading(true);

		try {
			const history = messages
				.filter(m => m.role === "user" || m.role === "assistant")
				.slice(-10)
				.map(m => ({ role: m.role, content: m.content }));

			const response = await yumiChat({
				message: trimmed,
				history,
				images: selectedImages.length > 0 ? selectedImages : undefined,
			});

			// Stale response guard
			if (requestId !== requestIdRef.current) return;

			const suggestions = extractSuggestions(response);
			const sanitized = sanitizeResponse(response);
			const quickActions = generateQuickActions(trimmed, response);

			const tools = (response.match(/\[TOOL:.*?\]/g) || []).map((t: string) => {
				const inner = t.slice(6, -1);
				const [name, ...rest] = inner.split("|");
				return { name: name.trim(), args: {}, status: "success" as const, result: rest.join("|").trim() };
			});
			if (tools.length > 0) setToolCalls(prev => [...prev, ...tools]);

			const finalContent = sanitized || response;

			streamText(finalContent, () => {
				setMessages(prev => [
					...prev,
					{
						role: "assistant",
						content: finalContent,
						suggestions,
						quickActions,
						_msgId: mkMsgId(),
					},
				]);
			});

			// Save conversation to session
			if (currentSessionId) {
				try {
					await saveConversationMutation({
						sessionId: currentSessionId,
						messages: [
							{ role: "user", content: trimmed },
							{ role: "assistant", content: finalContent },
						],
					});
				} catch { /* ignore save error */ }
			} else {
				// Auto-create a new session
				try {
					const sessionId = await createSessionMutation({
						title: trimmed.slice(0, 50),
					});
					setCurrentSessionId(sessionId);
					await saveConversationMutation({
						sessionId,
						messages: [
							{ role: "user", content: trimmed },
							{ role: "assistant", content: finalContent },
						],
					});
				} catch { /* ignore */ }
			}

			// Auto-generate follow-up tasks
			try {
				await autoGenerateTasksMutation({ message: trimmed, response: finalContent });
			} catch { /* ignore */ }

		} catch (error: unknown) {
			if (requestId !== requestIdRef.current) return;
			let errorMsg = "Maaf, terjadi kesalahan. Silakan coba lagi.";
			if (error && typeof error === "object" && "data" in error) {
				const convexErr = error as { data: string | { message?: string } };
				errorMsg = typeof convexErr.data === "string" ? convexErr.data : convexErr.data?.message || errorMsg;
			} else if (error instanceof Error) {
				errorMsg = error.message;
			}
			setMessages(prev => [
				...prev,
				{
					role: "assistant",
					content: `⚠️ ${errorMsg}`,
					_msgId: mkMsgId(),
				},
			]);
		} finally {
			setIsLoading(false);
		}
	}, [messages, selectedImages, isLoading, isStreaming, yumiChat, streamText, extractSuggestions, sanitizeResponse, currentSessionId, saveConversationMutation, createSessionMutation, autoGenerateTasksMutation]);

	// Ref to always access latest sendMessage in callbacks
	const sendMessageRef = useRef(sendMessage);
	useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

	const deleteAllSessions = async () => {
		if (!chatSessions || chatSessions.length === 0) return;
		try {
			for (const session of chatSessions) {
				await deleteSessionMutation({ sessionId: session.sessionId });
			}
			setCurrentSessionId(null);
			setMessages([
				{
					role: "assistant",
					content:
						"Halo! Saya Yumi, asisten AI kamu. Ada yang bisa saya bantu hari ini?",
				},
			]);
			toast.success("Semua riwayat chat berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus semua riwayat");
		}
	};

	// Load conversation when session changes
	useEffect(() => {
		if (currentSessionId && loadConversationQuery) {
			const history = loadConversationQuery
				.filter((m: { role: string }) => m.role !== "system")
				.map((m: { role: string; content: string }) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
					_msgId: mkMsgId(),
				}));

			if (history.length > 0) {
				setMessages(history);
			}
		}
	}, [currentSessionId, loadConversationQuery]);

	// Get predictions for display (disabled for now - functions not implemented)
	// const getStockRiskLevel = () => {
	// 	if (!stockPredictions.data) return "low";
	// 	const highRisk = (stockPredictions.data as any[]).filter((p: any) => p.risk === "high").length;
	// 	return highRisk > 0 ? "high" : highRisk > 2 ? "medium" : "low";
	// };

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* Tabs */}
			<div className="flex items-center gap-2 border-border border-b bg-card px-2 py-2">
				{/* Smart Insights Badge */}
				{smartInsights.length > 0 && (
					<div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1">
						<Lightbulb className="h-3 w-3 text-primary" />
						<span className="font-medium text-[10px] text-primary">
							{smartInsights.length}
						</span>
					</div>
				)}

				{/* Tabs */}
				<div className="ml-auto flex gap-1">
					{/* Chat History & Clear buttons */}
					{activeTab === "chat" && (
						<>
							<button
								className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-xs transition-colors text-muted-foreground hover:bg-muted"
								onClick={() => setShowSessionHistory(!showSessionHistory)}
								title="Riwayat chat"
								type="button"
							>
								<Bot className="h-4 w-4" />
								<span className="hidden md:inline">Riwayat</span>
							</button>
							<button
								className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium text-xs transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								onClick={clearCurrentChat}
								title="Hapus chat ini"
								type="button"
							>
								<Trash2 className="h-4 w-4" />
							</button>
						</>
					)}
					{[
						{
							id: "chat" as TabType,
							label: "Chat",
							icon: <Bot className="h-4 w-4" />,
						},
						{
							id: "suggestions" as TabType,
							label: "Saran",
							icon: <Lightbulb className="h-4 w-4" />,
						},
						{
							id: "predictions" as TabType,
							label: "Prediksi",
							icon: <TrendingUp className="h-4 w-4" />,
						},
						{
							id: "tasks" as TabType,
							label: "Tasks",
							icon: <Target className="h-4 w-4" />,
						},
					].map((tab) => (
						<button
							className={`rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
								activeTab === tab.id
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-muted"
							}`}
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							type="button"
						>
							<span className="flex items-center gap-1">
								{tab.icon}
								<span className="hidden md:inline">{tab.label}</span>
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Content Area - Scrollable */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain -webkit-overflow-scrolling-touch">
				{activeTab === "chat" && (
					<>
						{/* Messages */}
						<div className="p-4 md:p-6 pb-4">
							<div className="mx-auto max-w-full space-y-4 md:max-w-3xl">
								{/* Smart Insights Cards */}
								{smartInsights.length > 0 && messages.length <= 1 && (
									<div className="mb-4 grid grid-cols-3 gap-2 md:gap-3">
										{smartInsights.map((insight, i) => (
											<motion.div
												animate={{ opacity: 1, scale: 1 }}
												className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-2 md:gap-2 md:rounded-xl md:px-3 md:py-2"
												initial={{ opacity: 0, scale: 0.9 }}
												key={i}
												transition={{ delay: i * 0.1, duration: 0.3 }}
											>
												{insight.icon}
												<span className="text-[10px] text-muted-foreground md:text-xs">
													{insight.text}
												</span>
											</motion.div>
										))}
									</div>
								)}

								<AnimatePresence initial={false}>
									{messages.map((msg, i) => (
										<motion.div
											animate={{ opacity: 1, y: 0 }}
											className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
											exit={{ opacity: 0, scale: 0.95 }}
											initial={{ opacity: 0, y: 10 }}
											key={msg._msgId ?? `${msg.role}-${i}`}
											transition={{ duration: 0.3 }}
										>
											<div
												className={`max-w-[85%] space-y-1 md:space-y-2 ${
													msg.role === "user" ? "items-end" : "items-start"
												}`}
											>
												{msg.role === "assistant" && (
													<div className="flex items-center gap-1.5 px-1">
														<Bot className="h-3.5 w-3.5 text-primary md:h-4 md:w-4" />
														<span className="font-bold text-[10px] text-primary uppercase tracking-wider md:text-xs">
															Yumi
														</span>
													</div>
												)}
												<div
													className={`rounded-xl px-3 py-2.5 text-sm leading-relaxed md:rounded-2xl md:px-4 md:py-3 ${
														msg.role === "user"
															? "rounded-tr-none bg-primary text-primary-foreground"
															: "rounded-tl-none border border-border bg-card text-foreground"
													}`}
												>
													{msg.image && (
														<div className="mb-2 overflow-hidden rounded-lg">
															<img
																alt="Uploaded image"
																className="h-auto max-h-48 w-full object-contain"
																src={msg.image}
															/>
														</div>
													)}
													<div className="whitespace-pre-line">
														{msg.content}
													</div>
													{msg.scanData && (
														<ScanResultCard data={msg.scanData} />
													)}
													{/* Direct Action Buttons - save scan result instantly to app features */}
													{msg.actionButtons && msg.actionButtons.length > 0 && (
														<motion.div
															initial={{ opacity: 0, y: 6 }}
															animate={{ opacity: 1, y: 0 }}
															transition={{ delay: 0.15, duration: 0.3 }}
															className="mt-3 space-y-2 border-t border-border/40 pt-2.5"
														>
															<div className="flex items-center gap-1.5 px-0.5 mb-1">
																<CheckCircle2 className="h-3 w-3 text-emerald-500" />
																<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
																	Edit & Simpan
																</span>
															</div>
															<div className="flex flex-wrap gap-2">
																{msg.actionButtons.map((btn) => {
																	const key = `${i}-${btn.id}`;
																	const isLoadingBtn = actionButtonLoading.has(key);
																	const isDone = actionButtonDone.has(key);
																	return (
																		<button
																			key={btn.id}
																			onClick={() => handleScanActionButton(btn, i)}
																			disabled={isLoadingBtn || isDone}
																			type="button"
																			className={`group flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
																				isDone
																					? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 cursor-default"
																					: btn.variant === "expense"
																					? "border-red-400/30 bg-red-500/5 text-red-600 hover:bg-red-500/10 hover:border-red-500/40 hover:scale-105 hover:shadow-sm"
																					: btn.variant === "income"
																					? "border-emerald-400/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:scale-105 hover:shadow-sm"
																					: "border-blue-400/30 bg-blue-500/5 text-blue-700 hover:bg-blue-500/10 hover:border-blue-500/40 hover:scale-105 hover:shadow-sm"
																			}}`}
																		>
																			{isLoadingBtn ? (
																				<Loader2 className="h-3.5 w-3.5 animate-spin" />
																			) : isDone ? (
																				<Check className="h-3.5 w-3.5 text-emerald-500" />
																			) : (
																				<span className="text-sm leading-none">{btn.icon}</span>
																			)}
																			<span>{isDone ? "Tersimpan!" : "✏️ " + btn.label}</span>
																		</button>
																	);
																})}
															</div>
														</motion.div>
													)}
													{msg.role === "assistant" && (
														<button
															aria-label={copiedIndex === i ? "Pesan tersalin" : "Salin pesan"}
																className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
															onClick={() => handleCopy(msg.content, i)}
															type="button"
														>
															{copiedIndex === i ? (
																<Check className="h-3 w-3 text-green-500" />
															) : (
																<Copy className="h-3 w-3" />
															)}
															{copiedIndex === i ? "Tersalin" : "Salin"}
														</button>
													)}
												</div>

												{/* Unified second bubble: quick actions + AI suggestions */}
												{msg.role === "assistant" && (msg.quickActions?.length || msg.suggestions?.length) ? (
													<motion.div
														initial={{ opacity: 0, y: 10 }}
														animate={{ opacity: 1, y: 0 }}
														transition={{ delay: 0.4, duration: 0.35 }}
														role="region"
															aria-label="Langkah selanjutnya dari Yumi"
															aria-live="polite"
															className="mt-2 space-y-1.5"
													>
														<div className="flex items-center gap-1.5 px-1">
															<Zap className="h-3 w-3 text-amber-500 animate-pulse" />
															<span className="font-bold text-[10px] text-amber-500 uppercase tracking-wider">Langkah Selanjutnya</span>
														</div>
														<div className="rounded-xl rounded-tl-none border border-amber-500/20 bg-amber-50/40 px-3 py-2.5 dark:bg-amber-950/20 md:rounded-2xl md:px-4 md:py-3">
															{msg.quickActions && msg.quickActions.length > 0 && (
																<div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
																	{msg.quickActions.map((action) => (
																		<button
																			key={action.id}
																			onClick={() => handleQuickAction(action)}
														aria-label={`${action.label} - ${action.actionType === "navigate" ? "buka halaman" : "kirim ke Yumi"}`}
														type="button"
																			disabled={isLoading || isStreaming}
																			className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5 ${
																				action.variant === "finance"
																					? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
																					: action.variant === "order"
																					? "border-blue-400/40 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:text-blue-400"
																					: action.variant === "product"
																					? "border-purple-400/40 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:text-purple-400"
																					: action.variant === "stock"
																					? "border-orange-400/40 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-400"
																					: action.variant === "discount"
																					? "border-pink-400/40 bg-pink-500/10 text-pink-700 hover:bg-pink-500/20 dark:text-pink-400"
																					: "border-border bg-background text-foreground hover:bg-muted"
																			}`}
																		>
																			<span className="text-sm leading-none">{action.icon}</span>
																			<span className="flex-1 text-left">{action.label}</span>
																			{action.actionType === "navigate" && (
																				<ArrowRight className="h-3 w-3 shrink-0 opacity-60" />
																			)}
																		</button>
																	))}
																</div>
															)}
															{msg.suggestions && msg.suggestions.length > 0 && (
																<>
																	{msg.quickActions && msg.quickActions.length > 0 && (
																		<div className="my-2.5 border-t border-amber-500/15" />
																	)}
																	<div className="mb-1.5 flex items-center gap-1">
																		<Sparkles className="h-2.5 w-2.5 text-primary/60" />
																		<span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Tanya Yumi</span>
																	</div>
																	<div className="flex flex-wrap gap-1.5">
																		{msg.suggestions.map((suggestion, idx) => (
																			<button
																				key={idx}
																				onClick={() => sendMessageRef.current(suggestion.prompt)}
																aria-label={`Tanya Yumi: ${suggestion.label}`}
																				type="button"
																				disabled={isLoading || isStreaming}
																				className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:scale-105 hover:bg-primary/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
																			>
																				<Send className="h-2.5 w-2.5 shrink-0" />
																				<span>{suggestion.label}</span>
																			</button>
																		))}
																	</div>
																</>
															)}
														</div>
													</motion.div>
												) : null}
											</div>
										</motion.div>
									))}
								</AnimatePresence>

								{/* Tool Execution Indicator */}
								<AnimatePresence>
									{toolCalls.map((tool, i) => (
										<motion.div
											animate={{ opacity: 1, x: 0 }}
											exit={{ opacity: 0, x: -20 }}
											initial={{ opacity: 0, x: -20 }}
											key={i}
											transition={{ duration: 0.3 }}
										>
											<div className="flex items-start gap-2">
												<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
													{tool.status === "executing" ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
													) : tool.status === "success" ? (
														<CheckCircle2 className="h-3.5 w-3.5 text-primary" />
													) : (
														<XCircle className="h-3.5 w-3.5 text-destructive" />
													)}
												</div>
												<div className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2">
													<div className="flex items-center gap-2">
														<Settings className="h-3 w-3 text-primary" />
														<span className="font-medium text-[10px] text-foreground">
															{TOOL_LABELS[tool.name] || tool.name}
														</span>
														<span className="text-[10px] text-muted-foreground">
															{tool.status === "executing"
																? "eksekusi..."
																: tool.status === "success"
																	? "berhasil"
																	: "gagal"}
														</span>
													</div>
												</div>
											</div>
										</motion.div>
									))}
								</AnimatePresence>

								{/* Typing Indicator - Single subtle pulse */}
								{isLoading && toolCalls.length === 0 && (
									<div role="status" aria-label="Yumi sedang memproses" className="flex justify-start">
										<div className="space-y-1">
											<div className="flex items-center gap-1.5 px-1">
												<Bot className="h-3.5 w-3.5 text-primary" />
												<span className="font-bold text-[10px] text-primary uppercase tracking-wider">
													Yumi
												</span>
											</div>
											<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2">
												<div className="flex items-center gap-1">
													<span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" />
												</div>
											</div>
										</div>
									</div>
								)}

								{/* Streaming Message */}
								{isStreaming && streamingContent && (
									<div aria-label="Yumi sedang mengetik" className="flex justify-start">
										<div className="max-w-[85%] space-y-1 items-start">
											<div className="flex items-center gap-1.5 px-1">
												<Bot className="h-3.5 w-3.5 text-primary" />
												<span className="font-bold text-[10px] text-primary uppercase tracking-wider">
													Yumi
												</span>
											</div>
											<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2.5 text-sm leading-relaxed md:rounded-2xl md:px-4 md:py-3">
												<div aria-live="polite" aria-atomic="false" className="whitespace-pre-line">
													{streamingContent}
													<span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
												</div>
											</div>
										</div>
									</div>
								)}
<div ref={messagesEndRef} />
							</div>
						</div>
					</>
				)}

				{/* Suggestions Tab */}
				{activeTab === "suggestions" && (
					<div className="space-y-4 p-4">
						<h3 className="mb-4 font-bold text-foreground">
							Saran Proaktif AI
						</h3>

						{!proactiveSuggestions || proactiveSuggestions.length === 0 ? (
							<div className="py-8 text-center">
								<Lightbulb className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
								<p className="text-muted-foreground">
									Tidak ada saran saat ini. Semua berjalan lancar!
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								{proactiveSuggestions.map((suggestion: any) => (
									<div
										className={`space-y-2 rounded-xl border p-4 ${
											suggestion.priority === "high"
												? "border-destructive/50 bg-destructive/5"
												: suggestion.priority === "medium"
													? "border-warning/50 bg-warning/5"
													: "border-border bg-muted/50"
										}`}
										key={suggestion.id}
									>
										<div className="flex items-start justify-between">
											<div className="flex items-center gap-2">
												{suggestion.type === "low_stock" && (
													<AlertTriangle className="h-4 w-4 text-accent" />
												)}
												{suggestion.type === "pending_order" && (
													<Bell className="h-4 w-4 text-primary" />
												)}
												{suggestion.type === "stock_prediction" && (
													<TrendingUp className="h-4 w-4 text-purple-500" />
												)}
												{suggestion.type === "promo_opportunity" && (
													<Sparkles className="h-4 w-4 text-green-500" />
												)}
												<p className="font-semibold text-sm">
													{suggestion.title}
												</p>
											</div>
											<span
												className={`rounded-full px-2 py-0.5 text-[10px] ${
													suggestion.priority === "high"
														? "bg-destructive text-destructive-foreground"
														: suggestion.priority === "medium"
															? "bg-warning text-warning-foreground"
															: "bg-muted text-muted-foreground"
												}`}
											>
												{suggestion.priority === "high"
													? "Penting"
													: suggestion.priority === "medium"
														? "Sedang"
														: "Biasa"}
											</span>
										</div>
										<p className="text-muted-foreground text-xs">
											{suggestion.description}
										</p>

										{suggestion.action && (
											<button
												className="mt-2 w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
												disabled={isLoading}
												onClick={() => handleExecuteSuggestion(suggestion)}
												type="button"
											>
												Lakukan
											</button>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* Predictions Tab */}
				{activeTab === "predictions" && (
					<div className="space-y-4 p-4">
						<h3 className="mb-4 font-bold text-foreground">Prediksi AI</h3>

						{/* Stock Out Predictions */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Prediksi Stok Habis
							</h4>
							{stockPredictions && stockPredictions.length > 0 ? (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									{stockPredictions.map((item: any) => (
										<div
											className={`rounded-lg border p-3 ${
												item.risk === "high"
													? "border-destructive/50 bg-destructive/5"
													: "border-warning/50 bg-warning/5"
											}`}
											key={item.ingredientName}
										>
											<div className="flex items-center justify-between">
												<div>
													<p className="font-medium text-sm">
														{item.ingredientName}
													</p>
													<p className="text-muted-foreground text-xs">
														Sisa: {item.currentStock} {item.unit}
													</p>
												</div>
												<div className="text-right">
													<p className="text-foreground text-xs">
														{item.daysUntilEmpty <= 1
															? "Habis hari ini"
															: item.daysUntilEmpty === 1
																? "Habis besok"
																: `Habis dalam ${item.daysUntilEmpty} hari`}
													</p>
													<p className="text-muted-foreground text-xs">
														Pakai: {item.dailyUsage}/hari
													</p>
												</div>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Tidak ada item yang berisiko habis dalam 7 hari ke depan
									</p>
								</div>
							)}
						</div>

						{/* Busy Hours Prediction */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Jam Ramai
							</h4>
							{busyHoursPrediction && busyHoursPrediction.peakHours ? (
								<div className="grid grid-cols-5 gap-2">
									{busyHoursPrediction.peakHours.map((hour: any) => (
										<div
											className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-center"
											key={hour.hour}
										>
											<p className="font-bold text-primary">
												{hour.hour}:00
											</p>
											<p className="text-muted-foreground text-xs">
												{hour.percentage}%
											</p>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Belum cukup data untuk analisis jam ramai
									</p>
								</div>
							)}
						</div>

						{/* Revenue Prediction */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Prediksi Pendapatan 7 Hari Kedepan
							</h4>
							{revenuePrediction && revenuePrediction.predictions ? (
								<>
									<div className="flex items-center gap-2">
										<p className="text-muted-foreground text-xs">
											Rata-rata harian saat ini:
										</p>
										<p className="font-bold text-foreground text-sm">
											Rp {revenuePrediction.currentAvgDaily?.toLocaleString("id-ID")}
										</p>
										<span
											className={`rounded-full px-2 py-0.5 text-[10px] ${
												revenuePrediction.trend === "increasing"
													? "bg-green-500/20 text-green-600"
													: revenuePrediction.trend === "decreasing"
														? "bg-red-500/20 text-red-600"
														: "bg-muted text-muted-foreground"
											}`}
										>
											{revenuePrediction.trend === "increasing"
												? "Naik"
												: revenuePrediction.trend === "decreasing"
													? "Turun"
													: "Stabil"}
										</span>
									</div>
									<div className="grid grid-cols-7 gap-2">
										{revenuePrediction.predictions.map(
											(pred: any, index: number) => (
												<div
													className="rounded-lg border border-border bg-card p-2 text-center"
													key={pred.date}
												>
													<p className="text-muted-foreground text-[10px]">
														{pred.dayName.slice(0, 3)}
													</p>
													<p className="font-medium text-xs">
														{(pred.predictedRevenue / 1000).toFixed(0)}k
													</p>
												</div>
											)
										)}
									</div>
								</>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Belum cukup data untuk prediksi pendapatan
									</p>
								</div>
							)}
						</div>

						{/* Trending Products Prediction */}
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h4 className="text-muted-foreground text-sm font-semibold">
									Produk Trending
								</h4>
								{trendingProducts && trendingProducts.length > 0 && (
									<span className="text-muted-foreground text-xs">
										Berdasarkan growth rate 7 hari terakhir
									</span>
								)}
							</div>
							{trendingProducts && trendingProducts.length > 0 ? (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									{trendingProducts.slice(0, 4).map((product: any) => (
										<div
											className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
											key={product._id}
										>
											<div
												className={`flex h-8 w-8 items-center justify-center rounded-full ${
													product.growthRate > 0
														? "bg-green-500/20 text-green-600"
														: product.growthRate < 0
															? "bg-red-500/20 text-red-600"
															: "bg-muted text-muted-foreground"
												}`}
											>
												<TrendingUp className="h-4 w-4" />
											</div>
											<div className="flex-1">
												<p className="font-medium text-xs">{product.name}</p>
												<p className="text-muted-foreground text-[10px]">
													{product.recentSales} terjual minggu ini
												</p>
											</div>
											<div className="text-right">
												<p
													className={`text-xs font-semibold ${
														product.growthRate > 0
															? "text-green-600"
															: "text-red-600"
													}`}
												>
													{product.growthRate > 0 ? "+" : ""}
													{product.growthRate}%
												</p>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
									<p className="text-muted-foreground text-xs">
										Belum cukup data untuk analisis trending
									</p>
								</div>
							)}
						</div>

						{/* Best Promo Time Prediction */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Waktu Terbaik untuk Promo
							</h4>
							{bestPromoTime && bestPromoTime.hasEnoughData ? (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									<div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
										<p className="text-muted-foreground text-[10px]">Hari Terbaik</p>
										<p className="font-semibold text-sm text-primary">
											{bestPromoTime.bestDay?.day}
										</p>
										<p className="text-muted-foreground text-xs">
											{bestPromoTime.bestDay?.recommendation}
										</p>
									</div>
									<div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
										<p className="text-muted-foreground text-[10px]">Hari Butuh Promo</p>
										<p className="font-semibold text-sm text-warning">
											{bestPromoTime.worstDay?.day}
										</p>
										<p className="text-muted-foreground text-xs">
											{bestPromoTime.worstDay?.recommendation}
										</p>
									</div>
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
									<p className="text-muted-foreground text-xs">
										{bestPromoTime?.message || "Analisis waktu promo akan segera hadir"}
									</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Tasks Tab */}
				{activeTab === "tasks" && (
					<div className="space-y-4 p-4">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-bold text-foreground">Tindak Lanjutan</h3>
							<button
								className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-primary text-xs font-medium transition-colors hover:bg-primary/20 disabled:opacity-50"
								disabled={isLoading}
								onClick={async () => {
									setIsLoading(true);
									try {
										const result = await autoGenerateTasksMutation({});
										if (result) {
											toast.success(
												`${result.created} tugas baru berhasil dibuat!`
											);
										}
									} catch {
										toast.error("Gagal membuat tugas otomatis.");
									} finally {
										setIsLoading(false);
									}
								}}
								type="button"
							>
								<Sparkles className="h-3.5 w-3.5" />
								<span>Generate AI Tasks</span>
							</button>
						</div>

						{pendingTasks && pendingTasks.length > 0 ? (
							<div className="space-y-3">
								{pendingTasks.map((task: any) => (
									<div
										className={`rounded-lg border p-3 ${
											task.priority === "high"
												? "border-destructive/50 bg-destructive/5"
												: task.priority === "medium"
													? "border-warning/50 bg-warning/5"
													: "border-border bg-card"
										}`}
										key={task._id}
									>
										<div className="flex items-start gap-3">
											<div
												className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
													task.priority === "high"
														? "bg-destructive/20 text-destructive"
														: task.priority === "medium"
															? "bg-warning/20 text-warning"
															: "bg-primary/20 text-primary"
												}`}
											>
												<Target className="h-4 w-4" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="font-medium text-sm">{task.title}</p>
												{task.description && (
													<p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
														{task.description}
													</p>
												)}
												<div className="mt-1.5 flex items-center gap-2">
													<span
														className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
															task.category === "inventory"
																? "bg-blue-500/20 text-blue-600"
																: task.category === "orders"
																	? "bg-purple-500/20 text-purple-600"
																	: task.category === "finance"
																		? "bg-green-500/20 text-green-600"
																		: task.category === "marketing"
																			? "bg-orange-500/20 text-orange-600"
																			: "bg-gray-500/20 text-gray-600"
														}`}
													>
														{task.category}
													</span>
													{task.dueDate && (
														<span className="text-muted-foreground text-[10px]">
															<Calendar className="inline h-2.5 w-2.5 mr-0.5" />
															{new Date(task.dueDate).toLocaleDateString(
																"id-ID",
																{ day: "numeric", month: "short" }
															)}
														</span>
													)}
													{task.isOverdue && (
														<span className="text-destructive text-[10px] font-medium">
															Terlambat!
														</span>
													)}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<button
													className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
													onClick={() => handleCompleteTask(task._id)}
													type="button"
												>
													Selesai
												</button>
												<button
													className="rounded-lg border border-border bg-muted px-3 py-1.5 text-muted-foreground text-xs font-medium hover:bg-muted transition-colors"
													onClick={() => handleDismissTask(task._id)}
													type="button"
												>
													Abai
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center">
								<Target className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
								<p className="text-muted-foreground text-sm">
									Tidak ada tugas tertunda
								</p>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Input Form - stays fixed at bottom above mobile navbar */}
			{activeTab === "chat" && (
				<div className="shrink-0 border-border border-t bg-card px-2 pb-safe-with-nav pt-2 md:px-4 md:pb-4 md:pt-3">
					<div className="mx-auto max-w-full space-y-2 md:max-w-3xl">
						{/* Templates */}
						<div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
							{TEMPLATES.map((t) => (
								<button
									className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-[10px] text-muted-foreground transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
									disabled={isLoading}
									key={t.label}
									onClick={() => sendMessageRef.current(t.message)}
									type="button"
								>
									{t.icon}
									<span className="whitespace-nowrap">{t.label}</span>
								</button>
							))}
						</div>

						{/* Scan Panel - shown above input box */}
					<AnimatePresence>
						{showScanPanel && (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="mb-2 overflow-hidden rounded-2xl border border-primary/30 bg-primary/5"
								exit={{ opacity: 0, y: 8 }}
								initial={{ opacity: 0, y: 8 }}
								transition={{ duration: 0.2 }}
							>
								{/* Panel Header */}
								<div className="flex items-center justify-between border-border border-b px-3 py-2">
									<div className="flex items-center gap-1.5">
										<ScanLine className="h-3.5 w-3.5 text-primary" />
										<span className="font-semibold text-primary text-xs">Scan & Analisis Gambar AI</span>
									</div>
									<button
										className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
										onClick={() => { setShowScanPanel(false); setScanImages([]); }}
										type="button"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								</div>
								{/* Panel Body */}
								<div className="p-3">
									{!scanImages.length ? (
										<button
											className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-background py-5 transition-colors hover:border-primary/60 hover:bg-primary/5"
											onClick={() => scanFileInputRef.current?.click()}
											type="button"
										>
											<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
												<Camera className="h-5 w-5 text-primary" />
											</div>
											<div className="text-center">
												<p className="font-medium text-foreground text-xs">
													Upload foto struk, kwitansi, atau dokumen
												</p>
												<p className="text-[10px] text-muted-foreground">
													JPG, PNG • Maks 5MB • Bisa pilih banyak sekaligus
												</p>
											</div>
										</button>
									) : (
										<div className="space-y-2">
											<div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
												{scanImages.map((img, idx) => (
													<div className="relative overflow-hidden rounded-xl border border-border bg-muted group" key={idx}>
														<img
															alt={`Preview ${idx + 1}`}
															className="h-24 w-full object-contain"
															src={img}
														/>
														<button
															className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive/90 text-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
															onClick={() => { setScanImages(prev => prev.filter((_, i) => i !== idx)); }}
															type="button"
														>
															<X className="h-3 w-3" />
														</button>
													</div>
												))}
												<button
													className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-background hover:bg-primary/5 transition-colors"
													onClick={() => scanFileInputRef.current?.click()}
													type="button"
												>
													<PlusCircle className="h-5 w-5 text-primary" />
												</button>
											</div>
											<button
												className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground text-sm disabled:opacity-60"
												disabled={isScanning || scanImages.length === 0}
												onClick={handleRunScan}
												type="button"
											>
												{isScanning ? (
													<>
														<Loader2 className="h-4 w-4 animate-spin" />
														Menganalisis {scanImages.length} Gambar...
													</>
												) : (
													<>
														<ScanLine className="h-4 w-4" />
														Scan {scanImages.length} Gambar sekaligus
													</>
												)}
											</button>
										</div>
									)}
									<input
										accept="image/*"
										multiple
										className="hidden"
										onChange={handleScanFileSelect}
										ref={scanFileInputRef}
										type="file"
									/>
								</div>
							</motion.div>
						)}
					</AnimatePresence>

					{/* ChatGPT/Claude-style Input Box */}
						<div className="space-y-3">
							<div className="rounded-2xl border border-border bg-background shadow-sm">
							{/* Multiple Images Preview inside input box */}
							{selectedImages.length > 0 && (
								<div className="flex items-center gap-2 border-border border-b px-3 py-2 overflow-x-auto scrollbar-hide">
									{selectedImages.map((img, idx) => (
										<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted shadow-sm group" key={idx}>
											<img
												alt={`Preview ${idx + 1}`}
												className="h-full w-full object-cover"
												src={img}
											/>
											<button
												className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
												onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
												type="button"
											>
												<X className="h-3 w-3" />
											</button>
										</div>
									))}
									<button
										className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-primary/30 bg-muted/30 hover:bg-primary/5 transition-colors"
										onClick={() => fileInputRef.current?.click()}
										type="button"
									>
										<PlusCircle className="h-4 w-4 text-primary" />
									</button>
									<p className="text-muted-foreground text-[10px] whitespace-nowrap ml-1">{selectedImages.length} gambar terlampir</p>
								</div>
							)}

							{/* Input Row - Scan, Textarea, Send */}
							<div className="flex items-end gap-2 p-2">
								{/* Scan Button */}
								<button
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${
										showScanPanel
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground"
									}`}
									disabled={isLoading}
									onClick={() => setShowScanPanel((v) => !v)}
									title="Scan & analisis gambar dengan AI"
									type="button"
								>
									<ScanLine className="h-4 w-4" />
								</button>

								{/* Scan History Button */}
								<button
									className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									onClick={() => setShowScanHistory(true)}
									title="Riwayat scan"
									type="button"
								>
									<History className="h-4 w-4" />
									{scanHistory.length > 0 && (
										<span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
											{scanHistory.length > 9 ? "9+" : scanHistory.length}
										</span>
									)}
								</button>

								{/* Hidden file input for chat attachment */}
								<input
									accept="image/*"
									className="hidden"
									multiple
									onChange={handleFileSelect}
									ref={fileInputRef}
									type="file"
								/>

								{/* Textarea */}
								<textarea
									className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
									disabled={isLoading}
									onChange={(e) => {
										setInput(e.target.value);
										e.target.style.height = "auto";
										e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											if (input.trim() || selectedImages.length > 0) {
											sendMessage(input);
											if (inputRef.current) {
												inputRef.current.style.height = "auto";
											}
										}
										}
									}}
									placeholder="Tanya Yumi..."
									ref={inputRef}
									rows={1}
									value={input}
								/>

								{/* Right: Send button */}
								<button
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
										input.trim() || selectedImages.length > 0
											? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
											: "bg-muted text-muted-foreground"
									} disabled:cursor-not-allowed disabled:opacity-50`}
									disabled={isLoading || !(input.trim() || selectedImages.length > 0)}
									onClick={() => {
										if (input.trim() || selectedImages.length > 0) {
											sendMessage(input);
											if (inputRef.current) {
												inputRef.current.style.height = "auto";
											}
										}
									}}
									title="Kirim pesan"
									type="button"
								>
									{isLoading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Send className="h-4 w-4" />
									)}
								</button>
							</div>
						</div>
					</div>

						<p className="text-center text-[10px] text-muted-foreground">
							Yumi AI dapat membuat kesalahan. Selalu verifikasi informasi penting.
						</p>
					</div>
				</div>
			)}

			{/* Chat History Sidebar Panel */}
			<AnimatePresence>
				{showSessionHistory && (
					<>
						{/* Backdrop */}
						<motion.div
							animate={{ opacity: 1 }}
							className="fixed inset-0 z-40 bg-black/50"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={() => setShowSessionHistory(false)}
						/>
						{/* Session History Panel */}
						<motion.div
							animate={{ x: 0 }}
							className="fixed right-0 top-0 bottom-0 z-50 w-80 border-border border-l bg-card shadow-2xl md:rounded-l-2xl"
							exit={{ x: "100%" }}
							initial={{ x: "100%" }}
							transition={{ type: "spring", damping: 25, stiffness: 300 }}
						>
							<div className="flex h-full flex-col">
								{/* Header */}
								<div className="flex items-center justify-between border-border border-b p-4">
									<div>
										<h3 className="font-semibold text-foreground">
											Riwayat Chat
										</h3>
										<p className="text-muted-foreground text-xs">
											{chatSessions?.length || 0} sesi
										</p>
									</div>
									<div className="flex items-center gap-1">
										{chatSessions && chatSessions.length > 0 && (
											<button
												className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted-foreground text-xs transition-colors hover:bg-destructive/10 hover:text-destructive"
												onClick={deleteAllSessions}
												title="Hapus semua riwayat"
												type="button"
											>
												<Trash2 className="h-3.5 w-3.5" />
												<span>Hapus Semua</span>
											</button>
										)}
										<button
											className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
											onClick={() => setShowSessionHistory(false)}
											type="button"
										>
											<X className="h-4 w-4" />
										</button>
									</div>
								</div>

								{/* New Chat Button */}
								<div className="p-3 border-border border-b">
									<button
										className="flex w-full items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90"
										onClick={() => startNewSession()}
										type="button"
									>
										<Sparkles className="h-4 w-4" />
										Chat Baru
									</button>
								</div>

								{/* Session List */}
								<div className="flex-1 overflow-y-auto p-2 space-y-1">
									{!chatSessions || chatSessions.length === 0 ? (
										<div className="py-8 text-center">
											<Bot className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
											<p className="text-muted-foreground text-sm">
												Belum ada riwayat chat
											</p>
										</div>
									) : (
										chatSessions.map((session: ChatSession) => (
											<div
												className={`group relative rounded-lg border p-3 transition-all cursor-pointer ${
													currentSessionId === session.sessionId
														? "border-primary bg-primary/5"
														: "border-border bg-card hover:bg-muted/50"
												}`}
												key={session.sessionId}
												onClick={() => loadSession(session.sessionId)}
											>
												<div className="flex items-start justify-between gap-2">
													<div className="flex-1 min-w-0">
														<p className="font-medium text-xs text-foreground line-clamp-1">
															{session.title}
														</p>
														<p className="text-muted-foreground text-[10px]">
															{session.messageCount} pesan
														</p>
													</div>
													<button
														className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
														onClick={(e) => {
															e.stopPropagation();
															deleteSession(session.sessionId);
														}}
														title="Hapus sesi"
														type="button"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>
												<p className="text-muted-foreground text-[10px] mt-1">
													{new Date(session.createdAt).toLocaleDateString(
														"id-ID",
														{
															day: "numeric",
															month: "short",
															hour: "2-digit",
															minute: "2-digit",
														}
													)}
												</p>
											</div>
										))
									)}
								</div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>

			{/* Image Scanner Modal */}
			<ImageScanner
				isOpen={isImageScannerOpen}
				onClose={() => setIsImageScannerOpen(false)}
				onDataGenerated={(type, data) => {
					setMessages((prev) => [
						...prev,
						{
							role: "assistant",
							content: `Berhasil membuat ${type} dengan data: ${JSON.stringify(data)}`,
						},
					]);
				}}
			/>

			{/* Edit Modal — validate & correct before save */}
			{editModal && (
				<ScanEditModal
					params={editModal.params}
					onSave={handleSaveFromEditModal}
					onSplit={(params) => {
						splitModal === null && setSplitModal({ params, btnKey: editModal.btnKey });
					}}
					onClose={() => setEditModal(null)}
				/>
			)}

			{/* Split Modal */}
			{splitModal && (
				<ScanSplitModal
					totalAmount={splitModal.params.amount}
					transactionType={splitModal.params.type}
					baseParams={splitModal.params}
					onSave={handleSaveFromSplitModal}
					onBack={() => setSplitModal(null)}
					onClose={() => { setSplitModal(null); setEditModal(null); }}
				/>
			)}

			{/* Scan History Panel */}
			{showScanHistory && (
				<ScanHistoryPanel
					history={scanHistory}
					onRemove={removeScanHistory}
					onClearAll={clearScanHistory}
					onClose={() => setShowScanHistory(false)}
				/>
			)}
		</div>
	);
}

// ─── Scan Result Card Component ──────────────────────────────────────────────

function ScanResultCard({ data }: { data: ScanResultData }) {
	const typeLabel: Record<string, string> = {
		receipt: "Struk Belanja",
		invoice: "Invoice/Faktur",
		note: "Nota",
		handwriting: "Tulisan Tangan",
		product: "Produk",
		other: "Dokumen",
		unknown: "Tidak Dikenali",
	};

	const paymentLabel: Record<string, string> = {
		cash: "Tunai",
		qris: "QRIS",
		card: "Kartu",
		transfer: "Transfer",
		unknown: "-",
	};

	const confidenceColor =
		data.confidence >= 80
			? "text-green-600 bg-green-500/10"
			: data.confidence >= 50
				? "text-yellow-600 bg-yellow-500/10"
				: "text-red-600 bg-red-500/10";

	return (
		<div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-border border-b bg-muted/40 px-3 py-2">
				<div className="flex items-center gap-1.5">
					<Receipt className="h-3.5 w-3.5 text-primary" />
					<span className="font-semibold text-foreground text-xs">
						{typeLabel[data.type] ?? "Dokumen"}
					</span>
					{data.name && data.name !== "Tidak dapat diidentifikasi" && (
						<span className="text-muted-foreground text-xs">• {data.name}</span>
					)}
				</div>
				<span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceColor}`}>
					{data.confidence}% akurat
				</span>
			</div>

			{/* Main Data */}
			<div className="p-3 space-y-2.5">
				{/* Transaction Type + Total */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						{data.transactionType === "expense" ? (
							<>
								<TrendingDown className="h-4 w-4 text-red-500" />
								<span className="font-medium text-red-600 text-xs">Pengeluaran</span>
							</>
						) : data.transactionType === "income" ? (
							<>
								<TrendingUp className="h-4 w-4 text-green-500" />
								<span className="font-medium text-green-600 text-xs">Pemasukan</span>
							</>
						) : (
							<>
								<FileText className="h-4 w-4 text-muted-foreground" />
								<span className="text-muted-foreground text-xs">Tipe tidak dikenali</span>
							</>
						)}
					</div>
					{data.total > 0 && (
						<span className="font-bold text-foreground text-base">
							Rp{data.total.toLocaleString("id-ID")}
						</span>
					)}
				</div>

				{/* Meta info grid */}
				<div className="grid grid-cols-2 gap-1.5 text-[11px]">
					{data.category && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground">Kategori</span>
							<span className="font-medium text-foreground capitalize">{data.category}</span>
						</div>
					)}
					{data.paymentMethod && data.paymentMethod !== "unknown" && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground">Pembayaran</span>
							<span className="font-medium text-foreground">{paymentLabel[data.paymentMethod] ?? data.paymentMethod}</span>
						</div>
					)}
					{data.date && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground">Tanggal</span>
							<span className="font-medium text-foreground">{data.date}</span>
						</div>
					)}
					{(data.tax ?? 0) > 0 && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground">Pajak</span>
							<span className="font-medium text-foreground">Rp{(data.tax ?? 0).toLocaleString("id-ID")}</span>
						</div>
					)}
					{(data.discount ?? 0) > 0 && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground">Diskon</span>
							<span className="font-medium text-green-600">-Rp{(data.discount ?? 0).toLocaleString("id-ID")}</span>
						</div>
					)}
					{(data.subtotal ?? 0) > 0 && data.subtotal !== data.total && (
						<div className="flex flex-col rounded-lg bg-muted/50 px-2.5 py-1.5">
							<span className="text-muted-foreground">Subtotal</span>
							<span className="font-medium text-foreground">Rp{(data.subtotal ?? 0).toLocaleString("id-ID")}</span>
						</div>
					)}
				</div>

				{/* Items list */}
				{data.items && data.items.length > 0 && (
					<div className="rounded-lg border border-border overflow-hidden">
						<div className="bg-muted/40 px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
							Item ({data.items.length})
						</div>
						<div className="divide-y divide-border">
							{data.items.map((item, idx) => (
								<div className="flex items-center justify-between px-2.5 py-1.5" key={idx}>
									<div className="flex-1 min-w-0">
										<span className="text-[11px] text-foreground line-clamp-1">{item.name}</span>
										{item.qty > 1 && (
											<span className="text-[10px] text-muted-foreground"> x{item.qty}</span>
										)}
									</div>
									{(item.subtotal > 0 || item.price > 0) && (
										<span className="text-[11px] font-medium text-foreground ml-2 shrink-0">
											Rp{(item.subtotal || item.price * item.qty || item.price).toLocaleString("id-ID")}
										</span>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Notes */}
				{data.notes && data.notes !== "Gambar berhasil dianalisis namun data tidak dapat diekstrak secara terstruktur." && (
					<p className="text-[10px] text-muted-foreground italic leading-relaxed">
						{data.notes}
					</p>
				)}
			</div>
		</div>
	);
}

export default AIChatPage;
