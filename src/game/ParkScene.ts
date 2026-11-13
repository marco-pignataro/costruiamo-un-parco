import * as Phaser from 'phaser';
import type { Simulation } from '../core/simulation';
import { type Activity, type Kind, activityTiles, listActivities } from '../ui/activities';
import { type ActivityRef, type MapHit, type MapSelection, clickMap } from '../ui/mapSelection';
import type { PlanTask, SurfaceId } from '../core/types';
import { IsoCamera, type View } from './camera';
import { LAYER, type Point, type Rect, areaBounds, depthOf, footprintCenter, footprintCorners, gridToWorld, tileCenter, worldToTile } from './iso';
import { SHIRTS, backdrop, createTextures } from './sprites';

/** Tile di contorno attorno al terreno (marciapiede e bordo del parco). */
const MARGIN = 2;
/** Cielo e Stretto sopra il terreno, in pixel del mondo. */
const SKY = 56;
/** Spessore del bordo di terra sotto il terreno, sui due lati davanti. */
const SIDE = 6;
/** Di quanto i piedi di persone e oggetti stanno sotto il centro della tile. */
const FOOT = 3;

/** Tile di base per ogni superficie; rifiuti e alberi aggiungono un oggetto sopra. */
const SURFACE_TEXTURE: Record<SurfaceId, string> = {
  terra: 'terra',
  erba: 'erba',
  'erba-alta': 'erba-alta',
  rifiuti: 'terra',
  cemento: 'cemento',
  'albero-tutelato': 'erba',
};

/** Come si disegna ogni elemento: una tile piatta ripetuta sull'ingombro o uno sprite in piedi al centro. */
const ELEMENT_LOOK: Record<string, { tile?: string; sprite?: string }> = {
  sentiero: { tile: 'ghiaia' },
  aiuola: { tile: 'aiuola' },
  panchina: { sprite: 'panchina' },
  staccionata: { sprite: 'staccionata' },
  cestino: { sprite: 'cestino' },
};

/** Trasparenza degli elementi solo progettati, non ancora costruiti (in cantiere). */
const GHOST_ALPHA = 0.35;

/** Strumento scelto nell'editor: un elemento del catalogo, la gomma o niente. Condiviso con l'HUD. */
export interface EditorTool {
  tool: string | null;
}

export const ERASER = 'gomma';

interface SceneData {
  sim: () => Simulation;
  editor: EditorTool;
  view: View;
  onEdit: () => void;
  /** Punta e clicca: apre la modale centrale dell'attività con dei volontari già scelti. */
  onOpenActivity: (kind: Kind, id: string, volunteerIds: string[]) => void;
}

function layoutKeyOf(sim: Simulation): string {
  return `${sim.state.siteId}|${sim.state.volunteers.map((v) => v.id).join(',')}`;
}

/**
 * Il parco in isometrico. La scena non decide nulla: legge lo stato della
 * simulazione (griglia, progetto, compiti in corso) e lo disegna.
 */
export class ParkScene extends Phaser.Scene {
  private sim!: () => Simulation;
  private ground: Phaser.GameObjects.Image[] = [];
  private trash: Phaser.GameObjects.Image[] = [];
  private risk: Phaser.GameObjects.Image[] = [];
  private poiMarks = new Map<string, Phaser.GameObjects.Image>();
  private elements = new Map<number, Phaser.GameObjects.Image[]>();
  private people = new Map<string, Phaser.GameObjects.Image>();
  private targets = new Map<string, string>();
  private placementsKey = '';
  private editor!: EditorTool;
  private onEdit!: () => void;
  private hover: Phaser.GameObjects.Image[] = [];
  private hoverFrame!: Phaser.GameObjects.Graphics;
  private camera!: IsoCamera;
  /** Scrivania provvisoria per i compiti d'ufficio, finché non c'è la scena della città. */
  private desk: Point = { x: 0, y: 0 };

  // Punta e clicca
  private selection: MapSelection = null;
  /** Attività che stanno sulla mappa, per tile: la prima della lista vince. */
  private activityAt = new Map<number, Activity>();
  private interactKey = '';
  /** Ombra sotto i bordi delle aree con un'attività. */
  private marks!: Phaser.GameObjects.Graphics;
  /** Evidenziazione dell'attività sotto il puntatore o selezionata. */
  private focus!: Phaser.GameObjects.Graphics;
  /** Ombre sotto i volontari e anello di quello selezionato. */
  private shadows!: Phaser.GameObjects.Graphics;
  private hovered: ActivityRef | null = null;
  private label!: HTMLDivElement;

