import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // three.js, drei and postprocessing make the 3D chunk about 450 kB gzipped; it is lazy-loaded per surface
  build: { chunkSizeWarningLimit: 1600 },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
