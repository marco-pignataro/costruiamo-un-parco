import { describe, expect, it } from 'vitest';
import { defaultContent as c } from '../src/core/content';
import { createGrid, expectedAppeal, place } from '../src/core/grid';
import { designGame, firstSite, T0 } from './helpers';

describe('gradimento previsto', () => {
  it('un progetto vuoto su terreno spoglio vale zero', () => {
    expect(expectedAppeal(createGrid(6, 4), c)).toBe(0);
  });

  it('le copie dello stesso elemento rendono sempre meno', () => {
    const one = createGrid(6, 4);
    place(one, c, 'panchina', 0, 0);
    const two = createGrid(6, 4);
    place(two, c, 'panchina', 0, 0);
    place(two, c, 'panchina', 1, 0);
    // 6 + bonus varietà 5 = 11; poi 6 + 3 + 5 = 14
    expect(expectedAppeal(one, c)).toBe(11);
    expect(expectedAppeal(two, c)).toBe(14);
  });

  it('la varietà conta più della quantità', () => {
    const same = createGrid(6, 4);
    place(same, c, 'cestino', 0, 0);
    place(same, c, 'cestino', 1, 0);
    const mixed = createGrid(6, 4);
    place(mixed, c, 'cestino', 0, 0);
    place(mixed, c, 'staccionata', 1, 0);
    expect(expectedAppeal(mixed, c)).toBeGreaterThan(expectedAppeal(same, c));
  });

  it('non supera 100', () => {
    const g = createGrid(20, 20);
    for (let x = 0; x < 20; x += 2) for (let y = 0; y < 20; y += 2) place(g, c, 'aiuola', x, y);
    expect(expectedAppeal(g, c)).toBeLessThanOrEqual(100);
  });
});

describe('progettazione nella partita', () => {
  it('dopo terreno e squadra si progetta, partendo dal progetto proposto', () => {
    const sim = designGame();
    expect(sim.state.stage).toBe('progettazione');
    expect(sim.state.grid.placements.length).toBe(firstSite.placements.length);
    expect(sim.state.plan).toEqual([]);
    expect(sim.state.pratiche).toEqual([]);
    expect(sim.availableTasks()).toEqual([]);
    expect(sim.canCloseSession()).toBe(false);
  });

  it('si posano e si tolgono elementi; il riepilogo si aggiorna', () => {
    const sim = designGame();
    const before = sim.designSummary();
    const uid = sim.placeElement('cestino', 12, 5); // accanto all'ultimo tratto di sentiero
    const after = sim.designSummary();
    expect(after.costEur).toBe(before.costEur + 55);
    expect(after.appeal).toBeGreaterThan(before.appeal);
    expect(after.problems).toEqual([]);
    sim.removeElement(uid);
    expect(sim.designSummary().costEur).toBe(before.costEur);
  });

  it('il progetto non si conferma con problemi: vuoto, regole violate o oltre la cassa', () => {
    const sim = designGame();
    for (const p of [...sim.state.grid.placements]) sim.removeElement(p.uid);
    expect(sim.designSummary().problems).toContain('Il progetto è vuoto');
    sim.placeElement('panchina', 0, 0);
    expect(() => sim.confirmProject(T0)).toThrow(/sentiero/);
    sim.placeElement('sentiero', 1, 0);
    sim.state.budget = 50;
    expect(() => sim.confirmProject(T0)).toThrow(/supera la cassa/);
  });

  it('la conferma genera piano e pratiche e apre il cantiere; dopo il progetto non si tocca', () => {
    const sim = designGame();
    sim.confirmProject(T0);
    expect(sim.state.stage).toBe('cantiere');
    expect(sim.state.plan.length).toBeGreaterThan(0);
    expect(sim.state.pratiche.map((p) => p.id)).toContain('assicurazione');
    expect(sim.unseenReports().map((r) => r.title)).toEqual(['Progetto confermato']);
    expect(() => sim.placeElement('cestino', 0, 0)).toThrow('già confermato');
    expect(sim.canPlace('cestino', 0, 0).ok).toBe(false);
  });

  it('in progettazione il tempo non consuma la sessione', () => {
    const sim = designGame();
    sim.tick(T0 + 48 * 3_600_000);
    expect(sim.state.sessionUsedH).toBe(0);
  });
});
