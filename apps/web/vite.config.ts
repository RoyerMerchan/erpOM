import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { API_PORT = '3000' } = loadEnv(mode, root, 'API_');

  return {
    plugins: [vue(), tailwindcss()],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${API_PORT}` } },
    },
  };
});
