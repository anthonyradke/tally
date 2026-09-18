import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Served by FastAPI from app/static/dist at /next/ while the old templates stay live at /.
// Flip `base` to '/' (and the manifest scope) when the new app replaces them.
export default defineConfig({
  plugins: [react()],
  base: '/next/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: '../app/static/dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
