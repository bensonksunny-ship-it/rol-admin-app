# PWA — Installable + Resilient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the ROL Admin app into an installable PWA with standalone fullscreen mode, app-shell caching, and a graceful offline banner.

**Architecture:** `vite-plugin-pwa` + Workbox handles the service worker and manifest injection at build time. PNG icons are generated once from an SVG master via a `sharp` script. An `OfflineBanner` React component listens to `navigator.onLine` and renders a fixed bottom bar when offline.

**Tech Stack:** vite-plugin-pwa 0.21+, Workbox (bundled), sharp (icon generation only), React 19, Vite 7

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/generate-icons.cjs` | Create | One-time Node script: SVG → PNG at 4 sizes |
| `public/favicon.svg` | Replace | Browser-tab icon (replaces vite.svg) |
| `public/icons/pwa-192.png` | Create (generated) | Android home screen icon |
| `public/icons/pwa-512.png` | Create (generated) | Android splash / Play Store |
| `public/icons/pwa-512-maskable.png` | Create (generated) | Android adaptive icon |
| `public/icons/apple-touch-icon.png` | Create (generated) | iOS home screen icon |
| `src/components/OfflineBanner.jsx` | Create | Fixed bottom offline notification |
| `src/App.jsx` | Modify | Mount `<OfflineBanner />` inside `<ErrorBoundary>` |
| `index.html` | Modify | Add PWA + Apple meta tags |
| `vite.config.js` | Modify | Add `VitePWA` plugin with manifest + Workbox config |
| `package.json` | Modify | Add `vite-plugin-pwa`, `sharp` to devDependencies |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install vite-plugin-pwa and sharp**

```bash
cd "C:\Users\User\Documents\ROL Admin app"
npm install -D vite-plugin-pwa sharp
```

Expected output ends with: `added N packages` — no errors.

- [ ] **Step 2: Verify installs**

```bash
node -e "require('./node_modules/vite-plugin-pwa/package.json').version" && echo ok
node -e "require('./node_modules/sharp/package.json').version" && echo ok
```

Expected: two version strings printed, both followed by `ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vite-plugin-pwa and sharp dev dependencies"
```

---

## Task 2: Create icon generation script and generate icons

**Files:**
- Create: `scripts/generate-icons.cjs`
- Create: `public/icons/` (directory + 4 PNG files)

- [ ] **Step 1: Create the scripts directory**

```bash
mkdir -p "C:\Users\User\Documents\ROL Admin app\scripts"
mkdir -p "C:\Users\User\Documents\ROL Admin app\public\icons"
```

- [ ] **Step 2: Write `scripts/generate-icons.cjs`**

Create the file with this exact content:

```javascript
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="360" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="320" fill="white" text-anchor="middle">R</text>
</svg>`

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="320" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="240" fill="white" text-anchor="middle">R</text>
</svg>`

async function generate() {
  await sharp(Buffer.from(standardSvg)).resize(192, 192).png().toFile(path.join(outDir, 'pwa-192.png'))
  console.log('✓ pwa-192.png')
  await sharp(Buffer.from(standardSvg)).resize(512, 512).png().toFile(path.join(outDir, 'pwa-512.png'))
  console.log('✓ pwa-512.png')
  await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(path.join(outDir, 'pwa-512-maskable.png'))
  console.log('✓ pwa-512-maskable.png')
  await sharp(Buffer.from(standardSvg)).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')
  console.log('\nAll icons generated.')
}

generate().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run the script**

```bash
cd "C:\Users\User\Documents\ROL Admin app"
node scripts/generate-icons.cjs
```

Expected output:
```
✓ pwa-192.png
✓ pwa-512.png
✓ pwa-512-maskable.png
✓ apple-touch-icon.png

All icons generated.
```

- [ ] **Step 4: Verify files exist**

```bash
ls public/icons/
```

Expected: `apple-touch-icon.png  pwa-192.png  pwa-512-maskable.png  pwa-512.png`

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-icons.cjs public/icons/
git commit -m "feat: add PWA icon set (192, 512, maskable, apple-touch)"
```

---

## Task 3: Add favicon.svg

**Files:**
- Create: `public/favicon.svg`

- [ ] **Step 1: Write `public/favicon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="url(#bg)"/>
  <text x="16" y="24" font-family="Georgia, serif" font-weight="900" font-size="22" fill="white" text-anchor="middle">R</text>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add public/favicon.svg
git commit -m "feat: add ROL favicon SVG"
```

---

## Task 4: Update index.html with PWA meta tags

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the `<head>` content of `index.html`**

Replace the entire `<head>` block with:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

    <!-- PWA / install -->
    <meta name="theme-color" content="#0f172a" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="manifest" href="/manifest.webmanifest" />

    <!-- iOS standalone -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="River Of Life" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

    <!-- Icon / tab -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

    <title>River Of Life Admin App</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap" rel="stylesheet" />
  </head>
```

