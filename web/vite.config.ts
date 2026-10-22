import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // The /api proxy follows PORT from .env, same as the server (empty PORT= means 3000).
  const env = loadEnv(mode, import.meta.dirname + '/..', '');
  return {
    root: import.meta.dirname,
    plugins: [react(), tailwindcss()],
    server: { proxy: { '/api': `http://localhost:${env.PORT || 3000}` } },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
