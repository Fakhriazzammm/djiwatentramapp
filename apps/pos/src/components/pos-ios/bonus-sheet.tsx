import { motion } from "framer-motion";
import { formatRp, IosSheet } from "./ios-kit";

export interface BonusMemberVM {
	memberName: string;
	roleName: string;
	allTiers: Array<{ thresholdPct: number; bonusAmount: number }>;
	reachedThresholds: number[];
	achievedBonus: number;
}

export interface BonusVM {
	shiftPct: number;
	dailyPct: number;
	shiftCollected: number;
	shiftTarget: number;
	dailyCollected: number;
	dailyTarget: number;
	shiftBonusTotal: number;
	dailyBonusTotal: number;
	shiftMembers: BonusMemberVM[];
	dailyMembers: BonusMemberVM[];
}

function ProgressRow({ label, pct, collected, target, bonus }: { label: string; pct: number; collected: number; target: number; bonus: number }) {
	return (
		<div className="py-2.5">
			<div className="flex items-center justify-between text-[12px] font-bold tracking-wider text-muted-foreground">
				<span>{label}</span>
				<span className="text-foreground">{Math.round(pct)}%</span>
			</div>
			<div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Progress ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
				<motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
			</div>
			<p className="mt-1.5 text-[12px] text-muted-foreground">
				{formatRp(collected)} dari {formatRp(target)}
				{bonus > 0 ? <span className="ml-2 font-bold text-primary">Bonus {formatRp(bonus)}</span> : null}
			</p>
		</div>
	);
}

function Members({ members }: { members: BonusMemberVM[] }) {
	if (!members.length) return null;
	return (
		<div className="mb-2 space-y-2">
			{members.map((member) => (
				<div key={member.memberName} className="rounded-2xl bg-muted/60 p-3">
					<div className="flex items-center justify-between text-[12px]">
						<span className="font-extrabold uppercase tracking-wide">{member.memberName}</span>
						<span className="text-muted-foreground">{member.roleName}</span>
					</div>
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{member.allTiers.map((tier) => {
							const reached = member.reachedThresholds.includes(tier.thresholdPct);
							return (
								<span key={tier.thresholdPct} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${reached ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
									{reached ? "Tercapai" : "Belum"} {tier.thresholdPct}% · {formatRp(tier.bonusAmount)}
								</span>
							);
						})}
					</div>
					{member.achievedBonus > 0 ? <p className="mt-1.5 text-[12px] font-extrabold text-primary">Total {formatRp(member.achievedBonus)}</p> : null}
				</div>
			))}
		</div>
	);
}

export function BonusSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: BonusVM | null }) {
	return (
		<IosSheet open={open} onClose={onClose} title="Target Bonus" heightClass="max-h-[78dvh]">
			{data ? (
				<div className="pb-4">
					<ProgressRow label="SHIFT" pct={data.shiftPct} collected={data.shiftCollected} target={data.shiftTarget} bonus={data.shiftBonusTotal} />
					<Members members={data.shiftMembers} />
					<ProgressRow label="HARIAN" pct={data.dailyPct} collected={data.dailyCollected} target={data.dailyTarget} bonus={data.dailyBonusTotal} />
					<Members members={data.dailyMembers} />
				</div>
			) : (
				<p className="py-10 text-center text-sm text-muted-foreground">Target bonus belum diatur.</p>
			)}
		</IosSheet>
	);
}
