import { EFFICIENCY } from '../config';
import type { Quality } from './types';

export interface TeamMember {
  skills: string[];
}

export interface DurationResult {
  /** Durata reale in ore di gioco. */
  hours: number;
  quality: Quality;
  efficiency: number;
}

/**
 * durata = ore complessive / somma delle efficienze.
 * Specialista con la skill richiesta: 1,1. Volontario senza la skill: 1,
 * oppure 2 se affiancato da uno specialista (max 2 guidati per specialista).
 */
export function computeDuration(totalHours: number, skill: string | null, team: TeamMember[]): DurationResult {
  if (team.length === 0) throw new Error('Serve almeno un volontario');
  const specialists = skill ? team.filter((m) => m.skills.includes(skill)).length : 0;
  const others = team.length - specialists;
  const guided = Math.min(others, specialists * EFFICIENCY.maxGuidedPerSpecialist);
  const efficiency =
    specialists * EFFICIENCY.specialist + guided * EFFICIENCY.guided + (others - guided) * EFFICIENCY.base;
  return {
    hours: totalHours / efficiency,
    quality: specialists > 0 ? 'alta' : 'base',
    efficiency,
  };
}

export function formatHours(h: number): string {
  const totalMin = Math.max(0, Math.round(h * 60));
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm} min`;
  return mm === 0 ? `${hh} h` : `${hh} h ${String(mm).padStart(2, '0')} min`;
}
