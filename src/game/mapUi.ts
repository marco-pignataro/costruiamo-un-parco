import type * as Phaser from 'phaser';
import type { Simulation } from '../core/simulation';
import type { Activity } from '../ui/activities';
import type { ActivityRef, MapSelection } from '../ui/mapSelection';
import type { Point } from './iso';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Etichetta HTML sopra la selezione sulla mappa (volontario, lavoro,
 * edificio). Segue la telecamera; se il punto ha più attività le elenca come
 * pulsanti da scegliere.
 */
export class MapLabel {
  private readonly el: HTMLDivElement;

  constructor(onChoose: (ref: ActivityRef) => void) {
    this.el = document.createElement('div');
    this.el.className = 'map-label';
    this.el.hidden = true;
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-choose]');
      if (!btn) return;
      const v = btn.dataset.choose!;
      const cut = v.indexOf(':');
      onChoose({ kind: v.slice(0, cut) as ActivityRef['kind'], id: v.slice(cut + 1) });
    });
    document.body.append(this.el);
  }

  show(html: string, at: Point, cam: Phaser.Cameras.Scene2D.Camera): void {
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
    const sx = (at.x - cam.worldView.x) * cam.zoom;
    const sy = (at.y - cam.worldView.y) * cam.zoom;
    this.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    this.el.classList.toggle('choices', html.includes('data-choose'));
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  destroy(): void {
    this.el.remove();
  }
}

/**
 * Testo dell'etichetta per la selezione: nome e ruolo del volontario, oppure
 * il punto con le sue attività (una sola: si apre con un secondo clic; più
 * d'una: si sceglie dall'elenco).
 */
export function selectionLabel(sim: Simulation, sel: MapSelection, title: string | null, acts: Activity[]): string {
  if (!sel) return '';
  if (sel.type === 'volontario') {
    const v = sim.volunteer(sel.volunteer);
    return `<strong>${esc(v.name)}</strong> · ${esc(sim.archetype(v.archetypeId).name)}${v.busy ? ' · al lavoro' : ''}<br><small>Clicca un'attività sulla mappa</small>`;
  }
  const head = title ? `<strong>${esc(title)}</strong><br>` : '';
  const who = sel.volunteer ? ` per ${esc(sim.volunteer(sel.volunteer).name)}` : '';
  if (acts.length === 1) {
    const a = acts[0];
    const name = title === a.name ? '' : `${esc(a.name)}<br>`;
    const why = a.blockers.length ? `<em>${esc(a.blockers[0])}</em><br>` : '';
    return `${head}${name}${why}<small>Clicca di nuovo per organizzarla${who}</small>`;
  }
  const items = acts
    .map((a) => `<button data-choose="${a.kind}:${a.id}"><span>${esc(a.name)}</span>${a.blockers.length ? `<em>${esc(a.blockers[0])}</em>` : ''}</button>`)
    .join('');
  return `${head}<small>Scegli un'attività${who}</small><div class="choose">${items}</div>`;
}

/** Ombre sotto i piedi dei volontari e anello bianco attorno a quello selezionato. */
export function drawPeopleShadows(gfx: Phaser.GameObjects.Graphics, people: Map<string, Phaser.GameObjects.Image>, selected: string | null): void {
  gfx.clear();
  for (const [id, img] of people) {
    const foot = (img.getData('footY') as number | undefined) ?? img.y;
    gfx.fillStyle(0x000000, 0.3).fillEllipse(img.x, foot, 10, 4);
    if (id === selected) gfx.lineStyle(1, 0xffffff, 1).strokeEllipse(img.x, foot, 14, 6);
  }
}
