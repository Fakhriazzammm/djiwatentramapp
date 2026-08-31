// Admin PWA settings are intentionally separate from POS settings.
// Admin must remain portrait even if POS receives a future device-specific change.
export const adminPwaSettings = {
  name: "Djiwa Tentram Admin",
  short_name: "Djiwa Tentram Admin",
  description: "Panel administrasi Djiwa Tentram",
  theme_color: "#fefefe",
  background_color: "#ffffff",
  start_url: "/admin",
  orientation: "portrait" as const,
  icon192: "/pwa-192x192.png",
  icon512: "/pwa-512x512.png",
};
