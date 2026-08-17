import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { customerPwaSettings } from "./src/pwa-settings";

export default defineConfig({
	plugins: [
		react(),
		TanStackRouterVite(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: customerPwaSettings.name,
				short_name: customerPwaSettings.short_name,
				description: customerPwaSettings.description,
				theme_color: customerPwaSettings.theme_color,
				background_color: customerPwaSettings.background_color,
				display: "standalone",
				start_url: customerPwaSettings.start_url,
				scope: "/",
				orientation: customerPwaSettings.orientation,
				icons: [
					{
						src: customerPwaSettings.icon192,
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: customerPwaSettings.icon512,
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
			workbox: {
				navigateFallback: "/index.html",
				// Jangan sajikan SPA (index.html) untuk navigasi ke /api/* —
				// biarkan lewat ke nginx→better-auth (mis. callback OAuth Google).
				navigateFallbackDenylist: [/^\/api\//],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				globPatterns: ["**/*.{js,css,html,png,svg,gif,ico,webmanifest}"],
				skipWaiting: true,
				clientsClaim: true,
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{
						urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
						handler: "NetworkFirst",
						options: {
							cacheName: "menu-pages",
							networkTimeoutSeconds: 5,
							expiration: { maxEntries: 10, maxAgeSeconds: 120 },
						},
					},
					{
						urlPattern: /\.(?:png|jpg|jpeg|webp|svg|gif)$/,
						handler: "CacheFirst",
						options: {
							cacheName: "menu-images",
							expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
						},
					},
					{
						urlPattern: /\.(?:js|css)$/,
						handler: "NetworkFirst",
						options: {
							cacheName: "menu-assets",
							networkTimeoutSeconds: 5,
							expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
						},
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 3004,
	},
});
