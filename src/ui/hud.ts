import { ASSOCIATION, GAME_TITLE } from '../config';
import { formatHours } from '../core/duration';
import type { Simulation } from '../core/simulation';
import type { PraticaStatus } from '../core/types';
import { ERASER, type EditorTool } from '../game/ParkScene';
import { SHIRTS } from '../game/sprites';

type Kind = 'lavoro' | 'richiesta' | 'ordine';
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
    if (stage !== 'cantiere') {
      if (stage === 'terreno') this.renderSites();
      else if (stage === 'squadra') this.renderTeam();
      else this.renderDesign();
      this.renderModal();
      return;
    }
    const sim = this.sim;
    const s = sim.state;
    const now = Date.now();
    const used = s.sessionUsedH;
    const limit = sim.sessionLimitH;
    const phaseName = s.phase === 'burocratica' ? 'Parte burocratica (infrasettimanale)' : 'Parte operativa (weekend)';

    const active = s.active
      .map((a) => {
        const name =
          a.kind === 'lavoro'
            ? sim.taskDef(a.refId).name
            : a.kind === 'ordine'
              ? `Ordine: materiali per ${sim.taskDef(a.refId).name}`
              : `Richiesta: ${sim.praticaDef(a.refId).name}`;
        const left = Math.max(0, (a.endsAt - now) / s.msPerHour);
        const pct = Math.min(100, ((now - a.startedAt) / (a.endsAt - a.startedAt)) * 100);
        const who = a.volunteerIds.map((id) => sim.volunteer(id).name).join(', ');
        return `<li><strong>${esc(name)}</strong><div class="bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <small>${esc(who)} · mancano ${formatHours(left)}</small></li>`;
      })
      .join('');

    const options = [
      ...sim.availableTasks().map((t) => ({ kind: 'lavoro' as const, id: t.id, label: `${t.name} (${t.hours} h complessive)` })),
      ...(s.phase === 'burocratica'
        ? sim.allPratiche
            .filter((p) => sim.pratica(p.id).status === 'da-avviare')
            .map((p) => ({ kind: 'richiesta' as const, id: p.id, label: `Pratica: ${p.name} (richiesta ${p.requestHours} h)` }))
        : []),
      ...(s.phase === 'burocratica'
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
            : sim.previewRequest(this.selection.id, ids);
      const cost = 'costEur' in p && p.costEur !== undefined ? ` · spesa <strong>${p.costEur} €</strong>` : '';
      preview =
        p.hours !== undefined
          ? `<p class="preview">Durata: <strong>${formatHours(p.hours)}</strong> · qualità <strong>${p.quality}</strong>${cost}</p>`
          : '';
      if (p.errors.length) preview += `<ul class="errors">${p.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      preview += `<button data-act="start" ${p.errors.length ? 'disabled' : ''}>Avvia</button>`;
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

    this.root.innerHTML = `
      <header>
        <h1>${esc(GAME_TITLE)}</h1>
        <p>Settimana ${s.week} · ${phaseName}</p>
        <p>In cassa: <strong>${s.budget} €</strong> · Progetto realizzato: <strong>${Math.round(sim.projectProgress * 100)}%</strong></p>
        <div class="bar session"><span style="width:${((used / limit) * 100).toFixed(1)}%"></span></div>
        <small>Sessione: ${formatHours(used)} su ${limit} h</small>
        <button data-act="close" ${sim.canCloseSession() ? '' : 'disabled'} title="I giorni rimanenti passano comunque e le attese avanzano">
          ${s.phase === 'burocratica' ? 'Chiudi e vai al weekend' : 'Chiudi il weekend'}</button>
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
      <section><h2>Magazzino</h2>${stock}</section>
      <section><h2>Registro delle pratiche</h2><ul class="pratiche">${pratiche}</ul></section>
      ${this.footer()}`;

    this.renderModal();
  }

  private footer(): string {
    return `<footer>
        <a class="donate" href="${ASSOCIATION.donationUrl}" target="_blank" rel="noopener">Sostieni ${esc(ASSOCIATION.name)}</a>
        <small>5x1000: codice fiscale ${ASSOCIATION.taxCode5x1000}</small>
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
        <p>Materiali: <strong>${sum.costEur} €</strong> · Lavoro: <strong>${sum.hours} h</strong> complessive (più la preparazione del terreno)</p>
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
          if (this.selection.kind === 'lavoro') this.sim.startTask(this.selection.id, [...this.team], now);
          else if (this.selection.kind === 'ordine') this.sim.startOrder(this.selection.id, [...this.team], now);
          else this.sim.startRequest(this.selection.id, [...this.team], now);
          this.selection = null;
          this.team.clear();
          break;
        case 'close':
          this.sim.closeSession(now);
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

function confirmNewGame(): boolean {
  return askConfirm('Ricominciare da capo? Il salvataggio attuale verrà cancellato.');
}

function askConfirm(question: string): boolean {
  return globalThis.confirm?.(question) ?? true;
}
