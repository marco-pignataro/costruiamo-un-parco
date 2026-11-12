import { MAX_PLAN_TASK_HOURS } from '../config';
import type { Content } from './content';
import type { ElementDef, ParkGrid, Placement, PlanTask, PrepDef } from './types';

export interface ConstructionPlan {
  tasks: PlanTask[];
  /** Pratiche necessarie, senza doppioni: le altre non nascono. */
  pratiche: string[];
  /** Materiali da ordinare per tutto il progetto. */
  materials: { id: string; qty: number }[];
}

/** Divide una lista in lotti da al massimo `size` elementi. */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function lotSize(hoursEach: number): number {
  return Math.max(1, Math.floor(MAX_PLAN_TASK_HOURS / hoursEach));
}

function lotName(name: string, i: number, n: number): string {
  return n > 1 ? `${name} (lotto ${i + 1} di ${n})` : name;
}

function sumMaterials(list: { id: string; qty: number }[]): { id: string; qty: number }[] {
  const m = new Map<string, number>();
  for (const x of list) m.set(x.id, (m.get(x.id) ?? 0) + x.qty);
  return [...m].map(([id, qty]) => ({ id, qty }));
}

/**
 * Dal progetto disegnato al piano di cantiere. Ogni elemento non ancora
 * costruito diventa un compito; sotto di lui nascono le lavorazioni del terreno
 * (dalla superficie o richieste dall'elemento), divise in lotti. Le dipendenze
 * seguono le tile: un compito aspetta solo i lotti che lavorano sotto di lui.
 */
