import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: { sourcemap: 'hidden' },
  plugins: [react()],
  server: {
    port: 3000,
    host: 'localhost',
    middlewareMode: false
  },
  // SPA routing fallback for all routes
  preview: {
    middlewareMode: false
  }
})
