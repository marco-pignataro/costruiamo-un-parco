import type * as Phaser from 'phaser';
import { type Rect, zoomLevels } from './iso';

/** Oltre questi pixel di spostamento un clic diventa un trascinamento. */
const DRAG_THRESHOLD = 4;

/**
 * Telecamera comune alle scene isometriche: due soli livelli di zoom (visuale
 * intera o ingrandimento fisso) e, da ingranditi, la mappa si sposta
 * trascinandola. Un trascinamento non vale come clic: le scene chiedono
 * `wasDrag()` prima di trattare il rilascio del puntatore.
 */
export class IsoCamera {
  private zoomed = false;
  private down: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragged = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: Rect,
  ) {
    const cam = scene.cameras.main;
    cam.setRoundPixels(true);
    this.apply();
    const onResize = () => this.apply();
    scene.scale.on('resize', onResize);
    scene.events.once('shutdown', () => scene.scale.off('resize', onResize));

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.down = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      this.dragged = false;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.down || !p.isDown) return;
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!this.zoomed) return; // a visuale intera non c'è niente da spostare
      this.dragged = true;
      cam.setScroll(this.down.scrollX - dx / cam.zoom, this.down.scrollY - dy / cam.zoom);
    });
    scene.input.on('pointerup', () => {
      this.down = null;
    });
  }

  get isZoomed(): boolean {
    return this.zoomed;
  }

  /** L'ultimo rilascio del puntatore chiudeva un trascinamento, non un clic. */
  wasDrag(): boolean {
    return this.dragged;
  }

  /** Alterna visuale intera e ingrandimento; ingrandisce attorno al punto dato (o al centro). */
  toggleZoom(focus?: { x: number; y: number }): void {
    this.zoomed = !this.zoomed;
    this.apply(focus);
  }

  private apply(focus?: { x: number; y: number }): void {
    const cam = this.scene.cameras.main;
    const w = this.world.right - this.world.left;
    const h = this.world.bottom - this.world.top;
    const { full, close } = zoomLevels(this.scene.scale.width, this.scene.scale.height, w, h);
    const center = focus ?? { x: cam.midPoint.x || this.world.left + w / 2, y: cam.midPoint.y || this.world.top + h / 2 };
    const zoom = this.zoomed ? close : full;
    cam.setZoom(zoom);
    // Limiti grandi almeno quanto la vista, centrati sulla scena: se la scena
    // sta tutta nello schermo resta in mezzo, se no si trascina fino ai bordi.
    const vw = Math.max(w, this.scene.scale.width / zoom);
    const vh = Math.max(h, this.scene.scale.height / zoom);
    cam.setBounds(this.world.left - (vw - w) / 2, this.world.top - (vh - h) / 2, vw, vh);
    if (this.zoomed) cam.centerOn(center.x, center.y);
    else cam.centerOn(this.world.left + w / 2, this.world.top + h / 2);
  }
}
