import { HOURS_PER_WORKING_DAY, SESSION_HOURS } from '../config';
import type { Content } from './content';
import { computeDuration, formatHours, type DurationResult } from './duration';
import type { ActiveTask, GameState, PraticaDef, PraticaState, TaskDef, Volunteer } from './types';

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

  static newGame(content: Content, now: number, timeScale = 1): Simulation {
    const volunteers: Volunteer[] = content.team.map((m) => {
      const a = content.archetypes.find((x) => x.id === m.archetypeId);
      if (!a) throw new Error(`Archetipo sconosciuto: ${m.archetypeId}`);
      return { id: m.id, name: m.name, archetypeId: a.id, skills: [...a.skills], weeklyHours: a.weeklyHours, hoursUsed: 0, busy: false };
    });
    const state: GameState = {
      version: 1,
      msPerHour: 3_600_000 / timeScale,
      week: 1,
      phase: 'burocratica',
      sessionUsedH: 0,
      lastTick: now,
      volunteers,
      active: [],
      completedTasks: [],
      pratiche: content.pratiche.map((p) => ({ id: p.id, status: 'da-avviare', waitRemainingH: 0 })),
      reports: [],
      nextId: 1,
    };
    return new Simulation(state, content);
  }

  // ---------- lettura ----------

  get sessionLimitH(): number {
    return SESSION_HOURS[this.state.phase];
  }

  get sessionRemainingH(): number {
    return Math.max(0, this.sessionLimitH - this.state.sessionUsedH);
  }

  taskDef(id: string): TaskDef {
    const t = this.content.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`Compito sconosciuto: ${id}`);
    return t;
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

  /** Compiti della fase corrente non ancora fatti né in corso. */
  availableTasks(): TaskDef[] {
    const running = new Set(this.state.active.filter((a) => a.kind === 'lavoro').map((a) => a.refId));
    return this.content.tasks.filter(
      (t) => t.phase === this.state.phase && !this.state.completedTasks.includes(t.id) && !running.has(t.id),
    );
  }

  get allPratiche(): PraticaDef[] {
    return this.content.pratiche;
  }

  /** Pratiche non approvate che bloccano un compito ancora da fare. */
  isBlocking(praticaId: string): boolean {
    if (this.pratica(praticaId).status === 'approvata') return false;
    return this.content.tasks.some((t) => t.requires.includes(praticaId) && !this.state.completedTasks.includes(t.id));
  }

  previewTask(taskId: string, volunteerIds: string[]): Preview {
    const def = this.taskDef(taskId);
    const errors: string[] = [];
    if (def.phase !== this.state.phase) errors.push(`Si fa nella parte ${def.phase}`);
    for (const r of def.requires) {
      if (this.pratica(r).status !== 'approvata') errors.push(`Serve la pratica "${this.praticaDef(r).name}"`);
    }
    if (volunteerIds.length > def.maxVolunteers) errors.push(`Massimo ${def.maxVolunteers} volontari`);
    return this.previewTeam(def.hours, def.skill, volunteerIds, errors);
  }

  previewRequest(praticaId: string, volunteerIds: string[]): Preview {
    const def = this.praticaDef(praticaId);
    const errors: string[] = [];
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
    return this.launch('lavoro', taskId, volunteerIds, p as DurationResult, now);
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
    return this.state.active.length === 0;
  }

  /** Chiusura manuale: i giorni rimanenti passano comunque, le attese avanzano. */
  closeSession(now: number): void {
    this.tick(now);
    if (!this.canCloseSession()) throw new Error('Ci sono compiti in corso');
    this.endSession(now, true);
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
    if (s.phase === 'burocratica' && s.active.length > 0) {
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
      if (s.phase === 'burocratica') this.progressWaits(dtH, t);
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
    if (s.sessionUsedH >= this.sessionLimitH - EPS && s.active.length === 0) this.endSession(t, false);
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
      this.state.completedTasks.push(a.refId);
      this.report(t, `Completato: ${this.taskDef(a.refId).name}`, [squad, time, `Qualità: ${a.quality}`]);
    } else {
      const p = this.pratica(a.refId);
      const def = this.praticaDef(a.refId);
      p.status = 'in-attesa';
      p.waitRemainingH = def.waitDays * HOURS_PER_WORKING_DAY;
      this.report(t, `Richiesta inviata: ${def.name}`, [squad, time, `Risposta attesa tra ${def.waitDays} giorni lavorativi`]);
    }
  }

  private endSession(t: number, manual: boolean): void {
    const s = this.state;
    if (s.phase === 'burocratica') {
      const skipped = this.sessionRemainingH;
      if (skipped > EPS) this.progressWaits(skipped, t);
      s.phase = 'operativa';
      s.sessionUsedH = 0;
      this.report(t, 'Inizia il weekend', [
        manual ? `Parte burocratica chiusa in anticipo: passano ${formatHours(skipped)} di attese` : 'Parte burocratica completata',
        `Sessione operativa: ${SESSION_HOURS.operativa} ore`,
      ]);
    } else {
      const done = s.completedTasks.length;
      this.report(t, `Fine della settimana ${s.week}`, [`Compiti completati finora: ${done}`, 'Le ore dei volontari ripartono da zero']);
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
