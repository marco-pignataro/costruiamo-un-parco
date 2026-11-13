import { ASSOCIATION, GAME_TITLE, HOURS_PER_WORKING_DAY, ORDERS, SIDE_QUEST, SURVEY, VOLUNTEER_NAME_MAX } from '../config';
import { formatHours } from '../core/duration';
import type { Simulation } from '../core/simulation';
import type { ActiveTask, PraticaStatus, Stage, Volunteer } from '../core/types';
import type { Insets } from '../game/camera';
import { ERASER, type EditorTool } from '../game/ParkScene';
import { inUniform, volunteerLook, volunteerPortrait } from '../game/sprites';
import { type Activity, type Kind, listActivities } from './activities';

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
type Side = 'left' | 'right';

/** Contenuto della HUD per una fase: in fondo alla colonna sinistra cassa e pulsante della fase. */
interface Parts {
  top?: string;
  left?: string;
  leftFoot?: string;
  right?: string;
}

/** Nome delle due colonne in ogni fase: titolo della linguetta su desktop e della scheda su mobile. */
const COLUMN_NAMES: Record<Stage, Partial<Record<Side, string>>> = {
  terreno: { right: 'Terreni' },
  squadra: { left: 'Squadra', right: 'Candidati' },
  sopralluogo: { left: 'Squadra', right: 'Attività' },
  progettazione: { left: 'Arredi', right: 'Preventivo' },
  cantiere: { left: 'Squadra', right: 'Attività' },
  inaugurato: {},
};

