import { useYumiAuth } from "./useYumiAuth";
import { setDemoMode } from "../lib/utils/demo-mask";

const DEMO_ROLE_NAME = "CLIENT_VIEWER";

/**
 * Hook to detect if current user is a client viewer (demo mode).
 * When active, all numbers in the UI are masked.
 */
export function useDemoMode() {
	const { role, isAuthenticated, isLoading } = useYumiAuth();
	const isDemoViewer = isAuthenticated && !isLoading && role?.name === DEMO_ROLE_NAME;

	// Sync to global demo mode state
	if (typeof window !== "undefined") {
		setDemoMode(isDemoViewer);
	}

	// Sync CSS class to document
	if (typeof document !== "undefined") {
		if (isDemoViewer) {
			document.documentElement.classList.add("demo-mode");
		} else {
			document.documentElement.classList.remove("demo-mode");
		}
	}

	return { isDemoViewer };
}
