import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5173
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  base: '/',
  // 👇 this is the key part for SPA routing
  esbuild: {
    jsxInject: `import React from 'react'`
  }
})
