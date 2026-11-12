import type { Content } from './content';
import { gridFromSite } from './grid';
import { gamePratiche, generatePlan } from './plan';
import type { ActiveTask, GameState, PraticaState, Report, Volunteer } from './types';

type AnyState = Record<string, unknown> & { version?: number };

/**
 * Porta un salvataggio alla versione corrente di GameState, un passo alla volta.
 * Alla fine i compiti in corso che non esistono più nei contenuti si
 * interrompono e restituiscono le ore ai volontari.
 */
export function migrate(raw: unknown, c: Content): GameState {
  let s = raw as AnyState;
  const start = s.version;
  if (start === 6) return s as unknown as GameState;
  if (typeof start !== 'number' || start < 1 || start > 5) throw new Error(`Salvataggio non riconosciuto (versione ${String(start)})`);
  if (s.version === 1) s = v1to2(s, c);
  if (s.version === 2) s = v2to3(s, c);
  if (s.version === 3) s = { ...s, version: 4, stage: 'cantiere' }; // v3 → v4: le partite esistenti sono già in cantiere
  if (s.version === 4) s = { ...s, version: 5, siteId: legacySite(c).id, pv: 0 }; // v4 → v5: erano tutte sul terreno di prova
  if (s.version === 5) s = { ...s, version: 6, survey: [], hiddenHazards: [], rng: ((s.lastTick as number) >>> 0) || 1 }; // v5 → v6: niente insidie per le partite già avviate
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

function dropUnknownActive(s: GameState, c: Content): GameState {
  const known = (a: ActiveTask) =>
    a.kind === 'richiesta'
      ? c.pratiche.some((p) => p.id === a.refId)
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
