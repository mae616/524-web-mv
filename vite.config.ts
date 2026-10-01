import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // GitHub Pagesなどのサブディレクトリデプロイにも対応
  server: {
    port: 3000,
    open: false,
  },
});
