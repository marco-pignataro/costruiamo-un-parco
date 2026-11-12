import { describe, expect, it } from 'vitest';
import { defaultContent } from '../src/core/content';
import { Simulation } from '../src/core/simulation';

const H = 3_600_000; // tempo reale: 1 ora di gioco = 1 ora vera
const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);
const at = (hours: number) => T0 + hours * H;
const newGame = () => Simulation.newGame(defaultContent, T0);

describe('timer reali e recupero a gioco chiuso', () => {
  it('un compito finisce dopo le sue ore reali e produce un resoconto', () => {
    const sim = newGame();
    sim.startTask('ordine-materiali', ['v2'], T0); // segretaria: 3 / 1,1 h
    sim.tick(at(2));
    expect(sim.state.active).toHaveLength(1);
    sim.tick(at(3));
    expect(sim.state.active).toHaveLength(0);
    expect(sim.state.completedTasks).toContain('ordine-materiali');
    expect(sim.unseenReports().map((r) => r.title)).toEqual(['Completato: Ordinare legno e viti']);
  });

  it('a gioco chiuso gli eventi si recuperano tutti, in ordine', () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0); // 2 / 1,1 h di richiesta
    sim.startTask('raccolta-fondi', ['v7', 'v1'], T0); // comunicatrice + presidente guidato
    sim.tick(at(48)); // riapertura due giorni dopo
    const titles = sim.unseenReports().map((r) => r.title);
    expect(titles[0]).toBe('Richiesta inviata: Assicurazione dei volontari');
    expect(titles[1]).toBe('Completato: Organizzare una raccolta fondi');
  });
});

describe('sessioni', () => {
  it('le ore di sessione contano il tempo con almeno un compito in corso, una volta sola', () => {
    const sim = newGame();
    sim.startTask('ordine-materiali', ['v2'], T0);
    sim.startTask('raccolta-fondi', ['v7'], T0);
    sim.tick(at(1));
    expect(sim.state.sessionUsedH).toBeCloseTo(1);
  });

  it('senza compiti in corso il tempo di sessione non scorre', () => {
    const sim = newGame();
    sim.tick(at(30));
    expect(sim.state.sessionUsedH).toBe(0);
    expect(sim.state.phase).toBe('burocratica');
  });

  it('un compito non può superare le ore residue della sessione', () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2));
    sim.closeSession(at(2)); // weekend: 8 ore di sessione
    const p = sim.previewTask('prep:bonifica:1', ['v4']); // 12 ore da sola
    expect(p.errors.join(' ')).toMatch(/alla sessione restano 8 h/);
  });

  it('chiudere in anticipo la parte burocratica fa avanzare le attese', () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2)); // richiesta finita, attesa 3 giorni = 12 ore di sessione
    expect(sim.pratica('assicurazione').status).toBe('in-attesa');
    sim.closeSession(at(2)); // restano ~18 ore di sessione: l'attesa si chiude
    expect(sim.pratica('assicurazione').status).toBe('approvata');
    expect(sim.state.phase).toBe('operativa');
  });

  it('le attese avanzano solo con il tempo di sessione infrasettimanale', () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2));
    const left = sim.pratica('assicurazione').waitRemainingH;
    sim.tick(at(40)); // nessun compito in corso: niente avanza
    expect(sim.pratica('assicurazione').waitRemainingH).toBeCloseTo(left);
  });

  it('il weekend sbloccato dalla pratica: panchina con falegname + 2 base in circa 2 ore', () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2));
    sim.closeSession(at(2));
    const panchina = sim.state.plan.find((t) => t.id.startsWith('el:panchina'))!;
    sim.state.completedTasks.push(...sim.missingPrerequisites(panchina).map((t) => t.id));
    const t = sim.startTask(panchina.id, ['v3', 'v5', 'v6'], at(3));
    expect(t.hours).toBeCloseTo(1.96, 2);
    expect(t.quality).toBe('alta');
  });

  it('a fine weekend si passa alla settimana dopo e le ore dei volontari ripartono', () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2));
    sim.closeSession(at(2));
    sim.startTask('prep:bonifica:1', ['v5', 'v6', 'v1', 'v7'], at(3)); // 12 / 4 = 3 h
    sim.tick(at(7));
    expect(sim.volunteer('v5').hoursUsed).toBeCloseTo(3);
    sim.closeSession(at(7));
    expect(sim.state.week).toBe(2);
    expect(sim.state.phase).toBe('burocratica');
    expect(sim.volunteer('v5').hoursUsed).toBe(0);
  });

  it('il monte ore settimanale del volontario limita i compiti', () => {
    const sim = newGame();
    const p = sim.previewTask('raccolta-fondi', ['v5']); // 8 ore, Turi ne ha 6
    expect(p.errors.join(' ')).toMatch(/Turi ha solo 6 h/);
  });

  it('la sessione si chiude da sola a 20 ore', () => {
    // 4 compiti in fila da 5 ore: Graziella (14 h) e Sara (14 h) si alternano
    const sim2 = Simulation.newGame(
      { ...defaultContent, tasks: [1, 2, 3, 4].map((i) => ({ id: `t${i}`, name: `T${i}`, phase: 'burocratica' as const, hours: 5, skill: null, maxVolunteers: 1, requires: [] })) },
      T0,
    );
    const who = ['v2', 'v7', 'v1', 'v3'];
    for (let i = 0; i < 4; i++) sim2.startTask(`t${i + 1}`, [who[i]], at(i * 5));
    sim2.tick(at(20));
    expect(sim2.state.phase).toBe('operativa');
  });
});

