import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7860',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:7860',
        changeOrigin: true,
        secure: false,
      },
      '/v1': {
        target: 'http://localhost:7860',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
