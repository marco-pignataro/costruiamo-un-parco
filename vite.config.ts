import { defineConfig } from 'vite';
import { GAME_TITLE } from './src/config.ts';

// base relativa: il gioco funziona sia su GitHub Pages sia in una sottocartella
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  plugins: [
    {
      name: 'titolo-del-gioco',
      transformIndexHtml: (html) => html.replaceAll('%GAME_TITLE%', GAME_TITLE),
    },
  ],
});
