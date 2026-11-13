import { describe, expect, it } from 'vitest';
import { firstSite, startedGame, T0 } from './helpers';

/** Partita con una parte del progetto costruita, tutta di qualità alta. */
function builtGame(share: number) {
  const sim = startedGame();
  const g = sim.state.grid;
  const n = Math.round(g.placements.length * share);
  g.built = g.placements.slice(0, n).map((p) => p.uid);
  for (const t of sim.state.plan) if (t.placements.some((uid) => g.built.includes(uid))) sim.state.taskQuality[t.id] = 'alta';
  return sim;
}

describe('inaugurazione e punteggio', () => {
  it('serve almeno il 70% del progetto realizzato', () => {
    const sim = builtGame(0.5);
    expect(sim.inaugurationProblems().join(' ')).toMatch(/almeno il 70%/);
    expect(() => sim.inaugurate(T0)).toThrow();
  });

  it('non si inaugura con compiti in corso', () => {
    const sim = builtGame(1);
    sim.startTask('raccolta-fondi', ['v7'], T0);
    expect(sim.inaugurationProblems()).toContain('Ci sono compiti in corso');
  });

  it('il punteggio somma le voci e le moltiplica per la difficoltà del terreno', () => {
    const sim = builtGame(1);
    sim.state.budget = 300;
    const f = sim.score();
    expect(f.realizzazione).toBe(400);
    expect(f.qualita).toBe(150);
    expect(f.cassa).toBe(100);
    expect(f.rapidita).toBe(100); // settimana 1
    expect(f.gradimento).toBeGreaterThan(0);
    expect(f.base).toBe(f.realizzazione + f.gradimento + f.qualita + f.cassa + f.rapidita);
    expect(f.multiplier).toBe(firstSite.scoreMultiplier);
    expect(f.total).toBe(Math.round(f.base * f.multiplier));
  });

  it('più settimane e meno qualità valgono meno punti', () => {
    const sim = builtGame(1);
    const fast = sim.score();
    sim.state.week = 6;
    sim.state.taskQuality = {};
    const slow = sim.score();
    expect(slow.rapidita).toBe(50);
    expect(slow.qualita).toBe(0);
    expect(slow.total).toBeLessThan(fast.total);
  });

  it('il taglio del nastro chiude la partita con il punteggio', () => {
    const sim = builtGame(0.8);
    const f = sim.inaugurate(T0);
    expect(sim.state.stage).toBe('inaugurato');
    expect(sim.state.finale).toEqual(f);
    expect(sim.unseenReports().at(-1)?.title).toBe('Il parco è inaugurato!');
    expect(sim.availableTasks()).toEqual([]);
    expect(() => sim.inaugurate(T0)).toThrow();
  });
});
