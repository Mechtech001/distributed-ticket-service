import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy all /api and /socket.io requests to the Gateway running in Docker
    // This avoids CORS entirely - the browser sees it as same-origin
    proxy: {
      '/api': {
        target: 'http://gateway:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://gateway:3000',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      },
    },
  },
})
