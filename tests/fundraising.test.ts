import { describe, expect, it } from 'vitest';
import { startedGame, T0 } from './helpers';

const H = 3_600_000;
const at = (hours: number) => T0 + hours * H;

describe('raccolte fondi', () => {
  it('la raccolta online porta soldi in cassa, di più con il comunicatore', () => {
    const sim = startedGame();
    const before = sim.state.budget;
    sim.startTask('raccolta-fondi', ['v7'], T0); // comunicatrice: qualità alta, 120 × 1,5
    sim.tick(at(8));
    expect(sim.state.budget).toBe(before + 180);
    expect(sim.state.fundraising).toEqual([{ taskId: 'raccolta-fondi', week: 1, eur: 180 }]);
    expect(sim.unseenReports()[0].lines).toContain(`Raccolti: 180 € (in cassa ${before + 180} €)`);
  });

  it('senza il comunicatore rende la cifra base', () => {
    const sim = startedGame();
    expect(sim.fundraisingYield('raccolta-fondi', 'base')).toBe(120);
  });

  it('si può rifare, ma chiedere spesso rende meno; dopo qualche settimana si torna al pieno', () => {
    const sim = startedGame();
    sim.startTask('raccolta-fondi', ['v7'], T0);
    sim.tick(at(8));
    expect(sim.availableTasks().map((t) => t.id)).toContain('raccolta-fondi');
    expect(sim.fundraisingYield('raccolta-fondi', 'alta')).toBe(90);
    sim.state.week = 4;
    expect(sim.fundraisingYield('raccolta-fondi', 'alta')).toBe(180);
  });

  it('più il parco è realizzato, più la gente dona', () => {
    const sim = startedGame();
    const g = sim.state.grid;
    g.built = g.placements.map((p) => p.uid); // parco finito: + 50%
    expect(sim.fundraisingYield('raccolta-fondi', 'base')).toBe(180);
  });

  it('presidente e segretario/a fanno rendere di più la raccolta online', () => {
    const sim = startedGame();
    expect(sim.fundraisingYield('raccolta-fondi', 'alta', ['v7'])).toBe(180); // 120 × 1,5
    expect(sim.fundraisingYield('raccolta-fondi', 'alta', ['v7', 'v1'])).toBe(225); // × 1,25
    expect(sim.fundraisingYield('raccolta-fondi', 'alta', ['v7', 'v1', 'v2'])).toBe(280); // × 1,25 ≈ 281
    expect(sim.fundraisingYield('raccolta-fondi', 'base', ['v1', 'v2'])).toBe(190); // 187,5
  });

  it('il resoconto usa la squadra che ha lavorato', () => {
    const sim = startedGame();
    const before = sim.state.budget;
    sim.startTask('raccolta-fondi', ['v7', 'v1', 'v2'], T0);
    sim.tick(at(8));
    expect(sim.state.budget).toBe(before + 280);
  });

  it("non c'è più l'evento in piazza", () => {
    const sim = startedGame();
    expect(sim.state.pratiche.map((p) => p.id)).not.toContain('occupazione-suolo');
    expect(() => sim.taskDef('evento-piazza')).toThrow();
  });
});
