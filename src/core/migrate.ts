import type { Content } from './content';
import { gridFromSite } from './grid';
import { gamePratiche, generatePlan } from './plan';
import type { GameState, PraticaState } from './types';

/**
 * Porta un salvataggio alla versione corrente di GameState.
 * v1 → v2: arrivano griglia e piano di cantiere. I compiti operativi di v1
 * (scritti a mano) non esistono più: quelli in corso si interrompono e le ore
 * tornano ai volontari; le pratiche mantengono il loro stato.
 */
export function migrate(raw: unknown, c: Content): GameState {
  const s = raw as { version?: number } & Record<string, unknown>;
  if (s.version === 2) return s as unknown as GameState;
  if (s.version !== 1) throw new Error(`Salvataggio non riconosciuto (versione ${String(s.version)})`);

  const v1 = s as unknown as Omit<GameState, 'version' | 'grid' | 'plan'> & { version: 1 };
  const grid = gridFromSite(c.site, c);
  const plan = generatePlan(grid, c);
  const known = new Set(c.tasks.map((t) => t.id));

  const dropped = v1.active.filter((a) => a.kind === 'lavoro' && !known.has(a.refId));
  const volunteers = v1.volunteers.map((v) => ({ ...v }));
  for (const a of dropped) {
    for (const id of a.volunteerIds) {
      const v = volunteers.find((x) => x.id === id);
      if (!v) continue;
      v.busy = false;
      v.hoursUsed = Math.max(0, v.hoursUsed - a.hours);
    }
  }

  const old = new Map(v1.pratiche.map((p) => [p.id, p]));
  const pratiche: PraticaState[] = gamePratiche(c, plan.pratiche).map(
    (id) => old.get(id) ?? { id, status: 'da-avviare', waitRemainingH: 0 },
  );

  let nextId = v1.nextId;
  const reports = [
    ...v1.reports,
    {
      id: nextId++,
      at: v1.lastTick,
      title: 'Il cantiere è stato riprogettato',
      lines: [
        'I lavori del weekend ora nascono dal progetto del parco, con le loro dipendenze.',
        dropped.length > 0
          ? `Compiti interrotti: ${dropped.length}. Le ore sono tornate ai volontari.`
          : 'Nessun compito in corso è stato interrotto.',
        'Le pratiche mantengono il loro stato.',
      ],
      seen: false,
    },
  ];

  return {
    ...v1,
    version: 2,
    volunteers,
    active: v1.active.filter((a) => !dropped.includes(a)),
    pratiche,
    reports,
    nextId,
    grid,
    plan: plan.tasks,
  };
}
