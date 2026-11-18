import { defineConfig } from 'vite';

export default defineConfig({
  base: '/3rd/',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
