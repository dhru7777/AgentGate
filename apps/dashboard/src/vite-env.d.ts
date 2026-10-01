/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONAD_RPC_URL?: string;
  readonly VITE_BLOG_ANALYTICS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
