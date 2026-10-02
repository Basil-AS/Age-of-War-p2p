import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const BUILD = process.env.GITHUB_SHA?.slice(0, 8) ?? Date.now().toString(36);

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD) },
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Age of War P2P',
        short_name: 'Age of War',
        description: 'Age of War 1v1 with a friend — peer-to-peer, no server.',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // the original art/sound/data: big, versioned by ?v=<build>, so cache-first is safe and repeat visits are instant
            urlPattern: ({ url }) => url.pathname.includes('/orig/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'orig-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2023',
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: { index: 'index.html', original: 'original.html', lite: 'lite.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
