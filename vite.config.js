import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // host:true → reachable from your phone on the same Wi-Fi (needed to load it inside Nimiq Pay)
  server: { host: true, port: 5173, allowedHosts: true },
})
