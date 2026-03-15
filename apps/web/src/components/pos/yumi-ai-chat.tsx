import { api } from "@yumipos/backend/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import {
	ArrowUpCircle,
	BarChart2,
	Bot,
	Camera,
	Check,
	Copy,
	Loader2,
	PlusCircle,
	ScanLine,
	Send,
	ShoppingCart,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Wallet,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageScanner } from "@/components/ai/image-scanner";
import { ScanEditModal, type ScanEditParams } from "@/components/scan/scan-edit-modal";
import { ScanSplitModal } from "@/components/scan/scan-split-modal";
import { useScanHistory } from "@/components/scan/scan-history-panel";

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
	actionButtons?: ScanActionButton[];
}

const CASIER_TEMPLATES = [
	{
		label: "Pemasukan",
		message: "Saya ingin mencatat pemasukan",
		icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
		category: "income",
	},
	{
		label: "Pengeluaran",
		message: "Saya ingin mencatat pengeluaran",
		icon: <TrendingDown className="h-3.5 w-3.5 text-destructive" />,
		category: "expense",
	},
	{
		label: "Stok Habis",
		message: "Item stok apa saja yang hampir habis?",
		icon: <ShoppingCart className="h-3.5 w-3.5 text-accent" />,
		category: "stock",
	},
	{
		label: "Rekap Hari Ini",
		message: "Berikan rekap penjualan hari ini",
		icon: <Wallet className="h-3.5 w-3.5 text-primary" />,
		category: "report",
	},
	{
		label: "Tambah Stok",
		message: "Saya ingin menambah stok item",
		icon: <PlusCircle className="h-3.5 w-3.5 text-primary" />,
		category: "stock",
	},
	{
		label: "Laporan Kas",
		message: "Bagaimana kondisi kas hari ini?",
		icon: <ArrowUpCircle className="h-3.5 w-3.5 text-primary" />,
		category: "report",
	},
	{
		label: "Laba Rugi",
		message: "Berikan ringkasan laba rugi hari ini: pendapatan, HPP, beban, dan laba bersih",
		icon: <BarChart2 className="h-3.5 w-3.5 text-green-600" />,
		category: "report",
	},
];

