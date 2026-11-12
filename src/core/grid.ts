import { APPEAL_VARIETY_BONUS } from '../config';
import type { Content } from './content';
import type { ElementDef, ParkGrid, Placement, SiteDef, SurfaceId } from './types';

/** Caratteri delle righe di superficie nei JSON dei terreni. */
export const SURFACE_CHARS: Record<string, SurfaceId> = {
  t: 'terra',
  p: 'erba',
  e: 'erba-alta',
  r: 'rifiuti',
  c: 'cemento',
  A: 'albero-tutelato',
};

/** Superfici su cui non si può costruire. */
const BLOCKING_SURFACES: SurfaceId[] = ['albero-tutelato'];

export interface PlaceCheck {
  ok: boolean;
  errors: string[];
  /** Insidie note sotto l'ingombro: si può costruire, ma con malus (Fase 3). */
  risks: string[];
}

export interface Estimate {
  costEur: number;
  hours: number;
  skills: string[];
  materials: { id: string; qty: number }[];
  pratiche: string[];
}

export function createGrid(width: number, height: number, fill: SurfaceId = 'terra'): ParkGrid {
  if (width < 1 || height < 1) throw new Error('Griglia vuota');
  const n = width * height;
  return {
    width,
    height,
    surface: Array<SurfaceId>(n).fill(fill),
    risk: Array<string | null>(n).fill(null),
    placements: [],
    built: [],
    nextUid: 1,
  };
}

export function inBounds(g: ParkGrid, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function tileIndex(g: ParkGrid, x: number, y: number): number {
  if (!inBounds(g, x, y)) throw new Error(`Tile fuori dalla griglia: ${x},${y}`);
  return y * g.width + x;
}

export function setSurface(g: ParkGrid, x: number, y: number, s: SurfaceId): void {
  g.surface[tileIndex(g, x, y)] = s;
}

export function setRisk(g: ParkGrid, x: number, y: number, risk: string | null): void {
  g.risk[tileIndex(g, x, y)] = risk;
}

function elementDef(c: Content, id: string): ElementDef {
  const e = c.elements.find((x) => x.id === id);
  if (!e) throw new Error(`Elemento sconosciuto: ${id}`);
  return e;
}

/** Tile occupate da un elemento posato in (x, y). */
function footprint(e: ElementDef, x: number, y: number): [number, number][] {
  const tiles: [number, number][] = [];
  for (let dy = 0; dy < e.h; dy++) for (let dx = 0; dx < e.w; dx++) tiles.push([x + dx, y + dy]);
  return tiles;
}

/** Elemento del progetto che occupa la tile, se c'è. */
export function placementAt(g: ParkGrid, c: Content, x: number, y: number): Placement | undefined {
  return g.placements.find((p) => {
    const e = elementDef(c, p.elementId);
    return x >= p.x && x < p.x + e.w && y >= p.y && y < p.y + e.h;
  });
}

export function canPlace(g: ParkGrid, c: Content, elementId: string, x: number, y: number): PlaceCheck {
  const e = elementDef(c, elementId);
  const errors: string[] = [];
  const risks = new Set<string>();
  for (const [tx, ty] of footprint(e, x, y)) {
    if (!inBounds(g, tx, ty)) {
      errors.push('Fuori dal terreno');
      break;
    }
    const i = tileIndex(g, tx, ty);
    if (BLOCKING_SURFACES.includes(g.surface[i])) errors.push('Un albero tutelato non si può rimuovere');
    if (placementAt(g, c, tx, ty)) errors.push('Spazio già occupato');
    const r = g.risk[i];
    if (r) risks.add(r);
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], risks: [...risks] };
}

/** Posa un elemento nel livello progetto e restituisce il suo uid. */
export function place(g: ParkGrid, c: Content, elementId: string, x: number, y: number): number {
  const check = canPlace(g, c, elementId, x, y);
  if (!check.ok) throw new Error(check.errors.join('; '));
  const uid = g.nextUid++;
  g.placements.push({ uid, elementId, x, y });
  return uid;
}

