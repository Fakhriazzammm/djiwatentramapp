import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), TanStackRouterVite(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"convex/server": path.resolve(
				__dirname,
				"./node_modules/convex/dist/esm/server/index.js",
			),
		},
	},
	server: {
		port: 3001,
	},
});
