import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { APP_VERSION } from "../../lib/version";

export function Footer({ className = "", compact }: { className?: string; compact?: boolean }) {
	const settings = useHybridSiteSettings();
	const brandName = settings?.storeName || "Djiwa Tentram Centrik";
	
	return (
		<footer className={`flex flex-col items-center justify-center ${compact ? "p-1.5" : "p-6"} opacity-30 text-center ${className}`}>
			<p className="text-[11px] font-black tracking-[0.1em] uppercase text-muted-foreground max-w-2xl">
				Versi {APP_VERSION.semantic} Djiwa Tentram Centrik - {brandName} - Develop by Zantara Technology
			</p>
		</footer>
	);
}
