/**
 * Logo del gioco in pixel art, disegnato in codice nello stile dei volontari:
 * rampe di 3-4 toni con luce in alto a sinistra, contorno scuro dello stesso
 * colore, diorama su un'isoletta d'erba.
 *
 * Due parti indipendenti:
 * - il marchio, fisso: "gLOVEs On!" in lettere a blocchi sull'isoletta, con
 *   un alberello, una pala piantata e un guanto da lavoro col pollice in su;
 * - il sottotitolo, accessorio e intercambiabile: una targa di legno larga
 *   quanto il testo, scritto con un font pixel che copre lettere, cifre,
 *   punteggiatura e accenti italiani. Senza sottotitolo resta solo il marchio.
 *
 * `logoPixels` è puro (testabile senza DOM); `logoDataUrl` lo trasforma in immagine.
 */

type Px = (string | null)[];

class Buf {
  readonly px: Px;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    this.px[(y | 0) * this.w + (x | 0)] = c;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
}

/** Insieme di pixel da colorare insieme (una lettera, la targa...). */
type Mask = Set<number>;
const key = (x: number, y: number) => (y << 12) | (x & 0xfff);
const kx = (k: number) => k & 0xfff;
const ky = (k: number) => k >> 12;

function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Rampa: luce, chiaro, base, ombra, profondità (spessore delle lettere), contorno. */
interface Ramp {
  hi: string;
  light: string;
  base: string;
  shadow: string;
  deep: string;
  line: string;
}
const CORAL: Ramp = { hi: '#ffe6b8', light: '#ff8f5e', base: '#e5533b', shadow: '#b8333a', deep: '#7c1f3a', line: '#34101f' };
const BLUE: Ramp = { hi: '#d6f0ff', light: '#62a8e6', base: '#2f74c4', shadow: '#22539e', deep: '#183673', line: '#0d1633' };
const SUN: Ramp = { hi: '#fff8cc', light: '#ffdc5e', base: '#f4b631', shadow: '#d48a22', deep: '#9a581b', line: '#3a1a0b' };
const WOOD: Ramp = { hi: '#f0c890', light: '#d39a5a', base: '#b07a43', shadow: '#8a5a2e', deep: '#5c3a22', line: '#2a160c' };

// ---------- Marchio: lettere grandi (altezza delle maiuscole 11, tratto da 2) ----------
const BIG: Record<string, { rows: string[]; top: number }> = {
  L: { top: 0, rows: [...Array(9).fill('##.....'), '#######', '#######'] },
  O: { top: 0, rows: ['..#####..', '.#######.', '###...###', ...Array(5).fill('##.....##'), '###...###', '.#######.', '..#####..'] },
  V: { top: 0, rows: [...Array(4).fill('##.....##'), '###...###', '.##...##.', '.###.###.', '..##.##..', '..#####..', '...###...', '....#....'] },
  E: { top: 0, rows: ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '##.....', '#######', '#######'] },
  g: { top: 4, rows: ['.######', '###..##', '##...##', '##...##', '###..##', '.######', '.....##', '##..###', '.#####.'] },
  s: { top: 4, rows: ['.#####.', '##...##', '###....', '.#####.', '....###', '##...##', '.#####.'] },
  n: { top: 4, rows: ['##.###.', '#######', '###..##', '##...##', '##...##', '##...##', '##...##'] },
  '!': { top: 0, rows: ['###', '###', '###', '###', '###', '.#.', '.#.', '...', '...', '###', '###'] },
};
/** Il titolo, lettera per lettera, col colore di ciascuna: "LOVE" dentro "gloves". */
const TITLE: [string, Ramp][] = [
  ['g', BLUE], ['L', CORAL], ['O', CORAL], ['V', CORAL], ['E', CORAL], ['s', BLUE], [' ', BLUE], ['O', SUN], ['n', SUN], ['!', SUN],
];
const CAP = 11;
const DEPTH = 3;

