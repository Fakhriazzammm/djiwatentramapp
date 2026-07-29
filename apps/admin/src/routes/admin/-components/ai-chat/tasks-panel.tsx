import React from "react";
import { motion } from "framer-motion";
import { 
	CheckCircle2, 
	XCircle, 
	Clock, 
	AlertTriangle, 
	Package, 
	DollarSign, 
	Megaphone, 
	Settings, 
	Zap,
	CalendarClock,
	ListTodo,
	CheckCheck,
	Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TasksPanelProps {
	tasks: any[];
	onComplete: (id: string) => void;
	onDismiss: (id: string) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
	inventory: Package,
	finance: DollarSign,
	marketing: Megaphone,
	operations: Settings,
};

const CATEGORY_COLORS: Record<string, string> = {
	inventory: "text-amber-600 bg-amber-50 border-amber-200",
	finance: "text-green-600 bg-green-50 border-green-200",
	marketing: "text-purple-600 bg-purple-50 border-purple-200",
	operations: "text-blue-600 bg-blue-50 border-blue-200",
};

const PRIORITY_STYLES: Record<string, { badge: string; dot: string }> = {
	high: { badge: "text-red-700 bg-red-50 border-red-200", dot: "bg-red-500" },
	medium: { badge: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
	low: { badge: "text-blue-700 bg-blue-50 border-blue-200", dot: "bg-blue-500" },
};

function inferCategory(task: any): string {
	const t = `${task.title} ${task.description}`.toLowerCase();
	if (/stok|inventaris|restock|bahan/.test(t)) return "inventory";
	if (/keuangan|laba|rugi|pendapatan|transaksi|kas|hpp/.test(t)) return "finance";
	if (/promo|diskon|marketing|promosi/.test(t)) return "marketing";
	return "operations";
}

function inferPriority(task: any): "high" | "medium" | "low" {
	if (task.priority === "high" || task.priority === "medium" || task.priority === "low") return task.priority;
	if (task.dueDate && new Date(task.dueDate).getTime() < Date.now()) return "high";
	return "medium";
}

function isOverdue(dueDate?: number | string): boolean {
	if (!dueDate) return false;
	const d = new Date(dueDate);
	return d.getTime() < Date.now();
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
	return new Date(timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export const TasksPanel = ({ 
	tasks, 
	onComplete, 
	onDismiss 
}: TasksPanelProps) => {
	if (!tasks || tasks.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-8 text-center">
				<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 border border-green-200 mb-3">
					<CheckCheck className="h-6 w-6 text-green-500" />
				</div>
				<h3 className="text-sm font-bold text-foreground mb-1">Semua Tugas Selesai!</h3>
				<p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
					Tidak ada tugas yang perlu ditindaklanjuti saat ini.
				</p>
			</div>
		);
	}

	const sorted = [...tasks].sort((a, b) => {
		const po = { high: 0, medium: 1, low: 2 };
		const pa = inferPriority(a);
		const pb = inferPriority(b);
		if (po[pa] !== po[pb]) return po[pa] - po[pb];
		if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
		return 0;
	});

	const completedCount = 0;
	const totalTasks = tasks.length;
	const progressPct = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;
	const overdueCount = tasks.filter(t => isOverdue(t.dueDate)).length;
	const highCount = tasks.filter(t => inferPriority(t) === "high").length;

	const completeAll = () => {
		for (const t of tasks) onComplete(t._id);
	};
	const dismissAll = () => {
		for (const t of tasks) onDismiss(t._id);
	};

	return (
		<div className="p-4 pb-24 md:pb-10 overflow-y-auto h-full custom-scrollbar space-y-3">
			{/* Header */}
			<motion.div 
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				className="p-3 rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 border border-primary/10 space-y-3"
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
							<ListTodo className="h-4 w-4 text-primary" />
						</div>
						<div>
							<h2 className="text-[12px] font-black text-foreground tracking-tight">Tugas AI</h2>
							<p className="text-[9px] text-muted-foreground font-medium">{totalTasks} tugas aktif</p>
						</div>
					</div>
					{totalTasks > 1 && (
						<div className="flex gap-1">
							<Button size="sm" variant="ghost" className="h-6 text-[8px] font-bold text-green-600 hover:bg-green-50 px-1.5" onClick={completeAll}>
								<CheckCheck className="h-3 w-3 mr-0.5" />
								Semua Selesai
							</Button>
							<Button size="sm" variant="ghost" className="h-6 text-[8px] font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive px-1.5" onClick={dismissAll}>
								<Trash2 className="h-3 w-3 mr-0.5" />
								Bersihkan
							</Button>
						</div>
					)}
				</div>

				{/* Stats bar */}
				<div className="flex gap-2">
					{highCount > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black bg-red-50 text-red-600 border border-red-200">
							<span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
							{highCount} urgent
						</span>
					)}
					{overdueCount > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-200">
							<AlertTriangle className="h-2.5 w-2.5" />
							{overdueCount} terlambat
						</span>
					)}
					<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black bg-muted/30 text-muted-foreground border border-border/40">
						{totalTasks} total
					</span>
				</div>
			</motion.div>

			{/* Task list */}
			<div className="space-y-2">
				{sorted.map((task, i) => {
					const cat = inferCategory(task);
					const priority = inferPriority(task);
					const pStyle = PRIORITY_STYLES[priority];
					const CatIcon = CATEGORY_ICONS[cat] || Settings;
					const catColor = CATEGORY_COLORS[cat] || CATEGORY_COLORS.operations;
					const overdue = isOverdue(task.dueDate);

					return (
						<motion.div
							key={task._id}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: i * 0.05 }}
							className={`relative p-3 rounded-2xl border bg-card/40 backdrop-blur-sm transition-all hover:shadow-md group ${
								overdue ? "border-red-200 bg-red-50/20" : "border-border/60"
							}`}
						>
							{/* Priority left bar */}
							<div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${pStyle.dot}`} />

							<div className="pl-2">
								{/* Title row */}
								<div className="flex items-start justify-between gap-2 mb-1">
									<div className="flex items-center gap-1.5 min-w-0">
										<div className={`flex h-6 w-6 items-center justify-center rounded-lg border shrink-0 ${catColor}`}>
											<CatIcon className="h-3 w-3" />
										</div>
										<span className="font-bold text-[12px] text-foreground truncate">{task.title}</span>
									</div>
									<span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider border shrink-0 ${pStyle.badge}`}>
										{priority === "high" ? <Zap className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
										{priority === "high" ? "Urgent" : priority === "medium" ? "Penting" : "Normal"}
									</span>
								</div>

								{/* Description */}
								<p className="text-[10px] text-muted-foreground leading-relaxed mb-2">{task.description}</p>

								{/* Meta row */}
								<div className="flex items-center gap-2 flex-wrap">
									{task.dueDate && (
										<span className={`inline-flex items-center gap-1 text-[9px] font-bold ${
											overdue ? "text-red-500" : "text-muted-foreground"
										}`}>
											<CalendarClock className="h-3 w-3" />
											{overdue ? "Terlambat: " : ""}
											{new Date(task.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
										</span>
									)}
									{task.createdAt && (
										<span className="text-[8px] text-muted-foreground/60 font-medium">
											{formatRelativeTime(task.createdAt)}
										</span>
									)}
								</div>

								{/* Actions */}
								<div className="mt-2 pt-2 border-t border-border/30 flex gap-2">
									<Button 
										size="sm" 
										variant="outline"
										className="flex-1 h-7 text-[10px] font-bold gap-1 rounded-lg border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800" 
										onClick={() => onComplete(task._id)}
									>
										<CheckCircle2 className="h-3.5 w-3.5" />
										Selesai
									</Button>
									<Button 
										size="sm" 
										variant="ghost" 
										className="h-7 text-[10px] font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2.5 rounded-lg" 
										onClick={() => onDismiss(task._id)}
									>
										<XCircle className="h-3.5 w-3.5 mr-1" />
										Abaikan
									</Button>
								</div>
							</div>

							{/* Overdue pulse indicator */}
							{overdue && (
								<span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
							)}
						</motion.div>
					);
				})}
			</div>
		</div>
	);
};
