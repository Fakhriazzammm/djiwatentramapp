import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";

type HomeSearchBarProps = {
	searchQuery: string;
	onSearchChange: (q: string) => void;
	userSlug?: string;
	userName?: string;
};

export function HomeSearchBar({
	searchQuery,
	onSearchChange,
	userSlug,
	userName,
}: HomeSearchBarProps) {
	const initial = userName?.charAt(0)?.toUpperCase() ?? "?";
	const profileTo = userSlug
		? (`/karyawan/${userSlug}` as any)
		: ("/attendance" as any);

	return (
		<div className="flex items-center gap-2 mb-4">
			{/* Search input */}
			<div className="relative flex-1">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
				<input
					type="text"
					value={searchQuery}
					onChange={(e: any) => onSearchChange(e.target.value)}
					placeholder="Cari menu, pesanan…"
					className="w-full rounded-xl bg-muted/50 pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 border border-border/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
				/>
			</div>

			{/* Avatar button */}
			<Link
				to={profileTo}
				className="relative shrink-0 active:scale-95 transition-transform"
			>
				<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-400 text-sm font-black text-white shadow-sm">
					{initial}
				</div>
			</Link>
		</div>
	);
}
