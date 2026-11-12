import { describe, expect, it } from 'vitest';
import { MAX_PLAN_TASK_HOURS } from '../src/config';
import { defaultContent as c } from '../src/core/content';
import { createGrid, place, setSurface } from '../src/core/grid';
import { checkPlan, generatePlan } from '../src/core/plan';

/** Terreno 6×4: sentiero in alto, panchina su rifiuti, aiuola su erba alta. */
function demo() {
  const g = createGrid(6, 4);
  setSurface(g, 1, 1, 'rifiuti');
  setSurface(g, 2, 1, 'rifiuti'); // fuori dal progetto: niente bonifica qui
  setSurface(g, 3, 1, 'erba-alta');
  for (let x = 0; x < 6; x++) place(g, c, 'sentiero', x, 0);
  const panchina = place(g, c, 'panchina', 1, 1);
  const aiuola = place(g, c, 'aiuola', 3, 1);
  return { g, panchina, aiuola };
}

const byId = (plan: ReturnType<typeof generatePlan>, id: string) => {
  const t = plan.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`manca ${id}`);
  return t;
};

describe('piano di cantiere generato dal progetto', () => {
  it('nascono i compiti degli elementi e delle lavorazioni del terreno', () => {
    const { g, panchina, aiuola } = demo();
    const plan = generatePlan(g, c);
    expect(plan.tasks.map((t) => t.id).sort()).toEqual(
      [
        'prep:bonifica:1',
        'prep:sfalcio:1',
        'prep:livellamento:1',
        'prep:vangatura:1',
        'el:sentiero:1',
        `el:panchina:${panchina}`,
        `el:aiuola:${aiuola}`,
      ].sort(),
    );
    expect(checkPlan(plan)).toEqual([]);
  });

  it('le lavorazioni coprono solo le tile sotto il progetto', () => {
    const plan = generatePlan(demo().g, c);
    expect(byId(plan, 'prep:bonifica:1').tiles).toEqual([1 * 6 + 1]);
    expect(byId(plan, 'prep:livellamento:1').hours).toBe(7 * 1.5); // 6 sentieri + panchina
  });

  it('le dipendenze seguono le tile: bonifica → livellamento → sentiero → panchina', () => {
    const { g, panchina, aiuola } = demo();
    const plan = generatePlan(g, c);
    expect(byId(plan, 'prep:livellamento:1').after).toEqual(['prep:bonifica:1']);
    expect(byId(plan, 'prep:vangatura:1').after).toEqual(['prep:sfalcio:1']);
    expect(byId(plan, 'el:sentiero:1').after).toEqual(['prep:livellamento:1']);
    expect(byId(plan, `el:panchina:${panchina}`).after.sort()).toEqual(
      ['el:sentiero:1', 'prep:bonifica:1', 'prep:livellamento:1'].sort(),
    );
    expect(byId(plan, `el:aiuola:${aiuola}`).after.sort()).toEqual(['prep:sfalcio:1', 'prep:vangatura:1']);
  });

  it('i sentieri si raggruppano in un compito con i materiali sommati', () => {
    const plan = generatePlan(demo().g, c);
    const s = byId(plan, 'el:sentiero:1');
    expect(s.hours).toBe(12);
    expect(s.placements).toHaveLength(6);
    expect(s.materials).toEqual([{ id: 'ghiaia', qty: 12 }]);
  });

  it('pratiche e materiali del piano, senza doppioni', () => {
    const plan = generatePlan(demo().g, c);
    expect(plan.pratiche).toEqual(['assicurazione']);
    expect(plan.materials).toContainEqual({ id: 'ghiaia', qty: 12 });
    expect(plan.materials).toContainEqual({ id: 'piantine', qty: 12 });
  });

  it('i lavori lunghi si dividono in lotti che stanno in un weekend', () => {
    const g = createGrid(10, 1, 'rifiuti');
    for (let x = 0; x < 10; x++) place(g, c, 'staccionata', x, 0);
    const plan = generatePlan(g, c);
    const bonifiche = plan.tasks.filter((t) => t.id.startsWith('prep:bonifica'));
    const staccionate = plan.tasks.filter((t) => t.id.startsWith('el:staccionata'));
    expect(bonifiche).toHaveLength(3); // 10 tile × 3 h, lotti da 4 tile
    expect(staccionate).toHaveLength(4); // 10 × 4 h, lotti da 3
    expect(bonifiche[0].name).toBe('Bonifica dai rifiuti (lotto 1 di 3)');
    for (const t of plan.tasks) expect(t.hours).toBeLessThanOrEqual(MAX_PLAN_TASK_HOURS);
    // il secondo lotto di staccionata (tile 3-5) aspetta solo le bonifiche di quelle tile
    expect(staccionate[1].after.sort()).toEqual(['prep:bonifica:1', 'prep:bonifica:2']);
    expect(checkPlan(plan)).toEqual([]);
  });

  it('gli elementi già costruiti non rientrano nel piano', () => {
    const { g, panchina } = demo();
    g.built.push(panchina);
    const plan = generatePlan(g, c);
    expect(plan.tasks.some((t) => t.placements.includes(panchina))).toBe(false);
    expect(plan.tasks.some((t) => t.id.startsWith('prep:bonifica'))).toBe(false);
  });

  it('un progetto vuoto non genera né compiti né pratiche', () => {
    expect(generatePlan(createGrid(4, 4), c)).toEqual({ tasks: [], pratiche: [], materials: [] });
  });
});
