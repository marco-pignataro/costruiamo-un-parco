import { ASSOCIATION, GAME_TITLE, HOURS_PER_WORKING_DAY, ORDERS, SIDE_QUEST, SURVEY } from '../config';
import { formatHours } from '../core/duration';
import type { Simulation } from '../core/simulation';
import type { ActiveTask, PraticaStatus } from '../core/types';
import type { Insets } from '../game/camera';
import { ERASER, type EditorTool } from '../game/ParkScene';
import { SHIRTS } from '../game/sprites';

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

/** Mini-puzzle aperto: delegazione scelta, ordine di presentazione e risposte date. */
interface Puzzle {
  praticaId: string;
  volunteerIds: string[];
  order: number[];
  answers: Record<number, string>;
}

const STATUS_LABEL: Record<PraticaStatus, string> = {
  'da-avviare': 'Da avviare',
  'in-richiesta': 'In richiesta',
  'in-attesa': 'In attesa di risposta',
  approvata: 'Approvata',
};

const KIND_LABEL: Record<Kind, string> = {
  lavoro: 'Lavoro',
  richiesta: 'Pratica a timer',
  sidequest: 'Richiesta diretta al dirigente',
  ordine: 'Ordine al fornitore',
  analisi: 'Analisi del sopralluogo',
};

const LENS: Record<string, string> = { impianti: 'elettricista / idraulico', verde: 'giardiniere', progetto: 'geometra' };

/** Errore di anteprima che dipende solo dalla squadra non ancora scelta: non blocca l'attività in sé. */
const NO_TEAM = 'Scegli almeno un volontario';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface HudActions {
  onChange: () => void;
  onNewGame: () => void;
  onExport: () => void;
  /** Alterna visuale intera e ingrandimento. */
  onZoom: () => void;
  isZoomed: () => boolean;
  /** La HUD occupa questo spazio sui bordi: la scena lascia libera la zona in mezzo. */
  onInsets: (insets: Insets) => void;
}

type Region = 'top' | 'left' | 'right' | 'bottom';

/**
 * HUD attorno alla scena: ogni blocco è una scheda con un posto fisso su un
 * bordo dello schermo (in alto stato e comandi della giornata, a sinistra la
 * squadra, a destra le attività e i registri, in basso i compiti in corso e
 * lo zoom). Le attività si avviano da una modale al centro.
 */
export class Hud {
  private regions: Record<Region, HTMLElement>;
  private toast: HTMLElement;
  /** Attività aperta nella modale centrale e volontari spuntati. */
  private open: { kind: Kind; id: string } | null = null;
  private team = new Set<string>();
  private message = '';
  private puzzle: Puzzle | null = null;
  private collapsed: Record<'left' | 'right', boolean> = { left: false, right: false };
  private lastInsets = '';

