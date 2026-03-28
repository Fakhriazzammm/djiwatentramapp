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
import { Button } from "@/components/ui/button";
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
	genericActions?: GenericActionButton[];
	_msgId: string;
}

interface GenericActionButton {
	id: string;
	label: string;
	prompt: string;
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
			.replace(/🚀 TOMBOL AKSI:[\s\S]*/, "")
			// Remove suggestions [SUGGEST: Label | Prompt] - will be parsed separately
			.replace(/\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
			.replace(/\[AKSI:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
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

	const extractGenericActions = useCallback((text: string): GenericActionButton[] => {
		const actions: GenericActionButton[] = [];
		const regex = /🚀 TOMBOL AKSI:([\s\S]*)/;
		const match = text.match(regex);

		if (match && match[1]) {
			const actionLines = match[1].trim().split('\n');
			actionLines.forEach((line, index) => {
				const actionMatch = line.match(/\*\s*(.*?)\s*\|\s*(.*)/);
				if (actionMatch) {
					actions.push({
						id: `gen-action-${Date.now()}-${index}`,
						label: actionMatch[1].trim(),
						prompt: actionMatch[2].trim(),
					});
				}
			});
		}

		return actions;
	}, []);

	const yumiChat = useAction(api.ai.yumiChat);
	const scanImageDataAction = useAction(api.ai.scanImageData);
	const bulkScanImageDataAction = useAction(api.ai.bulkScanImageData);
	const generateBusinessBriefingAction = useAction(api.ai.generateBusinessBriefing);
	const recordStockPurchaseMutation = useMutation(api.stockPurchases.recordStockPurchase);
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
					const sanitized = briefing ? sanitizeResponse(briefing) : `${fallbackGreeting}! Senang bertemu Anda lagi. Saya siap membantu mengelola toko hari ini.\n\n📊 STATUS BISNIS:\n• Omzet Kemarin: Rp 0\n• Stok: Semua aman\n• Reservasi: Tidak ada booking hari ini\n\nApa yang ingin Anda lakukan sekarang?`;

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
							content: `${fallbackGreeting}! Senang bertemu Anda lagi. Saya siap membantu mengelola toko hari ini.\n\n📊 STATUS BISNIS:\n• Omzet Kemarin: Rp 0\n• Stok: Semua aman\n• Reservasi: Tidak ada booking hari ini\n\nApa yang ingin Anda lakukan sekarang?`,
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
			if (type === "record_stock_purchase") {
        await recordStockPurchaseMutation({ purchaseData: data });
				toast.success("Pembelian berhasil dicatat dan stok telah diperbarui!");
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
	}, [recordStockPurchaseMutation, createProductMutation]);

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
				const genericActions = extractGenericActions(response);
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
						genericActions: genericActions,
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
		// Load messages for this session
		// This part is handled by the `loadConversationQuery` useEffect
	};

	useEffect(() => {
		if (loadConversationQuery) {
			const loadedMessages: ChatMessage[] = (loadConversationQuery as any).map((item: any) => ({
				role: item.role,
				content: item.content,
				_msgId: item._id,
				// Note: Suggestions/actions are not stored, they are generated on-the-fly
			}));
			setMessages(loadedMessages);
		}
	}, [loadConversationQuery]);

	const handleDeleteSession = async (sessionId: string) => {
		try {
			await deleteSessionMutation({ sessionId });
			if (currentSessionId === sessionId) {
				setCurrentSessionId(null);
				setMessages([]);
			}
			toast.success("Sesi berhasil dihapus.");
		} catch {
			toast.error("Gagal menghapus sesi.");
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage(input);
		}
	};

	// Focus input when switching to chat tab
	useEffect(() => {
		if (activeTab === "chat") {
			inputRef.current?.focus();
		}
	}, [activeTab]);

	return (
		<div className="flex h-[calc(100vh-57px)] bg-background">
			{/* Left Panel: Session History */}
			<AnimatePresence>
				{showSessionHistory && (
					<motion.div
						initial={{ x: "-100%", opacity: 0 }}
						animate={{ x: 0, opacity: 1 }}
						exit={{ x: "-100%", opacity: 0 }}
						transition={{ duration: 0.3, ease: "easeInOut" }}
						className="w-64 border-r bg-card flex flex-col"
					>
						<div className="p-4 border-b">
							<h2 className="text-lg font-semibold">Riwayat Chat</h2>
						</div>
						<div className="flex-1 overflow-y-auto">
							{chatSessions?.map((session) => (
								<div
									key={session.sessionId}
									className={`p-3 cursor-pointer hover:bg-muted ${currentSessionId === session.sessionId ? "bg-muted" : ""}`}
									onClick={() => loadSession(session.sessionId)}
								>
									<div className="flex justify-between items-center">
										<p className="text-sm font-medium truncate flex-1 pr-2">{session.title}</p>
										<Trash2
											className="h-4 w-4 text-muted-foreground hover:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												handleDeleteSession(session.sessionId);
											}}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										{new Date(session.createdAt).toLocaleString("id-ID")}
									</p>
								</div>
							))}
						</div>
						<div className="p-2 border-t">
							<Button variant="outline" className="w-full" onClick={startNewSession}>
								<PlusCircle className="h-4 w-4 mr-2" />
								Sesi Baru
							</Button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Main Chat Panel */}
			<div className="flex-1 flex flex-col">
				<header className="flex items-center justify-between p-4 border-b">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={() => setShowSessionHistory(!showSessionHistory)}>
							<Calendar className="h-5 w-5" />
						</Button>
						<div>
							<h1 className="text-xl font-bold">Yumi AI</h1>
							<p className="text-sm text-muted-foreground">Asisten bisnis pribadi Anda</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{smartInsights.map((insight, i) => (
							<div key={i} className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full
								${insight.type === "success" ? "bg-green-100 text-green-800" : ""}
								${insight.type === "warning" ? "bg-amber-100 text-amber-800" : ""}
								${insight.type === "info" ? "bg-blue-100 text-blue-800" : ""}`}
							>
								{insight.icon}
								{insight.text}
							</div>
						))}
					</div>
				</header>

				{/* Tab Navigation */}
				<div className="flex border-b">
					<TabButton name="chat" activeTab={activeTab} setActiveTab={setActiveTab} count={messages.length}>Chat</TabButton>
					<TabButton name="suggestions" activeTab={activeTab} setActiveTab={setActiveTab} count={proactiveSuggestions?.length}>Saran AI</TabButton>
					<TabButton name="predictions" activeTab={activeTab} setActiveTab={setActiveTab} count={5}>Prediksi</TabButton>
					<TabButton name="tasks" activeTab={activeTab} setActiveTab={setActiveTab} count={pendingTasks?.length}>Tugas</TabButton>
				</div>

				{/* Content Area */}
				<div className="flex-1 overflow-hidden">
					<AnimatePresence mode="wait">
						<motion.div
							key={activeTab}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.2 }}
							className="h-full"
						>
							{activeTab === "chat" && (
								<div className="flex flex-col h-full">
									{/* Chat Messages */}
									<div className="flex-1 overflow-y-auto p-6 space-y-6">
										{messages.map((msg, index) => (
											<div key={msg._msgId} className={`flex items-start gap-4 ${msg.role === "user" ? "justify-end" : ""}`}>
												{msg.role === "assistant" && (
													<div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
														<Bot className="h-5 w-5 text-primary" />
													</div>
												)}
												<div className={`max-w-2xl w-fit rounded-lg px-4 py-3 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
													{msg.image && (
														<div className="mb-2">
															<img src={msg.image} alt="Lampiran" className="rounded-lg max-h-48" />
														</div>
													)}
													<p className="whitespace-pre-wrap text-sm">
														{index === messages.length - 1 && isStreaming && msg.role === "assistant"
															? streamingContent
															: msg.content}
														{index === messages.length - 1 && isLoading && !isStreaming && msg.role === "assistant" && (
															<Loader2 className="h-4 w-4 animate-spin inline-block ml-2" />
														)}
													</p>
													{msg.suggestions && msg.suggestions.length > 0 && (
														<div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
															{msg.suggestions.map((s, i) => (
																<button
																	key={i}
																	onClick={() => sendMessage(s.prompt)}
																	className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-white active:scale-95 border border-primary/20"
																>
																	{s.label}
																</button>
															))}
														</div>
													)}
													{msg.genericActions && msg.genericActions.length > 0 && (
														<div className="mt-2 pt-2 border-t border-border">
															<p className="text-xs font-medium text-muted-foreground mb-2">🚀 TOMBOL AKSI:</p>
															<div className="flex flex-wrap gap-2">
																{msg.genericActions.map((action) => (
																	<Button
																		key={action.id}
																		variant="outline"
																		size="sm"
																		className="text-xs h-auto py-1 px-2"
																		onClick={() => sendMessage(action.prompt)}
																	>
																		{action.label}
																	</Button>
																))}
															</div>
														</div>
													)}
													{msg.role === "assistant" && (
														<div className="mt-2 flex items-center gap-2">
															<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(msg.content, index)}>
																{copiedIndex === index ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
															</Button>
														</div>
													)}
												</div>
											</div>
										))}
										{isLoading && (
											<div className="flex items-start gap-4">
												<div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
													<Bot className="h-5 w-5 text-primary" />
												</div>
												<div className="max-w-2xl w-fit rounded-lg px-4 py-3 bg-muted">
													<div className="flex items-center gap-2 text-sm">
														<Loader2 className="h-4 w-4 animate-spin" />
														<span>{loadingStatus || "Sedang berpikir..."}</span>
													</div>
												</div>
											</div>
										)}
										<div ref={messagesEndRef} />
									</div>

									{/* Chat Input */}
									<div className="p-4 border-t bg-background">
										{/* Templates */}
										{!isScanMode && messages.length <= 1 && (
											<div className="mb-3 flex flex-wrap items-center gap-2">
												{TEMPLATES.map((template, i) => (
													<button
														key={i}
														onClick={() => sendMessage(template.message)}
														className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted-foreground/20"
													>
														{template.icon}
														{template.label}
													</button>
												))}
											</div>
										)}

										{/* Tool Calls UI */}
										{toolCalls.length > 0 && (
											<div className="mb-2 p-2 border rounded-lg bg-muted/50">
												<p className="text-xs font-semibold mb-1">Tool Execution:</p>
												<div className="flex flex-wrap gap-2">
													{toolCalls.map((tool, i) => (
														<div key={i} className="flex items-center gap-1.5 text-xs bg-background border rounded-md px-2 py-1">
															{tool.status === "executing" && <Loader2 className="h-3 w-3 animate-spin" />}
															{tool.status === "success" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
															{tool.status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
															<span>{TOOL_LABELS[tool.name] || tool.name}</span>
														</div>
													))}
												</div>
											</div>
										)}

										{/* Selected Images Preview */}
										{selectedImages.length > 0 && (
											<div className="mb-2 p-2 border rounded-lg">
												<div className="flex items-center justify-between mb-1">
													<p className="text-xs font-semibold">Lampiran ({selectedImages.length})</p>
													<Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRemoveImage}>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
												<div className="flex gap-2 overflow-x-auto">
													{selectedImages.map((img, i) => (
														<img key={i} src={img} className="h-16 w-16 object-cover rounded-md" />
													))}
												</div>
											</div>
										)}

										<div className="relative">
											<textarea
												ref={inputRef}
												value={input}
												onChange={(e) => setInput(e.target.value)}
												onKeyDown={handleKeyDown}
												placeholder={isScanMode ? "Ketikkan instruksi untuk gambar yang di-scan..." : "Ketik pesan atau / untuk melihat perintah..."}
												className="w-full resize-none rounded-lg border py-3 pl-12 pr-20 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
												rows={1}
											/>
											<div className="absolute inset-y-0 left-0 flex items-center pl-3">
												<Button variant={isScanMode ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setIsScanMode(!isScanMode)}>
													<ScanLine className={`h-5 w-5 ${isScanMode ? "" : "text-muted-foreground"}`} />
												</Button>
												<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
													<Camera className="h-5 w-5 text-muted-foreground" />
												</Button>
												<input
													type="file"
													ref={fileInputRef}
													className="hidden"
													accept="image/*"
													multiple
													onChange={handleFileSelect}
												/>
											</div>
											<div className="absolute inset-y-0 right-0 flex items-center pr-3">
												<Button
													type="submit"
													size="icon"
													className="h-8 w-8"
													onClick={() => sendMessage(input)}
													disabled={isLoading || isScanning || (!input.trim() && selectedImages.length === 0)}
												>
													<Send className="h-4 w-4" />
												</Button>
											</div>
										</div>
									</div>
								</div>
							)}
							{activeTab === "suggestions" && <SuggestionsPanel suggestions={proactiveSuggestions} onExecute={handleExecuteSuggestion} />}
							{activeTab === "predictions" && (
								<PredictionsPanel
									stockPredictions={stockPredictions}
									busyHours={busyHoursPrediction}
									revenue={revenuePrediction}
									trending={trendingProducts}
									promoTime={bestPromoTime}
								/>
							)}
							{activeTab === "tasks" && <TasksPanel tasks={pendingTasks} onComplete={handleCompleteTask} onDismiss={handleDismissTask} />}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}

