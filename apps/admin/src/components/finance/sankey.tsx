import { useMemo, useState } from "react";
import type { MoneyFlowNode } from "@/hooks/use-hybrid-finance-analytics-data";

type Link = { source: string; target: string; value: number };
const COLORS: Record<MoneyFlowNode["kind"], { bar: string; band: string }> = {
	in: { bar: "#2f9e57", band: "#cfe8d6" },
	total: { bar: "#4b5563", band: "#d5dae0" },
	out: { bar: "#d9453b", band: "#f4cfcb" },
	net: { bar: "#15803d", band: "#bfe3cb" },
};

export const rpShort = (n: number) => {
	const a = Math.abs(n);
	const s = a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(".", ",")} M` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(".", ",")} jt` : a >= 1e3 ? `${Math.round(a / 1e3)} rb` : String(Math.round(a));
	return `Rp${s}`;
};
const pctText = (d: number | null) => (d === null ? "" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1).replace(".", ",")}%`);

type Placed = MoneyFlowNode & { x: number; y: number; h: number; out: number; inn: number };

export function Sankey({ nodes, links, share }: { nodes: MoneyFlowNode[]; links: Link[]; share?: number }) {
	const [hover, setHover] = useState<string | null>(null);
	const layout = useMemo(() => {
		const W = 1180, padY = 20, gap = 16, leftPad = 210, rightPad = 230, barW = 12;
		const cols = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.col === c).sort((a, b) => b.value - a.value));
		const maxN = Math.max(...cols.map((c) => c.length), 1);
		const H = Math.max(460, maxN * 56 + padY * 2);
		const scale = Math.min(...cols.filter((c) => c.length).map((c) => (H - padY * 2 - gap * (c.length - 1)) / Math.max(1, c.reduce((s, n) => s + n.value, 0))));
		const xs = [leftPad, leftPad + (W - leftPad - rightPad - barW) * 0.34, leftPad + (W - leftPad - rightPad - barW) * 0.66, W - rightPad - barW];
		const placed = new Map<string, Placed>();
		const MIN_SLOT = 46;
		const slotOf = (n: MoneyFlowNode) => Math.max(n.value * scale, MIN_SLOT);
		const need = Math.max(...cols.map((c) => c.reduce((s, n) => s + slotOf(n), 0) + gap * Math.max(0, c.length - 1)));
		const H2 = Math.max(H, need + padY * 2);
		cols.forEach((c, ci) => {
			const total = c.reduce((s, n) => s + slotOf(n), 0) + gap * Math.max(0, c.length - 1);
			let y = padY + (H2 - padY * 2 - total) / 2;
			for (const n of c) { const h = Math.max(2, n.value * scale); placed.set(n.id, { ...n, x: xs[ci], y, h, out: 0, inn: 0 }); y += slotOf(n) + gap; }
		});
		const ribbons: { key: string; d: string; color: string; source: string; target: string; value: number }[] = [];
		const byTarget = new Map<string, Link[]>(), bySource = new Map<string, Link[]>();
		for (const l of links) {
			if (!placed.has(l.source) || !placed.has(l.target) || l.value <= 0) continue;
			(bySource.get(l.source) ?? bySource.set(l.source, []).get(l.source)!).push(l);
			(byTarget.get(l.target) ?? byTarget.set(l.target, []).get(l.target)!).push(l);
		}
		for (const [id, arr] of bySource) arr.sort((a, b) => placed.get(a.target)!.y - placed.get(b.target)!.y);
		for (const [id, arr] of byTarget) arr.sort((a, b) => placed.get(a.source)!.y - placed.get(b.source)!.y);
		const srcOff = new Map<string, number>(), tgtOff = new Map<string, number>();
		for (const l of links.slice().sort((a, b) => placed.get(a.source)!.y - placed.get(b.source)!.y)) {
			const s = placed.get(l.source), t = placed.get(l.target);
			if (!s || !t || l.value <= 0) continue;
			const th = l.value * scale;
			const sy = s.y + (srcOff.get(s.id) ?? 0), ty = t.y + (tgtOff.get(t.id) ?? 0);
			srcOff.set(s.id, (srcOff.get(s.id) ?? 0) + th); tgtOff.set(t.id, (tgtOff.get(t.id) ?? 0) + th);
			const x0 = s.x + barW, x1 = t.x, mx = (x0 + x1) / 2;
			const d = `M${x0},${sy} C${mx},${sy} ${mx},${ty} ${x1},${ty} L${x1},${ty + th} C${mx},${ty + th} ${mx},${sy + th} ${x0},${sy + th} Z`;
			ribbons.push({ key: `${l.source}>${l.target}`, d, color: t.kind === "out" ? COLORS.out.band : t.kind === "net" ? COLORS.net.band : s.kind === "total" ? COLORS.total.band : COLORS.in.band, source: l.source, target: l.target, value: l.value });
		}
		return { W, H: H2, barW, placed: [...placed.values()], ribbons };
	}, [nodes, links]);

	const active = (r: { source: string; target: string }) => !hover || r.source === hover || r.target === hover;
	return (
		<div className="overflow-x-auto">
			<svg viewBox={`0 0 ${layout.W} ${layout.H}`} role="img" aria-label="Diagram arus dana: sumber, metode bayar, total, pengeluaran, kas bersih" style={{ minWidth: 900, width: "100%", display: "block" }}>
				{layout.ribbons.map((r) => (
					<path key={r.key} d={r.d} fill={r.color} opacity={active(r) ? 0.85 : 0.18} style={{ transition: "opacity .2s" }}>
						<title>{`${r.source.slice(2)} → ${r.target.slice(2)}: ${rpShort(r.value)}`}</title>
					</path>
				))}
				{layout.placed.map((n) => {
					const left = n.col < 3;
					const lx = left ? n.x - 8 : n.x + layout.barW + 8;
					const ty = n.y + Math.min(n.h / 2, 18) - 6;
					const lines = n.label.length > 26 ? [n.label.slice(0, 26), n.label.slice(26)] : [n.label];
					const delta = pctText(n.delta);
					const pctOf = share && n.col === 3 ? `${((n.value / share) * 100).toFixed(0)}% dari pemasukan` : null;
					return (
						<g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
							<rect x={n.x} y={n.y} width={layout.barW} height={n.h} fill={COLORS[n.kind].bar} rx={1.5} />
							<text x={lx} y={ty} textAnchor={left ? "end" : "start"} fontSize={12} fill="#111114" fontFamily="Inter, system-ui, sans-serif">
								{lines.map((l, i) => <tspan key={i} x={lx} dy={i === 0 ? 0 : 14} fontWeight={600}>{l}</tspan>)}
								<tspan x={lx} dy={15} fill={n.kind === "out" ? "#c0352b" : "#15803d"} fontWeight={600}>{rpShort(n.value)}{delta && <tspan fill="#6a6a76" fontWeight={400}> {delta}</tspan>}</tspan>
								{pctOf && <tspan x={lx} dy={14} fill="#8a8a96" fontSize={11}>{pctOf}</tspan>}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
