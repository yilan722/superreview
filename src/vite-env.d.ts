/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FMP_API_KEY: string;
  /** Vercel Blob 公共域名，如 https://xxx.public.blob.vercel-storage.com */
  readonly VITE_ENCYCLOPEDIA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
