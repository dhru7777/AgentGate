/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONAD_RPC_URL?: string;
  readonly VITE_BLOG_ANALYTICS_KEY?: string;
  readonly VITE_BOT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
