import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      manifest: {
        name: 'DepomTakip Depo ve Sayım Sistemi',
        short_name: 'DepomTakip',
        description:
          'Depo, barkod, kor sayim ve saha operasyon sistemi',

        start_url: '/',
        scope: '/',
        display: 'standalone',

        background_color: '#ffffff',
        theme_color: '#ffffff',

        orientation: 'portrait-primary',

        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },

      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        navigateFallback: '/index.html',

        globPatterns: [
          '**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff,woff2}'
        ],

        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'image',

            handler: 'CacheFirst',

            options: {
              cacheName: 'depomtakip-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      },

      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],

  server: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    port: 5173,
    strictPort: true,

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      }
    }
  }
});