// ... Rest of the components (TabButton, SuggestionsPanel, etc.) remain the same

const TabButton = ({ name, activeTab, setActiveTab, count, children }: { name: TabType, activeTab: TabType, setActiveTab: (t: TabType) => void, count?: number, children: React.ReactNode }) => (
	<button
		onClick={() => setActiveTab(name)}
		className={`px-4 py-2 text-sm font-medium relative ${activeTab === name ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:bg-muted"}`}
	>
		{children}
		{count !== undefined && count > 0 && (
			<span className="absolute top-1 right-1 h-4 w-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
				{count}
			</span>
		)}
	</button>
);

const SuggestionsPanel = ({ suggestions, onExecute }: { suggestions: any, onExecute: (s: Suggestion) => void }) => {
	if (!suggestions || suggestions.length === 0) {
		return <div className="p-6 text-center text-muted-foreground">Tidak ada saran untuk saat ini.</div>;
	}
	return (
		<div className="p-6 space-y-4 overflow-y-auto h-full">
			{suggestions.map((s: Suggestion) => (
				<div key={s.id} className="p-4 border rounded-lg bg-card">
					<div className="flex justify-between items-start">
						<div>
							<p className="font-semibold">{s.title}</p>
							<p className="text-sm text-muted-foreground">{s.description}</p>
						</div>
						<span className={`text-xs font-bold px-2 py-1 rounded-full ${
							s.priority === "high" ? "bg-red-100 text-red-800" :
							s.priority === "medium" ? "bg-yellow-100 text-yellow-800" :
							"bg-blue-100 text-blue-800"
						}`}>
							{s.priority}
						</span>
					</div>
					{s.action && (
						<div className="mt-3 pt-3 border-t">
							<Button size="sm" onClick={() => onExecute(s)}>Jalankan Aksi</Button>
						</div>
					)}
				</div>
			))}
		</div>
	);
};

