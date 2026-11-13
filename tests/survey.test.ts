import { describe, expect, it } from 'vitest';
import { SURVEY } from '../src/config';
import { defaultContent as c } from '../src/core/content';
import { surveyGame, T0 } from './helpers';

const H = 3_600_000;
const at = (h: number) => T0 + h * H;
const site = c.sites[0]; // ex deposito sul torrente
const poi = (id: string) => site.pois.find((p) => p.id === id)!;
const areaTiles = (id: string) => {
  const a = poi(id).area!;
  const out: number[] = [];
  for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) out.push(y * site.rows[0].length + x);
  return out;
};

describe('Fase 3: sopralluogo', () => {
  it('dopo la squadra si fa il sopralluogo: una giornata di 8 ore con i punti sospetti del terreno', () => {
    const sim = surveyGame();
    expect(sim.state.stage).toBe('sopralluogo');
    expect(sim.sessionLimitH).toBe(SURVEY.hours);
    expect(sim.state.survey.map((p) => p.id)).toEqual(site.pois.map((p) => p.id));
    expect(sim.state.survey.every((p) => p.status === 'da-analizzare')).toBe(true);
  });

  it('con lo specialista giusto l’insidia si trova sempre e finisce sulla mappa dei rischi', () => {
    const sim = surveyGame();
    sim.startAnalysis('ristagni', ['v4'], T0); // giardiniera: lente "verde" sulla falda
    sim.tick(at(4));
    expect(sim.poiState('ristagni')).toMatchObject({ status: 'analizzato', found: 'falda-alta' });
    for (const i of areaTiles('ristagni')) expect(sim.state.grid.risk[i]).toBe('falda-alta');
    expect(sim.unseenReports().at(-1)?.title).toBe('Sopralluogo: Falda alta');
  });

  it('un falso allarme non segna niente', () => {
    const sim = surveyGame();
    sim.startAnalysis('odore', ['v5'], T0);
    sim.tick(at(3));
    expect(sim.poiState('odore').found).toBeNull();
    expect(sim.state.grid.risk.every((r) => r === null)).toBe(true);
  });

  it('senza specialista a volte l’insidia sfugge, con una frequenza vicina a errorChance', () => {
    let missed = 0;
    const runs = 300;
    for (let seed = 1; seed <= runs; seed++) {
      const sim = surveyGame();
      sim.state.rng = seed * 7919;
      sim.startAnalysis('ristagni', ['v5'], T0); // Turi, senza la lente
      sim.tick(at(5));
      if (sim.poiState('ristagni').found === null) missed++;
    }
    const expected = c.hazards.find((h) => h.id === 'falda-alta')!.errorChance;
    expect(missed / runs).toBeGreaterThan(expected - 0.1);
    expect(missed / runs).toBeLessThan(expected + 0.1);
  });

  it('lo stesso seme dà lo stesso esito', () => {
    const run = () => {
      const sim = surveyGame();
      sim.state.rng = 12345;
      sim.startAnalysis('ristagni', ['v5'], T0);
      sim.tick(at(5));
      return sim.poiState('ristagni').found;
    };
    expect(run()).toBe(run());
  });

  it('le analisi hanno un massimo di volontari e devono stare nelle ore della giornata', () => {
    const sim = surveyGame();
    expect(sim.previewAnalysis('tombino', ['v5', 'v6', 'v1']).errors).toContain('Massimo 2 volontari');
    sim.startAnalysis('plastica', ['v5'], T0); // 2 ore
    sim.tick(at(2));
    sim.startAnalysis('avvallamento', ['v6'], at(2)); // 4 ore
    sim.tick(at(6));
    expect(sim.previewAnalysis('ristagni', ['v2']).errors.join(' ')).toMatch(/alla sessione restano 2 h/);
  });

  it('chiudere il sopralluogo porta alla progettazione; le insidie non viste restano nascoste', () => {
    const sim = surveyGame();
    sim.startAnalysis('ristagni', ['v4'], T0);
    sim.tick(at(4));
    sim.closeSession(at(4));
    expect(sim.state.stage).toBe('progettazione');
    expect(sim.state.volunteers.every((v) => v.hoursUsed === 0)).toBe(true);
    expect(sim.state.hiddenHazards.map((h) => h.hazardId).sort()).toEqual(['cavita', 'rifiuti-interrati', 'sottoservizi']);
    expect(sim.unseenReports().at(-1)?.title).toBe('Sopralluogo concluso');
  });

  it('a 8 ore di analisi il sopralluogo si chiude da solo', () => {
    const sim = surveyGame();
    sim.startAnalysis('avvallamento', ['v6'], T0); // 4 ore
    sim.tick(at(4));
    sim.startAnalysis('ristagni', ['v5'], at(4)); // 4 ore
    sim.tick(at(9));
    expect(sim.state.stage).toBe('progettazione');
  });
});

