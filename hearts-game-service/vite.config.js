import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: process.env.NODE_ENV === 'production' ? '/hearts/dist/' : '/dist/',
  build: {
    outDir: 'public/dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/hearts/socket.io': {
        target: 'http://localhost:3004',
        ws: true,
        changeOrigin: true
      },
      '/hearts/api': {
        target: 'http://localhost:3004',
        changeOrigin: true
      }
    }
  },
  publicDir: false, // Disable copying public folder since we're building into it
  root: '.'
})