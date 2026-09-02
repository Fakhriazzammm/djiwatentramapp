import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { marketplacePwaSettings } from "./src/pwa-settings";

export default defineConfig({
	plugins: [
		react(),
		TanStackRouterVite(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: marketplacePwaSettings.name,
				short_name: marketplacePwaSettings.short_name,
				description: marketplacePwaSettings.description,
				theme_color: marketplacePwaSettings.theme_color,
				background_color: marketplacePwaSettings.background_color,
				display: "standalone",
				start_url: marketplacePwaSettings.start_url,
				scope: "/",
				orientation: marketplacePwaSettings.orientation,
				icons: [
					{
						src: marketplacePwaSettings.icon192,
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: marketplacePwaSettings.icon512,
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
							cacheName: "marketplace-pages",
							networkTimeoutSeconds: 5,
							expiration: { maxEntries: 10, maxAgeSeconds: 120 },
						},
					},
					{
						urlPattern: /\.(?:png|jpg|jpeg|webp|svg|gif)$/,
						handler: "CacheFirst",
						options: {
							cacheName: "marketplace-images",
							expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
						},
					},
					{
						urlPattern: /\.(?:js|css)$/,
						handler: "NetworkFirst",
						options: {
							cacheName: "marketplace-assets",
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
		port: 3003,
	},
});