  constructor(
    root: HTMLElement,
    private readonly dialog: HTMLElement,
    private readonly modal: HTMLElement,
    private readonly getSim: () => Simulation,
    private readonly actions: HudActions,
    private readonly editor: EditorTool,
  ) {
    const make = (tag: string, id: string) => {
      const el = document.createElement(tag);
      el.id = id;
      el.className = 'region';
      root.append(el);
      return el;
    };
    this.regions = { top: make('header', 'hud-top'), left: make('aside', 'hud-left'), right: make('aside', 'hud-right'), bottom: make('footer', 'hud-bottom') };
    this.toast = document.createElement('div');
    this.toast.id = 'hud-toast';
    root.append(this.toast);
    for (const el of [root, dialog]) {
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('change', (e) => this.onInput(e));
    }
    modal.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ok]');
      if (!btn) return;
      this.getSim().markSeen(Number(btn.dataset.ok));
      this.actions.onChange();
      this.render();
    });
    window.addEventListener('resize', () => this.measure());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        this.closeActivity();
        this.render();
      } else if ((e.key === 'z' || e.key === 'Z') && !(e.target instanceof HTMLInputElement) && !e.ctrlKey && !e.metaKey) {
        this.actions.onZoom();
        this.render();
      }
    });
    document.title = GAME_TITLE;
  }

  private get sim() {
    return this.getSim();
  }

  // ---------- API per le scene (punta e clicca) ----------

  /** Attività avviabili adesso, nell'ordine in cui le mostra la HUD. */
  activities(): Activity[] {
    const sim = this.sim;
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

  /** Apre la modale di un'attività, con dei volontari già scelti (es. cliccati sulla mappa). */
  openActivity(kind: Kind, id: string, volunteerIds: string[] = []): void {
    this.open = { kind, id };
    this.team = new Set(volunteerIds.filter((v) => !this.sim.volunteer(v).busy));
    this.message = '';
    this.render();
  }

  // ---------- disegno ----------

  render(): void {
    const sim = this.sim;
    const stage = sim.state.stage;
    if (this.open && !this.activities().some((a) => a.kind === this.open!.kind && a.id === this.open!.id)) this.closeActivity();

    let parts: Partial<Record<Region, string>>;
    if (stage === 'terreno') parts = this.sitesParts();
    else if (stage === 'squadra') parts = this.teamParts();
    else if (stage === 'progettazione') parts = this.designParts();
    else if (stage === 'inaugurato') parts = { top: this.brand('Il parco è inaugurato!'), bottom: this.controls() };
    else parts = this.playParts();

    for (const r of ['top', 'left', 'right', 'bottom'] as Region[]) {
      let html = parts[r] ?? '';
      if ((r === 'left' || r === 'right') && html) {
        const label = r === 'left' ? 'Squadra' : 'Attività';
        html = this.collapsed[r]
          ? `<button class="card tab" data-toggle="${r}" title="Mostra">${r === 'left' ? '▸' : '◂'} ${label}</button>`
          : `<button class="card tab hide" data-toggle="${r}" title="Nascondi">${r === 'left' ? '◂' : '▸'}</button>${html}`;
      }
      setHTML(this.regions[r], html);
    }
    setHTML(this.toast, this.message ? `<p class="card msg">${esc(this.message)}</p>` : '');

    if (stage === 'inaugurato') this.showDialog(this.finale(), 'finale');
    else if (this.puzzle && stage === 'cantiere') this.showDialog(this.puzzleCard(), 'puzzle');
    else if (this.open) this.showDialog(this.activityCard(), 'activity');
    else this.showDialog('', '');
    this.renderModal();
    this.measure();
  }

  private showDialog(html: string, kind: string) {
    this.dialog.hidden = html === '';
    this.dialog.dataset.kind = kind;
    setHTML(this.dialog, html);
  }

  /** Spazio occupato sui bordi: la scena lo lascia libero nella visuale intera. */
  private measure() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const r = (el: HTMLElement) => (el.childElementCount ? el.getBoundingClientRect() : null);
    const top = r(this.regions.top);
    const left = r(this.regions.left);
    const right = r(this.regions.right);
    const bottom = r(this.regions.bottom);
    const insets: Insets = {
      top: top ? Math.round(top.bottom) : 0,
      left: left ? Math.round(left.right) : 0,
      right: right ? Math.round(W - right.left) : 0,
      bottom: bottom ? Math.round(H - bottom.top) : 0,
    };
    const key = JSON.stringify(insets);
    if (key === this.lastInsets) return;
    this.lastInsets = key;
    this.actions.onInsets(insets);
  }

  private brand(subtitle: string, extra = ''): string {
    return `<section class="card brand"><h1>${esc(GAME_TITLE)}</h1><p>${subtitle}</p>${extra}</section>`;
  }

  /** In basso a destra: zoom e menu della partita. */
  private controls(): string {
    return `<section class="card controls">
        <button data-act="zoom" class="zoom" title="Alterna visuale intera e ingrandimento (tasto Z)">${this.actions.isZoomed() ? '− Visuale intera' : '+ Ingrandisci'}</button>
        <details class="menu"><summary>Menu</summary>
          <div class="menu-items">
            <button data-act="notify">Attiva notifiche</button>
            <button data-act="export">Esporta salvataggio</button>
            <button data-act="new">Nuova partita</button>
            <small>Prototipo. Per provare più in fretta: <code>?velocita=60</code> nell'indirizzo e una nuova partita (1 ora = 1 minuto).</small>
          </div>
        </details>
      </section>`;
  }

  /** Pulsante donazioni: solo nel menu iniziale (scelta del terreno) e all'inaugurazione, mai durante il gioco. */
  private donate(): string {
    return `<section class="card support">
        <a class="donate" href="${ASSOCIATION.donationUrl}" target="_blank" rel="noopener">Sostieni ${esc(ASSOCIATION.name)}</a>
        <small>Il gioco è gratuito. Se ti piace, aiuta l'associazione che rigenera davvero gli spazi di Messina. 5x1000: codice fiscale <strong>${ASSOCIATION.taxCode5x1000}</strong></small>
      </section>`;
  }

  private activeName(a: ActiveTask): string {
    const sim = this.sim;
    return a.kind === 'lavoro'
      ? sim.taskDef(a.refId).name
      : a.kind === 'ordine'
        ? `Ordine: materiali per ${sim.taskDef(a.refId).name}`
        : a.kind === 'analisi'
          ? `Analisi: ${sim.poi(a.refId).clue}`
          : `Richiesta: ${sim.praticaDef(a.refId).name}`;
  }

  // ---------- sopralluogo e cantiere ----------

  private playParts(): Partial<Record<Region, string>> {
    const sim = this.sim;
    const s = sim.state;
    const now = Date.now();
    const surveying = s.stage === 'sopralluogo';
    const phaseName = surveying ? 'Sopralluogo (una giornata)' : s.phase === 'burocratica' ? 'Parte burocratica (infrasettimanale)' : 'Parte operativa (weekend)';
    const used = s.sessionUsedH;
    const limit = sim.sessionLimitH;
    const closeLabel = surveying ? 'Chiudi il sopralluogo' : s.phase === 'burocratica' ? 'Chiudi e vai al weekend' : 'Chiudi il weekend';
    const closeTitle = surveying ? 'I punti non analizzati restano un mistero' : 'I giorni rimanenti passano comunque e le attese avanzano';

    const top = [
      this.brand(`${surveying ? `Fase 3 · ${esc(sim.siteName)}` : `Settimana ${s.week}`} · ${phaseName}`),
      `<section class="card session"><h2>Sessione</h2><div class="bar"><span style="width:${((used / limit) * 100).toFixed(1)}%"></span></div>
        <small>${formatHours(used)} su ${limit} h${s.active.length ? '' : ' · ferma: nessun compito in corso'}</small></section>`,
      surveying
        ? ''
        : `<section class="card money"><p>In cassa <strong>${s.budget} €</strong></p><p>Progetto realizzato <strong>${Math.round(sim.projectProgress * 100)}%</strong></p></section>`,
      `<section class="card day"><button data-act="close" ${sim.canCloseSession() ? '' : 'disabled'} title="${closeTitle}">${closeLabel}</button>${surveying ? '' : this.inaugurateButton()}</section>`,
    ].join('');

    // A sinistra: la squadra, con ore e cosa sta facendo.
    const doing = new Map<string, string>();
    for (const a of s.active) for (const id of a.volunteerIds) doing.set(id, this.activeName(a));
    const vols = s.volunteers
      .map((v) => {
        const color = SHIRTS[v.archetypeId] ?? SHIRTS.base;
        const what = doing.get(v.id);
        return `<li class="vol ${v.busy ? 'busy' : ''}"><i style="background:${color}"></i>
          <span><strong>${esc(v.name)}</strong> <small>${esc(sim.archetype(v.archetypeId).name)}</small><br>
          <small>${what ? `Al lavoro: ${esc(what)}` : 'Libero'}</small></span>
          <small class="hours">${formatHours(sim.hoursLeft(v))}<br>su ${v.weeklyHours} h</small></li>`;
      })
      .join('');
    const left = `<section class="card"><h2>Squadra</h2><ul class="vols">${vols}</ul></section>`;

    // A destra: cosa si può fare, poi i registri.
    const acts = this.activities();
    const list = acts
      .map((a) => {
        const why = a.blockers.length ? `<em>${esc(a.blockers[0])}</em>` : '';
        return `<li><button class="act ${a.blockers.length ? 'blocked' : ''}" data-open="${a.kind}:${a.id}">
          <strong>${esc(a.name)}</strong><small>${esc(KIND_LABEL[a.kind])} · ${esc(a.meta)}</small>${why}</button></li>`;
      })
      .join('');
    const todo = `<section class="card"><h2>${surveying ? 'Punti da analizzare' : 'Da fare'}</h2>
      <ul class="acts">${list || '<li><small>Niente da avviare adesso.</small></li>'}</ul></section>`;
    let registers = '';
    if (surveying) {
      const done = sim.pois
        .filter((p) => sim.poiState(p.id).status !== 'da-analizzare')
        .map((p) => {
          const st = sim.poiState(p.id);
          const result = st.status === 'in-analisi' ? 'In analisi…' : st.found ? `<strong class="danger">${esc(sim.hazard(st.found).name)}</strong>` : 'Niente di preoccupante (forse)';
          return `<li><strong>${esc(p.clue)}</strong><br><small>${result}</small></li>`;
        })
        .join('');
      registers = `<section class="card"><h2>Esiti</h2><ul>${done || '<li><small>Ancora nessuna analisi.</small></li>'}</ul>
        <p><small>Le ore non bastano per tutto: scegli dove guardare. Senza lo specialista giusto un'insidia può sfuggire, e si scoprirà in cantiere.</small></p></section>`;
    } else {
      const pratiche = sim.allPratiche
        .map((def) => {
          const st = sim.pratica(def.id);
          const wait = st.status === 'in-attesa' ? ` · ${formatHours(st.waitRemainingH)} di sessione` : '';
          const block = sim.isBlocking(def.id) ? '<em>blocca dei lavori</em>' : '';
          return `<li class="st-${st.status}"><strong>${esc(def.name)}</strong> ${block}<br><small>${STATUS_LABEL[st.status]}${wait} · sblocca: ${esc(def.unlocks)}</small></li>`;
        })
        .join('');
      const inStock = Object.entries(s.stock).filter(([, q]) => q > 0);
      const incoming = s.orders.filter((o) => o.status !== 'consegnato');
      const stock =
        (inStock.length ? `<ul>${inStock.map(([id, q]) => `<li>${q} × ${esc(sim.materialName(id).toLowerCase())}</li>`).join('')}</ul>` : '<p><small>Vuoto.</small></p>') +
        (incoming.length
          ? `<ul class="orders">${incoming
              .map((o) => {
                const when = o.status === 'in-preparazione' ? 'ordine in preparazione' : `arriva il weekend della settimana ${o.arrivesWeek}`;
                return `<li><small>${esc(sim.taskDef(o.taskId).name)}: ${when}</small></li>`;
              })
              .join('')}</ul>`
          : '');
      registers = `<section class="card"><h2>Registro delle pratiche</h2><ul class="pratiche">${pratiche || '<li><small>Nessuna pratica.</small></li>'}</ul></section>
        <section class="card"><h2>Magazzino</h2>${stock}</section>`;
    }

    // In basso: i compiti in corso con il loro timer, poi lo zoom.
    const active = s.active
      .map((a) => {
        const leftH = Math.max(0, (a.endsAt - now) / s.msPerHour);
        const pct = Math.min(100, ((now - a.startedAt) / (a.endsAt - a.startedAt)) * 100);
        const who = a.volunteerIds.map((id) => sim.volunteer(id).name).join(', ');
        return `<li><strong>${esc(this.activeName(a))}</strong><div class="bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <small>${esc(who)} · mancano ${formatHours(leftH)}</small></li>`;
      })
      .join('');
    const bottom = `<section class="card running"><h2>In corso</h2><ul class="active">${active || '<li><small>Nessun compito in corso: il tempo di sessione è fermo.</small></li>'}</ul></section>${this.controls()}`;

    return { top, left, right: todo + registers, bottom };
  }

  private inaugurateButton(): string {
    const problems = this.sim.inaugurationProblems();
    return `<button data-act="inaugurate" class="ribbon" ${problems.length ? `disabled title="${esc(problems.join('; '))}"` : ''}>Taglia il nastro</button>`;
  }

  /** Modale centrale: i dati dell'attività, i volontari da scegliere e il pulsante per avviarla. */
  private activityCard(): string {
    const sim = this.sim;
    const { kind, id } = this.open!;
    const ids = [...this.team];
    const rows: [string, string][] = [];
    let title = '';
    let preview;
    let max = 1;
    if (kind === 'lavoro') {
      const def = sim.taskDef(id);
      title = def.name;
      max = def.maxVolunteers;
      rows.push(['Ore complessive', `${def.hours} h`], ['Skill utile', def.skill ?? '—'], ['Volontari', `fino a ${def.maxVolunteers}`]);
      if ('materials' in def && def.materials.length) rows.push(['Materiali', def.materials.map((m) => `${m.qty} × ${sim.materialName(m.id).toLowerCase()}`).join(', ')]);
      if (def.requires.length) rows.push(['Pratiche', def.requires.map((r) => `${sim.praticaDef(r).name} (${STATUS_LABEL[sim.pratica(r).status].toLowerCase()})`).join(', ')]);
      if (def.fundraisingEur) rows.push(['Raccolta', `${def.fundraisingEur} € di base; di più con comunicatore, presidente e segretario/a`]);
      preview = sim.previewTask(id, ids);
    } else if (kind === 'richiesta') {
      const def = sim.praticaDef(id);
      title = def.name;
      max = 2;
      rows.push(
        ['Ufficio', def.office],
        ['Richiesta', `${def.requestHours} h complessive${def.requestSkill ? ` · skill utile: ${def.requestSkill}` : ''}`],
        ['Attesa', `${def.waitDays} giorni lavorativi (${def.waitDays * HOURS_PER_WORKING_DAY} h di sessione), con i volontari liberi`],
        ['Sblocca', def.unlocks],
      );
      preview = sim.previewRequest(id, ids);
    } else if (kind === 'sidequest') {
      const def = sim.praticaDef(id);
      title = def.name;
      max = SIDE_QUEST.maxVolunteers;
      const allowed = ids.length ? sim.sideQuestAllowedErrors(id, ids) : sim.sideQuest(id).allowedErrors;
      rows.push(
        ['Ufficio', def.office],
        ['Durata', `una giornata: ${SIDE_QUEST.hours} h di sessione e ${SIDE_QUEST.hours} h a testa`],
        ['Delegazione', `fino a ${SIDE_QUEST.maxVolunteers} volontari`],
        ['Errori ammessi', `${allowed} (uno in più con il presidente)`],
        ['Sblocca', def.unlocks],
      );
      preview = sim.previewSideQuest(id, ids);
    } else if (kind === 'ordine') {
      const def = sim.taskDef(id);
      const missing = sim.missingMaterials(def);
      title = `Materiali per ${def.name}`;
      max = ORDERS.maxVolunteers;
      rows.push(
        ['Da ordinare', missing.map((m) => `${m.qty} × ${sim.materialName(m.id).toLowerCase()}`).join(', ')],
        ['Costo', `${sim.orderCost(missing)} € (in cassa ${sim.state.budget} €)`],
        ['Compilazione', `${ORDERS.hours} h${ORDERS.skill ? ` · skill utile: ${ORDERS.skill}` : ''}`],
        ['Consegna', `il weekend della settimana ${sim.state.week + 1}`],
      );
      preview = sim.previewOrder(id, ids);
    } else {
      const p = sim.poi(id);
      const lens = sim.poiLens(id);
      title = p.clue;
      max = SURVEY.maxVolunteers;
      rows.push(['Ore complessive', `${p.hours} h`], ['Volontari', `fino a ${SURVEY.maxVolunteers}`], ['Più sicuro con', lens ? (LENS[lens] ?? lens) : 'chiunque']);
      preview = sim.previewAnalysis(id, ids);
    }

    const vols = sim.state.volunteers
      .map((v) => {
        const color = SHIRTS[v.archetypeId] ?? SHIRTS.base;
        const skills = v.skills.length ? v.skills.join(', ') : 'braccia';
        return `<label class="vol ${v.busy ? 'busy' : ''}"><input type="checkbox" data-vol="${v.id}" ${this.team.has(v.id) ? 'checked' : ''} ${v.busy ? 'disabled' : ''}>
          <i style="background:${color}"></i><span>${esc(v.name)} <small>${esc(sim.archetype(v.archetypeId).name)} · ${esc(skills)}</small></span>
          <small class="hours">${v.busy ? 'impegnato' : `${formatHours(sim.hoursLeft(v))} libere`}</small></label>`;
      })
      .join('');

    const p = preview;
    let line = '';
    if (kind === 'sidequest') {
      line = `Una giornata: <strong>${SIDE_QUEST.hours} h</strong> di sessione e ${SIDE_QUEST.hours} h a testa`;
    } else if (p.hours !== undefined) {
      const cost = 'costEur' in p && p.costEur !== undefined ? ` · spesa <strong>${p.costEur} €</strong>` : '';
      const def = kind === 'lavoro' ? sim.taskDef(id) : null;
      const raise = def?.fundraisingEur && p.quality ? ` · raccolta prevista <strong>${sim.fundraisingYield(def.id, p.quality, ids)} €</strong>` : '';
      line = `Durata <strong>${formatHours(p.hours)}</strong> · qualità <strong>${p.quality}</strong>${cost}${raise}`;
    }
    const errors = p.errors.length ? `<ul class="errors">${p.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
    const label = kind === 'sidequest' ? 'Vai dal dirigente' : 'Avvia';
    return `<div class="card sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <small class="kind">${esc(KIND_LABEL[kind])}</small>
        <h2>${esc(title)}</h2>
        <dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <h3>Chi ci va <small>(${this.team.size} su ${max})</small></h3>
        <div class="vols">${vols}</div>
        ${line ? `<p class="preview">${line}</p>` : ''}
        ${errors}
        <div class="buttons"><button data-act="cancel">Annulla</button><button data-act="start" class="confirm" ${p.errors.length ? 'disabled' : ''}>${label}</button></div>
      </div>`;
  }

  private closeActivity() {
    this.open = null;
    this.team.clear();
  }

  /** Mini-puzzle della richiesta diretta: ogni oggetto nel contenitore giusto. */
  private puzzleCard(): string {
    const sim = this.sim;
    const pz = this.puzzle!;
    const def = sim.praticaDef(pz.praticaId);
    const q = sim.sideQuest(pz.praticaId);
    const allowed = sim.sideQuestAllowedErrors(pz.praticaId, pz.volunteerIds);
    const who = pz.volunteerIds.map((id) => sim.volunteer(id).name).join(', ');
    const rows = pz.order
      .map((i) => {
        const it = q.items[i];
        const bins = q.bins.map((b) => `<button class="bin ${pz.answers[i] === b.id ? 'on' : ''}" data-item="${i}" data-bin="${b.id}">${esc(b.name)}</button>`).join('');
        return `<li><strong>${esc(it.name)}</strong><div class="bins">${bins}</div></li>`;
      })
      .join('');
    const done = Object.keys(pz.answers).length === q.items.length;
    return `<div class="card sheet puzzle" role="dialog" aria-modal="true">
        <small class="kind">Richiesta diretta · ${esc(def.office)}</small>
        <h2>${esc(def.name)}</h2>
        <small>Delegazione: ${esc(who)}</small>
        <p>${esc(q.intro)}</p>
        <p><small>Errori ammessi: <strong>${allowed}</strong>. La giornata si consuma comunque: 4 ore di sessione e 4 ore a testa.</small></p>
        <ul>${rows}</ul>
        <div class="buttons"><button data-act="puzzle-cancel">Torna indietro (nessun costo)</button>
        <button data-act="puzzle-submit" class="confirm" ${done ? '' : 'disabled'}>Consegna al dirigente</button></div>
      </div>`;
  }

  /** Fine partita: punteggio voce per voce e pulsante donazioni. */
  private finale(): string {
    const sim = this.sim;
    const f = sim.state.finale;
    if (!f) return '';
    const P = (label: string, v: number, max: number) => `<tr><td>${label}</td><td>${v}</td><td><small>su ${max}</small></td></tr>`;
    return `<div class="card sheet" role="dialog" aria-modal="true">
        <small class="kind">${esc(sim.siteName)}</small>
        <h2>Il parco è inaugurato!</h2>
        <small>Progetto realizzato al ${Math.round(f.progress * 100)}% in ${f.week} ${f.week === 1 ? 'settimana' : 'settimane'}.</small>
        <table class="score">
          ${P('Realizzazione del progetto', f.realizzazione, 400)}
          ${P('Gradimento dei cittadini', f.gradimento, 300)}
          ${P('Qualità dei lavori', f.qualita, 150)}
          ${P('Cassa avanzata', f.cassa, 100)}
          ${P('Rapidità', f.rapidita, 100)}
          <tr class="sum"><td>Totale × difficoltà del terreno (${f.multiplier.toLocaleString('it-IT')})</td><td colspan="2"><strong>${f.total}</strong></td></tr>
        </table>
        ${this.donate()}
        <p><small>Prova un terreno più difficile: vale di più. Oppure un'altra squadra, un altro progetto.</small></p>
        <div class="buttons"><button data-act="new" class="confirm">Nuova partita</button></div>
      </div>`;
  }

  // ---------- fasi preparatorie ----------

  /** Fase 1: schede dei terreni a destra; quello selezionato si vede sulla mappa. */
  private sitesParts(): Partial<Record<Region, string>> {
    const sim = this.sim;
    const cards = sim.sites
      .map((site) => {
        const on = site.id === sim.state.siteId;
        const stars = '★'.repeat(site.difficulty) + '☆'.repeat(5 - site.difficulty);
        const factors = site.factors.map((f) => `<li><span>${esc(f.label)}</span> <strong>${f.hidden ? '?' : esc(f.value)}</strong></li>`).join('');
        const action = on ? `<button data-act="confirm-site" class="confirm">Scegli questo terreno</button>` : `<button data-site="${site.id}">Guarda sulla mappa</button>`;
        return `<article class="card site ${on ? 'on' : ''}">
          <h3>${esc(site.name)}</h3>
          <p><span class="stars" title="Difficoltà ${site.difficulty} su 5">${stars}</span></p>
          <p><small>${esc(site.description)}</small></p>
          <p>Cassa <strong>${site.budget} €</strong> · <strong>${site.pv} PV</strong> · punteggio ×${site.scoreMultiplier.toLocaleString('it-IT')}</p>
          <ul class="factors">${factors}</ul>
          <p><small><em>${esc(site.bonus)}</em></small></p>
          ${action}
        </article>`;
      })
      .join('');
    return {
      top: this.brand('Fase 1 · Scegli il terreno', '<small>Più un terreno è difficile, più cassa e punti volontariato dà, e più vale il punteggio finale. I "?" si scoprono con il sopralluogo.</small>'),
      right: cards,
      bottom: this.donate() + this.controls(),
    };
  }

  /** Fase 2: la squadra a sinistra, chi può unirsi a destra. */
  private teamParts(): Partial<Record<Region, string>> {
    const sim = this.sim;
    const s = sim.state;
    const row = (name: string, archetypeId: string, button: string) => {
      const a = sim.archetype(archetypeId);
      const color = SHIRTS[a.id] ?? SHIRTS.base;
      const skills = a.skills.length ? a.skills.join(', ') : 'braccia';
      return `<li class="cand"><i style="background:${color}"></i>
        <span><strong>${esc(name)}</strong> <small>${esc(a.name)}</small><br><small>${esc(skills)} · ${a.weeklyHours} h/sett · ${a.pvCost} PV</small></span>
        ${button}</li>`;
    };
    const team = s.volunteers.map((v) => row(v.name, v.archetypeId, `<button data-dismiss="${v.id}">Congeda</button>`)).join('');
    const pool = sim.candidates
      .filter((m) => !s.volunteers.some((v) => v.id === m.id))
      .map((m) => {
        const errors = sim.recruitErrors(m.id);
        return row(m.name, m.archetypeId, `<button data-recruit="${m.id}" ${errors.length ? `disabled title="${esc(errors.join('; '))}"` : ''}>Recluta</button>`);
      })
      .join('');
    const problems = sim.teamProblems();
    return {
      top:
        this.brand(`Fase 2 · Componi la squadra · ${esc(sim.siteName)}`, '<small>Gli specialisti costano di più ma lavorano meglio e guidano fino a 2 volontari senza la loro skill. Presidente e segretario/a: uno solo.</small>') +
        `<section class="card money"><p>Punti volontariato <strong>${s.pv} PV</strong></p></section>
        <section class="card day">${problems.length ? `<ul class="errors">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
          <button data-act="confirm-team" class="confirm" ${problems.length ? 'disabled' : ''}>Conferma la squadra</button></section>`,
      left: `<section class="card"><h2>La squadra (${s.volunteers.length})</h2><ul class="cands">${team || '<li><small>Ancora nessuno.</small></li>'}</ul></section>`,
      right: `<section class="card"><h2>Chi può unirsi</h2><ul class="cands">${pool}</ul></section>`,
      bottom: this.controls(),
    };
  }

  /** Fase 4: strumenti dell'editor a sinistra, preventivo, gradimento e controlli a destra. */
  private designParts(): Partial<Record<Region, string>> {
    const sim = this.sim;
    const s = sim.state;
    const sum = sim.designSummary();
    const tools = [
      ...sim.catalog.map((e) => {
        const skill = e.skill ? ` · ${e.skill}` : '';
        return `<button class="tool ${this.editor.tool === e.id ? 'on' : ''}" data-tool="${e.id}">
          <strong>${esc(e.name)}</strong><small>${e.w}×${e.h} · ${sim.orderCost(e.materials)} € · ${e.hours} h${esc(skill)}</small></button>`;
      }),
      `<button class="tool ${this.editor.tool === ERASER ? 'on' : ''}" data-tool="${ERASER}"><strong>Gomma</strong><small>toglie un elemento (anche tasto destro)</small></button>`,
    ].join('');
    const materials = sum.materials.map((m) => `${m.qty} × ${esc(sim.materialName(m.id).toLowerCase())}`).join(', ') || '—';
    const pratiche = sum.pratiche.map((id) => esc(sim.praticaDef(id).name)).join(', ') || '—';
    const problems = sum.problems.length
      ? `<ul class="errors">${sum.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
      : '<p><small>Nessun problema: il progetto si può confermare.</small></p>';
    return {
      top:
        this.brand(`Progettazione del parco · ${esc(sim.siteName)}`, '<small>Scegli un elemento e clicca sul terreno per posarlo. Ogni elemento diventa un lavoro del cantiere.</small>') +
        `<section class="card money"><p>In cassa <strong>${s.budget} €</strong></p><p>Preventivo <strong>${sum.costEur} €</strong></p></section>
        <section class="card day"><button data-act="confirm" class="confirm" ${sum.problems.length ? 'disabled' : ''}>Conferma il progetto e apri il cantiere</button></section>`,
      left: `<section class="card"><h2>Elementi</h2><div class="tools-grid">${tools}</div></section>`,
      right: `<section class="card"><h2>Preventivo</h2>
          <p>Materiali: <strong>${sum.costEur} €</strong> · Lavoro: <strong>${sum.hours} h</strong> complessive, preparazione del terreno compresa</p>
          ${sum.riskTiles > 0 ? `<p class="warn"><small>Costruisci su ${sum.riskTiles} tile a rischio: servono lavori di messa in sicurezza.</small></p>` : ''}
          <p><small>Skill utili: ${esc(sum.skills.join(', ') || '—')}</small></p>
          <p><small>Da ordinare: ${materials}</small></p>
          <p><small>Pratiche: ${pratiche}</small></p>
        </section>
        <section class="card"><h2>Gradimento previsto</h2>
          <div class="bar"><span style="width:${sum.appeal}%"></span></div>
          <small>${sum.appeal} su 100 · conta la varietà più della quantità</small>
        </section>
        <section class="card"><h2>Controlli</h2>${problems}</section>`,
      bottom: this.controls(),
    };
  }

  // ---------- resoconti ----------

  private renderModal(): void {
    const next = this.sim.unseenReports()[0];
    if (!next) {
      this.modal.hidden = true;
      return;
    }
    const queue = this.sim.unseenReports().length;
    const when = new Date(next.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    this.modal.hidden = false;
    setHTML(
      this.modal,
      `<div class="card sheet" role="dialog" aria-modal="true">
      <small>${when}${queue > 1 ? ` · ${queue} resoconti in coda` : ''}</small>
      <h2>${esc(next.title)}</h2>
      <ul>${next.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <button data-ok="${next.id}" class="confirm">Ok</button></div>`,
    );
  }

  // ---------- eventi ----------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.vol) return;
    if (el.checked) this.team.add(el.dataset.vol);
    else this.team.delete(el.dataset.vol);
    this.message = '';
    this.render();
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    // Clic sullo sfondo della modale: si chiude come con Annulla.
    if (target === this.dialog && this.dialog.dataset.kind === 'activity') {
      this.closeActivity();
      this.render();
      return;
    }
    const toggle = target.closest<HTMLButtonElement>('button[data-toggle]');
    if (toggle) {
      const r = toggle.dataset.toggle as 'left' | 'right';
      this.collapsed[r] = !this.collapsed[r];
      this.render();
      return;
    }
    const openBtn = target.closest<HTMLButtonElement>('button[data-open]');
    if (openBtn) {
      // gli id del piano contengono a loro volta ':' (es. prep:bonifica:1)
      const v = openBtn.dataset.open!;
      const cut = v.indexOf(':');
      this.openActivity(v.slice(0, cut) as Kind, v.slice(cut + 1));
      return;
    }
    const pick = target.closest<HTMLButtonElement>('button[data-site], button[data-recruit], button[data-dismiss]');
    if (pick) {
      try {
        if (pick.dataset.site) this.sim.chooseSite(pick.dataset.site);
        else if (pick.dataset.recruit) this.sim.recruit(pick.dataset.recruit);
        else if (pick.dataset.dismiss) this.sim.dismiss(pick.dataset.dismiss);
        this.message = '';
      } catch (err) {
        this.message = (err as Error).message;
      }
      this.actions.onChange();
      this.render();
      return;
    }
    const binBtn = target.closest<HTMLButtonElement>('button[data-bin]');
    if (binBtn && this.puzzle) {
      this.puzzle.answers[Number(binBtn.dataset.item)] = binBtn.dataset.bin!;
      this.render();
      return;
    }
    const toolBtn = target.closest<HTMLButtonElement>('button[data-tool]');
    if (toolBtn) {
      const t = toolBtn.dataset.tool!;
      this.editor.tool = this.editor.tool === t ? null : t;
      this.render();
      return;
    }
    const btn = target.closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    const now = Date.now();
    try {
      switch (btn.dataset.act) {
        case 'start': {
          if (!this.open) return;
          const { kind, id } = this.open;
          const ids = [...this.team];
          if (kind === 'sidequest') {
            const errs = this.sim.previewSideQuest(id, ids).errors;
            if (errs.length) throw new Error(errs.join('; '));
            const n = this.sim.sideQuest(id).items.length;
            this.puzzle = { praticaId: id, volunteerIds: ids, order: shuffle([...Array(n).keys()]), answers: {} };
            this.closeActivity();
            this.message = '';
            this.render();
            return;
          }
          if (kind === 'lavoro') this.sim.startTask(id, ids, now);
          else if (kind === 'ordine') this.sim.startOrder(id, ids, now);
          else if (kind === 'analisi') this.sim.startAnalysis(id, ids, now);
          else this.sim.startRequest(id, ids, now);
          this.closeActivity();
          break;
        }
        case 'cancel':
          this.closeActivity();
          this.render();
          return;
        case 'zoom':
          this.actions.onZoom();
          this.render();
          return;
        case 'close':
          this.sim.closeSession(now);
          break;
        case 'puzzle-cancel':
          this.puzzle = null;
          break;
        case 'puzzle-submit': {
          const pz = this.puzzle!;
          this.puzzle = null;
          const r = this.sim.resolveSideQuest(pz.praticaId, pz.volunteerIds, pz.answers, now);
          const q = this.sim.sideQuest(pz.praticaId);
          const bin = (id: string) => q.bins.find((b) => b.id === id)?.name ?? id;
          this.actions.onChange();
          this.message = r.wrong.length ? `Da rivedere: ${r.wrong.map((i) => `${q.items[i].name} va in ${bin(q.items[i].bin)}`).join('; ')}.` : '';
          this.render();
          return;
        }
        case 'inaugurate':
          if (!askConfirm('Inaugurare il parco adesso? La partita si chiude con il punteggio finale.')) return;
          this.sim.inaugurate(now);
          break;
        case 'confirm-site':
          this.sim.confirmSite();
          break;
        case 'confirm-team':
          this.sim.confirmTeam();
          break;
        case 'confirm':
          if (!askConfirm('Confermare il progetto? Dopo non si potrà più modificare.')) return;
          this.sim.confirmProject(now);
          this.editor.tool = null;
          break;
        case 'notify':
          void Notification.requestPermission();
          break;
        case 'export':
          this.actions.onExport();
          return;
        case 'new':
          if (confirmNewGame()) this.actions.onNewGame();
          return;
      }
      this.message = '';
    } catch (err) {
      this.message = (err as Error).message;
    }
    this.actions.onChange();
    this.render();
  }
}

/** Aggiorna un elemento solo se il contenuto cambia: niente sfarfallii, e lo scorrimento resta dov'è. */
const shown = new WeakMap<HTMLElement, string>();
function setHTML(el: HTMLElement, html: string) {
  if (shown.get(el) === html) return;
  shown.set(el, html);
  el.innerHTML = html;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function confirmNewGame(): boolean {
  return askConfirm('Ricominciare da capo? Il salvataggio attuale verrà cancellato.');
}

function askConfirm(question: string): boolean {
  return globalThis.confirm?.(question) ?? true;
}
