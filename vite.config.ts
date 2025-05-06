import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  },
  optimizeDeps: {
    include: [
      'react', 
      'react-dom',
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled'
    ],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  base: '/',
  esbuild: {
    jsxInject: `import React from 'react'`
  }
})