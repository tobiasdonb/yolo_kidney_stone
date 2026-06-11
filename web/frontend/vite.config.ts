import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config — dev server proxies /api → backend (default http://localhost:8000)
// so the browser sees same-origin requests and CORS is not relevant in dev.
// See: design.md → External API Contract → CORS; Catatan Dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