Note: `vite-plugin-pwa` will also auto-inject its own `<link rel="manifest">` — having it here explicitly is fine and harmless; the plugin deduplicates.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add PWA and Apple meta tags to index.html"
```

---

## Task 5: Create OfflineBanner component

**Files:**
- Create: `src/components/OfflineBanner.jsx`

- [ ] **Step 1: Write `src/components/OfflineBanner.jsx`**

```jsx
import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center gap-3 text-sm shadow-lg">
      <span className="text-base" aria-hidden="true">📡</span>
      <span>You're offline — live data unavailable. Reconnect to sync.</span>
    </div>
  )
}
```

- [ ] **Step 2: Verify it renders in isolation (dev server)**

The dev server should already be running on port 5177. Open browser DevTools → Network tab → set throttling to **Offline**. Navigate to any page — the banner should appear at the bottom. Set throttling back to **No throttling** — banner disappears.

- [ ] **Step 3: Commit**

```bash
git add src/components/OfflineBanner.jsx
git commit -m "feat: add OfflineBanner component for offline detection"
```

---

## Task 6: Mount OfflineBanner in App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add import to App.jsx**

Add this import after the existing component imports (around line 26):

```jsx
import OfflineBanner from './components/OfflineBanner'
```

- [ ] **Step 2: Mount OfflineBanner inside ErrorBoundary**

In the `App` function, add `<OfflineBanner />` as the last child inside `<ErrorBoundary>`, after `</Routes>`:

```jsx
        <ErrorBoundary>
          <Routes>
            {/* ... all existing routes unchanged ... */}
          </Routes>
          <OfflineBanner />
        </ErrorBoundary>
```

- [ ] **Step 3: Verify in browser**

With dev server running, open DevTools → Network → Offline. The banner `You're offline — live data unavailable.` should appear at the bottom across all routes including `/login`. Switch back to Online — banner gone.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: mount OfflineBanner in App root"
```

---

## Task 7: Configure vite-plugin-pwa

**Files:**
- Modify: `vite.config.js`

- [ ] **Step 1: Replace `vite.config.js` with full PWA config**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
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
```

- [ ] **Step 2: Build to verify config is valid**

```bash
cd "C:\Users\User\Documents\ROL Admin app"
npm run build 2>&1
```

Expected: build completes with no errors. Output should include lines like:
```
PWA v0.x.x
mode      generateSW
...
```

If you see `Cannot find module 'vite-plugin-pwa'`, re-run `npm install` first.

- [ ] **Step 3: Verify manifest and service worker in build output**

```bash
ls dist/
```

Expected to include: `manifest.webmanifest`, `sw.js`, `workbox-*.js`

```bash
node -e "const m=require('./dist/manifest.webmanifest'); console.log(m.name, m.display, m.icons.length)"
```

Expected: `River Of Life Admin App standalone 3`

- [ ] **Step 4: Commit**

```bash
git add vite.config.js
git commit -m "feat: configure vite-plugin-pwa with Workbox app shell caching"
```

---

## Task 8: Verify PWA in browser

**Files:** none — verification only

- [ ] **Step 1: Run production preview**

```bash
cd "C:\Users\User\Documents\ROL Admin app"
npm run preview
```

Expected: server starts on `http://localhost:4173` (or similar). Note the port.

- [ ] **Step 2: Open Chrome DevTools — Application tab**

Navigate to `http://localhost:4173`. Open DevTools → **Application** tab.

Check:
- **Manifest** section: name = "River Of Life Admin App", icons show 3 entries with previews
- **Service Workers** section: a service worker is registered and shows **Status: activated and is running**
- **Cache Storage** section: entries for `workbox-precache-*` and `google-fonts-cache` appear

- [ ] **Step 3: Run Lighthouse PWA audit**

DevTools → **Lighthouse** tab → select **Progressive Web App** category only → **Analyze page load**.

Expected: all PWA checks pass (green). Key ones:
- ✅ Registers a service worker
- ✅ Responds with a 200 when offline
- ✅ Has a `<meta name="viewport">` tag
- ✅ Has a valid `manifest.webmanifest`
- ✅ Provides icons for Add to Home Screen

- [ ] **Step 4: Test offline cache**

In DevTools → Network tab → set throttling to **Offline**. Hard-reload (`Ctrl+Shift+R`).

Expected: app still loads from service worker cache. You will see Firebase errors in console (expected — live data needs network). The offline banner appears at the bottom.

- [ ] **Step 5: Test offline banner behaviour**

With dev server running (`npm run dev`):
- DevTools → Network → **Offline** — banner appears within ~1 second
- Network → **No throttling** — banner disappears automatically

Note: service worker only activates in production builds. Use `npm run preview` for full SW testing; `npm run dev` tests the banner component only.

- [ ] **Step 6: Final commit and deploy**

```bash
cd "C:\Users\User\Documents\ROL Admin app"
npm run deploy
```

This runs `npm run build && firebase deploy`. Confirm successful deploy output.

- [ ] **Step 7: Smoke test on mobile**

On an Android phone with Chrome:
1. Navigate to the deployed URL
2. After a few seconds Chrome shows "Add to Home Screen" banner — tap it
3. Open the installed app — it should open fullscreen with no browser chrome
4. The splash screen shows dark navy background

On iOS Safari:
1. Navigate to the deployed URL
2. Tap Share → "Add to Home Screen"
3. The icon shows the "R" monogram, title shows "River Of Life"
4. Tap the icon — app opens in standalone mode

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Full PWA install support | Task 7 (manifest + SW) |
| Standalone fullscreen mode | Task 7 (`display: standalone`) |
| App shell caching | Task 7 (Workbox precache) |
| Cache HTML/CSS/JS/assets | Task 7 (`globPatterns`) |
| Firebase live data requires internet | Task 7 (NetworkOnly patterns) |
| Graceful offline message | Task 5 + 6 (OfflineBanner) |
| Fast reload performance | Task 7 (CacheFirst for shell + fonts) |
| Mobile-first (viewport-fit=cover) | Task 4 |
| Preserve Firebase architecture | No Firebase files modified |
| Upgrade path open | vite.config.js NetworkOnly → NetworkFirst when ready |
| Icon set (192, 512, maskable, Apple) | Task 2 |
| favicon.svg | Task 3 |
| Apple meta tags | Task 4 |
