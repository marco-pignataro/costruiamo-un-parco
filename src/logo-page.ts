import { GAME_FULL_TITLE, GAME_SUBTITLE, GAME_TITLE } from './config';
import { logoDataUrl } from './game/logo';

// Pagina del logo (logo.html): anteprima, prove di sottotitolo, PNG da scaricare.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const main = $<HTMLImageElement>('main');
const input = $<HTMLInputElement>('sub');
let scale = 4;
input.value = GAME_SUBTITLE;
main.alt = GAME_FULL_TITLE;

const subtitle = () => input.value.trim() || null;

function render() {
  main.src = logoDataUrl(subtitle(), scale);
  const downloads = $('downloads');
  downloads.textContent = '';
  for (const s of [1, 4, 8]) {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = logoDataUrl(subtitle(), s);
    a.download = `gloves-on${subtitle() ? '-' + subtitle()!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''}-${s}x.png`;
    a.textContent = `${s}×`;
    downloads.appendChild(a);
  }
  for (const b of $('scales').children) b.classList.toggle('on', (b as HTMLElement).dataset.s === String(scale));
}

for (const s of [2, 3, 4, 6]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.s = String(s);
  b.textContent = `${s}×`;
  b.addEventListener('click', () => { scale = s; render(); });
  $('scales').appendChild(b);
}
input.addEventListener('input', render);
$('none').addEventListener('click', () => { input.value = ''; render(); });
for (const [id, dark] of [['light', false], ['dark', true]] as const) {
  $(id).addEventListener('click', () => {
    $('stage').classList.toggle('dark', dark);
    $('light').classList.toggle('on', !dark);
    $('dark').classList.toggle('on', dark);
  });
}

const variants: [string | null, string][] = [
  [GAME_SUBTITLE, 'Sottotitolo attuale'],
  [null, 'Solo il marchio (intestazione del gioco)'],
  ['Il giardino della scuola', 'Esempio di variante'],
  ['Città più verdi: è così!', 'Accenti e punteggiatura'],
];
for (const [sub, caption] of variants) {
  const f = document.createElement('figure');
  const stage = document.createElement('div');
  stage.className = 'stage';
  const img = document.createElement('img');
  img.src = logoDataUrl(sub, 2);
  img.alt = sub ? `${GAME_TITLE} ${sub}` : GAME_TITLE;
  stage.appendChild(img);
  const cap = document.createElement('figcaption');
  cap.textContent = sub ? `${caption}: “${sub}”` : caption;
  f.append(stage, cap);
  $('variants').appendChild(f);
}
render();
