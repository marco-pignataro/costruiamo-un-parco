import * as Phaser from 'phaser';
import type { Simulation } from '../core/simulation';
import { SHIRTS, createTextures } from './sprites';

export const VIEW = { width: 384, height: 216, sky: 40 } as const;

/** Dove si lavora per ogni compito (coordinate in pixel). */
const WORK_SPOTS: Record<string, { x: number; y: number }> = {
  'raccolta-rifiuti': { x: 230, y: 120 },
  sfalcio: { x: 300, y: 90 },
  'riparare-panchina': { x: 176, y: 160 },
  staccionata: { x: 300, y: 196 },
};
const DESK = { x: 48, y: 70 };
const HOME = { x: 40, y: 150 };

const TRASH_SPOTS = [
  [200, 110], [236, 132], [262, 104], [214, 150], [250, 160], [190, 130], [276, 140],
] as const;

/**
 * Il parco visto dall'alto. La scena non decide nulla: legge lo stato
 * della simulazione e lo disegna (terreno, oggetti, volontari al lavoro).
 */
export class ParkScene extends Phaser.Scene {
  private sim!: () => Simulation;
  private grass: Phaser.GameObjects.Image[] = [];
  private trash: Phaser.GameObjects.Image[] = [];
  private bench!: Phaser.GameObjects.Image;
  private fence: Phaser.GameObjects.Image[] = [];
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

    const cols = VIEW.width / 16;
    const rows = Math.ceil((VIEW.height - VIEW.sky) / 16);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * 16;
        const y = VIEW.sky + r * 16;
        const plot = c >= 10; // a destra il terreno da recuperare, a sinistra la sede
        const img = this.add.image(x, y, plot ? 'erba-alta' : 'terra').setOrigin(0);
        if (plot) this.grass.push(img);
      }
    }
    this.add.image(DESK.x, DESK.y, 'scrivania');
    this.trash = TRASH_SPOTS.map(([x, y]) => this.add.image(x, y, 'rifiuto'));
    this.bench = this.add.image(WORK_SPOTS['riparare-panchina'].x, WORK_SPOTS['riparare-panchina'].y - 10, 'panchina-rotta');
    for (let x = 168; x < VIEW.width; x += 16) {
      this.fence.push(this.add.image(x, 206, 'staccionata').setOrigin(0, 0.5).setVisible(false));
    }

    this.sim().state.volunteers.forEach((v, i) => {
      const key = SHIRTS[v.archetypeId] ? `volontario-${v.archetypeId}` : 'volontario-base';
      const img = this.add.image(HOME.x + (i % 4) * 14, HOME.y + Math.floor(i / 4) * 18, key).setOrigin(0.5, 1);
      img.setData('home', { x: img.x, y: img.y });
      this.people.set(v.id, img);
    });

    this.time.addEvent({ delay: 500, loop: true, callback: () => this.sync() });
    this.sync();
  }

  private sync() {
    const sim = this.sim();
    const done = new Set(sim.state.completedTasks);
    this.grass.forEach((g) => g.setTexture(done.has('sfalcio') ? 'erba' : 'erba-alta'));
    this.trash.forEach((t) => t.setVisible(!done.has('raccolta-rifiuti')));
    this.bench.setTexture(done.has('riparare-panchina') ? 'panchina' : 'panchina-rotta');
    this.fence.forEach((f) => f.setVisible(done.has('staccionata')));

    const where = new Map<string, { x: number; y: number }>();
    for (const a of sim.state.active) {
      const spot = a.kind === 'lavoro' ? WORK_SPOTS[a.refId] ?? DESK : DESK;
      a.volunteerIds.forEach((id, i) => where.set(id, { x: spot.x - 12 + i * 12, y: spot.y + 14 }));
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
