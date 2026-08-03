import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4200,
    proxy: {
      '/models': 'http://localhost:4100',
      '/health': 'http://localhost:4100',
    },
  },
});
