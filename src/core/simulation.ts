import { HOURS_PER_WORKING_DAY, MIN_TEAM, ORDERS, SESSION_HOURS, SURVEY } from '../config';
import type { Content } from './content';
import { computeDuration, formatHours, type DurationResult } from './duration';
import {
  canPlace,
  estimate,
  expectedAppeal,
  gridFromSite,
  place,
  placementAt,
  removePlacement,
  validateProject,
  type Estimate,
  type PlaceCheck,
} from './grid';
import { emergencyTasks, gamePratiche, generatePlan } from './plan';
import type { ActiveTask, Archetype, CandidateDef, ElementDef, HazardDef, GameState, Order, Placement, PlanTask, PoiDef, PraticaDef, SiteDef, SurveyPoiState, PraticaState, TaskDef, Volunteer } from './types';

const EPS = 1e-6;

export interface Preview extends Partial<DurationResult> {
  errors: string[];
}

/**
 * Simulazione a timer reali. Tutto il tempo passa da tick(now): chiamarlo
 * all'apertura recupera ciò che è successo a gioco chiuso, in ordine.
 */
export class Simulation {
  constructor(
    public state: GameState,
    private readonly content: Content,
  ) {}

  /** Nuova partita: si comincia scegliendo il terreno (Fase 1), il primo è già selezionato. */
  static newGame(content: Content, now: number, timeScale = 1): Simulation {
    const site = content.sites[0];
    const state: GameState = {
      version: 6,
      stage: 'terreno',
      siteId: site.id,
      pv: site.pv,
      msPerHour: 3_600_000 / timeScale,
      week: 1,
      phase: 'burocratica',
      sessionUsedH: 0,
      lastTick: now,
      volunteers: [],
      active: [],
      completedTasks: [],
      pratiche: [],
      reports: [],
      nextId: 1,
      grid: gridFromSite(site, content),
      plan: [],
      budget: site.budget,
      stock: {},
      orders: [],
      survey: [],
      hiddenHazards: [],
      rng: (now ^ 0x9e3779b9) >>> 0 || 1,
    };
    return new Simulation(state, content);
  }

  // ---------- Fase 1: scelta del terreno ----------

  get sites(): SiteDef[] {
    return this.content.sites;
  }

  get site(): SiteDef {
    const s = this.content.sites.find((x) => x.id === this.state.siteId);
    if (!s) throw new Error(`Terreno sconosciuto: ${this.state.siteId}`);
    return s;
  }

  /** Seleziona un terreno da guardare: griglia, cassa e PV diventano i suoi. Si può cambiare idea. */
  chooseSite(id: string): void {
    if (this.state.stage !== 'terreno') throw new Error('Il terreno è già scelto');
    const site = this.content.sites.find((x) => x.id === id);
    if (!site) throw new Error(`Terreno sconosciuto: ${id}`);
    this.state.siteId = site.id;
    this.state.grid = gridFromSite(site, this.content);
    this.state.budget = site.budget;
    this.state.pv = site.pv;
  }

  confirmSite(): void {
    if (this.state.stage !== 'terreno') throw new Error('Il terreno è già scelto');
    this.state.stage = 'squadra';
  }

  // ---------- Fase 2: squadra con i PV ----------

  get candidates(): CandidateDef[] {
    return this.content.candidates;
  }

  archetype(id: string): Archetype {
    const a = this.content.archetypes.find((x) => x.id === id);
    if (!a) throw new Error(`Archetipo sconosciuto: ${id}`);
    return a;
  }

  /** Perché un candidato non si può reclutare (vuoto = si può). */
  recruitErrors(candidateId: string): string[] {
    const s = this.state;
    const m = this.content.candidates.find((x) => x.id === candidateId);
    if (!m) return [`Candidato sconosciuto: ${candidateId}`];
    const a = this.archetype(m.archetypeId);
    const errors: string[] = [];
    if (s.stage !== 'squadra') errors.push('La squadra si compone in Fase 2');
    if (s.volunteers.some((v) => v.id === m.id)) errors.push(`${m.name} è già in squadra`);
    if (a.pvCost > s.pv) errors.push(`Servono ${a.pvCost} PV, ne restano ${s.pv}`);
    if (a.unique && s.volunteers.some((v) => v.archetypeId === a.id)) errors.push(`In squadra c'è già un ${a.name.toLowerCase()}`);
    return errors;
  }

