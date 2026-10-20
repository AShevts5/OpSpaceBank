import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA: манифест + service worker (Workbox). Оболочка, шрифты, картинки и вся
// логика задач кешируются при установке — приложение открывается и решает задачи без сети.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'art/*.svg', 'favicon.svg'],
      manifest: {
        name: 'OpSpaceBank — помощник банка',
        short_name: 'OpSpaceBank',
        description: 'Дискретная математика в бизнес-процессах банка: пошаговые решения, наводящие вопросы и AI-консультант.',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#03241A',
        theme_color: '#063A2A',
        categories: ['finance', 'education', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Кредитная заявка', url: '/#/task/1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Сегмент «Премиум»', url: '/#/task/2', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Премиальная карта', url: '/#/task/3', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // справочные GET-запросы API: сначала сеть, без сети — последний ответ
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/v1/') && !url.pathname.includes('/auth/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('avatars.yandex.net'),
            handler: 'CacheFirst',
            options: { cacheName: 'avatars', expiration: { maxEntries: 20 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
})