// ---------- Sottotitolo: font pixel piccolo (maiuscole alte 6, minuscole 4, discendenti 2) ----------
const g = (top: number, ...rows: string[]) => ({ top, rows });
const SMALL: Record<string, { top: number; rows: string[] }> = {
  A: g(0, '.##.', '#..#', '#..#', '####', '#..#', '#..#'), B: g(0, '###.', '#..#', '###.', '#..#', '#..#', '###.'),
  C: g(0, '.###', '#...', '#...', '#...', '#...', '.###'), D: g(0, '###.', '#..#', '#..#', '#..#', '#..#', '###.'),
  E: g(0, '####', '#...', '###.', '#...', '#...', '####'), F: g(0, '####', '#...', '###.', '#...', '#...', '#...'),
  G: g(0, '.###', '#...', '#...', '#.##', '#..#', '.###'), H: g(0, '#..#', '#..#', '####', '#..#', '#..#', '#..#'),
  I: g(0, '###', '.#.', '.#.', '.#.', '.#.', '###'), J: g(0, '..##', '...#', '...#', '...#', '#..#', '.##.'),
  K: g(0, '#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'), L: g(0, '#...', '#...', '#...', '#...', '#...', '####'),
  M: g(0, '#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#'), N: g(0, '#..#', '##.#', '#.##', '#..#', '#..#', '#..#'),
  O: g(0, '.##.', '#..#', '#..#', '#..#', '#..#', '.##.'), P: g(0, '###.', '#..#', '#..#', '###.', '#...', '#...'),
  Q: g(0, '.##.', '#..#', '#..#', '#..#', '#.#.', '.#.#'), R: g(0, '###.', '#..#', '#..#', '###.', '#.#.', '#..#'),
  S: g(0, '.###', '#...', '.##.', '...#', '...#', '###.'), T: g(0, '#####', '..#..', '..#..', '..#..', '..#..', '..#..'),
  U: g(0, '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'), V: g(0, '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'),
  W: g(0, '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'), X: g(0, '#..#', '#..#', '.##.', '.##.', '#..#', '#..#'),
  Y: g(0, '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..'), Z: g(0, '####', '...#', '..#.', '.#..', '#...', '####'),
  a: g(1, '.##.', '...#', '.###', '#..#', '.###'), b: g(0, '#...', '#...', '###.', '#..#', '#..#', '###.'),
  c: g(2, '.###', '#...', '#...', '.###'), d: g(0, '...#', '...#', '.###', '#..#', '#..#', '.###'),
  e: g(2, '.##.', '####', '#...', '.##.'), f: g(0, '..##', '.#..', '####', '.#..', '.#..', '.#..'),
  g: g(2, '.###', '#..#', '#..#', '.###', '...#', '.##.'), h: g(0, '#...', '#...', '###.', '#..#', '#..#', '#..#'),
  i: g(0, '#', '.', '#', '#', '#', '#'), j: g(0, '.#', '..', '.#', '.#', '.#', '.#', '.#', '#.'),
  k: g(0, '#...', '#...', '#..#', '###.', '#.#.', '#..#'), l: g(0, '#.', '#.', '#.', '#.', '#.', '.#'),
  m: g(2, '####.', '#.#.#', '#.#.#', '#.#.#'), n: g(2, '###.', '#..#', '#..#', '#..#'),
  o: g(2, '.##.', '#..#', '#..#', '.##.'), p: g(2, '###.', '#..#', '#..#', '###.', '#...', '#...'),
  q: g(2, '.###', '#..#', '#..#', '.###', '...#', '...#'), r: g(2, '#.##', '##..', '#...', '#...'),
  s: g(2, '.###', '##..', '..##', '###.'), t: g(0, '.#..', '.#..', '####', '.#..', '.#..', '..##'),
  u: g(2, '#..#', '#..#', '#..#', '.###'), v: g(2, '#...#', '#...#', '.#.#.', '..#..'),
  w: g(2, '#...#', '#.#.#', '#.#.#', '.#.#.'), x: g(2, '#..#', '.##.', '.##.', '#..#'),
  y: g(2, '#..#', '#..#', '#..#', '.###', '...#', '.##.'), z: g(2, '####', '..#.', '.#..', '####'),
  '0': g(0, '.##.', '#..#', '#.##', '##.#', '#..#', '.##.'), '1': g(0, '.#.', '##.', '.#.', '.#.', '.#.', '###'),
  '2': g(0, '.##.', '#..#', '..#.', '.#..', '#...', '####'), '3': g(0, '###.', '...#', '.##.', '...#', '...#', '###.'),
  '4': g(0, '#..#', '#..#', '####', '...#', '...#', '...#'), '5': g(0, '####', '#...', '###.', '...#', '...#', '###.'),
  '6': g(0, '.##.', '#...', '###.', '#..#', '#..#', '.##.'), '7': g(0, '####', '...#', '..#.', '.#..', '.#..', '.#..'),
  '8': g(0, '.##.', '#..#', '.##.', '#..#', '#..#', '.##.'), '9': g(0, '.##.', '#..#', '#..#', '.###', '...#', '.##.'),
  ' ': g(0, '..'), "'": g(0, '#', '#'), '’': g(0, '#', '#'), '!': g(0, '#', '#', '#', '#', '.', '#'),
  '?': g(0, '.##.', '#..#', '..#.', '.#..', '....', '.#..'), '.': g(5, '#'), ',': g(5, '.#', '#.'),
  ':': g(2, '#', '.', '.', '#'), '-': g(3, '###'), '&': g(0, '.#..', '#.#.', '.#..', '#.##', '#.#.', '.#.#'),
};
// Vocali accentate: la lettera con l'accento nella riga libera sopra.
for (const [ch, base, mark] of [
  ['à', 'a', '.#..'], ['è', 'e', '.#..'], ['é', 'e', '..#.'], ['ì', 'i', '#'], ['ò', 'o', '.#..'], ['ù', 'u', '.#..'], ['È', 'E', '.##.'],
] as const) {
  const b = SMALL[base];
  const rows = [...b.rows];
  const top = Math.max(0, b.top - 1);
  if (top === b.top - 1) SMALL[ch] = { top: 0, rows: [mark.padEnd(rows[0].length, '.'), ...(b.top > 1 ? Array(b.top - 1).fill('.'.repeat(rows[0].length)) : []), ...rows] };
  else SMALL[ch] = b;
}

