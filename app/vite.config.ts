import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Em desenvolvimento, o Vite serve a página e repassa para o servidor do editor (porta 4175)
// a API, as fotos guardadas, as miniaturas das peças e a fonte da marca.
const API = 'http://127.0.0.1:4175';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: { '/api': API, '/biblioteca': API, '/pecas': API, '/fonts': API, '/tokens.css': API },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
