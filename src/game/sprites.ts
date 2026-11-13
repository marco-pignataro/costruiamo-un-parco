import type * as Phaser from 'phaser';
import type { Simulation } from '../core/simulation';
import type { Volunteer } from '../core/types';
import { ISO } from './iso';

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
  v: '#2f7a2a', // verde foglia
  V: '#1f5520', // verde scuro
  t: '#6b4423', // tronco
  m: '#8e5bb5', // fiori di lavanda
  k: '#3b8f4a', // cestino della differenziata
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
  fabbro: '#7f8c8d',
  elettricista: '#f1c40f',
  geometra: '#e67e22',
  carte: '#34495e',
  coordinatore: '#e84393',
};

/**
 * Volontario visto davanti e di schiena. c = maglietta, u = stampa bianca della
 * maglietta di gruppo (logo sul petto, lato cuore; scritta sulla schiena):
 * senza divisa diventa del colore della maglietta.
 */
const VOLUNTEER = [
  '...hhhh...',
  '..hhhhhh..',
  '..hssssh..',
  '..ssssss..',
  '...ssss...',
  '..cccccc..',
  '.cccccuuc.',
  '.scccccus.',
  '.sccccccs.',
  '..cccccc..',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..bb..bb..',
];

const VOLUNTEER_BACK = [
  '...hhhh...',
  '..hhhhhh..',
  '..hhhhhh..',
  '..hhhhhh..',
  '...ssss...',
  '..cccccc..',
  '.ccuuuucc.',
  '.sccccccs.',
  '.scuucucs.',
  '..cccccc..',
  '..pppppp..',
  '..pp..pp..',
  '..pp..pp..',
  '..bb..bb..',
];

/** Maglietta di gruppo di Puli-AMO: blu, con logo e scritta bianchi. La indossano tutti sul campo. */
export const UNIFORM_SHIRT = '#2a5fa8';
const UNIFORM_PRINT = '#f4f1e8';

/** Sul campo (sopralluogo e weekend) tutti indossano la maglietta di gruppo; in città quella dell'archetipo. */
export function inUniform(sim: Simulation): boolean {
  const s = sim.state;
  return s.stage === 'sopralluogo' || (s.stage === 'cantiere' && s.phase === 'operativa');
}

/** Aspetto di un volontario per lo sprite: colori di pelle, capelli e maglietta. */
export interface VolunteerLook {
  skin: string;
  hair: string;
  shirt: string;
  /** Maglietta di gruppo: blu con logo e scritta bianchi. */
  uniform: boolean;
}

/** Colori del volontario: pelle e capelli scelti in Fase 2, maglietta dell'archetipo o di gruppo. */
export function volunteerLook(sim: Simulation, v: Volunteer, uniform: boolean): VolunteerLook {
  const skin = sim.appearance.skin.find((c) => c.id === v.skin)?.color ?? PALETTE.s;
  const hair = sim.appearance.hair.find((c) => c.id === v.hair)?.color ?? PALETTE.h;
  return { skin, hair, shirt: uniform ? UNIFORM_SHIRT : (SHIRTS[v.archetypeId] ?? SHIRTS.base), uniform };
}

function lookColors(look: VolunteerLook): Record<string, string> {
  return { s: look.skin, h: look.hair, c: look.shirt, u: look.uniform ? UNIFORM_PRINT : look.shirt };
}

/** Texture del volontario con quei colori, davanti o di schiena; si crea la prima volta che serve. */
export function volunteerTexture(scene: Phaser.Scene, look: VolunteerLook, back = false): string {
  const key = `vol-${look.skin}-${look.hair}-${look.shirt}-${look.uniform ? 'u' : 'n'}-${back ? 'b' : 'f'}`;
  paint(scene, key, back ? VOLUNTEER_BACK : VOLUNTEER, lookColors(look));
  return key;
}

const portraits = new Map<string, string>();

