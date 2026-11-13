import { describe, expect, it } from 'vitest';
import { activityTiles, listActivities } from '../src/ui/activities';
import { clickMap } from '../src/ui/mapSelection';
import { startedGame, surveyGame, T0 } from './helpers';

const bonifica = { kind: 'lavoro' as const, id: 'prep:bonifica:1' };
const sfalcio = { kind: 'lavoro' as const, id: 'prep:sfalcio:1' };

describe('punta e clicca: regole dei clic', () => {
  it('volontario e poi elemento: si apre la modale con quel volontario', () => {
    const a = clickMap(null, { volunteer: 'v5' });
    expect(a).toEqual({ selection: { volunteer: 'v5' } });
    const b = clickMap(a.selection, { activity: bonifica });
    expect(b).toEqual({ selection: null, open: { activity: bonifica, volunteerIds: ['v5'] } });
  });

  it("prima l'elemento mostra l'attività, il secondo clic apre la modale", () => {
    const a = clickMap(null, { activity: bonifica });
    expect(a).toEqual({ selection: { activity: bonifica } });
    expect(clickMap(a.selection, { activity: bonifica })).toEqual({ selection: null, open: { activity: bonifica, volunteerIds: [] } });
  });

  it("un clic su un altro elemento sposta la selezione senza aprire", () => {
    expect(clickMap({ activity: bonifica }, { activity: sfalcio })).toEqual({ selection: { activity: sfalcio } });
  });

  it('dopo un elemento, un clic su un volontario seleziona il volontario', () => {
    expect(clickMap({ activity: bonifica }, { volunteer: 'v1' })).toEqual({ selection: { volunteer: 'v1' } });
  });

  it('un clic su un punto non interagibile deseleziona', () => {
    expect(clickMap({ volunteer: 'v5' }, null)).toEqual({ selection: null });
    expect(clickMap({ activity: bonifica }, null)).toEqual({ selection: null });
  });
});

describe('attività sulla mappa del parco', () => {
  it('nel weekend i lavori del piano stanno sulle loro tile', () => {
    const sim = startedGame();
    sim.state.pratiche.forEach((p) => (p.status = 'approvata'));
    sim.closeSession(T0);
    const acts = listActivities(sim);
    const lavori = acts.filter((a) => a.kind === 'lavoro');
    expect(lavori.length).toBeGreaterThan(0);
    for (const a of lavori) expect(activityTiles(sim, a).length).toBeGreaterThan(0);
  });

  it("nella parte burocratica pratiche, ordini e raccolta fondi non hanno un posto al parco", () => {
    const sim = startedGame();
    const acts = listActivities(sim);
    expect(acts.some((a) => a.kind === 'richiesta')).toBe(true);
    for (const a of acts) expect(activityTiles(sim, a)).toEqual([]);
  });

  it('nel sopralluogo ogni punto sospetto sta sulla sua tile', () => {
    const sim = surveyGame();
    const w = sim.state.grid.width;
    for (const a of listActivities(sim)) {
      const p = sim.poi(a.id);
      expect(activityTiles(sim, a)).toEqual([p.y * w + p.x]);
    }
  });

  it("un'attività bloccata resta nella lista con il motivo, senza l'errore sulla squadra", () => {
    const sim = startedGame();
    sim.closeSession(T0); // weekend senza assicurazione approvata
    const a = listActivities(sim).find((x) => x.kind === 'lavoro')!;
    expect(a.blockers.join(' ')).toMatch(/Assicurazione/);
    expect(a.blockers).not.toContain('Scegli almeno un volontario');
  });
});
