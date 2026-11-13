import { describe, expect, it } from 'vitest';
import { buildingAt, findPath, sede, spotsAround, validateCity, walkable } from '../src/core/city';
import { defaultContent, validateContent } from '../src/core/content';
import type { CityDef } from '../src/core/types';
import { activityBuilding, listActivities } from '../src/ui/activities';
import { startedGame } from './helpers';

const city = defaultContent.city;

describe('la città', () => {
  it('la mappa dei contenuti è valida', () => {
    expect(validateCity(city, defaultContent.pratiche)).toEqual([]);
    expect(validateContent(defaultContent)).toEqual([]);
  });

  it('non si cammina in mare né dentro gli edifici', () => {
    expect(walkable(city, 0, 0)).toBe(false); // mare
    const s = sede(city);
    expect(walkable(city, s.x, s.y)).toBe(false);
    expect(walkable(city, s.door!.x, s.door!.y)).toBe(true);
    expect(buildingAt(city, s.x + 1, s.y + 1)?.id).toBe('sede');
  });

  it('il percorso va a passi di una tile, solo su tile camminabili', () => {
    const from = sede(city).door!;
    const to = city.buildings.find((b) => b.id === 'igiene')!.door!;
    const path = findPath(city, from, to);
    expect(path[0]).toEqual(from);
    expect(path.at(-1)).toEqual(to);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)).toBe(1);
      expect(walkable(city, path[i].x, path[i].y)).toBe(true);
    }
  });

  it('senza strada non c\'è percorso', () => {
    const isola: CityDef = { rows: ['..~..'], buildings: [] };
    expect(findPath(isola, { x: 0, y: 0 }, { x: 4, y: 0 })).toEqual([]);
  });

  it('i posti davanti a un ingresso sono tile camminabili diverse, la prima è l\'ingresso', () => {
    const door = sede(city).door!;
    const spots = spotsAround(city, door, 6);
    expect(spots[0]).toEqual(door);
    expect(new Set(spots.map((t) => `${t.x},${t.y}`)).size).toBe(6);
    for (const t of spots) expect(walkable(city, t.x, t.y)).toBe(true);
  });

  it('segnala ufficio mancante, ingresso nel vuoto e sovrapposizioni', () => {
    const bad: CityDef = {
      rows: ['....', '....', '~~~~'],
      buildings: [
        { id: 'sede', name: 'S', kind: 'sede', look: 'sede', x: 0, y: 0, w: 2, h: 1, door: { x: 0, y: 2 } },
        { id: 'f', name: 'F', kind: 'fornitore', look: 'fornitore', x: 1, y: 0, w: 2, h: 1, door: { x: 3, y: 1 } },
      ],
    };
    const errors = validateCity(bad, defaultContent.pratiche).join('\n');
    expect(errors).toMatch(/ingresso di sede non è camminabile/);
    expect(errors).toMatch(/sede si sovrappone a f/);
    expect(errors).toMatch(/nessun edificio per l'ufficio "Assicurazione"/);
  });
});

describe('le attività in città', () => {
  it('pratiche nel loro ufficio, ordini dal fornitore, raccolta fondi alla sede', () => {
    const sim = startedGame();
    const acts = listActivities(sim);
    const where = (kind: string, id?: string) => {
      const a = acts.find((x) => x.kind === kind && (!id || x.id === id))!;
      return activityBuilding(sim, a);
    };
    expect(where('richiesta', 'assicurazione')).toBe('assicurazione');
    expect(where('sidequest', 'smaltimento')).toBe('igiene');
    expect(where('ordine')).toBe('fornitore');
    expect(where('lavoro', 'raccolta-fondi')).toBe('sede');
  });

  it('i lavori del parco non hanno un edificio', () => {
    const sim = startedGame();
    const lavoro = sim.state.plan[0];
    expect(activityBuilding(sim, { kind: 'lavoro', id: lavoro.id })).toBeNull();
  });
});

describe('quale scena', () => {
  it('città nella parte burocratica, parco nel weekend e nelle fasi preparatorie', async () => {
    const { sceneFor } = await import('../src/ui/activities');
    const { surveyGame, T0 } = await import('./helpers');
    expect(sceneFor(surveyGame())).toBe('park');
    const sim = startedGame();
    expect(sceneFor(sim)).toBe('city');
    sim.closeSession(T0);
    expect(sceneFor(sim)).toBe('park');
  });
});
