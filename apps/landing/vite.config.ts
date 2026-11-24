import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/lantern/',
  build: {
    outDir: 'dist/lantern',
  },
  server: {
    proxy: {
      '/lantern/api': 'http://localhost:8787',
    },
  },
  plugins: [vue()],
})
