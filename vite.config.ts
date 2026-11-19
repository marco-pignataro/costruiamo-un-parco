import { defineConfig } from 'vite';
import { GAME_TITLE } from './src/config.ts';
import personaggi from './src/data/personaggi.json';

// I personaggi del gioco servono anche all'anteprima della grafica (public/anteprima-grafica.html):
// lo stesso file si pubblica come assets/personaggi.json, in sviluppo e nella build.
const PERSONAGGI = JSON.stringify(personaggi);

// base relativa: il gioco funziona sia su GitHub Pages sia in una sottocartella
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  plugins: [
    {
      name: 'titolo-del-gioco',
      transformIndexHtml: (html) => html.replaceAll('%GAME_TITLE%', GAME_TITLE),
    },
    {
      name: 'personaggi-per-anteprima',
      configureServer(server) {
        server.middlewares.use('/assets/personaggi.json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(PERSONAGGI);
        });
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'assets/personaggi.json', source: PERSONAGGI });
      },
    },
  ],
});
