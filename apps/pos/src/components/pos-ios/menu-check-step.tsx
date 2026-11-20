import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { groupBy, type MenuCheckItem } from "@/lib/shift-gate";
import { AdaHabisSwitch, GateGroup, GateProgress, GateQuick, GateRow } from "./gate-kit";

export interface MenuCheckController {
	/** null selama menu masih dimuat. */
	items: MenuCheckItem[] | null;
	checks: Record<string, boolean | undefined>;
	setCheck: (id: string, available: boolean) => void;
	setAll: (value: boolean | null) => void;
}

export function menuCheckPending(m: MenuCheckController): number {
	return m.items ? m.items.filter((item) => m.checks[item.id] === undefined).length : 1;
}

/** Langkah 4 buka shift: kasir menandai setiap menu Ada atau Habis. */
export function MenuCheckStep({ menu }: { menu: MenuCheckController }) {
	if (!menu.items) {
		return <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Memuat menu…</div>;
	}
	const total = menu.items.length;
	const done = total - menuCheckPending(menu);
	if (total === 0) return <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-[13px] text-muted-foreground">Belum ada menu yang perlu dicek.</p>;
	return (
		<div>
			<GateProgress label="Sudah dicek" done={done} total={total} />
			<GateQuick items={[{ label: "Semua Ada", onClick: () => menu.setAll(true) }, { label: "Ulangi", onClick: () => menu.setAll(null) }]} />
			{groupBy(menu.items, (item) => item.group).map(([group, rows]) => (
				<div key={group}>
					<GateGroup>{group}</GateGroup>
					{rows.map((item, index) => {
						const value = menu.checks[item.id];
						return (
							<GateRow key={item.id} todo={value === undefined} index={index}>
								<div className="min-w-0">
									<p className="truncate text-[13.5px] font-semibold">{item.name}</p>
									<p className="text-[11.5px] text-muted-foreground">Tadi: {item.wasAvailable ? "Ada" : "Habis"}</p>
								</div>
								<AdaHabisSwitch id={item.id} value={value} label={`Status ${item.name}`} onChange={(next) => menu.setCheck(item.id, next)} />
							</GateRow>
						);
					})}
				</div>
			))}
			<motion.div layout className="h-1" />
		</div>
	);
}
