export type Phase = 'burocratica' | 'operativa';
export type Quality = 'base' | 'alta';

export interface Archetype {
  id: string;
  name: string;
  skills: string[];
  weeklyHours: number;
  pvCost: number;
  /** Al massimo uno in squadra (presidente, segretario/a). */
  unique: boolean;
}

/** Persona che si può reclutare in Fase 2. */
export interface CandidateDef {
  id: string;
  name: string;
  archetypeId: string;
  age: number;
  /** Id di un colore di `appearance.json`. */
  skin: string;
  hair: string;
}

/** Un colore scelto per l'aspetto dei volontari (pelle o capelli). */
export interface LookColor {
  id: string;
  name: string;
  color: string;
}

/** Colori tra cui scegliere l'aspetto dei volontari. */
export interface AppearanceDef {
  skin: LookColor[];
  hair: LookColor[];
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
  /** Si può rifare quante volte si vuole (es. raccolte fondi). */
  repeatable?: boolean;
  /** Raccolta fondi: euro di base che porta in cassa (vedi FUNDRAISING in config). */
  fundraisingEur?: number;
}

export interface PraticaDef {
  id: string;
  name: string;
  office: string;
  /**
   * timer (Tipo 1): richiesta a timer e attesa della risposta.
   * side-quest (Tipo 2): richiesta diretta al dirigente, si chiude con un mini-puzzle.
   * Se manca vale timer.
   */
  mode?: 'timer' | 'side-quest';
  /** Mini-puzzle della richiesta diretta (id in sidequests.json). */
  sideQuest?: string;
  requestHours: number;
  requestSkill: string | null;
  waitDays: number;
  unlocks: string;
}

/** Mini-puzzle di smistamento: ogni oggetto va nel contenitore giusto. */
export interface SideQuestDef {
  id: string;
  /** Chi chiede il favore e perché: si legge prima del puzzle. */
  intro: string;
  bins: { id: string; name: string }[];
  items: { name: string; bin: string }[];
  /** Errori ammessi (il presidente ne aggiunge uno). */
  allowedErrors: number;
}

/** Esito di un mini-puzzle. */
export interface SideQuestResult {
  ok: boolean;
  errors: number;
  allowed: number;
  /** Indici degli oggetti messi nel contenitore sbagliato. */
  wrong: number[];
}

/** Raccolta fondi conclusa: serve per i rendimenti decrescenti e per il resoconto. */
export interface FundraisingEntry {
  taskId: string;
  week: number;
  eur: number;
}

/** Punteggio dell'inaugurazione, voce per voce. */
export interface FinalScore {
  week: number;
  progress: number;
  realizzazione: number;
  gradimento: number;
  qualita: number;
  cassa: number;
  rapidita: number;
  base: number;
  multiplier: number;
  total: number;
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
  age: number;
  /** Id dei colori di pelle e capelli (`appearance.json`): si cambiano in Fase 2. */
  skin: string;
  hair: string;
}

export interface ActiveTask {
  uid: number;
  /**
   * lavoro: compito; richiesta: pratica a timer; ordine: ordine al fornitore per un
   * compito del piano; analisi: punto sospetto del sopralluogo.
   */
  kind: 'lavoro' | 'richiesta' | 'ordine' | 'analisi';
  refId: string;
  volunteerIds: string[];
  startedAt: number;
  endsAt: number;
  hours: number;
  quality: Quality;
}

export type MaterialStock = Record<string, number>;

export interface Order {
  uid: number;
  /** Compito del piano per cui si ordina. */
  taskId: string;
  materials: { id: string; qty: number }[];
  costEur: number;
  /** in-preparazione: un volontario lo sta compilando; in-consegna: inviato e pagato. */
  status: 'in-preparazione' | 'in-consegna' | 'consegnato';
  /** Settimana al cui weekend arriva la consegna (0 finché non è inviato). */
  arrivesWeek: number;
}

export interface Report {
  id: number;
  at: number;
  title: string;
  lines: string[];
  seen: boolean;
}

export type Stage = 'terreno' | 'squadra' | 'sopralluogo' | 'progettazione' | 'cantiere' | 'inaugurato';

export interface SurveyPoiState {
  id: string;
  status: 'da-analizzare' | 'in-analisi' | 'analizzato';
  /** Esito dell'analisi: insidia trovata, oppure null (niente, o non vista). */
  found: string | null;
}

/** Insidia sfuggita al sopralluogo: può emergere in cantiere. */
export interface HiddenHazard {
  poiId: string;
  hazardId: string;
  /** Indici delle tile dell'insidia. */
  tiles: number[];
}

