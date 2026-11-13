import { describe, expect, it } from 'vitest';
import { MIN_TEAM } from '../src/config';
import { defaultContent as c } from '../src/core/content';
import { Simulation } from '../src/core/simulation';
import { T0 } from './helpers';

const fresh = () => Simulation.newGame(c, T0);
const squad = () => {
  const sim = fresh();
  sim.confirmSite();
  return sim;
};

describe('Fase 1: scelta del terreno', () => {
  it('la partita comincia dalla scelta, con il primo terreno selezionato', () => {
    const sim = fresh();
    expect(sim.state.stage).toBe('terreno');
    expect(sim.state.siteId).toBe(c.sites[0].id);
    expect(sim.state.volunteers).toEqual([]);
  });

  it('ci sono almeno tre terreni; più difficili danno più cassa e PV', () => {
    expect(c.sites.length).toBeGreaterThanOrEqual(3);
    const byDiff = [...c.sites].sort((a, b) => a.difficulty - b.difficulty);
    for (let i = 1; i < byDiff.length; i++) {
      expect(byDiff[i].budget).toBeGreaterThan(byDiff[i - 1].budget);
      expect(byDiff[i].pv).toBeGreaterThan(byDiff[i - 1].pv);
      expect(byDiff[i].scoreMultiplier).toBeGreaterThan(byDiff[i - 1].scoreMultiplier);
    }
  });

  it('scegliere un terreno cambia griglia, cassa e PV; si può cambiare idea', () => {
    const sim = fresh();
    const other = c.sites[2];
    sim.chooseSite(other.id);
    expect(sim.state.budget).toBe(other.budget);
    expect(sim.state.pv).toBe(other.pv);
    expect(sim.state.grid.height).toBe(other.rows.length);
    sim.chooseSite(c.sites[1].id);
    expect(sim.site.id).toBe(c.sites[1].id);
  });

  it('confermato il terreno, non si cambia più', () => {
    const sim = squad();
    expect(sim.state.stage).toBe('squadra');
    expect(() => sim.chooseSite(c.sites[1].id)).toThrow('già scelto');
  });

  it('prima di squadra e progetto non si posa e non si lavora', () => {
    const sim = fresh();
    expect(sim.canPlace('cestino', 0, 0).errors).toEqual(['Prima vanno scelti terreno e squadra']);
    expect(sim.availableTasks()).toEqual([]);
    expect(() => sim.closeSession(T0)).toThrow();
  });
});

describe('Fase 2: squadra con i PV', () => {
  it('reclutare costa i PV dell’archetipo; congedare li restituisce', () => {
    const sim = squad();
    const pv = sim.state.pv;
    sim.recruit('v3'); // falegname, 3 PV
    expect(sim.state.pv).toBe(pv - 3);
    expect(sim.state.volunteers.map((v) => v.id)).toEqual(['v3']);
    expect(sim.state.volunteers[0]).toMatchObject({ skills: ['legno'], weeklyHours: 10, busy: false });
    sim.dismiss('v3');
    expect(sim.state.pv).toBe(pv);
    expect(sim.state.volunteers).toEqual([]);
  });

  it('senza PV sufficienti non si recluta', () => {
    const sim = squad();
    sim.state.pv = 5;
    expect(sim.recruitErrors('v1')).toEqual(['Servono 6 PV, ne restano 5']); // presidente
  });

  it('presidente e segretario/a: al massimo uno', () => {
    const sim = squad();
    sim.state.pv = 99;
    sim.recruit('v1');
    expect(sim.recruitErrors('v16').join(' ')).toMatch(/già un presidente/);
    expect(sim.recruitErrors('v1').join(' ')).toMatch(/già in squadra/);
  });

  it(`serve una squadra di almeno ${MIN_TEAM} volontari per andare avanti`, () => {
    const sim = squad();
    sim.recruit('v5');
    sim.recruit('v6');
    expect(sim.teamProblems()).toHaveLength(1);
    expect(() => sim.confirmTeam()).toThrow('almeno');
    sim.recruit('v15');
    sim.confirmTeam();
    expect(sim.state.stage).toBe('sopralluogo');
    expect(() => sim.recruit('v8')).toThrow('Fase 2');
  });

  it('con i PV del terreno sul torrente ci sta la squadra storica dei test', () => {
    const sim = squad();
    for (const id of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']) sim.recruit(id);
    expect(sim.state.pv).toBe(0);
  });
});

describe('Fase 2: aspetto dei volontari', () => {
  it('chi entra in squadra porta età, pelle e capelli del candidato', () => {
    const sim = squad();
    sim.recruit('v5');
    expect(sim.volunteer('v5')).toMatchObject({ name: 'Turi', age: 29, skin: 'ambrata', hair: 'nero' });
  });

  it('nome, pelle e capelli si cambiano mentre si compone la squadra', () => {
    const sim = squad();
    sim.recruit('v5');
    sim.customizeVolunteer('v5', { name: '  Turi   il Grande ', skin: 'scura', hair: 'rosso' });
    expect(sim.volunteer('v5')).toMatchObject({ name: 'Turi il Grande', skin: 'scura', hair: 'rosso' });
  });

  it('nomi vuoti o troppo lunghi e colori sconosciuti sono rifiutati', () => {
    const sim = squad();
    sim.recruit('v5');
    expect(() => sim.customizeVolunteer('v5', { name: '   ' })).toThrow('vuoto');
    expect(() => sim.customizeVolunteer('v5', { name: 'x'.repeat(40) })).toThrow('al massimo');
    expect(() => sim.customizeVolunteer('v5', { skin: 'verde' })).toThrow('sconosciuto');
    expect(() => sim.customizeVolunteer('v5', { hair: 'verde' })).toThrow('sconosciuto');
    expect(sim.volunteer('v5').name).toBe('Turi');
  });

  it('dopo la conferma della squadra l\'aspetto non cambia più', () => {
    const sim = squad();
    for (const id of ['v1', 'v5', 'v6']) sim.recruit(id);
    sim.confirmTeam();
    expect(() => sim.customizeVolunteer('v5', { hair: 'rosso' })).toThrow('Fase 2');
  });

  it('i colori dei candidati esistono tutti nella palette', () => {
    for (const m of c.candidates) {
      expect(c.appearance.skin.some((x) => x.id === m.skin)).toBe(true);
      expect(c.appearance.hair.some((x) => x.id === m.hair)).toBe(true);
    }
  });

  it('la stanchezza è la parte del monte settimanale già spesa', () => {
    const sim = squad();
    sim.recruit('v5');
    const v = sim.volunteer('v5');
    expect(sim.fatigue(v)).toBe(0);
    v.hoursUsed = 3;
    expect(sim.fatigue(v)).toBe(0.5);
    v.hoursUsed = 9;
    expect(sim.fatigue(v)).toBe(1);
  });
});
