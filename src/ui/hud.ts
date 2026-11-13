import { ASSOCIATION, GAME_TITLE } from '../config';
import { formatHours } from '../core/duration';
import type { Simulation } from '../core/simulation';
import type { PraticaStatus } from '../core/types';
import { ERASER, type EditorTool } from '../game/ParkScene';
import { SHIRTS } from '../game/sprites';

type Kind = 'lavoro' | 'richiesta' | 'ordine' | 'analisi' | 'sidequest';

/** Mini-puzzle aperto: delegazione scelta, ordine di presentazione e risposte date. */
interface Puzzle {
  praticaId: string;
  volunteerIds: string[];
  order: number[];
  answers: Record<number, string>;
}
type Selection = { kind: Kind; id: string } | null;

const STATUS_LABEL: Record<PraticaStatus, string> = {
  'da-avviare': 'Da avviare',
  'in-richiesta': 'In richiesta',
  'in-attesa': 'In attesa di risposta',
  approvata: 'Approvata',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface HudActions {
  onChange: () => void;
  onNewGame: () => void;
  onExport: () => void;
}

/** Pannello di gestione in HTML accanto al canvas di gioco. */
export class Hud {
  private selection: Selection = null;
  private team = new Set<string>();
  private message = '';
  private puzzle: Puzzle | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly modal: HTMLElement,
    private readonly getSim: () => Simulation,
    private readonly actions: HudActions,
    private readonly editor: EditorTool,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onInput(e));
    modal.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ok]');
      if (!btn) return;
      this.getSim().markSeen(Number(btn.dataset.ok));
      this.actions.onChange();
      this.render();
    });
    document.title = GAME_TITLE;
  }

  private get sim() {
    return this.getSim();
  }

  render(): void {
    // Non ridisegnare mentre il giocatore sta usando il menu a tendina.
    if (this.root.contains(document.activeElement) && document.activeElement?.tagName === 'SELECT') {
      this.renderModal();
      return;
    }
    const stage = this.sim.state.stage;
    if (stage === 'cantiere' && this.puzzle) {
      this.renderPuzzle();
      this.renderModal();
      return;
    }
    if (stage !== 'cantiere' && stage !== 'sopralluogo') {
      if (stage === 'terreno') this.renderSites();
      else if (stage === 'squadra') this.renderTeam();
      else if (stage === 'inaugurato') this.renderFinale();
      else this.renderDesign();
      this.renderModal();
      return;
    }
    const sim = this.sim;
    const s = sim.state;
    const now = Date.now();
    const used = s.sessionUsedH;
    const limit = sim.sessionLimitH;
    const surveying = stage === 'sopralluogo';
    const phaseName = surveying
      ? 'Sopralluogo (una giornata)'
      : s.phase === 'burocratica'
        ? 'Parte burocratica (infrasettimanale)'
        : 'Parte operativa (weekend)';

    const active = s.active
      .map((a) => {
        const name =
          a.kind === 'lavoro'
            ? sim.taskDef(a.refId).name
            : a.kind === 'ordine'
              ? `Ordine: materiali per ${sim.taskDef(a.refId).name}`
              : a.kind === 'analisi'
                ? `Analisi: ${sim.poi(a.refId).clue}`
                : `Richiesta: ${sim.praticaDef(a.refId).name}`;
        const left = Math.max(0, (a.endsAt - now) / s.msPerHour);
        const pct = Math.min(100, ((now - a.startedAt) / (a.endsAt - a.startedAt)) * 100);
        const who = a.volunteerIds.map((id) => sim.volunteer(id).name).join(', ');
        return `<li><strong>${esc(name)}</strong><div class="bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <small>${esc(who)} · mancano ${formatHours(left)}</small></li>`;
      })
      .join('');

    const options = [
      ...(surveying
        ? sim.pois
            .filter((p) => sim.poiState(p.id).status === 'da-analizzare')
            .map((p) => ({ kind: 'analisi' as const, id: p.id, label: `${p.clue} (${p.hours} h complessive)` }))
        : []),
      ...sim.availableTasks().map((t) => ({ kind: 'lavoro' as const, id: t.id, label: `${t.name} (${t.hours} h complessive)` })),
      ...(!surveying && s.phase === 'burocratica'
        ? sim.allPratiche
            .filter((p) => sim.pratica(p.id).status === 'da-avviare')
            .map((p) =>
              sim.isSideQuest(p.id)
                ? { kind: 'sidequest' as const, id: p.id, label: `Richiesta diretta: ${p.name} (una giornata, mini-puzzle)` }
                : { kind: 'richiesta' as const, id: p.id, label: `Pratica: ${p.name} (richiesta ${p.requestHours} h)` },
            )
        : []),
      ...(!surveying && s.phase === 'burocratica'
        ? sim.orderableTasks().map((t) => ({
            kind: 'ordine' as const,
            id: t.id,
            label: `Ordine: materiali per ${t.name} (${sim.orderCost(sim.missingMaterials(t))} €)`,
          }))
        : []),
    ];
    if (this.selection && !options.some((o) => o.kind === this.selection!.kind && o.id === this.selection!.id)) {
      this.selection = null;
      this.team.clear();
    }

    const volunteers = s.volunteers
      .map((v) => {
        const checked = this.team.has(v.id) ? 'checked' : '';
        const disabled = v.busy ? 'disabled' : '';
        const color = SHIRTS[v.archetypeId] ?? SHIRTS.base;
        const arche = v.archetypeId;
        return `<label class="vol ${v.busy ? 'busy' : ''}"><input type="checkbox" data-vol="${v.id}" ${checked} ${disabled} ${this.selection ? '' : 'disabled'}>
          <i style="background:${color}"></i><span>${esc(v.name)} <small>${esc(arche)}</small></span>
          <small class="hours">${formatHours(sim.hoursLeft(v))} / ${v.weeklyHours} h</small></label>`;
      })
      .join('');

    let preview = '';
    if (this.selection) {
      const ids = [...this.team];
      const p =
        this.selection.kind === 'lavoro'
          ? sim.previewTask(this.selection.id, ids)
          : this.selection.kind === 'ordine'
            ? sim.previewOrder(this.selection.id, ids)
            : this.selection.kind === 'analisi'
              ? sim.previewAnalysis(this.selection.id, ids)
              : this.selection.kind === 'sidequest'
                ? sim.previewSideQuest(this.selection.id, ids)
                : sim.previewRequest(this.selection.id, ids);
      const cost = 'costEur' in p && p.costEur !== undefined ? ` · spesa <strong>${p.costEur} €</strong>` : '';
      const def = this.selection.kind === 'lavoro' ? sim.taskDef(this.selection.id) : null;
      const raise = def?.fundraisingEur && p.quality ? ` · raccolta prevista <strong>${sim.fundraisingYield(def.id, p.quality, ids)} €</strong>` : '';
      if (this.selection.kind === 'sidequest') {
        const allowed = ids.length ? sim.sideQuestAllowedErrors(this.selection.id, ids) : sim.sideQuest(this.selection.id).allowedErrors;
        preview = `<p class="preview">Una giornata: <strong>4 h</strong> di sessione e 4 h a testa · errori ammessi <strong>${allowed}</strong> (uno in più con il presidente)</p>`;
      } else {
        preview =
          p.hours !== undefined
            ? `<p class="preview">Durata: <strong>${formatHours(p.hours)}</strong> · qualità <strong>${p.quality}</strong>${cost}${raise}</p>`
            : '';
      }
      if (p.errors.length) preview += `<ul class="errors">${p.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      const label = this.selection.kind === 'sidequest' ? 'Vai dal dirigente' : 'Avvia';
      preview += `<button data-act="start" ${p.errors.length ? 'disabled' : ''}>${label}</button>`;
    }

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
      (inStock.length
        ? `<ul>${inStock.map(([id, q]) => `<li>${q} × ${esc(sim.materialName(id).toLowerCase())}</li>`).join('')}</ul>`
        : '<p><small>Vuoto.</small></p>') +
      (incoming.length
        ? `<ul class="orders">${incoming
            .map((o) => {
              const when = o.status === 'in-preparazione' ? 'ordine in preparazione' : `arriva il weekend della settimana ${o.arrivesWeek}`;
              return `<li><small>${esc(sim.taskDef(o.taskId).name)}: ${when}</small></li>`;
            })
            .join('')}</ul>`
        : '');

    const LENS: Record<string, string> = { impianti: 'elettricista / idraulico', verde: 'giardiniere', progetto: 'geometra' };
    const pois = surveying
      ? sim.pois
          .map((p) => {
            const st = sim.poiState(p.id);
            const lens = sim.poiLens(p.id);
            const hint = lens ? ` · più sicuro con: ${LENS[lens] ?? lens}` : '';
            const result =
              st.status === 'da-analizzare'
                ? `Da analizzare · ${p.hours} h${hint}`
                : st.status === 'in-analisi'
                  ? 'In analisi…'
                  : st.found
                    ? `<strong class="danger">${esc(sim.hazard(st.found).name)}</strong>`
                    : 'Niente di preoccupante (forse)';
            return `<li><strong>${esc(p.clue)}</strong><br><small>${result}</small></li>`;
          })
          .join('')
      : '';
    const bottom = surveying
      ? `<section><h2>Punti sospetti</h2><ul>${pois}</ul>
          <p><small>Le ore non bastano per tutto: scegli dove guardare. Senza lo specialista giusto un'insidia può sfuggire, e si scoprirà in cantiere.</small></p></section>`
      : `<section><h2>Magazzino</h2>${stock}</section>
      <section><h2>Registro delle pratiche</h2><ul class="pratiche">${pratiche}</ul></section>`;
    const closeLabel = surveying ? 'Chiudi il sopralluogo' : s.phase === 'burocratica' ? 'Chiudi e vai al weekend' : 'Chiudi il weekend';
    const closeTitle = surveying ? 'I punti non analizzati restano un mistero' : 'I giorni rimanenti passano comunque e le attese avanzano';

    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>${surveying ? `Fase 3 · ${esc(sim.siteName)}` : `Settimana ${s.week}`} · ${phaseName}</p>
        ${surveying ? '' : `<p>In cassa: <strong>${s.budget} €</strong> · Progetto realizzato: <strong>${Math.round(sim.projectProgress * 100)}%</strong></p>`}
        <div class="bar session"><span style="width:${((used / limit) * 100).toFixed(1)}%"></span></div>
        <small>Sessione: ${formatHours(used)} su ${limit} h</small>
        <button data-act="close" ${sim.canCloseSession() ? '' : 'disabled'} title="${closeTitle}">${closeLabel}</button>
        ${surveying ? '' : this.inaugurateButton()}
      </header>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <section><h2>Assegna un compito</h2>
        <select data-input="sel">
          <option value="">— scegli —</option>
          ${options.map((o) => `<option value="${o.kind}:${o.id}" ${this.selection?.kind === o.kind && this.selection.id === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
        <div class="vols">${volunteers}</div>
        ${preview}
      </section>
      <section><h2>In corso</h2><ul class="active">${active || '<li><small>Nessun compito in corso: il tempo di sessione è fermo.</small></li>'}</ul></section>
      ${bottom}
      ${this.footer()}`;

    this.renderModal();
  }

  /** Pulsante donazioni: solo nel menu iniziale (scelta del terreno) e all'inaugurazione, mai durante il gioco. */
  private donate(): string {
    return `<section class="support">
        <a class="donate" href="${ASSOCIATION.donationUrl}" target="_blank" rel="noopener">Sostieni ${esc(ASSOCIATION.name)}</a>
        <small>Il gioco è gratuito. Se ti piace, aiuta l'associazione che rigenera davvero gli spazi di Messina. 5x1000: codice fiscale <strong>${ASSOCIATION.taxCode5x1000}</strong></small>
      </section>`;
  }

  private inaugurateButton(): string {
    const problems = this.sim.inaugurationProblems();
    return `<button data-act="inaugurate" class="ribbon" ${problems.length ? `disabled title="${esc(problems.join('; '))}"` : ''}>Taglia il nastro: inaugura il parco</button>`;
  }

  /** Mini-puzzle della richiesta diretta: ogni oggetto nel contenitore giusto. */
  private renderPuzzle(): void {
    const sim = this.sim;
    const pz = this.puzzle!;
    const def = sim.praticaDef(pz.praticaId);
    const q = sim.sideQuest(pz.praticaId);
    const allowed = sim.sideQuestAllowedErrors(pz.praticaId, pz.volunteerIds);
    const who = pz.volunteerIds.map((id) => sim.volunteer(id).name).join(', ');
    const rows = pz.order
      .map((i) => {
        const it = q.items[i];
        const bins = q.bins
          .map((b) => `<button class="bin ${pz.answers[i] === b.id ? 'on' : ''}" data-item="${i}" data-bin="${b.id}">${esc(b.name)}</button>`)
          .join('');
        return `<li><strong>${esc(it.name)}</strong><div class="bins">${bins}</div></li>`;
      })
      .join('');
    const done = Object.keys(pz.answers).length === q.items.length;
    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>Richiesta diretta · ${esc(def.office)}</p>
        <small>${esc(def.name)} · delegazione: ${esc(who)}</small>
      </header>
      <section class="puzzle">
        <p>${esc(q.intro)}</p>
        <p><small>Errori ammessi: <strong>${allowed}</strong>. La giornata si consuma comunque: 4 ore di sessione e 4 ore a testa.</small></p>
        <ul>${rows}</ul>
        <button data-act="puzzle-submit" class="confirm" ${done ? '' : 'disabled'}>Consegna al dirigente</button>
        <button data-act="puzzle-cancel">Torna indietro (nessun costo)</button>
      </section>`;
  }

  /** Fine partita: punteggio voce per voce e pulsante donazioni. */
  private renderFinale(): void {
    const sim = this.sim;
    const f = sim.state.finale;
    if (!f) return;
    const P = (label: string, v: number, max: number) => `<tr><td>${label}</td><td>${v}</td><td><small>su ${max}</small></td></tr>`;
    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>Il parco è inaugurato! · ${esc(sim.siteName)}</p>
        <small>Progetto realizzato al ${Math.round(f.progress * 100)}% in ${f.week} ${f.week === 1 ? 'settimana' : 'settimane'}.</small>
      </header>
      <section><h2>Punteggio</h2>
        <table class="score">
          ${P('Realizzazione del progetto', f.realizzazione, 400)}
          ${P('Gradimento dei cittadini', f.gradimento, 300)}
          ${P('Qualità dei lavori', f.qualita, 150)}
          ${P('Cassa avanzata', f.cassa, 100)}
          ${P('Rapidità', f.rapidita, 100)}
          <tr class="sum"><td>Totale × difficoltà del terreno (${f.multiplier.toLocaleString('it-IT')})</td><td colspan="2"><strong>${f.total}</strong></td></tr>
        </table>
      </section>
      ${this.donate()}
      <section><p><small>Prova un terreno più difficile: vale di più. Oppure un'altra squadra, un altro progetto.</small></p></section>
      ${this.footer()}`;
  }

  private footer(): string {
    return `<footer>
        <div class="tools">
          <button data-act="notify">Attiva notifiche</button>
          <button data-act="export">Esporta salvataggio</button>
          <button data-act="new">Nuova partita</button>
        </div>
        <small>Prototipo. Per provare più in fretta: aggiungi <code>?velocita=60</code> all'indirizzo e avvia una nuova partita (1 ora = 1 minuto).</small>
      </footer>`;
  }

  /** Fase 1: schede dei terreni; quello selezionato si vede sulla mappa. */
  private renderSites(): void {
    const sim = this.sim;
    const cards = sim.sites
      .map((site) => {
        const on = site.id === sim.state.siteId;
        const stars = '★'.repeat(site.difficulty) + '☆'.repeat(5 - site.difficulty);
        const factors = site.factors
          .map((f) => `<li><span>${esc(f.label)}</span> <strong>${f.hidden ? '?' : esc(f.value)}</strong></li>`)
          .join('');
        const action = on
          ? `<button data-act="confirm-site" class="confirm">Scegli questo terreno</button>`
          : `<button data-site="${site.id}">Guarda sulla mappa</button>`;
        return `<article class="site ${on ? 'on' : ''}">
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
    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>Fase 1 · Scegli il terreno</p>
        <small>Più un terreno è difficile, più cassa e punti volontariato dà, e più vale il punteggio finale. I "?" si scoprono con il sopralluogo.</small>
      </header>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <section class="sites">${cards}</section>
      ${this.donate()}
      ${this.footer()}`;
  }

  /** Fase 2: reclutamento con i punti volontariato. */
  private renderTeam(): void {
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
    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>Fase 2 · Componi la squadra · ${esc(sim.siteName)}</p>
        <p>Punti volontariato da spendere: <strong>${s.pv} PV</strong></p>
        <small>Gli specialisti costano di più ma lavorano meglio e guidano fino a 2 volontari senza la loro skill. Presidente e segretario/a: uno solo.</small>
      </header>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <section><h2>La squadra (${s.volunteers.length})</h2><ul class="cands">${team || '<li><small>Ancora nessuno.</small></li>'}</ul></section>
      <section><h2>Chi può unirsi</h2><ul class="cands">${pool}</ul></section>
      <section>${problems.length ? `<ul class="errors">${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <button data-act="confirm-team" class="confirm" ${problems.length ? 'disabled' : ''}>Conferma la squadra e progetta il parco</button>
      </section>
      ${this.footer()}`;
  }

  /** Fase 4: strumenti dell'editor, preventivo live, gradimento previsto e conferma. */
  private renderDesign(): void {
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

    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>Progettazione del parco · ${esc(sim.siteName)}</p>
        <p>In cassa: <strong>${s.budget} €</strong></p>
        <small>Scegli un elemento e clicca sul terreno per posarlo. Ogni elemento diventa un lavoro del cantiere.</small>
      </header>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <section><h2>Elementi</h2><div class="tools-grid">${tools}</div></section>
      <section><h2>Preventivo</h2>
        <p>Materiali: <strong>${sum.costEur} €</strong> · Lavoro: <strong>${sum.hours} h</strong> complessive, preparazione del terreno compresa</p>
        ${sum.riskTiles > 0 ? `<p class="warn"><small>Costruisci su ${sum.riskTiles} tile a rischio: servono lavori di messa in sicurezza.</small></p>` : ''}
        <p><small>Skill utili: ${esc(sum.skills.join(', ') || '—')}</small></p>
        <p><small>Da ordinare: ${materials}</small></p>
        <p><small>Pratiche: ${pratiche}</small></p>
      </section>
      <section><h2>Gradimento previsto</h2>
        <div class="bar"><span style="width:${sum.appeal}%"></span></div>
        <small>${sum.appeal} su 100 · conta la varietà più della quantità</small>
      </section>
      <section><h2>Controlli</h2>${problems}
        <button data-act="confirm" class="confirm" ${sum.problems.length ? 'disabled' : ''}>Conferma il progetto e apri il cantiere</button>
      </section>
      ${this.footer()}`;
  }

  private renderModal(): void {
    const next = this.sim.unseenReports()[0];
    if (!next) {
      this.modal.hidden = true;
      return;
    }
    const queue = this.sim.unseenReports().length;
    const when = new Date(next.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    this.modal.hidden = false;
    this.modal.innerHTML = `<div class="card" role="dialog" aria-modal="true">
      <small>${when}${queue > 1 ? ` · ${queue} resoconti in coda` : ''}</small>
      <h2>${esc(next.title)}</h2>
      <ul>${next.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <button data-ok="${next.id}">Ok</button></div>`;
  }

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (el.dataset.input === 'sel') {
      // gli id del piano contengono a loro volta ':' (es. prep:bonifica:1)
      const cut = el.value.indexOf(':');
      const kind = el.value.slice(0, cut);
      const id = el.value.slice(cut + 1);
      this.selection = el.value ? { kind: kind as Kind, id } : null;
      this.team.clear();
    } else if (el.dataset.vol) {
      if (el.checked) this.team.add(el.dataset.vol);
      else this.team.delete(el.dataset.vol);
    }
    this.message = '';
    this.render();
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
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
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    const now = Date.now();
    try {
      switch (btn.dataset.act) {
        case 'start':
          if (!this.selection) return;
          if (this.selection.kind === 'sidequest') {
            const ids = [...this.team];
            const errs = this.sim.previewSideQuest(this.selection.id, ids).errors;
            if (errs.length) throw new Error(errs.join('; '));
            const n = this.sim.sideQuest(this.selection.id).items.length;
            this.puzzle = { praticaId: this.selection.id, volunteerIds: ids, order: shuffle([...Array(n).keys()]), answers: {} };
            this.selection = null;
            this.team.clear();
            this.message = '';
            this.render();
            return;
          }
          if (this.selection.kind === 'lavoro') this.sim.startTask(this.selection.id, [...this.team], now);
          else if (this.selection.kind === 'ordine') this.sim.startOrder(this.selection.id, [...this.team], now);
          else if (this.selection.kind === 'analisi') this.sim.startAnalysis(this.selection.id, [...this.team], now);
          else this.sim.startRequest(this.selection.id, [...this.team], now);
          this.selection = null;
          this.team.clear();
          break;
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
          this.message = r.wrong.length
            ? `Da rivedere: ${r.wrong.map((i) => `${q.items[i].name} va in ${bin(q.items[i].bin)}`).join('; ')}.`
            : '';
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
