import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc } from "@yumipos/backend/convex/_generated/dataModel";

type SiteSettings = NonNullable<ReturnType<typeof useQuery<typeof api.site_settings.getSettings>>>;
type ActiveDiscount = Doc<"discounts">;

interface AppDataContextType {
	siteSettings: SiteSettings | undefined;
	activeDiscounts: ActiveDiscount[] | undefined;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
	const siteSettings = useQuery(api.site_settings.getSettings);
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);

	return (
		<AppDataContext.Provider value={{ siteSettings, activeDiscounts }}>
			{children}
		</AppDataContext.Provider>
	);
}

export function useAppData() {
	const ctx = useContext(AppDataContext);
	if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
	return ctx;
}
