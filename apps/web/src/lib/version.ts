// Version information - updated via build script or manually
export const APP_VERSION = {
	// Release version from package.json
	semantic: "1.0.0",
	// Git commit hash (short) - updated by deploy
	commitHash: "d2d4960",
	// Build timestamp - updated by deploy
	buildDate: "2025-02-27",
	// Full version string for display
	getDisplayVersion: () => {
		return `${APP_VERSION.semantic}+${APP_VERSION.commitHash}`;
	},
	// Check if this is a development build
	isDev: import.meta.env.DEV,
} as const;

// Helper to get version info for footer
export function getAppVersionInfo() {
	return {
		version: APP_VERSION.semantic,
		commit: APP_VERSION.commitHash,
		buildDate: APP_VERSION.buildDate,
		fullVersion: APP_VERSION.getDisplayVersion(),
	};
}
