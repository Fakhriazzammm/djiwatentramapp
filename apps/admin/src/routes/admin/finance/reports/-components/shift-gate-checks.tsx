import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { adminProtectedRpc } from "@/lib/admin-protected-read";
import { createClient } from "@/lib/client";

type Check = { id: string; kind: "open_menu" | "close_opname"; actorName: string; createdAt: number; summary: { total?: number; out?: number; flagged?: number }; items: any[] };

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const time = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Hasil cek menu (buka shift) dan opname bahan (tutup shift) untuk satu shift. */
export function ShiftGateChecks({ shiftId }: { shiftId: string }) {
	const [checks, setChecks] = useState<Check[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [handover, setHandover] = useState<{ counted: number; separated: number; kept: number } | null>(null);
	useEffect(() => {
		let active = true;
		setHandover(null);
		void (async () => {
			try {
				const { data } = await createClient().schema("pos").from("shifts").select("cash_handover").eq("source_id", shiftId).maybeSingle();
				const value = (data as any)?.cash_handover;
				if (active && value && typeof value.kept === "number") setHandover({ counted: Number(value.counted ?? 0), separated: Number(value.separated ?? 0), kept: Number(value.kept) });
			} catch { /* opsional */ }
		})();
		return () => { active = false; };
	}, [shiftId]);
	useEffect(() => {
		let active = true;
		setChecks(null);
		setFailed(false);
		adminProtectedRpc<Check[]>("shift_checks_for_shift", { p_shift_source_id: shiftId })
			.then((rows) => { if (active) setChecks(Array.isArray(rows) ? rows : []); })
			.catch(() => { if (active) setFailed(true); });
		return () => { active = false; };
	}, [shiftId]);

	const menu = checks?.filter((c) => c.kind === "open_menu").at(-1);
	const opname = checks?.filter((c) => c.kind === "close_opname").at(-1);
	const menuOut = menu?.items.filter((i) => i.available === false) ?? [];
	const opnameOut = opname?.items.filter((i) => i.status === "out") ?? [];
	const opnameFlag = opname?.items.filter((i) => i.flagged) ?? [];

	return (
		<div className="rounded-xl border border-border p-3">
			<p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cek menu & opname bahan</p>
			{handover ? <p className="mb-2 rounded-md bg-primary/5 px-2 py-1.5 text-xs">🤝 Serah terima tunai: dihitung {rp(handover.counted)} · dipisah/disetor <b>{rp(handover.separated)}</b> · modal shift berikutnya <b>{rp(handover.kept)}</b></p> : null}
			{failed ? <p className="text-xs text-muted-foreground">Catatan gerbang kasir belum bisa dimuat.</p> : !checks ? <p className="text-xs text-muted-foreground">Memuat…</p> : (
				<AnimatePresence initial={false}>
					<motion.div key="body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 text-xs">
						<div>
							<div className="flex items-center justify-between"><b>Buka shift · cek menu</b>{menu ? <span className="text-muted-foreground">{menu.actorName} · {time(menu.createdAt)}</span> : <span className="font-semibold text-amber-600">Belum tercatat</span>}</div>
							{menu ? <p className="text-muted-foreground">{(menu.summary.total ?? 0) - (menu.summary.out ?? 0)} Ada · {menu.summary.out ?? 0} Habis{menuOut.length ? `: ${menuOut.map((i) => i.name).join(", ")}` : ""}</p> : null}
						</div>
						<div className="border-t border-border pt-2">
							<div className="flex items-center justify-between"><b>Tutup shift · opname bahan</b>{opname ? <span className="text-muted-foreground">{opname.actorName} · {time(opname.createdAt)}</span> : <span className="font-semibold text-amber-600">Belum tercatat</span>}</div>
							{opname ? <p className="text-muted-foreground">{opname.summary.total ?? 0} bahan dihitung · {opname.summary.out ?? 0} habis · {opname.summary.flagged ?? 0} selisih besar{opnameOut.length ? `. Habis: ${opnameOut.map((i) => i.name).join(", ")}` : ""}</p> : null}
							{opnameFlag.map((i) => <p key={i.inventoryId} className="mt-0.5 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700">{i.name}: {i.previousQuantity} → {i.quantity} {i.unit}{i.note ? ` · ${i.note}` : ""}</p>)}
						</div>
					</motion.div>
				</AnimatePresence>
			)}
		</div>
	);
}
