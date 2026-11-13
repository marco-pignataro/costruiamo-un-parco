import * as Phaser from 'phaser';
import { type Tile, buildingAt, cityHeight, cityWidth, findPath, sede, spotsAround } from '../core/city';
import type { Simulation } from '../core/simulation';
import type { CityBuilding } from '../core/types';
import { type Activity, type Kind, activeBuilding, activityBuilding, listActivities } from '../ui/activities';
import { type MapHit, type MapSelection, chooseActivity, clickMap } from '../ui/mapSelection';
import { IsoCamera, type View } from './camera';
import { LAYER, type Point, type Rect, areaBounds, blockDepth, blockOutline, depthOf, footprintCorners, insidePolygon, tileCenter, worldToTile } from './iso';
import { MapLabel, drawPeopleShadows, selectionLabel } from './mapUi';
import { backdrop, createTextures, volunteerLook, volunteerTexture } from './sprites';

/** Cielo e Stretto sopra la città, in pixel del mondo (c'è anche il campanile). */
const SKY = 110;
const FOOT = 3;
/** Velocità a piedi, in pixel del mondo al secondo: è solo animazione, il tempo di gioco non c'entra. */
const WALK_SPEED = 70;

const GROUND: Record<string, string> = { '~': 'mare', '=': 'asfalto', '.': 'marciapiede', p: 'lastricato', ',': 'erba' };

/** Colori e altezza di ogni tipo di edificio (muro a sinistra, muro a destra, tetto). */
const LOOKS: Record<string, { left: number; right: number; roof: number; height: number; band?: number }> = {
  sede: { left: 0xf1ece0, right: 0xd6cfbd, roof: 0x2e9e5b, height: 26, band: 0x2e9e5b },
  fornitore: { left: 0xdcab62, right: 0xbb8a45, roof: 0x8b5a2b, height: 20, band: 0x8b5a2b },
  ufficio: { left: 0xd4ccbb, right: 0xb2a996, roof: 0x8d8d8a, height: 36, band: 0x3d5a8a },
  'ufficio-verde': { left: 0xc9d5c0, right: 0xa7b39e, roof: 0x8d8d8a, height: 32, band: 0x2f7a2a },
  'palazzo-ocra': { left: 0xe3b66c, right: 0xc4974b, roof: 0xb5523b, height: 30 },
  'palazzo-rosa': { left: 0xe8bcaa, right: 0xc99c8b, roof: 0xb5523b, height: 38 },
  duomo: { left: 0xf2e8d0, right: 0xd8cbad, roof: 0xb5523b, height: 40 },
  campanile: { left: 0xf2e8d0, right: 0xd4c6a6, roof: 0x8a8a8a, height: 78 },
};

interface SceneData {
  sim: () => Simulation;
  view: View;
  onOpenActivity: (kind: Kind, id: string, volunteerIds: string[]) => void;
  /** Secondo clic su un volontario: apre la sua scheda. */
  onOpenProfile: (volunteerId: string) => void;
}

interface Person {
  img: Phaser.GameObjects.Image;
  tile: Tile;
  target: string;
}

/** Edificio disegnato: sagoma per i clic, grafica per ombra e contorno. */
interface Drawn {
  def: CityBuilding;
  outline: Point[];
  depth: number;
  /** Ombra leggera sotto gli edifici con un'attività. */
  marks: Phaser.GameObjects.Graphics;
  /** Contorno bianco quando l'edificio è sotto il puntatore o selezionato. */
  focus: Phaser.GameObjects.Graphics;
}

/**
 * La città della parte burocratica: una piccola Messina con la sede, gli
 * uffici e il fornitore. Come il parco, legge lo stato e lo disegna: i
 * volontari camminano fino all'edificio del loro compito e tornano alla sede.
 */
export class CityScene extends Phaser.Scene {
  private initData!: SceneData;
  private camera!: IsoCamera;
  private people = new Map<string, Person>();
  private images = new Map<string, Phaser.GameObjects.Image>();
  private buildings: Drawn[] = [];
  private shadows!: Phaser.GameObjects.Graphics;
  private label!: MapLabel;
  private selection: MapSelection = null;
  private hovered: string | null = null;
  /** Attività per edificio, ricalcolate a ogni sincronizzazione. */
  private byBuilding = new Map<string, Activity[]>();
  private marksKey = '';
  private teamKey = '';

