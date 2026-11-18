import { describe, expect, it } from 'vitest';
import { defaultContent } from '../src/core/content';
import { Simulation } from '../src/core/simulation';
import { TUTORIAL_STEPS, validateTutorial } from '../src/core/tutorial';
import { startedGame, T0 } from './helpers';

describe('benvenuto e tutorial', () => {
  it('una nuova partita chiede se si vuole il tutorial; senza risposta nessun pannello', () => {
    const sim = Simulation.newGame(defaultContent, T0);
    expect(sim.needsWelcome).toBe(true);
    expect(sim.tutorialPanel()).toBeNull();
    sim.setTutorial(false);
    expect(sim.needsWelcome).toBe(false);
    expect(sim.tutorialPanel()).toBeNull();
  });

  it('con il tutorial ogni passaggio ha il suo pannello, una volta sola', () => {
    const sim = Simulation.newGame(defaultContent, T0);
    sim.setTutorial(true);
    expect(sim.tutorialPanel()?.id).toBe('terreno');
    sim.dismissTutorial();
    expect(sim.tutorialPanel()).toBeNull();
    sim.confirmSite();
    expect(sim.tutorialPanel()?.id).toBe('squadra');
  });

  it('i pannelli dei giorni feriali e del weekend compaiono solo nella prima settimana', () => {
    const sim = startedGame();
    sim.setTutorial(true);
    expect(sim.tutorialPanel()?.id).toBe('burocratica');
    sim.dismissTutorial();
    sim.state.phase = 'operativa';
    expect(sim.tutorialPanel()?.id).toBe('operativa');
    sim.state.week = 2;
    sim.state.phase = 'burocratica';
    expect(sim.tutorialPanel()).toBeNull(); // anche se il pannello del weekend non è stato chiuso
    expect(sim.hasTutorialStep()).toBe(false);
  });

  it('dal menu si spegne, si riaccende e si rivede il pannello della fase', () => {
    const sim = Simulation.newGame(defaultContent, T0);
    sim.setTutorial(true);
    sim.dismissTutorial();
    sim.setTutorial(false);
    sim.confirmSite();
    expect(sim.tutorialPanel()).toBeNull();
    sim.setTutorial(true);
    expect(sim.tutorialPanel()?.id).toBe('squadra');
    sim.dismissTutorial();
    sim.replayTutorial();
    expect(sim.tutorialPanel()?.id).toBe('squadra');
    expect(sim.state.tutorial?.seen).toEqual(['terreno']);
  });

  it('i testi coprono ogni passaggio', () => {
    expect(validateTutorial(defaultContent.tutorial)).toEqual([]);
    expect(defaultContent.tutorial.steps.map((s) => s.id).sort()).toEqual([...TUTORIAL_STEPS].sort());
  });
});
