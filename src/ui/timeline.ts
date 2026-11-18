import { INAUGURATION } from '../config';
import type { Simulation } from '../core/simulation';
import type { Phase } from '../core/types';

/** Una settimana di lavoro nella timeline. */
export interface WeekCell {
  week: number;
  status: 'passata' | 'in-corso' | 'futura';
  /** Parte della settimana in corso (solo per quella in corso). */
  phase: Phase | null;
  /** Quota del progetto realizzata a fine settimana (solo per quelle passate). */
  progress: number | null;
  /** Lavori i cui materiali arrivano all'inizio del weekend di questa settimana. */
  deliveries: string[];
  /** L'ultima: entro il suo weekend va consegnato il parco. */
  deadline: boolean;
}

export interface Timeline {
  weeks: WeekCell[];
  /** Settimana in corso (0 in progettazione, quando il cantiere non è ancora aperto). */
  current: number;
  total: number;
  /** In progettazione la data di consegna è solo prevista: si fissa alla conferma. */
  provisional: boolean;
  progress: number;
  minProgress: number;
  /** Partita finita: inaugurato o fallito. */
  over: boolean;
}

/**
 * Le settimane di lavoro, dalla prima alla data di consegna. Esiste dalla
 * progettazione (con la consegna prevista dal progetto disegnato) in poi.
 */
export function buildTimeline(sim: Simulation): Timeline | null {
  const s = sim.state;
  const provisional = s.stage === 'progettazione';
  if (!provisional && s.deadlineWeek === null) return null;
  const total = provisional ? sim.designSummary().weeks : s.deadlineWeek!;
  const current = provisional ? 0 : Math.min(s.week, total);
  const over = s.stage === 'inaugurato' || s.stage === 'fallito';
  const weeks: WeekCell[] = [];
  for (let w = 1; w <= total; w++) {
    const status = w < current ? 'passata' : w === current && !over ? 'in-corso' : w === current ? 'passata' : 'futura';
    weeks.push({
      week: w,
      status,
      phase: status === 'in-corso' ? s.phase : null,
      progress: s.weekLog.find((x) => x.week === w)?.progress ?? null,
      deliveries: s.orders.filter((o) => o.status === 'in-consegna' && o.arrivesWeek === w).map((o) => sim.taskDef(o.taskId).name),
      deadline: w === total,
    });
  }
  return { weeks, current, total, provisional, progress: sim.projectProgress, minProgress: INAUGURATION.minProgress, over };
}

/** Le settimane da mostrare nella timeline chiusa: quella in corso, la precedente e la successiva (tre in tutto, se ci sono). */
export function timelineWindow(total: number, current: number): [number, number] {
  if (total <= 3) return [1, total];
  const mid = Math.min(Math.max(current, 2), total - 1);
  return [mid - 1, mid + 1];
}
