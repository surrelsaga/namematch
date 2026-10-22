import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname + '/..', '');
  // MOCK_API=1 serves a fake API from the stubs so the UI runs without the real server.
  const mock = env.MOCK_API ? [(await import('./mock-api')).mockApi()] : [];
  return {
    root: import.meta.dirname,
    plugins: [react(), tailwindcss(), ...mock],
    server: { proxy: { '/api': `http://localhost:${env.PORT ?? 3000}` } },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
