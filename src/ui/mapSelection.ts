import type { Kind } from './activities';

export interface ActivityRef {
  kind: Kind;
  id: string;
}

/**
 * Un punto interagibile della mappa: le tile di un lavoro al parco, un punto
 * sospetto, un edificio della città. Può avere più attività (es. il fornitore,
 * uno per ogni ordine da fare).
 */
export interface PlaceHit {
  place: string;
  activities: ActivityRef[];
}

/** Cosa è selezionato sulla mappa. */
export type MapSelection =
  | { type: 'volontario'; volunteer: string }
  | { type: 'luogo'; place: string; activities: ActivityRef[]; volunteer?: string }
  | null;

/** Cosa c'è sotto il clic: un volontario, un punto con delle attività o niente di interagibile. */
export type MapHit = { volunteer: string } | PlaceHit | null;

export interface ClickResult {
  selection: MapSelection;
  /** Attività da aprire nella modale centrale, con i volontari già scelti. */
  open?: { activity: ActivityRef; volunteerIds: string[] };
}

/**
 * Regole del punta e clicca:
 * - clic su un volontario: resta selezionato (la scena mostra nome e ruolo);
 * - poi clic su un punto con un'attività: si apre la modale con quel volontario;
 *   se il punto ne ha più d'una, l'etichetta le elenca e si sceglie lì (`chooseActivity`);
 * - clic su un punto senza niente selezionato: si mostrano le sue attività sopra;
 *   un secondo clic sullo stesso punto apre la prima;
 * - clic su un punto non interagibile: si deseleziona tutto.
 */
export function clickMap(selection: MapSelection, hit: MapHit): ClickResult {
  if (!hit) return { selection: null };
  if ('volunteer' in hit) return { selection: { type: 'volontario', volunteer: hit.volunteer } };
  // Il volontario scelto resta in attesa anche mentre si sceglie tra più attività.
  const volunteer = selection?.volunteer;
  const ids = volunteer ? [volunteer] : [];
  if (volunteer && hit.activities.length === 1) return { selection: null, open: { activity: hit.activities[0], volunteerIds: ids } };
  if (selection?.type === 'luogo' && selection.place === hit.place) return { selection: null, open: { activity: hit.activities[0], volunteerIds: ids } };
  return { selection: { type: 'luogo', place: hit.place, activities: hit.activities, ...(volunteer ? { volunteer } : {}) } };
}

/** Scelta di un'attività dall'elenco mostrato sopra un punto con più attività. */
export function chooseActivity(selection: MapSelection, activity: ActivityRef): ClickResult {
  const volunteer = selection?.volunteer;
  return { selection: null, open: { activity, volunteerIds: volunteer ? [volunteer] : [] } };
}