  recruit(candidateId: string): void {
    const errors = this.recruitErrors(candidateId);
    if (errors.length) throw new Error(errors.join('; '));
    const m = this.content.candidates.find((x) => x.id === candidateId)!;
    const a = this.archetype(m.archetypeId);
    this.state.pv -= a.pvCost;
    this.state.volunteers.push({ id: m.id, name: m.name, archetypeId: a.id, skills: [...a.skills], weeklyHours: a.weeklyHours, hoursUsed: 0, busy: false });
  }

  /** Toglie un volontario dalla squadra e restituisce i suoi PV (solo in Fase 2). */
  dismiss(volunteerId: string): void {
    if (this.state.stage !== 'squadra') throw new Error('La squadra si compone in Fase 2');
    const i = this.state.volunteers.findIndex((v) => v.id === volunteerId);
    if (i < 0) throw new Error(`Non è in squadra: ${volunteerId}`);
    this.state.pv += this.archetype(this.state.volunteers[i].archetypeId).pvCost;
    this.state.volunteers.splice(i, 1);
  }

  teamProblems(): string[] {
    const n = this.state.volunteers.length;
    return n < MIN_TEAM ? [`Servono almeno ${MIN_TEAM} volontari (ora ${n})`] : [];
  }

  confirmTeam(): void {
    if (this.state.stage !== 'squadra') throw new Error('La squadra è già confermata');
    const problems = this.teamProblems();
    if (problems.length) throw new Error(problems.join('; '));
    const s = this.state;
    s.stage = 'sopralluogo';
    s.sessionUsedH = 0;
    s.survey = this.site.pois.map((p) => ({ id: p.id, status: 'da-analizzare', found: null }));
  }

  // ---------- Fase 3: sopralluogo ----------

  get pois(): PoiDef[] {
    return this.site.pois;
  }

  poi(id: string): PoiDef {
    const p = this.site.pois.find((x) => x.id === id);
    if (!p) throw new Error(`Punto sospetto sconosciuto: ${id}`);
    return p;
  }

  poiState(id: string): SurveyPoiState {
    const p = this.state.survey.find((x) => x.id === id);
    if (!p) throw new Error(`Punto sospetto sconosciuto: ${id}`);
    return p;
  }

  hazard(id: string): HazardDef {
    const h = this.content.hazards.find((x) => x.id === id);
    if (!h) throw new Error(`Insidia sconosciuta: ${id}`);
    return h;
  }

  /** Lente consigliata per un punto: la skill che rende sicura l'analisi (null = nessuna). */
  poiLens(poiId: string): string | null {
    const p = this.poi(poiId);
    return p.hazard ? this.hazard(p.hazard).lensSkill : null;
  }

  previewAnalysis(poiId: string, volunteerIds: string[]): Preview {
    const errors: string[] = [];
    if (this.state.stage !== 'sopralluogo') errors.push('Le analisi si fanno nel sopralluogo');
    else if (this.poiState(poiId).status !== 'da-analizzare') errors.push('Punto già analizzato');
    if (volunteerIds.length > SURVEY.maxVolunteers) errors.push(`Massimo ${SURVEY.maxVolunteers} volontari`);
    return this.previewTeam(this.poi(poiId).hours, this.poiLens(poiId), volunteerIds, errors);
  }

  startAnalysis(poiId: string, volunteerIds: string[], now: number): ActiveTask {
    this.tick(now);
    const p = this.previewAnalysis(poiId, volunteerIds);
    if (p.errors.length) throw new Error(p.errors.join('; '));
    this.poiState(poiId).status = 'in-analisi';
    return this.launch('analisi', poiId, volunteerIds, p as DurationResult, now);
  }

