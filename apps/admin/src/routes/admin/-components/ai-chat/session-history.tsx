import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusCircle, Trash2, Bot, Search, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatSession } from "./types";

interface SessionHistoryProps {
	sessions: ChatSession[] | undefined;
	currentSessionId: string | null;
	onLoad: (id: string) => void;
	onDelete: (id: string) => void;
	onStartNew: () => void;
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "Baru saja";
	if (mins < 60) return `${mins} menit lalu`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs} jam lalu`;
	const days = Math.floor(hrs / 24);
	if (days < 7) return `${days} hari lalu`;
	return new Date(timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export const SessionHistory = ({
	sessions,
	currentSessionId,
	onLoad,
	onDelete,
	onStartNew
}: SessionHistoryProps) => {
	const [searchQuery, setSearchQuery] = useState("");

	const filtered = useMemo(() => {
		if (!sessions) return [];
		if (!searchQuery.trim()) return sessions;
		const q = searchQuery.toLowerCase();
		return sessions.filter(s => 
			(s.title || "").toLowerCase().includes(q)
		);
	}, [sessions, searchQuery]);

	return (
		<div className="w-full h-full flex flex-col overflow-hidden">
			{/* New chat button */}
			<div className="p-3">
				<Button 
					className="w-full flex items-center justify-center gap-1.5 rounded-xl shadow-sm h-9 font-bold" 
					onClick={onStartNew}
					size="sm"
				>
					<PlusCircle className="h-3.5 w-3.5" />
					Chat Baru
				</Button>
			</div>

			{/* Search */}
			{sessions && sessions.length > 3 && (
				<div className="px-3 pb-2">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Cari sesi..."
							className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 border border-border/40 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30"
						/>
					</div>
				</div>
			)}

			{/* Sessions list */}
			<div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 custom-scrollbar">
				{!sessions || sessions.length === 0 ? (
					<div className="py-10 text-center px-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/20 border border-border/30 mx-auto mb-3">
							<Bot className="h-5 w-5 text-muted-foreground/30" />
						</div>
						<h3 className="text-[11px] font-bold text-foreground mb-1">Mulai Percakapan</h3>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							Buat chat baru untuk mulai berdiskusi dengan Djiwa Tentram AI
						</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="py-8 text-center px-4">
						<p className="text-[10px] text-muted-foreground">Tidak ada sesi yang cocok.</p>
					</div>
				) : (
					<AnimatePresence>
						{filtered.map((session, i) => {
							const isActive = currentSessionId === session.sessionId;
							return (
								<motion.div
									key={session.sessionId}
									initial={{ opacity: 0, y: 5 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: i * 0.03 }}
									className={`group relative rounded-xl border p-2.5 transition-all cursor-pointer ${
										isActive
											? "border-primary/40 bg-primary/8 shadow-sm ring-1 ring-primary/20"
											: "border-transparent hover:bg-muted/50 hover:border-border/40"
									}`}
									onClick={() => onLoad(session.sessionId)}
								>
									<div className="flex items-start gap-2">
										<div className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
											isActive ? "bg-primary/10" : "bg-muted/30"
										}`}>
											<MessageSquare className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "text-muted-foreground/50"}`} />
										</div>
										<div className="flex-1 min-w-0 pr-6">
											<p className={`font-bold text-[11px] truncate ${isActive ? "text-primary" : "text-foreground"}`}>
												{session.title || "Percakapan Baru"}
											</p>
											<div className="flex items-center gap-2 mt-0.5">
												<span className="text-[11px] text-muted-foreground font-medium">
													{session.messageCount} pesan
												</span>
												<span className="text-[11px] text-muted-foreground/50">·</span>
												<span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/60 font-medium">
													<Clock className="h-2.5 w-2.5" />
													{formatRelativeTime(session.createdAt)}
												</span>
											</div>
										</div>
										<button
											className="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												onDelete(session.sessionId);
											}}
											title="Hapus sesi"
											type="button"
										>
											<Trash2 className="h-3 w-3" />
										</button>
									</div>
								</motion.div>
							);
						})}
					</AnimatePresence>
				)}
			</div>
		</div>
	);
};
