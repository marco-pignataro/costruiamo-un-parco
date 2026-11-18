import { ASSOCIATION, GAME_TITLE, HOURS_PER_WORKING_DAY, INAUGURATION, ORDERS, SIDE_QUEST, SURVEY, VOLUNTEER_NAME_MAX } from '../config';
import { formatHours } from '../core/duration';
import type { Simulation } from '../core/simulation';
import type { ActiveTask, PraticaStatus, Stage, Volunteer } from '../core/types';
import type { Insets } from '../game/camera';
import { ERASER, type EditorTool } from '../game/ParkScene';
import { inUniform, volunteerLook, volunteerPortrait } from '../game/sprites';
import { type Activity, type Kind, activityAvailable, listActivities, walkTarget } from './activities';
import { type Timeline, type WeekCell, buildTimeline, timelineWindow } from './timeline';

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
  perlustrazione: 'Perlustrazione del sopralluogo',
};

const LENS: Record<string, string> = { impianti: 'elettricista / idraulico', verde: 'giardiniere', progetto: 'geometra' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface HudActions {
  onChange: () => void;
  onNewGame: () => void;
  onExport: () => void;
  /** Volontario scelto dalla barra della squadra: la scena lo seleziona anche sulla mappa. */
  onSelectVolunteer: (volunteerId: string) => void;
  /** La HUD occupa questo spazio sui bordi: la scena lascia libera la zona in mezzo. */
  onInsets: (insets: Insets) => void;
}

type Region = 'top' | 'left' | 'right' | 'bottom' | 'center';
type Side = 'left' | 'right';
/** Su mobile: pannello aperto a tutto schermo dalla barra delle schede. */
type Sheet = Side | 'timeline' | 'inventory';

/** Contenuto della HUD per una fase: in fondo alla colonna sinistra cassa e pulsante della fase. */
interface Parts {
  top?: string;
  left?: string;
  leftFoot?: string;
  right?: string;
  /** In fondo alla colonna destra, sempre visibile (comandi della fase). */
  rightFoot?: string;
  /** In basso, al posto della barra della squadra (in progettazione la barra degli arredi). */
  bottom?: string;
  /** Finestra al centro dello schermo, dentro la HUD (in Fase 2 i candidati). */
  center?: string;
  /** Inventario (cassa, magazzino, ordini in arrivo): in fondo a sinistra su desktop, scheda a sé su mobile. */
  inventory?: string;
}

/** Fasi con la barra della squadra in basso. */
const CREW_STAGES: Stage[] = ['squadra', 'sopralluogo', 'cantiere'];

/** Nome delle due colonne in ogni fase: titolo della linguetta su desktop e della scheda su mobile. */
const COLUMN_NAMES: Record<Stage, Partial<Record<Side, string>>> = {
  terreno: { right: 'Terreni' },
  squadra: {},
  sopralluogo: { left: 'Squadra', right: 'Attività' },
  progettazione: { right: 'Preventivo' },
  cantiere: { left: 'Squadra', right: 'Attività' },
  inaugurato: {},
  fallito: {},
};

/** Icone della barra in basso su mobile (20×20, colore del testo). */
const svg = (d: string) => `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS: Record<string, string> = {
  Menu: svg('<path d="M3 5h14M3 10h14M3 15h14"/>'),
  Squadra: svg('<circle cx="7" cy="7" r="2.5"/><circle cx="14" cy="8" r="2"/><path d="M2.5 16c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5M11.5 13c.7-1.2 1.6-1.8 2.5-1.8 1.7 0 3 1.3 3.5 3.8"/>'),
  Attività: svg('<path d="M8 5h9M8 10h9M8 15h9"/><path d="m2.5 5 1.2 1.2L6 4M2.5 10l1.2 1.2L6 9M2.5 15l1.2 1.2L6 14"/>'),
  Arredi: svg('<path d="M3 10h14M4 13.5h12M5 10v6M15 10v6M4 6.5h12v3.5H4z"/>'),
  Preventivo: svg('<rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 6.5h6M7 10h6M7 13.5h3"/>'),
  Inventario: svg('<path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z"/><path d="m3 6.5 7 3.5 7-3.5M10 10v7"/>'),
  Progresso: svg('<rect x="3" y="4" width="14" height="13" rx="1.5"/><path d="M3 8h14M7 2.5v3M13 2.5v3M6.5 11.5h2M11.5 11.5h2M6.5 14.5h2"/>'),
  Terreni: svg('<path d="M10 17.5s5.5-5.2 5.5-9.3A5.5 5.5 0 0 0 4.5 8.2c0 4.1 5.5 9.3 5.5 9.3z"/><circle cx="10" cy="8.2" r="2"/>'),
};

/** Schermo da telefono: barra di schede in basso e pannelli a tutto schermo. Uguale al CSS. */
const MOBILE = '(max-width: 700px)';
const isMobile = () => globalThis.matchMedia?.(MOBILE).matches ?? false;

/**
 * HUD attorno alla scena: ogni blocco è una scheda con un posto fisso su un
 * bordo dello schermo (in alto stato e comandi della giornata, a sinistra la
 * squadra, a destra le attività e i registri, in basso la barra della squadra,
 * in alto a destra il menu). Le attività si avviano da una modale al centro.
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
  /** In progettazione: scheda dell'arredo aperta nella modale centrale. */
  private itemInfo: string | null = null;
  /** Scheda del volontario aperta nella modale centrale. */
  private profile: string | null = null;
  private menuOpen = false;
  /** Su mobile: pannello aperto a tutto schermo. */
  private sheet: Sheet | null = null;
  /** Su desktop: timeline aperta su tutte le settimane (chiusa mostra la precedente, quella in corso e la successiva). */
  private timelineOpen = false;
  /** Al prossimo disegno la timeline va centrata sulla settimana in corso (appena aperta). */
  private centerTimeline = false;
  /** In alto: la scheda del titolo e, accanto, la timeline (aggiornate a parte, così la timeline non perde lo scorrimento). */
  private brandEl!: HTMLElement;
  private timelineEl!: HTMLElement;
  private menuEl!: HTMLElement;
  private wasMobile = isMobile();
  /** Fase e parte della settimana dell'ultimo disegno: quando cambiano si riparte senza niente aperto. */
  private lastPhase = '';
  /** Volontario inquadrato nel riquadro grande in basso a sinistra (di base il presidente). */
  private selected: string | null = null;

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
    this.regions = {
      top: make('header', 'hud-top'),
      left: make('aside', 'hud-left'),
      right: make('aside', 'hud-right'),
      center: make('section', 'hud-center'),
      bottom: make('footer', 'hud-bottom'),
    };
    this.brandEl = document.createElement('div');
    this.brandEl.className = 'top-brand';
    this.timelineEl = document.createElement('div');
    this.timelineEl.className = 'top-timeline';
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'top-menu';
    this.regions.top.append(this.brandEl, this.timelineEl, this.menuEl);
    this.toast = document.createElement('div');
    this.toast.id = 'hud-toast';
    root.append(this.toast);
    for (const el of [root, dialog]) {
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('change', (e) => this.onInput(e));
    }
    modal.addEventListener('click', (e) => this.onModalClick(e));
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
        else if (this.itemInfo) this.itemInfo = null;
        else if (this.editor.moving !== null) this.editor.moving = null;
        else if (this.menuOpen) this.menuOpen = false;
        else if (this.sheet) this.sheet = null;
        else if (this.timelineOpen) this.timelineOpen = false;
        else return;
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

  /** Un volontario scelto sulla mappa finisce nel riquadro grande della barra della squadra. */
  selectVolunteer(volunteerId: string): void {
    if (!this.sim.state.volunteers.some((v) => v.id === volunteerId) || this.selected === volunteerId) return;
    this.selected = volunteerId;
    this.render();
  }

  // ---------- disegno ----------

  render(): void {
    const sim = this.sim;
    const stage = sim.state.stage;
    if (this.open && !activityAvailable(sim, this.open)) this.closeActivity();

    if (this.profile && !sim.state.volunteers.some((v) => v.id === this.profile)) this.profile = null;
    if (stage !== 'progettazione') {
      this.editor.moving = null;
      this.itemInfo = null;
    }
    // A ogni nuova fase, e tra giorni feriali e weekend, non resta aperta nessuna scheda.
    const phaseKey = `${stage}:${sim.state.phase}`;
    if (phaseKey !== this.lastPhase) {
      if (this.lastPhase) {
        this.sheet = null;
        this.menuOpen = false;
        this.timelineOpen = false;
      }
      this.lastPhase = phaseKey;
    }

    let parts: Parts;
    if (stage === 'terreno') parts = this.sitesParts();
    else if (stage === 'squadra') parts = this.teamParts();
    else if (stage === 'progettazione') parts = this.designParts();
    else if (stage === 'inaugurato') parts = { top: this.brand('Il parco è inaugurato!') };
    else if (stage === 'fallito') parts = { top: this.brand('Consegna mancata') };
    else parts = this.playParts();

    const mobile = isMobile();
    const names = COLUMN_NAMES[stage];
    const html: Record<Region, string> = { top: parts.top ?? '', left: '', right: '', bottom: '', center: parts.center ?? '' };
    for (const side of ['left', 'right'] as Side[]) {
      const body = parts[side] ?? '';
      // Su desktop l'inventario sta in fondo alla colonna sinistra; su mobile ha la sua scheda.
      const footHtml = side === 'left' ? (parts.leftFoot ?? '') + (!mobile && parts.inventory ? parts.inventory : '') : (parts.rightFoot ?? '');
      const foot = footHtml ? `<div class="col-foot">${footHtml}</div>` : '';
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
    const timeline = buildTimeline(sim);
    const inventory = mobile ? parts.inventory ?? '' : '';
    if (this.sheet === 'timeline' ? !timeline : this.sheet === 'inventory' ? !inventory : !html[this.sheet ?? 'top']) this.sheet = null;
    if (!timeline) this.timelineOpen = false;
    const tabs = !!html.left || !!html.right || !!timeline || !!inventory;
    const invSheet =
      inventory && this.sheet === 'inventory'
        ? `<section class="inv-sheet"><div class="sheet-head card"><strong>Inventario</strong><button data-sheet="inventory" title="Chiudi">✕</button></div>${inventory}</section>`
        : '';
    html.bottom = (parts.bottom ?? this.crewBar()) + (tabs ? this.controls(names, { left: !!html.left, right: !!html.right }, !!timeline, !!inventory, this.tabInfo(stage, timeline)) : '') + invSheet;
    const root = this.regions.top.parentElement!;
    root.dataset.sheet = mobile && this.sheet ? this.sheet : '';
    root.dataset.tabs = tabs ? '1' : '';
    setHTML(this.brandEl, html.top);
    setHTML(this.timelineEl, timeline ? this.timelineHtml(timeline, mobile) : '');
    setHTML(this.menuEl, this.menu());
    for (const r of ['left', 'right', 'center', 'bottom'] as Region[]) setHTML(this.regions[r], html[r]);
    if (this.centerTimeline) {
      this.centerTimeline = false;
      this.scrollTimelineToNow();
    }
    setHTML(this.toast, this.message ? `<p class="card msg">${esc(this.message)}</p>` : '');

    if (stage === 'inaugurato') this.showDialog(this.finale(), 'finale');
    else if (stage === 'fallito') this.showDialog(this.failure(), 'finale');
    else if (this.puzzle && stage === 'cantiere') this.showDialog(this.puzzleCard(), 'puzzle');
    else if (this.open) this.showDialog(this.activityCard(), 'activity');
    else if (this.profile) this.showDialog(this.profileCard(this.sim.volunteer(this.profile)), 'profile');
    else if (this.itemInfo) this.showDialog(this.itemCard(this.itemInfo), 'item');
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
    // In basso la barra della squadra e, su mobile, la barra delle schede: conta la più alta delle due.
    const lows = [this.regions.bottom.querySelector<HTMLElement>('.crew-bar'), mobile ? this.regions.bottom.querySelector<HTMLElement>('.tabbar') : null]
      .filter((el): el is HTMLElement => !!el)
      .map((el) => el.getBoundingClientRect().top);
    const bottom = lows.length ? { top: Math.min(...lows) } : null;
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

  /** Su mobile, in basso, la barra delle schede: le due colonne, l'inventario e la timeline, ognuna col suo dato in breve. */
  private controls(names: Partial<Record<Side, string>>, has: Record<Side, boolean>, hasTimeline: boolean, hasInventory: boolean, info: Partial<Record<Sheet, string>>): string {
    const tab = (sheet: Sheet, label: string) => {
      const sub = info[sheet] ? `<small class="tab-info">${esc(info[sheet]!)}</small>` : '';
      return `<button class="tab-btn side ${this.sheet === sheet ? 'on' : ''}" data-sheet="${sheet}">${ICONS[label] ?? ''}<span>${esc(label)}</span>${sub}</button>`;
    };
    return `<nav class="tabbar">
        ${has.left ? tab('left', names.left ?? '') : ''}${has.right ? tab('right', names.right ?? '') : ''}
        ${hasInventory ? tab('inventory', 'Inventario') : ''}
        ${hasTimeline ? tab('timeline', 'Progresso') : ''}
      </nav>`;
  }

  /**
   * Sotto ogni scheda della barra su mobile, il dato più importante: PV
   * rimasti, attività in corso su quelle avviabili, cassa, progetto realizzato.
   */
  private tabInfo(stage: Stage, timeline: Timeline | null): Partial<Record<Sheet, string>> {
    const sim = this.sim;
    const s = sim.state;
    const info: Partial<Record<Sheet, string>> = {};
    if (timeline) info.timeline = `${Math.round(timeline.progress * 100)}%`;
    if (stage === 'terreno') info.right = `${sim.sites.length} terreni`;
    else if (stage === 'progettazione') {
      info.right = `${sim.designSummary().costEur} €`;
    } else if (stage === 'sopralluogo' || stage === 'cantiere') {
      info.left = `${s.pv} PV`;
      const doable = this.activities().filter((a) => !a.blockers.length).length;
      info.right = `${s.active.length}/${s.active.length + doable}`;
      if (stage === 'cantiere') info.inventory = `${s.budget} €`;
    }
    return info;
  }

  /** In alto a destra, su tutti gli schermi: il pulsante del menu della partita e il menu aperto. */
  private menu(): string {
    const sheet = this.menuOpen
      ? `<section class="card menu-sheet">
          <div class="sheet-head"><strong>Menu</strong><button data-act="menu" title="Chiudi">✕</button></div>
          <div class="menu-items">
            <button data-act="tutorial-toggle">${this.sim.state.tutorial?.on ? 'Spegni il tutorial' : 'Accendi il tutorial'}</button>
            ${this.sim.hasTutorialStep() ? '<button data-act="tutorial-replay">Rivedi il tutorial di questa fase</button>' : ''}
            <button data-act="notify">Attiva notifiche</button>
            <button data-act="export">Esporta salvataggio</button>
            <button data-act="new">Nuova partita</button>
            <small>Prototipo. Per provare più in fretta: <code>?velocita=60</code> nell'indirizzo e una nuova partita (1 ora = 1 minuto).</small>
          </div>
        </section>`
      : '';
    return `<button class="menu-btn card ${this.menuOpen ? 'on' : ''}" data-act="menu" title="Menu">${ICONS.Menu}<span>Menu</span></button>${sheet}`;
  }

  // ---------- barra della squadra ----------

  /** "Foto" del volontario: lo sprite su un fondo di cielo e prato. */
  private photo(v: Volunteer, scale: number): string {
    return `<span class="photo"><img alt="" src="${volunteerPortrait(volunteerLook(this.sim, v, inUniform(this.sim)), scale)}"></span>`;
  }

  /**
   * In basso: a sinistra il riquadro grande con il volontario scelto (nome,
   * mansione, cosa sta facendo), accanto un riquadro piccolo per ognuno.
   * Su desktop i riquadri che non ci stanno vanno in una fila sopra; su
   * telefono restano in una riga che si scorre col dito.
   */
  private crewBar(): string {
    const sim = this.sim;
    const s = sim.state;
    if (!CREW_STAGES.includes(s.stage) || !s.volunteers.length) return '';
    if (!s.volunteers.some((v) => v.id === this.selected)) this.selected = (s.volunteers.find((v) => v.archetypeId === 'presidente') ?? s.volunteers[0]).id;
    const doing = new Map<string, string>();
    for (const a of s.active) for (const id of a.volunteerIds) doing.set(id, this.activeName(a));
    const v = sim.volunteer(this.selected!);
    const a = sim.archetype(v.archetypeId);
    const what = doing.get(v.id);
    const status =
      s.stage === 'squadra'
        ? `<small>${esc(v.skills.join(', ') || 'braccia')} · ${v.weeklyHours} h/sett</small>`
        : `<small class="doing">${what ? `Al lavoro: ${esc(what)}` : 'Libero'}</small><small>${formatHours(sim.hoursLeft(v))} libere su ${v.weeklyHours} h</small>`;
    const focus = `<section class="card crew-focus ${v.busy ? 'busy' : ''}" data-profile="${v.id}" title="Apri la scheda">
        ${this.photo(v, 7)}
        <div class="crew-info"><strong>${esc(v.name)}</strong><small class="role">${esc(a.name)}</small>${status}</div>
      </section>`;
    const members = s.volunteers
      .map((m) => {
        const busy = doing.has(m.id);
        const dismiss = sim.canDismiss(m.id) ? `<button class="crew-x" data-dismiss="${m.id}" title="Congeda (restituisce i PV)" aria-label="Congeda ${esc(m.name)}">✕</button>` : '';
        return `<li class="card crew-card ${m.id === this.selected ? 'on' : ''} ${busy ? 'busy' : ''}" data-pick="${m.id}" title="${m.id === this.selected ? 'Apri la scheda' : 'Seleziona'}">
          ${this.photo(m, 4)}<strong>${esc(m.name)}</strong><small>${esc(sim.archetype(m.archetypeId).name)}</small>${busy ? '<i class="crew-dot" title="Al lavoro"></i>' : ''}${dismiss}</li>`;
      })
      .join('');
    return `<div class="crew-bar">${focus}<ul class="crew-list">${members}</ul></div>`;
  }

  // ---------- timeline delle settimane ----------

  /**
   * Timeline delle settimane di lavoro fino alla data di consegna. Su desktop
   * è una scheda in alto al centro: chiusa mostra la settimana in corso, la
   * precedente e la successiva; un clic la apre su tutte, da scorrere in
   * orizzontale. Su telefono è una scheda della barra in basso, a tutto
   * schermo e in verticale.
   */
  private timelineHtml(t: Timeline, mobile: boolean): string {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const left = t.total - t.current + 1;
    const title = t.provisional
      ? `Consegna prevista: ${t.total} settimane`
      : t.over
        ? `Cantiere chiuso alla settimana ${t.current} di ${t.total}`
        : `Settimana ${t.current} di ${t.total}`;
    const sub = t.provisional
      ? 'Cambia con il progetto: si fissa quando lo confermi'
      : t.over
        ? `Progetto realizzato ${pct(t.progress)}`
        : left === 1 ? 'Ultima settimana prima della consegna' : `Restano ${left} settimane, questa compresa`;
    const cells = (list: WeekCell[]) => list.map((w) => this.weekCell(w, t)).join('');
    const actions = this.dayActions(t);
    if (mobile) {
      if (this.sheet !== 'timeline') return '';
      return `<section class="tl-sheet">
          <div class="sheet-head card"><strong>Progresso</strong><button data-sheet="timeline" title="Chiudi">✕</button></div>
          <div class="card tl-info"><strong>${esc(title)}</strong><br><small>${esc(sub)}</small><br><small>In ogni settimana: barra lunga i giorni feriali, corta il weekend.</small>${actions}</div>
          <ol class="tl-weeks vertical">${cells(t.weeks)}</ol>
        </section>`;
    }
    const [a, b] = timelineWindow(t.total, Math.max(1, t.current));
    const shown = this.timelineOpen ? t.weeks : t.weeks.filter((w) => w.week >= a && w.week <= b);
    const more = this.timelineOpen
      ? '<span class="tl-toggle">✕ Chiudi</span>'
      : t.total > shown.length
        ? `<span class="tl-toggle">Tutte le ${t.total} ▸</span>`
        : '';
    return `<section class="card timeline ${this.timelineOpen ? 'open' : ''}" ${this.timelineOpen ? '' : 'data-act="timeline" title="Mostra tutte le settimane"'}>
        <div class="tl-head" ${this.timelineOpen ? 'data-act="timeline" title="Chiudi la timeline"' : ''}><span><strong>${esc(title)}</strong> <small>${esc(sub)}</small></span>${more}</div>
        <ol class="tl-weeks">${!this.timelineOpen && a > 1 ? '<li class="tl-gap">…</li>' : ''}${cells(shown)}${!this.timelineOpen && b < t.total ? '<li class="tl-gap">…</li>' : ''}</ol>
        ${actions}
      </section>`;
  }

  /**
   * In cantiere, sotto le settimane: il progetto realizzato e i comandi della
   * giornata (chiudere la parte della settimana, tagliare il nastro).
   */
  private dayActions(t: Timeline): string {
    const sim = this.sim;
    if (sim.state.stage !== 'cantiere' || t.over) return '';
    const pct = Math.round(t.progress * 100);
    const min = Math.round(t.minProgress * 100);
    const label = sim.state.phase === 'burocratica' ? 'Chiudi e vai al weekend' : 'Chiudi il weekend';
    return `<div class="tl-actions">
        <div class="tl-progress" title="Per inaugurare serve almeno il ${min}%"><small>Progetto realizzato <strong>${pct}%</strong> · serve il ${min}%</small>
          <div class="bar"><span style="width:${pct}%"></span><i style="left:${min}%"></i></div></div>
        <button data-act="close" ${sim.canCloseSession() ? '' : 'disabled'} title="I giorni rimanenti passano comunque e le attese avanzano">${label}</button>
        ${this.inaugurateButton()}
      </div>`;
  }

  private weekCell(w: WeekCell, t: Timeline): string {
    const half = (p: 'burocratica' | 'operativa') => {
      const done = w.status === 'passata' || (w.status === 'in-corso' && p === 'burocratica' && w.phase === 'operativa');
      const now = w.status === 'in-corso' && w.phase === p;
      return `<span class="half ${done ? 'done' : ''} ${now ? 'now' : ''}" title="${p === 'burocratica' ? 'Giorni feriali' : 'Weekend'}"></span>`;
    };
    const notes: string[] = [];
    if (w.status === 'in-corso') notes.push(w.phase === 'burocratica' ? 'Ora: giorni feriali' : 'Ora: weekend');
    if (w.progress !== null) notes.push(`Realizzato ${Math.round(w.progress * 100)}%`);
    if (w.deliveries.length) notes.push(`Arrivano i materiali: ${w.deliveries.join(', ')}`);
    if (t.provisional && w.week === 1) notes.push('Pratiche e ordini');
    if (w.deadline) notes.push(`Consegna: serve il ${Math.round(t.minProgress * 100)}%`);
    return `<li class="wk st-${w.status} ${w.deadline ? 'deadline' : ''}" ${w.status === 'in-corso' ? 'aria-current="true"' : ''}>
        <b>Settimana ${w.week}</b>
        <div class="halves">${half('burocratica')}${half('operativa')}</div>
        ${notes.map((n) => `<small>${esc(n)}</small>`).join('')}
      </li>`;
  }

  /** Porta al centro la settimana in corso (o la prima, in progettazione). */
  private scrollTimelineToNow() {
    const list = this.timelineEl.querySelector<HTMLElement>('.tl-weeks');
    const cell = list?.querySelector<HTMLElement>('.wk.st-in-corso') ?? list?.querySelector<HTMLElement>('.wk');
    if (!list || !cell) return;
    if (list.classList.contains('vertical')) {
      const box = list.closest<HTMLElement>('.tl-sheet') ?? list;
      box.scrollTop = cell.offsetTop - (box.clientHeight - cell.offsetHeight) / 2;
    } else {
      list.scrollLeft = cell.offsetLeft - list.offsetLeft - (list.clientWidth - cell.offsetWidth) / 2;
    }
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
          : a.kind === 'perlustrazione'
            ? 'Perlustrazione del terreno'
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

    // In alto: titolo, settimana e parte della settimana, poi la barra della sessione.
    const session = `<div class="bar"><span style="width:${((used / limit) * 100).toFixed(1)}%"></span></div>
      <small>${formatHours(used)} su ${limit} h${s.active.length ? '' : ' · ferma: nessun compito in corso'}</small>`;
    const top = this.brand(`${surveying ? `Fase 3 · ${esc(sim.siteName)}` : `Settimana ${s.week}`} · ${phaseName}`, session);

    // A sinistra: la squadra, con ore e cosa sta facendo; in cantiere in fondo c'è l'inventario.
    // La chiusura del sopralluogo sta in fondo alle attività (in cantiere i comandi della giornata sono nella timeline).
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
    const rightFoot = surveying
      ? `<section class="card day"><button data-act="close" ${sim.canCloseSession() ? '' : 'disabled'} title="I punti non analizzati restano un mistero">Chiudi il sopralluogo</button></section>`
      : '';

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
    const empty = surveying
      ? 'Ancora nessun indizio notato.'
      : 'Niente da avviare adesso.';
    const todo = `<section class="card"><h2>${surveying ? 'Indizi notati' : 'Da fare'}</h2>
      <ul class="acts">${list || `<li><small>${empty}</small></li>`}</ul></section>`;
    let registers = '';
    let inventory: string | undefined;
    if (surveying) {
      const done = sim.pois
        .filter((p) => ['in-analisi', 'analizzato'].includes(sim.poiState(p.id).status))
        .map((p) => {
          const st = sim.poiState(p.id);
          const result = st.status === 'in-analisi' ? 'In analisi…' : st.found ? `<strong class="danger">${esc(sim.hazard(st.found).name)}</strong>` : 'Niente di preoccupante (forse)';
          return `<li><strong>${esc(p.clue)}</strong><br><small>${result}</small></li>`;
        })
        .join('');
      registers = `<section class="card"><h2>Esiti</h2><ul>${done || '<li><small>Ancora nessuna analisi.</small></li>'}</ul>
        <p><small>Clicca un volontario e poi un punto del terreno per mandarlo a perlustrare: chi passa vicino a un indizio lo nota. Le ore non bastano per tutto: scegli dove guardare. Senza lo specialista giusto un'insidia può sfuggire, e si scoprirà in cantiere.</small></p></section>`;
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
      const mats = (list: { id: string; qty: number }[]) => list.map((m) => `${m.qty} × ${esc(sim.materialName(m.id).toLowerCase())}`).join(', ');
      const stock = inStock.length
        ? `<ul>${inStock.map(([id, q]) => `<li>${q} × ${esc(sim.materialName(id).toLowerCase())}</li>`).join('')}</ul>`
        : '<p><small>Vuoto.</small></p>';
      const arriving = incoming.length
        ? `<ul class="orders">${incoming
            .map((o) => {
              const when = o.status === 'in-preparazione' ? 'ordine in compilazione' : `arriva il weekend della settimana ${o.arrivesWeek}`;
              return `<li>${mats(o.materials)}<br><small>per ${esc(sim.taskDef(o.taskId).name)} · ${when}</small></li>`;
            })
            .join('')}</ul>`
        : '<p><small>Nessun ordine in arrivo.</small></p>';
      registers = `<section class="card"><h2>Registro delle pratiche</h2><ul class="pratiche">${pratiche || '<li><small>Nessuna pratica.</small></li>'}</ul></section>`;
      inventory = `<section class="card inventory"><h2>Inventario</h2>
          <p class="cash">In cassa <strong>${s.budget} €</strong></p>
          <h3>In magazzino</h3>${stock}
          <h3>In consegna</h3>${arriving}
        </section>`;
    }

    return { top, left, rightFoot, right: running + todo + registers, inventory };
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
    } else if (kind === 'perlustrazione') {
      const to = walkTarget(id);
      title = 'Perlustra fin qui';
      max = 1;
      rows.push(
        ['Come funziona', 'Il volontario cammina fino al punto scelto guardandosi intorno. Se passa vicino a qualcosa di strano si ferma e ti chiede se approfondire.'],
        ['Passo', `${formatHours(SURVEY.walkHoursPerTile)} per tile, anche in diagonale`],
        ['Volontari', 'uno alla volta'],
      );
      preview = sim.previewWalk(to.x, to.y, ids);
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
    } else if (kind === 'perlustrazione') {
      line = p.hours !== undefined ? `Cammino di <strong>${formatHours(p.hours)}</strong>, se nessuno nota niente prima` : '';
    } else if (p.hours !== undefined) {
      const cost = 'costEur' in p && p.costEur !== undefined ? ` · spesa <strong>${p.costEur} €</strong>` : '';
      const def = kind === 'lavoro' ? sim.taskDef(id) : null;
      const raise = def?.fundraisingEur && p.quality ? ` · raccolta prevista <strong>${sim.fundraisingYield(def.id, p.quality, ids)} €</strong>` : '';
      line = `Durata <strong>${formatHours(p.hours)}</strong> · qualità <strong>${p.quality}</strong>${cost}${raise}`;
    }
    const errors = p.errors.length ? `<ul class="errors">${p.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
    const label = kind === 'sidequest' ? 'Vai dal dirigente' : kind === 'perlustrazione' ? 'Vai' : 'Avvia';
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
          <div class="buttons">${sim.canDismiss(v.id) ? `<button data-dismiss="${v.id}">Congeda</button>` : ''}<button data-act="profile-close" class="confirm">${editable ? 'Fatto' : 'Chiudi'}</button></div>
        </div>
      </div>`;
  }

  /** Scheda dell'arredo scelto: cosa costa, quanto lavoro e cosa serve per costruirlo. */
  private itemCard(id: string): string {
    const sim = this.sim;
    const e = sim.elementDef(id);
    const rows: [string, string][] = [
      ['Ingombro', `${e.w}×${e.h} tile`],
      ['Materiali', `${e.materials.map((m) => `${m.qty} × ${sim.materialName(m.id).toLowerCase()}`).join(', ') || '—'} (${sim.orderCost(e.materials)} €)`],
      ['Lavoro', `${e.hours} h complessive${e.groupable ? ' per tile, i tratti vicini fanno un solo lavoro' : ''}`],
      ['Skill utile', e.skill ?? '—'],
      ['Volontari', `fino a ${e.maxVolunteers}`],
      ['Pratiche', e.pratiche.map((p) => sim.praticaDef(p).name).join(', ') || '—'],
      ['Gradimento', `${e.appeal} punti il primo, le copie valgono via via meno`],
    ];
    if (e.adjacentTo) rows.push(['Va accanto a', sim.elementDef(e.adjacentTo).name.toLowerCase()]);
    return `<div class="card sheet" role="dialog" aria-modal="true" aria-label="${esc(e.name)}">
        <small class="kind">Arredo del parco</small>
        <h2>${esc(e.name)}</h2>
        <dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="buttons"><button data-act="item-drop">Smetti di posarlo</button><button data-act="item-close" class="confirm">Posa sul terreno</button></div>
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

  /** Fine partita persa: la data di consegna è arrivata prima del minimo di progetto. */
  private failure(): string {
    const sim = this.sim;
    const min = Math.round(INAUGURATION.minProgress * 100);
    return `<div class="card sheet" role="dialog" aria-modal="true">
        <small class="kind">${esc(sim.siteName)}</small>
        <h2>Consegna mancata</h2>
        <p>Alla data di consegna, la settimana ${sim.state.deadlineWeek}, il progetto era realizzato al <strong>${Math.round(sim.projectProgress * 100)}%</strong>: per inaugurare ne serviva almeno il ${min}%.</p>
        <p><small>Prova con un progetto più piccolo, una squadra più adatta o un piano più ordinato: pratiche e ordini presto, lavori in fila senza tempi morti.</small></p>
        <div class="buttons"><button data-act="new" class="confirm">Nuova partita</button></div>
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
        // Un clic sulla scheda mostra il terreno sulla mappa; il pulsante lo sceglie.
        return `<article class="card site ${on ? 'on' : ''}" data-site="${site.id}" ${on ? '' : 'title="Guarda sulla mappa"'}>
          <h3>${esc(site.name)}</h3>
          <p><span class="stars" title="Difficoltà ${site.difficulty} su 5">${stars}</span></p>
          <p><small>${esc(site.description)}</small></p>
          <p>Cassa <strong>${site.budget} €</strong> · <strong>${site.pv} PV</strong> · punteggio ×${site.scoreMultiplier.toLocaleString('it-IT')}</p>
          <ul class="factors">${factors}</ul>
          <p><small><em>${esc(site.bonus)}</em></small></p>
          <button data-act="confirm-site" data-choose="${site.id}" class="confirm">Scegli questo terreno</button>
        </article>`;
      })
      .join('');
    return {
      top: this.brand('Fase 1 · Scegli il terreno', '<small>Più un terreno è difficile, più cassa e punti volontariato dà, e più vale il punteggio finale. I "?" si scoprono con il sopralluogo.</small>'),
      right: cards + this.donate(),
    };
  }

  /**
   * Fase 2: al centro la finestra con chi può unirsi, in griglia (foto e dati
   * sotto); chi entra in squadra compare nella barra in basso. Il presidente
   * c'è già e non si congeda.
   */
  private teamParts(): Parts {
    const sim = this.sim;
    const s = sim.state;
    const cards = sim.candidates
      .filter((m) => !s.volunteers.some((v) => v.id === m.id))
      .map((m) => {
        const a = sim.archetype(m.archetypeId);
        const errors = sim.recruitErrors(m.id);
        const skills = a.skills.length ? a.skills.join(', ') : 'braccia';
        const look = volunteerLook(sim, { ...m, skills: [], weeklyHours: 0, hoursUsed: 0, busy: false }, false);
        return `<li class="cand-card ${errors.length ? 'off' : ''}">
            <span class="photo"><img alt="" src="${volunteerPortrait(look, 5)}"></span>
            <strong>${esc(m.name)}</strong>
            <small class="role">${esc(a.name)}</small>
            <small>${esc(skills)}</small>
            <small>${m.age} anni · ${a.weeklyHours} h/sett</small>
            <button data-recruit="${m.id}" class="${errors.length ? '' : 'confirm'}" ${errors.length ? `disabled title="${esc(errors.join('; '))}"` : ''}>Recluta · ${a.pvCost} PV</button>
          </li>`;
      })
      .join('');
    const problems = sim.teamProblems();
    return {
      top: this.brand(`Fase 2 · Componi la squadra · ${esc(sim.siteName)}`),
      center: `<section class="card recruit" aria-label="Chi può unirsi">
          <header class="recruit-head">
            <div><h2>Chi può unirsi</h2><small>Gli specialisti costano di più ma lavorano meglio e guidano fino a 2 volontari senza la loro skill. Segretario/a: uno solo. Clicca un volontario in basso per sceglierne nome e aspetto.</small></div>
            <p class="pv">Punti volontariato<strong>${s.pv} PV</strong></p>
          </header>
          <ul class="cand-grid">${cards || '<li><small>Non c\'è più nessuno da reclutare.</small></li>'}</ul>
          <footer class="recruit-foot">
            ${problems.length ? `<ul class="errors">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<small>In squadra: ${s.volunteers.length}</small>`}
            <button data-act="confirm-team" class="confirm" ${problems.length ? 'disabled' : ''}>Conferma la squadra</button>
          </footer>
        </section>`,
    };
  }

  /** Fase 4: strumenti dell'editor a sinistra, preventivo, gradimento e controlli a destra. */
  private designParts(): Parts {
    const sim = this.sim;
    const s = sim.state;
    const sum = sim.designSummary();
    // In basso la barra degli arredi: nome e prezzo; i dettagli nella scheda (secondo clic).
    const card = (id: string, name: string, sub: string, title: string) =>
      `<li class="card crew-card item-card ${this.editor.tool === id ? 'on' : ''}" data-tool="${id}" title="${esc(title)}"><strong>${esc(name)}</strong><small>${esc(sub)}</small></li>`;
    const items = [
      ...sim.catalog.map((e) => card(e.id, e.name, `${sim.orderCost(e.materials)} €`, this.editor.tool === e.id ? 'Apri la scheda' : 'Scegli e clicca sul terreno')),
      card(ERASER, 'Gomma', 'toglie un arredo', this.editor.tool === ERASER ? 'Smetti di cancellare' : 'Clicca un arredo per toglierlo (anche tasto destro)'),
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
    const chosen = this.editor.tool && this.editor.tool !== ERASER ? sim.elementDef(this.editor.tool).name : null;
    const hint = moving
      ? `<p class="hint">Stai spostando: <strong>${esc(sim.elementDef(moving.elementId).name)}</strong>. Clicca dove posarlo; tasto destro o Esc per annullare.</p>`
      : chosen
        ? `<small>Posi: <strong>${esc(chosen)}</strong>. Clicca sul terreno; un altro clic sulla sua scheda in basso per i dettagli.</small>`
        : this.editor.tool === ERASER
          ? '<small>Gomma: clicca un arredo per toglierlo.</small>'
          : '<small>Scegli un arredo in basso e clicca sul terreno per posarlo; senza arredo scelto, clicca uno già posato per spostarlo.</small>';
    return {
      top: this.brand(`Progettazione del parco · ${esc(sim.siteName)}`, hint),
      bottom: `<div class="crew-bar item-bar"><ul class="crew-list">${items}</ul></div>`,
      rightFoot: `<section class="card money"><p>In cassa <strong>${s.budget} €</strong></p><p>Preventivo <strong>${sum.costEur} €</strong></p></section>
        <section class="card day"><button data-act="confirm" class="confirm" ${sum.problems.length ? 'disabled' : ''}>Conferma il progetto e apri il cantiere</button></section>`,
      right: `<section class="card"><h2>Preventivo</h2>
          <p>Materiali: <strong>${sum.costEur} €</strong> · Lavoro: <strong>${sum.hours} h</strong> complessive, preparazione del terreno compresa</p>
          <p>Consegna: entro <strong>${sum.weeks} settimane</strong> <small>(si fissa alla conferma; servirà almeno il ${Math.round(INAUGURATION.minProgress * 100)}% del progetto)</small></p>
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

  /**
   * Finestra in primo piano, una cosa alla volta: prima i resoconti in coda,
   * poi il benvenuto, poi il pannello del tutorial, infine le domande sugli
   * indizi notati nel sopralluogo.
   */
  private renderModal(): void {
    const sim = this.sim;
    const next = sim.unseenReports()[0];
    const html = next ? '' : sim.needsWelcome ? this.welcomeCard() : sim.tutorialPanel() ? this.tutorialCard() : sim.pendingNotices().length ? this.noticeCard() : '';
    if (!next) {
      this.modal.hidden = html === '';
      if (html) setHTML(this.modal, html);
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

  /** Benvenuto della nuova partita: cos'è il gioco e se si vuole il tutorial. */
  private welcomeCard(): string {
    const w = this.sim.tutorialTexts.welcome;
    const fill = (t: string) => esc(t.replaceAll('{titolo}', GAME_TITLE).replaceAll('{associazione}', ASSOCIATION.name));
    return `<div class="card sheet welcome" role="dialog" aria-modal="true" aria-label="Benvenuto">
      <h2>${esc(GAME_TITLE)}</h2>
      <p>${fill(w.intro)}</p>
      <ul>${w.lines.map((l) => `<li>${fill(l)}</li>`).join('')}</ul>
      <p><strong>${fill(w.question)}</strong></p>
      <small>Puoi cambiare idea quando vuoi dal Menu.</small>
      <div class="buttons"><button data-act="welcome-no">No, gioco da solo</button><button data-act="welcome-yes" class="confirm">Sì, con il tutorial</button></div></div>`;
  }

  private tutorialCard(): string {
    const t = this.sim.tutorialPanel()!;
    return `<div class="card sheet tutorial" role="dialog" aria-modal="true" aria-label="${esc(t.title)}">
      <small class="kind">Tutorial</small>
      <h2>${esc(t.title)}</h2>
      <ul>${t.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="buttons"><button data-act="tutorial-off">Spegni il tutorial</button><button data-act="tutorial-ok" class="confirm">Ho capito</button></div></div>`;
  }

  /** Un volontario ha notato un indizio: approfondire subito o lasciar perdere. */
  private noticeCard(): string {
    const sim = this.sim;
    const { poi, volunteerId } = sim.pendingNotices()[0];
    const v = sim.volunteer(volunteerId);
    return `<div class="card sheet notice" role="dialog" aria-modal="true" aria-label="${esc(poi.clue)}">
      <small class="kind">Sopralluogo · ${esc(v.name)} ha notato qualcosa</small>
      <div class="notice-head">${this.face(v)}<h2>${esc(poi.clue)}</h2></div>
      <p>Approfondire? L'analisi richiede <strong>${poi.hours} h</strong> complessive (fino a ${SURVEY.maxVolunteers} volontari). Senza lo specialista giusto un'insidia può sfuggire.</p>
      <small>Se lasci perdere il punto resta segnato sulla mappa: puoi analizzarlo anche più tardi.</small>
      <div class="buttons"><button data-act="notice-skip" data-poi="${poi.id}">Lascia perdere</button><button data-act="notice-dig" data-poi="${poi.id}" data-vol="${volunteerId}" class="confirm">Approfondisci</button></div></div>`;
  }

  private onModalClick(e: Event) {
    const sim = this.sim;
    const target = e.target as HTMLElement;
    const ok = target.closest<HTMLElement>('[data-ok]');
    const btn = target.closest<HTMLElement>('button[data-act]');
    if (ok) sim.markSeen(Number(ok.dataset.ok));
    else if (!btn) return;
    else {
      switch (btn.dataset.act) {
        case 'welcome-yes':
        case 'welcome-no':
          sim.setTutorial(btn.dataset.act === 'welcome-yes');
          break;
        case 'tutorial-ok':
          sim.dismissTutorial();
          break;
        case 'tutorial-off':
          sim.dismissTutorial();
          sim.setTutorial(false);
          break;
        case 'notice-skip':
          sim.answerNotice(btn.dataset.poi!);
          break;
        case 'notice-dig': {
          sim.answerNotice(btn.dataset.poi!);
          this.actions.onChange();
          this.openActivity('analisi', btn.dataset.poi!, [btn.dataset.vol!]);
          return;
        }
        default:
          return;
      }
    }
    this.actions.onChange();
    this.render();
  }

  // ---------- eventi ----------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (el.dataset.name) {
      this.customize(el.dataset.name, { name: el.value });
      return;
    }
    if (!el.dataset.vol) return;
    // Si perlustra uno alla volta: scegliere un altro volontario sostituisce il primo.
    if (el.checked && this.open?.kind === 'perlustrazione') this.team.clear();
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
    if (target === this.dialog && ['activity', 'profile', 'item'].includes(this.dialog.dataset.kind ?? '')) {
      this.closeActivity();
      this.profile = null;
      this.itemInfo = null;
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
      const side = sheetBtn.dataset.sheet as Sheet;
      this.sheet = this.sheet === side ? null : side;
      this.centerTimeline = this.sheet === 'timeline';
      this.menuOpen = false;
      this.render();
      return;
    }
    const swatch = target.closest<HTMLButtonElement>('button[data-skin], button[data-hair]');
    if (swatch && this.profile) {
      this.customize(this.profile, swatch.dataset.skin ? { skin: swatch.dataset.skin } : { hair: swatch.dataset.hair });
      return;
    }
    // Barra della squadra: un clic seleziona (anche sulla mappa), un secondo clic apre la scheda.
    const member = target.closest<HTMLElement>('[data-pick]');
    if (member && !target.closest('button')) {
      const id = member.dataset.pick!;
      if (this.selected === id) this.openProfile(id);
      else {
        this.selected = id;
        this.actions.onSelectVolunteer(id);
        this.render();
      }
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
    // Scheda di un terreno: un clic lo mostra sulla mappa (il pulsante "Scegli" ha la sua azione).
    const site = target.closest<HTMLElement>('article[data-site]');
    if (site && !target.closest('button')) {
      if (site.dataset.site !== this.sim.state.siteId) {
        this.sim.chooseSite(site.dataset.site!);
        // Su telefono la scheda si chiude, così il terreno si vede sulla mappa.
        if (isMobile()) this.sheet = null;
        this.message = '';
        this.actions.onChange();
        this.render();
      }
      return;
    }
    const pick = target.closest<HTMLButtonElement>('button[data-recruit], button[data-dismiss]');
    if (pick) {
      try {
        if (pick.dataset.recruit) this.sim.recruit(pick.dataset.recruit);
        else if (pick.dataset.dismiss) {
          this.sim.dismiss(pick.dataset.dismiss);
          if (this.profile === pick.dataset.dismiss) this.profile = null;
        }
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
    // Barra degli arredi: un clic sceglie l'arredo da posare, un secondo clic apre la sua scheda (la gomma si toglie).
    const item = target.closest<HTMLElement>('[data-tool]');
    if (item) {
      const t = item.dataset.tool!;
      if (this.editor.tool !== t) this.editor.tool = t;
      else if (t === ERASER) this.editor.tool = null;
      else this.itemInfo = t;
      this.editor.moving = null;
      this.render();
      return;
    }
    // La timeline (scheda chiusa o intestazione di quella aperta) si apre e si chiude con un clic.
    if (target.closest('[data-act="timeline"]') && !target.closest('button, .tl-actions')) {
      this.timelineOpen = !this.timelineOpen;
      this.centerTimeline = this.timelineOpen;
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
          else if (kind === 'perlustrazione') {
            const to = walkTarget(id);
            this.sim.startWalk(to.x, to.y, ids, now);
          }
          else this.sim.startRequest(id, ids, now);
          this.closeActivity();
          break;
        }
        case 'cancel':
          this.closeActivity();
          this.render();
          return;
        case 'menu':
          this.menuOpen = !this.menuOpen;
          this.sheet = null;
          this.render();
          return;
        case 'item-close':
          this.itemInfo = null;
          break;
        case 'item-drop':
          this.itemInfo = null;
          this.editor.tool = null;
          break;
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
          if (btn.dataset.choose && btn.dataset.choose !== this.sim.state.siteId) this.sim.chooseSite(btn.dataset.choose);
          this.sim.confirmSite();
          // Si comincia dal presidente, già in squadra: nome e aspetto, poi gli altri.
          this.selected = this.sim.presidentCandidate.id;
          this.profile = this.selected;
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
        case 'tutorial-toggle':
          this.sim.setTutorial(!this.sim.state.tutorial?.on);
          this.menuOpen = false;
          break;
        case 'tutorial-replay':
          this.sim.replayTutorial();
          this.menuOpen = false;
          break;
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

/**
 * Aggiorna un elemento solo se il contenuto cambia: niente sfarfallii. Quando
 * cambia, chi scorreva (la modale su telefono, una colonna, la timeline) resta
 * dov'era: le posizioni si ritrovano seguendo lo stesso percorso nell'albero.
 */
const shown = new WeakMap<HTMLElement, string>();
function setHTML(el: HTMLElement, html: string) {
  if (shown.get(el) === html) return;
  shown.set(el, html);
  const kept = scrolled(el);
  el.innerHTML = html;
  for (const { path, top, left } of kept) {
    const node = path.reduce<Element | undefined>((n, i) => n?.children[i], el);
    if (!(node instanceof HTMLElement)) continue;
    node.scrollTop = top;
    node.scrollLeft = left;
  }
}

/** Elementi scorsi dentro `root` (radice esclusa), con il percorso per indici dei figli. */
function scrolled(root: Element): { path: number[]; top: number; left: number }[] {
  const out: { path: number[]; top: number; left: number }[] = [];
  const walk = (node: Element, path: number[]) => {
    [...node.children].forEach((child, i) => {
      const p = [...path, i];
      if (child.scrollTop || child.scrollLeft) out.push({ path: p, top: child.scrollTop, left: child.scrollLeft });
      walk(child, p);
    });
  };
  walk(root, []);
  return out;
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
