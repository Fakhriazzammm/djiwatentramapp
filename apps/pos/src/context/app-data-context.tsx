import { createContext, useContext, type ReactNode } from "react";
import {
	useHybridActiveDiscounts,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";

type SiteSettings = ReturnType<typeof useHybridSiteSettings>;
type ActiveDiscounts = ReturnType<typeof useHybridActiveDiscounts>;

interface AppDataContextType {
	siteSettings: SiteSettings;
	activeDiscounts: ActiveDiscounts;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
	const siteSettings = useHybridSiteSettings();
	const activeDiscounts = useHybridActiveDiscounts();

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
