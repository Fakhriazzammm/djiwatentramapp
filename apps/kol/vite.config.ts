import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
export default defineConfig({plugins:[react(),tailwindcss(),VitePWA({registerType:"autoUpdate",manifest:{name:"Djiwa KOL",short_name:"Djiwa KOL",description:"Pendaftaran creator partner Djiwa Tentram",theme_color:"#2f80ed",background_color:"#f5f5f7",display:"standalone",start_url:"/",icons:[{src:"/logo-djiwa.png",sizes:"200x200",type:"image/png",purpose:"any maskable"}]},workbox:{navigateFallback:"/index.html",globPatterns:["**/*.{js,css,html,svg,webmanifest}"]}})],resolve:{alias:{"@":path.resolve(__dirname,"src")}},server:{port:3010}});