  constructor() {
    super('city');
  }

  private get sim() {
    return this.initData.sim();
  }

  init(data: SceneData) {
    this.initData = data;
  }

  create() {
    this.people.clear();
    this.images.clear();
    this.buildings = [];
    this.selection = null;
    this.hovered = null;
    this.byBuilding.clear();
    this.marksKey = '';
    this.teamKey = this.sim.state.volunteers.map((v) => v.id).join(',');
    createTextures(this);

    const city = this.sim.city;
    const W = cityWidth(city);
    const H = cityHeight(city);
    const area = areaBounds(0, 0, W, H);
    const world: Rect = { left: area.left - 8, right: area.right + 8, top: area.top - SKY, bottom: area.bottom + 12 };
    this.cameras.main.setBackgroundColor('#5b6b45');

    // Lo Stretto e la costa calabra dietro la città; il mare della mappa ci si attacca.
    const extra = 1200;
    const seaBottom = area.top + 40;
    const sea = backdrop(this, Math.ceil(world.right - world.left) + 2 * extra, Math.ceil(seaBottom - world.top));
    this.add.image(world.left - extra, world.top, sea).setOrigin(0).setDepth(LAYER.ground - 1);
    this.add.rectangle(world.left - extra, world.top, world.right - world.left + 2 * extra, extra, 0xcfeaf6).setOrigin(0, 1).setDepth(LAYER.ground - 1);

    // Terreno: mare, strade, marciapiedi, piazza, verde; qualche albero nel verde.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = city.rows[y][x];
        const c = tileCenter(x, y);
        this.add.image(c.x, c.y, GROUND[ch] ?? 'marciapiede').setDepth(LAYER.ground);
        if (ch === ',' && (x + 2 * y) % 3 === 0 && !buildingAt(city, x, y)) {
          this.add.image(c.x, c.y + FOOT, 'albero').setOrigin(0.5, 1).setDepth(depthOf(c.y + FOOT));
        }
      }
    }
    this.drawRoadLines();

    for (const b of city.buildings) this.drawBuilding(b);

    this.shadows = this.add.graphics().setDepth(LAYER.overlay + 0.7);
    this.label = new MapLabel((ref) => this.apply(chooseActivity(this.selection, ref)));
    this.events.once('shutdown', () => this.label.destroy());

    this.camera = new IsoCamera(this, world, this.initData.view.insets);
    this.initData.view.camera = this.camera;
    this.events.once('shutdown', () => {
      if (this.initData.view.camera === this.camera) this.initData.view.camera = null;
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => this.pointAt(p, over));
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.camera.wasDrag() && p.leftButtonReleased()) this.apply(clickMap(this.selection, this.hitAt(p, over)));
    });

    // I volontari compaiono già dove devono essere: il cammino si vede solo a gioco aperto.
    for (const v of this.sim.state.volunteers) {
      const img = this.add.image(0, 0, this.textureOf(v.id, false)).setOrigin(0.5, 1);
      img.setData('volunteer', v.id);
      img.setInteractive({ useHandCursor: true });
      this.images.set(v.id, img);
      const { tile, key: target } = this.targetOf(v.id);
      this.people.set(v.id, { img, tile, target });
      this.place(img, tile);
    }

    this.cameras.main.fadeIn(250);
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.sync() });
    this.sync();
  }

  // ---------- disegno ----------

  /** Mezzeria tratteggiata sulle strade. */
  private drawRoadLines() {
    const city = this.sim.city;
    const g = this.add.graphics().setDepth(LAYER.flat);
    g.fillStyle(0xe8e2cf, 0.8);
    for (let y = 0; y < cityHeight(city); y++) {
      for (let x = 0; x < cityWidth(city); x++) {
        if (city.rows[y][x] !== '=') continue;
        const c = tileCenter(x, y);
        const horizontal = city.rows[y][x - 1] === '=' || city.rows[y][x + 1] === '=';
        const vertical = city.rows[y - 1]?.[x] === '=' || city.rows[y + 1]?.[x] === '=';
        if (horizontal && vertical) continue; // incrocio
        // un trattino lungo la direzione della strada (x: giù a destra, y: giù a sinistra)
        if (horizontal) g.fillRect(c.x - 3, c.y - 1, 4, 1).fillRect(c.x + 1, c.y, 2, 1);
        else g.fillRect(c.x - 1, c.y, 4, 1).fillRect(c.x - 3, c.y - 1, 2, 1);
      }
    }
  }

  private drawBuilding(b: CityBuilding) {
    const depth = blockDepth(b.x, b.y, b.w, b.h);
    const marks = this.add.graphics().setDepth(depth - 0.01);
    const focus = this.add.graphics().setDepth(depth + 0.01);
    if (b.look === 'fontana') {
      this.drawFountain(b, depth);
      this.buildings.push({ def: b, outline: blockOutline(b.x, b.y, b.w, b.h, 16), depth, marks, focus });
      return;
    }
    if (b.look === 'madonnina') {
      this.drawColumn(b, depth);
      this.buildings.push({ def: b, outline: blockOutline(b.x, b.y, b.w, b.h, 50), depth, marks, focus });
      return;
    }
    const look = LOOKS[b.look] ?? LOOKS['palazzo-ocra'];
    const g = this.add.graphics().setDepth(depth);
    const [top, right, bottom, left] = footprintCorners(b.x, b.y, b.w, b.h);
    const H = look.height;
    const up = (p: Point, d = H) => ({ x: p.x, y: p.y - d });
    const quad = (pts: Point[], color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      g.fillPoints(pts as Phaser.Math.Vector2[], true);
    };
    quad([left, bottom, up(bottom), up(left)], look.left);
    quad([bottom, right, up(right), up(bottom)], look.right);
    quad([up(top), up(right), up(bottom), up(left)], look.roof);
    // spigolo e gronda
    g.lineStyle(1, 0x000000, 0.18).lineBetween(bottom.x, bottom.y, bottom.x, bottom.y - H);
    g.lineStyle(1, 0x000000, 0.25).strokePoints([up(left), up(bottom), up(right)] as Phaser.Math.Vector2[], false);

    // finestre su entrambi i muri, piano per piano
    const lerp = (a: Point, c: Point, t: number) => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
    const windows = (a: Point, c: Point, cells: number, color: number) => {
      for (let z = 8; z + 6 < H - 2; z += 10) {
        for (let i = 0; i < cells * 2; i++) {
          const t = (i + 0.35) / (cells * 2);
          const p = lerp(a, c, t);
          const q = lerp(a, c, t + 0.18 / cells);
          quad([up(p, z), up(q, z), up(q, z + 5), up(p, z + 5)], color, 0.85);
        }
      }
    };
    if (b.look !== 'duomo' && b.look !== 'campanile') {
      windows(left, bottom, b.w, 0x4b6584);
      windows(bottom, right, b.h, 0x3c5370);
    }
    // insegna colorata sotto la gronda
    if (look.band !== undefined) {
      quad([up(left, H - 2), up(bottom, H - 2), up(bottom, H - 6), up(left, H - 6)], look.band);
    }
    // ingresso sul muro davanti (verso le y più grandi)
    if (b.door && b.door.y === b.y + b.h) {
      const t = (b.door.x - b.x + 0.5) / b.w;
      const p = lerp(left, bottom, t - 0.12 / b.w);
      const q = lerp(left, bottom, t + 0.12 / b.w);
      quad([p, q, up(q, 11), up(p, 11)], 0x3b2a1e);
    }
    if (b.look === 'duomo') this.decorateDuomo(g, left, bottom, H);
    if (b.look === 'campanile') this.decorateCampanile(g, top, right, bottom, left, H);
    if (b.look === 'sede') {
      // la bandierina dell'associazione
      const pole = up(top, H);
      g.lineStyle(1, 0x5d5a52, 1).lineBetween(pole.x, pole.y, pole.x, pole.y - 12);
      g.fillStyle(0x2e9e5b, 1).fillRect(pole.x + 1, pole.y - 12, 7, 4);
    }
    if (b.look === 'fornitore') {
      // casse e vasi davanti al negozio
      const p = lerp(left, bottom, 0.15);
      g.fillStyle(0x8b5a2b, 1).fillRect(p.x - 2, p.y + 1, 5, 4);
      g.fillStyle(0x2f7a2a, 1).fillRect(p.x + 5, p.y + 3, 3, 3);
    }
    this.buildings.push({ def: b, outline: blockOutline(b.x, b.y, b.w, b.h, H), depth, marks, focus });
  }

  /** Facciata del Duomo: timpano a punta e rosone sul muro davanti. */
  private decorateDuomo(g: Phaser.GameObjects.Graphics, left: Point, bottom: Point, H: number) {
    const mid = { x: (left.x + bottom.x) / 2, y: (left.y + bottom.y) / 2 };
    g.fillStyle(0xf2e8d0, 1).fillTriangle(left.x, left.y - H, bottom.x, bottom.y - H, mid.x, mid.y - H - 14);
    g.lineStyle(1, 0xb5523b, 1).strokeTriangle(left.x, left.y - H, bottom.x, bottom.y - H, mid.x, mid.y - H - 14);
    g.fillStyle(0x6d5a8a, 1).fillCircle(mid.x, mid.y - H + 6, 3);
    g.fillStyle(0x3b2a1e, 1).fillRect(mid.x - 3, mid.y - 12, 6, 12);
    for (const t of [0.2, 0.8]) {
      const p = { x: left.x + (bottom.x - left.x) * t, y: left.y + (bottom.y - left.y) * t };
      g.fillStyle(0x3b2a1e, 0.8).fillRect(p.x - 1, p.y - 10, 3, 8);
    }
  }

  /** Campanile: orologio e cuspide. */
  private decorateCampanile(g: Phaser.GameObjects.Graphics, top: Point, right: Point, bottom: Point, left: Point, H: number) {
    const mid = { x: (left.x + bottom.x) / 2, y: (left.y + bottom.y) / 2 };
    g.fillStyle(0xf4f1e8, 1).fillCircle(mid.x, mid.y - H + 14, 3);
    g.fillStyle(0xc9a227, 1).fillCircle(mid.x, mid.y - H + 14, 1);
    for (const z of [30, 46]) g.fillStyle(0x3b2a1e, 0.8).fillRect(mid.x - 1, mid.y - z, 3, 6);
    const apex = { x: top.x, y: (top.y + bottom.y) / 2 - H - 16 };
    g.fillStyle(0x7d7d7a, 1).fillTriangle(left.x, left.y - H, bottom.x, bottom.y - H, apex.x, apex.y);
    g.fillStyle(0x666663, 1).fillTriangle(bottom.x, bottom.y - H, right.x, right.y - H, apex.x, apex.y);
  }

  /** Fontana di Orione: vasca, acqua e statua al centro. */
  private drawFountain(b: CityBuilding, depth: number) {
    const g = this.add.graphics().setDepth(depth);
    const c = tileCenter(b.x + (b.w - 1) / 2, b.y + (b.h - 1) / 2);
    g.fillStyle(0xbdb6a6, 1).fillEllipse(c.x, c.y + 2, 30, 14);
    g.fillStyle(0x5b9bd5, 1).fillEllipse(c.x, c.y + 1, 24, 10);
    g.fillStyle(0xd8d2c2, 1).fillRect(c.x - 2, c.y - 12, 4, 13);
    g.fillStyle(0xe8e2cf, 1).fillEllipse(c.x, c.y - 6, 10, 4);
    g.fillStyle(0xbdb6a6, 1).fillRect(c.x - 1, c.y - 17, 3, 6);
  }

  /** Madonnina del porto: colonna alta sul molo con la statua dorata. */
  private drawColumn(b: CityBuilding, depth: number) {
    const g = this.add.graphics().setDepth(depth);
    const c = tileCenter(b.x, b.y);
    g.fillStyle(0xbdb6a6, 1).fillRect(c.x - 4, c.y - 6, 8, 6);
    g.fillStyle(0xd8d2c2, 1).fillRect(c.x - 2, c.y - 44, 4, 38);
    g.fillStyle(0xc9a227, 1).fillRect(c.x - 2, c.y - 52, 4, 8);
    g.fillStyle(0xe8c547, 1).fillRect(c.x - 1, c.y - 54, 2, 2);
  }

  /** Ombra e contorno degli edifici con attività; contorno bianco per quello sotto il puntatore o selezionato. */
  private drawMarks() {
    const sel = this.selection?.type === 'luogo' ? this.selection.place : null;
    for (const d of this.buildings) {
      d.marks.clear();
      d.focus.clear();
      if (!this.byBuilding.has(d.def.id)) continue;
      const pts = d.outline as Phaser.Math.Vector2[];
      d.marks.fillStyle(0x000000, 0.28).fillPoints(pts.map((p) => ({ x: p.x + 3, y: p.y + 2 })) as Phaser.Math.Vector2[], true);
      const focus = d.def.id === sel ? 1 : d.def.id === this.hovered ? 0.7 : 0;
      d.focus.lineStyle(focus ? 2 : 1, focus ? 0xffffff : 0xfff6d8, focus || 0.6).strokePoints(pts, true);
    }
  }

  // ---------- punta e clicca ----------

  private hitAt(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): MapHit {
    const person = over.find((o) => o.getData('volunteer'));
    if (person) return { volunteer: person.getData('volunteer') as string };
    // davanti per primo: l'edificio disegnato sopra vince
    const hit = [...this.buildings].sort((a, b) => b.depth - a.depth).find((d) => insidePolygon(d.outline, p.worldX, p.worldY));
    const acts = hit ? this.byBuilding.get(hit.def.id) : undefined;
    return hit && acts ? { place: hit.def.id, activities: acts.map((a) => ({ kind: a.kind, id: a.id })) } : null;
  }

  private apply(r: ReturnType<typeof clickMap>) {
    this.selection = r.selection;
    if (r.profile) this.initData.onOpenProfile(r.profile);
    if (r.open) this.initData.onOpenActivity(r.open.activity.kind, r.open.activity.id, r.open.volunteerIds);
    this.drawMarks();
  }

  private pointAt(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    const hit = this.hitAt(p, over);
    this.input.setDefaultCursor(hit ? 'pointer' : 'default');
    const next = hit && 'place' in hit ? hit.place : null;
    if (next === this.hovered) return;
    this.hovered = next;
    this.drawMarks();
  }

  // ---------- volontari ----------

  /** Dove deve stare un volontario: davanti all'edificio del suo compito, oppure alla sede. */
  private targetOf(id: string): { tile: Tile; key: string } {
    const sim = this.sim;
    const city = sim.city;
    const team = sim.state.volunteers;
    const home = sede(city).door!;
    const spots = spotsAround(city, home, team.length * 2);
    for (const a of sim.state.active) {
      const i = a.volunteerIds.indexOf(id);
      if (i < 0) continue;
      const where = activeBuilding(sim, a);
      const b = where ? city.buildings.find((x) => x.id === where) : undefined;
      if (!b?.door) break;
      // chi lavora insieme allo stesso edificio si mette in fila davanti all'ingresso
      const mates = sim.state.active.filter((x) => activeBuilding(sim, x) === b.id).flatMap((x) => x.volunteerIds);
      const k = mates.indexOf(id);
      const t = b.id === sede(city).id ? spots[k] : spotsAround(city, b.door, k + 1)[k];
      return { tile: t ?? b.door, key: `${b.id}:${k}` };
    }
    // liberi: sul marciapiede attorno alla sede, dopo i posti di chi lavora lì
    const i = team.findIndex((v) => v.id === id);
    const t = spots[team.length + i] ?? spots[spots.length - 1] ?? home;
    return { tile: t, key: `sede:${i}` };
  }

  /** In città ognuno ha la maglietta del suo archetipo; di schiena quando sale verso lo Stretto. */
  private textureOf(id: string, back: boolean): string {
    return volunteerTexture(this, volunteerLook(this.sim, this.sim.volunteer(id), false), back);
  }

  private place(img: Phaser.GameObjects.Image, t: Tile) {
    const c = tileCenter(t.x, t.y);
    img.setPosition(c.x, c.y + FOOT).setDepth(depthOf(c.y + FOOT) + 0.2);
    img.setData('footY', c.y + FOOT);
  }

  /** Cammina sul percorso più breve lungo le strade fino alla tile data. */
  private walk(person: Person, to: Tile) {
    const city = this.sim.city;
    const img = person.img;
    this.tweens.killTweensOf(img);
    const here = worldToTile(img.x, img.y - FOOT);
    const from = city.rows[here.y]?.[here.x] !== undefined ? here : person.tile;
    const path = findPath(city, from, to);
    person.tile = to;
    if (path.length < 2) {
      this.place(img, to);
      return;
    }
    const pts = path.map((t) => {
      const c = tileCenter(t.x, t.y);
      return { x: c.x, y: c.y + FOOT };
    });
    pts[0] = { x: img.x, y: img.y };
    const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = lengths.reduce((a, b) => a + b, 0);
    const state = { d: 0 };
    this.tweens.add({
      targets: state,
      d: total,
      duration: (total / WALK_SPEED) * 1000,
      onUpdate: () => {
        let d = state.d;
        let i = 0;
        while (i < lengths.length - 1 && d > lengths[i]) d -= lengths[i++];
        const a = pts[i];
        const b = pts[i + 1];
        const t = lengths[i] ? Math.min(1, d / lengths[i]) : 1;
        img.setPosition(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        img.setFlipX(b.x < a.x);
        const key = this.textureOf(img.getData('volunteer') as string, b.y < a.y);
        if (img.texture.key !== key) img.setTexture(key);
        img.setDepth(depthOf(img.y) + 0.2).setData('footY', img.y);
      },
      onComplete: () => {
        img.setTexture(this.textureOf(img.getData('volunteer') as string, false));
        this.place(img, to);
      },
    });
  }

  // ---------- sincronizzazione con lo stato ----------

  private sync() {
    const sim = this.sim;
    if (sim.state.volunteers.map((v) => v.id).join(',') !== this.teamKey) {
      this.scene.restart(this.initData);
      return;
    }
    // attività per edificio
    const by = new Map<string, Activity[]>();
    for (const a of listActivities(sim)) {
      const b = activityBuilding(sim, a);
      if (b) by.set(b, [...(by.get(b) ?? []), a]);
    }
    this.byBuilding = by;
    const key = [...by].map(([b, acts]) => `${b}=${acts.map((a) => `${a.kind}:${a.id}`).join(',')}`).join('|');
    if (key !== this.marksKey) {
      this.marksKey = key;
      if (this.selection?.type === 'luogo' && !by.has(this.selection.place)) this.selection = null;
      if (this.hovered && !by.has(this.hovered)) this.hovered = null;
      this.drawMarks();
    }
    for (const [id, person] of this.people) {
      const { tile, key: target } = this.targetOf(id);
      if (target === person.target && tile.x === person.tile.x && tile.y === person.tile.y) continue;
      person.target = target;
      this.walk(person, tile);
    }
  }

  update() {
    const sim = this.sim;
    const sel = this.selection;
    drawPeopleShadows(this.shadows, this.images, sel?.type === 'volontario' ? sel.volunteer : null);
    if (sel?.type === 'volontario') {
      const img = this.images.get(sel.volunteer)!;
      this.label.show(selectionLabel(sim, sel, null, []), { x: img.x, y: img.y - img.height - 2 }, this.cameras.main);
    } else if (sel?.type === 'luogo') {
      const d = this.buildings.find((x) => x.def.id === sel.place);
      const acts = this.byBuilding.get(sel.place) ?? [];
      if (!d || !acts.length) return this.label.hide();
      const roof = d.outline.reduce((m, p) => (p.y < m.y ? p : m));
      this.label.show(selectionLabel(sim, sel, d.def.name, acts), { x: roof.x, y: roof.y - 4 }, this.cameras.main);
    } else {
      this.label.hide();
    }
  }
}