export function generatePlan(g: ParkGrid, c: Content): ConstructionPlan {
  const el = (id: string): ElementDef => {
    const e = c.elements.find((x) => x.id === id);
    if (!e) throw new Error(`Elemento sconosciuto: ${id}`);
    return e;
  };
  const todo = g.placements
    .filter((p) => !g.built.includes(p.uid))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.uid - b.uid);
  const tilesOf = (p: Placement): number[] => {
    const e = el(p.elementId);
    const t: number[] = [];
    for (let dy = 0; dy < e.h; dy++) for (let dx = 0; dx < e.w; dx++) t.push((p.y + dy) * g.width + p.x + dx);
    return t;
  };

  // 1. Quali lavorazioni servono su quali tile.
  const prepTiles = new Map<string, Set<number>>();
  for (const p of todo) {
    const e = el(p.elementId);
    for (const t of tilesOf(p)) {
      for (const prep of c.preparations) {
        const bySurface = prep.surfaces?.includes(g.surface[t]) ?? false;
        const risk = g.risk[t];
        const byRisk = risk !== null && prep.risks.includes(risk);
        if (bySurface || byRisk || e.prep.includes(prep.id)) {
          if (!prepTiles.has(prep.id)) prepTiles.set(prep.id, new Set());
          prepTiles.get(prep.id)!.add(t);
        }
      }
    }
  }

  const tasks: PlanTask[] = [];
  /** Per ogni tile, i compiti di lavorazione che la toccano, per lavorazione. */
  const prepTaskAt = new Map<string, Map<number, string>>();

  // 2. Lotti di lavorazioni, nell'ordine del catalogo; dipendono dai lotti
  //    delle lavorazioni "after" sulle stesse tile.
  for (const prep of orderPreps(c.preparations)) {
    const tiles = [...(prepTiles.get(prep.id) ?? [])].sort((a, b) => a - b);
    const lots = chunk(tiles, lotSize(prep.hoursPerTile));
    const at = new Map<number, string>();
    lots.forEach((lot, i) => {
      const id = `prep:${prep.id}:${i + 1}`;
      lot.forEach((t) => at.set(t, id));
      tasks.push({
        id,
        name: lotName(prep.name, i, lots.length),
        phase: 'operativa',
        hours: lot.length * prep.hoursPerTile,
        skill: prep.skill,
        maxVolunteers: prep.maxVolunteers,
        requires: [...prep.pratiche],
        after: depsOn(lot, prep.after, prepTaskAt),
        materials: sumMaterials(lot.flatMap(() => prep.materialsPerTile)),
        placements: [],
        tiles: lot,
        prepId: prep.id,
      });
    });
    prepTaskAt.set(prep.id, at);
  }
  const allPreps = c.preparations.map((p) => p.id);

  // 3. Compiti degli elementi: raggruppabili in lotti, gli altri uno per uno.
  const builtBy = new Map<number, string>(); // uid elemento -> compito
  const groups = new Map<string, Placement[]>();
  const elementTasks: { id: string; placements: Placement[]; e: ElementDef; name: string }[] = [];
  for (const p of todo) {
    const e = el(p.elementId);
    if (e.groupable) {
      if (!groups.has(e.id)) groups.set(e.id, []);
      groups.get(e.id)!.push(p);
    } else {
      elementTasks.push({ id: `el:${e.id}:${p.uid}`, placements: [p], e, name: `${e.name} (${p.x},${p.y})` });
    }
  }
  for (const [id, list] of groups) {
    const e = el(id);
    const lots = chunk(list, lotSize(e.hours));
    lots.forEach((lot, i) => elementTasks.push({ id: `el:${id}:${i + 1}`, placements: lot, e, name: lotName(e.name, i, lots.length) }));
  }
  for (const t of elementTasks) t.placements.forEach((p) => builtBy.set(p.uid, t.id));

  for (const t of elementTasks) {
    const tiles = t.placements.flatMap(tilesOf);
    const after = new Set(depsOn(tiles, allPreps, prepTaskAt));
    if (t.e.adjacentTo) {
      for (const p of t.placements) {
        for (const n of neighbours(g, p, todo, tilesOf)) {
          if (n.elementId === t.e.adjacentTo && builtBy.get(n.uid) !== t.id) after.add(builtBy.get(n.uid)!);
        }
      }
    }
    tasks.push({
      id: t.id,
      name: t.name,
      phase: 'operativa',
      hours: t.e.hours * t.placements.length,
      skill: t.e.skill,
      maxVolunteers: t.e.maxVolunteers,
      requires: [...t.e.pratiche],
      after: [...after],
      materials: sumMaterials(t.placements.flatMap(() => t.e.materials)),
      placements: t.placements.map((p) => p.uid),
      tiles,
      prepId: null,
    });
  }

  return {
    tasks,
    pratiche: [...new Set(tasks.flatMap((t) => t.requires))],
    materials: sumMaterials(tasks.flatMap((t) => t.materials)),
  };
}

/** Compiti delle lavorazioni `preps` che toccano almeno una delle tile. */
function depsOn(tiles: number[], preps: string[], prepTaskAt: Map<string, Map<number, string>>): string[] {
  const out = new Set<string>();
  for (const p of preps) {
    const at = prepTaskAt.get(p);
    if (!at) continue;
    for (const t of tiles) {
      const id = at.get(t);
      if (id) out.add(id);
    }
  }
  return [...out];
}

/** Ordina le lavorazioni in modo che ognuna venga dopo quelle in `after`. */
function orderPreps(preps: PrepDef[]): PrepDef[] {
  const out: PrepDef[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (p: PrepDef) => {
    if (state.get(p.id) === 'done') return;
    if (state.get(p.id) === 'visiting') throw new Error(`Ciclo tra le lavorazioni: ${p.id}`);
    state.set(p.id, 'visiting');
    for (const a of p.after) {
      const d = preps.find((x) => x.id === a);
      if (d) visit(d);
    }
    state.set(p.id, 'done');
    out.push(p);
  };
  preps.forEach(visit);
  return out;
}

/** Elementi da costruire che toccano un lato dell'elemento p. */
function neighbours(
  g: ParkGrid,
  p: Placement,
  todo: Placement[],
  tilesOf: (p: Placement) => number[],
): Placement[] {
  const mine = new Set(tilesOf(p));
  const around = new Set<number>();
  for (const t of mine) {
    const x = t % g.width;
    const y = Math.floor(t / g.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < g.width && ny < g.height) around.add(ny * g.width + nx);
    }
  }
  return todo.filter((o) => o.uid !== p.uid && tilesOf(o).some((t) => around.has(t) && !mine.has(t)));
}