/** Toglie un elemento dal progetto. Gli elementi già costruiti non si tolgono qui. */
export function removePlacement(g: ParkGrid, uid: number): void {
  if (g.built.includes(uid)) throw new Error('Elemento già costruito');
  const i = g.placements.findIndex((p) => p.uid === uid);
  if (i < 0) throw new Error(`Elemento non presente: ${uid}`);
  g.placements.splice(i, 1);
}

/**
 * Regole sul progetto intero, da controllare alla conferma: per ora gli
 * elementi che devono stare accanto a un altro (panchina accanto al sentiero).
 */
export function validateProject(g: ParkGrid, c: Content): string[] {
  const problems: string[] = [];
  for (const p of g.placements) {
    const e = elementDef(c, p.elementId);
    if (!e.adjacentTo) continue;
    const near = footprint(e, p.x, p.y).some(([tx, ty]) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = tx + dx;
        const ny = ty + dy;
        if (!inBounds(g, nx, ny)) return false;
        const other = placementAt(g, c, nx, ny);
        return other !== undefined && other.uid !== p.uid && other.elementId === e.adjacentTo;
      }),
    );
    if (!near) problems.push(`${e.name} in ${p.x},${p.y}: serve ${elementDef(c, e.adjacentTo).name.toLowerCase()} accanto`);
  }
  return problems;
}

/** Preventivo live del progetto: euro (prezzi da fornitore), ore, skill, materiali, pratiche. */
export function estimate(g: ParkGrid, c: Content): Estimate {
  const qty = new Map<string, number>();
  const skills = new Set<string>();
  const pratiche = new Set<string>();
  let hours = 0;
  for (const p of g.placements) {
    const e = elementDef(c, p.elementId);
    hours += e.hours;
    if (e.skill) skills.add(e.skill);
    e.pratiche.forEach((x) => pratiche.add(x));
    for (const m of e.materials) qty.set(m.id, (qty.get(m.id) ?? 0) + m.qty);
  }
  let costEur = 0;
  for (const [id, q] of qty) {
    const m = c.materials.find((x) => x.id === id);
    if (!m) throw new Error(`Materiale sconosciuto: ${id}`);
    costEur += m.unitPrice * q;
  }
  return {
    costEur,
    hours,
    skills: [...skills],
    materials: [...qty].map(([id, q]) => ({ id, qty: q })),
    pratiche: [...pratiche],
  };
}

/** Griglia di un terreno di partenza, con il suo progetto iniziale già posato. */
export function gridFromSite(site: SiteDef, c: Content): ParkGrid {
  const height = site.rows.length;
  const width = site.rows[0]?.length ?? 0;
  const g = createGrid(width, height);
  site.rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${site.id}: la riga ${y} non è lunga ${width}`);
    [...row].forEach((ch, x) => {
      const s = SURFACE_CHARS[ch];
      if (!s) throw new Error(`${site.id}: carattere di superficie sconosciuto "${ch}"`);
      setSurface(g, x, y, s);
    });
  });
  for (const p of site.placements) place(g, c, p.elementId, p.x, p.y);
  return g;
}

/**
 * Gradimento previsto, da 0 a 100. Ogni elemento vale i suoi punti, ma la
 * k-esima copia dello stesso tipo vale 1/k (rendimenti decrescenti); ogni tipo
 * diverso aggiunge un bonus di varietà. Gli alberi tutelati restano e piacciono.
 */
export function expectedAppeal(g: ParkGrid, c: Content): number {
  const count = new Map<string, number>();
  let points = 0;
  for (const p of g.placements) {
    const k = (count.get(p.elementId) ?? 0) + 1;
    count.set(p.elementId, k);
    points += elementDef(c, p.elementId).appeal / k;
  }
  points += count.size * APPEAL_VARIETY_BONUS;
  points += g.surface.filter((s) => s === 'albero-tutelato').length * 2;
  return Math.min(100, Math.round(points));
}
