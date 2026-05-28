import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		react(),
		TanStackRouterVite(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: "Djiwa Tentram App",
				short_name: "Djiwa App",
				description: "Pesan menu favorit dari meja.",
				theme_color: "#fefefe",
				background_color: "#ffffff",
				display: "standalone",
				start_url: "/djiwatentram",
				scope: "/",
				orientation: "portrait",
				icons: [
					{
						src: "/pwa-app-192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "/pwa-app-512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
			workbox: {
				navigateFallback: "/index.html",
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === "navigate",
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
						handler: "StaleWhileRevalidate",
						options: {
							cacheName: "menu-assets",
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