/** Lo stesso sprite come immagine per la HUD (data URL), ingrandito senza sfumature. */
export function volunteerPortrait(look: VolunteerLook, scale = 12): string {
  const key = `${look.skin}-${look.hair}-${look.shirt}-${look.uniform}-${scale}`;
  const cached = portraits.get(key);
  if (cached) return cached;
  const rows = VOLUNTEER;
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length * scale;
  canvas.height = rows.length * scale;
  const ctx = canvas.getContext('2d')!;
  const extra = lookColors(look);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = extra[ch] ?? PALETTE[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
  const url = canvas.toDataURL();
  portraits.set(key, url);
  return url;
}

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

const TREE = [
  '....vvvvvv......',
  '..vvVvvvvvvv....',
  '.vvvvvvVvvvvv...',
  'vvVvvvvvvvvVvv..',
  'vvvvvVvvvvvvvv..',
  'vvvvvvvvVvvvvv..',
  '.vVvvvvvvvvvv...',
  '..vvvvvVvvvv....',
  '....vvvvvv......',
  '......tt........',
  '......tt........',
  '......tt........',
  '.....tttt.......',
];

/** Cartello giallo con il punto esclamativo: un punto sospetto da analizzare. */
const CLUE = ['.yyyyy.', 'yyybyyy', 'yyybyyy', 'yyybyyy', 'yyyyyyy', 'yyybyyy', '.yyyyy.', '...L...', '...L...'];
/** Lo stesso cartello in verde: analizzato, niente di preoccupante. */
const CLUE_OK = ['.vvvvv.', 'vvvvvwv', 'vvvvwvv', 'vwvwvvv', 'vvwvvvv', 'vvvvvvv', '.vvvvv.', '...L...', '...L...'];

const BIN = ['.kkkk.', 'kkkkkk', '.kwwk.', '.kkkk.', '.kkkk.', '.kkkk.', '..kk..'];

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

/** Le righe di pixel coperte dal rombo isometrico: per ogni riga, la colonna iniziale e la larghezza. */
function diamondRows(): { x: number; w: number }[] {
  const rows: { x: number; w: number }[] = [];
  for (let r = 0; r < ISO.h; r++) {
    const half = r < ISO.h / 2 ? 2 * (r + 1) : 2 * (ISO.h - r);
    rows.push({ x: ISO.w / 2 - half, w: half * 2 });
  }
  return rows;
}

/** Tile isometrica: un rombo di colore base con puntini sparsi, sempre uguale (seme fisso). */
function isoTile(scene: Phaser.Scene, key: string, base: string, dots: string[], density: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, ISO.w, ISO.h);
  if (!tex) return;
  const ctx = tex.getContext();
  const rows = diamondRows();
  rows.forEach((r, y) => {
    ctx.fillStyle = base;
    ctx.fillRect(r.x, y, r.w, 1);
  });
  const rand = rng(seed);
  for (let i = 0; i < ISO.w * ISO.h * 0.5 * density; i++) {
    const y = Math.floor(rand() * ISO.h);
    const r = rows[y];
    const x = r.x + Math.floor(rand() * r.w);
    ctx.fillStyle = dots[Math.floor(rand() * dots.length)];
    ctx.fillRect(x, y, x + 1 < r.x + r.w && rand() < 0.5 ? 2 : 1, 1);
  }
  tex.refresh();
}

/** Rombo bianco pieno: si colora con il tint (rischi, ombre, evidenziazioni). */
function solidDiamond(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, ISO.w, ISO.h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  diamondRows().forEach((r, y) => ctx.fillRect(r.x, y, r.w, 1));
  tex.refresh();
}

/**
 * Lo Stretto sullo sfondo: cielo, costa calabra e mare, largo quanto la scena.
 * La chiave contiene la misura, perché i terreni hanno dimensioni diverse.
 */
export function backdrop(scene: Phaser.Scene, w: number, h: number): string {
  const key = `stretto-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  const sky = ['#cfeaf6', '#b8e0f2', '#a8d8f0'];
  sky.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 6, w, 6);
  });
  ctx.fillStyle = '#a8d8f0';
  ctx.fillRect(0, 18, w, 8);
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
  for (let i = 0; i < (w * (h - 26)) / 160; i++) ctx.fillRect(Math.floor(rand() * w), 27 + Math.floor(rand() * (h - 28)), 3, 1);
  // due traghetti
  for (const [fx, fy] of [[Math.round(w * 0.65), 30], [Math.round(w * 0.2), 40]]) {
    if (fy + 3 > h) continue;
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(fx, fy + 2, 14, 3);
    ctx.fillStyle = '#e04a3a';
    ctx.fillRect(fx + 5, fy, 3, 2);
  }
  tex.refresh();
  return key;
}

export function createTextures(scene: Phaser.Scene): void {
  isoTile(scene, 'erba-alta', '#417a2a', ['#2f5e1e', '#5a9e3a', '#6b8f2a'], 0.5, 1);
  isoTile(scene, 'erba', '#5a9e3a', ['#4c8a31', '#7cbf4f'], 0.18, 2);
  isoTile(scene, 'terra', '#9a6b3f', ['#7a5130', '#b0814f'], 0.3, 3);
  isoTile(scene, 'cemento', '#8d8d8a', ['#6f6f6c', '#a5a5a1', '#5d5a52'], 0.25, 4);
  isoTile(scene, 'ghiaia', '#c9b99a', ['#a8977a', '#e0d4bb', '#8f8068'], 0.6, 5);
  isoTile(scene, 'aiuola', '#6b4423', ['#2f7a2a', '#8e5bb5', '#4c8a31', '#5e3b1b'], 0.45, 6);
  isoTile(scene, 'marciapiede', '#b5aea0', ['#9d968a', '#c9c2b4'], 0.2, 8);
  isoTile(scene, 'asfalto', '#55565c', ['#4a4b50', '#626369', '#5d5e64'], 0.3, 9);
  isoTile(scene, 'lastricato', '#d2c3a0', ['#bfae88', '#e2d6ba', '#b8a782'], 0.35, 10);
  isoTile(scene, 'mare', '#2f6fb0', ['#3d7fc0', '#5b9bd5', '#28629d'], 0.15, 11);
  solidDiamond(scene, 'rombo');
  paint(scene, 'albero', TREE);
  paint(scene, 'cestino', BIN);
  paint(scene, 'indizio', CLUE);
  paint(scene, 'indizio-ok', CLUE_OK);
  paint(scene, 'rifiuto', TRASH);
  paint(scene, 'panchina-rotta', BENCH_BROKEN);
  paint(scene, 'panchina', BENCH);
  paint(scene, 'staccionata', FENCE);
  paint(scene, 'scrivania', DESK);
}