export interface GameState {
  version: 9;
  /**
   * terreno: scelta del terreno (Fase 1); squadra: reclutamento con i PV (Fase 2);
   * sopralluogo: analisi dei punti sospetti (Fase 3); progettazione: si disegna
   * il parco (Fase 4); cantiere: turni settimanali (Fase 5); inaugurato: partita
   * conclusa con il punteggio finale.
   */
  stage: Stage;
  siteId: string;
  /** Punti volontariato non ancora spesi. */
  pv: number;
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
  /** Il terreno con il progetto: superficie, rischi, elementi posati e costruiti. */
  grid: ParkGrid;
  /** Piano di cantiere generato dal progetto: i compiti della parte operativa. */
  plan: PlanTask[];
  /** Euro in cassa. */
  budget: number;
  /** Materiali in magazzino, per id. */
  stock: MaterialStock;
  orders: Order[];
  /** Punti sospetti del sopralluogo e il loro esito. */
  survey: SurveyPoiState[];
  hiddenHazards: HiddenHazard[];
  /** Stato del generatore casuale (con seme): la stessa partita dà gli stessi esiti. */
  rng: number;
  /** Raccolte fondi concluse. */
  fundraising: FundraisingEntry[];
  /** Qualità con cui è finito ogni compito del piano (per il punteggio). */
  taskQuality: Record<string, Quality>;
  /** Punteggio, dopo l'inaugurazione. */
  finale: FinalScore | null;
}

// ---------- Progettazione del parco (Fase 4) ----------

/** Cosa c'è oggi sulla tile. Gli alberi tutelati non si possono rimuovere. */
export type SurfaceId = 'terra' | 'erba' | 'erba-alta' | 'rifiuti' | 'cemento' | 'albero-tutelato';

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
  /** Punti di gradimento del primo esemplare; le copie successive valgono via via meno. */
  appeal: number;
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
  /** Superficie delle tile a lavorazione finita (null = resta com'è). */
  result: SurfaceId | null;
  /** Scatta anche sulle tile con queste insidie note (messa in sicurezza). */
  risks: string[];
  /** Materiali consumati per ogni tile lavorata. */
  materialsPerTile: { id: string; qty: number }[];
}

/** Insidia nascosta nel terreno (Fase 3). */
export interface HazardDef {
  id: string;
  name: string;
  /** Cosa comporta: si legge nel resoconto quando la si scopre. */
  description: string;
  /** Skill che fa da lente: con lo specialista l'analisi non sbaglia. */
  lensSkill: string | null;
  /** Probabilità di non accorgersene senza lo specialista. */
  errorChance: number;
  /** Lavorazione di messa in sicurezza che serve sopra di lei. */
  prep: string;
}

/** Punto sospetto da analizzare nel sopralluogo; hazard null = falso allarme. */
export interface PoiDef {
  id: string;
  x: number;
  y: number;
  clue: string;
  /** Ore complessive dell'analisi. */
  hours: number;
  hazard: string | null;
  /** Tile dove sta l'insidia. */
  area: { x: number; y: number; w: number; h: number } | null;
}

/** Fattore della scheda terreno; quelli nascosti si vedono come "?" fino al sopralluogo. */
export interface SiteFactor {
  label: string;
  value: string;
  hidden: boolean;
}

/** Terreno da scegliere in Fase 1: scheda, superficie come righe di caratteri e progetto proposto. */
/** Edificio o monumento della città (scena della parte burocratica). */
export interface CityBuilding {
  id: string;
  name: string;
  /** sede e fornitore: uno solo; ufficio: dove si fanno le pratiche di `office`; palazzo e monumento: scenografia. */
  kind: 'sede' | 'fornitore' | 'ufficio' | 'palazzo' | 'monumento';
  /** Per gli uffici: il campo `office` delle pratiche che si fanno qui. */
  office?: string;
  /** Come si disegna (vedi CityScene). */
  look: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tile camminabile davanti all'ingresso, dove si fermano i volontari (non per i monumenti). */
  door?: { x: number; y: number };
}

/**
 * La piccola Messina della parte burocratica, uguale in ogni partita. Ogni
 * carattere delle righe è una tile: ~ mare, = strada, . marciapiede,
 * p piazza lastricata, , verde.
 */
export interface CityDef {
  rows: string[];
  buildings: CityBuilding[];
}

export interface SiteDef {
  id: string;
  name: string;
  description: string;
  /** Difficoltà da 1 a 5: più è alta, più cassa e PV iniziali. */
  difficulty: number;
  /** PV iniziali per comporre la squadra. */
  pv: number;
  /** Moltiplicatore del punteggio finale. */
  scoreMultiplier: number;
  bonus: string;
  factors: SiteFactor[];
  pois: PoiDef[];
  /** Un carattere per tile, vedi SURFACE_CHARS in grid.ts. */
  rows: string[];
  placements: { elementId: string; x: number; y: number }[];
  /** Euro in cassa a inizio partita. */
  budget: number;
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
  /** Lavorazione del terreno svolta, oppure null per gli elementi. */
  prepId: string | null;
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
