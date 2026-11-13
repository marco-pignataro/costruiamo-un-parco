import type { CityBuilding, CityDef, PraticaDef } from './types';

/** Caratteri delle tile della città e se ci si cammina sopra. */
export const CITY_TILES: Record<string, { walk: boolean }> = {
  '~': { walk: false }, // mare
  '=': { walk: true }, // strada
  '.': { walk: true }, // marciapiede
  p: { walk: true }, // piazza
  ',': { walk: true }, // verde
};

export interface Tile {
  x: number;
  y: number;
}

export function cityWidth(c: CityDef): number {
  return c.rows[0]?.length ?? 0;
}

export function cityHeight(c: CityDef): number {
  return c.rows.length;
}

/** L'edificio che occupa la tile, se c'è. */
export function buildingAt(c: CityDef, x: number, y: number): CityBuilding | undefined {
  return c.buildings.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
}

/** Si può camminare sulla tile: dentro la mappa, non in mare, non dentro un edificio. */
export function walkable(c: CityDef, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= cityWidth(c) || y >= cityHeight(c)) return false;
  return (CITY_TILES[c.rows[y][x]]?.walk ?? false) && !buildingAt(c, x, y);
}

export function sede(c: CityDef): CityBuilding {
  const b = c.buildings.find((x) => x.kind === 'sede');
  if (!b) throw new Error('La città non ha la sede');
  return b;
}

export function fornitore(c: CityDef): CityBuilding {
  const b = c.buildings.find((x) => x.kind === 'fornitore');
  if (!b) throw new Error('La città non ha il fornitore');
  return b;
}

/** L'ufficio dove si fanno le pratiche di un ente. */
export function officeBuilding(c: CityDef, office: string): CityBuilding | undefined {
  return c.buildings.find((b) => b.kind === 'ufficio' && b.office === office);
}

const STEPS: Tile[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Percorso più breve a passi di una tile (in orizzontale e in verticale)
 * sulle tile camminabili, partenza e arrivo compresi. Vuoto se non si arriva.
 */
export function findPath(c: CityDef, from: Tile, to: Tile): Tile[] {
  const w = cityWidth(c);
  const key = (t: Tile) => t.y * w + t.x;
  if (!walkable(c, to.x, to.y)) return [];
  const prev = new Map<number, number>([[key(from), -1]]);
  const queue: Tile[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: Tile[] = [];
      for (let k = key(cur); k !== -1; k = prev.get(k)!) path.push({ x: k % w, y: Math.floor(k / w) });
      return path.reverse();
    }
    for (const s of STEPS) {
      const n = { x: cur.x + s.x, y: cur.y + s.y };
      if (!walkable(c, n.x, n.y) || prev.has(key(n))) continue;
      prev.set(key(n), key(cur));
      queue.push(n);
    }
  }
  return [];
}

/**
 * Le prime `n` tile camminabili attorno a un punto, dalla più vicina (a
 * passi): servono per mettere i volontari uno accanto all'altro davanti a un
 * ingresso senza sovrapporli.
 */
export function spotsAround(c: CityDef, from: Tile, n: number): Tile[] {
  const w = cityWidth(c);
  const seen = new Set([from.y * w + from.x]);
  const out: Tile[] = [];
  const queue: Tile[] = [from];
  while (queue.length && out.length < n) {
    const cur = queue.shift()!;
    if (walkable(c, cur.x, cur.y)) out.push(cur);
    for (const s of STEPS) {
      const t = { x: cur.x + s.x, y: cur.y + s.y };
      if (t.x < 0 || t.y < 0 || t.x >= w || t.y >= cityHeight(c) || seen.has(t.y * w + t.x)) continue;
      seen.add(t.y * w + t.x);
      queue.push(t);
    }
  }
  return out;
}

/** Problemi nella mappa della città (righe, tile, edifici, ingressi, uffici delle pratiche). */
export function validateCity(c: CityDef, pratiche: PraticaDef[]): string[] {
  const errors: string[] = [];
  const w = cityWidth(c);
  c.rows.forEach((r, y) => {
    if (r.length !== w) errors.push(`città: la riga ${y} non è lunga ${w}`);
    [...r].forEach((ch, x) => {
      if (!CITY_TILES[ch]) errors.push(`città: carattere sconosciuto "${ch}" in ${x},${y}`);
    });
  });
  for (const kind of ['sede', 'fornitore'] as const) {
    const n = c.buildings.filter((b) => b.kind === kind).length;
    if (n !== 1) errors.push(`città: serve una sola ${kind}, ce ne sono ${n}`);
  }
  const ids = new Set<string>();
  for (const b of c.buildings) {
    if (ids.has(b.id)) errors.push(`città: edificio ripetuto ${b.id}`);
    ids.add(b.id);
    if (b.x < 0 || b.y < 0 || b.x + b.w > w || b.y + b.h > cityHeight(c)) errors.push(`città: ${b.id} esce dalla mappa`);
    for (const o of c.buildings) {
      if (o !== b && o.x < b.x + b.w && b.x < o.x + o.w && o.y < b.y + b.h && b.y < o.y + o.h) errors.push(`città: ${b.id} si sovrappone a ${o.id}`);
    }
    if (b.kind !== 'monumento') {
      if (!b.door) errors.push(`città: ${b.id} non ha l'ingresso`);
      else if (!walkable(c, b.door.x, b.door.y)) errors.push(`città: l'ingresso di ${b.id} non è camminabile`);
    }
    if (b.kind === 'ufficio' && !b.office) errors.push(`città: l'ufficio ${b.id} non dice quale ente ospita`);
  }
  for (const p of pratiche) if (!officeBuilding(c, p.office)) errors.push(`città: nessun edificio per l'ufficio "${p.office}" (pratica ${p.id})`);
  // dalla sede si deve arrivare a ogni ingresso
  const start = c.buildings.find((b) => b.kind === 'sede')?.door;
  if (start) {
    for (const b of c.buildings) {
      if (b.door && findPath(c, start, b.door).length === 0) errors.push(`città: dalla sede non si arriva a ${b.id}`);
    }
  }
  return errors;
}
