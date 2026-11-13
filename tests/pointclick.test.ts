import { describe, expect, it } from 'vitest';
import { activityTiles, listActivities } from '../src/ui/activities';
import { chooseActivity, clickMap } from '../src/ui/mapSelection';
import { startedGame, surveyGame, T0 } from './helpers';

const bonifica = { kind: 'lavoro' as const, id: 'prep:bonifica:1' };
const sfalcio = { kind: 'lavoro' as const, id: 'prep:sfalcio:1' };

const at = (ref: { kind: 'lavoro'; id: string }) => ({ place: `${ref.kind}:${ref.id}`, activities: [ref] });
const ordine1 = { kind: 'ordine' as const, id: 'el:panchina:1' };
const ordine2 = { kind: 'ordine' as const, id: 'el:cestino:1' };
const fornitore = { place: 'fornitore', activities: [ordine1, ordine2] };

describe('punta e clicca: regole dei clic', () => {
  it('volontario e poi elemento: si apre la modale con quel volontario', () => {
    const a = clickMap(null, { volunteer: 'v5' });
    expect(a).toEqual({ selection: { type: 'volontario', volunteer: 'v5' } });
    const b = clickMap(a.selection, at(bonifica));
    expect(b).toEqual({ selection: null, open: { activity: bonifica, volunteerIds: ['v5'] } });
  });

  it("prima l'elemento mostra l'attività, il secondo clic apre la modale", () => {
    const a = clickMap(null, at(bonifica));
    expect(a.selection).toMatchObject({ type: 'luogo', place: 'lavoro:prep:bonifica:1' });
    expect(a.open).toBeUndefined();
    expect(clickMap(a.selection, at(bonifica))).toEqual({ selection: null, open: { activity: bonifica, volunteerIds: [] } });
  });

  it('un clic su un altro elemento sposta la selezione senza aprire', () => {
    const a = clickMap(null, at(bonifica));
    expect(clickMap(a.selection, at(sfalcio)).selection).toMatchObject({ type: 'luogo', activities: [sfalcio] });
  });

  it('dopo un elemento, un clic su un volontario seleziona il volontario', () => {
    expect(clickMap(clickMap(null, at(bonifica)).selection, { volunteer: 'v1' })).toEqual({ selection: { type: 'volontario', volunteer: 'v1' } });
  });

  it('un clic su un punto non interagibile deseleziona', () => {
    expect(clickMap({ type: 'volontario', volunteer: 'v5' }, null)).toEqual({ selection: null });
    expect(clickMap(clickMap(null, at(bonifica)).selection, null)).toEqual({ selection: null });
  });

  it("volontario e poi un edificio con più attività: si sceglie dall'elenco e il volontario resta", () => {
    const a = clickMap({ type: 'volontario', volunteer: 'v2' }, fornitore);
    expect(a.open).toBeUndefined();
    expect(a.selection).toEqual({ type: 'luogo', place: 'fornitore', activities: [ordine1, ordine2], volunteer: 'v2' });
    expect(chooseActivity(a.selection, ordine2)).toEqual({ selection: null, open: { activity: ordine2, volunteerIds: ['v2'] } });
  });

  it('un secondo clic su un edificio con più attività apre la prima', () => {
    const a = clickMap(null, fornitore);
    expect(clickMap(a.selection, fornitore).open).toEqual({ activity: ordine1, volunteerIds: [] });
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
