import { Camera, Clock, Play } from "lucide-react";

interface HomeStickyStripProps {
	hasFaceDescriptor: boolean;
	isWorking: boolean | undefined;
}

type StripConfig = {
	bg: string;
	border: string;
	icon: React.ComponentType<{ className?: string }>;
	iconColor: string;
	message: string;
};

function getStripConfig(
	hasFaceDescriptor: boolean,
	isWorking: boolean | undefined,
): StripConfig {
	if (!hasFaceDescriptor) {
		return {
			bg: "bg-sky-500/10",
			border: "border border-sky-500/20",
			icon: Camera,
			iconColor: "text-sky-500",
			message: "Lengkapi Face ID untuk absensi",
		};
	}

	if (!isWorking) {
		return {
			bg: "bg-emerald-500/10",
			border: "border border-emerald-500/20",
			icon: Play,
			iconColor: "text-emerald-500",
			message: "Shift belum dimulai • Clock In",
		};
	}

	return {
		bg: "bg-amber-500/10",
		border: "border border-amber-500/20",
		icon: Clock,
		iconColor: "text-amber-500",
		message: "Shift aktif — jangan lupa Clock Out",
	};
}

export function HomeStickyStrip({
	hasFaceDescriptor,
	isWorking,
}: HomeStickyStripProps) {
	const config = getStripConfig(hasFaceDescriptor, isWorking);
	const Icon = config.icon;

	return (
		<div
			className={`flex cursor-default items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-bold ${config.bg} ${config.border}`}
		>
			<Icon className={`h-4 w-4 ${config.iconColor}`} />
			<span className="text-foreground">{config.message}</span>
		</div>
	);
}
