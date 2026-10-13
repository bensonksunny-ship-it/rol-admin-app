import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Dev only: a production service worker left registered on localhost (from a
// past build/preview on the same port) keeps serving its precached old bundle,
// and it never updates because the dev server answers /sw.js with index.html.
// Serving a self-destructing worker there replaces it on the browser's next
// update check: it clears the caches, unregisters, and reloads open tabs.
const devServiceWorkerKillSwitch = {
  name: 'dev-sw-kill-switch',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?')[0]
      if (path !== '/sw.js' && path !== '/registerSW.js') return next()
      res.setHeader('Content-Type', 'application/javascript')
      res.setHeader('Cache-Control', 'no-store')
      res.end(path === '/registerSW.js' ? '' : `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    await self.registration.unregister()
    const tabs = await self.clients.matchAll({ type: 'window' })
    tabs.forEach((tab) => tab.navigate(tab.url))
  })())
})`)
    })
  },
}

export default defineConfig({
  plugins: [
    devServiceWorkerKillSwitch,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'River Of Life Admin App',
        short_name: 'River Of Life',
        description: 'ROL Church Administration',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Main bundle passed 4 MiB (Oct 2026). Raised so it is still precached for
        // offline use; code-splitting the big pages (DepartmentHub) is the real fix.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*cloudfunctions\.net\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
