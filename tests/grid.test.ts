import { describe, expect, it } from 'vitest';
import { defaultContent as c, validateContent } from '../src/core/content';
import {
  canMoveTree,
  canPlace,
  createGrid,
  estimate,
  linksAt,
  moveTree,
  place,
  placementAt,
  removePlacement,
  setRisk,
  setSurface,
  tileLine,
  validateProject,
} from '../src/core/grid';
import { T0, designGame } from './helpers';

describe('catalogo dei contenuti', () => {
  it('i riferimenti tra i JSON sono coerenti', () => {
    expect(validateContent(c)).toEqual([]);
  });

  it('segnala materiali e pratiche inesistenti', () => {
    const broken = {
      ...c,
      elements: [{ ...c.elements[0], materials: [{ id: 'oro', qty: 1 }], pratiche: ['nulla-osta-fantasma'] }],
    };
    expect(validateContent(broken)).toHaveLength(2);
  });
});

/** Catalogo con un elemento 2×2 di prova: per ora nel gioco sono tutti da una tile. */
const big = { ...c, elements: [...c.elements, { ...c.elements[0], id: 'gazebo', name: 'Gazebo', w: 2, h: 2 }] };

describe('griglia del parco', () => {
  it('nasce vuota e serializzabile in JSON', () => {
    const g = createGrid(8, 6);
    expect(g.surface).toHaveLength(48);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('un elemento 2×2 occupa quattro tile', () => {
    const g = createGrid(8, 6);
    const uid = place(g, big, 'gazebo', 2, 2);
    expect(placementAt(g, big, 3, 3)?.uid).toBe(uid);
    expect(placementAt(g, big, 4, 3)).toBeUndefined();
  });

  it('non si posa fuori dal terreno né sopra un altro elemento', () => {
    const g = createGrid(8, 6);
    place(g, big, 'gazebo', 2, 2);
    expect(canPlace(g, big, 'gazebo', 7, 5).errors).toEqual(['Fuori dal terreno']);
    expect(canPlace(g, big, 'sentiero', 3, 2).errors).toEqual(['Spazio già occupato']);
    expect(() => place(g, big, 'sentiero', 3, 2)).toThrow();
  });

  it('gli alberi tutelati non si rimuovono', () => {
    const g = createGrid(8, 6);
    setSurface(g, 1, 1, 'albero-tutelato');
    expect(canPlace(g, big, 'gazebo', 0, 0).ok).toBe(false);
  });

  it('sopra un’insidia nota si può costruire, ma viene segnalata', () => {
    const g = createGrid(8, 6);
    setRisk(g, 5, 1, 'falda-alta');
    expect(canPlace(g, big, 'gazebo', 4, 0)).toEqual({ ok: true, errors: [], risks: ['falda-alta'] });
  });

  it("l'aiuola occupa una tile sola", () => {
    const g = createGrid(8, 6);
    const uid = place(g, c, 'aiuola', 2, 2);
    expect(placementAt(g, c, 2, 2)?.uid).toBe(uid);
    expect(placementAt(g, c, 3, 3)).toBeUndefined();
  });

  it('si toglie dal progetto solo ciò che non è costruito', () => {
    const g = createGrid(8, 6);
    const a = place(g, c, 'sentiero', 0, 0);
    const b = place(g, c, 'sentiero', 1, 0);
    g.built.push(b);
    removePlacement(g, a);
    expect(g.placements.map((p) => p.uid)).toEqual([b]);
    expect(() => removePlacement(g, b)).toThrow('già costruito');
  });
});

describe('regole e preventivo del progetto', () => {
  it('la panchina deve stare accanto a un sentiero', () => {
    const g = createGrid(8, 6);
    place(g, c, 'panchina', 0, 0);
    expect(validateProject(g, c)).toHaveLength(1);
    place(g, c, 'sentiero', 1, 0);
    expect(validateProject(g, c)).toEqual([]);
  });

  it('il preventivo somma euro, ore, materiali e pratiche senza doppioni', () => {
    const g = createGrid(8, 6);
    place(g, c, 'sentiero', 1, 0);
    place(g, c, 'sentiero', 2, 0);
    place(g, c, 'panchina', 1, 1);
    const e = estimate(g, c);
    // 2 sentieri × 2 sacchi di ghiaia × 6 € + panchina (4 tavole × 12 + viti 8 + impregnante 15)
    expect(e.costEur).toBe(24 + 71);
    expect(e.hours).toBe(2 + 2 + 10);
    expect(e.materials).toContainEqual({ id: 'ghiaia', qty: 4 });
    expect(e.skills).toEqual(['legno']);
    expect(e.pratiche).toEqual(['assicurazione']);
  });
});

describe('alberi tutelati', () => {
  it('in progettazione si trapiantano su una tile libera e dove stavano resta terra', () => {
    const g = createGrid(6, 4, 'erba');
    setSurface(g, 1, 1, 'albero-tutelato');
    moveTree(g, c, 1, 1, 4, 2);
    expect(g.surface[1 * 6 + 1]).toBe('terra');
    expect(g.surface[2 * 6 + 4]).toBe('albero-tutelato');
    expect(g.surface.filter((s) => s === 'albero-tutelato')).toHaveLength(1);
  });

  it('non si trapiantano su un elemento, su un altro albero, sul cemento o fuori', () => {
    const g = createGrid(6, 4, 'erba');
    setSurface(g, 1, 1, 'albero-tutelato');
    setSurface(g, 2, 1, 'albero-tutelato');
    setSurface(g, 3, 3, 'cemento');
    place(g, c, 'sentiero', 0, 0);
    expect(canMoveTree(g, c, 1, 1, 0, 0).errors).toEqual(['Spazio già occupato']);
    expect(canMoveTree(g, c, 1, 1, 2, 1).ok).toBe(false);
    expect(canMoveTree(g, c, 1, 1, 3, 3).ok).toBe(false);
    expect(canMoveTree(g, c, 1, 1, 6, 0).errors).toEqual(['Fuori dal terreno']);
    expect(canMoveTree(g, c, 4, 0, 5, 0).ok).toBe(false); // lì non c'è un albero
    expect(() => moveTree(g, c, 1, 1, 0, 0)).toThrow();
  });

  it('nella partita si spostano solo in progettazione', () => {
    const sim = designGame();
    const g = sim.state.grid;
    const from = g.surface.indexOf('albero-tutelato');
    const to = g.surface.findIndex((s, i) => s === 'erba-alta' && !sim.elementAt(i % g.width, Math.floor(i / g.width)));
    const [fx, fy, tx, ty] = [from % g.width, Math.floor(from / g.width), to % g.width, Math.floor(to / g.width)];
    expect(sim.canMoveTree(fx, fy, tx, ty).ok).toBe(true);
    sim.moveTree(fx, fy, tx, ty);
    expect(sim.treeAt(tx, ty)).toBe(true);
    expect(sim.treeAt(fx, fy)).toBe(false);
    sim.confirmProject(T0);
    expect(sim.canMoveTree(tx, ty, fx, fy).ok).toBe(false);
  });
});

describe('posa a trascinamento', () => {
  it('la linea di tile è continua, un lato alla volta, estremi compresi', () => {
    expect(tileLine(2, 2, 2, 2)).toEqual([[2, 2]]);
    expect(tileLine(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(tileLine(3, 1, 3, -1)).toEqual([[3, 1], [3, 0], [3, -1]]);
    for (const [x1, y1] of [[4, 3], [-2, 5], [1, -6], [-3, -3]]) {
      const line = tileLine(0, 0, x1, y1);
      expect(line.at(-1)).toEqual([x1, y1]);
      expect(line).toHaveLength(Math.abs(x1) + Math.abs(y1) + 1);
      for (let i = 1; i < line.length; i++) {
        expect(Math.abs(line[i][0] - line[i - 1][0]) + Math.abs(line[i][1] - line[i - 1][1])).toBe(1);
      }
    }
  });

  it('la staccionata si collega alle staccionate vicine, non agli altri elementi', () => {
    const g = createGrid(5, 5);
    for (const [x, y] of [[1, 2], [2, 2], [3, 2], [2, 1]]) place(g, c, 'staccionata', x, y);
    place(g, c, 'sentiero', 2, 3);
    expect(linksAt(g, c, 'staccionata', 2, 2)).toEqual({ n: true, e: true, s: false, o: true });
    expect(linksAt(g, c, 'staccionata', 1, 2)).toEqual({ n: false, e: true, s: false, o: false });
    // anteprima di una tile ancora vuota: come si collegherebbe se la posassi lì
    expect(linksAt(g, c, 'staccionata', 3, 1)).toEqual({ n: false, e: false, s: true, o: true });
  });
});
