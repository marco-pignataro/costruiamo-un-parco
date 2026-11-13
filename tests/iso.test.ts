import { describe, expect, it } from 'vitest';
import { ISO, areaBounds, depthOf, footprintCenter, tileCenter, worldToTile, zoomLevels } from '../src/game/iso';

describe('geometria isometrica', () => {
  it('ogni tile ha il centro dove la si ritrova con il clic', () => {
    for (let y = -2; y < 12; y++) {
      for (let x = -2; x < 15; x++) {
        const c = tileCenter(x, y);
        expect(worldToTile(c.x, c.y)).toEqual({ x, y });
      }
    }
  });

  it('un clic vicino al bordo del rombo cade nella tile giusta', () => {
    const c = tileCenter(3, 4);
    // appena dentro i quattro vertici
    expect(worldToTile(c.x, c.y - ISO.h / 2 + 1)).toEqual({ x: 3, y: 4 });
    expect(worldToTile(c.x + ISO.w / 2 - 2, c.y)).toEqual({ x: 3, y: 4 });
    expect(worldToTile(c.x, c.y + ISO.h / 2 - 1)).toEqual({ x: 3, y: 4 });
    expect(worldToTile(c.x - ISO.w / 2 + 2, c.y)).toEqual({ x: 3, y: 4 });
    // appena fuori dal vertice destro c'è la tile accanto
    expect(worldToTile(c.x + ISO.w / 2 + 1, c.y)).not.toEqual({ x: 3, y: 4 });
  });

  it('le tile vicine si toccano: un passo in x va giù a destra, uno in y giù a sinistra', () => {
    const a = tileCenter(0, 0);
    expect(tileCenter(1, 0)).toEqual({ x: a.x + ISO.w / 2, y: a.y + ISO.h / 2 });
    expect(tileCenter(0, 1)).toEqual({ x: a.x - ISO.w / 2, y: a.y + ISO.h / 2 });
  });

  it("il centro di un'aiuola 2×2 è il vertice comune delle sue quattro tile", () => {
    expect(footprintCenter(2, 3, 2, 2)).toEqual({ x: (3 - 4) * (ISO.w / 2), y: (3 + 4) * (ISO.h / 2) });
  });

  it("l'area di un terreno 14×11 è larga (14 + 11) mezze tile per lato", () => {
    const b = areaBounds(0, 0, 14, 11);
    expect(b.right - b.left).toBe(25 * ISO.w / 2);
    expect(b.bottom - b.top).toBe(25 * ISO.h / 2);
  });

  it('chi sta più in basso sullo schermo si disegna davanti', () => {
    const back = tileCenter(5, 0);
    const front = tileCenter(4, 2);
    expect(depthOf(front.y)).toBeGreaterThan(depthOf(back.y));
  });

  it("due soli livelli di zoom: l'intero (intero sopra 1) e il doppio", () => {
    expect(zoomLevels(1000, 700, 420, 260)).toEqual({ full: 2, close: 4 });
    expect(zoomLevels(300, 200, 420, 260).full).toBeCloseTo(300 / 420);
    expect(zoomLevels(300, 200, 420, 260).close).toBe(2);
  });
});
