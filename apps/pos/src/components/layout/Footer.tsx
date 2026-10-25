import { OwnerFooter } from "@yumipos/web-shared";

export function Footer({ className = "", compact }: { className?: string; compact?: boolean }) {
	return <OwnerFooter className={className} compact={compact} />;
}
