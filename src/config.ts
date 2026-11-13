// Unico punto in cui vivono titolo e dati dell'associazione:
// cambiando questi valori cambiano ovunque nel gioco.

export const GAME_TITLE = 'Costrui-AMO: un Parco!';

export const ASSOCIATION = {
  name: 'Puli-AMO Messina',
  donationUrl: 'https://www.puliamomessina.it/donazioni/',
  taxCode5x1000: '97124820834',
} as const;

/** Ore di sessione: tempo reale con almeno un compito in corso. */
export const SESSION_HOURS = {
  burocratica: 20, // 5 giorni da 4 ore
  operativa: 8, // 1 giorno da 8 ore
} as const;

/** Un giorno lavorativo di attesa = 4 ore di sessione infrasettimanale. */
export const HOURS_PER_WORKING_DAY = 4;

/**
 * Il piano di cantiere divide lavorazioni e gruppi di elementi in lotti di al
 * massimo queste ore complessive, così ogni compito sta in un weekend.
 */
export const MAX_PLAN_TASK_HOURS = 12;

/** Ordini al fornitore: un volontario li compila, poi la consegna arriva al weekend della settimana dopo. */
export const ORDERS = {
  hours: 1,
  skill: 'organizzazione',
  maxVolunteers: 1,
  deliveryWeeks: 1,
} as const;

/** Sopralluogo (Fase 3): una giornata di 8 ore di sessione, al massimo 2 volontari per punto. */
export const SURVEY = { hours: 8, maxVolunteers: 2 } as const;

/** Squadra minima per aprire il cantiere (sotto, in futuro, si perde). */
export const MIN_TEAM = 3;
/** Lunghezza massima del nome di un volontario, quando lo si cambia in Fase 2. */
export const VOLUNTEER_NAME_MAX = 16;

/** Dimensione massima di un terreno in tile: tanto ci sta nella scena accanto alla sede. */
export const GRID_MAX = { width: 14, height: 11 } as const;

/**
 * Raccolte fondi: euro = base × qualità × (1 + progresso del parco × progressBonus)
 * × decay^(raccolte uguali nelle ultime windowWeeks settimane), arrotondati a roundTo.
 * Il parco che cresce convince di più; chiedere troppo spesso rende meno.
 */
export const FUNDRAISING = {
  /** Qualità alta: c'è il comunicatore. */
  qualityBonus: 1.5,
  /** Il presidente firma l'appello: più credibilità. */
  presidentBonus: 1.25,
  /** Il segretario/a cura il rendiconto ai donatori: più fiducia. */
  secretaryBonus: 1.25,
  progressBonus: 0.5,
  decay: 0.5,
  windowWeeks: 3,
  roundTo: 5,
} as const;

/** Richiesta diretta al dirigente (Tipo 2): una giornata, al massimo 2 volontari. */
export const SIDE_QUEST = { hours: 4, maxVolunteers: 2 } as const;

/**
 * Inaugurazione: si può fare con almeno minProgress del progetto realizzato.
 * Punteggio = (realizzazione + gradimento + qualità + cassa + rapidità) × moltiplicatore del terreno.
 */
export const INAUGURATION = {
  minProgress: 0.7,
  points: { realizzazione: 400, gradimento: 300, qualita: 150, cassa: 100, rapidita: 100 },
  /** Euro di cassa che valgono il massimo dei punti cassa. */
  cassaFull: 300,
  /** Punti di rapidità persi per ogni settimana dopo la prima. */
  rapiditaPerWeek: 10,
} as const;

/** Gradimento previsto: bonus per ogni tipo di elemento diverso nel progetto (varietà). */
export const APPEAL_VARIETY_BONUS = 5;

/** Efficienze della formula durata = ore complessive / somma efficienze. */
export const EFFICIENCY = {
  base: 1,
  specialist: 1.1,
  guided: 2, // volontario senza la skill, affiancato da uno specialista
  maxGuidedPerSpecialist: 2,
} as const;

/**
 * Velocità del tempo, solo per i test: ?velocita=60 fa durare un'ora di gioco
 * un minuto reale. Si applica alle nuove partite. Di default 1 = tempo reale.
 */
export function readTimeScale(search: string = globalThis.location?.search ?? ''): number {
  const v = Number(new URLSearchParams(search).get('velocita'));
  return Number.isFinite(v) && v >= 1 ? v : 1;
}
