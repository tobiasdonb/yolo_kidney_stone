/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL for the External Inference API (e.g. "/api" in dev so Vite proxy
   * forwards to http://localhost:8000). Override per-environment via
   * `.env`, `.env.development`, or `.env.production`.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
