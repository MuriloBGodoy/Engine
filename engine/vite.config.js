import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // `prompt` em vez de `autoUpdate`: com atualização silenciosa o app pode
      // recarregar no meio de um formulário. Aqui o service worker novo espera
      // e o usuário decide, por um aviso discreto (ver usePwaUpdate).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Engine — sua garagem e sua meta',
        short_name: 'Engine',
        description:
          'Organize sua garagem, acompanhe metas e conecte-se com a comunidade automotiva.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // A barra de status acompanha o tema escuro do app; a splash usa o
        // mesmo fundo pra abertura não piscar branco.
        theme_color: '#080808',
        background_color: '#080808',
        orientation: 'portrait-primary',
        categories: ['lifestyle', 'social', 'finance'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // O bundle principal passa de 2 MB e o limite padrão do Workbox é
        // exatamente 2 MiB: sem isto o arquivo mais importante do app ficaria
        // de fora do precache, e o PWA abriria online-only.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // SPA: qualquer rota cai no index.html.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            // As fontes vêm do Google e mudam quase nunca.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Fotos de carro e avatar no Storage do Supabase. Todo arquivo
            // nasce com nome único e nunca é reescrito (foto nova = nome
            // novo), então o cache pode responder sem perguntar à rede.
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'engine-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Desligado no dev: service worker atrapalha hot reload.
        enabled: false,
      },
    }),
  ],
})
