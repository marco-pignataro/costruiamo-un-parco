import { describe, expect, it } from 'vitest';
import { defaultContent } from '../src/core/content';
import { startedGame, T0 } from './helpers';

const H = 3_600_000;
const at = (hours: number) => T0 + hours * H;
const quest = defaultContent.sideQuests.find((q) => q.id === 'differenziata')!;
/** Risposte giuste, con i primi `wrong` oggetti messi nel contenitore sbagliato. */
const answers = (wrong = 0) =>
  Object.fromEntries(quest.items.map((it, i) => [i, i < wrong ? (it.bin === 'carta' ? 'vetro' : 'carta') : it.bin]));

describe('richiesta diretta al dirigente (side-quest)', () => {
  it('la pratica di smaltimento nasce dal progetto e non si chiede a timer', () => {
    const sim = startedGame();
    expect(sim.isSideQuest('smaltimento')).toBe(true);
    expect(sim.isBlocking('smaltimento')).toBe(true); // la bonifica la aspetta
    expect(sim.previewRequest('smaltimento', ['v1']).errors).toContain('Questa pratica si chiede di persona al dirigente');
  });

  it('con le risposte giuste la pratica è concessa; la giornata consuma 4 ore di sessione e 4 a testa', () => {
    const sim = startedGame();
    const r = sim.resolveSideQuest('smaltimento', ['v1', 'v5'], answers(), T0);
    expect(r).toMatchObject({ ok: true, errors: 0 });
    expect(sim.pratica('smaltimento').status).toBe('approvata');
    expect(sim.state.sessionUsedH).toBe(4);
    expect(sim.volunteer('v1').hoursUsed).toBe(4);
    expect(sim.volunteer('v5').hoursUsed).toBe(4);
    expect(sim.unseenReports().at(-1)?.title).toBe('Richiesta accolta: Ritiro dei rifiuti raccolti');
  });

  it('troppi errori: richiesta respinta, la giornata è persa e si può riprovare', () => {
    const sim = startedGame();
    const r = sim.resolveSideQuest('smaltimento', ['v5'], answers(2), T0);
    expect(r).toMatchObject({ ok: false, errors: 2, allowed: 1, wrong: [0, 1] });
    expect(sim.pratica('smaltimento').status).toBe('da-avviare');
    expect(sim.state.sessionUsedH).toBe(4);
    expect(sim.previewSideQuest('smaltimento', ['v6']).errors).toEqual([]);
  });

  it('con il presidente nella delegazione è ammesso un errore in più', () => {
    const sim = startedGame();
    expect(sim.sideQuestAllowedErrors('smaltimento', ['v1'])).toBe(2);
    expect(sim.resolveSideQuest('smaltimento', ['v1'], answers(2), T0).ok).toBe(true);
  });

  it('la giornata fa avanzare anche le attese delle pratiche', () => {
    const sim = startedGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2)); // richiesta inviata: attesa di 12 ore di sessione
    const before = sim.pratica('assicurazione').waitRemainingH;
    sim.resolveSideQuest('smaltimento', ['v1'], answers(), at(2));
    expect(sim.pratica('assicurazione').waitRemainingH).toBeCloseTo(before - 4);
  });

  it('serve una giornata intera libera: volontari e sessione', () => {
    const sim = startedGame();
    sim.volunteer('v5').hoursUsed = 3; // gliene restano 3
    expect(sim.previewSideQuest('smaltimento', ['v5']).errors.join(' ')).toMatch(/Turi ha solo 3 h/);
    sim.state.sessionUsedH = 17;
    expect(sim.previewSideQuest('smaltimento', ['v1']).errors.join(' ')).toMatch(/Serve una giornata/);
    expect(sim.previewSideQuest('smaltimento', ['v1', 'v6', 'v7']).errors).toContain('Massimo 2 volontari');
  });

  it("se la giornata chiude le 20 ore, si passa al weekend", () => {
    const sim = startedGame();
    sim.state.sessionUsedH = 16;
    sim.resolveSideQuest('smaltimento', ['v1'], answers(), T0);
    expect(sim.state.phase).toBe('operativa');
    expect(() => sim.resolveSideQuest('smaltimento', ['v1'], answers(), T0)).toThrow();
  });
});
