import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Served by FastAPI from app/static/dist at / (the Jinja pages were retired 2026-09-18).
// The PWA manifest and service-worker scope follow `base`.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png'],
      manifest: {
        name: 'Tally',
        short_name: 'Tally',
        description: 'Personal ledger. Every dollar, tallied.',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell for client routes; never intercept the API or the CSV exports.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/export\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/receipts/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 4, expiration: { maxEntries: 60, maxAgeSeconds: 7 * 86400 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/receipts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'receipts', expiration: { maxEntries: 200, maxAgeSeconds: 90 * 86400 } },
          },
        ],
      },
    }),
  ],
  base: '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: '../app/static/dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
