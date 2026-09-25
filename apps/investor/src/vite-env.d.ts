/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INVESTOR_AUTH_URL?: string;
  readonly VITE_INVESTOR_API_URL?: string;
}

interface ImportMeta { readonly env: ImportMetaEnv }
