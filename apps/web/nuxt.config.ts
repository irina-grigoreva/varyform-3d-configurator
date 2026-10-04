export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'VARYFORM — Parametric 3D Product Configurator',
      meta: [
        {
          name: 'description',
          content: 'Configure. Visualize. Manufacture. Parametric 3D product configurator with technical drawings, BOM, live pricing and PDF/DXF export.',
        },
      ],
    },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
      wordpressUrl: process.env.NUXT_PUBLIC_WORDPRESS_URL ?? '',
    },
  },
  build: {
    transpile: ['@varyform/domain'],
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
})
