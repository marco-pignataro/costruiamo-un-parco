import type * as Phaser from 'phaser';
import { type Rect, zoomLevels } from './iso';

/** Oltre questi pixel di spostamento un clic diventa un trascinamento. */
const DRAG_THRESHOLD = 4;

/** Spazio occupato dalla HUD su ogni bordo dello schermo, in pixel CSS. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Ponte tra HUD e scene: la HUD dice quanto spazio occupa e chiede lo zoom,
 * la scena attiva registra qui la sua telecamera.
 */
export interface View {
  camera: IsoCamera | null;
  insets: Insets;
}

/**
 * Telecamera comune alle scene isometriche: due soli livelli di zoom (visuale
 * intera o ingrandimento fisso) e, da ingranditi, la mappa si sposta
 * trascinandola. La visuale intera sta nello spazio libero tra i pannelli
 * della HUD. Un trascinamento non vale come clic: le scene chiedono
 * `wasDrag()` prima di trattare il rilascio del puntatore.
 */
export class IsoCamera {
  private zoomed = false;
  private down: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private dragged = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: Rect,
    private insets: Insets = NO_INSETS,
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

  /** Alterna visuale intera e ingrandimento; ingrandisce attorno al punto dato (o al centro della vista). */
  toggleZoom(focus?: { x: number; y: number }): void {
    this.zoomed = !this.zoomed;
    if (this.zoomed && !focus) {
      // Senza un punto si ingrandisce il centro della zona libera tra i pannelli.
      const { width: W, height: H } = this.scene.scale;
      const i = this.insets;
      const p = this.scene.cameras.main.getWorldPoint(i.left + (W - i.left - i.right) / 2, i.top + (H - i.top - i.bottom) / 2);
      focus = { x: p.x, y: p.y };
    }
    this.apply(focus);
  }

  setInsets(insets: Insets): void {
    this.insets = insets;
    this.apply();
  }

  private apply(focus?: { x: number; y: number }): void {
    const cam = this.scene.cameras.main;
    const { width: W, height: H } = this.scene.scale;
    const i = this.insets;
    const w = this.world.right - this.world.left;
    const h = this.world.bottom - this.world.top;
    const free = { w: Math.max(80, W - i.left - i.right), h: Math.max(80, H - i.top - i.bottom) };
    const { full, close } = zoomLevels(free.w, free.h, w, h);
    const zoom = this.zoomed ? close : full;
    const before = { x: cam.midPoint.x, y: cam.midPoint.y };
    cam.setZoom(zoom);
    // Limiti: la scena più lo spazio sotto i pannelli, così ogni suo angolo
    // si può portare nella zona libera; se resta più piccola della vista si
    // allargano in modo uguale e la scena sta in mezzo alla zona libera.
    let left = this.world.left - i.left / zoom;
    let right = this.world.right + i.right / zoom;
    let top = this.world.top - i.top / zoom;
    let bottom = this.world.bottom + i.bottom / zoom;
    const vw = W / zoom;
    const vh = H / zoom;
    if (right - left < vw) {
      const grow = (vw - (right - left)) / 2;
      left -= grow;
      right += grow;
    }
    if (bottom - top < vh) {
      const grow = (vh - (bottom - top)) / 2;
      top -= grow;
      bottom += grow;
    }
    cam.setBounds(left, top, right - left, bottom - top);
    if (!this.zoomed) {
      cam.centerOn((left + right) / 2, (top + bottom) / 2);
      return;
    }
    // Il punto scelto va al centro della zona libera, non dello schermo;
    // senza un punto (ridimensionamento, pannelli che cambiano) la vista resta dov'era.
    if (focus) cam.centerOn(focus.x - (i.left - i.right) / 2 / zoom, focus.y - (i.top - i.bottom) / 2 / zoom);
    else cam.centerOn(before.x, before.y);
  }
}
