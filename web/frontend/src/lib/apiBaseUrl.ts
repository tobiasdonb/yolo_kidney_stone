/**
 * Resolved base URL for the External Inference API.
 *
 * Reads `VITE_API_BASE_URL` from `import.meta.env`. Defaults to `/api` so that
 * the Vite dev proxy (configured in `vite.config.ts`) can forward requests to
 * the backend without triggering CORS.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api'
