import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: '/pages/landing.html'
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'pages/landing.html'),
        login: resolve(__dirname, 'pages/login.html'),
        register: resolve(__dirname, 'pages/register.html'),
        dashboard: resolve(__dirname, 'pages/dashboard.html'),
        positions: resolve(__dirname, 'pages/positions.html'),
        charts: resolve(__dirname, 'pages/charts.html'),
        trading: resolve(__dirname, 'pages/trading.html'),
        finance: resolve(__dirname, 'pages/finance.html'),
        history: resolve(__dirname, 'pages/history.html'),
        account: resolve(__dirname, 'pages/account.html'),
        settings: resolve(__dirname, 'pages/settings.html'),
        broker: resolve(__dirname, 'pages/broker.html'),
      }
    }
  }
});
