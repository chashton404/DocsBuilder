import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration for the React frontend.
 *
 * During `npm run dev`, the dev server listens on port 5173 (default). Requests to
 * `/api/*` are forwarded to the Flask backend on port 5000 so the browser can use
 * relative URLs like `fetch('/api/preview')` without CORS issues.
 *
 * Production builds (`npm run build`) emit static files under `dist/`; you usually
 * serve those behind a reverse proxy that also routes `/api` to Flask.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
