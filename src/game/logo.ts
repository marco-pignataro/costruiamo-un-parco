/**
 * Logo del gioco in pixel art, disegnato in codice nello stile dei volontari:
 * rampe di 3-4 toni con luce in alto a sinistra, contorno scuro dello stesso
 * colore, diorama su un'isoletta d'erba.
 *
 * Due parti indipendenti:
 * - il marchio, fisso: "gLOVEs On!" in lettere a blocchi sull'isoletta, con
 *   una fontana da piazza al centro, dietro la scritta, con l'acqua animata
 *   (omaggio alla fontana di Puli-AMO Messina), un alberello a sinistra e, a
 *   destra, una pala piantata e un guanto da lavoro col pollice in su;
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
    const depth = Math.round(Math.min(rx * 0.3, 18) * Math.pow(1 - u * u, 1.6) + 3 + hash(x, 0, 9) * 2);
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

/** Fotogrammi dell'animazione dell'acqua (un giro completo). */
export const LOGO_FRAMES = 8;

const FSTONE = ['#f6f1e4', '#dcd6c8', '#b9b4a8', '#8f8d88', '#6a6a70'];
const STONE_LINE = '#34343e';
const WATER = ['#245a9e', '#357cc4', '#5aa6e6', '#9fd6f8', '#e6f6ff'];

/**
 * Fontana da piazza al centro del logo, dietro la scritta: vasca grande col
 * bordo di pietra (le lettere ne coprono il davanti), colonna, tazza in alto
 * con lo zampillo, acqua che ricade dalla tazza nella vasca. `frame` fa
 * scorrere l'acqua: gocce lungo le cascate, getto che pulsa, cerchi nella vasca.
 * `by` è la riga del centro del bordo della vasca.
 */