export function YumiAIChat() {
	const [messages, setMessages] = useState<ChatMessage[]>(() => {
		const hour = new Date().getHours();
		let greeting = "Halo! Selamat pagi";
		if (hour >= 11 && hour < 15) greeting = "Halo! Selamat siang";
		else if (hour >= 15 && hour < 18) greeting = "Halo! Selamat sore";
		else if (hour >= 18 || hour < 4) greeting = "Halo! Selamat malam";

		return [
			{
				role: "assistant",
				content:
					`${greeting}! Saya Yumi, asisten AI kamu. Pilih template di bawah atau ketik pesan untuk mencatat transaksi, cek stok, atau lihat laporan.`,
			},
		];
	});
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

	const [isImageScannerOpen, setIsImageScannerOpen] = useState(false);
	const [selectedImages, setSelectedImages] = useState<string[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [actionButtonDone, setActionButtonDone] = useState<Set<string>>(new Set());
	const [actionButtonLoading, setActionButtonLoading] = useState<Set<string>>(new Set());

	// Edit / Split modals
	const [editModal, setEditModal] = useState<{ params: ScanEditParams; btnKey: string; messageIdx: number } | null>(null);
	const [splitModal, setSplitModal] = useState<{ params: ScanEditParams; btnKey: string } | null>(null);
	const { addEntry: addScanHistory, markSaved: markScanSaved } = useScanHistory();

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const briefingAttemptedRef = useRef(false);

	const yumiChat = useAction(api.ai.yumiChat);
	const bulkScanImageDataAction = useAction(api.ai.bulkScanImageData);
	const generateDailyBriefingAction = useAction(api.ai.generateDailyBriefing);
	const createTransactionMutation = useMutation(api.finance.createTransaction);

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

	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const streamingActiveRef = useRef(false);

	// Scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Auto-scroll while streaming
	useEffect(() => {
		if (isStreaming) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [streamingContent, isStreaming]);

	const sanitizeResponse = (text: string): string => {
		if (!text) return "";
		return text
			.replace(/\[SUGGEST:\s*(.*?)\s*\|\s*(.*?)\s*\]/g, "")
			.replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
			.replace(/\*(.*?)\*/g, "$1") // Remove italic
			.replace(/__(.*?)__/g, "$1") // Remove underscore bold
			.replace(/_(.*?)_/g, "$1") // Remove underscore italic
			.replace(/^#+\s+/gm, "") // Remove headers
			.replace(/^\*\s+/gm, "• ")
			.replace(/^\-\s+/gm, "• ")
			.replace(/```[\s\S]*?```/g, "") // Remove code blocks
			.replace(/`(.*?)`/g, "$1") // Remove inline code
			.replace(/^\d+\.\s+/gm, "")
			.replace(/_/g, " ") // Final pass: replace any remaining underscores with spaces
			.replace(/\*/g, "") // Final pass: remove any remaining asterisks
			.replace(/\n{3,}/g, "\n\n")
			.trim();
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
		
		// Parse date from scanData.date (AI extracted) or fallback to current time
		let dateTs = Date.now();
		if (scanData.date) {
			const parsedDate = new Date(scanData.date);
			if (!Number.isNaN(parsedDate.getTime())) {
				dateTs = parsedDate.getTime();
			}
		}

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
		if (scanData.type === "product" || ["belanja_stok", "peralatan_kantor"].includes(scanData.category)) {
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
	const streamText = useCallback((text: string, onComplete: () => void) => {
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
				// 20ms for words, 3ms for whitespace
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
	}, []);

	// Execute AI image scan and add result to chat
	const handleRunScan = useCallback(async (images: string[]) => {
		if (images.length === 0 || isScanning) return;
		setIsScanning(true);
		try {
			const bulkResults = await bulkScanImageDataAction({ images });
			
			const newMessages: ChatMessage[] = [];
			
			for (let i = 0; i < bulkResults.length; i++) {
				const res = bulkResults[i];
				const currentImg = images[i];
				
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
					items.forEach((item: { name: string; qty: number; price: number; subtotal: number }, idx: number) => {
						summaryText += `${idx + 1}. ${item.name} x${item.qty} = Rp ${item.subtotal.toLocaleString("id-ID")}\n`;
					});
				}
				if (result.subtotal) summaryText += `\nSubtotal: Rp ${Number(result.subtotal).toLocaleString("id-ID")}`;
				if (result.tax) summaryText += `\nPajak: Rp ${Number(result.tax).toLocaleString("id-ID")}`;
				if (result.discount) summaryText += `\nDiskon: -Rp ${Number(result.discount).toLocaleString("id-ID")}`;
				summaryText += `\n\n💰 Total: Rp ${Number(result.total).toLocaleString("id-ID")}`;
				summaryText += `\n\n📊 Keyakinan: ${result.confidence}% | Kategori: ${result.category.replace(/_/g, " ")} | Bayar: ${result.paymentMethod}`;
				if (result.date) summaryText += ` | Tanggal: ${result.date}`;

				const sanitized = sanitizeResponse(summaryText);
				const actionButtons = generateScanActionButtons(result as ScanResultData);

				const assistantMsg: ChatMessage = {
					role: "assistant",
					content: sanitized || result.notes || `Analisis selesai dengan tingkat keyakinan ${result.confidence}%.`,
					scanData: result as ScanResultData,
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
			setIsImageScannerOpen(false);
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
		} finally {
			setIsScanning(false);
		}
	}, [isScanning, bulkScanImageDataAction, addScanHistory]);

	const sendMessage = useCallback(
		async (text: string, image?: string) => {
			if ((!text.trim() && !image) || isLoading) return;

			const userMessage: ChatMessage = {
				role: "user",
				content: text.trim(),
				image,
			};
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
			setSelectedImages([]);
			setIsLoading(true);

			try {
				const history = messages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => ({ role: m.role, content: m.content }));

				const response = await yumiChat({
					message: text.trim(),
					image,
					history,
				});

				const sanitized =
					sanitizeResponse(response) ||
					"Maaf, saya tidak bisa memproses permintaan ini.";

				setIsLoading(false);

				// Stream the response word by word
				streamText(sanitized, () => {
					setMessages((prev) => [
						...prev,
						{
							role: "assistant",
							content: sanitized,
						},
					]);
				});
			} catch (error) {
				console.error("AI chat error:", error);
				setIsLoading(false);
				streamingActiveRef.current = false;
				setIsStreaming(false);
				setStreamingContent("");
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
					},
				]);
			}
		},
		[isLoading, messages, yumiChat, streamText]
	);

	const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length === 0) return;

		files.forEach(file => {
			if (!file.type.startsWith("image/")) return;
			const reader = new FileReader();
			reader.onload = (event) => {
				setSelectedImages(prev => [...prev, event.target?.result as string]);
			};
			reader.readAsDataURL(file);
		});
		e.target.value = '';
	}, []);

	// Daily Morning Briefing
	useEffect(() => {
		const runBriefing = async () => {
			if (briefingAttemptedRef.current) return;

			// Trigger if we have at least one message and it's from assistant
			if (messages.length > 0 && messages[0].role === "assistant") {
				briefingAttemptedRef.current = true;
				setIsLoading(true);
				try {
					// Small delay to ensure everything is initialized
					await new Promise(resolve => setTimeout(resolve, 1500));

					const localHour = new Date().getHours();
					const briefing = await generateDailyBriefingAction({ localHour });
					
					let fallbackGreeting = "Selamat pagi";
					if (localHour >= 11 && localHour < 15) fallbackGreeting = "Selamat siang";
					else if (localHour >= 15 && localHour < 18) fallbackGreeting = "Selamat sore";
					else if (localHour >= 18 || localHour < 4) fallbackGreeting = "Selamat malam";

					const contentToStream = briefing ? sanitizeResponse(briefing) : `${fallbackGreeting}! Saya siap membantu Anda mengelola toko hari ini.`;
					
					// Append the briefing as the second message
					streamText(contentToStream, () => {
						setMessages(prev => [
							...prev,
							{
								role: "assistant",
								content: contentToStream,
							}
						]);
					});
				} catch (error) {
					console.error("Briefing error:", error);
					// Even on error, show a second bubble
					const localHour = new Date().getHours();
					let fallbackGreeting = "Selamat pagi";
					if (localHour >= 11 && localHour < 15) fallbackGreeting = "Selamat siang";
					else if (localHour >= 15 && localHour < 18) fallbackGreeting = "Selamat sore";
					else if (localHour >= 18 || localHour < 4) fallbackGreeting = "Selamat malam";
					
					setMessages(prev => [
						...prev,
						{
							role: "assistant",
							content: `${fallbackGreeting}! Saya siap membantu Anda mengelola toko hari ini.`,
						}
					]);
				} finally {
					setIsLoading(false);
				}
			}
		};
		runBriefing();
	}, [generateDailyBriefingAction, messages.length]);

	return (
		<div className="flex h-full flex-col bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-sm">
						<Sparkles className="h-4 w-4 text-white" />
					</div>
					<div>
						<h3 className="font-bold text-sm">Yumi AI Chat</h3>
						<p className="text-[10px] text-muted-foreground">Asisten kasir cerdas</p>
					</div>
				</div>
				<Button
					size="icon"
					variant="ghost"
					className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
					onClick={() => setIsImageScannerOpen(true)}
				>
					<ScanLine className="h-4 w-4" />
				</Button>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-3 space-y-4">
				{messages.map((msg, i) => (
					<div
						className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
						key={`${msg.role}-${i}`}
					>
						<div
							className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
								msg.role === "user"
									? "rounded-tr-none bg-primary text-primary-foreground"
									: "rounded-tl-none border border-border bg-card text-foreground"
							}`}
						>
							{msg.role === "assistant" && (
								<div className="flex items-center gap-1.5 mb-1.5">
									<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
										<Bot className="h-3 w-3 text-primary" />
									</div>
									<span className="font-bold text-[10px] text-primary uppercase tracking-wider">Yumi</span>
								</div>
							)}
							
							{msg.image && (
								<div className="mb-2 overflow-hidden rounded-lg border border-white/20 shadow-sm">
									<img src={msg.image} alt="Upload" className="max-h-48 w-full object-cover" />
								</div>
							)}

							<div className="whitespace-pre-line">
								{i === messages.length - 1 && isStreaming && msg.role === "assistant" 
									? streamingContent 
									: msg.content}
							</div>

							{msg.actionButtons && msg.actionButtons.length > 0 && (
								<div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
									{msg.actionButtons.map((btn) => {
										const btnKey = `${i}-${btn.id}`;
										const isDone = actionButtonDone.has(btnKey);
										const isBtnLoading = actionButtonLoading.has(btnKey);
										
										return (
											<button
												key={btn.id}
												disabled={isDone || isBtnLoading}
												onClick={() => handleScanActionButton(btn, i)}
												className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all active:scale-95 ${
													isDone 
														? "bg-green-500/10 text-green-600 border border-green-500/20" 
														: "bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20"
												}`}
											>
												{isBtnLoading ? (
													<Loader2 className="h-3 w-3 animate-spin" />
												) : isDone ? (
													<Check className="h-3 w-3" />
												) : (
													<span>{btn.icon}</span>
												)}
												{isDone ? "Tersimpan" : btn.label}
											</button>
										);
									})}
								</div>
							)}

							{msg.role === "assistant" && (
								<div className="mt-2 flex items-center gap-2">
									<button
										className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
								</div>
							)}
						</div>
					</div>
				))}

				{/* Loading indicator */}
				{isLoading && !isStreaming && (
					<div className="flex justify-start">
						<div className="rounded-2xl rounded-tl-none border border-border bg-card px-3.5 py-2.5 shadow-sm">
							<div className="flex items-center gap-2">
								<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
									<Loader2 className="h-3 w-3 animate-spin text-primary" />
								</div>
								<span className="text-[10px] font-medium text-muted-foreground">Yumi sedang berpikir...</span>
							</div>
						</div>
					</div>
				)}

				{/* Streaming Message */}
				{isStreaming && streamingContent && (
					<div className="flex justify-start">
						<div className="max-w-[90%] rounded-2xl rounded-tl-none border border-border bg-card px-3.5 py-2.5 text-xs leading-relaxed shadow-sm">
							<div className="flex items-center gap-1.5 mb-1.5">
								<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
									<Bot className="h-3 w-3 text-primary" />
								</div>
								<span className="font-bold text-[10px] text-primary uppercase tracking-wider">Yumi</span>
							</div>
							<div className="whitespace-pre-line">
								{streamingContent}
								<span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary" />
							</div>
						</div>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input Area */}
			<div className="shrink-0 border-t border-border bg-muted/5 p-3">
				{/* Selected Images Preview */}
				{selectedImages.length > 0 && (
					<div className="mb-2 flex flex-wrap gap-2">
						{selectedImages.map((img, idx) => (
							<div key={idx} className="relative h-12 w-12 overflow-hidden rounded-lg border border-border shadow-sm group">
								<img src={img} alt="Preview" className="h-full w-full object-cover" />
								<button
									onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
									className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
								>
									<X className="h-2.5 w-2.5" />
								</button>
							</div>
						))}
					</div>
				)}

				{/* Templates */}
				<div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
					{CASIER_TEMPLATES.map((t) => (
						<button
							className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-medium text-muted-foreground transition-all hover:border-primary hover:bg-primary/5 hover:text-primary disabled:opacity-50 shadow-sm"
							disabled={isLoading || isStreaming}
							key={t.label}
							onClick={() => sendMessage(t.message)}
							type="button"
						>
							{t.icon}
							<span className="whitespace-nowrap">{t.label}</span>
						</button>
					))}
				</div>

				{/* Input Box */}
				<div className="relative flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50 transition-colors">
					<input
						type="file"
						ref={fileInputRef}
						onChange={handleFileSelect}
						accept="image/*"
						multiple
						className="hidden"
					/>
					<button
						type="button"
						disabled={isLoading || isStreaming}
						onClick={() => fileInputRef.current?.click()}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
					>
						<Camera className="h-4 w-4" />
					</button>
					
					<textarea
						className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent px-1 py-1.5 text-xs outline-none placeholder:text-muted-foreground disabled:opacity-50"
						disabled={isLoading || isStreaming}
						onChange={(e) => {
							setInput(e.target.value);
							e.target.style.height = "auto";
							e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (input.trim() || selectedImages.length > 0) {
									sendMessage(input, selectedImages[0]);
								}
							}
						}}
						placeholder="Tanya Yumi atau kirim foto nota..."
						ref={inputRef}
						rows={1}
						value={input}
					/>
					<button
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all shadow-sm ${
							input.trim() || selectedImages.length > 0
								? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md"
								: "bg-muted text-muted-foreground"
						} disabled:opacity-50`}
						disabled={isLoading || isStreaming || (!input.trim() && selectedImages.length === 0)}
						onClick={() => {
							if (input.trim() || selectedImages.length > 0) {
								sendMessage(input, selectedImages[0]);
							}
						}}
						type="button"
					>
						{isLoading || isStreaming ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</button>
				</div>

				<p className="mt-2 text-center text-[9px] text-muted-foreground italic">
					Yumi AI dapat membuat kesalahan. Verifikasi data penting.
				</p>
			</div>

			{/* Modals */}
			<ImageScanner
				isOpen={isImageScannerOpen}
				onClose={() => setIsImageScannerOpen(false)}
				onScan={handleRunScan}
			/>

			{editModal && (
				<ScanEditModal
					isOpen={!!editModal}
					onClose={() => setEditModal(null)}
					onSave={handleSaveFromEditModal}
					onSplit={() => setSplitModal({ params: editModal.params, btnKey: editModal.btnKey })}
					params={editModal.params}
				/>
			)}

			{splitModal && (
				<ScanSplitModal
					isOpen={!!splitModal}
					onClose={() => setSplitModal(null)}
					onSave={handleSaveFromSplitModal}
					params={splitModal.params}
				/>
			)}
		</div>
	);
}
