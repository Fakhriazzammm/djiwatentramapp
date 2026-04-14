import { useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { APP_VERSION } from "../../lib/version";

export function Footer({ className = "" }: { className?: string }) {
	const settings = useQuery(api.site_settings.getSettings);
	const brandName = settings?.storeName || "Djiwa Tentram";
	
	return (
		<footer className={`flex flex-col items-center justify-center p-6 opacity-30 text-center ${className}`}>
			<p className="text-[9px] font-black tracking-[0.1em] uppercase text-muted-foreground max-w-2xl">
				Versi {APP_VERSION.semantic} Yumi Pos - {brandName} - Develop by Zantara Technology
			</p>
		</footer>
	);
}
