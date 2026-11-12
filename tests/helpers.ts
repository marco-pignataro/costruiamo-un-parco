import { defaultContent, type Content } from '../src/core/content';
import { Simulation } from '../src/core/simulation';

export const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);

/** La squadra storica dei test: presidente, segretaria, falegname, giardiniera, 2 base, comunicatrice. */
export const TEST_TEAM = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];

/** Partita in sopralluogo sul primo terreno (quello sul torrente) con la squadra dei test. */
export function surveyGame(content: Content = defaultContent, now = T0): Simulation {
  const sim = Simulation.newGame(content, now);
  sim.confirmSite();
  sim.state.pv = 99; // i test sulla squadra stanno in team.test.ts
  for (const id of TEST_TEAM) sim.recruit(id);
  sim.confirmTeam();
  return sim;
}

/**
 * Partita in progettazione: il sopralluogo si chiude subito e, per i test che
 * non lo riguardano, senza insidie nascoste (quelli sulle insidie stanno in survey.test.ts).
 */
export function designGame(content: Content = defaultContent, now = T0): Simulation {
  const sim = surveyGame(content, now);
  sim.closeSession(now);
  sim.state.hiddenHazards = [];
  sim.state.reports = [];
  return sim;
}

/** Partita già in cantiere con il progetto proposto, senza resoconti in coda. */
export function startedGame(content: Content = defaultContent, now = T0): Simulation {
  const sim = designGame(content, now);
  sim.confirmProject(now);
  sim.state.reports = [];
  return sim;
}

export const firstSite = defaultContent.sites[0];
