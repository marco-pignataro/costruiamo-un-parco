import archetypes from '../data/archetypes.json';
import tasks from '../data/tasks.json';
import pratiche from '../data/pratiche.json';
import candidates from '../data/candidates.json';
import elements from '../data/elements.json';
import materials from '../data/materials.json';
import preparations from '../data/preparations.json';
import hazards from '../data/hazards.json';
import sites from '../data/sites.json';
import sideQuests from '../data/sidequests.json';
import city from '../data/city.json';
import { validateCity } from './city';
import { GRID_MAX } from '../config';
import { estimate, gridFromSite, validateProject } from './grid';
import type { Archetype, CandidateDef, CityDef, ElementDef, HazardDef, MaterialDef, PraticaDef, PrepDef, SideQuestDef, SiteDef, TaskDef } from './types';

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
  hazards: HazardDef[];
  /** Mini-puzzle delle richieste dirette ai dirigenti. */
  sideQuests: SideQuestDef[];
  /** La città della parte burocratica: strade, sede, uffici, fornitore, monumenti. */
  city: CityDef;
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
  hazards: hazards as HazardDef[],
  sideQuests: sideQuests as SideQuestDef[],
  city: city as CityDef,
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
    for (const r of p.risks) if (!has(c.hazards, r)) errors.push(`${p.id}: insidia sconosciuta ${r}`);
    for (const m of p.materialsPerTile) if (!has(c.materials, m.id)) errors.push(`${p.id}: materiale sconosciuto ${m.id}`);
  }
  for (const h of c.hazards) {
    if (!has(c.preparations, h.prep)) errors.push(`${h.id}: lavorazione sconosciuta ${h.prep}`);
    if (h.lensSkill && !skills.has(h.lensSkill)) errors.push(`${h.id}: skill sconosciuta ${h.lensSkill}`);
  }
  for (const t of c.tasks) {
    if (t.skill && !skills.has(t.skill)) errors.push(`${t.id}: skill sconosciuta ${t.skill}`);
    for (const p of t.requires) if (!has(c.pratiche, p)) errors.push(`${t.id}: pratica sconosciuta ${p}`);
  }
  for (const t of c.tasks) {
    if (t.fundraisingEur !== undefined && (t.fundraisingEur <= 0 || !t.repeatable)) errors.push(`${t.id}: una raccolta fondi va ripetibile e con euro positivi`);
  }
  for (const p of c.pratiche) {
    if (p.mode === 'side-quest') {
      const q = c.sideQuests.find((x) => x.id === p.sideQuest);
      if (!q) errors.push(`${p.id}: mini-puzzle sconosciuto ${String(p.sideQuest)}`);
    }
  }
  for (const q of c.sideQuests) {
    const bins = new Set(q.bins.map((b) => b.id));
    for (const it of q.items) if (!bins.has(it.bin)) errors.push(`${q.id}: contenitore sconosciuto ${it.bin}`);
    if (q.items.length === 0) errors.push(`${q.id}: nessun oggetto`);
  }
  for (const m of c.candidates) if (!has(c.archetypes, m.archetypeId)) errors.push(`${m.id}: archetipo sconosciuto ${m.archetypeId}`);
  if (new Set(c.candidates.map((m) => m.id)).size !== c.candidates.length) errors.push('Candidati con lo stesso id');
  if (c.sites.length === 0) errors.push('Nessun terreno');
  if (errors.length === 0) {
    for (const site of c.sites) {
      if (site.rows.length > GRID_MAX.height || site.rows[0].length > GRID_MAX.width) {
        errors.push(`${site.id}: terreno più grande di ${GRID_MAX.width}×${GRID_MAX.height}`);
      }
      for (const poi of site.pois) {
        const w = site.rows[0].length;
        const h = site.rows.length;
        if (poi.x < 0 || poi.y < 0 || poi.x >= w || poi.y >= h) errors.push(`${site.id}/${poi.id}: fuori dal terreno`);
        if ((poi.hazard === null) !== (poi.area === null)) errors.push(`${site.id}/${poi.id}: insidia e area vanno insieme`);
        if (poi.hazard && !has(c.hazards, poi.hazard)) errors.push(`${site.id}/${poi.id}: insidia sconosciuta ${poi.hazard}`);
        const a = poi.area;
        if (a && (a.x < 0 || a.y < 0 || a.x + a.w > w || a.y + a.h > h)) errors.push(`${site.id}/${poi.id}: area fuori dal terreno`);
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
  errors.push(...validateCity(c.city, c.pratiche));
  return errors;
}
