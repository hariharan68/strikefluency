import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'
  const wsTarget = env.VITE_WS_PROXY_TARGET || apiTarget.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // The authenticated market socket lives at /api/v1/market/ws, so the
        // normal API proxy must explicitly support HTTP Upgrade requests.
        '/api': { target: apiTarget, changeOrigin: true, ws: true },
        '/ws': { target: wsTarget, ws: true }
      }
    }
  }
})
