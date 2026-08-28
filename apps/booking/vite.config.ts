import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Booking Djiwa Tentram",
        short_name: "Booking",
        description: "Booking meja dan pre-order menu Djiwa Tentram.",
        theme_color: "#1a5dc6",
        background_color: "#f7f9fc",
        display: "standalone",
        start_url: "/",
        scope: "/",
        orientation: "portrait",
      },
      workbox: {
        cacheId: "djiwa-booking-v7",
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,webmanifest,svg,png}"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 3010 },
});
