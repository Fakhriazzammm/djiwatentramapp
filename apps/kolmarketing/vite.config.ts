import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Djiwa Tentram KOL Marketing",
        short_name: "KOL Marketing",
        description: "Workspace operasional marketing creator Djiwa Tentram",
        theme_color: "#f5f7fb",
        background_color: "#f5f7fb",
        display: "standalone",
        start_url: "/dashboard",
        scope: "/",
        icons: [{ src: "/logo-djiwa.png", sizes: "200x200", type: "image/png", purpose: "any maskable" }],
      },
      workbox: {
        cacheId: "djiwa-kolmarketing-v1",
        navigateFallback: "/index.html",
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 3012 },
});