const PredictionsPanel = ({ stockPredictions, busyHours, revenue, trending, promoTime }: { stockPredictions: any, busyHours: any, revenue: any, trending: any, promoTime: any }) => (
	<div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto h-full">
		<PredictionCard title="Prediksi Stok Habis (7 Hari)">
			{stockPredictions?.length > 0 ? (
				<ul className="space-y-2">
					{stockPredictions.map((p: any) => (
						<li key={p.productId} className="text-sm flex justify-between">
							<span>{p.productName}</span>
							<span className="font-bold">sisa {p.currentStock}</span>
						</li>
					))}
				</ul>
			) : <p className="text-sm text-muted-foreground">Stok aman.</p>}
		</PredictionCard>
		<PredictionCard title="Prediksi Jam Sibuk Hari Ini">
			{busyHours?.length > 0 ? (
				<p className="text-sm">{busyHours.join(", ")}</p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>
		<PredictionCard title="Prediksi Pendapatan (7 Hari)">
			{revenue ? (
				<p className="text-2xl font-bold text-green-600">Rp {revenue.predictedRevenue.toLocaleString("id-ID")}</p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>
		<PredictionCard title="Produk Tren (7 Hari)">
			{trending?.length > 0 ? (
				<ul className="space-y-2">
					{trending.map((p: any) => (
						<li key={p.productId} className="text-sm flex justify-between">
							<span>{p.productName}</span>
							<span className="font-bold text-green-600">+{p.growthPercentage}%</span>
						</li>
					))}
				</ul>
			) : <p className="text-sm text-muted-foreground">Tidak ada tren signifikan.</p>}
		</PredictionCard>
		<PredictionCard title="Waktu Promo Terbaik">
			{promoTime ? (
				<p className="text-sm">Hari: <span className="font-bold">{promoTime.bestDay}</span>, Jam: <span className="font-bold">{promoTime.bestHour}:00</span></p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>
	</div>
);

const PredictionCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
	<div className="p-4 border rounded-lg bg-card">
		<h3 className="font-semibold mb-2">{title}</h3>
		{children}
	</div>
);

const TasksPanel = ({ tasks, onComplete, onDismiss }: { tasks: any, onComplete: (id: string) => void, onDismiss: (id: string) => void }) => {
	if (!tasks || tasks.length === 0) {
		return <div className="p-6 text-center text-muted-foreground">Tidak ada tugas yang perlu ditindaklanjuti.</div>;
	}
	return (
		<div className="p-6 space-y-4 overflow-y-auto h-full">
			{tasks.map((task: any) => (
				<div key={task._id} className="p-4 border rounded-lg bg-card flex justify-between items-center">
					<div>
						<p className="font-semibold">{task.title}</p>
						<p className="text-sm text-muted-foreground">{task.description}</p>
					</div>
					<div className="flex gap-2">
						<Button size="sm" variant="outline" onClick={() => onComplete(task._id)}>Selesai</Button>
						<Button size="sm" variant="ghost" onClick={() => onDismiss(task._id)}>Abaikan</Button>
					</div>
				</div>
			))}
		</div>
	);
};
