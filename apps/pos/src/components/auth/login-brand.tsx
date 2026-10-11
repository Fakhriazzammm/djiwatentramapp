import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";

/* The mark every login screen wears, from the same source the rest of the app
   uses (Admin → Settings: headerLogoUrl, then logoUrl), falling back to the
   bundled Djiwa Tentram logo so the brand is correct before settings arrive
   and stays correct when the settings query is unavailable. */
export function useLoginBrand() {
	const settings = useHybridSiteSettings();
	const appName = settings?.appName || "Djiwa Tentram";
	const logoUrl = settings?.headerLogoUrl || settings?.logoUrl || "/logo-djiwa.png";
	return { appName, logoUrl };
}

export function LoginBrandMark({ className = "h-10 w-10 rounded-xl" }: { className?: string }) {
	const { appName, logoUrl } = useLoginBrand();

	return (
		<div
			className={`flex items-center justify-center overflow-hidden border border-border/70 bg-card p-1 ${className}`}
		>
			<img alt={`Logo ${appName}`} className="h-full w-full object-contain" src={logoUrl} />
		</div>
	);
}