/** Larghezza in pixel del sottotitolo (lettere più 1 px di spazio). */
export function subtitleWidth(text: string): number {
  return [...text].reduce((w, ch) => w + (SMALL[ch] ?? SMALL['?']).rows[0].length + 1, -1);
}

function glyphMask(glyph: { rows: string[]; top: number }, x0: number, y0: number, into: Mask): void {
  glyph.rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && into.add(key(x0 + x, y0 + glyph.top + y))));
}

/** Contorno di 1 px attorno a una maschera (solo sui pixel liberi). */
function outline(b: Buf, m: Mask, color: string, diagonals = false): void {
  const dirs = diagonals ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const k of m) for (const [dx, dy] of dirs) {
    const x = kx(k) + dx, y = ky(k) + dy;
    if (!m.has(key(x, y))) b.set(x, y, color);
  }
}

/** Lettera a blocco: spessore verso il basso a destra, faccia con luce in alto e ombra in basso. */
function blockLetter(b: Buf, front: Mask, r: Ramp, top: number, height: number): void {
  const all: Mask = new Set(front);
  for (let d = 1; d <= DEPTH; d++) for (const k of front) all.add(key(kx(k) + d, ky(k) + d));
  outline(b, all, r.line, true);
  for (const k of all) if (!front.has(k)) b.set(kx(k), ky(k), hash(kx(k), ky(k), 3) > 0.85 ? r.line : r.deep);
  for (const k of front) {
    const x = kx(k), y = ky(k), t = (y - top) / height;
    const up = front.has(key(x, y - 1)), left = front.has(key(x - 1, y));
    let c = t < 0.55 ? r.base : r.shadow;
    if (!up) c = r.light;
    if (!up && !left) c = r.hi;
    else if (!left && t < 0.4) c = r.light;
    b.set(x, y, c);
  }
}

// ---------- Elementi del diorama ----------
const GRASS = ['#2e5e37', '#3f7a35', '#5d9a3f', '#84b84a', '#b8d86a'];
const SOIL = ['#3a2418', '#5c3a22', '#7a4f2e', '#9a6a3c'];
const STONE = ['#5d5f66', '#8a8b8f', '#b3b0a6'];

