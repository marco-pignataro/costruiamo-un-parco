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

// ---------- Progettazione del parco (Fase 4) ----------

/** Cosa c'è oggi sulla tile. Gli alberi tutelati non si possono rimuovere. */
export type SurfaceId = 'terra' | 'erba-alta' | 'rifiuti' | 'cemento' | 'albero-tutelato';

export interface MaterialDef {
  id: string;
  name: string;
  unit: string;
  /** Prezzo dal fornitore, in euro per unità. */
  unitPrice: number;
}

export interface ElementDef {
  id: string;
  name: string;
  /** Ingombro in tile. */
  w: number;
  h: number;
  /** Ore di lavoro complessive (1 volontario base). */
  hours: number;
  skill: string | null;
  maxVolunteers: number;
  materials: { id: string; qty: number }[];
  /** Pratiche da approvare prima di costruirlo. */
  pratiche: string[];
  /** Elemento che deve stare su una tile adiacente (es. panchina accanto al sentiero). */
  adjacentTo: string | null;
  /** Lavorazioni del terreno che servono sotto l'elemento, oltre a quelle dovute alla superficie. */
  prep: string[];
  /** Più elementi uguali si raggruppano in un solo compito (es. tratti di sentiero). */
  groupable: boolean;
}

/**
 * Lavorazione preparatoria del terreno. Con `surfaces` scatta da sola sulle
 * tile di quella superficie; con `surfaces: null` solo se l'elemento la chiede.
 */
export interface PrepDef {
  id: string;
  name: string;
  hoursPerTile: number;
  skill: string | null;
  maxVolunteers: number;
  surfaces: SurfaceId[] | null;
  /** Lavorazioni che vanno fatte prima, sulle stesse tile. */
  after: string[];
  pratiche: string[];
}

/** Compito del piano di cantiere generato dal progetto. */
export interface PlanTask extends TaskDef {
  /** Compiti del piano da completare prima. */
  after: string[];
  materials: { id: string; qty: number }[];
  /** Elementi del progetto che il compito realizza (vuoto per le lavorazioni del terreno). */
  placements: number[];
  /** Tile su cui lavora il compito, come indici della griglia. */
  tiles: number[];
}

export interface Placement {
  uid: number;
  elementId: string;
  x: number;
  y: number;
}

/**
 * Griglia condivisa a livelli, serializzabile in JSON. I livelli per tile sono
 * array piatti indicizzati con y * width + x.
 */
export interface ParkGrid {
  width: number;
  height: number;
  surface: SurfaceId[];
  /** Insidia nota sulla tile (dal sopralluogo), oppure null. */
  risk: (string | null)[];
  /** Livello progetto: elementi posati dal giocatore. */
  placements: Placement[];
  /** Livello realizzato: uid degli elementi costruiti. */
  built: number[];
  nextUid: number;
}
