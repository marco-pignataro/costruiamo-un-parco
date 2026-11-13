import type { Kind } from './activities';

export interface ActivityRef {
  kind: Kind;
  id: string;
}

/** Cosa è selezionato sulla mappa: un volontario, un'attività o niente. */
export type MapSelection = { volunteer: string } | { activity: ActivityRef } | null;

/** Cosa c'è sotto il clic: un volontario, un elemento con un'attività o niente di interagibile. */
export type MapHit = { volunteer: string } | { activity: ActivityRef } | null;

export interface ClickResult {
  selection: MapSelection;
  /** Attività da aprire nella modale centrale, con i volontari già scelti. */
  open?: { activity: ActivityRef; volunteerIds: string[] };
}

const same = (a: ActivityRef, b: ActivityRef) => a.kind === b.kind && a.id === b.id;

/**
 * Regole del punta e clicca:
 * - clic su un volontario: resta selezionato (la scena mostra nome e ruolo);
 * - poi clic su un elemento con un'attività: si apre la modale con quel volontario;
 * - clic su un elemento senza niente selezionato: si mostra l'attività sopra l'elemento;
 *   un secondo clic sullo stesso elemento apre la modale;
 * - clic su un punto non interagibile: si deseleziona tutto.
 */
export function clickMap(selection: MapSelection, hit: MapHit): ClickResult {
  if (!hit) return { selection: null };
  if ('volunteer' in hit) return { selection: { volunteer: hit.volunteer } };
  if (selection && 'volunteer' in selection) {
    return { selection: null, open: { activity: hit.activity, volunteerIds: [selection.volunteer] } };
  }
  if (selection && 'activity' in selection && same(selection.activity, hit.activity)) {
    return { selection: null, open: { activity: hit.activity, volunteerIds: [] } };
  }
  return { selection: { activity: hit.activity } };
}
