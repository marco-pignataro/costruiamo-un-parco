import type * as Phaser from 'phaser';

/**
 * Pixel art generata in codice: ogni sprite è una griglia di caratteri,
 * ogni carattere un colore della palette. '.' = trasparente.
 * Serve per il prototipo; personaggi e animazioni definitive arriveranno da Aseprite.
 */
export const PALETTE: Record<string, string> = {
  h: '#3b2a1e', // capelli
  s: '#e8b48a', // pelle
  p: '#3d4a6b', // pantaloni
  b: '#2a2a2a', // scarpe
  w: '#f4f1e8', // bianco carta
  l: '#8b5a2b', // legno
  L: '#5e3b1b', // legno scuro
  g: '#9aa3ad', // metallo / plastica grigia
  r: '#e04a3a', // rosso
  y: '#e8c547', // giallo
};

/** Colori delle magliette per archetipo. */
export const SHIRTS: Record<string, string> = {
  presidente: '#c0392b',
  segretario: '#8e44ad',
  falegname: '#d35400',
  giardiniere: '#27ae60',
  comunicatore: '#2980b9',
  base: '#2e9e5b',
  studente: '#16a085',
};

const VOLUNTEER = [
  '...hhhh...',
  '..hhhhhh..',
  '..hssssh..',
  '..ssssss..',
  '...ssss...',
  '..cccccc..',
  '.cccccccc.',
  '.sccccccs.',
  '.sccccccs.',
  '..cccccc..',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..bb..bb..',
];

const TRASH = ['..ww..', '.wrrw.', 'gwwwwg', 'gggggg', '.g..g.'];

const BENCH_BROKEN = [
  '................',
  '................',
  'llll...lllll....',
  'LLLL...LLLLL.l..',
  '...........l....',
  'llllllll........',
  'LLLLLLLL..lll...',
  '.L....L.........',
  '.L....L.....L...',
  '.L..........L...',
];

const BENCH = [
  'llllllllllllllll',
  'LLLLLLLLLLLLLLLL',
  'llllllllllllllll',
  'LLLLLLLLLLLLLLLL',
  '.L............L.',
  'llllllllllllllll',
  'LLLLLLLLLLLLLLLL',
  '.L............L.',
  '.L............L.',
  '.L............L.',
];

const FENCE = [
  '.LL.....LL.....L',
  '.ll.....ll.....l',
  'llllllllllllllll',
  '.ll.....ll.....l',
  '.ll.....ll.....l',
  'llllllllllllllll',
  '.ll.....ll.....l',
  '.LL.....LL.....L',
];

const DESK = [
  '..wwww..yy......',
  '.wwwwww.yy..ww..',
  'llllllllllllllll',
  'LLLLLLLLLLLLLLLL',
  '.L............L.',
  '.L............L.',
  '.L............L.',
  '.L............L.',
];

function paint(scene: Phaser.Scene, key: string, rows: string[], extra: Record<string, string> = {}): void {
  if (scene.textures.exists(key)) return;
  const w = rows[0].length;
  const h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = extra[ch] ?? PALETTE[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  tex.refresh();
}

/** Piccolo generatore pseudo-casuale con seme: la stessa mappa ogni volta. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tile(scene: Phaser.Scene, key: string, base: string, dots: string[], density: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  const rand = rng(seed);
  for (let i = 0; i < 256 * density; i++) {
    ctx.fillStyle = dots[Math.floor(rand() * dots.length)];
    ctx.fillRect(Math.floor(rand() * 16), Math.floor(rand() * 16), 1, rand() < 0.5 ? 1 : 2);
  }
  tex.refresh();
}

/** Lo Stretto sullo sfondo: cielo, costa calabra e mare. */
function backdrop(scene: Phaser.Scene, w: number, h: number): void {
  if (scene.textures.exists('stretto')) return;
  const tex = scene.textures.createCanvas('stretto', w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const sky = ['#cfeaf6', '#b8e0f2', '#a8d8f0'];
  sky.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 6, w, 6);
  });
  ctx.fillStyle = '#a8d8f0';
  ctx.fillRect(0, 18, w, h - 18);
  // colline calabre
  ctx.fillStyle = '#6f84a3';
  for (let x = 0; x < w; x++) {
    const y = 14 + Math.round(4 * Math.sin(x / 23) + 3 * Math.sin(x / 9 + 1));
    ctx.fillRect(x, y, 1, 26 - y);
  }
  // mare dello Stretto
  ctx.fillStyle = '#2f6fb0';
  ctx.fillRect(0, 26, w, h - 26);
  ctx.fillStyle = '#5b9bd5';
  const rand = rng(7);
  for (let i = 0; i < 60; i++) ctx.fillRect(Math.floor(rand() * w), 27 + Math.floor(rand() * (h - 28)), 3, 1);
  // un traghetto
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(250, 29, 14, 3);
  ctx.fillStyle = '#e04a3a';
  ctx.fillRect(255, 27, 3, 2);
  tex.refresh();
}

export function createTextures(scene: Phaser.Scene, width: number, skyHeight: number): void {
  backdrop(scene, width, skyHeight);
  tile(scene, 'erba-alta', '#417a2a', ['#2f5e1e', '#5a9e3a', '#6b8f2a'], 0.5, 1);
  tile(scene, 'erba', '#5a9e3a', ['#4c8a31', '#7cbf4f'], 0.18, 2);
  tile(scene, 'terra', '#9a6b3f', ['#7a5130', '#b0814f'], 0.3, 3);
  paint(scene, 'rifiuto', TRASH);
  paint(scene, 'panchina-rotta', BENCH_BROKEN);
  paint(scene, 'panchina', BENCH);
  paint(scene, 'staccionata', FENCE);
  paint(scene, 'scrivania', DESK);
  for (const [archetype, shirt] of Object.entries(SHIRTS)) paint(scene, `volontario-${archetype}`, VOLUNTEER, { c: shirt });
}
