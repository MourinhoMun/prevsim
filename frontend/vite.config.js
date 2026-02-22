import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/prevsim/',
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
