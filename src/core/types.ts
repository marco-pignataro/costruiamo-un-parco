export type Phase = 'burocratica' | 'operativa';
export type Quality = 'base' | 'alta';

export interface Archetype {
  id: string;
  name: string;
  skills: string[];
  weeklyHours: number;
  pvCost: number;
}

export interface TaskDef {
  id: string;
  name: string;
  phase: Phase;
  /** Ore di lavoro complessive (1 volontario base). */
  hours: number;
  /** Skill che rende specialista; null = nessuna specializzazione utile. */
  skill: string | null;
  maxVolunteers: number;
  /** Pratiche che devono essere approvate prima di avviare il compito. */
  requires: string[];
}

export interface PraticaDef {
  id: string;
  name: string;
  office: string;
  requestHours: number;
  requestSkill: string | null;
  waitDays: number;
  unlocks: string;
}

export type PraticaStatus = 'da-avviare' | 'in-richiesta' | 'in-attesa' | 'approvata';

export interface PraticaState {
  id: string;
  status: PraticaStatus;
  /** Ore di sessione infrasettimanale che mancano alla risposta. */
  waitRemainingH: number;
}

export interface Volunteer {
  id: string;
  name: string;
  archetypeId: string;
  skills: string[];
  weeklyHours: number;
  hoursUsed: number;
  busy: boolean;
}

export interface ActiveTask {
  uid: number;
  kind: 'lavoro' | 'richiesta';
  refId: string;
  volunteerIds: string[];
  startedAt: number;
  endsAt: number;
  hours: number;
  quality: Quality;
}

export interface Report {
  id: number;
  at: number;
  title: string;
  lines: string[];
  seen: boolean;
}

export interface GameState {
  version: 1;
  /** Millisecondi reali per un'ora di gioco (3.600.000 = tempo reale). */
  msPerHour: number;
  week: number;
  phase: Phase;
  sessionUsedH: number;
  lastTick: number;
  volunteers: Volunteer[];
  active: ActiveTask[];
  completedTasks: string[];
  pratiche: PraticaState[];
  reports: Report[];
  nextId: number;
}
