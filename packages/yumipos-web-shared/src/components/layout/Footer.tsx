import { useHybridSiteSettings } from "../../hooks/use-hybrid-pos-data";

export function Footer({ className = "" }: { className?: string }) {
	const settings = useHybridSiteSettings();
	const brandName = settings?.storeName || "Djiwa Tentram";
	
	return (
		<footer className={`flex flex-col items-center justify-center p-6 opacity-30 text-center ${className}`}>
			<p className="text-[9px] font-black tracking-[0.1em] uppercase text-muted-foreground max-w-2xl">
				{brandName} — Develop by Zantara Technology
			</p>
		</footer>
	);
}
