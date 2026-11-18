import type { Content } from './content';
import { gridFromSite } from './grid';
import { gamePratiche, generatePlan } from './plan';
import type { ActiveTask, GameState, PlanTask, PraticaState, Report, Volunteer } from './types';
import { deadlineWeeks } from './deadline';
import { DEADLINE } from '../config';

type AnyState = Record<string, unknown> & { version?: number };

/**
 * Porta un salvataggio alla versione corrente di GameState, un passo alla volta.
 * Alla fine i compiti in corso che non esistono più nei contenuti si
 * interrompono e restituiscono le ore ai volontari.
 */
export function migrate(raw: unknown, c: Content): GameState {
  let s = raw as AnyState;
  const start = s.version;
  if (start === 11) return s as unknown as GameState;
  if (typeof start !== 'number' || start < 1 || start > 10) throw new Error(`Salvataggio non riconosciuto (versione ${String(start)})`);
  if (s.version === 1) s = v1to2(s, c);
  if (s.version === 2) s = v2to3(s, c);
  if (s.version === 3) s = { ...s, version: 4, stage: 'cantiere' }; // v3 → v4: le partite esistenti sono già in cantiere
  if (s.version === 4) s = { ...s, version: 5, siteId: legacySite(c).id, pv: 0 }; // v4 → v5: erano tutte sul terreno di prova
  if (s.version === 5) s = { ...s, version: 6, survey: [], hiddenHazards: [], rng: ((s.lastTick as number) >>> 0) || 1 }; // v5 → v6: niente insidie per le partite già avviate
  if (s.version === 6) s = v6to7(s);
  if (s.version === 7) s = v7to8(s);
  if (s.version === 8) s = v8to9(s, c);
  if (s.version === 9) s = v9to10(s);
  if (s.version === 10) s = v10to11(s);
  return dropUnknownActive(s as unknown as GameState, c);
}

/** v1 → v2: arrivano griglia e piano di cantiere; le pratiche mantengono il loro stato. */
function v1to2(s: AnyState, c: Content): AnyState {
  const grid = gridFromSite(legacySite(c), c);
  const plan = generatePlan(grid, c);
  const old = new Map((s.pratiche as PraticaState[]).map((p) => [p.id, p]));
  const pratiche: PraticaState[] = gamePratiche(c, plan.pratiche).map(
    (id) => old.get(id) ?? { id, status: 'da-avviare', waitRemainingH: 0 },
  );
  const out = { ...s, version: 2, grid, plan: plan.tasks, pratiche };
  addReport(out, 'Il cantiere è stato riprogettato', [
    'I lavori del weekend ora nascono dal progetto del parco, con le loro dipendenze.',
    'Le pratiche mantengono il loro stato.',
  ]);
  return out;
}

/** v2 → v3: arrivano cassa, magazzino e ordini. */
function v2to3(s: AnyState, c: Content): AnyState {
  const out = { ...s, version: 3, budget: legacySite(c).budget, stock: {}, orders: [] };
  addReport(out, 'Arriva il magazzino', [
    `In cassa: ${legacySite(c).budget} €.`,
    'I lavori che usano materiali partono solo se i materiali sono in magazzino: ordinali nella parte burocratica.',
  ]);
  return out;
}

/**
 * v6 → v7: raccolte fondi, qualità dei compiti e punteggio finale. I compiti
 * del piano già finiti contano come qualità base.
 */
function v6to7(s: AnyState): AnyState {
  const out = { ...s, version: 7, fundraising: [], taskQuality: {}, finale: null };
  if (s.stage === 'cantiere') {
    addReport(out, 'Novità nel cantiere', [
      'Le raccolte fondi ora portano soldi in cassa.',
      'Con almeno il 70% del progetto realizzato si può inaugurare il parco e ottenere il punteggio finale.',
    ]);
  }
  return out;
}

/**
 * v7 → v8: niente più evento in piazza né pratica di occupazione del suolo,
 * che serviva solo a quello. La pratica sparisce dal registro; l'evento in
 * corso si interrompe più sotto (dropUnknownActive).
 */
function v7to8(s: AnyState): AnyState {
  const pratiche = (s.pratiche as PraticaState[]).filter((p) => p.id !== 'occupazione-suolo');
  const out = { ...s, version: 8, pratiche };
  if (s.stage === 'cantiere') {
    addReport(out, 'Cambia la raccolta fondi', [
      "L'evento in piazza non c'è più, e con lui la pratica di occupazione del suolo.",
      'Resta la raccolta online: rende di più con il comunicatore, il presidente e il segretario/a.',
    ]);
  }
  return out;
}

