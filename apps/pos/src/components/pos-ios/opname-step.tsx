import type { ShiftOpnameMaterial } from "@djiwaapps/web-shared/lib/manual-stock";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { groupBy, opnameFlagged, opnameVariance, opnameSummary, type OpnameEntries, type OpnameEntry } from "@/lib/shift-gate";
import { AdaHabisSwitch, CountStepper, GateGroup, GateProgress, GateQuick, GateRow } from "./gate-kit";
import { IOS_SPRING, listItemMotion } from "./ios-kit";

export interface OpnameController {
	/** null selama bahan masih dimuat. */
	rows: ShiftOpnameMaterial[] | null;
	loadError: string | null;
	reload: () => void;
	entries: OpnameEntries;
	setEntry: (id: string, entry: OpnameEntry) => void;
	fillFromLast: () => void;
	/** Menandai semua bahan Ada/Habis yang belum diisi sebagai Ada. */
	fillAllAvailable: () => void;
	reset: () => void;
	notes: Record<string, string>;
	setNote: (id: string, text: string) => void;
}

const GROUP_LABEL: Record<string, string> = { bar: "Bar", kitchen: "Dapur" };

export function opnameIssues(o: OpnameController): string[] {
	if (o.loadError) return ["daftar bahan gagal dimuat"];
	if (!o.rows) return ["daftar bahan masih dimuat"];
	const summary = opnameSummary(o.rows, o.entries);
	return summary.complete ? [] : [`masih ${summary.total - summary.done} bahan belum dihitung`];
}

/** Bahan yang selisihnya besar dan belum diberi catatan. */
export function opnameNotesMissing(o: OpnameController): number {
	if (!o.rows) return 0;
	return o.rows.filter((row) => opnameFlagged(row, o.entries[row.inventoryId]) && !(o.notes[row.inventoryId] ?? "").trim()).length;
}

