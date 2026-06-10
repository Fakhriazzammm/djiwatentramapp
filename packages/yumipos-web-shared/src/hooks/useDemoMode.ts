import { useEffect } from "react";
import { setDemoMode } from "../lib/utils/demo-mask";

/**
 * Hook to activate demo mode (number masking).
 * Accepts a boolean flag — the parent decides when to activate.
 * 
 * @example
 * const { role } = useYumiAuth();
 * useDemoMode(role?.name === "CLIENT_VIEWER");
 */
export function useDemoMode(isDemoViewer: boolean) {
	useEffect(() => {
		setDemoMode(isDemoViewer);
		if (isDemoViewer) {
			document.documentElement.classList.add("demo-mode");
		} else {
			document.documentElement.classList.remove("demo-mode");
		}
	}, [isDemoViewer]);
}