/** Isoletta sospesa: erba sopra (ellisse), terra a strati che si stringe in una punta rocciosa. */
function island(b: Buf, cx: number, cy: number, rx: number, ry: number): void {
  const inTop = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  // corpo di terra
  for (let x = cx - rx; x <= cx + rx; x++) {
    const u = (x - cx) / rx;
    if (Math.abs(u) > 1) continue;
    const yb = Math.round(cy + ry * Math.sqrt(1 - u * u));
    const depth = Math.round(rx * 0.3 * Math.pow(1 - u * u, 1.6) + 3 + hash(x, 0, 9) * 2);
    for (let y = yb - 1; y <= yb + depth; y++) {
      const t = (y - yb) / depth;
      const shade = u * 0.9 + t * 1.2 + (hash(x, y, 11) - 0.5) * 0.5;
      let c = SOIL[Math.max(0, Math.min(3, 3 - Math.floor((shade + 0.6) * 1.6)))];
      if (y <= yb + 1) c = GRASS[0];
      else if (hash(x >> 1, y >> 1, 12) > 0.94 && t > 0.2) c = STONE[hash(x, y, 13) > 0.5 ? 1 : 0];
      b.set(x, y, c);
    }
    b.set(x, yb + depth + 1, '#1e120c');
  }
  // erba in cima, più chiara dietro a sinistra
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    if (!inTop(x, y)) continue;
    const l = -((x - cx) / rx) * 0.5 - ((y - cy) / ry) * 0.6 + (hash(x, y, 15) - 0.5) * 0.7;
    b.set(x, y, GRASS[Math.max(1, Math.min(4, Math.round(2.2 + l * 1.6)))]);
  }
  // bordo davanti con ciuffi che scendono, contorno scuro sopra
  for (let x = cx - rx; x <= cx + rx; x++) {
    const u = (x - cx) / rx;
    if (Math.abs(u) > 1) continue;
    const yt = Math.round(cy - ry * Math.sqrt(1 - u * u));
    b.set(x, yt - 1, '#1c3a24');
    if (hash(x, 1, 16) > 0.7) b.set(x, yt - 2, GRASS[3]);
    const yb = Math.round(cy + ry * Math.sqrt(1 - u * u));
    if (hash(x, 2, 17) > 0.55) b.set(x, yb + 2, GRASS[1]);
  }
  // fiorellini
  for (let n = 0; n < 26; n++) {
    const x = Math.round(cx - rx + 4 + hash(n, 3, 18) * (rx * 2 - 8)), y = Math.round(cy - ry + 2 + hash(n, 4, 18) * (ry * 2 - 3));
    if (inTop(x, y)) b.set(x, y, ['#f2c94c', '#ece6d6', '#8c6bc0', '#e86a8a'][n % 4]);
  }
}

function sprite(b: Buf, x0: number, y0: number, rows: string[], colors: Record<string, string>): void {
  rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && b.set(x0 + x, y0 + y, colors[c])));
}

/** Guanto da lavoro giallo col pollice in su e polsino blu. */
const GLOVE = [
  '....kk......', '...khok.....', '...khok.....', '...khOk.....', '.kkkhoOkkk..', 'khhhhoooook.', 'khooooooOOk.',
  'kOkOOOOOOOk.', 'khooooooOOk.', 'kOOOOOOOOOk.', '.kcccccCCk..', '.kcwcwcCCk..', '..kkkkkkk...',
];
const GLOVE_COLORS = { k: '#3a1a0b', h: '#fff1a8', o: '#f4c431', O: '#c98a22', c: '#2f74c4', C: '#1f4f98', w: '#d6f0ff' };
/** Alberello tondo (ulivo giovane). */
const TREE = [
  '....kkkkk....', '..kkhhggGkk..', '.khhgggggGGk.', 'khgggggggGGGk', 'khgggGgggGGGk', 'kgggggggGGGGk', '.kGgggGGGGGk.',
  '..kkGGkGGkk..', '.....klk.....', '.....klk.....', '.....klk.....', '....kLlLk....',
];
const TREE_COLORS = { k: '#1c2e1a', h: '#b8d86a', g: '#5d9a3f', G: '#3f6a32', l: '#8a5a34', L: '#5c3a22' };
/** Pala piantata nella terra, con il manico a T. */
const SHOVEL = ['.kkk.', '.klk.', '..l..', '..l..', '..l..', '..l..', '..l..', '..l..', '.klk.', 'kmmmk', 'kmMMk', '.kMk.'];
const SHOVEL_COLORS = { k: '#2a160c', l: '#b07a43', m: '#c9cdd2', M: '#8a8f98' };