function fountain(b: Buf, cx: number, by: number, frame: number): void {
  const F = frame / LOGO_FRAMES;
  const stone: Mask = new Set();
  const put = (x: number, y: number, c: string, m: Mask | null = stone) => { b.set(x, y, c); m?.add(key(x, y)); };
  const RX = 40, RY = 7, ground = by + 13;
  const inE = (x: number, y: number, rx: number, ry: number, ey = by) => ((x - cx) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1;

  // vasca: parete (la luce viene da sinistra) e bordo spesso
  for (let x = cx - RX; x <= cx + RX; x++) {
    const u = (x - cx) / RX;
    const front = Math.round(by + RY * Math.sqrt(1 - u * u));
    for (let y = front; y <= ground; y++) {
      const l = -u * 1.2 + (y === front + 1 ? 0.8 : 0) - (y >= ground - 1 ? 0.8 : 0);
      put(x, y, FSTONE[Math.max(1, Math.min(4, Math.round(2.4 - l)))]);
    }
  }
  for (let y = by - RY - 1; y <= by + RY + 1; y++) for (let x = cx - RX - 1; x <= cx + RX + 1; x++) {
    if (!inE(x, y, RX, RY) || inE(x, y, RX - 4, RY - 2.2)) continue;
    const back = y < by;
    const lit = y < by - RY + 2 || (!back && y <= by + RY - 1 && y >= by + RY - 2);
    put(x, y, back ? (lit ? FSTONE[2] : FSTONE[3]) : lit ? FSTONE[0] : FSTONE[1]);
  }
  // acqua della vasca con cerchi che si allargano dalla colonna
  for (let y = by - RY; y <= by + RY; y++) for (let x = cx - RX; x <= cx + RX; x++) {
    if (!inE(x, y, RX - 4, RY - 2.2)) continue;
    const r = Math.sqrt(((x - cx) / (RX - 4)) ** 2 + ((y - by) / (RY - 2.2)) ** 2);
    let c = y < by - 1 ? WATER[1] : WATER[2];
    for (const k of [0, 1 / 3, 2 / 3]) if (Math.abs(r - ((F + k) % 1)) < 0.05 && r > 0.15) c = WATER[3];
    if (hash(x, y, frame + 40) > 0.97) c = WATER[4];
    put(x, y, c, null);
  }

  // colonna con un anello a metà
  const ty = by - 14;
  for (let y = ty + 4; y <= by; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    const ring = y === by - 6 || y === by - 5;
    if (!ring && (x === cx - 2 || x === cx + 2)) continue;
    put(x, y, x < cx ? FSTONE[ring ? 0 : 1] : x === cx ? FSTONE[2] : FSTONE[3]);
  }
  // tazza: sotto a coppa, sopra il bordo con l'acqua
  for (let y = ty; y <= ty + 4; y++) {
    const half = 12 - (y - ty) * 2.4;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const u = (x - cx) / Math.max(1, half);
      put(x, y, FSTONE[Math.max(1, Math.min(4, Math.round(2.2 + u * 1.4 + (y - ty) * 0.25)))]);
    }
  }
  for (let y = ty - 4; y <= ty + 1; y++) for (let x = cx - 13; x <= cx + 13; x++) {
    if (!inE(x, y, 13, 3, ty - 1)) continue;
    if (inE(x, y, 10.5, 1.8, ty - 1)) put(x, y, (x + y + frame) % 4 === 0 ? WATER[3] : WATER[2], null);
    else put(x, y, y < ty - 1 ? FSTONE[2] : x < cx ? FSTONE[0] : FSTONE[1]);
  }
  outline(b, stone, STONE_LINE);

  // cascate dalla tazza alla vasca, a sinistra e a destra, e un velo davanti
  const flow = (x: number, y: number, i: number) => b.set(x, y, (i - frame * 1.5 + 64) % 5 < 2 ? WATER[4] : (i - frame * 1.5 + 64) % 5 < 3 ? WATER[3] : WATER[2]);
  for (const side of [-1, 1]) for (const off of [0, 2]) {
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const s2 = i / n;
      const x = Math.round(cx + side * (12 + off * 0.5 + 6 * s2 + off * s2));
      const y = Math.round(ty - 1 + s2 * s2 * (by - ty + 1));
      if (off === 0) b.set(x - side, y, WATER[2]);
      flow(x, y, i + off);
    }
    // spruzzi dove l'acqua arriva nella vasca
    const sx = cx + side * (19 + off);
    if ((frame + off) % 2 === 0) b.set(sx + side, by - 1, WATER[4]);
    else b.set(sx - side, by - 2, WATER[4]);
  }
  for (let x = cx - 8; x <= cx + 8; x += 4) for (let y = ty + 2; y <= by - 1; y++) {
    if (Math.abs(x - cx) < 3 && y > ty + 4) continue; // dietro la colonna non si vede
    if ((y - frame + 64) % 4 < 2) b.set(x, y, WATER[3]);
  }

  // zampillo: getto che pulsa e corona di gocce che ricade nella tazza
  const jetTop = ty - 12;
  for (let y = jetTop; y <= ty - 2; y++) {
    const i = y - jetTop;
    b.set(cx, y, (i + frame * 2) % 4 < 2 ? WATER[4] : WATER[3]);
    b.set(cx + 1, y, (i + frame * 2) % 4 === 1 ? WATER[3] : WATER[2]);
    if (i > 3) b.set(cx - 1, y, WATER[3]);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = ((i / 9 + F) % 1);
    const x = Math.round(cx + side * t * 9);
    const y = Math.max(jetTop, Math.round(jetTop + 1 - 2.5 * Math.sin(t * Math.PI * 0.6) + t * t * 9));
    b.set(x, y, t < 0.5 ? WATER[4] : WATER[3]);
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
export function logoPixels(subtitle: string | null = null, frame = 0): LogoPixels {
  const W = 220, H = 130;
  const b = new Buf(W, H);
  const glyphW = (ch: string) => (ch === ' ' ? 4 : BIG[ch].rows[0].length);
  const titleW = TITLE.reduce((w, [ch]) => w + glyphW(ch) + 2, -2) + DEPTH;
  const cx = Math.round(W / 2), base = 50; // riga di base delle lettere
  const rx = Math.round(titleW / 2) + 18, ry = 12;
  island(b, cx, base + 1, rx, ry);
  // la fontana al centro, dietro la scritta; alberello a sinistra, pala e guanto a destra
  fountain(b, cx, base - 12, ((frame % LOGO_FRAMES) + LOGO_FRAMES) % LOGO_FRAMES);
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

/** Il logo come immagine (data URL), ingrandito di `scale` senza sfumature; `frame` è il fotogramma dell'acqua. */
export function logoDataUrl(subtitle: string | null = null, scale = 1, frame = 0): string {
  const k = `${subtitle ?? ''}|${scale}|${frame}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const { w, h, px } = logoPixels(subtitle, frame);
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

/** Immagine del logo animabile: `animateLogos` le fa scorrere i fotogrammi. */
export function logoImg(subtitle: string | null, scale: number, cls: string, alt: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<img class="${cls}" src="${logoDataUrl(subtitle, scale)}" alt="${esc(alt)}" data-logo="${esc(subtitle ?? '')}" data-scale="${scale}">`;
}

let animating = false;
/**
 * Fa scorrere l'acqua in tutti i loghi della pagina (immagini fatte con
 * `logoImg`), anche quelli che compaiono dopo. Ferma per chi chiede meno movimento.
 */
export function animateLogos(): void {
  if (animating || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  animating = true;
  let frame = 0;
  setInterval(() => {
    frame = (frame + 1) % LOGO_FRAMES;
    for (const img of document.querySelectorAll<HTMLImageElement>('img[data-logo]')) {
      img.src = logoDataUrl(img.dataset.logo || null, Number(img.dataset.scale) || 1, frame);
    }
  }, 110);
}
