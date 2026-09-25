import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import { adminPwaSettings } from "./src/pwa-settings";

export default defineConfig({
	plugins: [
		react(),
		TanStackRouterVite(),
		tailwindcss(),
		VitePWA({
			registerType: "prompt",
			includeAssets: ["logo.png", "vite.svg"],
			manifest: {
				name: adminPwaSettings.name,
				short_name: adminPwaSettings.short_name,
				description: adminPwaSettings.description,
				theme_color: adminPwaSettings.theme_color,
				background_color: adminPwaSettings.background_color,
				display: "standalone",
				start_url: adminPwaSettings.start_url,
				scope: "/",
				orientation: adminPwaSettings.orientation,
				icons: [
					{
						src: adminPwaSettings.icon192,
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: adminPwaSettings.icon512,
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: adminPwaSettings.icon512,
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				cacheId: "djiwa-admin-booking-v3",
				importScripts: ["/push-sw.js"],
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
