import React from "react";
import { Button } from "@/components/ui/button";

interface TasksPanelProps {
	tasks: any[];
	onComplete: (id: string) => void;
	onDismiss: (id: string) => void;
}

export const TasksPanel = ({ 
	tasks, 
	onComplete, 
	onDismiss 
}: TasksPanelProps) => {
	if (!tasks || tasks.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">
				<p>Tidak ada tugas yang perlu ditindaklanjuti.</p>
			</div>
		);
	}
	
	return (
		<div className="p-6 space-y-4 overflow-y-auto h-full text-foreground">
			{tasks.map((task: any) => (
				<div key={task._id} className="p-4 border rounded-lg bg-card shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
					<div className="flex-1">
						<p className="font-semibold">{task.title}</p>
						<p className="text-sm text-muted-foreground mt-1">{task.description}</p>
						{task.dueDate && (
							<p className="text-[10px] text-accent font-medium mt-2">
								Deadline: {new Date(task.dueDate).toLocaleDateString("id-ID")}
							</p>
						)}
					</div>
					<div className="flex gap-2 w-full md:w-auto shrink-0">
						<Button size="sm" variant="outline" className="flex-1 md:flex-none" onClick={() => onComplete(task._id)}>Selesai</Button>
						<Button size="sm" variant="ghost" className="flex-1 md:flex-none text-muted-foreground hover:text-destructive" onClick={() => onDismiss(task._id)}>Abaikan</Button>
					</div>
				</div>
			))}
		</div>
	);
};
