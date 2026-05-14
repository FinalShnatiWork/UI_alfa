import { defineConfig } from 'vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Addresses considered "localhost" for the admin page guard */
const LOCALHOST = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Vite plugin: blocks /pages/admin.html for non-local connections */
function adminLocalhostGuard() {
  return {
    name: 'admin-localhost-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/pages/admin.html' || url.startsWith('/pages/admin.html')) {
          const ip = req.socket.remoteAddress ?? '';
          if (!LOCALHOST.has(ip)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'text/html;charset=UTF-8');
            res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:80px">
              <h1>403 – Forbidden</h1>
              <p>Admin page is only accessible from <strong>localhost</strong>.</p>
            </body></html>`);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  plugins: [adminLocalhostGuard()],
  resolve: {
    alias: {
      '@locales': resolve(__dirname, 'public/locales.json'),
    },
  },
  server: {
    port: 3000,
    host: '127.0.0.1',   // bind to loopback only — not reachable from the network
    open: '/pages/landing.html',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/binance': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance/, ''),
      },
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'src/pages/landing.html'),
        login: resolve(__dirname, 'src/pages/login.html'),
        register: resolve(__dirname, 'src/pages/register.html'),
        dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
        positions: resolve(__dirname, 'src/pages/positions.html'),
        charts: resolve(__dirname, 'src/pages/charts.html'),
        finance: resolve(__dirname, 'src/pages/finance.html'),
        history: resolve(__dirname, 'src/pages/history.html'),
        account: resolve(__dirname, 'src/pages/account.html'),
        settings: resolve(__dirname, 'src/pages/settings.html'),
        demoRegister: resolve(__dirname, 'src/pages/demo-register.html'),
      },
    },
  },
});