describe('piano di cantiere nella partita', () => {
  const weekend = () => {
    const sim = newGame();
    sim.startRequest('assicurazione', ['v2'], T0);
    sim.tick(at(2));
    sim.closeSession(at(2));
    return sim;
  };

  it('i lavori del weekend nascono dal progetto del terreno di prova', () => {
    const sim = newGame();
    expect(sim.state.version).toBe(2);
    expect(sim.state.plan.length).toBeGreaterThan(0);
    expect(sim.state.plan.every((t) => t.phase === 'operativa')).toBe(true);
  });

  it('si vedono solo i compiti con i prerequisiti completati', () => {
    const sim = weekend();
    const ids = sim.availableTasks().map((t) => t.id);
    expect(ids).toContain('prep:bonifica:1');
    expect(ids.some((id) => id.startsWith('el:'))).toBe(false);
    const sentiero = sim.state.plan.find((t) => t.id === 'el:sentiero:1')!;
    expect(sim.previewTask(sentiero.id, ['v5']).errors.join(' ')).toMatch(/Prima serve: Livellamento/);
  });

  it('una lavorazione finita cambia il terreno e sblocca i compiti successivi', () => {
    const sim = weekend();
    const bonifica = sim.state.plan.find((t) => t.id === 'prep:bonifica:1')!;
    sim.startTask(bonifica.id, ['v5', 'v6', 'v1', 'v7'], at(3));
    sim.tick(at(6));
    expect(bonifica.tiles.every((i) => sim.state.grid.surface[i] === 'terra')).toBe(true);
    // la vangatura dell'aiuola aspettava bonifica e sfalcio: lo sfalcio non serve sotto l'aiuola
    expect(sim.availableTasks().map((t) => t.id)).toContain('prep:vangatura:1');
  });

  it('un elemento finito entra nel livello realizzato e fa salire la percentuale', () => {
    const sim = weekend();
    const cestino = sim.state.plan.find((t) => t.id.startsWith('el:cestino'))!;
    sim.state.completedTasks.push(...sim.missingPrerequisites(cestino).map((t) => t.id));
    sim.startTask(cestino.id, ['v5'], at(3));
    sim.tick(at(5));
    expect(sim.state.grid.built).toEqual(cestino.placements);
    expect(sim.projectProgress).toBeCloseTo(1 / sim.state.grid.placements.length);
  });

  it('le pratiche legate a elementi assenti dal progetto non nascono', () => {
    const content = {
      ...defaultContent,
      pratiche: [
        ...defaultContent.pratiche,
        { id: 'videosorveglianza', name: 'Videosorveglianza', office: 'Comune', requestHours: 1, requestSkill: null, waitDays: 5, unlocks: 'Telecamere' },
      ],
      elements: [
        ...defaultContent.elements,
        { ...defaultContent.elements[4], id: 'telecamera', name: 'Telecamera', adjacentTo: null, pratiche: ['videosorveglianza'] },
      ],
    };
    const ids = Simulation.newGame(content, T0).state.pratiche.map((p) => p.id);
    expect(ids).toContain('assicurazione');
    expect(ids).toContain('occupazione-suolo'); // non dipende dal progetto
    expect(ids).not.toContain('videosorveglianza');
  });
});
