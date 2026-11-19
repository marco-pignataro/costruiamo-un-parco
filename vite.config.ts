import { defineConfig } from 'vite';
import { GAME_FULL_TITLE } from './src/config.ts';

// base relativa: il gioco funziona sia su GitHub Pages sia in una sottocartella
export default defineConfig({
  base: './',
  // logo.html: il logo da solo, con le varianti del sottotitolo e il PNG da scaricare.
  // anteprima-grafica.html: la scena di prova della grafica, con il logo e i volontari del gioco.
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: 'index.html', logo: 'logo.html', anteprima: 'anteprima-grafica.html' } },
  },
  plugins: [
    {
      name: 'titolo-del-gioco',
      transformIndexHtml: (html) => html.replaceAll('%GAME_TITLE%', GAME_FULL_TITLE),
    },
  ],
});
