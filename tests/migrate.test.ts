import { describe, expect, it } from 'vitest';
import { defaultContent } from '../src/core/content';
import { migrate } from '../src/core/migrate';
import { Simulation } from '../src/core/simulation';

const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);

/** Un salvataggio della versione 1 a metà weekend, con un compito operativo in corso. */
function saveV1() {
  return {
    version: 1,
    msPerHour: 3_600_000,
    week: 1,
    phase: 'operativa',
    sessionUsedH: 1,
    lastTick: T0,
    volunteers: [
      { id: 'v2', name: 'Graziella', archetypeId: 'segretario', skills: ['organizzazione', 'burocrazia'], weeklyHours: 14, hoursUsed: 2, busy: false },
      { id: 'v5', name: 'Turi', archetypeId: 'base', skills: [], weeklyHours: 6, hoursUsed: 3, busy: true },
    ],
    active: [{ uid: 5, kind: 'lavoro', refId: 'raccolta-rifiuti', volunteerIds: ['v5'], startedAt: T0, endsAt: T0 + 3 * 3_600_000, hours: 3, quality: 'base' }],
    completedTasks: [],
    pratiche: [
      { id: 'assicurazione', status: 'approvata', waitRemainingH: 0 },
      { id: 'occupazione-suolo', status: 'in-attesa', waitRemainingH: 6 },
    ],
    reports: [],
    nextId: 6,
  };
}

describe('migrazione dei salvataggi', () => {
  it('v1 → v3: arrivano griglia, piano, cassa e magazzino; le pratiche restano come erano', () => {
    const s = migrate(saveV1(), defaultContent);
    expect(s.version).toBe(3);
    expect(s.budget).toBe(defaultContent.site.budget);
    expect(s.stock).toEqual({});
    expect(s.orders).toEqual([]);
    expect(s.grid.placements.length).toBeGreaterThan(0);
    expect(s.plan.length).toBeGreaterThan(0);
    expect(s.pratiche.find((p) => p.id === 'assicurazione')?.status).toBe('approvata');
    expect(s.pratiche.find((p) => p.id === 'occupazione-suolo')?.waitRemainingH).toBe(6);
  });

  it('i compiti operativi scomparsi si interrompono e restituiscono le ore', () => {
    const s = migrate(saveV1(), defaultContent);
    expect(s.active).toEqual([]);
    expect(s.volunteers.find((v) => v.id === 'v5')).toMatchObject({ busy: false, hoursUsed: 0 });
    expect(s.reports.map((r) => r.title)).toEqual(['Il cantiere è stato riprogettato', 'Arriva il magazzino', 'Compiti interrotti']);
  });

  it('il salvataggio migrato si gioca: tick e compiti del piano funzionano', () => {
    const sim = new Simulation(migrate(saveV1(), defaultContent), defaultContent);
    sim.tick(T0 + 3_600_000);
    expect(sim.availableTasks().map((t) => t.id)).toContain('prep:bonifica:1');
  });

  it('v2 → v3: il compito "Ordinare legno e viti" in corso si interrompe', () => {
    const v2 = { ...Simulation.newGame(defaultContent, T0).state, version: 2 } as Record<string, unknown>;
    delete v2.budget;
    delete v2.stock;
    delete v2.orders;
    v2.active = [{ uid: 99, kind: 'lavoro', refId: 'ordine-materiali', volunteerIds: ['v2'], startedAt: T0, endsAt: T0 + 3_600_000, hours: 2.7, quality: 'alta' }];
    (v2.volunteers as { id: string; busy: boolean; hoursUsed: number }[]).find((v) => v.id === 'v2')!.busy = true;
    const s = migrate(v2, defaultContent);
    expect(s.version).toBe(3);
    expect(s.active).toEqual([]);
    expect(s.volunteers.find((v) => v.id === 'v2')?.busy).toBe(false);
  });

  it('un salvataggio v3 passa invariato, uno sconosciuto viene rifiutato', () => {
    const s = Simulation.newGame(defaultContent, T0).state;
    expect(migrate(s, defaultContent)).toBe(s);
    expect(() => migrate({ version: 99 }, defaultContent)).toThrow('non riconosciuto');
  });
});