/** Controlla che le dipendenze del piano non abbiano cicli e puntino a compiti esistenti. */
export function checkPlan(plan: ConstructionPlan): string[] {
  const ids = new Set(plan.tasks.map((t) => t.id));
  const errors: string[] = [];
  for (const t of plan.tasks) for (const a of t.after) if (!ids.has(a)) errors.push(`${t.id}: dipende da ${a}, che non esiste`);
  const done = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of plan.tasks) {
      if (!done.has(t.id) && t.after.every((a) => done.has(a))) {
        done.add(t.id);
        progress = true;
      }
    }
  }
  if (done.size < plan.tasks.length) errors.push('Ciclo nelle dipendenze del piano');
  return errors;
}

/**
 * Pratiche della partita: quelle che il piano richiede, quelle dei compiti
 * fissi e quelle che non dipendono dal progetto. Una pratica legata solo a
 * elementi assenti dal progetto non nasce (niente telecamere, niente
 * videosorveglianza).
 */
export function gamePratiche(c: Content, planPratiche: string[]): string[] {
  const fromCatalog = new Set([...c.elements.flatMap((e) => e.pratiche), ...c.preparations.flatMap((p) => p.pratiche)]);
  const needed = new Set([...planPratiche, ...c.tasks.flatMap((t) => t.requires)]);
  return c.pratiche.filter((p) => needed.has(p.id) || !fromCatalog.has(p.id)).map((p) => p.id);
}

/**
 * Compiti di messa in sicurezza per un'insidia emersa in cantiere. Coprono solo
 * le tile dell'insidia sotto elementi non ancora costruiti; aspettano le
 * lavorazioni preliminari ancora da fare sulle stesse tile.
 */
export function emergencyTasks(
  g: ParkGrid,
  c: Content,
  hazardId: string,
  hazardTiles: number[],
  plan: PlanTask[],
  completed: string[],
  tag: string,
): PlanTask[] {
  const hazard = c.hazards.find((h) => h.id === hazardId);
  if (!hazard) throw new Error(`Insidia sconosciuta: ${hazardId}`);
  const prep = c.preparations.find((p) => p.id === hazard.prep);
  if (!prep) throw new Error(`Lavorazione sconosciuta: ${hazard.prep}`);
  const underProject = new Set<number>();
  for (const p of g.placements) {
    if (g.built.includes(p.uid)) continue;
    const e = c.elements.find((x) => x.id === p.elementId);
    if (!e) continue;
    for (let dy = 0; dy < e.h; dy++) for (let dx = 0; dx < e.w; dx++) underProject.add((p.y + dy) * g.width + p.x + dx);
  }
  const tiles = hazardTiles.filter((t) => underProject.has(t)).sort((a, b) => a - b);
  const lots = chunk(tiles, lotSize(prep.hoursPerTile));
  return lots.map((lot, i) => ({
    id: `risk:${hazardId}:${tag}:${i + 1}`,
    name: lotName(`${prep.name} (imprevisto)`, i, lots.length),
    phase: 'operativa' as const,
    hours: lot.length * prep.hoursPerTile,
    skill: prep.skill,
    maxVolunteers: prep.maxVolunteers,
    requires: [...prep.pratiche],
    after: plan
      .filter((t) => !completed.includes(t.id) && t.prepId !== null && prep.after.includes(t.prepId) && t.tiles.some((x) => lot.includes(x)))
      .map((t) => t.id),
    materials: sumMaterials(lot.flatMap(() => prep.materialsPerTile)),
    placements: [],
    tiles: lot,
    prepId: prep.id,
  }));
}
