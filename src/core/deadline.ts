import { DEADLINE, INAUGURATION } from '../config';

/** Settimane di lavoro concesse per un piano di cantiere da `planHours` ore complessive. */
export function deadlineWeeks(planHours: number): number {
  return DEADLINE.setupWeeks + Math.ceil(planHours / DEADLINE.hoursPerWeek - 1e-9) + DEADLINE.marginWeeks;
}

/**
 * Punti di rapidità: pieni se si inaugura nella prima settimana, poi calano
 * in proporzione alle settimane usate; nell'ultima ne resta una frazione.
 */
export function rapidityPoints(week: number, deadlineWeek: number): number {
  const total = Math.max(1, deadlineWeek);
  const ahead = Math.max(0, deadlineWeek - week);
  return Math.round((INAUGURATION.points.rapidita * (ahead + 1)) / total);
}
