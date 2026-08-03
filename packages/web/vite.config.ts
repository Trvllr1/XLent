import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      '/models': 'http://localhost:4100',
      '/health': 'http://localhost:4100',
    },
  },
});
