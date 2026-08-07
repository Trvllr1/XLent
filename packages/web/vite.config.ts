import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4200,
    proxy: {
      '/models': {
        target: 'http://localhost:4100',
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) return req.url;
        },
      },
      '/clients': 'http://localhost:4100',
      '/health': 'http://localhost:4100',
      '/understand': 'http://localhost:4100',
      '/sensitivity': 'http://localhost:4100',
      '/tests': 'http://localhost:4100',
    },
  },
});
