import { describe, expect, it } from 'vitest';
import { defaultContent as c, validateContent } from '../src/core/content';
import {
  canPlace,
  createGrid,
  estimate,
  place,
  placementAt,
  removePlacement,
  setRisk,
  setSurface,
  validateProject,
} from '../src/core/grid';

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

describe('griglia del parco', () => {
  it('nasce vuota e serializzabile in JSON', () => {
    const g = createGrid(8, 6);
    expect(g.surface).toHaveLength(48);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('un elemento 2×2 occupa quattro tile', () => {
    const g = createGrid(8, 6);
    const uid = place(g, c, 'aiuola', 2, 2);
    expect(placementAt(g, c, 3, 3)?.uid).toBe(uid);
    expect(placementAt(g, c, 4, 3)).toBeUndefined();
  });

  it('non si posa fuori dal terreno né sopra un altro elemento', () => {
    const g = createGrid(8, 6);
    place(g, c, 'aiuola', 2, 2);
    expect(canPlace(g, c, 'aiuola', 7, 5).errors).toEqual(['Fuori dal terreno']);
    expect(canPlace(g, c, 'sentiero', 3, 2).errors).toEqual(['Spazio già occupato']);
    expect(() => place(g, c, 'sentiero', 3, 2)).toThrow();
  });

  it('gli alberi tutelati non si rimuovono', () => {
    const g = createGrid(8, 6);
    setSurface(g, 1, 1, 'albero-tutelato');
    expect(canPlace(g, c, 'aiuola', 0, 0).ok).toBe(false);
  });

  it('sopra un’insidia nota si può costruire, ma viene segnalata', () => {
    const g = createGrid(8, 6);
    setRisk(g, 5, 1, 'falda-alta');
    expect(canPlace(g, c, 'aiuola', 4, 0)).toEqual({ ok: true, errors: [], risks: ['falda-alta'] });
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