/** Langkah 2 tutup shift: hitung bahan baku sebelum uang. */
export function OpnameStep({ opname }: { opname: OpnameController }) {
	if (opname.loadError) {
		return (
			<div className="rounded-2xl bg-rose-50 px-4 py-5 text-center">
				<p className="text-[13px] font-semibold text-rose-700">{opname.loadError}</p>
				<button type="button" onClick={opname.reload} className="mt-2 h-9 rounded-xl bg-rose-600 px-4 text-[13px] font-bold text-white">Coba lagi</button>
			</div>
		);
	}
	if (!opname.rows) return <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Memuat bahan…</div>;
	if (opname.rows.length === 0) return <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-[13px] text-muted-foreground">Belum ada bahan yang perlu dihitung.</p>;
	const summary = opnameSummary(opname.rows, opname.entries);
	const flagged = opname.rows.filter((row) => opnameFlagged(row, opname.entries[row.inventoryId]));
	return (
		<div>
			<GateProgress label="Sudah dihitung" done={summary.done} total={summary.total} />
			<GateQuick items={[{ label: "Semua Ada", onClick: opname.fillAllAvailable }, { label: "Sesuai catatan terakhir", onClick: opname.fillFromLast }, { label: "Ulangi", onClick: opname.reset }]} />
			{groupBy(opname.rows, (row) => row.group ?? "other").map(([group, rows]) => (
				<div key={group}>
					<GateGroup>{GROUP_LABEL[group] ?? "Lainnya"}</GateGroup>
					{rows.map((row, index) => {
						const entry = opname.entries[row.inventoryId];
						const variance = opnameVariance(row, entry);
						const isFlag = opnameFlagged(row, entry);
						const todo = row.mode === "count" ? typeof entry?.quantity !== "number" : !entry?.status;
						const last = row.mode === "count" ? (typeof row.quantity === "number" ? `Catatan terakhir ${row.quantity} ${row.unit}` : "Belum pernah dihitung") : row.status === "available" ? "Tadi: Ada" : row.status === "out" ? "Tadi: Habis" : "Ada atau habis";
						return (
							<GateRow key={row.inventoryId} todo={todo} index={index}>
								<div className="min-w-0">
									<p className="truncate text-[13.5px] font-semibold">{row.name}</p>
									<p className="text-[11.5px] text-muted-foreground">{last}</p>
									<AnimatePresence initial={false}>
										{isFlag && variance !== null ? <motion.span key="flag" initial={{ opacity: 0, scale: 0.85, height: 0 }} animate={{ opacity: 1, scale: 1, height: "auto" }} exit={{ opacity: 0, scale: 0.85, height: 0 }} transition={IOS_SPRING} className="mt-0.5 inline-block rounded-[7px] bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">Selisih {Math.round(variance * 100)}%</motion.span> : null}
									</AnimatePresence>
								</div>
								{row.mode === "count" ? (
									<CountStepper value={entry?.quantity} unit={row.unit} label={row.name} todo={todo} onChange={(next) => opname.setEntry(row.inventoryId, { quantity: next })} />
								) : (
									<AdaHabisSwitch id={row.inventoryId} value={entry?.status === undefined ? undefined : entry.status === "available"} label={`Status ${row.name}`} onChange={(next) => opname.setEntry(row.inventoryId, { status: next ? "available" : "out" })} />
								)}
							</GateRow>
						);
					})}
				</div>
			))}
			<AnimatePresence initial={false}>
				{flagged.length > 0 ? <motion.p key="ghost" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-1 rounded-[14px] border border-dashed border-border bg-card px-3.5 py-3 text-[13px] text-muted-foreground">{flagged.length} bahan selisih lebih dari 20%. Catatan akan diminta di langkah tinjau.</motion.p> : null}
			</AnimatePresence>
		</div>
	);
}

/** Ringkasan opname di langkah tinjau, plus catatan wajib untuk selisih besar. */
export function OpnameReview({ opname }: { opname: OpnameController }) {
	if (!opname.rows || opname.rows.length === 0) return null;
	const summary = opnameSummary(opname.rows, opname.entries);
	const flagged = opname.rows.filter((row) => opnameFlagged(row, opname.entries[row.inventoryId]));
	const outNames = opname.rows.filter((row) => (row.mode === "count" ? opname.entries[row.inventoryId]?.quantity === 0 : opname.entries[row.inventoryId]?.status === "out")).map((row) => row.name);
	return (
		<div className="mb-3 space-y-2">
			<div className="rounded-2xl bg-muted/60 p-4 text-[14px]">
				<p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground">OPNAME BAHAN</p>
				<div className="flex justify-between py-0.5"><span className="text-muted-foreground">Bahan dihitung</span><b>{summary.total}</b></div>
				<div className="flex justify-between py-0.5"><span className="text-muted-foreground">Bahan habis</span><b>{summary.out}</b></div>
				<div className="flex justify-between py-0.5"><span className="text-muted-foreground">Selisih besar</span><b>{summary.flagged}</b></div>
			</div>
			{outNames.length > 0 ? <p className="rounded-[14px] border border-dashed border-border px-3.5 py-3 text-[13px] text-muted-foreground">Habis: {outNames.join(", ")}</p> : null}
			{flagged.length > 0 ? (
				<div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-3">
					<p className="text-[13px] font-bold">Catatan selisih (wajib)</p>
					{flagged.map((row, index) => {
						const note = opname.notes[row.inventoryId] ?? "";
						return (
							<motion.div key={row.inventoryId} {...listItemMotion(index)} className="mt-2">
								<p className="text-[12.5px] text-muted-foreground">{row.name} · {row.quantity} → {opname.entries[row.inventoryId]?.quantity} {row.unit}</p>
								<input value={note} onChange={(event) => opname.setNote(row.inventoryId, event.target.value)} maxLength={200} placeholder="Contoh: terpakai untuk acara katering" aria-label={`Catatan selisih ${row.name}`} className="mt-1 h-10 w-full rounded-xl bg-background px-3 text-[13.5px] outline-none placeholder:text-muted-foreground focus:shadow-[0_0_0_1px_var(--border)]" />
							</motion.div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