  constructor() {
    super('park');
  }

  private initData!: SceneData;
  /** Terreno e squadra disegnati: se cambiano, la scena si ricrea. */
  private layoutKey = '';

  init(data: SceneData) {
    this.initData = data;
    this.sim = data.sim;
    this.editor = data.editor;
    this.onEdit = data.onEdit;
  }

  create() {
    // Anche dopo un restart: si riparte da zero.
    this.ground = [];
    this.trash = [];
    this.risk = [];
    this.poiMarks.clear();
    this.elements.clear();
    this.people.clear();
    this.targets.clear();
    this.placementsKey = '';
    this.hover = [];
    this.selection = null;
    this.hovered = null;
    this.activityAt.clear();
    this.interactKey = '';
    this.layoutKey = layoutKeyOf(this.sim());
    createTextures(this);

    const g = this.sim().state.grid;
    const area = areaBounds(-MARGIN, -MARGIN, g.width + MARGIN, g.height + MARGIN);
    const world: Rect = { left: area.left - 8, right: area.right + 8, top: area.top - SKY, bottom: area.bottom + SIDE + 12 };
    // Attorno al terreno, la macchia mediterranea.
    this.cameras.main.setBackgroundColor('#5b6b45');

    // Lo Stretto dietro al terreno: il mare finisce poco sotto il vertice in alto del rombo.
    const sideY = area.top + 24;
    // Più largo della scena e con il cielo sopra: a visuale intera lo schermo può essere più grande del terreno.
    const extra = 1200;
    const sea = backdrop(this, Math.ceil(world.right - world.left) + 2 * extra, Math.ceil(sideY - world.top));
    this.add.image(world.left - extra, world.top, sea).setOrigin(0).setDepth(LAYER.ground - 1);
    this.add.rectangle(world.left - extra, world.top, world.right - world.left + 2 * extra, extra, 0xcfeaf6).setOrigin(0, 1).setDepth(LAYER.ground - 1);

    this.drawSides(g.width, g.height);

    // Il contorno: marciapiede scurito fuori dal terreno.
    for (let y = -MARGIN; y < g.height + MARGIN; y++) {
      for (let x = -MARGIN; x < g.width + MARGIN; x++) {
        if (x >= 0 && y >= 0 && x < g.width && y < g.height) continue;
        const c = tileCenter(x, y);
        this.add.image(c.x, c.y, 'marciapiede').setDepth(LAYER.ground).setTint(0x9a9a9a);
      }
    }

    for (let i = 0; i < g.width * g.height; i++) {
      const c = tileCenter(i % g.width, Math.floor(i / g.width));
      this.ground.push(this.add.image(c.x, c.y, 'terra').setDepth(LAYER.ground));
      this.trash.push(this.add.image(c.x, c.y + FOOT, 'rifiuto').setOrigin(0.5, 1).setDepth(depthOf(c.y + FOOT)).setVisible(false));
      this.risk.push(this.add.image(c.x, c.y, 'rombo').setTint(0xe04a3a).setAlpha(0.35).setDepth(LAYER.overlay).setVisible(false));
      if (g.surface[i] === 'albero-tutelato') this.add.image(c.x, c.y + FOOT, 'albero').setOrigin(0.5, 1).setDepth(depthOf(c.y + FOOT));
    }

    for (const p of this.sim().pois) {
      const c = tileCenter(p.x, p.y);
      this.poiMarks.set(p.id, this.add.image(c.x, c.y + FOOT, 'indizio').setOrigin(0.5, 1).setDepth(depthOf(c.y + FOOT) + 0.5).setVisible(false));
    }

    // Scrivania provvisoria sul marciapiede a sinistra.
    const d = tileCenter(-1, Math.floor(g.height / 2));
    this.desk = { x: d.x, y: d.y + FOOT };
    this.add.image(this.desk.x, this.desk.y, 'scrivania').setOrigin(0.5, 1).setDepth(depthOf(this.desk.y));

    this.hoverFrame = this.add.graphics().setDepth(LAYER.ui);
    this.marks = this.add.graphics().setDepth(LAYER.overlay + 0.5);
    this.focus = this.add.graphics().setDepth(LAYER.overlay + 0.6);
    this.shadows = this.add.graphics().setDepth(LAYER.overlay + 0.7);
    this.label = document.createElement('div');
    this.label.className = 'map-label';
    this.label.hidden = true;
    document.body.append(this.label);
    this.events.once('shutdown', () => this.label.remove());
    this.input.mouse?.disableContextMenu();
    this.camera = new IsoCamera(this, world, this.initData.view.insets);
    this.initData.view.camera = this.camera;
    this.events.once('shutdown', () => {
      if (this.initData.view.camera === this.camera) this.initData.view.camera = null;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const stage = this.sim().state.stage;
      if (stage === 'progettazione') this.showHover(p);
      else if (stage === 'cantiere' || stage === 'sopralluogo') this.pointAt(p, over);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.camera.wasDrag()) return;
      const stage = this.sim().state.stage;
      if (stage === 'progettazione') this.edit(p);
      else if ((stage === 'cantiere' || stage === 'sopralluogo') && p.leftButtonReleased()) this.pick(p, over);
    });

