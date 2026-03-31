import React from "react";
import { PlusCircle, Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatSession } from "./types";

interface SessionHistoryProps {
	sessions: ChatSession[] | undefined;
	currentSessionId: string | null;
	onLoad: (id: string) => void;
	onDelete: (id: string) => void;
	onStartNew: () => void;
}

export const SessionHistory = ({
	sessions,
	currentSessionId,
	onLoad,
	onDelete,
	onStartNew
}: SessionHistoryProps) => {
	return (
		<div className="w-full h-full flex flex-col bg-card border-r border-border overflow-hidden">
			<div className="p-2.5 border-b border-border bg-muted/20">
				<h2 className="text-base font-bold text-foreground">Riwayat Chat</h2>
			</div>
			
			<div className="p-2 border-b border-border">
				<Button 
					className="w-full flex items-center gap-1.5 rounded-xl shadow-sm h-8" 
					onClick={onStartNew}
					size="sm"
				>
					<PlusCircle className="h-3.5 w-3.5" />
					Chat Baru
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
				{!sessions || sessions.length === 0 ? (
					<div className="py-8 text-center px-4">
						<Bot className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
						<p className="text-muted-foreground text-[10px] leading-relaxed">
							Mulai percakapan baru dengan Yumi AI
						</p>
					</div>
				) : (
					sessions.map((session) => (
						<div
							key={session.sessionId}
							className={`group relative rounded-xl border p-2 transition-all cursor-pointer ${
								currentSessionId === session.sessionId
									? "border-primary bg-primary/10 shadow-sm"
									: "border-transparent bg-transparent hover:bg-muted/80"
							}`}
							onClick={() => onLoad(session.sessionId)}
						>
							<div className="flex items-start justify-between gap-2 overflow-hidden">
								<div className="flex-1 min-w-0 pr-6">
									<p className={`font-semibold text-[11px] truncate ${currentSessionId === session.sessionId ? "text-primary" : "text-foreground"}`}>
										{session.title || "Percakapan Baru"}
									</p>
									<p className="text-[9px] text-muted-foreground mt-0.5">
										{session.messageCount} pesan
									</p>
								</div>
								<button
									className="absolute right-1.5 top-1.5 h-5.5 w-5.5 flex items-center justify-center rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive"
									onClick={(e) => {
										e.stopPropagation();
										onDelete(session.sessionId);
									}}
									title="Hapus sesi"
								>
									<Trash2 className="h-3 w-3" />
								</button>
							</div>
							<p className="text-[8px] text-muted-foreground/60 mt-1 font-medium uppercase tracking-tight">
								{new Date(session.createdAt).toLocaleDateString("id-ID", {
									day: "numeric",
									month: "short",
								})}
							</p>
						</div>
					))
				)}
			</div>
		</div>
	);
};
