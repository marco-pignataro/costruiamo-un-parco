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

  it("l'evento in piazza si fa nel weekend e serve il permesso di occupazione del suolo", () => {
    const sim = startedGame();
    sim.closeSession(T0); // al weekend
    expect(sim.previewTask('evento-piazza', ['v7', 'v5', 'v6']).errors.join(' ')).toMatch(/Occupazione di suolo pubblico/);
    sim.pratica('occupazione-suolo').status = 'approvata';
    const t = sim.startTask('evento-piazza', ['v7', 'v5', 'v6'], T0); // 12 / (1,1 + 2 + 2)
    expect(t.hours).toBeCloseTo(2.35, 2);
    const before = sim.state.budget;
    sim.tick(at(3));
    expect(sim.state.budget).toBe(before + 375); // 250 × 1,5
  });
});
