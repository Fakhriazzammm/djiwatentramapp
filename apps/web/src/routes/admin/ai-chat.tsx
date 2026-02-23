import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/admin/ai-chat")({
	component: AIChatPage,
});

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

const TEMPLATES = [
	{ label: "Rekap Hari Ini", message: "Berikan rekap lengkap bisnis hari ini" },
	{ label: "Stok Rendah", message: "Produk apa saja yang stoknya rendah?" },
	{ label: "Top Produk", message: "Apa produk terlaris saat ini?" },
	{
		label: "Ringkas Keuangan",
		message: "Ringkas kondisi keuangan saat ini",
	},
	{
		label: "Pesanan Tertunda",
		message: "Ada berapa pesanan yang masih tertunda?",
	},
	{
		label: "Saran Bisnis",
		message: "Berikan saran bisnis berdasarkan data saat ini",
	},
];

function AIChatPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			role: "assistant",
			content:
				"Halo! Saya Yumi, asisten AI kamu. Saya bisa membantu merekap data, menganalisis bisnis, dan menjawab pertanyaan tentang aplikasi ini. Ada yang bisa saya bantu?",
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const yumiChat = useAction(api.ai.yumiChat);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || isLoading) {
				return;
			}

			const userMessage: ChatMessage = { role: "user", content: text.trim() };
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

				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content:
							response || "Maaf, saya tidak bisa memproses permintaan ini.",
					},
				]);
			} catch {
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
					},
				]);
			} finally {
				setIsLoading(false);
			}
		},
		[isLoading, messages, yumiChat]
	);

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* Header */}
			<div className="flex items-center gap-3 border-border border-b bg-muted/30 px-6 py-4">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
					<Sparkles className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h2 className="font-bold text-foreground text-lg">Yumi AI Chat</h2>
					<p className="text-muted-foreground text-xs">
						Asisten Bisnis Cerdas Anda
					</p>
				</div>
			</div>

			{/* Messages Container */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl space-y-6">
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
									className={`max-w-[85%] space-y-2 ${
										msg.role === "user" ? "items-end" : "items-start"
									}`}
								>
									{msg.role === "assistant" && (
										<div className="flex items-center gap-2 px-1">
											<Bot className="h-4 w-4 text-primary" />
											<span className="font-bold text-primary text-xs uppercase tracking-wider">
												Yumi
											</span>
										</div>
									)}
									<div
										className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
											msg.role === "user"
												? "rounded-tr-none bg-primary text-primary-foreground"
												: "rounded-tl-none border border-border bg-background text-foreground"
										}`}
									>
										<div className="whitespace-pre-line">{msg.content}</div>
									</div>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
					{isLoading && (
						<div className="flex justify-start">
							<div className="space-y-2">
								<div className="flex items-center gap-2 px-1">
									<Bot className="h-4 w-4 text-primary" />
									<span className="font-bold text-primary text-xs uppercase tracking-wider">
										Yumi
									</span>
								</div>
								<div className="rounded-2xl rounded-tl-none border border-border bg-background px-4 py-3 shadow-sm">
									<div className="flex gap-1.5 pt-1">
										<span
											className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
											style={{ animationDelay: "0ms" }}
										/>
										<span
											className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
											style={{ animationDelay: "150ms" }}
										/>
										<span
											className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
											style={{ animationDelay: "300ms" }}
										/>
									</div>
								</div>
							</div>
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>
			</div>

			{/* Footer: Templates & Input */}
			<div className="space-y-4 border-border border-t bg-muted/10 p-6">
				<div className="mx-auto max-w-3xl space-y-4">
					{/* Templates */}
					<div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
						{TEMPLATES.map((t) => (
							<button
								className="shrink-0 rounded-full border border-border bg-background px-4 py-1.5 text-foreground text-xs transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
								disabled={isLoading}
								key={t.label}
								onClick={() => sendMessage(t.message)}
								type="button"
							>
								{t.label}
							</button>
						))}
					</div>

					{/* Input Form */}
					<form
						className="relative flex items-center gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							sendMessage(input);
						}}
					>
						<input
							className="flex-1 rounded-2xl border border-border bg-background px-5 py-3.5 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
							disabled={isLoading}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Tanya Yumi tentang bisnis Anda..."
							ref={inputRef}
							type="text"
							value={input}
						/>
						<button
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 disabled:opacity-50 disabled:hover:scale-100"
							disabled={isLoading || !input.trim()}
							type="submit"
						>
							<Send className="h-5 w-5" />
						</button>
					</form>
					<p className="text-center text-[10px] text-muted-foreground uppercase tracking-widest opacity-50">
						Yumi AI dapat membuat kesalahan. Periksa informasi penting.
					</p>
				</div>
			</div>
		</div>
	);
}
