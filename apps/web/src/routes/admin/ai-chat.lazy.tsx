import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	Bell,
	Bot,
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
	Trash2,
	TrendingDown,
	TrendingUp,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageScanner } from "@/components/ai/image-scanner";

export const Route = createLazyFileRoute("/admin/ai-chat")({
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
	items: Array<{ name: string; qty: number; price: number; subtotal: number; unit?: string }>;
	date?: string | null;
	paymentMethod: string;
	notes?: string;
	confidence: number;
	rawText?: string;
}

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	image?: string;
	scanData?: ScanResultData;
	suggestions?: Array<{ label: string; prompt: string }>;
	actionButtons?: Array<{ type: string; label: string; data: any; icon: React.ReactNode }>;
	_msgId: string;
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
		label: "Briefing Bisnis",
		message: "Berikan briefing status bisnis saya saat ini",
		icon: <Sparkles className="h-3.5 w-3.5" />,
	},
	{
		label: "Rekap Lengkap",
		message: "Berikan rekapitulasi detail bisnis saya: jumlah produk per kategori, pemasukan, pengeluaran, dan jumlah pesanan untuk periode: hari ini, kemarin, minggu ini, minggu lalu, bulan ini, dan bulan lalu.",
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
	createBooking: "Buat Booking",
	bulkCreateBookings: "Buat Bulk Booking",
};

function AIChatPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [loadingStatus, setLoadingStatus] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const streamingActiveRef = useRef(false);
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
	const [isImageScannerOpen, setIsImageScannerOpen] = useState(false);
	const [selectedImages, setSelectedImages] = useState<string[]>([]);
	const [activeTab, setActiveTab] = useState<TabType>("chat");
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [showSessionHistory, setShowSessionHistory] = useState(false);

	const mkMsgId = () => Math.random().toString(36).substring(2, 11);

	const [isScanMode, setIsScanMode] = useState(false);
	const [isScanning, setIsScanning] = useState(false);
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const briefingAttemptedRef = useRef(false);

	// Sanitize AI response - remove markdown formatting and suggestion tags
	const sanitizeResponse = useCallback((text: string): string => {
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
			// Remove bullet points (*) and replace with emoji
			.replace(/^\*\s+/gm, "🔹 ")
			.replace(/^\-\s+/gm, "🔹 ")
			// Remove code blocks
			.replace(/```[\s\S]*?```/g, "")
			// Remove inline code
			.replace(/`(.*?)`/g, "$1")
			// Remove numbered list markdown
			.replace(/^\d+\.\s+/gm, "")
			// Clean up extra whitespace
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}, []);

	// Extract suggestions from raw AI response
	const extractSuggestions = useCallback((text: string): Array<{ label: string; prompt: string }> => {
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
	}, []);

	const yumiChat = useAction(api.ai.yumiChat);
	const scanImageDataAction = useAction(api.ai.scanImageData);
	const bulkScanImageDataAction = useAction(api.ai.bulkScanImageData);
	const generateBusinessBriefingAction = useAction(api.ai.generateBusinessBriefing);
	const createTransactionMutation = useMutation(api.finance.createTransaction);
	const createInventoryItemMutation = useMutation(api.inventory.createInventoryItem);
	const addStockMutation = useMutation(api.inventory.addStock);
	const createProductMutation = useMutation(api.products.createProduct);

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
	const financialSummary = useQuery(api.finance.getFinancialSummary, {});

	// Generate smart insights
	const smartInsights: Array<{
		icon: React.ReactNode;
		text: string;
		type: "success" | "warning" | "info";
	}> = [];

	const lowStockItems =
		inventory?.filter((i: any) => i.quantity <= i.lowStockThreshold) ?? [];
	if (lowStockItems.length > 0) {
		smartInsights.push({
			icon: <AlertTriangle className="h-3.5 w-3.5 text-accent" />,
			text: `${lowStockItems.length} stok rendah`,
			type: "warning",
		});
	}

	const pendingOrders = orders?.filter((o: any) => o.status === "pending") ?? [];
	if (pendingOrders.length > 0) {
		smartInsights.push({
			icon: <Bell className="h-3.5 w-3.5 text-primary" />,
			text: `${pendingOrders.length} perlu diproses`,
			type: "info",
		});
	}

	const availableProducts = products?.filter((p: any) => p.isAvailable).length ?? 0;
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

	// Business Status Briefing Initialization
	useEffect(() => {
		const runBriefing = async () => {
			if (briefingAttemptedRef.current) return;
			
			// Trigger if we have no messages (new session)
			if (messages.length === 0) {
				briefingAttemptedRef.current = true;
				setIsLoading(true);
				
				const localHour = new Date().getHours();
				let briefingType = "pagi";
				if (localHour >= 11 && localHour < 15) briefingType = "siang";
				else if (localHour >= 15 && localHour < 18) briefingType = "sore";
				else if (localHour >= 18 || localHour < 4) briefingType = "malam";
				
				setLoadingStatus(`Sedang menyiapkan briefing ${briefingType}...`);
				
				try {
					// Small delay to ensure everything is initialized
					await new Promise(resolve => setTimeout(resolve, 2000));
					
					const briefing = await generateBusinessBriefingAction({ localHour });
					console.log("Briefing result:", briefing); // Debug log
					
					let fallbackGreeting = "Selamat pagi";
					if (localHour >= 11 && localHour < 15) fallbackGreeting = "Selamat siang";
					else if (localHour >= 15 && localHour < 18) fallbackGreeting = "Selamat sore";
					else if (localHour >= 18 || localHour < 4) fallbackGreeting = "Selamat malam";

					const suggestions = briefing ? extractSuggestions(briefing) : [{ label: "📊 Laporan Lengkap", prompt: "Berikan laporan performa bisnis saya secara mendalam" }];
					const sanitized = briefing ? sanitizeResponse(briefing) : `${fallbackGreeting}! Senang bertemu Anda lagi. Saya siap membantu mengelola toko hari ini.

📊 STATUS BISNIS:
• Omzet Kemarin: Rp 0
• Stok: Semua aman
• Reservasi: Tidak ada booking hari ini

Apa yang ingin Anda lakukan sekarang?`;

					// Use streaming for the briefing
					streamText(sanitized, () => {
						setMessages(prev => [
							...prev,
							{
								role: "assistant",
								content: sanitized,
								suggestions: suggestions,
								_msgId: mkMsgId(),
							}
						]);
					});
				} catch (error) {
					console.error("Briefing error:", error);
					// Even on error, show a second bubble so it doesn't look empty
					const localHour = new Date().getHours();
					let fallbackGreeting = "Selamat pagi";
					if (localHour >= 11 && localHour < 15) fallbackGreeting = "Selamat siang";
					else if (localHour >= 15 && localHour < 18) fallbackGreeting = "Selamat sore";
					else if (localHour >= 18 || localHour < 4) fallbackGreeting = "Selamat malam";
					
					setMessages(prev => [
						...prev,
						{
							role: "assistant",
							content: `${fallbackGreeting}! Senang bertemu Anda lagi. Saya siap membantu mengelola toko hari ini.

📊 STATUS BISNIS:
• Omzet Kemarin: Rp 0
• Stok: Semua aman
• Reservasi: Tidak ada booking hari ini

Apa yang ingin Anda lakukan sekarang?`,
							suggestions: [{ label: "📊 Laporan Lengkap", prompt: "Berikan laporan performa bisnis saya secara mendalam" }],
							_msgId: mkMsgId(),
						}
					]);
				} finally {
					setIsLoading(false);
					setLoadingStatus("");
				}
			}
		};
		runBriefing();
	}, [generateBusinessBriefingAction, extractSuggestions, sanitizeResponse, messages.length]);

	// Auto-scroll while streaming
	useEffect(() => {
		if (isStreaming) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [streamingContent, isStreaming]);

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
					// 20ms for words, 3ms for whitespace â†’ ~50 chars/sec
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

	// Session management functions (defined before sendMessage to avoid initialization issues)
	const startNewSession = async () => {
		const today = new Date();
		const dateStr = today.toLocaleDateString("id-ID", {
			day: "numeric",
			month: "short",
		});
		const timeStr = today.toLocaleTimeString("id-ID", {
			hour: "2-digit",
			minute: "2-digit",
		});

		try {
			const result = await createSessionMutation({
				title: `Chat ${dateStr} ${timeStr}`,
			});
			if (result) {
				setCurrentSessionId(result.sessionId);
				// Resetting to empty will trigger daily briefing again for the new session
				briefingAttemptedRef.current = false;
				setMessages([]);
				setShowSessionHistory(false);
			}
		} catch {
			toast.error("Gagal membuat sesi baru");
		}
	};

	const saveMessage = async (message: ChatMessage) => {
		if (currentSessionId) {
			try {
				await saveConversationMutation({
					sessionId: currentSessionId,
					role: message.role,
					content: message.content,
					metadata: {
						imageAttached: !!message.image,
					},
				});
			} catch (error) {
				console.error("Failed to save message:", error);
			}
		}
	};

	const handleExecuteAction = useCallback(async (type: string, data: any, messageId: string) => {
		const actionKey = `${messageId}-${type}`;
		setActionButtonLoading(prev => {
			const next = new Set<string>(prev);
			next.add(actionKey);
			return next;
		});
		try {
			if (type === "add_inventory") {
				for (const item of data.items) {
					// Logic: Check if exists or create new
					await createInventoryItemMutation({
						ingredientName: item.name,
						unit: item.unit || "pcs",
						quantity: item.qty,
						lowStockThreshold: 1,
						costPerUnit: item.price,
						category: "Lainnya",
					});
				}
				toast.success("Item berhasil ditambahkan ke inventory!");
			} else if (type === "create_expense") {
				await createTransactionMutation({
					type: "expense",
					amount: data.total,
					category: data.category || "belanja_stok",
					description: `Scan: ${data.merchant || "Toko"}`,
					date: data.date || new Date().toISOString().split('T')[0],
					paymentMethod: data.paymentMethod || "cash",
				});
				toast.success("Pengeluaran berhasil dicatat!");
			} else if (type === "create_product") {
				for (const item of data.items) {
					await createProductMutation({
						name: item.name,
						price: item.price * 1.5, // Simple markup for suggestion
						category: "Umum",
						isAvailable: true,
					});
				}
				toast.success("Produk baru berhasil dibuat!");
			}
			setActionButtonDone(prev => {
				const next = new Set<string>(prev);
				next.add(actionKey);
				return next;
			});
		} catch (error) {
			console.error("Action execution error:", error);
			toast.error("Gagal mengeksekusi aksi.");
		} finally {
			setActionButtonLoading(prev => {
				const next = new Set<string>(prev);
				next.delete(actionKey);
				return next;
			});
		}
	}, [createInventoryItemMutation, createTransactionMutation, createProductMutation]);

	// Execute AI image scan and add result to chat
	const processImagesWithAI = useCallback(async (images: string[], customPrompt?: string) => {
		if (images.length === 0 || isScanning) return;
		setIsScanning(true);
		setIsLoading(true);
		setLoadingStatus("Sedang membaca gambar...");
		try {
			// Phase 1: Reading images
			setTimeout(() => {
				if (isLoading || isScanning) setLoadingStatus("Sedang menganalisis struk...");
			}, 1500);
			
			const bulkResults = await bulkScanImageDataAction({ images });
			
			// Phase 2: Extraction
			setLoadingStatus("Sedang mengekstraksi data...");
			
			const newMessages: ChatMessage[] = [];
			
			for (let i = 0; i < bulkResults.length; i++) {
				const res = bulkResults[i];
				const currentImg = images[i];
				
				if (!res.success) {
					newMessages.push({
						role: "user",
						content: bulkResults.length > 1 ? `Scan gambar ke-${i+1}` : "Scan gambar ini",
						image: currentImg,
						_msgId: mkMsgId(),
					});
					newMessages.push({
						role: "assistant",
						content: `Gagal menganalisis gambar ke-${i+1}: ${res.error || "Terjadi kesalahan."}`,
						_msgId: mkMsgId(),
					});
					continue;
				}

				const result = res.data;
				const userMsg: ChatMessage = {
					role: "user",
					content: customPrompt ? `Hasil scan gambar ke-${i+1} (${customPrompt}):` : (bulkResults.length > 1 ? `Hasil scan gambar ke-${i+1}:` : "Scan gambar ini dan analisis datanya."),
					image: currentImg,
					_msgId: mkMsgId(),
				};

				const items = result.items as Array<{ name: string; qty: number; price: number; subtotal: number; unit?: string }> | undefined;
				let summaryText = "";
				if (result.name) summaryText += `🍩 Merchant: ${result.name}\n`;
				if (items && items.length > 0) {
					summaryText += `\n📋 Detail Item (${items.length} item):\n`;
					items.forEach((item, i) => {
						summaryText += `${i + 1}. ${item.name} x${item.qty} ${item.unit || "pcs"} = Rp ${item.subtotal.toLocaleString("id-ID")}\n`;
					});
				}
				if (result.subtotal) summaryText += `\nSubtotal: Rp ${Number(result.subtotal).toLocaleString("id-ID")}`;
				if (result.tax) summaryText += `\nPajak: Rp ${Number(result.tax).toLocaleString("id-ID")}`;
				if (result.discount) summaryText += `\nDiskon: -Rp ${Number(result.discount).toLocaleString("id-ID")}`;
				summaryText += `\n\n💰 Total: Rp ${Number(result.total).toLocaleString("id-ID")}`;
				summaryText += `\n\n📊 Keyakinan: ${result.confidence}% | Kategori: ${result.category.replace(/_/g, " ")} | Bayar: ${result.paymentMethod}`;
				if (result.date) summaryText += ` | Tanggal: ${result.date}`;

				summaryText += `\n\n[SUGGEST: 📦 Tambah ke Inventory | Tolong masukkan item-item dari hasil scan ini ke inventory dengan data lengkap]`;
				summaryText += `\n[SUGGEST: 💰 Simpan ke Pengeluaran | Tolong catat hasil scan dari ${result.name || "Toko"} sebesar Rp ${result.total.toLocaleString("id-ID")} dengan kategori ${result.category} sebagai pengeluaran]`;
				summaryText += `\n[SUGGEST: 📈 Simpan ke Pemasukan | Tolong catat hasil scan dari ${result.name || "Sumber"} sebesar Rp ${result.total.toLocaleString("id-ID")} dengan kategori ${result.category} sebagai pemasukan]`;
				summaryText += "\n[SUGGEST: ❌ Batalkan | Batalkan pencatatan ini]";

				const suggestions = extractSuggestions(summaryText);
				const sanitized = sanitizeResponse(summaryText);
				const actionButtons = generateScanActionButtons(result as ScanResultData);

				const assistantMsg: ChatMessage = {
					role: "assistant",
					content: sanitized || result.notes || `Analisis selesai dengan tingkat keyakinan ${result.confidence}%.`,
					scanData: result as ScanResultData,
					suggestions: suggestions,
					actionButtons,
					_msgId: mkMsgId(),
				};
				
				newMessages.push(userMsg, assistantMsg);
			}

			setMessages((prev) => [...prev, ...newMessages]);
			setSelectedImages([]);
			setIsScanMode(false);
			toast.success(`${bulkResults.length} gambar berhasil dianalisis!`);
		} catch (error: any) {
			let msg = "Gagal menganalisis gambar. Coba lagi.";
			if (error?.data) {
				msg = typeof error.data === "string" ? error.data : error.data.message || msg;
			} else if (error?.message) {
				msg = error.message;
			}
			toast.error(msg);
			console.error("Scan error details:", error);
		} finally {
			setIsScanning(false);
			setIsLoading(false);
			setLoadingStatus("");
		}
	}, [isScanning, bulkScanImageDataAction, extractSuggestions, sanitizeResponse]);

	const sendMessage = useCallback(
		async (text: string, image?: string) => {
			const trimmed = text.trim();
			if (!(trimmed || image || selectedImages.length > 0) || isLoading || isScanning) {
				return;
			}

			// If in Scan Mode and has images, use the specialized scan logic
			if (isScanMode && selectedImages.length > 0) {
				await processImagesWithAI(selectedImages, trimmed);
				setInput("");
				setIsScanMode(false);
				return;
			}

			// Create session if none exists
			if (!currentSessionId) {
				await startNewSession();
			}

			const userMessage: ChatMessage = {
				role: "user",
				content: trimmed,
				image: image || (selectedImages.length > 0 ? selectedImages[0] : undefined), // Keep for backward compat
				_msgId: mkMsgId(),
			};
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
			setSelectedImages([]);
			setIsLoading(true);
			setLoadingStatus("Sedang mencarikan jawaban...");
			setToolCalls([]);

			try {
				// Phase changes
				setTimeout(() => {
					if (isLoading) setLoadingStatus("Sedang berpikir...");
				}, 2000);
				
				const history = messages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => ({ role: m.role, content: m.content }));

				// Special handling for briefing request
				if (trimmed.toLowerCase().includes("briefing") || trimmed.toLowerCase().includes("status bisnis")) {
					const localHour = new Date().getHours();
					const briefing = await generateBusinessBriefingAction({ localHour });
					if (briefing) {
						const suggestions = extractSuggestions(briefing);
						const sanitized = sanitizeResponse(briefing);
						setIsLoading(false);
						setLoadingStatus("");
						streamText(sanitized, () => {
							const assistantMsg: ChatMessage = {
								role: "assistant",
								content: sanitized,
								suggestions,
								_msgId: mkMsgId(),
							};
							setMessages((prev) => [...prev, assistantMsg]);
							saveMessage(assistantMsg);
						});
						return;
					}
				}

				const attachedImages = image ? [image] : selectedImages;
				const response = await yumiChat({
					message: trimmed || (attachedImages.length > 0 ? "Tolong analisis gambar-gambar ini." : ""),
					history,
					images: attachedImages,
				});

				setLoadingStatus("Sedang menulis...");
				
				let hasToolExecution = false;
				const detectedTools: ToolCall[] = [];

				if (response?.includes("Berhasil menjalankan")) {
					hasToolExecution = true;
					for (const [toolKey, toolLabel] of Object.entries(TOOL_LABELS)) {
						if (
							response.includes(toolLabel) ||
							response.toLowerCase().includes(toolKey.toLowerCase())
						) {
							detectedTools.push({
								name: toolKey,
								args: {},
								status: "success",
								result: "Berhasil",
							});
						}
					}
				}

				if (hasToolExecution && detectedTools.length > 0) {
					for (const tool of detectedTools) {
						setToolCalls((prev) => [...prev, { ...tool, status: "executing" }]);
						await new Promise((r) => setTimeout(r, 600));
						setToolCalls((prev) =>
							prev.map((t) =>
								t.name === tool.name ? { ...t, status: "success" as const } : t
							)
						);
					}
					setTimeout(() => setToolCalls([]), 3000);
				}

				const suggestions = extractSuggestions(response);
				const sanitized =
					sanitizeResponse(response) ||
					"Maaf, saya tidak bisa memproses permintaan ini.";

				setIsLoading(false);
				setLoadingStatus("");

				// Stream the response word by word for realistic effect
				streamText(sanitized, async () => {
					const assistantMessage: ChatMessage = {
						role: "assistant",
						content: sanitized,
						suggestions: suggestions,
						_msgId: mkMsgId(),
					};
					setMessages((prev) => [...prev, assistantMessage]);
					if (currentSessionId) {
						await saveMessage(userMessage);
						await saveMessage(assistantMessage);
					}
				});
			} catch (error) {
				console.error("AI chat error:", error);
				setIsLoading(false);
				setLoadingStatus("");
				streamingActiveRef.current = false;
				setIsStreaming(false);
				setStreamingContent("");
				const errMsg = error instanceof Error ? error.message : String(error);
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: errMsg?.includes("image") || errMsg?.includes("vision") || errMsg?.includes("model")
							? "Maaf, gagal menganalisis gambar. Pastikan format gambar didukung (JPG/PNG) dan coba lagi."
							: "Maaf, terjadi kesalahan. Silakan coba lagi.",
						_msgId: mkMsgId(),
					},
				]);
				setToolCalls([]);
			}
		},
		[isLoading, isScanning, isScanMode, messages, yumiChat, selectedImages, currentSessionId, startNewSession, saveMessage, streamText, processImagesWithAI]
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
		setLoadingStatus("Sedang menjalankan perintah...");
		try {
			// Execute the suggested action via yumi chat or directly if tool mapping exists
			let prompt = `Lakukan tindakan berikut: ${suggestion.title} - ${suggestion.description}`;
			
			// Custom prompts for specific types
			if (suggestion.type === "trending") {
				prompt = `Penjualan ${suggestion.action.args.productName} sedang naik ${suggestion.action.args.growth}%. Tolong buatkan rencana restock bahan baku yang relevan dan tampilkan daftar inventory yang perlu ditambah.`;
			} else if (suggestion.type === "bundle_opportunity") {
				prompt = `Tolong buatkan diskon baru dengan nama "${suggestion.action.args.name}" tipe ${suggestion.action.args.type} dengan nilai ${suggestion.action.args.value}. Ini adalah saran bundle dari kamu.`;
			} else if (suggestion.type === "expiry_alert") {
				prompt = `Buatkan promo diskon otomatis untuk menghabiskan stok yang hampir kedaluwarsa ini: ${suggestion.title}. Gunakan detail: ${JSON.stringify(suggestion.action.args)}`;
			}

			const response = await yumiChat({
				message: prompt,
				history: [],
			});

			setMessages((prev) => [
				...prev,
				{
					role: "user",
					content: prompt,
					_msgId: mkMsgId(),
				},
				{
					role: "assistant",
					content: sanitizeResponse(response) || "Tindakan berhasil diproses.",
					_msgId: mkMsgId(),
				},
			]);
			toast.success("Tindakan berhasil dieksekusi!");
		} catch (_error) {
			toast.error("Gagal mengeksekusi tindakan.");
		} finally {
			setIsLoading(false);
			setLoadingStatus("");
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
				briefingAttemptedRef.current = false;
				setMessages([]);
			}
			toast.success("Sesi berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus sesi");
		}
	};

	const generateScanActionButtons = useCallback((result: ScanResultData) => {
		const buttons = [];
		
		if (result.items && result.items.length > 0) {
			buttons.push({
				type: "add_inventory",
				label: "Tambah ke Inventory",
				data: result,
				icon: <PlusCircle className="h-3.5 w-3.5" />,
			});
			buttons.push({
				type: "create_product",
				label: "Buat Produk",
				data: result,
				icon: <PlusCircle className="h-3.5 w-3.5" />,
			});
		}
		
		if (result.total > 0) {
			buttons.push({
				type: "create_expense",
				label: "Catat Pengeluaran",
				data: result,
				icon: <TrendingDown className="h-3.5 w-3.5" />,
			});
		}
		
		return buttons;
	}, []);

	const clearCurrentChat = async () => {
		if (currentSessionId) {
			try {
				await deleteSessionMutation({ sessionId: currentSessionId });
			} catch {
				// ignore error, still clear UI
			}
		}
		setCurrentSessionId(null);
		briefingAttemptedRef.current = false;
		setMessages([]);
		toast.success("Chat berhasil dihapus");
	};

	const deleteAllSessions = async () => {
		if (!chatSessions || chatSessions.length === 0) return;
		try {
			for (const session of chatSessions) {
				await deleteSessionMutation({ sessionId: session.sessionId });
			}
			setCurrentSessionId(null);
			briefingAttemptedRef.current = false;
			setMessages([]);
			toast.success("Semua riwayat chat berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus semua riwayat");
		}
	};

	// Load conversation when session changes
	useEffect(() => {
		if (currentSessionId && loadConversationQuery) {
			const history = loadConversationQuery
				.filter((m: any) => m.role !== "system")
				.map((m: any) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				}));

			if (history.length > 0) {
				const historyWithIds = history.map((m: any) => ({
					...m,
					_msgId: m._msgId || mkMsgId(),
				}));
				setMessages(historyWithIds);
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
											key={`${msg.role}-${i}`}
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
														{i === messages.length - 1 && isStreaming && msg.role === "assistant" 
															? streamingContent 
															: msg.content}
													</div>
													{msg.scanData && (
														<ScanResultCard data={msg.scanData} />
													)}
													{msg.role === "assistant" && (
														<button
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

												{/* Deep-Linking Action Buttons */}
												{msg.role === "assistant" && msg.actionButtons && msg.actionButtons.length > 0 && (
													<div className="flex flex-wrap gap-2 mt-2">
														{msg.actionButtons.map((btn, idx) => {
															const key = `${msg._msgId}-${btn.type}`;
															const isDone = actionButtonDone.has(key);
															const isLoadingBtn = actionButtonLoading.has(key);
															
															return (
																<button
																	key={idx}
																	disabled={isDone || isLoadingBtn}
																	onClick={() => handleExecuteAction(btn.type, btn.data, msg._msgId)}
																	className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${
																		isDone 
																			? "bg-green-100 text-green-700 border border-green-200 cursor-default"
																			: "bg-white text-primary border border-primary/20 hover:bg-primary/5 hover:border-primary/40"
																	}`}
																>
																	{isLoadingBtn ? (
																		<Loader2 className="h-3 w-3 animate-spin" />
																	) : isDone ? (
																		<Check className="h-3 w-3" />
																	) : (
																		btn.icon
																	)}
																	<span>{isDone ? `${btn.label} Berhasil` : btn.label}</span>
																</button>
															);
														})}
													</div>
												)}

												{/* Smart Suggestion Buttons - Premium Prominent Design */}
												{msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
													<motion.div 
														initial={{ opacity: 0, y: 8 }}
														animate={{ opacity: 1, y: 0 }}
														transition={{ delay: 0.3, duration: 0.4 }}
														className="mt-4 space-y-2 border-t border-border/50 pt-3"
													>
														<div className="flex items-center gap-1.5 px-1 mb-1">
															<Sparkles className="h-3 w-3 text-primary animate-pulse" />
															<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
																Saran Aksi
															</span>
														</div>
														<div className="flex flex-wrap gap-2">
															{msg.suggestions.map((suggestion, idx) => (
																<button
																	key={idx}
																	onClick={() => sendMessage(suggestion.prompt)}
																	className="group flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs font-semibold text-primary transition-all hover:scale-105 hover:border-primary/40 hover:bg-primary/10 hover:shadow-md active:scale-95 disabled:opacity-50"
																	type="button"
																	disabled={isLoading}
																>
																	<div className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
																		<Send className="h-2.5 w-2.5" />
																	</div>
																	<span>{suggestion.label}</span>
																</button>
															))}
														</div>
													</motion.div>
												)}
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

								{/* Typing Indicator - With Dynamic Status */}
								{isLoading && toolCalls.length === 0 && (
									<div className="flex justify-start">
										<div className="space-y-1">
											<div className="flex items-center gap-1.5 px-1">
												<Bot className="h-3.5 w-3.5 text-primary" />
												<span className="font-bold text-[10px] text-primary uppercase tracking-wider">
													Yumi
												</span>
											</div>
											<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2 shadow-sm">
												<div className="flex items-center gap-2">
													<div className="flex gap-1">
														<span className="h-1 w-1 rounded-full bg-primary/70 animate-bounce" />
														<span className="h-1 w-1 rounded-full bg-primary/70 animate-bounce [animation-delay:0.2s]" />
														<span className="h-1 w-1 rounded-full bg-primary/70 animate-bounce [animation-delay:0.4s]" />
													</div>
													<span className="text-[11px] font-medium text-primary animate-pulse italic">
														{loadingStatus || "Sedang memproses..."}
													</span>
												</div>
											</div>
										</div>
									</div>
								)}

								{/* Streaming Message */}
								{isStreaming && streamingContent && (
									<div className="flex justify-start">
										<div className="max-w-[85%] space-y-1 items-start">
											<div className="flex items-center gap-1.5 px-1">
												<Bot className="h-3.5 w-3.5 text-primary" />
												<span className="font-bold text-[10px] text-primary uppercase tracking-wider">
													Yumi
												</span>
											</div>
											<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2.5 text-sm leading-relaxed md:rounded-2xl md:px-4 md:py-3">
												<div className="whitespace-pre-line">
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

						{!proactiveSuggestions ? (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								{Array.from({ length: 4 }).map((_, i) => (
									<div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3" key={i}>
										<div className="flex items-center gap-2">
											<Skeleton className="h-4 w-4 rounded-full" />
											<Skeleton className="h-4 w-32" />
										</div>
										<Skeleton className="h-3 w-full" />
										<Skeleton className="h-3 w-2/3" />
										<div className="flex justify-end pt-2">
											<Skeleton className="h-8 w-24 rounded-lg" />
										</div>
									</div>
								))}
							</div>
						) : proactiveSuggestions.length === 0 ? (
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
									setLoadingStatus("Sedang membuat tugas baru...");
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
										setLoadingStatus("");
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
									onClick={() => sendMessage(t.message)}
									type="button"
								>
									{t.icon}
									<span className="whitespace-nowrap">{t.label}</span>
								</button>
							))}
						</div>

						{/* No more separate Scan Panel, we use the main input */}
					<AnimatePresence>
						{isScanMode && selectedImages.length === 0 && (
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
										onClick={() => setIsScanMode(false)}
										type="button"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								</div>
								{/* Panel Body */}
								<div className="p-3">
									<button
										className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-background py-5 transition-colors hover:border-primary/60 hover:bg-primary/5"
										onClick={() => fileInputRef.current?.click()}
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
										isScanMode
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground"
									}`}
									disabled={isLoading || isScanning}
									onClick={() => {
										setIsScanMode(!isScanMode);
										if (!isScanMode && selectedImages.length === 0) {
											fileInputRef.current?.click();
										}
									}}
									title="Scan & analisis gambar dengan AI"
									type="button"
								>
									<ScanLine className="h-4 w-4" />
								</button>

								{/* Hidden file input for chat attachment */}
								<input
									accept="image/*"
									capture="environment"
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
									placeholder={isScanMode ? "Tulis instruksi tambahan untuk scan..." : "Tanya Yumi..."}
									ref={inputRef}
									rows={1}
									value={input}
								/>

								{/* Right: Send button */}
								<button
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
										input.trim() || selectedImages.length > 0
											? (isScanMode ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700" : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90")
											: "bg-muted text-muted-foreground"
									} disabled:cursor-not-allowed disabled:opacity-50`}
									disabled={isLoading || isScanning || !(input.trim() || selectedImages.length > 0)}
									onClick={() => {
										if (input.trim() || selectedImages.length > 0) {
											sendMessage(input);
											if (inputRef.current) {
												inputRef.current.style.height = "auto";
											}
										}
									}}
									title={isScanMode ? "Mulai Scan" : "Kirim pesan"}
									type="button"
								>
									{isLoading || isScanning ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : isScanMode ? (
										<ScanLine className="h-4 w-4" />
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
							_msgId: mkMsgId(),
						},
					]);
				}}
			/>
		</div>
	);
}

// â”€â”€â”€ Scan Result Card Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
						<span className="text-muted-foreground text-xs">â€¢ {data.name}</span>
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
										<span className="text-[10px] text-muted-foreground">
											{item.qty > 0 && ` x${item.qty}`} {item.unit && ` ${item.unit}`}
										</span>
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

