import type * as Phaser from 'phaser';
import { type Rect, clampZoom, scrollToKeep, zoomRange } from './iso';

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
 * Ponte tra HUD e scene: la HUD dice quanto spazio occupa,
 * la scena attiva registra qui la sua telecamera.
 */
export interface View {
  camera: IsoCamera | null;
  insets: Insets;
}

/** Quanto cambia lo zoom per ogni pixel di rotella (scatto tipico: 100 px ≈ ×0,86). */
const WHEEL_SPEED = 0.0015;

/**
 * Telecamera comune alle scene isometriche: zoom libero tra la visuale intera
 * e un ingrandimento massimo, con la rotella del mouse (attorno al cursore) o
 * con due dita sul telefono (attorno al punto tra le dita). Da ingranditi la
 * mappa si sposta trascinandola. La visuale intera sta nello spazio libero tra
 * i pannelli della HUD. Un trascinamento o un pizzico non vale come clic: le
 * scene chiedono `wasDrag()` prima di trattare il rilascio del puntatore.
 */
export class IsoCamera {
  /** Zoom rispetto alla visuale intera (1 = intera), così resta lo stesso se la finestra cambia. */
  private factor = 1;
  private down: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private pinch: { dist: number; factor: number; world: { x: number; y: number } } | null = null;
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

    scene.input.on('wheel', (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.zoomAt(this.factor * Math.exp(-dy * WHEEL_SPEED), { x: p.x, y: p.y });
    });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const touches = this.touches();
      if (touches.length >= 2) this.startPinch(touches[0], touches[1]);
      else {
        this.down = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        this.dragged = false;
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pinch) {
        const touches = this.touches();
        if (touches.length < 2) return;
        const [a, b] = touches;
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        // Il punto del mondo preso all'inizio resta tra le dita: si zooma e si sposta insieme.
        this.zoomAt(this.pinch.factor * (dist / this.pinch.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, this.pinch.world);
        return;
      }
      if (!this.down || !p.isDown) return;
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!this.isZoomed) return; // a visuale intera non c'è niente da spostare
      this.dragged = true;
      cam.setScroll(this.down.scrollX - dx / cam.zoom, this.down.scrollY - dy / cam.zoom);
    });
    scene.input.on('pointerup', () => {
      const touches = this.touches();
      if (this.pinch && touches.length === 1) {
        // Resta un dito: da qui riparte un trascinamento normale, senza salti.
        this.pinch = null;
        const t = touches[0];
        this.down = { x: t.x, y: t.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
        return;
      }
      if (touches.length === 0) {
        this.pinch = null;
        this.down = null;
      }
    });
  }

  /** Dita appoggiate sullo schermo (il puntatore del mouse escluso). */
  private touches(): Phaser.Input.Pointer[] {
    return this.scene.input.manager.pointers.filter((p) => p.isDown && p.id !== 0 && p.wasTouch);
  }

  private startPinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    const mid = this.scene.cameras.main.getWorldPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), factor: this.factor, world: { x: mid.x, y: mid.y } };
    this.down = null;
    this.dragged = true; // un pizzico non è mai un clic
  }

  /** Punto dello schermo (pixel CSS) dove si vede un punto del mondo. */
  toScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
  }

  /** Più vicini della visuale intera. */
  get isZoomed(): boolean {
    return this.factor > 1.001;
  }

  /** L'ultimo rilascio del puntatore chiudeva un trascinamento o un pizzico, non un clic. */
  wasDrag(): boolean {
    return this.dragged;
  }

  setInsets(insets: Insets): void {
    this.insets = insets;
    this.apply();
  }

  /**
   * Porta lo zoom a `factor` volte la visuale intera tenendo il punto del mondo
   * `world` (di solito quello già sotto `screen`) sotto il punto dello schermo `screen`.
   */
  private zoomAt(factor: number, screen: { x: number; y: number }, world?: { x: number; y: number }): void {
    const cam = this.scene.cameras.main;
    const w = world ?? cam.getWorldPoint(screen.x, screen.y);
    const range = this.range();
    this.factor = clampZoom(range.min * factor, range) / range.min;
    this.apply({ world: { x: w.x, y: w.y }, screen });
  }

  private range(): { min: number; max: number } {
    const { width: W, height: H } = this.scene.scale;
    const i = this.insets;
    const free = { w: Math.max(80, W - i.left - i.right), h: Math.max(80, H - i.top - i.bottom) };
    return zoomRange(free.w, free.h, this.world.right - this.world.left, this.world.bottom - this.world.top);
  }

  private apply(anchor?: { world: { x: number; y: number }; screen: { x: number; y: number } }): void {
    const cam = this.scene.cameras.main;
    const { width: W, height: H } = this.scene.scale;
    const i = this.insets;
    const range = this.range();
    const zoom = clampZoom(range.min * this.factor, range);
    this.factor = zoom / range.min;
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
    if (!this.isZoomed) {
      cam.centerOn((left + right) / 2, (top + bottom) / 2);
      return;
    }
    // Con un punto (rotella, dita) quel punto resta fermo sullo schermo;
    // senza (ridimensionamento, pannelli che cambiano) la vista resta dov'era.
    if (anchor) {
      const s = scrollToKeep(anchor.world, anchor.screen, zoom, { w: W, h: H });
      cam.setScroll(s.x, s.y);
    } else cam.centerOn(before.x, before.y);
  }
}
