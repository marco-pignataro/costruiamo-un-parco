import { describe, expect, it } from 'vitest';
import { SURVEY } from '../src/config';
import { defaultContent } from '../src/core/content';
import type { Content } from '../src/core/content';
import { listActivities } from '../src/ui/activities';
import { surveyGame, T0 } from './helpers';

const H = 3_600_000;
const at = (h: number) => T0 + h * H;
const step = SURVEY.walkHoursPerTile;
// Terreno sul torrente, 14 × 11: i volontari aspettano sul marciapiede (y = 11), in fila dal primo.

describe('sopralluogo: i punti sospetti si scoprono perlustrando', () => {
  it('all’inizio nessun punto è visibile né analizzabile', () => {
    const sim = surveyGame();
    expect(listActivities(sim)).toEqual([]);
    expect(sim.previewAnalysis('tombino', ['v5']).errors).toContain('Nessuno ha ancora notato questo punto');
    expect(sim.surveyPosition('v5')).toEqual({ x: 4, y: 11 });
  });

  it('una perlustrazione senza indizi vicini arriva in fondo e lo dice nel resoconto', () => {
    const sim = surveyGame();
    const a = sim.startWalk(4, 0, ['v5'], T0); // x = 4: plastica (2,2) e tombino (6,6) restano a 2 tile
    expect(a.hours).toBeCloseTo(11 * step);
    sim.tick(at(2));
    expect(sim.state.active).toEqual([]);
    expect(sim.surveyPosition('v5')).toEqual({ x: 4, y: 0 });
    expect(sim.volunteer('v5').hoursUsed).toBeCloseTo(11 * step);
    expect(sim.unseenReports().at(-1)?.title).toBe('Perlustrazione: niente di strano');
    expect(sim.state.survey.every((p) => p.status === 'nascosto')).toBe(true);
  });

  it('chi passa vicino a un indizio si ferma lì, lo nota e restituisce le ore non camminate', () => {
    const sim = surveyGame();
    sim.startWalk(5, 0, ['v6'], T0); // x = 5: il tombino (6,6) si vede da y = 7, al quarto passo
    sim.tick(at(8)); // anche a gioco chiuso si ferma al punto giusto
    expect(sim.state.active).toEqual([]);
    expect(sim.surveyPosition('v6')).toEqual({ x: 5, y: 7 });
    expect(sim.volunteer('v6').hoursUsed).toBeCloseTo(4 * step);
    expect(sim.state.sessionUsedH).toBeCloseTo(4 * step);
    expect(sim.poiState('tombino')).toMatchObject({ status: 'notato', noticedBy: 'v6' });
    expect(sim.pendingNotices().map((n) => [n.poi.id, n.volunteerId])).toEqual([['tombino', 'v6']]);
    // nessun resoconto "niente di strano": c'è la domanda
    expect(sim.unseenReports().some((r) => r.title.startsWith('Perlustrazione'))).toBe(false);
  });

  it('approfondire o lasciar perdere: il punto resta sulla mappa e si può analizzare quando si vuole', () => {
    const sim = surveyGame();
    sim.startWalk(5, 0, ['v6'], T0);
    sim.tick(at(1));
    expect(listActivities(sim)).toEqual([]); // finché non si risponde, non è in lista
    sim.answerNotice('tombino');
    expect(sim.pendingNotices()).toEqual([]);
    expect(listActivities(sim).map((a) => a.id)).toEqual(['tombino']);
    expect(() => sim.answerNotice('tombino')).toThrow();
    sim.startAnalysis('tombino', ['v6'], at(1));
    expect(sim.surveyPosition('v6')).toEqual({ x: 6, y: 6 });
  });

  it('la perlustrazione riparte da dove il volontario si è fermato', () => {
    const sim = surveyGame();
    sim.startWalk(5, 0, ['v6'], T0);
    sim.tick(at(1));
    sim.answerNotice('tombino');
    const a = sim.startWalk(5, 0, ['v6'], at(1));
    expect(a.path![0]).toEqual({ x: 5, y: 7 });
    expect(a.hours).toBeCloseTo(7 * step);
  });

  it('un volontario alla volta, dentro il terreno, nelle ore della giornata e non dove già si trova', () => {
    const sim = surveyGame();
    expect(sim.previewWalk(3, 3, ['v5', 'v6']).errors).toContain('Si perlustra un volontario alla volta');
    expect(sim.previewWalk(14, 3, ['v5']).errors).toContain('Il punto è fuori dal terreno');
    sim.startWalk(4, 0, ['v5'], T0);
    sim.tick(at(2));
    expect(sim.previewWalk(4, 0, ['v5']).errors).toContain('Turi è già lì');
    sim.state.sessionUsedH = SURVEY.hours - 0.5;
    expect(sim.previewWalk(4, 10, ['v5']).errors.join(' ')).toMatch(/alla sessione restano/);
  });

  it('finita un’analisi, chi era sul punto nota gli indizi lì vicino', () => {
    const c = structuredClone(defaultContent) as Content;
    c.sites[0].pois.push({ id: 'vicino', x: 7, y: 7, clue: 'Un mattone fuori posto', hours: 1, hazard: null, area: null });
    const sim = surveyGame(c);
    sim.poiState('tombino').status = 'da-analizzare';
    sim.startAnalysis('tombino', ['v4'], T0);
    sim.tick(at(4));
    expect(sim.poiState('vicino')).toMatchObject({ status: 'notato', noticedBy: 'v4' });
  });

  it('a fine sopralluogo le posizioni si azzerano e i punti mai notati restano insidie nascoste', () => {
    const sim = surveyGame();
    sim.startWalk(5, 0, ['v6'], T0);
    sim.tick(at(1));
    sim.closeSession(at(1));
    expect(sim.state.stage).toBe('progettazione');
    expect(sim.state.surveyPos).toEqual({});
    expect(sim.state.hiddenHazards.map((h) => h.hazardId).sort()).toEqual(['cavita', 'falda-alta', 'rifiuti-interrati', 'sottoservizi']);
  });
});
