import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@locales': resolve(__dirname, 'src/locales.json'),
    },
  },
  server: {
    port: 3001,
    host: 'localhost',
    fs: {
      strict: false,
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'lightweight-charts',
      'react-hook-form',
      '@hookform/resolvers/zod',
      'zod',
      'sockjs-client',
      '@stomp/stompjs',
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