    // In attesa: sul marciapiede davanti, a sinistra del terreno.
    this.sim().state.volunteers.forEach((v, i) => {
      const key = SHIRTS[v.archetypeId] ? `volontario-${v.archetypeId}` : 'volontario-base';
      const c = tileCenter(i % g.width, g.height + Math.floor(i / g.width));
      const img = this.add.image(c.x, c.y + FOOT, key).setOrigin(0.5, 1).setDepth(depthOf(c.y + FOOT));
      img.setData('home', { x: img.x, y: img.y });
      img.setData('volunteer', v.id);
      img.setInteractive({ useHandCursor: true });
      this.people.set(v.id, img);
    });

    this.time.addEvent({ delay: 500, loop: true, callback: () => this.sync() });
    this.sync();
  }

  /** Bordo di terra sotto i due lati davanti del rombo: dà spessore al terreno. */
  private drawSides(w: number, h: number) {
    const [, right, bottom, left] = footprintCorners(-MARGIN, -MARGIN, w + 2 * MARGIN, h + 2 * MARGIN);
    const g = this.add.graphics().setDepth(LAYER.ground - 0.5);
    const face = (a: Point, b: Point, color: number) => {
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(b.x, b.y + SIDE);
      g.lineTo(a.x, a.y + SIDE);
      g.closePath();
      g.fillPath();
    };
    face(left, bottom, 0x6b4a2c);
    face(bottom, right, 0x50361f);
  }

  /** Immagini di un elemento posato in (x, y): tile piatte sull'ingombro o uno sprite in piedi al centro. */
  private drawElement(elementId: string, x: number, y: number, preview = false): Phaser.GameObjects.Image[] {
    const def = this.sim().elementDef(elementId);
    const look = ELEMENT_LOOK[elementId] ?? { sprite: 'rifiuto' };
    const imgs: Phaser.GameObjects.Image[] = [];
    if (look.tile) {
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const c = tileCenter(x + dx, y + dy);
          imgs.push(this.add.image(c.x, c.y, look.tile).setDepth(preview ? LAYER.hover : LAYER.flat));
        }
      }
    } else {
      const c = footprintCenter(x, y, def.w, def.h);
      const foot = c.y + FOOT;
      imgs.push(this.add.image(c.x, foot, look.sprite!).setOrigin(0.5, 1).setDepth(depthOf(foot) + (preview ? 0.5 : 0.1)));
    }
    return imgs;
  }

  /** Ridisegna gli elementi del progetto solo quando cambiano. */
  private syncPlacements() {
    const g = this.sim().state.grid;
    const key = g.placements.map((p) => `${p.uid}:${p.elementId}:${p.x},${p.y}`).join('|');
    if (key === this.placementsKey) return;
    this.placementsKey = key;
    for (const imgs of this.elements.values()) imgs.forEach((i) => i.destroy());
    this.elements.clear();
    for (const p of g.placements) this.elements.set(p.uid, this.drawElement(p.elementId, p.x, p.y));
  }

  /** Tile della griglia sotto il puntatore, se c'è. */
  private tileAt(p: Phaser.Input.Pointer): Point | null {
    const g = this.sim().state.grid;
    const t = worldToTile(p.worldX, p.worldY);
    return t.x >= 0 && t.y >= 0 && t.x < g.width && t.y < g.height ? t : null;
  }

  /** Contorno a rombo dell'area x..x+w, y..y+h. */
  private frame(x: number, y: number, w: number, h: number, color: number) {
    const [a, ...rest] = footprintCorners(x, y, w, h);
    const f = this.hoverFrame.clear().lineStyle(1, color, 1);
    f.beginPath();
    f.moveTo(a.x, a.y);
    for (const p of rest) f.lineTo(p.x, p.y);
    f.closePath();
    f.strokePath();
  }

  /** Anteprima dello strumento sotto il puntatore: verde se si può posare, rossa se no. */
  private showHover(p: Phaser.Input.Pointer) {
    this.hover.forEach((i) => i.destroy());
    this.hover = [];
    const sim = this.sim();
    const t = this.tileAt(p);
    const tool = this.editor.tool;
    if (!t || !tool || sim.state.stage !== 'progettazione') {
      this.hoverFrame.clear();
      return;
    }
    if (tool === ERASER) {
      const target = sim.elementAt(t.x, t.y);
      const def = target ? sim.elementDef(target.elementId) : null;
      this.frame(target?.x ?? t.x, target?.y ?? t.y, def?.w ?? 1, def?.h ?? 1, target ? 0xe04a3a : 0xffffff);
      return;
    }
    const def = sim.elementDef(tool);
    const ok = sim.canPlace(tool, t.x, t.y).ok;
    this.hover = this.drawElement(tool, t.x, t.y, true).map((i) => i.setAlpha(0.7).setTint(ok ? 0xb8f5b0 : 0xff8a80));
    this.frame(t.x, t.y, def.w, def.h, ok ? 0xffffff : 0xe04a3a);
  }

  /** Clic: posa lo strumento scelto; gomma o tasto destro tolgono l'elemento. */
  private edit(p: Phaser.Input.Pointer) {
    const sim = this.sim();
    const t = this.tileAt(p);
    if (!t || sim.state.stage !== 'progettazione') return;
    const erase = p.rightButtonReleased() || this.editor.tool === ERASER;
    if (erase) {
      const target = sim.elementAt(t.x, t.y);
      if (target) sim.removeElement(target.uid);
    } else if (this.editor.tool && sim.canPlace(this.editor.tool, t.x, t.y).ok) {
      sim.placeElement(this.editor.tool, t.x, t.y);
    } else {
      return;
    }
    this.syncPlacements();
    this.showHover(p);
    this.onEdit();
  }

  // ---------- punta e clicca ----------

  /** Cosa c'è sotto il puntatore: prima i volontari (stanno sopra), poi le tile con un'attività. */
  private hitAt(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): MapHit {
    const person = over.find((o) => o.getData('volunteer'));
    if (person) return { volunteer: person.getData('volunteer') as string };
    const t = this.tileAt(p);
    const a = t ? this.activityAt.get(t.y * this.sim().state.grid.width + t.x) : undefined;
    return a ? { activity: { kind: a.kind, id: a.id } } : null;
  }

  private pick(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    const r = clickMap(this.selection, this.hitAt(p, over));
    this.selection = r.selection;
    if (r.open) this.initData.onOpenActivity(r.open.activity.kind, r.open.activity.id, r.open.volunteerIds);
    this.drawFocus();
  }

  private pointAt(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    const hit = this.hitAt(p, over);
    const next = hit && 'activity' in hit ? hit.activity : null;
    this.input.setDefaultCursor(hit ? 'pointer' : 'default');
    if (next?.kind === this.hovered?.kind && next?.id === this.hovered?.id) return;
    this.hovered = next;
    this.drawFocus();
  }

  /** Lato del rombo della tile (x, y) verso la tile vicina (dx, dy): due vertici. */
  private edge(x: number, y: number, dx: number, dy: number): [Point, Point] {
    if (dy === -1) return [gridToWorld(x, y), gridToWorld(x + 1, y)];
    if (dx === 1) return [gridToWorld(x + 1, y), gridToWorld(x + 1, y + 1)];
    if (dy === 1) return [gridToWorld(x + 1, y + 1), gridToWorld(x, y + 1)];
    return [gridToWorld(x, y + 1), gridToWorld(x, y)];
  }

  /** Contorno di un insieme di tile: solo i lati che non toccano un'altra tile dell'insieme. */
  private outline(gfx: Phaser.GameObjects.Graphics, tiles: number[], width: number, dy: number) {
    const set = new Set(tiles);
    for (const i of tiles) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [nx, ny] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const n = x + nx >= 0 && x + nx < width ? (y + ny) * width + x + nx : -1;
        if (set.has(n)) continue;
        const [a, b] = this.edge(x, y, nx, ny);
        gfx.lineBetween(a.x, a.y + dy, b.x, b.y + dy);
      }
    }
  }

  /** Ombra leggera sulle aree con un'attività: le distingue dallo sfondo. */
  private drawMarks() {
    const sim = this.sim();
    const w = sim.state.grid.width;
    this.marks.clear();
    const groups = new Map<string, number[]>();
    for (const [tile, a] of this.activityAt) {
      const k = `${a.kind}:${a.id}`;
      groups.set(k, [...(groups.get(k) ?? []), tile]);
    }
    for (const tiles of groups.values()) {
      this.marks.fillStyle(0x000000, 0.1);
      for (const i of tiles) {
        const [a, b, c, d] = footprintCorners(i % w, Math.floor(i / w), 1, 1);
        this.marks.fillPoints([a, b, c, d] as Phaser.Math.Vector2[], true);
      }
      this.marks.lineStyle(2, 0x000000, 0.35);
      this.outline(this.marks, tiles, w, 1);
      this.marks.lineStyle(1, 0xfff6d8, 0.55);
      this.outline(this.marks, tiles, w, 0);
    }
  }

  /** Bordo chiaro attorno all'attività selezionata o sotto il puntatore. */
  private drawFocus() {
    const sim = this.sim();
    this.focus.clear();
    const sel = this.selection && 'activity' in this.selection ? this.selection.activity : null;
    for (const [ref, alpha] of [
      [this.hovered, 0.6],
      [sel, 1],
    ] as [ActivityRef | null, number][]) {
      if (!ref) continue;
      const tiles = activityTiles(sim, ref);
      this.focus.fillStyle(0xffffff, alpha * 0.18);
      for (const i of tiles) {
        const [a, b, c, d] = footprintCorners(i % sim.state.grid.width, Math.floor(i / sim.state.grid.width), 1, 1);
        this.focus.fillPoints([a, b, c, d] as Phaser.Math.Vector2[], true);
      }
      this.focus.lineStyle(2, 0xffffff, alpha);
      this.outline(this.focus, tiles, sim.state.grid.width, 0);
    }
  }

  /** Attività sulla mappa: si ridisegnano le ombre solo quando cambiano. */
  private syncActivities() {
    const sim = this.sim();
    const playing = sim.state.stage === 'cantiere' || sim.state.stage === 'sopralluogo';
    if (!playing && this.selection) this.selection = null;
    const acts = playing ? listActivities(sim) : [];
    const at = new Map<number, Activity>();
    for (const a of acts) for (const t of activityTiles(sim, a)) if (!at.has(t)) at.set(t, a);
    const key = [...at].map(([t, a]) => `${t}=${a.kind}:${a.id}`).join('|');
    if (key === this.interactKey) return;
    this.interactKey = key;
    this.activityAt = at;
    const alive = (r: ActivityRef | null) => r !== null && [...at.values()].some((a) => a.kind === r.kind && a.id === r.id);
    if (this.selection && 'activity' in this.selection && !alive(this.selection.activity)) this.selection = null;
    if (!alive(this.hovered)) this.hovered = null;
    this.drawMarks();
    this.drawFocus();
  }

  /** Ogni fotogramma: ombre dei volontari, anello del selezionato, etichetta sopra la selezione. */
  update() {
    const sim = this.sim();
    this.shadows.clear();
    const selVol = this.selection && 'volunteer' in this.selection ? this.selection.volunteer : null;
    for (const [id, img] of this.people) {
      this.shadows.fillStyle(0x000000, 0.3).fillEllipse(img.x, img.getData('footY') ?? img.y, 10, 4);
      if (id === selVol) this.shadows.lineStyle(1, 0xffffff, 1).strokeEllipse(img.x, img.getData('footY') ?? img.y, 14, 6);
    }
    let text = '';
    let at: Point | null = null;
    if (selVol) {
      const v = sim.volunteer(selVol);
      const img = this.people.get(selVol)!;
      text = `<strong>${escapeHtml(v.name)}</strong> · ${escapeHtml(sim.archetype(v.archetypeId).name)}${v.busy ? ' · al lavoro' : ''}<br><small>Clicca un'attività sulla mappa</small>`;
      at = { x: img.x, y: img.y - img.height - 2 };
    } else if (this.selection && 'activity' in this.selection) {
      const ref = this.selection.activity;
      const a = [...this.activityAt.values()].find((x) => x.kind === ref.kind && x.id === ref.id);
      const tiles = activityTiles(sim, ref);
      if (a && tiles.length) {
        const w = sim.state.grid.width;
        const top = tiles.map((i) => tileCenter(i % w, Math.floor(i / w))).reduce((m, c) => (c.y < m.y ? c : m));
        text = `<strong>${escapeHtml(a.name)}</strong>${a.blockers.length ? `<br><em>${escapeHtml(a.blockers[0])}</em>` : ''}<br><small>Clicca di nuovo per organizzarla</small>`;
        at = { x: top.x, y: top.y - 10 };
      }
    }
    if (!at || this.scene.isPaused()) {
      this.label.hidden = true;
      return;
    }
    const cam = this.cameras.main;
    const sx = (at.x - cam.worldView.x) * cam.zoom;
    const sy = (at.y - cam.worldView.y) * cam.zoom;
    if (this.label.innerHTML !== text) this.label.innerHTML = text;
    this.label.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    this.label.hidden = false;
  }

  private sync() {
    const sim = this.sim();
    if (layoutKeyOf(sim) !== this.layoutKey) {
      this.scene.restart(this.initData);
      return;
    }
    const g = sim.state.grid;
    g.surface.forEach((s, i) => {
      this.ground[i].setTexture(SURFACE_TEXTURE[s]);
      this.trash[i].setVisible(s === 'rifiuti');
      this.risk[i].setVisible(g.risk[i] !== null);
    });
    const surveying = sim.state.stage === 'sopralluogo';
    for (const [id, mark] of this.poiMarks) {
      const st = sim.state.survey.find((x) => x.id === id);
      mark.setVisible(surveying && st !== undefined && !st.found);
      if (st) mark.setTexture(st.status === 'analizzato' ? 'indizio-ok' : 'indizio');
    }
    this.syncPlacements();
    this.syncActivities();
    const built = new Set(g.built);
    const designing = sim.state.stage === 'progettazione';
    if (!designing && (this.hover.length > 0 || this.editor.tool)) {
      this.hover.forEach((i) => i.destroy());
      this.hover = [];
      this.hoverFrame.clear();
    }
    for (const [uid, imgs] of this.elements) imgs.forEach((img) => img.setAlpha(designing || built.has(uid) ? 1 : GHOST_ALPHA));

    // Chi lavora va sulle tile del suo compito; pratiche e compiti d'ufficio alla scrivania.
    const where = new Map<string, Point>();
    for (const a of sim.state.active) {
      const def = a.kind === 'lavoro' ? sim.taskDef(a.refId) : null;
      const poi = a.kind === 'analisi' ? sim.poi(a.refId) : null;
      const tiles = poi ? [poi.y * g.width + poi.x] : def && 'tiles' in def ? (def as PlanTask).tiles : [];
      a.volunteerIds.forEach((id, i) => {
        if (tiles.length > 0) {
          const tile = tiles[i % tiles.length];
          const c = tileCenter(tile % g.width, Math.floor(tile / g.width));
          where.set(id, { x: c.x + (i >= tiles.length ? 6 : 0), y: c.y + FOOT });
        } else {
          where.set(id, { x: this.desk.x - 10 + i * 10, y: this.desk.y + 6 });
        }
      });
    }

    for (const [id, img] of this.people) {
      const home = img.getData('home') as Point;
      const to = where.get(id) ?? home;
      const key = `${to.x},${to.y}`;
      if (this.targets.get(id) === key) continue;
      this.targets.set(id, key);
      this.tweens.killTweensOf(img);
      const dist = Phaser.Math.Distance.Between(img.x, img.y, to.x, to.y);
      this.tweens.add({
        targets: img,
        x: to.x,
        y: to.y,
        duration: Math.max(200, dist * 12),
        onUpdate: () => {
          img.setDepth(depthOf(img.y) + 0.2);
          img.setData('footY', img.y);
        },
        onComplete: () => {
          img.setDepth(depthOf(to.y) + 0.2);
          img.setData('footY', to.y);
          if (where.has(id)) this.tweens.add({ targets: img, y: to.y - 2, duration: 220, yoyo: true, repeat: -1 });
        },
      });
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
