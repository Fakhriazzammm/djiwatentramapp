import React from "react";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "./types";

interface SuggestionsPanelProps {
	suggestions: Suggestion[];
	onExecute: (s: Suggestion) => void;
}

export const SuggestionsPanel = ({ 
	suggestions, 
	onExecute 
}: SuggestionsPanelProps) => {
	if (!suggestions || suggestions.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">
				<p>Tidak ada saran untuk saat ini.</p>
			</div>
		);
	}
	
	return (
		<div className="p-4 space-y-3 overflow-y-auto h-full">
			{suggestions.map((s: Suggestion) => (
				<div key={s.id} className="p-3 border rounded-lg bg-card shadow-sm border-l-4 border-l-primary/50">
					<div className="flex justify-between items-start gap-4">
						<div className="flex-1">
							<p className="font-bold text-[13px] text-foreground">{s.title}</p>
							<p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
						</div>
						<span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
							s.priority === "high" ? "bg-red-100 text-red-800" :
							s.priority === "medium" ? "bg-yellow-100 text-yellow-800" :
							"bg-blue-100 text-blue-800"
						}`}>
							{s.priority}
						</span>
					</div>
					{s.action && (
						<div className="mt-2.5 pt-2 border-t flex justify-end">
							<Button size="sm" className="h-7 text-[10px]" onClick={() => onExecute(s)}>Jalankan Aksi</Button>
						</div>
					)}
				</div>
			))}
		</div>
	);
};
