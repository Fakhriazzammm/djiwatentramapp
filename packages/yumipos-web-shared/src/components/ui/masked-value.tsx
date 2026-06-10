import { getDemoMode } from "../../lib/utils/demo-mask";

interface MaskedValueProps {
	value: number | null | undefined;
	prefix?: string;
	suffix?: string;
	className?: string;
}

/**
 * Component that mask angka dalam demo mode.
 * 
 * @example
 * <MaskedValue value={15000} prefix="Rp" />
 * // Demo: "Rp •••"
 * // Normal: "Rp 15.000"
 * 
 * <MaskedValue value={120} suffix=" pcs" />
 * // Demo: "••• pcs"
 * // Normal: "120 pcs"
 */
export function MaskedValue({ value, prefix, suffix, className }: MaskedValueProps) {
	if (getDemoMode()) {
		return (
			<span
				className={className}
				data-mask="true"
				aria-label="Disembunyikan dalam mode demo"
			>
				{prefix ? `${prefix} •••` : "•••"}
				{suffix || ""}
			</span>
		);
	}

	if (value == null) {
		return <span className={className}>-</span>;
	}

	return (
		<span className={className}>
			{prefix ? `${prefix} ` : ""}
			{value.toLocaleString("id-ID")}
			{suffix || ""}
		</span>
	);
}
