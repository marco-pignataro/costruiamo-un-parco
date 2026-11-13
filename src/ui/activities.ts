import { fornitore, officeBuilding, sede } from '../core/city';
import type { Simulation } from '../core/simulation';
import type { ActiveTask } from '../core/types';

/** Tipi di attività che si avviano scegliendo dei volontari. */
export type Kind = 'lavoro' | 'richiesta' | 'ordine' | 'analisi' | 'sidequest';

/** Un'attività avviabile adesso: cosa, come si chiama e cosa la blocca (con nessun volontario scelto). */
export interface Activity {
  kind: Kind;
  id: string;
  name: string;
  meta: string;
  blockers: string[];
}

/** Errore di anteprima che dipende solo dalla squadra non ancora scelta: non blocca l'attività in sé. */
export const NO_TEAM = 'Scegli almeno un volontario';

/**
 * Attività che il giocatore può aprire adesso, nell'ordine della HUD. Le
 * stesse si aprono dalla lista "Da fare" e cliccandole sulla mappa.
 */
export function listActivities(sim: Simulation): Activity[] {
  const s = sim.state;
  const blockers = (errors: string[]) => errors.filter((e) => e !== NO_TEAM);
  if (s.stage === 'sopralluogo') {
    return sim.pois
      .filter((p) => sim.poiState(p.id).status === 'da-analizzare')
      .map((p) => ({ kind: 'analisi' as const, id: p.id, name: p.clue, meta: `${p.hours} h complessive`, blockers: blockers(sim.previewAnalysis(p.id, []).errors) }));
  }
  if (s.stage !== 'cantiere') return [];
  const list: Activity[] = sim.availableTasks().map((t) => ({
    kind: 'lavoro',
    id: t.id,
    name: t.name,
    meta: t.fundraisingEur ? `${t.hours} h complessive · raccolta fondi` : `${t.hours} h complessive`,
    blockers: blockers(sim.previewTask(t.id, []).errors),
  }));
  if (s.phase === 'burocratica') {
    for (const p of sim.allPratiche.filter((x) => sim.pratica(x.id).status === 'da-avviare')) {
      list.push(
        sim.isSideQuest(p.id)
          ? { kind: 'sidequest', id: p.id, name: p.name, meta: `${p.office} · una giornata, mini-puzzle`, blockers: blockers(sim.previewSideQuest(p.id, []).errors) }
          : { kind: 'richiesta', id: p.id, name: p.name, meta: `${p.office} · richiesta ${p.requestHours} h`, blockers: blockers(sim.previewRequest(p.id, []).errors) },
      );
    }
    for (const t of sim.orderableTasks()) {
      list.push({
        kind: 'ordine',
        id: t.id,
        name: `Materiali per ${t.name}`,
        meta: `${sim.orderCost(sim.missingMaterials(t))} €`,
        blockers: blockers(sim.previewOrder(t.id, []).errors),
      });
    }
  }
  return list;
}

/**
 * Tile della griglia del parco su cui sta un'attività (indici y * width + x):
 * le tile del lavoro o il punto sospetto. Vuoto per le attività d'ufficio,
 * che al parco non hanno un posto.
 */
export function activityTiles(sim: Simulation, a: { kind: Kind; id: string }): number[] {
  if (a.kind === 'analisi') {
    const p = sim.poi(a.id);
    return [p.y * sim.state.grid.width + p.x];
  }
  if (a.kind !== 'lavoro') return [];
  const def = sim.taskDef(a.id);
  return 'tiles' in def ? def.tiles : [];
}

/**
 * Edificio della città dove si svolge un'attività: pratiche e richieste
 * dirette nel loro ufficio, ordini dal fornitore, i lavori d'ufficio (es. la
 * raccolta fondi online) alla sede. Null per i lavori al parco e le analisi.
 */
export function activityBuilding(sim: Simulation, a: { kind: Kind; id: string }): string | null {
  const city = sim.city;
  if (a.kind === 'richiesta' || a.kind === 'sidequest') return officeBuilding(city, sim.praticaDef(a.id).office)?.id ?? sede(city).id;
  if (a.kind === 'ordine') return fornitore(city).id;
  if (a.kind === 'lavoro') return activityTiles(sim, a).length ? null : sede(city).id;
  return null;
}

/** Edificio della città dove lavora un compito in corso (null se si svolge al parco). */
export function activeBuilding(sim: Simulation, a: ActiveTask): string | null {
  return activityBuilding(sim, { kind: a.kind, id: a.refId });
}

/**
 * Scena in cui si gioca adesso: la città nella parte burocratica del
 * cantiere, il parco in tutto il resto (fasi preparatorie, weekend,
 * inaugurazione). Non si passa dall'una all'altra a mano.
 */
export function sceneFor(sim: Simulation): 'city' | 'park' {
  return sim.state.stage === 'cantiere' && sim.state.phase === 'burocratica' ? 'city' : 'park';
}
