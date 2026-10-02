import { defineConfig } from 'vite'

export default defineConfig({
  // Fixed port so this app never shares a port with other local Vite projects.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