/** Icone della barra in basso su mobile (20×20, colore del testo). */
const svg = (d: string) => `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS: Record<string, string> = {
  Menu: svg('<path d="M3 5h14M3 10h14M3 15h14"/>'),
  Squadra: svg('<circle cx="7" cy="7" r="2.5"/><circle cx="14" cy="8" r="2"/><path d="M2.5 16c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5M11.5 13c.7-1.2 1.6-1.8 2.5-1.8 1.7 0 3 1.3 3.5 3.8"/>'),
  Candidati: svg('<circle cx="8" cy="7" r="2.8"/><path d="M2.5 16.5c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5M15.5 5v5M13 7.5h5"/>'),
  Attività: svg('<path d="M8 5h9M8 10h9M8 15h9"/><path d="m2.5 5 1.2 1.2L6 4M2.5 10l1.2 1.2L6 9M2.5 15l1.2 1.2L6 14"/>'),
  Arredi: svg('<path d="M3 10h14M4 13.5h12M5 10v6M15 10v6M4 6.5h12v3.5H4z"/>'),
  Preventivo: svg('<rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 6.5h6M7 10h6M7 13.5h3"/>'),
  Terreni: svg('<path d="M10 17.5s5.5-5.2 5.5-9.3A5.5 5.5 0 0 0 4.5 8.2c0 4.1 5.5 9.3 5.5 9.3z"/><circle cx="10" cy="8.2" r="2"/>'),
};

/** Schermo da telefono: barra di schede in basso e pannelli a tutto schermo. Uguale al CSS. */
const MOBILE = '(max-width: 700px)';
const isMobile = () => globalThis.matchMedia?.(MOBILE).matches ?? false;

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
  private collapsed: Record<Side, boolean> = { left: false, right: false };
  private lastInsets = '';
  /** Scheda del volontario aperta nella modale centrale. */
  private profile: string | null = null;
  private menuOpen = false;
  /** Su mobile: pannello aperto a tutto schermo. */
  private sheet: Side | null = null;
  private wasMobile = isMobile();

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
    window.addEventListener('resize', () => {
      if (isMobile() !== this.wasMobile) {
        this.wasMobile = isMobile();
        this.sheet = null;
        this.menuOpen = false;
        this.render();
      }
      this.measure();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.open) this.closeActivity();
        else if (this.profile) this.profile = null;
        else if (this.editor.moving !== null) this.editor.moving = null;
        else if (this.menuOpen) this.menuOpen = false;
        else if (this.sheet) this.sheet = null;
        else return;
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
    return listActivities(this.sim);
  }

  /** Apre la modale di un'attività, con dei volontari già scelti (es. cliccati sulla mappa). */
  openActivity(kind: Kind, id: string, volunteerIds: string[] = []): void {
    this.open = { kind, id };
    this.team = new Set(volunteerIds.filter((v) => !this.sim.volunteer(v).busy));
    this.message = '';
    this.sheet = null;
    this.menuOpen = false;
    this.render();
  }

  /** Apre la scheda di un volontario (secondo clic sulla mappa o clic nella squadra). */
  openProfile(volunteerId: string): void {
    if (!this.sim.state.volunteers.some((v) => v.id === volunteerId)) return;
    this.profile = volunteerId;
    this.message = '';
    this.render();
  }

  // ---------- disegno ----------

  render(): void {
    const sim = this.sim;
    const stage = sim.state.stage;
    if (this.open && !this.activities().some((a) => a.kind === this.open!.kind && a.id === this.open!.id)) this.closeActivity();

    if (this.profile && !sim.state.volunteers.some((v) => v.id === this.profile)) this.profile = null;
    if (stage !== 'progettazione') this.editor.moving = null;

    let parts: Parts;
    if (stage === 'terreno') parts = this.sitesParts();
    else if (stage === 'squadra') parts = this.teamParts();
    else if (stage === 'progettazione') parts = this.designParts();
    else if (stage === 'inaugurato') parts = { top: this.brand('Il parco è inaugurato!') };
    else parts = this.playParts();

    const mobile = isMobile();
    const names = COLUMN_NAMES[stage];
    const html: Record<Region, string> = { top: parts.top ?? '', left: '', right: '', bottom: '' };
    for (const side of ['left', 'right'] as Side[]) {
      const body = parts[side] ?? '';
      const foot = side === 'left' && parts.leftFoot ? `<div class="col-foot">${parts.leftFoot}</div>` : '';
      if (!body && !foot) {
        if (this.sheet === side) this.sheet = null;
        continue;
      }
      const label = names[side] ?? '';
      const head = `<div class="sheet-head card"><strong>${esc(label)}</strong><button data-sheet="${side}" title="Chiudi">✕</button></div>`;
      // Su desktop la colonna si richiude; il pulsante della fase in fondo resta sempre visibile.
      const collapsed = !mobile && this.collapsed[side];
      const arrows = side === 'left' ? ['▸', '◂'] : ['◂', '▸'];
      html[side] = collapsed
        ? `<button class="card tab" data-toggle="${side}" title="Mostra">${arrows[0]} ${esc(label)}</button>${foot}`
        : `${head}<button class="card tab hide" data-toggle="${side}" title="Nascondi">${arrows[1]}</button><div class="col-body">${body}</div>${foot}`;
      this.regions[side].classList.toggle('collapsed', collapsed);
    }
    if (!html[this.sheet ?? 'top']) this.sheet = null;
    html.bottom = this.controls(names, { left: !!html.left, right: !!html.right });
    this.regions.top.parentElement!.dataset.sheet = mobile && this.sheet ? this.sheet : '';
    for (const r of ['top', 'left', 'right', 'bottom'] as Region[]) setHTML(this.regions[r], html[r]);
    setHTML(this.toast, this.message ? `<p class="card msg">${esc(this.message)}</p>` : '');

    if (stage === 'inaugurato') this.showDialog(this.finale(), 'finale');
    else if (this.puzzle && stage === 'cantiere') this.showDialog(this.puzzleCard(), 'puzzle');
    else if (this.open) this.showDialog(this.activityCard(), 'activity');
    else if (this.profile) this.showDialog(this.profileCard(this.sim.volunteer(this.profile)), 'profile');
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
    const mobile = isMobile();
    const r = (el: HTMLElement | null) => (el?.childElementCount ? el.getBoundingClientRect() : null);
    const top = r(this.regions.top);
    // Su mobile i pannelli si aprono sopra la mappa e non le tolgono spazio; in basso c'è la barra delle schede.
    const left = mobile ? null : r(this.regions.left);
    const right = mobile ? null : r(this.regions.right);
    const bottom = mobile ? this.regions.bottom.querySelector<HTMLElement>('.tabbar')?.getBoundingClientRect() ?? null : r(this.regions.bottom);
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

  /**
   * In basso: menu della partita a sinistra e zoom a destra. Su mobile la
   * stessa barra diventa una fila di schede (menu e le due colonne) e lo zoom
   * va in alto a destra.
   */
  private controls(names: Partial<Record<Side, string>>, has: Record<Side, boolean>): string {
    const tab = (side: Side) => {
      const label = names[side] ?? '';
      return `<button class="tab-btn side ${this.sheet === side ? 'on' : ''}" data-sheet="${side}">${ICONS[label] ?? ''}<span>${esc(label)}</span></button>`;
    };
    const zoomed = this.actions.isZoomed();
    const menu = this.menuOpen
      ? `<section class="card menu-sheet">
          <div class="sheet-head"><strong>Menu</strong><button data-act="menu" title="Chiudi">✕</button></div>
          <div class="menu-items">
            <button data-act="notify">Attiva notifiche</button>
            <button data-act="export">Esporta salvataggio</button>
            <button data-act="new">Nuova partita</button>
            <small>Prototipo. Per provare più in fretta: <code>?velocita=60</code> nell'indirizzo e una nuova partita (1 ora = 1 minuto).</small>
          </div>
        </section>`
      : '';
    return `<nav class="tabbar">
        <button class="tab-btn menu-btn card ${this.menuOpen ? 'on' : ''}" data-act="menu">${ICONS.Menu}<span>Menu</span></button>
        ${has.left ? tab('left') : ''}${has.right ? tab('right') : ''}
      </nav>
      <button data-act="zoom" class="card zoom" title="Alterna visuale intera e ingrandimento (tasto Z)" aria-label="${zoomed ? 'Visuale intera' : 'Ingrandisci'}">
        <span class="long">${zoomed ? '− Visuale intera' : '+ Ingrandisci'}</span><span class="short">${zoomed ? '−' : '+'}</span></button>
      ${menu}`;
  }

  /** Pulsante donazioni: solo nel menu iniziale (scelta del terreno) e all'inaugurazione, mai durante il gioco. */
  private donate(): string {
    return `<section class="card support">
        <a class="donate" href="${ASSOCIATION.donationUrl}" target="_blank" rel="noopener">Sostieni ${esc(ASSOCIATION.name)}</a>
        <small>Il gioco è gratuito. Se ti piace, aiuta l'associazione che rigenera davvero gli spazi di Messina. 5x1000: codice fiscale <strong>${ASSOCIATION.taxCode5x1000}</strong></small>
      </section>`;
  }

  /** Faccina del volontario: lo stesso sprite della mappa, piccolo. */
  private face(v: Volunteer): string {
    return `<img class="face" alt="" src="${volunteerPortrait(volunteerLook(this.sim, v, inUniform(this.sim)), 2)}">`;
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

  private playParts(): Parts {
    const sim = this.sim;
    const s = sim.state;
    const now = Date.now();
    const surveying = s.stage === 'sopralluogo';
    const phaseName = surveying ? 'Sopralluogo (una giornata)' : s.phase === 'burocratica' ? 'Parte burocratica (infrasettimanale)' : 'Parte operativa (weekend)';
    const used = s.sessionUsedH;
    const limit = sim.sessionLimitH;
    const closeLabel = surveying ? 'Chiudi il sopralluogo' : s.phase === 'burocratica' ? 'Chiudi e vai al weekend' : 'Chiudi il weekend';
    const closeTitle = surveying ? 'I punti non analizzati restano un mistero' : 'I giorni rimanenti passano comunque e le attese avanzano';

    // In alto: titolo, settimana e parte della settimana, poi la barra della sessione.
    const session = `<div class="bar"><span style="width:${((used / limit) * 100).toFixed(1)}%"></span></div>
      <small>${formatHours(used)} su ${limit} h${s.active.length ? '' : ' · ferma: nessun compito in corso'}</small>`;
    const top = this.brand(`${surveying ? `Fase 3 · ${esc(sim.siteName)}` : `Settimana ${s.week}`} · ${phaseName}`, session);

    // A sinistra: la squadra, con ore e cosa sta facendo; in fondo cassa e chiusura della giornata.
    const doing = new Map<string, string>();
    for (const a of s.active) for (const id of a.volunteerIds) doing.set(id, this.activeName(a));
    const vols = s.volunteers
      .map((v) => {
        const what = doing.get(v.id);
        return `<li class="vol ${v.busy ? 'busy' : ''}" data-profile="${v.id}" title="Apri la scheda">${this.face(v)}
          <span><strong>${esc(v.name)}</strong> <small>${esc(sim.archetype(v.archetypeId).name)}</small><br>
          <small>${what ? `Al lavoro: ${esc(what)}` : 'Libero'}</small></span>
          <small class="hours">${formatHours(sim.hoursLeft(v))}<br>su ${v.weeklyHours} h</small></li>`;
      })
      .join('');
    const left = `<section class="card"><h2>Squadra</h2><ul class="vols">${vols}</ul></section>`;
    const leftFoot =
      (surveying
        ? ''
        : `<section class="card money"><p>In cassa <strong>${s.budget} €</strong></p><p>Progetto realizzato <strong>${Math.round(sim.projectProgress * 100)}%</strong></p></section>`) +
      `<section class="card day"><button data-act="close" ${sim.canCloseSession() ? '' : 'disabled'} title="${closeTitle}">${closeLabel}</button>${surveying ? '' : this.inaugurateButton()}</section>`;

    // A destra: prima i compiti in corso, poi cosa si può fare, poi i registri.
    const active = s.active
      .map((a) => {
        const leftH = Math.max(0, (a.endsAt - now) / s.msPerHour);
        const pct = Math.min(100, ((now - a.startedAt) / (a.endsAt - a.startedAt)) * 100);
        const who = a.volunteerIds.map((id) => sim.volunteer(id).name).join(', ');
        return `<li><strong>${esc(this.activeName(a))}</strong><div class="bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <small>${esc(who)} · mancano ${formatHours(leftH)}</small></li>`;
      })
      .join('');
    const running = `<section class="card running"><h2>In corso</h2><ul class="active">${active || '<li><small>Nessun compito in corso: il tempo di sessione è fermo.</small></li>'}</ul></section>`;
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

    return { top, left, leftFoot, right: running + todo + registers };
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
        const skills = v.skills.length ? v.skills.join(', ') : 'braccia';
        return `<label class="vol ${v.busy ? 'busy' : ''}"><input type="checkbox" data-vol="${v.id}" ${this.team.has(v.id) ? 'checked' : ''} ${v.busy ? 'disabled' : ''}>
          ${this.face(v)}<span>${esc(v.name)} <small>${esc(sim.archetype(v.archetypeId).name)} · ${esc(skills)}</small></span>
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

  /**
   * Scheda del volontario: a sinistra lo sprite grande, a destra statistiche e
   * caratteristiche. Nome, pelle e capelli si cambiano solo in Fase 2.
   */
  private profileCard(v: Volunteer): string {
    const sim = this.sim;
    const a = sim.archetype(v.archetypeId);
    const editable = sim.state.stage === 'squadra';
    const look = volunteerLook(sim, v, inUniform(sim));
    const fatigue = sim.fatigue(v);
    const skin = sim.appearance.skin.find((c) => c.id === v.skin);
    const hair = sim.appearance.hair.find((c) => c.id === v.hair);
    const swatches = (kind: 'skin' | 'hair', chosen: string) =>
      `<div class="swatches">${sim.appearance[kind]
        .map((c) => `<button class="swatch ${c.id === chosen ? 'on' : ''}" data-${kind}="${c.id}" title="${esc(c.name)}" aria-label="${esc(c.name)}" style="background:${c.color}"></button>`)
        .join('')}</div>`;
    const traits = editable
      ? `<label class="field"><span>Nome</span><input type="text" data-name="${v.id}" value="${esc(v.name)}" maxlength="${VOLUNTEER_NAME_MAX}" autocomplete="off"></label>
        <div class="field"><span>Colore della pelle</span>${swatches('skin', v.skin)}</div>
        <div class="field"><span>Colore dei capelli</span>${swatches('hair', v.hair)}</div>`
      : `<dl class="facts"><dt>Nome</dt><dd>${esc(v.name)}</dd><dt>Pelle</dt><dd>${esc(skin?.name ?? v.skin)}</dd><dt>Capelli</dt><dd>${esc(hair?.name ?? v.hair)}</dd></dl>
        <p><small>Nome e aspetto si scelgono mentre si compone la squadra.</small></p>`;
    return `<div class="card sheet profile" role="dialog" aria-modal="true" aria-label="${esc(v.name)}">
        <div class="portrait"><img alt="${esc(v.name)}" src="${volunteerPortrait(look, 14)}"></div>
        <div class="info">
          <small class="kind">${esc(a.name)}</small>
          <h2>${esc(v.name)}</h2>
          <h3>Statistiche</h3>
          <dl class="facts">
            <dt>Età</dt><dd>${v.age} anni</dd>
            <dt>Morale</dt><dd><small>non ancora in gioco</small></dd>
            <dt>Stanchezza</dt><dd><div class="bar"><span style="width:${(fatigue * 100).toFixed(0)}%"></span></div><small>${formatHours(v.hoursUsed)} spese su ${v.weeklyHours} h questa settimana</small></dd>
            <dt>Skill</dt><dd>${esc(v.skills.join(', ') || 'braccia')}</dd>
          </dl>
          <h3>Caratteristiche</h3>
          ${traits}
          <div class="buttons"><button data-act="profile-close" class="confirm">Chiudi</button></div>
        </div>
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
  private sitesParts(): Parts {
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
      right: cards + this.donate(),
    };
  }

  /** Fase 2: la squadra a sinistra (un clic apre la scheda, dove si cambia l'aspetto), chi può unirsi a destra. */
  private teamParts(): Parts {
    const sim = this.sim;
    const s = sim.state;
    const row = (name: string, archetypeId: string, face: string, button: string, profile = '') => {
      const a = sim.archetype(archetypeId);
      const skills = a.skills.length ? a.skills.join(', ') : 'braccia';
      return `<li class="cand" ${profile ? `data-profile="${profile}" title="Apri la scheda: nome e aspetto"` : ''}>${face}
        <span><strong>${esc(name)}</strong> <small>${esc(a.name)}</small><br><small>${esc(skills)} · ${a.weeklyHours} h/sett · ${a.pvCost} PV</small></span>
        ${button}</li>`;
    };
    const team = s.volunteers.map((v) => row(v.name, v.archetypeId, this.face(v), `<button data-dismiss="${v.id}">Congeda</button>`, v.id)).join('');
    const pool = sim.candidates
      .filter((m) => !s.volunteers.some((v) => v.id === m.id))
      .map((m) => {
        const errors = sim.recruitErrors(m.id);
        const face = `<img class="face" alt="" src="${volunteerPortrait(volunteerLook(sim, { ...m, skills: [], weeklyHours: 0, hoursUsed: 0, busy: false }, false), 2)}">`;
        return row(m.name, m.archetypeId, face, `<button data-recruit="${m.id}" ${errors.length ? `disabled title="${esc(errors.join('; '))}"` : ''}>Recluta</button>`);
      })
      .join('');
    const problems = sim.teamProblems();
    return {
      top: this.brand(
        `Fase 2 · Componi la squadra · ${esc(sim.siteName)}`,
        '<small>Gli specialisti costano di più ma lavorano meglio e guidano fino a 2 volontari senza la loro skill. Presidente e segretario/a: uno solo. Clicca un volontario per sceglierne nome e aspetto.</small>',
      ),
      left: `<section class="card"><h2>La squadra (${s.volunteers.length})</h2><ul class="cands">${team || '<li><small>Ancora nessuno.</small></li>'}</ul></section>`,
      leftFoot: `<section class="card money"><p>Punti volontariato <strong>${s.pv} PV</strong></p></section>
        <section class="card day">${problems.length ? `<ul class="errors">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
          <button data-act="confirm-team" class="confirm" ${problems.length ? 'disabled' : ''}>Conferma la squadra</button></section>`,
      right: `<section class="card"><h2>Chi può unirsi</h2><ul class="cands">${pool}</ul></section>`,
    };
  }

  /** Fase 4: strumenti dell'editor a sinistra, preventivo, gradimento e controlli a destra. */
  private designParts(): Parts {
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
    const shortfall = sum.shortfallEur > 0
      ? `<p class="warn"><small>Il preventivo supera la cassa di <strong>${sum.shortfallEur} €</strong>: si può confermare lo stesso, ma i fondi mancanti vanno raccolti in cantiere prima di ordinare i materiali.</small></p>`
      : '';
    const problems =
      (sum.problems.length
        ? `<ul class="errors">${sum.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        : '<p><small>Nessun problema: il progetto si può confermare.</small></p>') + shortfall;
    const moving = this.editor.moving !== null ? s.grid.placements.find((p) => p.uid === this.editor.moving) : undefined;
    const hint = moving
      ? `<p class="hint">Stai spostando: <strong>${esc(sim.elementDef(moving.elementId).name)}</strong>. Clicca dove posarlo; tasto destro o Esc per annullare.</p>`
      : '<p><small>Senza strumento scelto, clicca un arredo già posato per spostarlo.</small></p>';
    return {
      top: this.brand(`Progettazione del parco · ${esc(sim.siteName)}`, '<small>Scegli un arredo e clicca sul terreno per posarlo. Ogni arredo diventa un lavoro del cantiere.</small>'),
      left: `<section class="card"><h2>Arredi</h2>${hint}<div class="tools-grid">${tools}</div></section>`,
      leftFoot: `<section class="card money"><p>In cassa <strong>${s.budget} €</strong></p><p>Preventivo <strong>${sum.costEur} €</strong></p></section>
        <section class="card day"><button data-act="confirm" class="confirm" ${sum.problems.length ? 'disabled' : ''}>Conferma il progetto e apri il cantiere</button></section>`,
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
    if (el.dataset.name) {
      this.customize(el.dataset.name, { name: el.value });
      return;
    }
    if (!el.dataset.vol) return;
    if (el.checked) this.team.add(el.dataset.vol);
    else this.team.delete(el.dataset.vol);
    this.message = '';
    this.render();
  }

  /** Nome, pelle o capelli dalla scheda del volontario (Fase 2). */
  private customize(id: string, patch: { name?: string; skin?: string; hair?: string }) {
    try {
      this.sim.customizeVolunteer(id, patch);
      this.message = '';
    } catch (err) {
      this.message = (err as Error).message;
    }
    this.actions.onChange();
    this.render();
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    // Clic sullo sfondo della modale: si chiude come con Annulla.
    if (target === this.dialog && (this.dialog.dataset.kind === 'activity' || this.dialog.dataset.kind === 'profile')) {
      this.closeActivity();
      this.profile = null;
      this.render();
      return;
    }
    const toggle = target.closest<HTMLButtonElement>('button[data-toggle]');
    if (toggle) {
      const r = toggle.dataset.toggle as Side;
      this.collapsed[r] = !this.collapsed[r];
      this.render();
      return;
    }
    const sheetBtn = target.closest<HTMLButtonElement>('button[data-sheet]');
    if (sheetBtn) {
      const side = sheetBtn.dataset.sheet as Side;
      this.sheet = this.sheet === side ? null : side;
      this.menuOpen = false;
      this.render();
      return;
    }
    const swatch = target.closest<HTMLButtonElement>('button[data-skin], button[data-hair]');
    if (swatch && this.profile) {
      this.customize(this.profile, swatch.dataset.skin ? { skin: swatch.dataset.skin } : { hair: swatch.dataset.hair });
      return;
    }
    // Riga di un volontario: apre la sua scheda (ma non se si clicca un suo pulsante).
    const row = target.closest<HTMLElement>('[data-profile]');
    if (row && !target.closest('button')) {
      this.openProfile(row.dataset.profile!);
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
      this.editor.moving = null;
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
        case 'menu':
          this.menuOpen = !this.menuOpen;
          this.sheet = null;
          this.render();
          return;
        case 'profile-close':
          this.profile = null;
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
        case 'confirm': {
          const short = this.sim.designSummary().shortfallEur;
          const extra = short > 0 ? ` Mancano ${short} € rispetto alla cassa: andranno raccolti durante il cantiere.` : '';
          if (!askConfirm(`Confermare il progetto? Dopo non si potrà più modificare.${extra}`)) return;
          this.sim.confirmProject(now);
          this.editor.tool = null;
          this.editor.moving = null;
          break;
        }
        case 'notify':
          void Notification.requestPermission();
          this.menuOpen = false;
          break;
        case 'export':
          this.actions.onExport();
          this.menuOpen = false;
          this.render();
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