/**
 * v8 → v9: i volontari hanno età e aspetto (pelle, capelli). Si prendono dal
 * candidato con lo stesso id; chi non c'è più nei contenuti riceve i primi colori.
 */
function v8to9(s: AnyState, c: Content): AnyState {
  const volunteers = (s.volunteers as Volunteer[]).map((v) => {
    const m = c.candidates.find((x) => x.id === v.id);
    return { ...v, age: m?.age ?? 40, skin: m?.skin ?? c.appearance.skin[0].id, hair: m?.hair ?? c.appearance.hair[0].id };
  });
  return { ...s, version: 9, volunteers };
}

/**
 * v9 → v10: benvenuto e tutorial, punti sospetti da scoprire perlustrando.
 * Chi ha già una partita non rivede il benvenuto e gioca senza tutorial (si
 * attiva dal menu); i punti sospetti di un sopralluogo in corso restano visibili.
 */
function v9to10(s: AnyState): AnyState {
  return { ...s, version: 10, surveyPos: {}, tutorial: { on: false, seen: [] } };
}

/**
 * v10 → v11: data di consegna. Per un cantiere già aperto si calcola dai
 * lavori che restano, a partire dalla settimana in corso (senza la settimana
 * iniziale di pratiche e ordini, già passata); un parco inaugurato la ha
 * nella settimana dell'inaugurazione.
 */
function v10to11(s: AnyState): AnyState {
  let deadlineWeek: number | null = null;
  const week = s.week as number;
  if (s.stage === 'cantiere') {
    const done = new Set(s.completedTasks as string[]);
    const left = (s.plan as PlanTask[]).filter((t) => !done.has(t.id)).reduce((sum, t) => sum + t.hours, 0);
    deadlineWeek = week - 1 + deadlineWeeks(left) - DEADLINE.setupWeeks;
  } else if (s.stage === 'inaugurato') deadlineWeek = week;
  const out = { ...s, version: 11, deadlineWeek, weekLog: [] };
  if (s.stage === 'cantiere') {
    addReport(out, 'Arriva la data di consegna', [
      `Il parco va consegnato entro il weekend della settimana ${deadlineWeek}.`,
      'A quella data si inaugura con quello che c\'è; sotto il 70% del progetto la partita è persa.',
      'La timeline delle settimane è in alto (su telefono nella scheda Settimane).',
    ]);
  }
  return out;
}

function dropUnknownActive(s: GameState, c: Content): GameState {
  const known = (a: ActiveTask) =>
    a.kind === 'richiesta'
      ? c.pratiche.some((p) => p.id === a.refId)
      : a.kind === 'analisi'
        ? c.sites.some((site) => site.pois.some((p) => p.id === a.refId))
        : a.kind === 'perlustrazione'
          ? true
        : c.tasks.some((t) => t.id === a.refId) || s.plan.some((t) => t.id === a.refId);
  const dropped = s.active.filter((a) => !known(a));
  if (dropped.length === 0) return s;
  const volunteers: Volunteer[] = s.volunteers.map((v) => ({ ...v }));
  for (const a of dropped) {
    for (const id of a.volunteerIds) {
      const v = volunteers.find((x) => x.id === id);
      if (!v) continue;
      v.busy = false;
      v.hoursUsed = Math.max(0, v.hoursUsed - a.hours);
    }
  }
  const out = { ...s, volunteers, active: s.active.filter((a) => known(a)) };
  addReport(out as unknown as AnyState, 'Compiti interrotti', [
    `${dropped.length} compiti in corso non esistono più in questa versione del gioco.`,
    'Le ore sono tornate ai volontari.',
  ]);
  return out;
}

function addReport(s: AnyState, title: string, lines: string[]): void {
  const reports = [...(s.reports as Report[])];
  const id = s.nextId as number;
  reports.push({ id, at: s.lastTick as number, title, lines, seen: false });
  s.reports = reports;
  s.nextId = id + 1;
}

/** Prima della v5 esisteva un solo terreno: quello sul torrente. */
function legacySite(c: Content) {
  return c.sites.find((x) => x.id === 'demo-torrente') ?? c.sites[0];
}
