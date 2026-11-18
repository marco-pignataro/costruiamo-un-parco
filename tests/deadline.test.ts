import { describe, expect, it } from 'vitest';
import { DEADLINE } from '../src/config';
import { defaultContent } from '../src/core/content';
import { deadlineWeeks, rapidityPoints } from '../src/core/deadline';
import { migrate } from '../src/core/migrate';
import { buildTimeline, timelineWindow } from '../src/ui/timeline';
import { designGame, startedGame, surveyGame, T0 } from './helpers';

const H = 3_600_000;

/** Porta la partita alla fine del weekend della settimana in corso, con una quota del progetto costruita. */
function endWeek(sim: ReturnType<typeof startedGame>, share: number, at = T0) {
  const g = sim.state.grid;
  g.built = g.placements.slice(0, Math.round(g.placements.length * share)).map((p) => p.uid);
  if (sim.state.phase === 'burocratica') sim.closeSession(at);
  sim.closeSession(at);
}

describe('data di consegna', () => {
  it('settimane = settimana di pratiche e ordini + ore del piano / ore a settimana + margine', () => {
    expect(deadlineWeeks(0)).toBe(DEADLINE.setupWeeks + DEADLINE.marginWeeks);
    expect(deadlineWeeks(30)).toBe(3);
    expect(deadlineWeeks(31)).toBe(4);
    expect(deadlineWeeks(97)).toBe(6);
  });

  it('in progettazione la consegna prevista segue il progetto: meno arredi, meno settimane', () => {
    const sim = designGame();
    const before = sim.designSummary();
    expect(before.weeks).toBe(deadlineWeeks(before.hours));
    for (const p of [...sim.state.grid.placements]) sim.removeElement(p.uid);
    sim.placeElement('cestino', 1, 1);
    expect(sim.designSummary().weeks).toBeLessThan(before.weeks);
  });

  it('il terreno conta: lo stesso arredo costa più settimane dove c’è più da preparare', () => {
    const hoursFor = (siteId: string) => {
      const sim = designGame();
      sim.state.stage = 'terreno';
      sim.chooseSite(siteId);
      sim.state.stage = 'progettazione';
      return sim.designSummary();
    };
    const scuola = hoursFor('giardino-scuola');
    const collina = hoursFor('collina-stretto');
    expect(collina.weeks).toBeGreaterThan(scuola.weeks);
  });

  it('si fissa alla conferma del progetto e il resoconto la dice', () => {
    const sim = startedGame();
    expect(sim.state.deadlineWeek).toBe(6);
    expect(sim.weeksLeft).toBe(6);
    const fresh = designGame();
    fresh.confirmProject(T0);
    expect(fresh.unseenReports().at(-1)!.lines.join(' ')).toMatch(/entro il weekend della settimana 6/);
  });

  it('a fine settimana si registra l’avanzamento e si avvisa quando resta l’ultima', () => {
    const sim = startedGame();
    sim.state.deadlineWeek = 2;
    endWeek(sim, 0.3);
    expect(sim.state.week).toBe(2);
    expect(sim.state.weekLog).toEqual([{ week: 1, progress: expect.closeTo(0.29, 1) }]);
    expect(sim.unseenReports().at(-1)!.lines.join(' ')).toMatch(/la prossima è l'ultima settimana/);
  });

  it('alla data di consegna, con abbastanza progetto, si inaugura da soli', () => {
    const sim = startedGame();
    sim.state.deadlineWeek = 1;
    endWeek(sim, 0.8);
    expect(sim.state.stage).toBe('inaugurato');
    expect(sim.state.finale?.week).toBe(1);
    expect(sim.unseenReports().at(-1)!.lines[0]).toMatch(/data di consegna/);
  });

  it('alla data di consegna, sotto il minimo, la partita è persa', () => {
    const sim = startedGame();
    sim.state.deadlineWeek = 1;
    endWeek(sim, 0.5);
    expect(sim.state.stage).toBe('fallito');
    expect(sim.state.finale).toBeNull();
    expect(sim.unseenReports().at(-1)?.title).toBe('Consegna mancata');
    expect(sim.tutorialPanel()).toBeNull();
    sim.tick(T0 + 100 * H); // niente si muove più
    expect(sim.state.stage).toBe('fallito');
  });

  it('la rapidità conta le settimane d’anticipo sulla consegna', () => {
    expect(rapidityPoints(1, 6)).toBe(100);
    expect(rapidityPoints(4, 6)).toBe(50);
    expect(rapidityPoints(6, 6)).toBe(17);
  });

  it('v10 → v11: un cantiere aperto riceve la consegna dai lavori che restano', () => {
    const sim = startedGame();
    sim.state.week = 3;
    const v10 = structuredClone(sim.state) as unknown as Record<string, unknown>;
    v10.version = 10;
    delete v10.deadlineWeek;
    delete v10.weekLog;
    const s = migrate(v10, defaultContent);
    // 97 h restanti: 4 settimane di lavoro + 1 di margine, dalla settimana 3
    expect(s.deadlineWeek).toBe(3 + 4 + 1 - 1);
    expect(s.weekLog).toEqual([]);
    expect(s.reports.at(-1)?.title).toBe('Arriva la data di consegna');
    const early = structuredClone(surveyGame().state) as unknown as Record<string, unknown>;
    early.version = 10;
    expect(migrate(early, defaultContent).deadlineWeek).toBeNull();
  });
});

describe('timeline delle settimane', () => {
  it('non c’è prima della progettazione; in progettazione è prevista', () => {
    expect(buildTimeline(surveyGame())).toBeNull();
    const t = buildTimeline(designGame())!;
    expect(t.provisional).toBe(true);
    expect(t.current).toBe(0);
    expect(t.weeks.every((w) => w.status === 'futura')).toBe(true);
    expect(t.weeks.at(-1)!.deadline).toBe(true);
  });

  it('in cantiere: settimane passate con l’avanzamento, quella in corso con la sua parte, le consegne dei materiali', () => {
    const sim = startedGame();
    endWeek(sim, 0.2);
    sim.closeSession(T0); // settimana 2, al weekend
    sim.state.orders.push({ uid: 999, taskId: sim.state.plan[0].id, materials: [], costEur: 0, status: 'in-consegna', arrivesWeek: 3 });
    const t = buildTimeline(sim)!;
    expect(t.total).toBe(6);
    expect(t.weeks.map((w) => w.status)).toEqual(['passata', 'in-corso', 'futura', 'futura', 'futura', 'futura']);
    expect(t.weeks[0].progress).toBeCloseTo(0.2, 1);
    expect(t.weeks[1].phase).toBe('operativa');
    expect(t.weeks[2].deliveries).toEqual([sim.state.plan[0].name]);
  });

  it('chiusa mostra la settimana in corso con la precedente e la successiva', () => {
    expect(timelineWindow(6, 1)).toEqual([1, 3]);
    expect(timelineWindow(6, 3)).toEqual([2, 4]);
    expect(timelineWindow(6, 6)).toEqual([4, 6]);
    expect(timelineWindow(2, 1)).toEqual([1, 2]);
  });
});
