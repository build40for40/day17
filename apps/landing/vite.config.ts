import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/day17/',
  build: {
    outDir: 'dist/day17',
  },
  server: {
    proxy: {
      '/day17/api': 'http://localhost:8787',
    },
  },
  plugins: [vue()],
})
