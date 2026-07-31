import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { posPwaSettings } from "./src/pwa-settings";

export default defineConfig({
	plugins: [
		react(),
		TanStackRouterVite(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["logo.png", "vite.svg"],
			manifest: {
				name: posPwaSettings.name,
				short_name: posPwaSettings.short_name,
				description: posPwaSettings.description,
				theme_color: posPwaSettings.theme_color,
				background_color: posPwaSettings.background_color,
				display: "standalone",
				start_url: posPwaSettings.start_url,
				scope: "/",
				orientation: posPwaSettings.orientation,
				icons: [
					{
						src: posPwaSettings.icon192,
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: posPwaSettings.icon512,
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: posPwaSettings.icon512,
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				navigateFallback: "/index.html",
				maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
				globPatterns: ["**/*.{js,css,html,png,svg,gif,ico,webmanifest}"],
				skipWaiting: true,
				clientsClaim: true,
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === "navigate",
						handler: "NetworkFirst",
						options: {
							cacheName: "pos-pages",
							networkTimeoutSeconds: 3,
							expiration: { maxEntries: 5, maxAgeSeconds: 60 },
						},
					},
					{
						urlPattern: /\.(?:js|css)$/,
						handler: "NetworkFirst",
						options: {
							cacheName: "pos-assets",
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
		port: 3001,
	},
});
