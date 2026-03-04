import { api } from "@yumipos/backend/convex/_generated/api";
import { useAction } from "convex/react";
import {
	ArrowUpCircle,
	Bot,
	Loader2,
	PlusCircle,
	Send,
	ShoppingCart,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
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
];

export function YumiAIChat() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			role: "assistant",
			content:
				"Halo! Saya Yumi, asisten AI kamu. Pilih template di bawah atau ketik pesan untuk mencatat transaksi, cek stok, atau lihat laporan.",
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const streamingActiveRef = useRef(true);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const yumiChat = useAction(api.ai.yumiChat);

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
			.replace(/\*\*(.*?)\*\*/g, "$1")
			.replace(/\*(.*?)\*/g, "$1")
			.replace(/^#+\s+/gm, "")
			.replace(/^\*\s+/gm, "• ")
			.replace(/^\-\s+/gm, "• ")
			.replace(/```[\s\S]*?```/g, "")
			.replace(/`(.*?)`/g, "$1")
			.replace(/^\d+\.\s+/gm, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
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

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || isLoading) return;

			const userMessage: ChatMessage = {
				role: "user",
				content: text.trim(),
			};
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
			setIsLoading(true);

			try {
				const history = messages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => ({ role: m.role, content: m.content }));

				const response = await yumiChat({
					message: text.trim(),
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

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
					<Sparkles className="h-4 w-4 text-white" />
				</div>
				<div>
					<h3 className="font-bold text-sm">Yumi AI Chat</h3>
					<p className="text-[10px] text-muted-foreground">
						Asisten kasir cerdas
					</p>
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				{messages.map((msg, i) => (
					<div
						className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
						key={`${msg.role}-${i}`}
					>
						<div
							className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
								msg.role === "user"
									? "rounded-tr-none bg-primary text-primary-foreground"
									: "rounded-tl-none border border-border bg-card text-foreground"
							}`}
						>
							{msg.role === "assistant" && (
								<div className="flex items-center gap-1 mb-1">
									<Bot className="h-3 w-3 text-primary" />
									<span className="font-bold text-[10px] text-primary">Yumi</span>
								</div>
							)}
							<div className="whitespace-pre-line">{msg.content}</div>
						</div>
					</div>
				))}

				{/* Loading indicator */}
				{isLoading && !isStreaming && (
					<div className="flex justify-start">
						<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2">
							<div className="flex items-center gap-2">
								<Bot className="h-3 w-3 text-primary" />
								<Loader2 className="h-3 w-3 animate-spin text-primary" />
								<span className="text-[10px] text-muted-foreground">Mengetik...</span>
							</div>
						</div>
					</div>
				)}

				{/* Streaming Message */}
				{isStreaming && streamingContent && (
					<div className="flex justify-start">
						<div className="max-w-[90%] rounded-xl rounded-tl-none border border-border bg-card px-3 py-2 text-xs leading-relaxed">
							<div className="flex items-center gap-1 mb-1">
								<Bot className="h-3 w-3 text-primary" />
								<span className="font-bold text-[10px] text-primary">Yumi</span>
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
			<div className="shrink-0 border-t border-border bg-background p-2">
				{/* Templates */}
				<div className="mb-2 flex gap-1 overflow-x-auto pb-1">
					{CASIER_TEMPLATES.map((t) => (
						<button
							className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] text-muted-foreground transition-all hover:border-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
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
				<div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5">
					<textarea
						className="max-h-24 min-h-[32px] flex-1 resize-none bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground disabled:opacity-50"
						disabled={isLoading || isStreaming}
						onChange={(e) => {
							setInput(e.target.value);
							e.target.style.height = "auto";
							e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (input.trim()) {
									sendMessage(input);
								}
							}
						}}
						placeholder="Ketik pesan..."
						ref={inputRef}
						rows={1}
						value={input}
					/>
					<button
						className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
							input.trim()
								? "bg-primary text-primary-foreground hover:bg-primary/90"
								: "bg-muted text-muted-foreground"
						} disabled:opacity-50`}
						disabled={isLoading || isStreaming || !input.trim()}
						onClick={() => {
							if (input.trim()) {
								sendMessage(input);
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

				<p className="mt-1 text-center text-[9px] text-muted-foreground">
					Yumi AI dapat membuat kesalahan. Verifikasi data penting.
				</p>
			</div>
		</div>
	);
}
