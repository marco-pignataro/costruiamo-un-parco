import archetypes from '../data/archetypes.json';
import tasks from '../data/tasks.json';
import pratiche from '../data/pratiche.json';
import candidates from '../data/candidates.json';
import elements from '../data/elements.json';
import materials from '../data/materials.json';
import preparations from '../data/preparations.json';
import sites from '../data/sites.json';
import { GRID_MAX } from '../config';
import { estimate, gridFromSite, validateProject } from './grid';
import type { Archetype, CandidateDef, ElementDef, MaterialDef, PraticaDef, PrepDef, SiteDef, TaskDef } from './types';

export interface Content {
  archetypes: Archetype[];
  tasks: TaskDef[];
  pratiche: PraticaDef[];
  /** Persone reclutabili in Fase 2. */
  candidates: CandidateDef[];
  elements: ElementDef[];
  materials: MaterialDef[];
  preparations: PrepDef[];
  /** Terreni tra cui scegliere in Fase 1, ognuno con il suo progetto proposto. */
  sites: SiteDef[];
}

export const defaultContent: Content = {
  archetypes: archetypes as Archetype[],
  tasks: tasks as TaskDef[],
  pratiche: pratiche as PraticaDef[],
  candidates: candidates as CandidateDef[],
  elements: elements as ElementDef[],
  materials: materials as MaterialDef[],
  preparations: preparations as PrepDef[],
  sites: sites as SiteDef[],
};

/**
 * Controlla che i riferimenti tra i JSON siano coerenti (materiali, pratiche,
 * skill, elementi adiacenti). Restituisce l'elenco dei problemi trovati.
 */
export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const skills = new Set(c.archetypes.flatMap((a) => a.skills));
  const has = <T extends { id: string }>(list: T[], id: string) => list.some((x) => x.id === id);
  for (const e of c.elements) {
    if (e.w < 1 || e.h < 1) errors.push(`${e.id}: ingombro non valido`);
    if (e.hours <= 0) errors.push(`${e.id}: ore non valide`);
    if (e.skill && !skills.has(e.skill)) errors.push(`${e.id}: skill sconosciuta ${e.skill}`);
    for (const m of e.materials) if (!has(c.materials, m.id)) errors.push(`${e.id}: materiale sconosciuto ${m.id}`);
    for (const p of e.pratiche) if (!has(c.pratiche, p)) errors.push(`${e.id}: pratica sconosciuta ${p}`);
    if (e.adjacentTo && !has(c.elements, e.adjacentTo)) errors.push(`${e.id}: elemento adiacente sconosciuto ${e.adjacentTo}`);
    for (const p of e.prep) if (!has(c.preparations, p)) errors.push(`${e.id}: lavorazione sconosciuta ${p}`);
  }
  for (const p of c.preparations) {
    if (p.hoursPerTile <= 0) errors.push(`${p.id}: ore non valide`);
    if (p.skill && !skills.has(p.skill)) errors.push(`${p.id}: skill sconosciuta ${p.skill}`);
    for (const a of p.after) if (!has(c.preparations, a)) errors.push(`${p.id}: lavorazione sconosciuta ${a}`);
    for (const x of p.pratiche) if (!has(c.pratiche, x)) errors.push(`${p.id}: pratica sconosciuta ${x}`);
  }
  for (const t of c.tasks) {
    if (t.skill && !skills.has(t.skill)) errors.push(`${t.id}: skill sconosciuta ${t.skill}`);
    for (const p of t.requires) if (!has(c.pratiche, p)) errors.push(`${t.id}: pratica sconosciuta ${p}`);
  }
  for (const m of c.candidates) if (!has(c.archetypes, m.archetypeId)) errors.push(`${m.id}: archetipo sconosciuto ${m.archetypeId}`);
  if (new Set(c.candidates.map((m) => m.id)).size !== c.candidates.length) errors.push('Candidati con lo stesso id');
  if (c.sites.length === 0) errors.push('Nessun terreno');
  if (errors.length === 0) {
    for (const site of c.sites) {
      if (site.rows.length > GRID_MAX.height || site.rows[0].length > GRID_MAX.width) {
        errors.push(`${site.id}: terreno più grande di ${GRID_MAX.width}×${GRID_MAX.height}`);
      }
      try {
        const g = gridFromSite(site, c);
        errors.push(...validateProject(g, c).map((e) => `${site.id}: ${e}`));
        const cost = estimate(g, c).costEur;
        if (cost > site.budget) errors.push(`${site.id}: il progetto proposto (${cost} €) supera la cassa (${site.budget} €)`);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
  }
  return errors;
}
