/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_TG_BOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
