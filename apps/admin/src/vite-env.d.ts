/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_APP_BASE_URL: string;
  readonly VITE_TELEGRAM_BOT_URL?: string;
  readonly VITE_TELEGRAM_REPORT_CHAT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/* trigger rebuild with self-hosted supabase */
