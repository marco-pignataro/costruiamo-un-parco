import type { GameState, TutorialDef, TutorialStepDef } from './types';

/** Passaggi con un pannello del tutorial, nell'ordine della partita. */
export const TUTORIAL_STEPS = ['terreno', 'squadra', 'sopralluogo', 'progettazione', 'burocratica', 'operativa'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/**
 * Il passaggio in cui si trova la partita, per il tutorial. Le due parti
 * della settimana hanno un pannello solo nella prima settimana.
 */
export function tutorialStepOf(s: GameState): TutorialStepId | null {
  if (s.stage === 'inaugurato' || s.stage === 'fallito') return null;
  if (s.stage !== 'cantiere') return s.stage;
  if (s.week !== 1) return null;
  return s.phase === 'burocratica' ? 'burocratica' : 'operativa';
}

/** Pannello del tutorial da mostrare adesso, se il tutorial è attivo e non l'ha già chiuso. */
export function currentTutorial(s: GameState, def: TutorialDef): TutorialStepDef | null {
  if (!s.tutorial?.on) return null;
  const id = tutorialStepOf(s);
  if (!id || s.tutorial.seen.includes(id)) return null;
  return def.steps.find((x) => x.id === id) ?? null;
}

export function validateTutorial(def: TutorialDef): string[] {
  const errors: string[] = [];
  for (const id of TUTORIAL_STEPS) if (!def.steps.some((x) => x.id === id)) errors.push(`tutorial: manca il pannello ${id}`);
  for (const x of def.steps) {
    if (!(TUTORIAL_STEPS as readonly string[]).includes(x.id)) errors.push(`tutorial: passaggio sconosciuto ${x.id}`);
    if (x.lines.length === 0) errors.push(`tutorial: il pannello ${x.id} è vuoto`);
  }
  return errors;
}
