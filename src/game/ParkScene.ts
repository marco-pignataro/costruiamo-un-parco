import * as Phaser from 'phaser';
import type { Simulation } from '../core/simulation';
import type { PlanTask, SurfaceId } from '../core/types';
import { SHIRTS, createTextures } from './sprites';

export const VIEW = { width: 384, height: 216, sky: 40 } as const;

const TILE = 16;
/** Angolo in alto a sinistra del terreno: a sinistra resta la sede dell'associazione. */
const GRID = { x: 160, y: VIEW.sky } as const;
const DESK = { x: 48, y: 70 };
const HOME = { x: 40, y: 150 };

/** Tile di base per ogni superficie; rifiuti e alberi aggiungono un oggetto sopra. */
const SURFACE_TEXTURE: Record<SurfaceId, string> = {
  terra: 'terra',
  erba: 'erba',
  'erba-alta': 'erba-alta',
  rifiuti: 'terra',
  cemento: 'cemento',
  'albero-tutelato': 'erba',
};

/** Come si disegna ogni elemento: una tile ripetuta sull'ingombro o uno sprite al centro. */
const ELEMENT_LOOK: Record<string, { tile?: string; sprite?: string }> = {
  sentiero: { tile: 'ghiaia' },
  aiuola: { tile: 'aiuola' },
  panchina: { sprite: 'panchina' },
  staccionata: { sprite: 'staccionata' },
  cestino: { sprite: 'cestino' },
};

/** Trasparenza degli elementi solo progettati, non ancora costruiti. */
const GHOST_ALPHA = 0.35;

/**
 * Il parco visto dall'alto. La scena non decide nulla: legge lo stato
 * della simulazione (griglia, progetto, compiti in corso) e lo disegna.
 */
export class ParkScene extends Phaser.Scene {
  private sim!: () => Simulation;
  private ground: Phaser.GameObjects.Image[] = [];
  private trash: Phaser.GameObjects.Image[] = [];
  private elements = new Map<number, Phaser.GameObjects.Image[]>();
  private people = new Map<string, Phaser.GameObjects.Image>();
  private targets = new Map<string, string>();

  constructor() {
    super('park');
  }

  init(data: { sim: () => Simulation }) {
    this.sim = data.sim;
  }

  create() {
    createTextures(this, VIEW.width, VIEW.sky);
    this.add.image(0, 0, 'stretto').setOrigin(0);

    // La sede, a sinistra del terreno.
    for (let y = VIEW.sky; y < VIEW.height; y += TILE) {
      for (let x = 0; x < GRID.x; x += TILE) this.add.image(x, y, 'terra').setOrigin(0);
    }
    this.add.image(DESK.x, DESK.y, 'scrivania');

    const g = this.sim().state.grid;
    for (let i = 0; i < g.width * g.height; i++) {
      const { x, y } = tileTopLeft(i, g.width);
      this.ground.push(this.add.image(x, y, 'terra').setOrigin(0));
      this.trash.push(this.add.image(x + 8, y + 9, 'rifiuto').setVisible(false).setDepth(1));
      if (g.surface[i] === 'albero-tutelato') this.add.image(x + 8, y + TILE, 'albero').setOrigin(0.5, 1).setDepth(4);
    }

    for (const p of g.placements) {
      const def = this.sim().elementDef(p.elementId);
      const look = ELEMENT_LOOK[p.elementId] ?? { sprite: 'rifiuto' };
      const imgs: Phaser.GameObjects.Image[] = [];
      const ox = GRID.x + p.x * TILE;
      const oy = GRID.y + p.y * TILE;
      if (look.tile) {
        for (let dy = 0; dy < def.h; dy++) {
          for (let dx = 0; dx < def.w; dx++) imgs.push(this.add.image(ox + dx * TILE, oy + dy * TILE, look.tile).setOrigin(0).setDepth(2));
        }
      } else {
        imgs.push(this.add.image(ox + (def.w * TILE) / 2, oy + (def.h * TILE) / 2, look.sprite!).setDepth(3));
      }
      this.elements.set(p.uid, imgs);
    }

    this.sim().state.volunteers.forEach((v, i) => {
      const key = SHIRTS[v.archetypeId] ? `volontario-${v.archetypeId}` : 'volontario-base';
      const img = this.add.image(HOME.x + (i % 4) * 14, HOME.y + Math.floor(i / 4) * 18, key).setOrigin(0.5, 1).setDepth(10);
      img.setData('home', { x: img.x, y: img.y });
      this.people.set(v.id, img);
    });

    this.time.addEvent({ delay: 500, loop: true, callback: () => this.sync() });
    this.sync();
  }

  private sync() {
    const sim = this.sim();
    const g = sim.state.grid;
    g.surface.forEach((s, i) => {
      this.ground[i].setTexture(SURFACE_TEXTURE[s]);
      this.trash[i].setVisible(s === 'rifiuti');
    });
    const built = new Set(g.built);
    for (const [uid, imgs] of this.elements) imgs.forEach((img) => img.setAlpha(built.has(uid) ? 1 : GHOST_ALPHA));

    // Chi lavora va sulle tile del suo compito; pratiche e compiti d'ufficio alla scrivania.
    const where = new Map<string, { x: number; y: number }>();
    for (const a of sim.state.active) {
      const def = a.kind === 'lavoro' ? sim.taskDef(a.refId) : null;
      const tiles = def && 'tiles' in def ? (def as PlanTask).tiles : [];
      a.volunteerIds.forEach((id, i) => {
        if (tiles.length > 0) {
          const t = tileTopLeft(tiles[i % tiles.length], g.width);
          where.set(id, { x: t.x + 8 + (i >= tiles.length ? 6 : 0), y: t.y + TILE });
        } else {
          where.set(id, { x: DESK.x - 12 + i * 12, y: DESK.y + 14 });
        }
      });
    }

    for (const [id, img] of this.people) {
      const home = img.getData('home') as { x: number; y: number };
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
        onComplete: () => {
          if (where.has(id)) this.tweens.add({ targets: img, y: to.y - 2, duration: 220, yoyo: true, repeat: -1 });
        },
      });
    }
  }
}

function tileTopLeft(i: number, width: number): { x: number; y: number } {
  return { x: GRID.x + (i % width) * TILE, y: GRID.y + Math.floor(i / width) * TILE };
}
