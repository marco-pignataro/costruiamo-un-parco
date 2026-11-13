/**
 * Geometria isometrica comune alle scene (parco e città), senza Phaser:
 * si testa in Vitest. La griglia logica resta quadrata; qui si decide solo
 * dove finisce ogni tile sullo schermo e quale tile c'è sotto un punto.
 *
 * Proiezione 2:1: una tile è un rombo largo ISO.w e alto ISO.h. La tile (0, 0)
 * ha il vertice in alto nell'origine del mondo; x cresce verso il basso a
 * destra, y verso il basso a sinistra.
 */
export const ISO = { w: 32, h: 16 } as const;

const HW = ISO.w / 2;
const HH = ISO.h / 2;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Centro sullo schermo del punto di griglia (gx, gy); accetta anche frazioni. */
export function gridToWorld(gx: number, gy: number): Point {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH };
}

/** Centro del rombo della tile (x, y). */
export function tileCenter(x: number, y: number): Point {
  return gridToWorld(x + 0.5, y + 0.5);
}

/** Centro dell'ingombro di un elemento w×h posato con l'angolo in (x, y). */
export function footprintCenter(x: number, y: number, w: number, h: number): Point {
  return gridToWorld(x + w / 2, y + h / 2);
}

/** I quattro vertici (alto, destra, basso, sinistra) dell'area x..x+w, y..y+h. */
export function footprintCorners(x: number, y: number, w: number, h: number): Point[] {
  return [gridToWorld(x, y), gridToWorld(x + w, y), gridToWorld(x + w, y + h), gridToWorld(x, y + h)];
}

/** Tile sotto un punto del mondo (anche fuori dalla griglia: il controllo dei limiti sta a chi chiama). */
export function worldToTile(px: number, py: number): Point {
  const a = px / HW;
  const b = py / HH;
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/** Rettangolo che contiene il rombo delle tile x0..x1-1, y0..y1-1. */
export function areaBounds(x0: number, y0: number, x1: number, y1: number): Rect {
  const [top, right, bottom, left] = footprintCorners(x0, y0, x1 - x0, y1 - y0);
  return { left: left.x, top: top.y, right: right.x, bottom: bottom.y };
}

/**
 * Profondità di disegno: chi ha i piedi più in basso sullo schermo sta davanti.
 * Gli strati piatti (terreno, sentieri, rischi) stanno sotto a tutto.
 */
export const LAYER = { ground: 0, flat: 1, overlay: 2, hover: 3, objects: 10, ui: 100_000 } as const;

export function depthOf(footY: number): number {
  return LAYER.objects + footY;
}

/**
 * I due soli livelli di zoom: la visuale intera della scena e un
 * ingrandimento fisso, il doppio. Sopra 1 lo zoom è intero, così i pixel
 * restano tutti uguali.
 */
export function zoomLevels(viewW: number, viewH: number, worldW: number, worldH: number): { full: number; close: number } {
  const fit = Math.min(viewW / worldW, viewH / worldH);
  const full = fit >= 1 ? Math.floor(fit) : fit;
  return { full, close: Math.max(2, Math.round(full * 2)) };
}