describe('insidie in progettazione e in cantiere', () => {
  it('costruire su un’insidia nota aggiunge messa in sicurezza e costi al preventivo', () => {
    const sim = surveyGame();
    sim.closeSession(T0);
    const before = sim.designSummary();
    expect(before.riskTiles).toBe(0);
    for (const i of areaTiles('ristagni')) sim.state.grid.risk[i] = 'falda-alta'; // come dopo un'analisi riuscita
    const after = sim.designSummary();
    // sotto la falda: panchina (9,4) e sentiero (9-11,5) = 4 tile × (tubo 18 € + 2 ghiaia 12 €)
    expect(after.riskTiles).toBe(4);
    expect(after.costEur).toBe(before.costEur + 4 * 30);
  });

  it('un’insidia sfuggita emerge in cantiere e blocca i lavori sopra di lei', () => {
    const sim = surveyGame();
    sim.closeSession(T0); // nessuna analisi: tutto resta nascosto
    sim.confirmProject(T0);
    sim.pratica('assicurazione').status = 'approvata';
    sim.pratica('smaltimento').status = 'approvata';
    sim.closeSession(T0); // al weekend
    sim.startTask('prep:bonifica:1', ['v5', 'v6', 'v1', 'v7'], at(1)); // bonifica sotto l'aiuola, dove ci sono rifiuti interrati
    sim.tick(at(5));
    const extra = sim.state.plan.find((t) => t.id.startsWith('risk:rifiuti-interrati'))!;
    expect(extra).toBeDefined();
    expect(extra.tiles).toHaveLength(4); // le 4 tile dell'aiuola dentro l'area
    expect(extra.materials).toEqual([{ id: 'big-bag', qty: 4 }]);
    const aiuola = sim.state.plan.find((t) => t.id.startsWith('el:aiuola'))!;
    expect(aiuola.after).toContain(extra.id);
    expect(sim.state.plan.find((t) => t.id === 'prep:vangatura:1')!.after).toContain(extra.id);
    expect(sim.state.hiddenHazards.some((h) => h.hazardId === 'rifiuti-interrati')).toBe(false);
    expect(sim.unseenReports().some((r) => r.title === 'Imprevisto: Rifiuti interrati')).toBe(true);
    expect(sim.orderableTasks().map((t) => t.id)).toContain(extra.id);
  });

  it('finita la messa in sicurezza, su quelle tile il rischio sparisce', () => {
    const sim = surveyGame();
    sim.closeSession(T0);
    for (const i of areaTiles('plastica')) sim.state.grid.risk[i] = 'rifiuti-interrati'; // come se l'analisi l'avesse trovata
    sim.state.hiddenHazards = [];
    sim.state.budget = 1000; // con l'insidia nota il progetto proposto costa più della cassa
    sim.confirmProject(T0);
    sim.pratica('assicurazione').status = 'approvata';
    sim.pratica('smaltimento').status = 'approvata';
    sim.closeSession(T0);
    const task = sim.state.plan.find((t) => t.id.startsWith('prep:scavo-rifiuti-interrati'))!;
    sim.state.completedTasks.push(...sim.missingPrerequisites(task).map((t) => t.id));
    sim.state.stock['big-bag'] = 4;
    sim.startTask(task.id, ['v5', 'v6', 'v1', 'v7'], at(1)); // 12 / 4 = 3 h
    sim.tick(at(5));
    for (const i of task.tiles) expect(sim.state.grid.risk[i]).toBeNull();
    // fuori dal progetto il rischio resta segnato
    expect(areaTiles('plastica').some((i) => sim.state.grid.risk[i] === 'rifiuti-interrati')).toBe(true);
  });
});