  /** Numero pseudo-casuale in [0, 1) dal generatore con seme salvato nello stato (mulberry32). */
  private random(): number {
    let t = (this.state.rng = (this.state.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private areaTiles(poi: PoiDef): number[] {
    const a = poi.area;
    if (!a) return [];
    const w = this.state.grid.width;
    const out: number[] = [];
    for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) out.push(y * w + x);
    return out;
  }

  /** Esito di un'analisi: con lo specialista giusto è sempre corretto, senza si può non vedere l'insidia. */
  private completeAnalysis(a: ActiveTask, t: number, squad: string): void {
    const poi = this.poi(a.refId);
    const st = this.poiState(poi.id);
    st.status = 'analizzato';
    const lines = [squad, `Durata: ${formatHours(a.hours)}`];
    if (poi.hazard) {
      const h = this.hazard(poi.hazard);
      const lens = h.lensSkill !== null && a.volunteerIds.some((id) => this.volunteer(id).skills.includes(h.lensSkill!));
      if (lens || this.random() >= h.errorChance) {
        st.found = h.id;
        for (const i of this.areaTiles(poi)) this.state.grid.risk[i] = h.id;
        this.report(t, `Sopralluogo: ${h.name}`, [`Indizio: ${poi.clue}`, h.description, 'La zona è segnata sulla mappa dei rischi.', ...lines]);
        return;
      }
    }
    st.found = null;
    this.report(t, 'Sopralluogo: niente di preoccupante', [`Indizio: ${poi.clue}`, 'Sembra un falso allarme.', ...lines]);
  }

  /** Fine del sopralluogo: le insidie non viste restano nascoste, si passa alla progettazione. */
  private finishSurvey(t: number): void {
    const s = this.state;
    s.hiddenHazards = this.site.pois
      .filter((p) => p.hazard && this.poiState(p.id).found === null)
      .map((p) => ({ poiId: p.id, hazardId: p.hazard!, tiles: this.areaTiles(p) }));
    const found = s.survey.filter((p) => p.found).length;
    const skipped = s.survey.filter((p) => p.status === 'da-analizzare').length;
    s.stage = 'progettazione';
    s.sessionUsedH = 0;
    for (const v of s.volunteers) v.hoursUsed = 0;
    this.report(t, 'Sopralluogo concluso', [
      `Insidie trovate: ${found}`,
      skipped > 0 ? `Punti non analizzati: ${skipped}. Quello che c'è sotto si scoprirà in cantiere.` : 'Tutti i punti sono stati analizzati.',
      'Ora si progetta il parco: le zone a rischio sono segnate sulla mappa.',
    ]);
  }

  // ---------- lettura ----------

  get sessionLimitH(): number {
    return this.state.stage === 'sopralluogo' ? SURVEY.hours : SESSION_HOURS[this.state.phase];
  }

  get sessionRemainingH(): number {
    return Math.max(0, this.sessionLimitH - this.state.sessionUsedH);
  }

  /** Compiti fissi (parte burocratica) più quelli del piano di cantiere. */
  get allTasks(): (TaskDef | PlanTask)[] {
    return [...this.content.tasks, ...this.state.plan];
  }

  taskDef(id: string): TaskDef | PlanTask {
    const t = this.allTasks.find((x) => x.id === id);
    if (!t) throw new Error(`Compito sconosciuto: ${id}`);
    return t;
  }

  elementDef(id: string): ElementDef {
    const e = this.content.elements.find((x) => x.id === id);
    if (!e) throw new Error(`Elemento sconosciuto: ${id}`);
    return e;
  }

  praticaDef(id: string): PraticaDef {
    const p = this.content.pratiche.find((x) => x.id === id);
    if (!p) throw new Error(`Pratica sconosciuta: ${id}`);
    return p;
  }

  pratica(id: string): PraticaState {
    const p = this.state.pratiche.find((x) => x.id === id);
    if (!p) throw new Error(`Pratica sconosciuta: ${id}`);
    return p;
  }

  volunteer(id: string): Volunteer {
    const v = this.state.volunteers.find((x) => x.id === id);
    if (!v) throw new Error(`Volontario sconosciuto: ${id}`);
    return v;
  }

  hoursLeft(v: Volunteer): number {
    return Math.max(0, v.weeklyHours - v.hoursUsed);
  }

  /** Compiti del piano che devono finire prima di questo e non sono ancora fatti. */
  missingPrerequisites(t: TaskDef | PlanTask): PlanTask[] {
    if (!('after' in t)) return [];
    return t.after.filter((id) => !this.state.completedTasks.includes(id)).map((id) => this.taskDef(id) as PlanTask);
  }

  /**
   * Compiti della fase corrente non ancora fatti né in corso, con i
   * prerequisiti del piano completati. Quelli bloccati da una pratica restano
   * in lista: il giocatore vede cosa gli manca.
   */
  availableTasks(): TaskDef[] {
    if (this.state.stage !== 'cantiere') return [];
    const running = new Set(this.state.active.filter((a) => a.kind === 'lavoro').map((a) => a.refId));
    return this.allTasks.filter(
      (t) =>
        t.phase === this.state.phase &&
        !this.state.completedTasks.includes(t.id) &&
        !running.has(t.id) &&
        this.missingPrerequisites(t).length === 0,
    );
  }

  /** Le pratiche di questa partita, nell'ordine del catalogo. */
  get allPratiche(): PraticaDef[] {
    const ids = new Set(this.state.pratiche.map((p) => p.id));
    return this.content.pratiche.filter((p) => ids.has(p.id));
  }

  /** Pratiche non approvate che bloccano un compito ancora da fare. */
  isBlocking(praticaId: string): boolean {
    if (this.pratica(praticaId).status === 'approvata') return false;
    return this.allTasks.some((t) => t.requires.includes(praticaId) && !this.state.completedTasks.includes(t.id));
  }

  // ---------- progettazione (Fase 4) ----------

  private designError(): string | null {
    const st = this.state.stage;
    if (st === 'progettazione') return null;
    return st === 'cantiere' ? 'Il progetto è già confermato' : 'Prima vanno scelti terreno e squadra';
  }

  private requireDesign(): void {
    const e = this.designError();
    if (e) throw new Error(e);
  }

  canPlace(elementId: string, x: number, y: number): PlaceCheck {
    const e = this.designError();
    if (e) return { ok: false, errors: [e], risks: [] };
    return canPlace(this.state.grid, this.content, elementId, x, y);
  }

  placeElement(elementId: string, x: number, y: number): number {
    this.requireDesign();
    return place(this.state.grid, this.content, elementId, x, y);
  }

  removeElement(uid: number): void {
    this.requireDesign();
    removePlacement(this.state.grid, uid);
  }

  elementAt(x: number, y: number): Placement | undefined {
    return placementAt(this.state.grid, this.content, x, y);
  }

  get siteName(): string {
    return this.site.name;
  }

  get catalog(): ElementDef[] {
    return this.content.elements;
  }

  /** Preventivo, gradimento e problemi del progetto, per l'editor. */
  /**
   * Preventivo, gradimento e problemi del progetto, per l'editor. Euro, ore e
   * materiali vengono dal piano completo: elementi, preparazione del terreno e
   * messa in sicurezza delle insidie note sotto il progetto.
   */
  designSummary(): Estimate & { appeal: number; problems: string[]; riskTiles: number } {
    const g = this.state.grid;
    const est = estimate(g, this.content);
    const plan = generatePlan(g, this.content);
    const costEur = this.orderCost(plan.materials);
    const hours = plan.tasks.reduce((sum, t) => sum + t.hours, 0);
    const riskTiles = new Set(plan.tasks.filter((t) => t.prepId && this.content.preparations.find((p) => p.id === t.prepId)!.risks.length > 0).flatMap((t) => t.tiles)).size;
    const problems = validateProject(g, this.content);
    if (g.placements.length === 0) problems.push('Il progetto è vuoto');
    if (costEur > this.state.budget) problems.push(`Il preventivo (${costEur} €) supera la cassa (${this.state.budget} €)`);
    return { ...est, costEur, hours, materials: plan.materials, appeal: expectedAppeal(g, this.content), problems, riskTiles };
  }

  /** Conferma il progetto: nascono piano di cantiere e pratiche, si apre il cantiere. */
  confirmProject(now: number): void {
    this.requireDesign();
    const { problems } = this.designSummary();
    if (problems.length) throw new Error(problems.join('; '));
    const plan = generatePlan(this.state.grid, this.content);
    const s = this.state;
    s.plan = plan.tasks;
    s.pratiche = gamePratiche(this.content, plan.pratiche).map((id) => ({ id, status: 'da-avviare', waitRemainingH: 0 }));
    s.stage = 'cantiere';
    s.lastTick = Math.max(s.lastTick, now);
    this.report(now, 'Progetto confermato', [
      `Compiti nel piano di cantiere: ${plan.tasks.length}`,
      `Pratiche da avviare: ${s.pratiche.length}`,
      'Si comincia con la parte burocratica: pratiche e ordini dei materiali.',
    ]);
  }

  // ---------- materiali e ordini ----------

  materialName(id: string): string {
    return this.content.materials.find((m) => m.id === id)?.name ?? id;
  }

  /** Materiali del compito che non ci sono in magazzino. */
  missingMaterials(t: TaskDef | PlanTask): { id: string; qty: number }[] {
    if (!('materials' in t)) return [];
    return t.materials
      .map((m) => ({ id: m.id, qty: m.qty - (this.state.stock[m.id] ?? 0) }))
      .filter((m) => m.qty > 0);
  }

  /** Ordine ancora aperto (in preparazione o in consegna) per un compito. */
  openOrder(taskId: string): Order | undefined {
    return this.state.orders.find((o) => o.taskId === taskId && o.status !== 'consegnato');
  }

  orderCost(materials: { id: string; qty: number }[]): number {
    return materials.reduce((sum, m) => {
      const def = this.content.materials.find((x) => x.id === m.id);
      if (!def) throw new Error(`Materiale sconosciuto: ${m.id}`);
      return sum + def.unitPrice * m.qty;
    }, 0);
  }

  /**
   * Compiti del piano per cui si può ordinare: non fatti, senza un ordine
   * aperto e con materiali mancanti. Anche quelli non ancora sbloccati: si
   * ordina in anticipo perché la consegna arriva il weekend dopo.
   */
  orderableTasks(): PlanTask[] {
    const running = new Set(this.state.active.filter((a) => a.kind === 'lavoro').map((a) => a.refId));
    return this.state.plan.filter(
      (t) =>
        !this.state.completedTasks.includes(t.id) &&
        !running.has(t.id) &&
        !this.openOrder(t.id) &&
        this.missingMaterials(t).length > 0,
    );
  }

  previewOrder(taskId: string, volunteerIds: string[]): Preview & { costEur?: number } {
    const def = this.taskDef(taskId);
    const errors: string[] = [];
    if (this.state.stage !== 'cantiere') errors.push('Prima va confermato il progetto');
    if (this.state.phase !== 'burocratica') errors.push('Gli ordini si fanno nella parte burocratica');
    if (this.openOrder(taskId)) errors.push('Ordine già fatto');
    const missing = this.missingMaterials(def);
    if (missing.length === 0) errors.push('I materiali ci sono già');
    const costEur = this.orderCost(missing);
    if (costEur > this.state.budget) errors.push(`Costa ${costEur} €, in cassa ce ne sono ${this.state.budget}`);
    if (volunteerIds.length > ORDERS.maxVolunteers) errors.push(`Massimo ${ORDERS.maxVolunteers} volontario`);
    return { ...this.previewTeam(ORDERS.hours, ORDERS.skill, volunteerIds, errors), costEur };
  }

  /** Quota del progetto realizzata, da 0 a 1 (per elementi posati). */
  get projectProgress(): number {
    const g = this.state.grid;
    return g.placements.length === 0 ? 0 : g.built.length / g.placements.length;
  }

  previewTask(taskId: string, volunteerIds: string[]): Preview {
    const def = this.taskDef(taskId);
    const errors: string[] = [];
    if (this.state.stage !== 'cantiere') errors.push('Prima va confermato il progetto');
    if (def.phase !== this.state.phase) errors.push(`Si fa nella parte ${def.phase}`);
    for (const m of this.missingPrerequisites(def)) errors.push(`Prima serve: ${m.name}`);
    const missing = this.missingMaterials(def);
    if (missing.length > 0) {
      const order = this.openOrder(def.id);
      const list = missing.map((m) => `${m.qty} × ${this.materialName(m.id).toLowerCase()}`).join(', ');
      const when = !order
        ? 'da ordinare'
        : order.status === 'in-preparazione'
          ? 'ordine in preparazione'
          : `in consegna il weekend della settimana ${order.arrivesWeek}`;
      errors.push(`Mancano i materiali: ${list} (${when})`);
    }
    for (const r of def.requires) {
      if (this.pratica(r).status !== 'approvata') errors.push(`Serve la pratica "${this.praticaDef(r).name}"`);
    }
    if (volunteerIds.length > def.maxVolunteers) errors.push(`Massimo ${def.maxVolunteers} volontari`);
    return this.previewTeam(def.hours, def.skill, volunteerIds, errors);
  }

  previewRequest(praticaId: string, volunteerIds: string[]): Preview {
    const def = this.praticaDef(praticaId);
    const errors: string[] = [];
    if (this.state.stage !== 'cantiere') errors.push('Prima va confermato il progetto');
    if (this.state.phase !== 'burocratica') errors.push('Le pratiche si avviano nella parte burocratica');
    if (this.pratica(praticaId).status !== 'da-avviare') errors.push('Pratica già avviata');
    if (volunteerIds.length > 2) errors.push('Massimo 2 volontari');
    return this.previewTeam(def.requestHours, def.requestSkill, volunteerIds, errors);
  }

  private previewTeam(total: number, skill: string | null, ids: string[], errors: string[]): Preview {
    if (ids.length === 0) return { errors: [...errors, 'Scegli almeno un volontario'] };
    const team = ids.map((id) => this.volunteer(id));
    const d = computeDuration(total, skill, team);
    for (const v of team) {
      if (v.busy) errors.push(`${v.name} è impegnato`);
      else if (this.hoursLeft(v) + EPS < d.hours) errors.push(`${v.name} ha solo ${formatHours(this.hoursLeft(v))} disponibili`);
    }
    if (d.hours > this.sessionRemainingH + EPS) {
      errors.push(`Dura ${formatHours(d.hours)}, ma alla sessione restano ${formatHours(this.sessionRemainingH)}`);
    }
    return { ...d, errors };
  }

  // ---------- azioni ----------

  startTask(taskId: string, volunteerIds: string[], now: number): ActiveTask {
    this.tick(now);
    const p = this.previewTask(taskId, volunteerIds);
    if (p.errors.length) throw new Error(p.errors.join('; '));
    const def = this.taskDef(taskId);
    if ('materials' in def) for (const m of def.materials) this.state.stock[m.id] -= m.qty;
    return this.launch('lavoro', taskId, volunteerIds, p as DurationResult, now);
  }

  /** Avvia la compilazione di un ordine: si paga subito, la consegna parte quando il compito finisce. */
  startOrder(taskId: string, volunteerIds: string[], now: number): ActiveTask {
    this.tick(now);
    const p = this.previewOrder(taskId, volunteerIds);
    if (p.errors.length) throw new Error(p.errors.join('; '));
    const materials = this.missingMaterials(this.taskDef(taskId));
    this.state.budget -= p.costEur!;
    this.state.orders.push({ uid: this.state.nextId++, taskId, materials, costEur: p.costEur!, status: 'in-preparazione', arrivesWeek: 0 });
    return this.launch('ordine', taskId, volunteerIds, p as DurationResult, now);
  }

  startRequest(praticaId: string, volunteerIds: string[], now: number): ActiveTask {
    this.tick(now);
    const p = this.previewRequest(praticaId, volunteerIds);
    if (p.errors.length) throw new Error(p.errors.join('; '));
    this.pratica(praticaId).status = 'in-richiesta';
    return this.launch('richiesta', praticaId, volunteerIds, p as DurationResult, now);
  }

  private launch(kind: ActiveTask['kind'], refId: string, ids: string[], d: DurationResult, now: number): ActiveTask {
    const task: ActiveTask = {
      uid: this.state.nextId++,
      kind,
      refId,
      volunteerIds: [...ids],
      startedAt: now,
      endsAt: now + d.hours * this.state.msPerHour,
      hours: d.hours,
      quality: d.quality,
    };
    for (const id of ids) {
      const v = this.volunteer(id);
      v.busy = true;
      v.hoursUsed += d.hours;
    }
    this.state.active.push(task);
    return task;
  }

  canCloseSession(): boolean {
    const st = this.state.stage;
    return (st === 'cantiere' || st === 'sopralluogo') && this.state.active.length === 0;
  }

  /** Chiusura manuale: i giorni rimanenti passano comunque, le attese avanzano. Nel sopralluogo lo conclude. */
  closeSession(now: number): void {
    this.tick(now);
    const st = this.state.stage;
    if (st !== 'cantiere' && st !== 'sopralluogo') throw new Error('Prima va confermato il progetto');
    if (!this.canCloseSession()) throw new Error('Ci sono compiti in corso');
    if (st === 'sopralluogo') this.finishSurvey(now);
    else this.endSession(now, true);
  }

  // ---------- tempo ----------

  tick(now: number): void {
    const s = this.state;
    for (let guard = 0; guard < 10_000; guard++) {
      const next = this.nextEventTime();
      if (next > now) break;
      this.advanceTo(Math.max(next, s.lastTick));
      this.processEvents(s.lastTick);
    }
    this.advanceTo(now);
  }

  private nextEventTime(): number {
    const s = this.state;
    let next = Infinity;
    for (const a of s.active) next = Math.min(next, a.endsAt);
    if (s.stage === 'cantiere' && s.phase === 'burocratica' && s.active.length > 0) {
      for (const p of s.pratiche) {
        if (p.status === 'in-attesa') next = Math.min(next, s.lastTick + p.waitRemainingH * s.msPerHour);
      }
    }
    return next;
  }

  private advanceTo(t: number): void {
    const s = this.state;
    if (t <= s.lastTick) return;
    const dtH = (t - s.lastTick) / s.msPerHour;
    if (s.active.length > 0) {
      s.sessionUsedH = Math.min(this.sessionLimitH, s.sessionUsedH + dtH);
      if (s.stage === 'cantiere' && s.phase === 'burocratica') this.progressWaits(dtH, t);
    }
    s.lastTick = t;
  }

  private progressWaits(dtH: number, at: number): void {
    for (const p of this.state.pratiche) {
      if (p.status !== 'in-attesa') continue;
      p.waitRemainingH = Math.max(0, p.waitRemainingH - dtH);
      if (p.waitRemainingH <= EPS) {
        p.status = 'approvata';
        p.waitRemainingH = 0;
        const def = this.praticaDef(p.id);
        this.report(at, `Pratica approvata: ${def.name}`, [`Risposta di: ${def.office}`, `Sblocca: ${def.unlocks}`]);
      }
    }
  }

  private processEvents(t: number): void {
    const s = this.state;
    const done = s.active.filter((a) => a.endsAt <= t);
    s.active = s.active.filter((a) => a.endsAt > t);
    for (const a of done) this.complete(a, t);
    if (s.sessionUsedH >= this.sessionLimitH - EPS && s.active.length === 0) {
      if (s.stage === 'sopralluogo') this.finishSurvey(t);
      else this.endSession(t, false);
    }
  }

  private complete(a: ActiveTask, t: number): void {
    const names = a.volunteerIds.map((id) => {
      const v = this.volunteer(id);
      v.busy = false;
      return v.name;
    });
    const squad = `Squadra: ${names.join(', ')}`;
    const time = `Durata: ${formatHours(a.hours)}`;
    if (a.kind === 'lavoro') {
      const def = this.taskDef(a.refId);
      this.state.completedTasks.push(a.refId);
      if ('tiles' in def) this.applyToGrid(def);
      this.report(t, `Completato: ${def.name}`, [squad, time, `Qualità: ${a.quality}`]);
      if ('tiles' in def) this.revealHazards(def, t);
    } else if (a.kind === 'analisi') {
      this.completeAnalysis(a, t, squad);
    } else if (a.kind === 'ordine') {
      const order = this.openOrder(a.refId);
      if (order) {
        order.status = 'in-consegna';
        order.arrivesWeek = this.state.week + ORDERS.deliveryWeeks;
        this.report(t, `Ordine inviato: ${this.taskDef(a.refId).name}`, [
          squad,
          `Spesa: ${order.costEur} €`,
          `Consegna all'inizio del weekend della settimana ${order.arrivesWeek}`,
        ]);
      }
    } else {
      const p = this.pratica(a.refId);
      const def = this.praticaDef(a.refId);
      p.status = 'in-attesa';
      p.waitRemainingH = def.waitDays * HOURS_PER_WORKING_DAY;
      this.report(t, `Richiesta inviata: ${def.name}`, [squad, time, `Risposta attesa tra ${def.waitDays} giorni lavorativi`]);
    }
  }

  /**
   * Un lavoro finito su tile con un'insidia sfuggita al sopralluogo la fa
   * emergere: nasce la messa in sicurezza (con i suoi materiali) e i lavori
   * ancora da fare su quelle tile la devono aspettare.
   */
  private revealHazards(task: PlanTask, t: number): void {
    const s = this.state;
    const hit = s.hiddenHazards.filter((h) => h.tiles.some((i) => task.tiles.includes(i)));
    for (const h of hit) {
      s.hiddenHazards = s.hiddenHazards.filter((x) => x !== h);
      for (const i of h.tiles) s.grid.risk[i] = h.hazardId;
      const def = this.hazard(h.hazardId);
      const extra = emergencyTasks(s.grid, this.content, h.hazardId, h.tiles, s.plan, s.completedTasks, h.poiId);
      const prepAfter = new Set(this.content.preparations.find((p) => p.id === def.prep)?.after ?? []);
      const running = new Set(s.active.map((a) => a.refId));
      for (const x of extra) {
        for (const other of s.plan) {
          if (s.completedTasks.includes(other.id) || running.has(other.id)) continue;
          if (other.prepId && prepAfter.has(other.prepId)) continue;
          if (other.tiles.some((i) => x.tiles.includes(i))) other.after.push(x.id);
        }
      }
      s.plan.push(...extra);
      this.report(t, `Imprevisto: ${def.name}`, [
        def.description,
        extra.length
          ? `Nuovi lavori: ${extra.map((x) => x.name).join(', ')}. I lavori su quella zona aspettano.`
          : 'Per fortuna lì non resta niente da costruire.',
        'Un sopralluogo più accurato l\'avrebbe scoperto prima.',
      ]);
    }
  }

  /** All'inizio del weekend arrivano le consegne previste per questa settimana. */
  private deliverOrders(t: number): void {
    for (const o of this.state.orders) {
      if (o.status !== 'in-consegna' || o.arrivesWeek > this.state.week) continue;
      o.status = 'consegnato';
      for (const m of o.materials) this.state.stock[m.id] = (this.state.stock[m.id] ?? 0) + m.qty;
      this.report(t, `Consegna arrivata: ${this.taskDef(o.taskId).name}`, [
        o.materials.map((m) => `${m.qty} × ${this.materialName(m.id).toLowerCase()}`).join(', '),
        'I materiali sono in magazzino',
      ]);
    }
  }

  /** Un compito del piano finito cambia il terreno o costruisce i suoi elementi. */
  private applyToGrid(task: PlanTask): void {
    const g = this.state.grid;
    if (task.prepId) {
      const prep = this.content.preparations.find((p) => p.id === task.prepId);
      if (prep?.result) for (const i of task.tiles) g.surface[i] = prep.result;
      // messa in sicurezza fatta: su quelle tile il rischio non c'è più
      if (prep && prep.risks.length > 0) for (const i of task.tiles) if (g.risk[i] && prep.risks.includes(g.risk[i]!)) g.risk[i] = null;
    }
    for (const uid of task.placements) if (!g.built.includes(uid)) g.built.push(uid);
  }

  private endSession(t: number, manual: boolean): void {
    const s = this.state;
    if (s.phase === 'burocratica') {
      const skipped = this.sessionRemainingH;
      if (skipped > EPS) this.progressWaits(skipped, t);
      s.phase = 'operativa';
      s.sessionUsedH = 0;
      this.deliverOrders(t);
      this.report(t, 'Inizia il weekend', [
        manual ? `Parte burocratica chiusa in anticipo: passano ${formatHours(skipped)} di attese` : 'Parte burocratica completata',
        `Sessione operativa: ${SESSION_HOURS.operativa} ore`,
      ]);
    } else {
      const done = s.completedTasks.length;
      this.report(t, `Fine della settimana ${s.week}`, [
        `Compiti completati finora: ${done}`,
        `Progetto realizzato: ${Math.round(this.projectProgress * 100)}%`,
        `In cassa: ${s.budget} €`,
        'Le ore dei volontari ripartono da zero',
      ]);
      s.week += 1;
      s.phase = 'burocratica';
      s.sessionUsedH = 0;
      for (const v of s.volunteers) v.hoursUsed = 0;
    }
  }

  private report(at: number, title: string, lines: string[]): void {
    this.state.reports.push({ id: this.state.nextId++, at, title, lines, seen: false });
  }

  unseenReports() {
    return this.state.reports.filter((r) => !r.seen).sort((a, b) => a.at - b.at || a.id - b.id);
  }

  markSeen(id: number): void {
    const r = this.state.reports.find((x) => x.id === id);
    if (r) r.seen = true;
  }
}
