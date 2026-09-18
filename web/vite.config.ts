import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// Served by FastAPI from app/static/dist at /next/ while the old templates stay live at /.
// Flip `base` to '/' when the new app replaces them (the PWA manifest and SW scope follow `base`).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png'],
      manifest: {
        name: 'Money',
        short_name: 'Money',
        description: 'Personal ledger',
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
        // App shell for client routes; never intercept the API, exports, receipts or the legacy pages.
        navigateFallback: '/next/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/export\//, /^\/static\//, /^\/(?!next)/],
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
  base: '/next/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: '../app/static/dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