export interface LogoPixels {
  w: number;
  h: number;
  px: Px;
}

/**
 * Pixel del logo. `subtitle` è la targa sotto il marchio (accessoria e
 * intercambiabile); null o stringa vuota = solo il marchio.
 */
export function logoPixels(subtitle: string | null = null): LogoPixels {
  const W = 220, H = 120;
  const b = new Buf(W, H);
  const glyphW = (ch: string) => (ch === ' ' ? 4 : BIG[ch].rows[0].length);
  const titleW = TITLE.reduce((w, [ch]) => w + glyphW(ch) + 2, -2) + DEPTH;
  const cx = Math.round(W / 2), base = 40; // riga di base delle lettere
  const rx = Math.round(titleW / 2) + 18, ry = 11;
  island(b, cx, base + 1, rx, ry);
  // alberello dietro a sinistra, pala e guanto a destra
  sprite(b, cx - rx + 2, base - 9, TREE, TREE_COLORS);
  // lettere
  let x = cx - Math.round(titleW / 2);
  for (const [ch, ramp] of TITLE) {
    if (ch !== ' ') {
      const m: Mask = new Set();
      glyphMask(BIG[ch], x, base - CAP + 1, m);
      blockLetter(b, m, ramp, base - CAP + 1 + BIG[ch].top, ch === 'g' ? 9 : CAP - BIG[ch].top);
    }
    x += glyphW(ch) + 2;
  }
  sprite(b, cx + rx - 15, base - 9, SHOVEL, SHOVEL_COLORS);
  sprite(b, cx + rx - 9, base - 8, GLOVE, GLOVE_COLORS);

  // targa del sottotitolo
  const text = (subtitle ?? '').trim();
  if (text) {
    const tw = subtitleWidth(text);
    const pw = tw + 12, ph = 14;
    const px0 = cx - Math.round(pw / 2), py0 = base + ry + 9;
    // corde che la appendono all'isoletta
    for (const sx of [px0 + 4, px0 + pw - 5]) for (let y = base + ry; y < py0; y++) b.set(sx, y, '#d8c49a');
    for (let y = 0; y < ph; y++) for (let xx = 0; xx < pw; xx++) {
      const edge = y === 0 || y === ph - 1 || xx === 0 || xx === pw - 1;
      const corner = (y === 0 || y === ph - 1) && (xx === 0 || xx === pw - 1);
      if (corner) continue;
      let c = edge ? WOOD.line : y === 1 ? WOOD.hi : y === ph - 2 ? WOOD.deep : y === 7 ? WOOD.shadow : y < 7 ? WOOD.light : WOOD.base;
      if (!edge && y !== 1 && y !== 7 && hash(xx, y, 20) > 0.9) c = WOOD.shadow;
      b.set(px0 + xx, py0 + y, c);
    }
    for (const [nx, ny] of [[2, 2], [pw - 3, 2], [2, ph - 3], [pw - 3, ph - 3]]) b.set(px0 + nx, py0 + ny, '#e8e2d4');
    const m: Mask = new Set();
    let tx = px0 + 6;
    for (const ch of text) {
      const gl = SMALL[ch] ?? SMALL['?'];
      glyphMask(gl, tx, py0 + 3, m);
      tx += gl.rows[0].length + 1;
    }
    outline(b, m, WOOD.line, true);
    for (const k of m) b.set(kx(k), ky(k), ky(k) < py0 + 6 ? '#fff6dc' : '#f2dcae');
  }

  // ritaglio sul disegno, con 1 px di margine
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (b.get(xx, y)) {
    x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  const px: Px = new Array(w * h).fill(null);
  for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) px[(y - y0 + 1) * w + (xx - x0 + 1)] = b.get(xx, y);
  return { w, h, px };
}

const cache = new Map<string, string>();

/** Il logo come immagine (data URL), ingrandito di `scale` senza sfumature. */
export function logoDataUrl(subtitle: string | null = null, scale = 1): string {
  const k = `${subtitle ?? ''}|${scale}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const { w, h, px } = logoPixels(subtitle);
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d')!;
  px.forEach((col, i) => {
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect((i % w) * scale, Math.floor(i / w) * scale, scale, scale);
  });
  const url = c.toDataURL();
  cache.set(k, url);
  return url;
}
